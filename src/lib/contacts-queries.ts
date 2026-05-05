/**
 * Consolidated contact query layer.
 *
 * READS FROM `contacts_resolved` VIEW (provenance-resolved values):
 *  - getRecentContacts        — home recents
 *  - getOverdueContacts       — home overdue/cadence list
 *  - getContactById           — contact detail page
 *  - getContactsByOrg         — organization detail page
 *  - getContactPickerList     — voice/recording contact pickers
 *
 * READS FROM `contacts` TABLE DIRECTLY (search uses ILIKE on base columns —
 * the view wraps each field in COALESCE(get_active_contact_value(...), col)
 * which Postgres cannot use indexes against, so search must hit the table):
 *  - searchContacts
 *
 * WRITES always go through `writeContactFields` (src/lib/contact-write.ts),
 * which calls the `update_contact_with_provenance` RPC so every change is
 * tagged with its source.
 */
import { supabase } from "@/integrations/supabase/client";

const LIST_COLS = "id, full_name, company, title, photo_url, last_contact_at, cadence";

export async function getRecentContacts(limit = 20) {
  const { data, error } = await supabase
    .from("contacts_resolved")
    .select(LIST_COLS)
    .order("last_contact_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getOverdueContacts(limit = 50) {
  const { data, error } = await supabase
    .from("contacts_resolved")
    .select(LIST_COLS)
    .neq("cadence", "none")
    .order("last_contact_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getContactById(id: string) {
  const { data, error } = await supabase
    .from("contacts_resolved")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getContactsByOrg(organizationId: string) {
  const { data, error } = await supabase
    .from("contacts_resolved")
    .select("id, full_name, title, photo_url")
    .eq("organization_id", organizationId)
    .order("full_name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getContactPickerList(limit = 30) {
  const { data, error } = await supabase
    .from("contacts_resolved")
    .select("id, full_name, company")
    .order("full_name")
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/** Search hits base table to leverage ILIKE on real columns. */
export async function searchContacts(query: string, limit = 20) {
  const { data, error } = await supabase
    .from("contacts")
    .select(LIST_COLS)
    .or(`full_name.ilike.%${query}%,company.ilike.%${query}%,title.ilike.%${query}%`)
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
