// Aggregate notes + interactions for a contact, generate a "what to know" paragraph, save it.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const auth = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: auth } } }
    );
    const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { contact_id } = await req.json();
    if (!contact_id) return json({ error: "contact_id required" }, 400);

    // Verify ownership
    const { data: contact } = await supabase
      .from("contacts").select("id, full_name, company, title").eq("id", contact_id).eq("user_id", user.id).maybeSingle();
    if (!contact) return json({ error: "Not found" }, 404);

    const [notesRes, icRes] = await Promise.all([
      supabase.from("notes").select("body_md, transcript, created_at").eq("contact_id", contact_id).order("created_at", { ascending: false }).limit(30),
      supabase.from("interaction_contacts").select("interactions(title, summary, occurred_at)").eq("contact_id", contact_id).limit(30),
    ]);

    const lines: string[] = [];
    (notesRes.data ?? []).forEach((n) => {
      const t = n.body_md || n.transcript;
      if (t) lines.push(`[Note ${n.created_at?.slice(0, 10)}] ${t}`);
    });
    (icRes.data ?? []).forEach((row: any) => {
      const i = row.interactions;
      if (i?.summary) lines.push(`[Meeting ${i.occurred_at?.slice(0, 10)}: ${i.title}] ${i.summary}`);
    });

    if (lines.length === 0) {
      await supabase.from("contacts").update({ notes_summary: null }).eq("id", contact_id);
      return json({ summary: null });
    }

    const corpus = lines.join("\n\n").slice(0, 24000);
    const sumRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: `You write a concise "what to know" paragraph (3-5 sentences) about a person, drawn from notes and meeting summaries. Focus on: who they are, what they care about, any open follow-ups, and any personal details worth remembering. No preamble. Write in second person if context warrants ("You last met...").` },
          { role: "user", content: `Person: ${contact.full_name}${contact.title ? ", " + contact.title : ""}${contact.company ? " at " + contact.company : ""}\n\n---\n\n${corpus}` },
        ],
      }),
    });

    if (!sumRes.ok) {
      const t = await sumRes.text();
      console.error("summary error", sumRes.status, t);
      return json({ error: "AI gateway error" }, 500);
    }
    const j = await sumRes.json();
    const summary = j?.choices?.[0]?.message?.content?.trim() ?? null;

    if (summary) {
      await supabase.from("contacts").update({ notes_summary: summary }).eq("id", contact_id);
    }
    return json({ summary });
  } catch (e) {
    console.error("refresh-contact-summary error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
