// Sync Fireflies meeting transcripts.
// - First run: past 60 days backfill. Subsequent: past 14 days.
// - Tries to match each transcript to an existing Calendar interaction by date proximity + shared attendee.
// - Creates stub contacts for unknown attendee emails.
// - Stores transcript on a recordings row (no audio file — external_url points to Fireflies).
// - After upserting recordings, invokes the standalone extract-memories function.
// - All DB ops use the user's JWT — RLS enforces ownership. No service-role client.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FIREFLIES_GQL = "https://api.fireflies.ai/graphql";
const TRANSCRIPT_CHAR_CAP = 100_000;
const MATCH_WINDOW_MS = 10 * 60 * 1000; // ±10 min

interface FFAttendee { displayName?: string | null; email?: string | null; name?: string | null }
interface FFTranscript {
  id: string;
  title?: string | null;
  date?: number | string | null;
  duration?: number | null;
  meeting_link?: string | null;
  transcript_url?: string | null;
  host_email?: string | null;
  organizer_email?: string | null;
  participants?: string[] | null;
  attendees?: FFAttendee[] | null;
  summary?: { overview?: string | null; action_items?: string | null; keywords?: string[] | null } | null;
  sentences?: { text?: string | null; speaker_name?: string | null }[] | null;
}

function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local.replace(/[._-]+/g, " ").split(" ").filter(Boolean)
    .map((p) => p[0]!.toUpperCase() + p.slice(1)).join(" ");
}

function toIso(d: number | string | null | undefined): string | null {
  if (d == null) return null;
  if (typeof d === "number") return new Date(d).toISOString();
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

async function ffQuery(apiKey: string, query: string, variables: Record<string, unknown>) {
  const r = await fetch(FIREFLIES_GQL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.errors) {
    throw new Error(`Fireflies ${r.status}: ${JSON.stringify(j.errors ?? j).slice(0, 400)}`);
  }
  return j.data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const FIREFLIES_API_KEY = Deno.env.get("FIREFLIES_API_KEY");
    if (!FIREFLIES_API_KEY) throw new Error("FIREFLIES_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "unauthorized" }, 401);
    const userId = userData.user.id;

    // Determine window
    const { data: state } = await userClient.from("sync_state")
      .select("*").eq("provider", "fireflies").maybeSingle();
    const now = new Date();
    const isBackfill = !state?.backfill_done_at;
    const fromDate = new Date(now);
    fromDate.setDate(now.getDate() - (isBackfill ? 60 : 14));

    // List transcripts
    const listQuery = `
      query Transcripts($fromDate: DateTime, $limit: Int) {
        transcripts(fromDate: $fromDate, limit: $limit) {
          id title date duration
          meeting_link host_email organizer_email
          participants
          summary { overview action_items keywords }
        }
      }`;
    const listData = await ffQuery(FIREFLIES_API_KEY, listQuery, {
      fromDate: fromDate.toISOString(),
      limit: 50,
    });
    const transcripts: FFTranscript[] = listData?.transcripts ?? [];

    // Pre-fetch contacts for matching (RLS scopes to current user)
    const { data: allContacts } = await userClient
      .from("contacts").select("id, emails, last_contact_at");

    let synced = 0;
    let linkedToExisting = 0;
    let createdContacts = 0;
    const createdInteractionIds: string[] = [];

    for (const t of transcripts) {
      const occurredAt = toIso(t.date);
      if (!occurredAt) continue;

      // Normalize attendee emails
      const emails = new Set<string>();
      const namedAttendees: { email: string; name?: string | null }[] = [];
      (t.participants ?? []).forEach((e) => { if (e) emails.add(e.toLowerCase()); });
      (t.attendees ?? []).forEach((a) => {
        const e = (a?.email ?? "").toLowerCase();
        if (e) {
          emails.add(e);
          namedAttendees.push({ email: e, name: a.displayName ?? a.name ?? null });
        }
      });
      const emailList = Array.from(emails);

      // Try to match an existing interaction by ±10 min and shared attendee
      const startWindow = new Date(new Date(occurredAt).getTime() - MATCH_WINDOW_MS).toISOString();
      const endWindow = new Date(new Date(occurredAt).getTime() + MATCH_WINDOW_MS).toISOString();
      const { data: candidates } = await userClient
        .from("interactions")
        .select("id, occurred_at, source_provider, source_external_id")
        .gte("occurred_at", startWindow)
        .lte("occurred_at", endWindow);

      let interactionId: string | null = null;
      if (candidates && candidates.length > 0) {
        for (const c of candidates) {
          const { data: linkedICs } = await userClient
            .from("interaction_contacts")
            .select("contact_id")
            .eq("interaction_id", c.id);
          const ids = (linkedICs ?? []).map((r) => r.contact_id);
          if (ids.length === 0) continue;
          const matched = (allContacts ?? []).some((ct) => {
            if (!ids.includes(ct.id)) return false;
            const arr = (ct.emails as Array<{ email?: string }> | null) ?? [];
            return arr.some((e) => emailList.includes((e?.email ?? "").toLowerCase()));
          });
          if (matched) { interactionId = c.id; linkedToExisting++; break; }
        }
      }

      if (!interactionId) {
        const { data: ins, error: insErr } = await userClient.from("interactions").insert({
          user_id: userId,
          title: t.title ?? "Fireflies meeting",
          type: "video",
          occurred_at: occurredAt,
          summary: t.summary?.overview ?? null,
          source_provider: "fireflies",
          source_external_id: t.id,
        }).select("id").single();
        if (insErr) { console.error("interaction insert", insErr.message); continue; }
        interactionId = ins.id;
      }

      // Resolve attendees → contacts
      const linkedContactIds = new Set<string>();
      for (const a of namedAttendees.length > 0
          ? namedAttendees
          : emailList.map((e) => ({ email: e, name: null }))) {
        const email = a.email;
        const found = (allContacts ?? []).find((c) => {
          const arr = (c.emails as Array<{ email?: string }> | null) ?? [];
          return arr.some((e) => (e?.email ?? "").toLowerCase() === email);
        });
        let contactId: string | undefined = found?.id;
        if (!contactId) {
          const fullName = a.name?.trim() || nameFromEmail(email);
          const { data: created, error: cErr } = await userClient.from("contacts").insert({
            user_id: userId,
            full_name: fullName,
            emails: [{ label: "work", email }],
            phones: [],
            source: "email",
            last_contact_at: occurredAt,
          }).select("id").single();
          if (cErr) { console.error("stub contact", cErr.message); continue; }
          contactId = created.id;
          createdContacts++;
          (allContacts ?? []).push({ id: contactId, emails: [{ email }] as any, last_contact_at: occurredAt });
        }
        if (contactId && !linkedContactIds.has(contactId)) {
          linkedContactIds.add(contactId);
          await userClient.from("interaction_contacts").upsert({
            user_id: userId,
            interaction_id: interactionId,
            contact_id: contactId,
          }, { onConflict: "interaction_id,contact_id" }).then(() => {}, () => {});
        }
      }

      // Fetch full transcript text
      let fullText = "";
      try {
        const detail = await ffQuery(FIREFLIES_API_KEY, `
          query T($id: String!) {
            transcript(id: $id) {
              id
              sentences { text speaker_name }
            }
          }`, { id: t.id });
        const sentences = detail?.transcript?.sentences ?? [];
        fullText = sentences
          .map((s: any) => `${s.speaker_name ? s.speaker_name + ": " : ""}${s.text ?? ""}`)
          .filter(Boolean).join("\n").slice(0, TRANSCRIPT_CHAR_CAP);
      } catch (e) {
        console.error("transcript detail fail", t.id, (e as Error).message);
      }

      // Upsert recording row
      await userClient.from("recordings").upsert({
        user_id: userId,
        interaction_id: interactionId,
        consent_disclosed: true,
        transcript_status: "done",
        transcript_text: fullText || null,
        duration_seconds: t.duration ?? null,
        source_provider: "fireflies",
        source_external_id: t.id,
        external_url: t.meeting_link ?? t.transcript_url ?? null,
      }, { onConflict: "user_id,source_provider,source_external_id" });

      synced++;

      // Invoke the standalone extract-memories function (transcript fetched server-side from recordings)
      if (fullText && fullText.length > 200 && interactionId) {
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/extract-memories`, {
            method: "POST",
            headers: {
              Authorization: auth,
              "Content-Type": "application/json",
              apikey: SUPABASE_ANON,
            },
            body: JSON.stringify({ interaction_id: interactionId }),
          });
          createdInteractionIds.push(interactionId);
        } catch (e) {
          console.error("memory extract invoke fail", t.id, (e as Error).message);
        }
      }
    }

    await userClient.from("sync_state").upsert({
      user_id: userId,
      provider: "fireflies",
      last_synced_at: new Date().toISOString(),
      backfill_done_at: state?.backfill_done_at ?? new Date().toISOString(),
    }, { onConflict: "user_id,provider" });

    return json({
      ok: true,
      scanned: transcripts.length,
      synced,
      linked_to_existing: linkedToExisting,
      created_contacts: createdContacts,
      backfill: isBackfill,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("sync-fireflies error:", msg);
    return json({ error: msg }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
