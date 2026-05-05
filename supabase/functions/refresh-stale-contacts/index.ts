// Weekly worker: re-enrich contacts whose last successful enrichment is >90 days old.
// Rate-limited to MAX_PER_RUN per invocation. Diffing happens inside enrich-contact.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_PER_RUN = 50;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const cutoff = new Date(Date.now() - 90 * 86400 * 1000).toISOString();

    // Find candidates: contacts with no recent successful enrichment job.
    // Strategy: pull recent successful jobs, then pick contacts not in that set.
    const { data: recentJobs } = await admin
      .from("enrichment_jobs")
      .select("contact_id")
      .eq("provider", "pdl")
      .eq("status", "success")
      .gte("created_at", cutoff);
    const recentSet = new Set((recentJobs ?? []).map((r: any) => r.contact_id));

    // Get a batch of contacts; filter client-side. user_id needed for impersonation.
    const { data: contacts } = await admin
      .from("contacts")
      .select("id, user_id, updated_at")
      .order("updated_at", { ascending: true })
      .limit(MAX_PER_RUN * 4);

    const stale = (contacts ?? []).filter((c: any) => !recentSet.has(c.id)).slice(0, MAX_PER_RUN);

    let invoked = 0;
    let failed = 0;
    for (const c of stale) {
      try {
        // Call enrich-contact directly via fetch with service role auth
        const res = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/enrich-contact`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              "x-impersonate-user": c.user_id,
            },
            body: JSON.stringify({ contact_id: c.id, _system_user_id: c.user_id }),
          },
        );
        if (res.ok) invoked++;
        else failed++;
      } catch (_) {
        failed++;
      }
      // small delay to avoid bursting external APIs
      await new Promise((r) => setTimeout(r, 200));
    }

    return new Response(JSON.stringify({ candidates: stale.length, invoked, failed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
