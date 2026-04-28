// Sync Google Calendar events into the calendar_imports staging table.
// - One-time backfill: past 90 days
// - Rolling window: ±14 days
// - Skips recurring instances, all-day events, and events the user declined

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";

interface GAttendee {
  email?: string;
  displayName?: string;
  responseStatus?: string;
  self?: boolean;
  organizer?: boolean;
}

interface GEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  organizer?: { email?: string };
  attendees?: GAttendee[];
  hangoutLink?: string;
  recurringEventId?: string;
  eventType?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GCAL_KEY = Deno.env.get("GOOGLE_CALENDAR_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (!GCAL_KEY) throw new Error("GOOGLE_CALENDAR_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE);

    // Determine sync window
    const { data: state } = await admin
      .from("sync_state")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", "google_calendar")
      .maybeSingle();

    const now = new Date();
    const isBackfill = !state?.backfill_done_at;
    const timeMin = new Date(now);
    if (isBackfill) {
      timeMin.setDate(now.getDate() - 90);
    } else {
      timeMin.setDate(now.getDate() - 14);
    }
    const timeMax = new Date(now);
    timeMax.setDate(now.getDate() + 14);

    // Pull events (paginate)
    const collected: GEvent[] = [];
    let pageToken: string | undefined;
    let pages = 0;
    do {
      const params = new URLSearchParams({
        singleEvents: "true",
        showDeleted: "false",
        maxResults: "250",
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        orderBy: "startTime",
      });
      if (pageToken) params.set("pageToken", pageToken);

      const r = await fetch(
        `${GATEWAY_URL}/calendars/primary/events?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": GCAL_KEY,
          },
        },
      );
      const json = await r.json();
      if (!r.ok) {
        throw new Error(`Calendar API ${r.status}: ${JSON.stringify(json).slice(0, 400)}`);
      }
      collected.push(...(json.items ?? []));
      pageToken = json.nextPageToken;
      pages++;
    } while (pageToken && pages < 8);

    // Filter
    const filtered = collected.filter((e) => {
      if (e.status === "cancelled") return false;
      if (e.eventType && e.eventType !== "default") return false;
      // Skip all-day (no dateTime)
      if (!e.start?.dateTime) return false;
      // Skip recurring instances (we still keep one-off events)
      if (e.recurringEventId) return false;
      // Skip declined by self
      const me = (e.attendees ?? []).find((a) => a.self);
      if (me?.responseStatus === "declined") return false;
      return true;
    });

    // Upsert into staging (only new ones; preserve existing status)
    let staged = 0;
    for (const e of filtered) {
      const externalId = e.id;
      const { data: existing } = await admin
        .from("calendar_imports")
        .select("id, status")
        .eq("user_id", userId)
        .eq("provider", "google_calendar")
        .eq("external_id", externalId)
        .maybeSingle();
      if (existing) continue; // don't re-stage already-decided events

      const attendees = (e.attendees ?? [])
        .filter((a) => !a.self && a.email)
        .map((a) => ({
          email: a.email,
          name: a.displayName ?? null,
          response: a.responseStatus ?? null,
          organizer: !!a.organizer,
        }));

      const { error: insErr } = await admin.from("calendar_imports").insert({
        user_id: userId,
        provider: "google_calendar",
        external_id: externalId,
        calendar_id: "primary",
        title: e.summary ?? "(no title)",
        description: e.description ?? null,
        location: e.location ?? null,
        starts_at: e.start!.dateTime!,
        ends_at: e.end?.dateTime ?? null,
        organizer_email: e.organizer?.email ?? null,
        attendees,
        hangout_link: e.hangoutLink ?? null,
        raw: e,
      });
      if (!insErr) staged++;
    }

    // Update sync state
    await admin
      .from("sync_state")
      .upsert(
        {
          user_id: userId,
          provider: "google_calendar",
          last_synced_at: new Date().toISOString(),
          backfill_done_at: state?.backfill_done_at ?? new Date().toISOString(),
        },
        { onConflict: "user_id,provider" },
      );

    return new Response(
      JSON.stringify({
        ok: true,
        scanned: collected.length,
        eligible: filtered.length,
        staged,
        backfill: isBackfill,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("sync-calendar error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
