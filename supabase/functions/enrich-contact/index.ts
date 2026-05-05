// Enrich a contact via People Data Labs, with ZeroBounce + Twilio Lookup gates.
// Async, idempotent. Writes provenance rows in contact_field_sources.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PDL_KEY = Deno.env.get("PEOPLE_DATA_LABS_API_KEY");
const ZB_KEY = Deno.env.get("ZEROBOUNCE_API_KEY");
const TW_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TW_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function domainFromCompany(company: string | null): string | null {
  if (!company) return null;
  // very loose; PDL accepts company name or domain
  return company.toLowerCase().includes(".") ? company.toLowerCase() : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const contactId = body?.contact_id;
    if (!contactId || typeof contactId !== "string") {
      return new Response(JSON.stringify({ error: "contact_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Validate ownership
    const { data: contact, error: cErr } = await supabase
      .from("contacts")
      .select("id, user_id, full_name, company, location, emails, phones, linkedin_url")
      .eq("id", contactId)
      .single();
    if (cErr || !contact || contact.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Contact not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Cache check (90 days)
    const since = new Date(Date.now() - 90 * 86400 * 1000).toISOString();
    const { data: cached } = await admin
      .from("enrichment_jobs")
      .select("id")
      .eq("contact_id", contactId)
      .eq("provider", "pdl")
      .eq("status", "success")
      .gte("created_at", since)
      .limit(1);
    if (cached && cached.length > 0) {
      return new Response(JSON.stringify({ status: "cached", job_id: cached[0].id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve active values (use base contact + active provenance overrides via the view)
    const { data: resolved } = await admin
      .from("contacts_resolved")
      .select("*")
      .eq("id", contactId)
      .single();

    const email: string | null = resolved?.email ?? (Array.isArray(contact.emails) ? contact.emails[0] : null);
    const phone: string | null = resolved?.phone ?? (Array.isArray(contact.phones) ? contact.phones[0] : null);
    const linkedin: string | null = resolved?.linkedin_url ?? contact.linkedin_url ?? null;
    const fullName: string | null = resolved?.full_name ?? contact.full_name ?? null;
    const company: string | null = resolved?.company ?? contact.company ?? null;
    const location: string | null = resolved?.location ?? contact.location ?? null;

    const fieldsToActivate = new Set<string>();

    // ---------- ZeroBounce email gate ----------
    let emailValid = !!email;
    if (email && ZB_KEY) {
      try {
        const url = `https://api.zerobounce.net/v2/validate?api_key=${ZB_KEY}&email=${encodeURIComponent(email)}`;
        const r = await fetch(url);
        const j = await r.json();
        const status = String(j?.status ?? "unknown");
        await admin.from("contact_field_sources").upsert({
          contact_id: contactId,
          user_id: userId,
          field_name: "email_status",
          value: status,
          source: "zerobounce",
          confidence: 90,
          fetched_at: new Date().toISOString(),
          is_active: true,
        }, { onConflict: "contact_id,field_name,source" });
        if (status === "invalid" || status === "spamtrap") {
          emailValid = false;
          await admin.from("contact_field_sources")
            .update({ is_active: false })
            .eq("contact_id", contactId).eq("field_name", "email").eq("value", email);
        }
      } catch (_) { /* swallow gate errors */ }
    }

    // ---------- Twilio Lookup phone gate ----------
    let phoneValid = !!phone;
    if (phone && TW_SID && TW_TOKEN) {
      try {
        const url = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(phone)}`;
        const r = await fetch(url, {
          headers: { Authorization: "Basic " + btoa(`${TW_SID}:${TW_TOKEN}`) },
        });
        const j = await r.json();
        const valid = !!j?.valid;
        await admin.from("contact_field_sources").upsert({
          contact_id: contactId,
          user_id: userId,
          field_name: "phone_status",
          value: valid ? "valid" : "invalid",
          source: "twilio",
          confidence: 90,
          fetched_at: new Date().toISOString(),
          is_active: true,
        }, { onConflict: "contact_id,field_name,source" });
        if (!valid) {
          phoneValid = false;
          await admin.from("contact_field_sources")
            .update({ is_active: false })
            .eq("contact_id", contactId).eq("field_name", "phone").eq("value", phone);
        }
      } catch (_) { /* swallow */ }
    }

    // ---------- Pick highest-priority match key ----------
    const companyDomain = domainFromCompany(company);
    const city = location?.split(",")[0]?.trim() ?? null;
    const candidates: Array<{ key: string; params: Record<string, string> }> = [];
    if (emailValid && email) candidates.push({ key: `email:${email}`, params: { email } });
    if (linkedin) candidates.push({ key: `li:${linkedin}`, params: { profile: linkedin } });
    if (fullName && companyDomain) candidates.push({ key: `name+dom:${fullName}|${companyDomain}`, params: { name: fullName, company: companyDomain } });
    if (fullName && phoneValid && phone) candidates.push({ key: `name+phone:${fullName}|${phone}`, params: { name: fullName, phone } });
    if (fullName && city) candidates.push({ key: `name+city:${fullName}|${city}`, params: { name: fullName, locality: city } });

    if (candidates.length === 0 || !PDL_KEY) {
      return new Response(JSON.stringify({ status: "skipped", reason: "no_match_key", fields_added: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const chosen = candidates[0];
    const day = new Date().toISOString().slice(0, 10);
    const requestHash = await sha256(`pdl|${chosen.key}|${day}`);

    // Idempotency: skip if same request_hash already exists
    const { data: existing } = await admin
      .from("enrichment_jobs")
      .select("id, status")
      .eq("request_hash", requestHash)
      .limit(1);
    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({ status: "duplicate", job_id: existing[0].id, fields_added: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---------- Call PDL ----------
    const qs = new URLSearchParams(chosen.params).toString();
    const pdlUrl = `https://api.peopledatalabs.com/v5/person/enrich?${qs}&min_likelihood=4`;
    let pdlJson: any = null;
    let pdlStatus = "error";
    let httpStatus = 0;
    try {
      const r = await fetch(pdlUrl, { headers: { "X-Api-Key": PDL_KEY } });
      httpStatus = r.status;
      pdlJson = await r.json();
      pdlStatus = r.ok && pdlJson?.status === 200 ? "success" : (httpStatus === 404 ? "not_found" : "error");
    } catch (e) {
      pdlJson = { error: String(e) };
    }

    let fieldsAdded = 0;
    const person = pdlJson?.data ?? null;
    const likelihood: number = pdlJson?.likelihood ?? 0; // 0-10
    const conf = Math.max(0, Math.min(100, Math.round(likelihood * 10)));

    // Snapshot active company/title before write for change detection
    const beforeCompany = (resolved as any)?.company ?? null;
    const beforeTitle = (resolved as any)?.title ?? null;

    if (person && pdlStatus === "success") {
      const map: Record<string, any> = {
        full_name: person.full_name,
        first_name: person.first_name,
        last_name: person.last_name,
        title: person.job_title,
        company: person.job_company_name,
        email: person.work_email ?? (Array.isArray(person.emails) && person.emails[0]?.address) ?? null,
        phone: person.mobile_phone ?? (Array.isArray(person.phone_numbers) && person.phone_numbers[0]) ?? null,
        linkedin_url: person.linkedin_url,
        twitter_url: person.twitter_url,
        location: person.location_name,
        photo_url: person.profile_pic_url ?? null,
      };

      for (const [field, value] of Object.entries(map)) {
        if (!value || typeof value !== "string") continue;
        const { error: upErr } = await admin.from("contact_field_sources").upsert({
          contact_id: contactId,
          user_id: userId,
          field_name: field,
          value,
          source: "pdl",
          confidence: conf,
          fetched_at: new Date().toISOString(),
          is_active: false, // activation handled below
        }, { onConflict: "contact_id,field_name,source" });
        if (!upErr) {
          fieldsAdded++;
          fieldsToActivate.add(field);
        }
      }

      // Aliases: extra emails, phones, work history
      const aliasRows: any[] = [];
      for (const e of person.emails ?? []) {
        if (e?.address) aliasRows.push({ contact_id: contactId, user_id: userId, alias_type: "email", alias_value: e.address, source: "pdl" });
      }
      for (const p of person.phone_numbers ?? []) {
        if (typeof p === "string") aliasRows.push({ contact_id: contactId, user_id: userId, alias_type: "phone", alias_value: p, source: "pdl" });
      }
      for (const exp of person.experience ?? []) {
        const cn = exp?.company?.name;
        if (cn) aliasRows.push({ contact_id: contactId, user_id: userId, alias_type: "employer", alias_value: cn, source: "pdl" });
      }
      if (person.linkedin_url) aliasRows.push({ contact_id: contactId, user_id: userId, alias_type: "linkedin", alias_value: person.linkedin_url, source: "pdl" });
      if (aliasRows.length) {
        await admin.from("contact_aliases").upsert(aliasRows, { onConflict: "contact_id,alias_type,alias_value" });
      }

      // Store work_history + education as serialized JSON for graph derivation
      const workHistory = (person.experience ?? []).map((e: any) => ({
        company: e?.company?.name ?? null,
        title: e?.title?.name ?? null,
        start_year: e?.start_date ? Number(String(e.start_date).slice(0, 4)) : null,
        end_year: e?.end_date ? Number(String(e.end_date).slice(0, 4)) : (e?.is_primary ? new Date().getFullYear() : null),
      })).filter((e: any) => e.company);
      const education = (person.education ?? []).map((e: any) => ({
        school: e?.school?.name ?? null,
        start_year: e?.start_date ? Number(String(e.start_date).slice(0, 4)) : null,
        end_year: e?.end_date ? Number(String(e.end_date).slice(0, 4)) : null,
      })).filter((e: any) => e.school);

      for (const [field, arr] of [["work_history", workHistory], ["education", education]] as const) {
        if (arr.length === 0) continue;
        await admin.from("contact_field_sources").upsert({
          contact_id: contactId,
          user_id: userId,
          field_name: field,
          value: JSON.stringify(arr),
          source: "pdl",
          confidence: conf,
          fetched_at: new Date().toISOString(),
          is_active: true,
        }, { onConflict: "contact_id,field_name,source" });
      }

      // Fire-and-forget edge derivation for this user
      admin.functions.invoke("derive-edges", { body: { user_id: userId } }).catch(() => {});
    }

    // ---------- Job log ----------
    const { data: job, error: jobErr } = await admin.from("enrichment_jobs").insert({
      user_id: userId,
      contact_id: contactId,
      provider: "pdl",
      match_key: chosen.key,
      request_hash: requestHash,
      status: pdlStatus,
      raw_response: pdlJson,
      cost_cents: pdlStatus === "success" ? 10 : 0,
      completed_at: new Date().toISOString(),
      error_message: pdlStatus === "success" ? null : `http=${httpStatus}`,
    }).select("id").single();

    // ---------- Recompute activation per touched field ----------
    for (const f of fieldsToActivate) {
      await admin.rpc("recompute_field_activation", { p_contact_id: contactId, p_field_name: f });
    }

    // ---------- Diff company/title for job-change events ----------
    if (pdlStatus === "success") {
      const { data: afterRow } = await admin
        .from("contacts_resolved")
        .select("company, title")
        .eq("id", contactId)
        .maybeSingle();
      const afterCompany = afterRow?.company ?? null;
      const afterTitle = afterRow?.title ?? null;
      const events: any[] = [];
      const norm = (s: any) => (s ? String(s).trim().toLowerCase() : "");
      const companyChanged = beforeCompany && afterCompany && norm(beforeCompany) !== norm(afterCompany);
      const titleChanged = beforeTitle && afterTitle && norm(beforeTitle) !== norm(afterTitle);
      if (companyChanged && titleChanged) {
        events.push({ user_id: userId, contact_id: contactId, event_type: "job_change", before_value: `${beforeTitle} @ ${beforeCompany}`, after_value: `${afterTitle} @ ${afterCompany}` });
      } else if (companyChanged) {
        events.push({ user_id: userId, contact_id: contactId, event_type: "company_change", before_value: beforeCompany, after_value: afterCompany });
      } else if (titleChanged) {
        events.push({ user_id: userId, contact_id: contactId, event_type: "title_change", before_value: beforeTitle, after_value: afterTitle });
      }
      if (events.length) await admin.from("contact_events").insert(events);
    }

    return new Response(JSON.stringify({
      job_id: job?.id ?? null,
      status: pdlStatus,
      fields_added: fieldsAdded,
      job_error: jobErr?.message ?? null,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
