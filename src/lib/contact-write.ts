import { supabase } from "@/integrations/supabase/client";

export type ContactWriteSource = "user" | "card_scan";

/**
 * Write contact fields through the provenance RPC.
 * Also links contact to matching organization + company rows (via the
 * `ensure_org_and_company` RPC, matched by corporate email domain or
 * normalized name). The DB trigger covers most cases, but we also call it
 * here so the linkage is immediate even when only field-source rows change.
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

  // Link to organization + company if we touched company or email
  if (clean.company || clean.email) {
    try {
      const { data: u } = await supabase.auth.getUser();
      const userId = u.user?.id;
      if (!userId) return;
      const { data: contact } = await supabase
        .from("contacts").select("emails, company, company_id, organization_id")
        .eq("id", contactId).maybeSingle();
      const emails = (contact?.emails as any[]) ?? [];
      const email = clean.email ?? emails[0] ?? null;
      const companyName = clean.company ?? contact?.company ?? null;
      if (!companyName && !email) return;
      const { data: linked } = await supabase.rpc("ensure_org_and_company", {
        p_user_id: userId,
        p_name: companyName,
        p_email: email,
      });
      const row = Array.isArray(linked) ? linked[0] : linked;
      const patch: { organization_id?: string; company_id?: string } = {};
      if (row?.organization_id && row.organization_id !== contact?.organization_id) {
        patch.organization_id = row.organization_id;
      }
      if (row?.company_id && row.company_id !== contact?.company_id) {
        patch.company_id = row.company_id;
      }
      if (patch.organization_id || patch.company_id) {
        await supabase.from("contacts").update(patch).eq("id", contactId);
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
