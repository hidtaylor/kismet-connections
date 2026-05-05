// Weekly worker: re-enrich companies older than 90 days; diff employee_count + funding_stage.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const cutoff = new Date(Date.now() - 90 * 86400 * 1000).toISOString();

    // Companies whose latest successful PDL job is older than cutoff (or none)
    const { data: companies } = await admin.from("companies").select("id, user_id, name");
    const out: any[] = [];
    for (const co of companies ?? []) {
      const { data: latest } = await admin.from("enrichment_jobs")
        .select("created_at").eq("company_id", co.id).eq("provider", "pdl").eq("status", "success")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (latest && latest.created_at >= cutoff) continue;

      // Snapshot current
      const { data: before } = await admin.from("companies_resolved")
        .select("employee_count, funding_stage").eq("id", co.id).maybeSingle();

      // Re-enrich via system call
      const r = await fetch(`${SUPABASE_URL}/functions/v1/enrich-company`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SRK}`, "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: co.id, _system_user_id: co.user_id }),
      });
      const j = await r.json().catch(() => ({}));

      const { data: after } = await admin.from("companies_resolved")
        .select("employee_count, funding_stage").eq("id", co.id).maybeSingle();
      const events: any[] = [];
      if (before?.employee_count && after?.employee_count && before.employee_count !== after.employee_count) {
        events.push({ user_id: co.user_id, company_id: co.id, event_type: "employee_count_change",
          before_value: before.employee_count, after_value: after.employee_count, source_label: "pdl_diff" });
      }
      if (before?.funding_stage && after?.funding_stage && before.funding_stage !== after.funding_stage) {
        events.push({ user_id: co.user_id, company_id: co.id, event_type: "funding_round",
          before_value: before.funding_stage, after_value: after.funding_stage, source_label: "pdl_diff" });
      }
      if (events.length) await admin.from("company_events").insert(events);
      out.push({ company_id: co.id, status: j?.status ?? "error", new_events: events.length });
    }
    return new Response(JSON.stringify({ processed: out.length, results: out }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
