// Weekly news fetcher: per-company, branches between GNews API and Google Alerts RSS.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GNEWS_KEY = Deno.env.get("GNEWS_API_KEY");

function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return (u.host.toLowerCase() + u.pathname).replace(/\/$/, "");
  } catch {
    return raw.toLowerCase().split("?")[0];
  }
}

function parseRssItems(xml: string): Array<{ title: string; url: string }> {
  const items: Array<{ title: string; url: string }> = [];
  // Match both RSS <item> and Atom <entry>
  const itemRe = /<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi;
  const matches = xml.match(itemRe) ?? [];
  for (const block of matches) {
    const titleM = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    let title = titleM?.[1]?.trim() ?? "";
    title = title.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "").trim();
    // Atom uses <link href="...">; RSS uses <link>...</link>
    let url = "";
    const atomLink = block.match(/<link[^>]*href="([^"]+)"/i);
    if (atomLink) url = atomLink[1];
    else {
      const rssLink = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
      if (rssLink) url = rssLink[1].trim();
    }
    // Google Alerts wraps real URL in google.com redirect; extract `url=` param
    if (url.includes("google.com/url")) {
      try {
        const u = new URL(url);
        const real = u.searchParams.get("url") || u.searchParams.get("q");
        if (real) url = real;
      } catch { /* */ }
    }
    if (title && url) items.push({ title, url });
  }
  return items;
}

async function pollOne(admin: any, company: any): Promise<{ added: number; status: string }> {
  let items: Array<{ title: string; url: string }> = [];
  let sourceLabel = "gnews";
  try {
    if (company.news_feed_url) {
      sourceLabel = "google_alerts";
      const r = await fetch(company.news_feed_url);
      if (!r.ok) return { added: 0, status: `rss_http_${r.status}` };
      const xml = await r.text();
      items = parseRssItems(xml).slice(0, 25);
    } else {
      if (!GNEWS_KEY) return { added: 0, status: "no_gnews_key" };
      const from = company.last_polled_at ?? new Date(Date.now() - 8 * 86400 * 1000).toISOString();
      const q = encodeURIComponent(`"${company.name}"`);
      const url = `https://gnews.io/api/v4/search?q=${q}&from=${encodeURIComponent(from)}&lang=en&max=10&apikey=${GNEWS_KEY}`;
      const r = await fetch(url);
      if (!r.ok) return { added: 0, status: `gnews_http_${r.status}` };
      const j = await r.json();
      items = (j.articles ?? []).map((a: any) => ({ title: a.title, url: a.url }));
    }
  } catch (e) {
    return { added: 0, status: `fetch_err:${String(e).slice(0, 80)}` };
  }

  let added = 0;
  for (const it of items) {
    if (!it.url) continue;
    const norm = normalizeUrl(it.url);
    const { error } = await admin.from("company_events").insert({
      user_id: company.user_id,
      company_id: company.id,
      event_type: "news_mention",
      title: it.title.slice(0, 500),
      url: it.url,
      url_normalized: norm,
      source_label: sourceLabel,
    });
    if (!error) added++;
    // 23505 (unique violation) => already seen, skip silently
  }

  await admin.from("companies").update({ last_polled_at: new Date().toISOString() }).eq("id", company.id);
  return { added, status: "ok" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    let q = admin.from("companies").select("id, user_id, name, news_feed_url, last_polled_at");
    if (body?.company_id) q = q.eq("id", body.company_id);
    const { data: companies, error } = await q;
    if (error) throw error;

    const results: any[] = [];
    for (const c of companies ?? []) {
      const r = await pollOne(admin, c);
      results.push({ company_id: c.id, ...r });
    }
    return new Response(JSON.stringify({ processed: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
