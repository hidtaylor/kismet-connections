## Why companies are missing

The Companies tab reads from `organizations` (6 rows). But of your 181 contacts:
- Only **8** have `organization_id` set
- **169** carry company info as free text on `contacts.company` (~80 distinct names)

There are also two parallel tables that have drifted apart:
- `organizations` (6) — what the Companies tab shows, what `OrgTypeahead` writes
- `companies` (2) — what `contact-write.ts` upserts when you save a contact, and what news/Triggers/CompanyCard read

So most contacts never produced a row in either table that the tab queries.

## The fix

1. **One-time backfill** — for every distinct `contacts.company` (case/punctuation-normalized) without an `organization_id`, create an `organizations` row, mirror it to `companies` (matched by domain when an email gives one), and set `contacts.organization_id` + `contacts.company_id`.
2. **Auto-link going forward** — when a contact is saved with a company name (or corporate email domain), upsert into both `organizations` and `companies` and link both ids on the contact.
3. **Mirror them** — keep `organizations` and `companies` in sync by domain (preferred) or normalized name, so the Companies tab, news, and Triggers all see the same set.

## Plan

### 1. Migration: backfill + sync trigger

A SQL migration that:
- Adds a `domain` column to `organizations` (nullable) so we can match orgs↔companies reliably.
- Adds a Postgres function `ensure_org_and_company(user_id, name, email)` that:
  - Normalizes the name, derives a non-personal email domain.
  - Finds-or-inserts an `organizations` row (by domain, then by normalized name).
  - Finds-or-inserts a matching `companies` row the same way.
  - Returns `(organization_id, company_id)`.
- Backfills:
  - For each contact with `company` set but no `organization_id`/`company_id`, calls the function and updates the contact.
  - For each existing `organizations` row, ensures a matching `companies` row exists, and vice versa.
- Adds a trigger on `contacts` (AFTER INSERT OR UPDATE OF company, emails, organization_id) that calls `ensure_org_and_company` and fills missing `organization_id`/`company_id`. (User-set values are preserved.)

### 2. Update `src/lib/contact-write.ts`

Replace the `companies`-only `resolveCompanyId` with a single call to the new RPC `ensure_org_and_company`. Update both `organization_id` and `company_id` on the contact in one write. Fewer round-trips and guarantees the Companies tab sees every company you add.

### 3. Update `OrganizationsPage`

- Add a tiny "Companies" empty-state nudge if none exist.
- No query changes needed — once backfill runs, the existing query returns everything.

### Files to touch

- `supabase/migrations/...` (new) — schema + backfill + trigger + RPC
- `src/lib/contact-write.ts` — call new RPC, set both ids
- `src/pages/OrganizationsPage.tsx` — minor copy tweak (optional)

### Out of scope

- Merging duplicate-but-differently-spelled company names beyond the existing normalization (strips Inc/LLC/Corp/etc.). Manual merge UI can come later if needed.
- Changing the Companies tab's visual design.
