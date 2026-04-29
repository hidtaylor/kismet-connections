// Sync Fireflies meeting transcripts.
// - First run: past 60 days backfill. Subsequent: past 14 days.
// - Tries to match each transcript to an existing Calendar interaction by date proximity + shared attendee.
// - Creates stub contacts for unknown attendee emails.
// - Stores transcript on a recordings row (no audio file — external_url points to Fireflies).
// - Extracts candidate memories per attendee → suggested_memories queue.

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
  date?: number | string | null; // ms epoch or ISO
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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!FIREFLIES_API_KEY) throw new Error("FIREFLIES_API_KEY not configured");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "unauthorized" }, 401);
    const userId = userData.user.id;
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE);

    // Determine window
    const { data: state } = await admin.from("sync_state")
      .select("*").eq("user_id", userId).eq("provider", "fireflies").maybeSingle();
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

    // Pre-fetch contacts for matching
    const { data: allContacts } = await admin
      .from("contacts").select("id, emails, last_contact_at").eq("user_id", userId);

    let synced = 0;
    let linkedToExisting = 0;
    let createdContacts = 0;
    let memoriesQueued = 0;

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
      const { data: candidates } = await admin
        .from("interactions")
        .select("id, occurred_at, source_provider, source_external_id")
        .eq("user_id", userId)
        .gte("occurred_at", startWindow)
        .lte("occurred_at", endWindow);

      let interactionId: string | null = null;
      if (candidates && candidates.length > 0) {
        // If any candidate has linked contacts whose email matches one of ours → use it
        for (const c of candidates) {
          const { data: linkedICs } = await admin
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
        // Create new interaction
        const { data: ins, error: insErr } = await admin.from("interactions").insert({
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
          const { data: created, error: cErr } = await admin.from("contacts").insert({
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
          await admin.from("interaction_contacts").upsert({
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
      await admin.from("recordings").upsert({
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

      // Extract candidate memories from the transcript
      if (fullText && fullText.length > 200) {
        try {
          const queued = await extractAndQueueMemories({
            admin, userId, interactionId, transcript: fullText,
            knownContacts: (allContacts ?? []).map((c) => ({
              id: c.id,
              emails: ((c.emails as Array<{ email?: string }> | null) ?? [])
                .map((e) => (e?.email ?? "").toLowerCase()).filter(Boolean),
            })),
            LOVABLE_API_KEY,
          });
          memoriesQueued += queued;
        } catch (e) {
          console.error("memory extract fail", t.id, (e as Error).message);
        }
      }
    }

    await admin.from("sync_state").upsert({
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
      memories_queued: memoriesQueued,
      backfill: isBackfill,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("sync-fireflies error:", msg);
    return json({ error: msg }, 500);
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
  const prompt = `You read meeting transcripts and extract ONLY high-confidence personal or
professional facts about specific people that would help the user remember context
in future interactions. Output a JSON array of memory objects. Each object:
  { contact_email: string, body_md: string, sensitivity: "normal"|"sensitive"|"private", reasoning: string }
Use sensitivity="sensitive" for health, family, or personal struggles. Use "private"
for anything the user explicitly said to keep confidential. Otherwise "normal".
Skip generic statements ("they were friendly"). Skip task-like follow-ups (those go
elsewhere). Skip anything ambiguous. If no high-confidence memories, return [].`;

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
