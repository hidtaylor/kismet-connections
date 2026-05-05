import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link, useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { initials, relTime } from "@/lib/format";
import { EmptyState } from "@/components/EmptyState";
import { Bell, X, Send, Building2, ExternalLink, Newspaper } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Filter = "all" | "people" | "companies";

export default function TriggersPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");

  const { data: items, isLoading } = useQuery({
    queryKey: ["triggers-mixed"],
    queryFn: async () => {
      const [contactRes, companyRes] = await Promise.all([
        supabase.from("contact_events")
          .select("id, contact_id, event_type, before_value, after_value, detected_at")
          .is("dismissed_at", null).order("detected_at", { ascending: false }).limit(100),
        supabase.from("company_events")
          .select("id, company_id, event_type, title, url, source_label, before_value, after_value, detected_at")
          .is("dismissed_at", null).order("detected_at", { ascending: false }).limit(100),
      ]);
      if (contactRes.error) throw contactRes.error;
      if (companyRes.error) throw companyRes.error;

      const contactIds = Array.from(new Set((contactRes.data ?? []).map((e: any) => e.contact_id)));
      const companyIds = Array.from(new Set((companyRes.data ?? []).map((e: any) => e.company_id)));

      const [contactsData, companiesData] = await Promise.all([
        contactIds.length
          ? supabase.from("contacts_resolved").select("id, full_name, photo_url").in("id", contactIds)
          : Promise.resolve({ data: [] as any[] }),
        companyIds.length
          ? supabase.from("companies").select("id, name, domain").in("id", companyIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const contactById = new Map((contactsData.data ?? []).map((c: any) => [c.id, c]));
      const companyById = new Map((companiesData.data ?? []).map((c: any) => [c.id, c]));

      const merged = [
        ...(contactRes.data ?? []).map((e: any) => ({ kind: "contact" as const, ...e, contact: contactById.get(e.contact_id) })),
        ...(companyRes.data ?? []).map((e: any) => ({ kind: "company" as const, ...e, company: companyById.get(e.company_id) })),
      ];
      merged.sort((a, b) => new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime());
      return merged;
    },
  });

  const filtered = (items ?? []).filter((i) =>
    filter === "all" ? true : filter === "people" ? i.kind === "contact" : i.kind === "company");

  const dismiss = async (item: any) => {
    const table = item.kind === "contact" ? "contact_events" : "company_events";
    const { error } = await supabase.from(table).update({ dismissed_at: new Date().toISOString() }).eq("id", item.id);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["triggers-mixed"] });
    qc.invalidateQueries({ queryKey: ["triggers-count"] });
  };

  const reachOut = async (item: any) => {
    const table = item.kind === "contact" ? "contact_events" : "company_events";
    await supabase.from(table).update({ acted_on_at: new Date().toISOString() }).eq("id", item.id);
    qc.invalidateQueries({ queryKey: ["triggers-count"] });
    if (item.kind === "contact") navigate(`/contact/${item.contact_id}`);
  };

  const describeContact = (e: any) => {
    if (e.event_type === "job_change") return `moved from ${e.before_value} to ${e.after_value}`;
    if (e.event_type === "company_change") return `now at ${e.after_value} (was ${e.before_value})`;
    if (e.event_type === "title_change") return `now ${e.after_value} (was ${e.before_value})`;
    return `${e.event_type}: ${e.after_value}`;
  };

  const sourceHost = (url?: string | null) => {
    if (!url) return "";
    try { return new URL(url).host.replace(/^www\./, ""); } catch { return ""; }
  };

  return (
    <div className="mx-auto w-full max-w-md">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 px-4 py-3 backdrop-blur-md"
              style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.5rem)" }}>
        <h1 className="text-xl font-semibold tracking-tight">Triggers</h1>
        <p className="text-xs text-muted-foreground">Reasons to reach out</p>
        <div className="mt-3 flex gap-1.5">
          {(["all", "people", "companies"] as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs capitalize transition-colors",
                      filter === f
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:text-foreground"
                    )}>
              {f}
            </button>
          ))}
        </div>
      </header>

      {isLoading ? (
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Bell className="h-7 w-7" />} title="No triggers right now"
                    body="When a contact changes jobs or a company makes news, you'll see it here." />
      ) : (
        <div className="divide-y divide-border bg-card hairline border-y">
          {filtered.map((e: any) => e.kind === "contact" ? (
            <div key={`c-${e.id}`} className="flex gap-3 px-4 py-3">
              <Link to={`/contact/${e.contact_id}`} className="shrink-0">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={e.contact?.photo_url ?? undefined} />
                  <AvatarFallback className="bg-secondary text-xs">{initials(e.contact?.full_name ?? "?")}</AvatarFallback>
                </Avatar>
              </Link>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-medium">{e.contact?.full_name ?? "Unknown"}</p>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{relTime(e.detected_at)}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{describeContact(e)}</p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => dismiss(e)}>
                    <X className="mr-1 h-3 w-3" /> Dismiss
                  </Button>
                  <Button size="sm" className="h-7 bg-gradient-kismet text-primary-foreground hover:opacity-90 text-xs" onClick={() => reachOut(e)}>
                    <Send className="mr-1 h-3 w-3" /> Reach out
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div key={`co-${e.id}`} className="flex gap-3 px-4 py-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary">
                {e.event_type === "news_mention" ? <Newspaper className="h-5 w-5 text-primary" /> : <Building2 className="h-5 w-5 text-primary" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-medium">{e.company?.name ?? "Company"}</p>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{relTime(e.detected_at)}</span>
                </div>
                {e.event_type === "news_mention" ? (
                  <a href={e.url ?? "#"} target="_blank" rel="noreferrer"
                     className="mt-0.5 flex items-start gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                    <span className="line-clamp-2 flex-1">{e.title}</span>
                    <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
                  </a>
                ) : (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {e.event_type.replace(/_/g, " ")}: {e.before_value} → {e.after_value}
                  </p>
                )}
                {e.event_type === "news_mention" && (
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{sourceHost(e.url)} · {e.source_label}</p>
                )}
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => dismiss(e)}>
                    <X className="mr-1 h-3 w-3" /> Dismiss
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
