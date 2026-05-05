// Scan a business card image (front + optional back) with Lovable AI (Gemini Flash, vision).
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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json();
    let paths: string[] = [];
    if (Array.isArray(body?.storage_paths)) paths = body.storage_paths;
    else if (typeof body?.storage_path === "string") paths = [body.storage_path];

    paths = paths.filter((p) => typeof p === "string" && p.length > 0).slice(0, 2);
    if (paths.length === 0) return json({ error: "storage_path(s) required" }, 400);
    for (const p of paths) {
      if (!p.startsWith(`${user.id}/`)) return json({ error: "forbidden path" }, 403);
    }

    // Download all images and base64-encode them
    const imageParts: { type: "image_url"; image_url: { url: string } }[] = [];
    for (const path of paths) {
      const dl = await admin.storage.from("card-images").download(path);
      if (dl.error) throw dl.error;
      const buf = await dl.data.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
      }
      const b64 = btoa(bin);
      const mime = dl.data.type || "image/jpeg";
      imageParts.push({ type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } });
    }

    const sideNote = paths.length === 2
      ? "There are TWO images: image 1 is the FRONT of a single business card, image 2 is the BACK of the SAME card. Merge information from both sides into one contact. Prefer non-empty values; deduplicate emails and phone numbers; for raw_text, concatenate front then back separated by a line `--- BACK ---`."
      : "There is ONE image of a business card.";

    const prompt = `You are a precise OCR + parser. Extract structured contact info from the business card image(s).
${sideNote}
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
            ...imageParts,
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

    await userClient.from("card_scans").insert({
      user_id: user.id,
      image_url: paths[0],
      ocr_json: { raw_text: parsed.raw_text ?? "", storage_paths: paths },
      parsed_json: parsed,
      status: "parsed",
    });

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
