// Transcribe an audio file from storage with OpenAI Whisper, then summarize via Lovable AI.
// Memory extraction happens in a separate `extract-memories` function called after the
// caller links contacts to the resulting interaction.
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

    const { storage_path, duration_seconds, kind } = await req.json();
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

    // 3. Summary (only for meetings, kept short)
    let summary = "";
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
    }

    return json({ transcript, summary, duration_seconds });
  } catch (e) {
    console.error("transcribe-audio error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
