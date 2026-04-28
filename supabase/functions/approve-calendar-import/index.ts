// Promote a staged calendar event to an interaction.
// - Auto-link attendees by email (case-insensitive match against contacts.emails JSON)
// - Auto-create stub contacts for unknown attendees
// - Insert interaction_contacts rows
// - Update contacts.last_contact_at to the event start time (if newer)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const Body = z.object({
  import_id: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
});

interface Attendee {
  email: string;
  name?: string | null;
  organizer?: boolean;
}

function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .replace(/[._-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase() + p.slice(1))
    .join(" ");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
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
      return new Response(
        JSON.stringify({ error: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { import_id, decision } = parsed.data;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE);

    const { data: imp, error: impErr } = await admin
      .from("calendar_imports")
      .select("*")
      .eq("id", import_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (impErr) throw impErr;
    if (!imp) {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (imp.status !== "pending") {
      return new Response(JSON.stringify({ error: "already_decided" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (decision === "reject") {
      await admin
        .from("calendar_imports")
        .update({ status: "rejected" })
        .eq("id", import_id);
      return new Response(JSON.stringify({ ok: true, rejected: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Approve: create interaction
    const { data: interaction, error: intErr } = await admin
      .from("interactions")
      .insert({
        user_id: userId,
        title: imp.title,
        type: imp.hangout_link ? "video" : "in_person",
        occurred_at: imp.starts_at,
        ended_at: imp.ends_at,
        location: imp.location ?? imp.hangout_link ?? null,
        summary: imp.description ?? null,
        source_provider: "google_calendar",
        source_external_id: imp.external_id,
      })
      .select("id")
      .single();
    if (intErr) throw intErr;

    // Resolve attendees → contacts
    const attendees: Attendee[] = Array.isArray(imp.attendees) ? imp.attendees : [];
    const linkedContactIds = new Set<string>();

    // Pre-fetch all contacts once (case-insensitive email match)
    const { data: allContacts, error: allErr } = await admin
      .from("contacts")
      .select("id, emails, last_contact_at")
      .eq("user_id", userId);
    if (allErr) throw new Error(`contacts fetch: ${allErr.message}`);

    for (const a of attendees) {
      if (!a.email) continue;
      const email = a.email.toLowerCase();

      const found = (allContacts ?? []).find((c) => {
        const arr = (c.emails as Array<{ email?: string }> | null) ?? [];
        return arr.some((e) => (e?.email ?? "").toLowerCase() === email);
      });
      let contactId = found?.id as string | undefined;
      let prevLast = found?.last_contact_at as string | null | undefined;

      if (!contactId) {
        // Create stub
        const fullName = a.name?.trim() || nameFromEmail(email);
        const { data: created, error: cErr } = await admin
          .from("contacts")
          .insert({
            user_id: userId,
            full_name: fullName,
            emails: [{ label: "work", email }],
            phones: [],
            source: "calendar",
            last_contact_at: imp.starts_at,
          })
          .select("id")
          .single();
        if (cErr) {
          console.error("stub contact insert failed:", cErr.message);
          continue;
        }
        contactId = created.id;
      } else {
        // Bump last_contact_at if event is newer
        if (!prevLast || new Date(imp.starts_at) > new Date(prevLast)) {
          await admin
            .from("contacts")
            .update({ last_contact_at: imp.starts_at })
            .eq("id", contactId);
        }
      }

      if (contactId && !linkedContactIds.has(contactId)) {
        linkedContactIds.add(contactId);
        await admin.from("interaction_contacts").insert({
          user_id: userId,
          interaction_id: interaction.id,
          contact_id: contactId,
        });
      }
    }

    await admin
      .from("calendar_imports")
      .update({ status: "approved", interaction_id: interaction.id })
      .eq("id", import_id);

    return new Response(
      JSON.stringify({
        ok: true,
        interaction_id: interaction.id,
        linked: linkedContactIds.size,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg =
      err instanceof Error ? err.message :
      typeof err === "object" ? JSON.stringify(err) : String(err);
    console.error("approve-calendar-import error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
