import { supabase } from "@/integrations/supabase/client";

export type ContactWriteSource = "user" | "card_scan";

const PERSONAL_DOMAINS = new Set([
  "gmail.com", "outlook.com", "hotmail.com", "yahoo.com",
  "icloud.com", "me.com", "live.com", "aol.com", "proton.me", "protonmail.com",
]);

function normalizeCompanyName(name: string): string {
  return name
    .replace(/[,.]/g, " ")
    .replace(/\b(inc|incorporated|llc|l\.l\.c\.|ltd|limited|corp|corporation|co|gmbh|sa|ag|plc|pty)\b\.?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function domainFromEmail(email: string): string | null {
  const m = email.toLowerCase().match(/@([^>\s]+)$/);
  if (!m) return null;
  const d = m[1].trim();
  return PERSONAL_DOMAINS.has(d) ? null : d;
}

/** Find or create the user's company row. Prefer domain match; fall back to normalized name. */
async function resolveCompanyId(
  userId: string,
  companyName: string | null | undefined,
  email: string | null | undefined,
): Promise<string | null> {
  const domain = email ? domainFromEmail(email) : null;
  const trimmedName = companyName?.trim() || null;
  if (!domain && !trimmedName) return null;

  if (domain) {
    const { data: existing } = await supabase
      .from("companies").select("id").eq("user_id", userId).eq("domain", domain).maybeSingle();
    if (existing) return existing.id;
    // Insert by domain (use company name if provided, else domain root)
    const name = trimmedName ?? domain.replace(/^www\./, "").split(".")[0];
    const { data, error } = await supabase
      .from("companies").insert({ user_id: userId, name, domain })
      .select("id").maybeSingle();
    if (!error && data) return data.id;
  }

  if (trimmedName) {
    const norm = normalizeCompanyName(trimmedName).toLowerCase();
    if (!norm) return null;
    const { data: list } = await supabase
      .from("companies").select("id, name").eq("user_id", userId);
    const hit = (list ?? []).find((c) => normalizeCompanyName(c.name).toLowerCase() === norm);
    if (hit) return hit.id;
    const { data } = await supabase
      .from("companies").insert({ user_id: userId, name: trimmedName })
      .select("id").maybeSingle();
    return data?.id ?? null;
  }
  return null;
}

/**
 * Write contact fields through the provenance RPC.
 * Also links contact to a company row (matched by corporate email domain or normalized name).
 */
export async function writeContactFields(
  contactId: string,
  fields: Record<string, string | null | undefined>,
  source: ContactWriteSource = "user",
  confidence: number = source === "user" ? 100 : 80,
) {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v != null && v !== "") clean[k] = String(v);
  }
  if (Object.keys(clean).length === 0) return;

  const { error } = await supabase.rpc("update_contact_with_provenance", {
    p_contact_id: contactId,
    p_fields: clean,
    p_source: source,
    p_confidence: confidence,
  });
  if (error) throw error;

  // Link to a company if we touched company or email
  if (clean.company || clean.email) {
    try {
      const { data: u } = await supabase.auth.getUser();
      const userId = u.user?.id;
      if (!userId) return;
      const { data: contact } = await supabase
        .from("contacts").select("emails, company, company_id")
        .eq("id", contactId).maybeSingle();
      const emails = (contact?.emails as any[]) ?? [];
      const email = clean.email ?? emails[0] ?? null;
      const companyName = clean.company ?? contact?.company ?? null;
      const companyId = await resolveCompanyId(userId, companyName, email);
      if (companyId && companyId !== contact?.company_id) {
        await supabase.from("contacts").update({ company_id: companyId }).eq("id", contactId);
      }
    } catch {
      // best-effort linkage
    }
  }
}

export const PROVENANCE_FIELDS = [
  "full_name", "first_name", "last_name", "company", "title", "location",
  "linkedin_url", "twitter_url", "website_url", "photo_url", "email", "phone",
] as const;
export type ProvenanceField = (typeof PROVENANCE_FIELDS)[number];
