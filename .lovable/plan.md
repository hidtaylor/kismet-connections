# Fix missing card-scan contacts and broken Gmail-imported contacts

## Root causes (from inspecting the data)

- **Card scans (29 parsed, 0 became contacts):** `scan-card` only stores the parsed JSON. Creating the contact requires the user to navigate to `/contact/new?prefill=…` and hit Save. Anyone who closed the app or backed out lost the scan.
- **Gmail-imported contacts:**
  - `gmail-import-contact` writes emails as `[{label, email}]` objects, but every other place in the app (UI, list rows, edit page) expects plain `string[]` (e.g. `["james@bhr.fyi"]`). So `mailto:${emails[0]}` renders blank/garbage.
  - The function inserts contacts directly (not via `update_contact_with_provenance`), so no `contact_field_sources` rows are created.
  - `company` is `NULL` for all 17 recent imports because we never fall back to deriving it from the sender's email domain.

## Changes

### 1. `supabase/functions/scan-card/index.ts`
After parsing, immediately create or merge a contact:
- Match an existing contact by any extracted email (case-insensitive, handles both string and object email shapes).
- Otherwise insert a new contact with `source = 'card_scan'`, storing emails/phones as plain `string[]` (canonical shape).
- Call `update_contact_with_provenance` for tracked fields (full_name, first/last, company, title, location, linkedin_url, website_url, primary email, primary phone) with source `card_scan`, confidence 80.
- Set `card_scans.contact_id` to the resulting id.
- Return `{ parsed, contact_id }`.

### 2. `src/pages/ScanCardPage.tsx`
- Use the returned `contact_id` and navigate to `/contact/{id}` (or `/contact/{id}/edit` if any expected field is missing) instead of `/contact/new?prefill=…`. The prefill flow stays as a fallback if no id was returned.

### 3. `supabase/functions/gmail-import-contact/index.ts`
- Store emails as `string[]` (drop the `{label, email}` object shape) to match the rest of the app.
- When matching existing contacts, support both string and object email shapes.
- Derive `company` from the sender's email domain when the AI didn't extract one. Skip personal domains (gmail/outlook/yahoo/icloud/hotmail/aol/proton/me/live). Title-case the root label (e.g. `primestreet.io` → `Primestreet`).
- Switch the create/merge to also call `update_contact_with_provenance` with source `email`, confidence 70, so `contact_field_sources` is populated for company/title/email/etc.
- Keep the interaction + note + linkage logic as-is.

### 4. One-time data back-fill (insert/update SQL)
- For each `card_scans` row with `contact_id IS NULL` and a usable `parsed_json.full_name` or `parsed_json.emails[0]`:
  - Try to merge by email; otherwise insert a new contact (canonical string[] shape).
  - Update `card_scans.contact_id`.
  - Best-effort: write provenance via the RPC for `full_name`, `company`, `title`, `email`, `phone`.
- For every existing contact whose `emails`/`phones` JSONB contains object entries, normalize them in place to plain strings so the UI works.
- Back-fill `company` for email-sourced contacts from their email domain (skipping personal domains).

### 5. Verification (after deploy)
- `psql` check: `card_scans` has zero rows with `contact_id IS NULL` and a parsed name/email.
- `psql` check: no contact's `emails`/`phones` JSONB contains object entries.
- `curl` `scan-card` with a test image (or just confirm via UI scan) and confirm a contact gets created and the redirect lands on the contact's detail page.
- Open one back-filled email-sourced contact (e.g. Brent / `@primestreet.io`) and confirm `company = Primestreet` and the Email quick-action `mailto:` opens the correct address.

### Files touched
- `supabase/functions/scan-card/index.ts`
- `supabase/functions/gmail-import-contact/index.ts`
- `src/pages/ScanCardPage.tsx`
- One-time data migration (insert/update; no schema changes)

No DB schema changes, no new secrets.
