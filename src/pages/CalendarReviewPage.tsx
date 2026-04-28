import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { EmptyState, SectionHeader } from "@/components/EmptyState";
import { Calendar, Check, X, RefreshCw, MapPin, Users, Clock } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";

interface CalImport {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  organizer_email: string | null;
  attendees: Array<{ email?: string; name?: string | null; organizer?: boolean }> | null;
  hangout_link: string | null;
  status: "pending" | "approved" | "rejected";
}

const SYNC_KEY = "kismet:lastCalSync";

export default function CalendarReviewPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const { data: items, isLoading } = useQuery({
    queryKey: ["calendar_imports", "pending", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calendar_imports")
        .select(
          "id, title, description, location, starts_at, ends_at, organizer_email, attendees, hangout_link, status",
        )
        .eq("status", "pending")
        .order("starts_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data as unknown as CalImport[]) ?? [];
    },
    enabled: !!user,
  });

  const sync = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("sync-calendar");
      if (error) throw error;
      return data as { staged: number; eligible: number; backfill: boolean };
    },
    onSuccess: (r) => {
      localStorage.setItem(SYNC_KEY, String(Date.now()));
      qc.invalidateQueries({ queryKey: ["calendar_imports"] });
      toast.success(
        r.backfill
          ? `Backfill complete · ${r.staged} new events`
          : `${r.staged} new event${r.staged === 1 ? "" : "s"}`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Auto-sync on first mount if stale (>1h) — also covered by HomePage hook
  useEffect(() => {
    const last = Number(localStorage.getItem(SYNC_KEY) ?? "0");
    if (Date.now() - last > 60 * 60 * 1000 && !sync.isPending) {
      sync.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function decide(id: string, decision: "approve" | "reject") {
    setBusy(id);
    try {
      const { data, error } = await supabase.functions.invoke(
        "approve-calendar-import",
        { body: { import_id: id, decision } },
      );
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["calendar_imports"] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      if (decision === "approve" && (data as { interaction_id?: string })?.interaction_id) {
        toast.success("Saved as interaction");
      } else {
        toast.success("Rejected");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <header
        className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => navigate(-1)}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back
          </button>
          <h1 className="text-base font-semibold tracking-tight">Calendar review</h1>
          <button
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-primary hover:bg-primary/10 disabled:opacity-50"
            aria-label="Sync"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${sync.isPending ? "animate-spin" : ""}`} />
            Sync
          </button>
        </div>
      </header>

      <SectionHeader>
        Pending events {items ? `· ${items.length}` : ""}
      </SectionHeader>

      {isLoading ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : !items || items.length === 0 ? (
        <EmptyState
          icon={<Calendar className="h-8 w-8" />}
          title="Nothing to review"
          body="Tap Sync to pull recent calendar events."
        />
      ) : (
        <ul className="bg-card hairline border-y divide-y divide-border">
          {items.map((it) => (
            <li key={it.id} className="px-4 py-3">
              <div className="mb-1 flex items-start justify-between gap-2">
                <h3 className="text-sm font-medium leading-snug">{it.title}</h3>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {format(new Date(it.starts_at), "MMM d")}
                </span>
              </div>
              <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {format(new Date(it.starts_at), "p")}
                  {it.ends_at && ` – ${format(new Date(it.ends_at), "p")}`}
                </span>
                {it.location && (
                  <span className="inline-flex items-center gap-1 truncate max-w-[180px]">
                    <MapPin className="h-3 w-3" />
                    <span className="truncate">{it.location}</span>
                  </span>
                )}
              </div>
              {it.attendees && it.attendees.length > 0 && (
                <div className="mb-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
                  <Users className="mt-0.5 h-3 w-3 shrink-0" />
                  <span className="line-clamp-2">
                    {it.attendees
                      .map((a) => a.name?.trim() || a.email || "")
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                </div>
              )}
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => decide(it.id, "approve")}
                  disabled={busy === it.id}
                  className="h-8 flex-1"
                >
                  <Check className="mr-1 h-3.5 w-3.5" /> Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => decide(it.id, "reject")}
                  disabled={busy === it.id}
                  className="h-8"
                >
                  <X className="mr-1 h-3.5 w-3.5" /> Skip
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="h-8" />
    </div>
  );
}
