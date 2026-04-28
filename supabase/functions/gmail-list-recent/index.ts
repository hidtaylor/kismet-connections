// List recent inbox messages (sender, subject, snippet, date).
// Used by the Gmail import page to pick a message to convert into a contact.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

interface GmailHeader { name: string; value: string }
interface GmailMsgMeta {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  payload?: { headers?: GmailHeader[] };
}

function header(headers: GmailHeader[] | undefined, name: string): string {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
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

    // List ids
    const listRes = await fetch(
      `${GATEWAY_URL}/users/me/messages?maxResults=20&labelIds=INBOX&q=-category:promotions -category:social`,
      {
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": GMAIL_KEY,
        },
      },
    );
    const listJson = await listRes.json();
    if (!listRes.ok) throw new Error(`Gmail list ${listRes.status}: ${JSON.stringify(listJson).slice(0, 300)}`);
    const ids: { id: string }[] = listJson.messages ?? [];

    // Fetch metadata in parallel
    const metas = await Promise.all(
      ids.map(async ({ id }) => {
        const r = await fetch(
          `${GATEWAY_URL}/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          {
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "X-Connection-Api-Key": GMAIL_KEY,
            },
          },
        );
        if (!r.ok) return null;
        const j = (await r.json()) as GmailMsgMeta;
        return {
          id: j.id,
          threadId: j.threadId,
          snippet: j.snippet ?? "",
          from: header(j.payload?.headers, "From"),
          subject: header(j.payload?.headers, "Subject"),
          date: header(j.payload?.headers, "Date"),
          internalDate: j.internalDate ?? null,
        };
      }),
    );

    return new Response(JSON.stringify({ messages: metas.filter(Boolean) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("gmail-list-recent error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
