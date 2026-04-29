// Extract candidate memories from a transcript and queue them in suggested_memories.
// Called after a meeting interaction has been saved + contacts linked.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      SUPABASE_URL,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } }
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "unauthorized" }, 401);
    const userId = userData.user.id;

    const { interaction_id, transcript } = await req.json();
    if (!interaction_id || typeof transcript !== "string") {
      return json({ error: "interaction_id and transcript required" }, 400);
    }
    if (transcript.length < 200) return json({ ok: true, queued: 0 });

    // Verify ownership of the interaction via RLS
    const { data: ix } = await userClient
      .from("interactions").select("id").eq("id", interaction_id).maybeSingle();
    if (!ix) return json({ error: "not_found" }, 404);

    const { data: ics } = await userClient
      .from("interaction_contacts")
      .select("contact_id, contacts(id, emails)")
      .eq("interaction_id", interaction_id);
    const knownContacts = (ics ?? [])
      .map((row: any) => row.contacts).filter(Boolean)
      .map((c: any) => ({
        id: c.id,
        emails: ((c.emails as Array<{ email?: string }> | null) ?? [])
          .map((e) => (e?.email ?? "").toLowerCase()).filter(Boolean),
      }));
    if (knownContacts.length === 0) return json({ ok: true, queued: 0 });

    const prompt = `You read meeting transcripts and extract ONLY high-confidence personal or
professional facts about specific people that would help the user remember context
in future interactions. Output a JSON array of memory objects. Each object:
  { contact_email: string, body_md: string, sensitivity: "normal"|"sensitive"|"private", reasoning: string }
Use sensitivity="sensitive" for health, family, or personal struggles. Use "private"
for anything the user explicitly said to keep confidential. Otherwise "normal".
Skip generic statements ("they were friendly"). Skip task-like follow-ups (those go
elsewhere). Skip anything ambiguous. If no high-confidence memories, return [].
Known attendee emails: ${knownContacts.flatMap((c) => c.emails).join(", ")}`;

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: transcript.slice(0, 24000) },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      console.error("ai err", r.status, t);
      return json({ error: "ai_gateway_error" }, 500);
    }
    const j = await r.json();
    const content = j?.choices?.[0]?.message?.content ?? "[]";
    let arr: any[] = [];
    try {
      const parsed = JSON.parse(content);
      arr = Array.isArray(parsed) ? parsed : (parsed.memories ?? parsed.items ?? []);
    } catch { arr = []; }

    let queued = 0;
    for (const m of arr) {
      if (!m?.contact_email || !m?.body_md) continue;
      const email = String(m.contact_email).toLowerCase();
      const c = knownContacts.find((ct) => ct.emails.includes(email));
      if (!c) continue;
      const sensitivity = ["normal", "sensitive", "private"].includes(m.sensitivity) ? m.sensitivity : "normal";
      const { error } = await userClient.from("suggested_memories").insert({
        user_id: userId,
        contact_id: c.id,
        source_interaction_id: interaction_id,
        body_md: String(m.body_md).slice(0, 2000),
        suggested_provenance: "ai_inference",
        suggested_sensitivity: sensitivity,
        reasoning: m.reasoning ? String(m.reasoning).slice(0, 1000) : null,
      });
      if (!error) queued++;
    }
    return json({ ok: true, queued });
  } catch (e) {
    console.error("extract-memories", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
