import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Building2, ChevronDown, ChevronUp, Newspaper, RefreshCw, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { relTime } from "@/lib/format";
import { toast } from "sonner";

export function CompanyCard({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [editingFeed, setEditingFeed] = useState(false);
  const [feedDraft, setFeedDraft] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [polling, setPolling] = useState(false);

  const { data: company } = useQuery({
    queryKey: ["company", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies_resolved").select("*").eq("id", companyId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: feed } = useQuery({
    queryKey: ["company-feed", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("companies").select("news_feed_url, last_polled_at").eq("id", companyId).maybeSingle();
      return data;
    },
  });

  const { data: latestNews } = useQuery({
    queryKey: ["company-news-latest", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("company_events").select("title, url, detected_at, source_label")
        .eq("company_id", companyId).eq("event_type", "news_mention")
        .order("detected_at", { ascending: false }).limit(1).maybeSingle();
      return data;
    },
  });

  if (!company) return null;

  const handleEnrich = async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke("enrich-company", { body: { company_id: companyId } });
      if (error) throw error;
      if (data?.status === "cached") toast.info("Already enriched recently");
      else if (data?.status === "success") toast.success(`Enriched · ${data.fields_added ?? 0} fields`);
      else toast.info(data?.status ?? "Done");
      qc.invalidateQueries({ queryKey: ["company", companyId] });
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setRefreshing(false); }
  };

  const handlePollNews = async () => {
    setPolling(true);
    try {
      const { error } = await supabase.functions.invoke("fetch-company-news", { body: { company_id: companyId } });
      if (error) throw error;
      toast.success("News refreshed");
      qc.invalidateQueries({ queryKey: ["company-feed", companyId] });
      qc.invalidateQueries({ queryKey: ["company-news-latest", companyId] });
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setPolling(false); }
  };

  const saveFeed = async () => {
    const trimmed = feedDraft.trim();
    if (trimmed && !/^https:\/\/www\.google\.com\/alerts\/feeds\//i.test(trimmed)) {
      toast.error("Must be a https://www.google.com/alerts/feeds/... URL");
      return;
    }
    const { error } = await supabase.from("companies")
      .update({ news_feed_url: trimmed || null }).eq("id", companyId);
    if (error) { toast.error(error.message); return; }
    toast.success(trimmed ? "Custom feed saved" : "Reverted to GNews");
    setEditingFeed(false);
    qc.invalidateQueries({ queryKey: ["company-feed", companyId] });
  };

  const meta = [
    company.industry,
    company.employee_count ? `${company.employee_count} employees` : null,
    company.funding_stage,
    company.location,
  ].filter(Boolean);

  return (
    <section className="px-4 pb-4">
      <div className="rounded-lg bg-card hairline border p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate text-sm font-semibold">{company.name}</p>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={handleEnrich} disabled={refreshing}>
                <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
              </Button>
            </div>
            {company.domain && <p className="text-xs text-muted-foreground">{company.domain}</p>}
            {meta.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{meta.join(" · ")}</p>}
            {company.description && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{company.description}</p>}
          </div>
        </div>

        {latestNews && (
          <a href={latestNews.url ?? "#"} target="_blank" rel="noreferrer"
             className="mt-3 flex items-start gap-2 rounded-md bg-secondary/50 px-3 py-2 text-xs hover:bg-secondary">
            <Newspaper className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2">{latestNews.title}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">{relTime(latestNews.detected_at)} · {latestNews.source_label}</p>
            </div>
            <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
          </a>
        )}

        {/* News monitoring panel */}
        <details className="mt-3 group">
          <summary className="flex cursor-pointer items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
            <span>News monitoring</span>
            <ChevronDown className="h-3 w-3 group-open:hidden" />
            <ChevronUp className="h-3 w-3 hidden group-open:block" />
          </summary>
          <div className="mt-2 space-y-2 text-xs">
            <p className="text-muted-foreground">
              {feed?.news_feed_url
                ? <>Custom Google Alerts feed — last checked {feed.last_polled_at ? relTime(feed.last_polled_at) : "never"}.</>
                : <>Auto-monitored via GNews — last checked {feed?.last_polled_at ? relTime(feed.last_polled_at) : "never"}.</>}
            </p>
            {editingFeed ? (
              <div className="flex gap-2">
                <Input value={feedDraft} onChange={(e) => setFeedDraft(e.target.value)}
                       placeholder="https://www.google.com/alerts/feeds/..." className="h-8 text-xs" />
                <Button size="sm" className="h-8" onClick={saveFeed}>Save</Button>
                <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditingFeed(false)}>Cancel</Button>
              </div>
            ) : (
              <div className="flex gap-3">
                <button className="text-primary hover:underline"
                        onClick={() => { setFeedDraft(feed?.news_feed_url ?? ""); setEditingFeed(true); }}>
                  {feed?.news_feed_url ? "Edit feed" : "Use custom Google Alerts"}
                </button>
                <button className="text-muted-foreground hover:text-foreground" onClick={handlePollNews} disabled={polling}>
                  {polling ? "Checking…" : "Check now"}
                </button>
              </div>
            )}
          </div>
        </details>
      </div>
    </section>
  );
}
