import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { ContactRow } from "@/components/ContactRow";
import { EmptyState, SectionHeader, RowSkeleton } from "@/components/EmptyState";
import { Search, Users, Sparkles, Calendar, Mail, ChevronRight } from "lucide-react";
import { KismetMark } from "@/components/KismetMark";

const CAL_SYNC_KEY = "kismet:lastCalSync";

export default function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  const { data: recents, isLoading } = useQuery({
    queryKey: ["contacts", "recent", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts_resolved")
        .select("id, full_name, company, title, photo_url, last_contact_at, cadence")
        .order("last_contact_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: overdue } = useQuery({
    queryKey: ["contacts", "overdue", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts_resolved")
        .select("id, full_name, company, title, photo_url, last_contact_at, cadence")
        .neq("cadence", "none")
        .order("last_contact_at", { ascending: true, nullsFirst: true })
        .limit(50);
      if (error) throw error;
      // Filter to ones actually overdue, client-side (small list)
      return (data ?? []).filter((c) => {
        if (!c.last_contact_at) return true;
        const days =
          c.cadence === "close" ? 14 :
          c.cadence === "monthly" ? 30 :
          c.cadence === "quarterly" ? 90 :
          c.cadence === "annual" ? 365 : null;
        if (!days) return false;
        return Date.now() - new Date(c.last_contact_at).getTime() > days * 86_400_000;
      }).slice(0, 5);
    },
    enabled: !!user,
  });

  // Pending calendar imports count
  const { data: pendingCount, refetch: refetchPending } = useQuery({
    queryKey: ["calendar_imports", "pending_count", user?.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("calendar_imports")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user,
  });

  // Background calendar sync on app open if stale (>1h)
  useEffect(() => {
    if (!user) return;
    const last = Number(localStorage.getItem(CAL_SYNC_KEY) ?? "0");
    if (Date.now() - last < 60 * 60 * 1000) return;
    localStorage.setItem(CAL_SYNC_KEY, String(Date.now()));
    supabase.functions
      .invoke("sync-calendar")
      .then(() => refetchPending())
      .catch(() => {
        // Silent: connector may not be linked yet; user will see it on the review page
      });
  }, [user, refetchPending]);

  // Submit takes us to Search prefilled
  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    navigate(`/search?q=${encodeURIComponent(q.trim())}`);
  }

  return (
    <div className="mx-auto w-full max-w-md">
      {/* Header / search */}
      <header
        className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="px-4 pb-3 pt-3">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KismetMark size={22} />
              <h1 className="text-lg font-semibold tracking-tight text-gradient-kismet">Kismet</h1>
            </div>
            <span className="text-[11px] text-muted-foreground">
              {recents?.length ?? 0} contacts
            </span>
          </div>
          <form onSubmit={onSearchSubmit} className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search people, notes, transcripts…"
              className="h-11 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              onFocus={() => navigate(`/search${q ? `?q=${encodeURIComponent(q)}` : ""}`)}
              readOnly
            />
          </form>
        </div>
      </header>

      {/* Inbox: import sources */}
      <section>
        <SectionHeader>Inbox</SectionHeader>
        <div className="bg-card hairline border-y divide-y divide-border">
          <Link
            to="/import/calendar"
            className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Calendar className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Calendar review</p>
              <p className="text-xs text-muted-foreground">
                {pendingCount === undefined
                  ? "Checking…"
                  : pendingCount === 0
                  ? "All caught up"
                  : `${pendingCount} event${pendingCount === 1 ? "" : "s"} waiting`}
              </p>
            </div>
            {pendingCount && pendingCount > 0 ? (
              <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">
                {pendingCount}
              </span>
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </Link>
          <Link
            to="/import/gmail"
            className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Mail className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Import from Gmail</p>
              <p className="text-xs text-muted-foreground">Push a sender to your CRM</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        </div>
      </section>

      {/* Needs attention */}
      {overdue && overdue.length > 0 && (
        <section>
          <SectionHeader>Needs attention</SectionHeader>
          <div className="bg-card hairline border-y">
            {overdue.map((c) => (
              <ContactRow key={c.id} contact={c} showOverdue />
            ))}
          </div>
        </section>
      )}

      {/* Recently active */}
      <section>
        <SectionHeader>Recently active</SectionHeader>
        <div className="bg-card hairline border-y">
          {isLoading ? (
            <>
              <RowSkeleton />
              <RowSkeleton />
              <RowSkeleton />
            </>
          ) : recents && recents.length > 0 ? (
            recents.map((c) => <ContactRow key={c.id} contact={c} />)
          ) : (
            <EmptyState
              icon={<Users className="h-8 w-8" />}
              title="No contacts yet"
              body="Tap the + button to scan a card, record a note, or add someone manually."
              action={
                <Link
                  to="/contact/new"
                  className="inline-flex items-center gap-1.5 rounded-md bg-gradient-kismet px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Add your first contact
                </Link>
              }
            />
          )}
        </div>
      </section>

      <div className="h-8" />
    </div>
  );
}
