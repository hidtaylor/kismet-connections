import { supabase } from "./client";

export async function signedCardUrl(storage_path: string, expires = 60) {
  const { data } = await supabase.storage.from("card-images").createSignedUrl(storage_path, expires);
  return data?.signedUrl ?? null;
}

export async function signedContactPhotoUrl(storage_path: string, expires = 60 * 60) {
  const { data } = await supabase.storage.from("contact-photos").createSignedUrl(storage_path, expires);
  return data?.signedUrl ?? null;
}
