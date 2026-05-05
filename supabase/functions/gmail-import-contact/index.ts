// Import a Gmail message as a contact + email interaction + note.
// Steps:
//   1. Fetch full message (gateway)
//   2. Decode body (text/plain preferred, else strip HTML)
//   3. Send sender + body to Lovable AI for structured contact extraction
//   4. Create or merge contact
//   5. Create interaction (type: 'email') and note with the body

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GMAIL_GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";
const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const Body = z.object({ message_id: z.string().min(1) });

interface GmailHeader { name: string; value: string }
interface GmailPart {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
  filename?: string;
}
interface GmailMessage {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart & { headers?: GmailHeader[] };
}

function header(headers: GmailHeader[] | undefined, name: string): string {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function b64urlDecode(s: string): string {
  const norm = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = norm + "===".slice((norm.length + 3) % 4);
  try {
    return new TextDecoder().decode(
      Uint8Array.from(atob(pad), (c) => c.charCodeAt(0)),
    );
  } catch {
    return "";
  }
}

function extractBody(part: GmailPart | undefined): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) {
    return b64urlDecode(part.body.data);
  }
  if (part.parts) {
    // Prefer text/plain
    for (const p of part.parts) {
      if (p.mimeType === "text/plain" && p.body?.data) return b64urlDecode(p.body.data);
    }
    // Fallback: text/html stripped
    for (const p of part.parts) {
      if (p.mimeType === "text/html" && p.body?.data) {
        const html = b64urlDecode(p.body.data);
        return html.replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/\s+/g, " ")
          .trim();
      }
    }
    // Recurse
    for (const p of part.parts) {
      const v = extractBody(p);
      if (v) return v;
    }
  }
  if (part.body?.data) return b64urlDecode(part.body.data);
  return "";
}

function parseFromHeader(from: string): { name: string; email: string } {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), email: m[2].trim().toLowerCase() };
  return { name: "", email: from.trim().toLowerCase() };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GMAIL_KEY = Deno.env.get("GOOGLE_MAIL_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (!GMAIL_KEY) throw new Error("GOOGLE_MAIL_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { message_id } = parsed.data;

    // Fetch full message
    const r = await fetch(
      `${GMAIL_GATEWAY}/users/me/messages/${encodeURIComponent(message_id)}?format=full`,
      {
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": GMAIL_KEY,
        },
      },
    );
    const msg = (await r.json()) as GmailMessage;
    if (!r.ok) {
      throw new Error(`Gmail get ${r.status}: ${JSON.stringify(msg).slice(0, 300)}`);
    }

    const headers = msg.payload?.headers ?? [];
    const from = header(headers, "From");
    const subject = header(headers, "Subject");
    const dateStr = header(headers, "Date");
    const occurredAt = msg.internalDate
      ? new Date(Number(msg.internalDate)).toISOString()
      : (dateStr ? new Date(dateStr).toISOString() : new Date().toISOString());

    const { name: fromName, email: fromEmail } = parseFromHeader(from);
    if (!fromEmail) throw new Error("Could not parse sender email");

    const body = extractBody(msg.payload).slice(0, 8000);

    // Extract structured contact via Lovable AI (Gemini Flash)
    const aiRes = await fetch(AI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Extract a single contact's info from an email signature/body. Respond ONLY with JSON matching the schema. Use null for unknown fields. Never invent values.",
          },
          {
            role: "user",
            content: `Sender header: ${from}\nSubject: ${subject}\n\nBody:\n${body}\n\nReturn JSON with keys: full_name, first_name, last_name, company, title, phone, linkedin_url, twitter_url, website_url, location.`,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });
    const aiJson = await aiRes.json();
    let extracted: Record<string, string | null> = {};
    try {
      const content = aiJson?.choices?.[0]?.message?.content ?? "{}";
      extracted = JSON.parse(content);
    } catch {
      extracted = {};
    }

    const fullName =
      (extracted.full_name?.trim()) ||
      fromName ||
      fromEmail.split("@")[0];

    // Find or create contact (case-insensitive email match)
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE);

    const { data: all } = await admin
      .from("contacts")
      .select("id, emails")
      .eq("user_id", userId);
    const existing = (all ?? []).find((c) => {
      const arr = (c.emails as any[] | null) ?? [];
      return arr.some((e) => {
        const v = typeof e === "string" ? e : e?.email;
        return typeof v === "string" && v.toLowerCase() === fromEmail;
      });
    });

    // Derive company from sender domain when AI didn't extract one
    const PERSONAL_DOMAINS = new Set([
      "gmail.com","googlemail.com","outlook.com","hotmail.com","live.com",
      "yahoo.com","icloud.com","me.com","mac.com","aol.com","proton.me","protonmail.com","pm.me",
      "msn.com","comcast.net","sbcglobal.net",
    ]);
    const domain = fromEmail.split("@")[1] ?? "";
    let derivedCompany: string | null = null;
    if (!extracted.company && domain && !PERSONAL_DOMAINS.has(domain.toLowerCase())) {
      const root = domain.split(".")[0];
      derivedCompany = root.charAt(0).toUpperCase() + root.slice(1);
    }
    const finalCompany = extracted.company ?? derivedCompany;

    let contactId: string;
    let createdNew = false;

    if (existing) {
      contactId = existing.id;
      await admin.from("contacts").update({ last_contact_at: occurredAt }).eq("id", contactId);
    } else {
      const phones = extracted.phone ? [extracted.phone] : [];
      const { data: created, error: cErr } = await admin
        .from("contacts")
        .insert({
          user_id: userId,
          full_name: fullName,
          first_name: extracted.first_name ?? null,
          last_name: extracted.last_name ?? null,
          company: finalCompany,
          title: extracted.title ?? null,
          emails: [fromEmail],
          phones,
          linkedin_url: extracted.linkedin_url ?? null,
          twitter_url: extracted.twitter_url ?? null,
          website_url: extracted.website_url ?? null,
          location: extracted.location ?? null,
          source: "email",
          last_contact_at: occurredAt,
        })
        .select("id")
        .single();
      if (cErr) throw cErr;
      contactId = created.id;
      createdNew = true;
    }

    // Provenance for tracked fields (source: email)
    {
      const provFields: Record<string, string> = {};
      const add = (k: string, v: any) => { if (typeof v === "string" && v.trim()) provFields[k] = v.trim(); };
      add("full_name", fullName);
      add("first_name", extracted.first_name);
      add("last_name", extracted.last_name);
      add("company", finalCompany);
      add("title", extracted.title);
      add("location", extracted.location);
      add("linkedin_url", extracted.linkedin_url);
      add("twitter_url", extracted.twitter_url);
      add("website_url", extracted.website_url);
      provFields.email = fromEmail;
      if (extracted.phone) provFields.phone = extracted.phone;
      const { error: rErr } = await admin.rpc("update_contact_with_provenance", {
        p_contact_id: contactId,
        p_fields: provFields,
        p_source: "email",
        p_confidence: 70,
      });
      if (rErr) console.error("gmail-import provenance", rErr);
    }

    // Create interaction
    const { data: interaction, error: intErr } = await admin
      .from("interactions")
      .insert({
        user_id: userId,
        title: subject || "(no subject)",
        type: "email",
        occurred_at: occurredAt,
        summary: msg.snippet ?? null,
        source_provider: "gmail",
        source_external_id: msg.id,
      })
      .select("id")
      .single();
    if (intErr) throw intErr;

    await admin.from("interaction_contacts").insert({
      user_id: userId,
      interaction_id: interaction.id,
      contact_id: contactId,
    });

    // Note with body
    await admin.from("notes").insert({
      user_id: userId,
      contact_id: contactId,
      interaction_id: interaction.id,
      body_md: `**${subject}**\n\nFrom: ${from}\nDate: ${dateStr}\n\n${body}`,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        contact_id: contactId,
        interaction_id: interaction.id,
        created_new: createdNew,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("gmail-import-contact error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
