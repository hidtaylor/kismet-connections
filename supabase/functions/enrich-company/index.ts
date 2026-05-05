// Enrich a company via People Data Labs Company Enrichment API.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PDL_KEY = Deno.env.get("PEOPLE_DATA_LABS_API_KEY");

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json().catch(() => ({}));
    const companyId = body?.company_id;
    if (!companyId || typeof companyId !== "string") {
      return new Response(JSON.stringify({ error: "company_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const token = authHeader.replace("Bearer ", "");
    const isSystem = token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") && typeof body?._system_user_id === "string";
    let userId: string;
    if (isSystem) {
      userId = body._system_user_id;
    } else {
      const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } });
      const { data: userData, error: cErr } = await sb.auth.getUser();
      if (cErr || !userData?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      userId = userData.user.id;
    }

    const { data: company, error: coErr } = await admin
      .from("companies").select("id, user_id, name, domain")
      .eq("id", companyId).single();
    if (coErr || !company || company.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Company not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 90-day cache
    const since = new Date(Date.now() - 90 * 86400 * 1000).toISOString();
    const { data: cached } = await admin
      .from("enrichment_jobs").select("id")
      .eq("company_id", companyId).eq("provider", "pdl").eq("status", "success")
      .gte("created_at", since).limit(1);
    if (cached && cached.length > 0) {
      return new Response(JSON.stringify({ status: "cached", job_id: cached[0].id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!PDL_KEY || (!company.domain && !company.name)) {
      return new Response(JSON.stringify({ status: "skipped" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const matchKey = company.domain ? `dom:${company.domain}` : `name:${company.name.toLowerCase()}`;
    const day = new Date().toISOString().slice(0, 10);
    const requestHash = await sha256(`pdl-co|${matchKey}|${day}`);
    const { data: dup } = await admin.from("enrichment_jobs").select("id").eq("request_hash", requestHash).limit(1);
    if (dup && dup.length > 0) {
      return new Response(JSON.stringify({ status: "duplicate", job_id: dup[0].id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const params = new URLSearchParams();
    if (company.domain) params.set("website", company.domain);
    else params.set("name", company.name);
    const url = `https://api.peopledatalabs.com/v5/company/enrich?${params.toString()}`;

    let pdlJson: any = null;
    let pdlStatus = "error";
    let httpStatus = 0;
    try {
      const r = await fetch(url, { headers: { "X-Api-Key": PDL_KEY } });
      httpStatus = r.status;
      pdlJson = await r.json();
      pdlStatus = r.ok && pdlJson?.status === 200 ? "success" : (httpStatus === 404 ? "not_found" : "error");
    } catch (e) {
      pdlJson = { error: String(e) };
    }

    let fieldsAdded = 0;
    const fieldsToActivate = new Set<string>();
    if (pdlStatus === "success" && pdlJson) {
      const c = pdlJson;
      const fundingStage = c.funding_stages?.[0] ?? c.last_funding_stage ?? null;
      const lastFunding = c.last_funding_round?.amount_raised
        ? String(c.last_funding_round.amount_raised)
        : (c.total_funding_raised ? String(c.total_funding_raised) : null);
      const map: Record<string, any> = {
        employee_count: c.employee_count ? String(c.employee_count) : (c.size ?? null),
        industry: c.industry ?? null,
        funding_stage: fundingStage,
        last_funding_amount: lastFunding,
        location: c.location?.name ?? c.location?.locality ?? null,
        description: c.summary ?? c.tagline ?? null,
      };
      const conf = 80;
      for (const [field, value] of Object.entries(map)) {
        if (value == null || value === "") continue;
        const { error } = await admin.from("company_field_sources").upsert({
          company_id: companyId, user_id: userId,
          field_name: field, value: String(value),
          source: "pdl", confidence: conf,
          fetched_at: new Date().toISOString(), is_active: false,
        }, { onConflict: "company_id,field_name,source" });
        if (!error) { fieldsAdded++; fieldsToActivate.add(field); }
      }
      // Update domain if PDL gave us one and we didn't have it
      if (!company.domain && c.website) {
        await admin.from("companies").update({ domain: c.website.toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "") }).eq("id", companyId);
      }
    }

    const { data: job } = await admin.from("enrichment_jobs").insert({
      user_id: userId,
      company_id: companyId,
      provider: "pdl",
      match_key: matchKey,
      request_hash: requestHash,
      status: pdlStatus,
      raw_response: pdlJson,
      cost_cents: pdlStatus === "success" ? 5 : 0,
      completed_at: new Date().toISOString(),
      error_message: pdlStatus === "success" ? null : `http=${httpStatus}`,
    }).select("id").single();

    for (const f of fieldsToActivate) {
      await admin.rpc("recompute_company_field_activation", { p_company_id: companyId, p_field_name: f });
    }

    return new Response(JSON.stringify({ status: pdlStatus, fields_added: fieldsAdded, job_id: job?.id ?? null }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
