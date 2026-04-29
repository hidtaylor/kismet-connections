// Scan a business card image with Lovable AI (Gemini Flash, vision-capable).
// Returns structured JSON parsed from the card.
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

    const auth = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: auth } } }
    );
    const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { image_url, storage_path } = await req.json();
    if (!image_url) return json({ error: "image_url required" }, 400);

    const prompt = `You are a precise OCR + parser. Extract structured contact info from this business card image.
Return ONLY a JSON object matching this exact schema (no prose, no markdown):
{
  "full_name": string|null,
  "first_name": string|null,
  "last_name": string|null,
  "company": string|null,
  "title": string|null,
  "emails": string[],
  "phones": string[],
  "website": string|null,
  "address": string|null,
  "linkedin": string|null,
  "raw_text": string
}
Use empty arrays for none, null for missing single fields. raw_text must contain ALL visible text from the card.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: image_url } },
          ],
        }],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      if (aiRes.status === 429) return json({ error: "Rate limited, try again shortly" }, 429);
      if (aiRes.status === 402) return json({ error: "AI credits exhausted" }, 402);
      console.error("AI error", aiRes.status, t);
      return json({ error: "AI gateway error" }, 500);
    }

    const aiJson = await aiRes.json();
    const content = aiJson?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch { parsed = { raw_text: content }; }

    // Persist scan record
    if (storage_path) {
      await supabase.from("card_scans").insert({
        user_id: user.id,
        image_url: storage_path,
        ocr_json: { raw_text: parsed.raw_text ?? "" },
        parsed_json: parsed,
        status: "parsed",
      });
    }

    return json({ parsed });
  } catch (e) {
    console.error("scan-card error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
