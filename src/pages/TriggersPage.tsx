import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link, useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { initials, relTime } from "@/lib/format";
import { EmptyState } from "@/components/EmptyState";
import { Bell, X, Send } from "lucide-react";
import { toast } from "sonner";

export default function TriggersPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: events, isLoading } = useQuery({
    queryKey: ["contact-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_events")
        .select("id, contact_id, event_type, before_value, after_value, detected_at")
        .is("dismissed_at", null)
        .order("detected_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const ids = Array.from(new Set((data ?? []).map((e: any) => e.contact_id)));
      if (ids.length === 0) return [];
      const { data: contacts } = await supabase
        .from("contacts_resolved")
        .select("id, full_name, photo_url")
        .in("id", ids);
      const byId = new Map((contacts ?? []).map((c: any) => [c.id, c]));
      return (data ?? []).map((e: any) => ({ ...e, contact: byId.get(e.contact_id) }));
    },
  });

  const dismiss = async (id: string) => {
    const { error } = await supabase
      .from("contact_events")
      .update({ dismissed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["contact-events"] });
    qc.invalidateQueries({ queryKey: ["contact-events-count"] });
  };

  const reachOut = async (e: any) => {
    await supabase
      .from("contact_events")
      .update({ acted_on_at: new Date().toISOString() })
      .eq("id", e.id);
    qc.invalidateQueries({ queryKey: ["contact-events-count"] });
    navigate(`/contact/${e.contact_id}`);
  };

  const describe = (e: any) => {
    if (e.event_type === "job_change") return `moved from ${e.before_value} to ${e.after_value}`;
    if (e.event_type === "company_change") return `now at ${e.after_value} (was ${e.before_value})`;
    if (e.event_type === "title_change") return `now ${e.after_value} (was ${e.before_value})`;
    return `${e.event_type}: ${e.after_value}`;
  };

  return (
    <div className="mx-auto w-full max-w-md">
      <header
        className="sticky top-0 z-30 border-b border-border bg-background/85 px-4 py-3 backdrop-blur-md"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.5rem)" }}
      >
        <h1 className="text-xl font-semibold tracking-tight">Triggers</h1>
        <p className="text-xs text-muted-foreground">Reasons to reach out</p>
      </header>

      {isLoading ? (
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      ) : !events || events.length === 0 ? (
        <EmptyState icon={<Bell className="h-7 w-7" />} title="No triggers right now" body="When a contact changes jobs or companies, you'll see it here." />
      ) : (
        <div className="divide-y divide-border bg-card hairline border-y">
          {events.map((e: any) => (
            <div key={e.id} className="flex gap-3 px-4 py-3">
              <Link to={`/contact/${e.contact_id}`} className="shrink-0">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={e.contact?.photo_url ?? undefined} />
                  <AvatarFallback className="bg-secondary text-xs">
                    {initials(e.contact?.full_name ?? "?")}
                  </AvatarFallback>
                </Avatar>
              </Link>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-medium">{e.contact?.full_name ?? "Unknown"}</p>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{relTime(e.detected_at)}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{describe(e)}</p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => dismiss(e.id)}>
                    <X className="mr-1 h-3 w-3" /> Dismiss
                  </Button>
                  <Button size="sm" className="h-7 bg-gradient-kismet text-primary-foreground hover:opacity-90 text-xs" onClick={() => reachOut(e)}>
                    <Send className="mr-1 h-3 w-3" /> Reach out
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
