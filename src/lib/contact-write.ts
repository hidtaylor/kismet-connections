import { supabase } from "@/integrations/supabase/client";

export type ContactWriteSource = "user" | "card_scan";

/**
 * Write contact fields through the provenance RPC.
 * Each field is recorded in contact_field_sources tagged with `source` + confidence,
 * and the canonical contacts row is updated atomically.
 */
export async function writeContactFields(
  contactId: string,
  fields: Record<string, string | null | undefined>,
  source: ContactWriteSource = "user",
  confidence: number = source === "user" ? 100 : 80,
) {
  // Strip undefined; keep nulls/empties out (RPC ignores empty values).
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
}

/** Fields tracked by provenance, in display/edit order. */
export const PROVENANCE_FIELDS = [
  "full_name",
  "first_name",
  "last_name",
  "company",
  "title",
  "location",
  "linkedin_url",
  "twitter_url",
  "website_url",
  "photo_url",
  "email",
  "phone",
] as const;
export type ProvenanceField = (typeof PROVENANCE_FIELDS)[number];
