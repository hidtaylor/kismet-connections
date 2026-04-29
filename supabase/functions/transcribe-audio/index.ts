// Transcribe an audio file from storage with OpenAI Whisper, then summarize via Lovable AI.
// For meetings, also extract candidate memories per attending contact → suggested_memories queue.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      SUPABASE_URL,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } }
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;
    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { storage_path, duration_seconds, kind, interaction_id } = await req.json();
    if (!storage_path) return json({ error: "storage_path required" }, 400);
    if (typeof storage_path !== "string" || !storage_path.startsWith(`${userId}/`)) {
      return json({ error: "forbidden path" }, 403);
    }

    // 1. Download audio
    const dl = await admin.storage.from("recordings").download(storage_path);
    if (dl.error) throw dl.error;
    const audioBlob = dl.data;

    // 2. Whisper
    const fd = new FormData();
    fd.append("file", audioBlob, "audio.webm");
    fd.append("model", "whisper-1");
    const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: fd,
    });
    if (!whisperRes.ok) {
      const t = await whisperRes.text();
      console.error("whisper error", whisperRes.status, t);
      return json({ error: "Transcription failed" }, 500);
    }
    const whisperJson = await whisperRes.json();
    const transcript: string = whisperJson?.text ?? "";

    // 3. Summary + memory extraction (only for meetings)
    let summary = "";
    let memories_queued = 0;
    if (kind === "meeting" && transcript.trim().length > 0) {
      const sumRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "You summarize meeting transcripts in exactly 3 concise sentences. Capture the main topic, any decisions, and any follow-ups. No preamble." },
            { role: "user", content: transcript.slice(0, 24000) },
          ],
        }),
      });
      if (sumRes.ok) {
        const j = await sumRes.json();
        summary = j?.choices?.[0]?.message?.content?.trim() ?? "";
      }

      // Memory extraction — only attempt if we know which interaction this belongs to
      if (interaction_id && transcript.length > 200) {
        try {
          // Pull contacts linked to this interaction (their emails are matched against AI output)
          const { data: ics } = await admin
            .from("interaction_contacts")
            .select("contact_id, contacts(id, emails)")
            .eq("interaction_id", interaction_id)
            .eq("user_id", userId);
          const knownContacts = (ics ?? [])
            .map((row: any) => row.contacts)
            .filter(Boolean)
            .map((c: any) => ({
              id: c.id,
              emails: ((c.emails as Array<{ email?: string }> | null) ?? [])
                .map((e) => (e?.email ?? "").toLowerCase()).filter(Boolean),
            }));
          memories_queued = await extractAndQueueMemories({
            admin, userId, interactionId: interaction_id, transcript,
            knownContacts, LOVABLE_API_KEY,
          });
        } catch (e) {
          console.error("memory extract fail", (e as Error).message);
        }
      }
    }

    return json({ transcript, summary, duration_seconds, memories_queued });
  } catch (e) {
    console.error("transcribe-audio error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

async function extractAndQueueMemories(args: {
  admin: ReturnType<typeof createClient>;
  userId: string;
  interactionId: string;
  transcript: string;
  knownContacts: { id: string; emails: string[] }[];
  LOVABLE_API_KEY: string;
}): Promise<number> {
  const { admin, userId, interactionId, transcript, knownContacts, LOVABLE_API_KEY } = args;
  if (knownContacts.length === 0) return 0;
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
  if (!r.ok) return 0;
  const j = await r.json();
  const content = j?.choices?.[0]?.message?.content ?? "[]";
  let arr: any[] = [];
  try {
    const parsed = JSON.parse(content);
    arr = Array.isArray(parsed) ? parsed : (parsed.memories ?? parsed.items ?? []);
  } catch { return 0; }

  let queued = 0;
  for (const m of arr) {
    if (!m?.contact_email || !m?.body_md) continue;
    const email = String(m.contact_email).toLowerCase();
    const c = knownContacts.find((ct) => ct.emails.includes(email));
    if (!c) continue;
    const sensitivity = ["normal", "sensitive", "private"].includes(m.sensitivity) ? m.sensitivity : "normal";
    const { error } = await admin.from("suggested_memories").insert({
      user_id: userId,
      contact_id: c.id,
      source_interaction_id: interactionId,
      body_md: String(m.body_md).slice(0, 2000),
      suggested_provenance: "ai_inference",
      suggested_sensitivity: sensitivity,
      reasoning: m.reasoning ? String(m.reasoning).slice(0, 1000) : null,
    });
    if (!error) queued++;
  }
  return queued;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
