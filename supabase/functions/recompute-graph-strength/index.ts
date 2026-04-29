import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } }
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "unauthorized" }, 401);

    const { data, error } = await userClient.rpc("recompute_graph_strength", {
      p_user_id: userData.user.id,
    });
    if (error) throw error;

    await userClient.from("sync_state").upsert(
      {
        user_id: userData.user.id,
        provider: "graph_strength",
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" },
    );

    return json({ ok: true, ...(Array.isArray(data) ? data[0] : data) });
  } catch (e) {
    console.error("recompute-graph-strength", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
