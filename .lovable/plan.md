## Goal

Unblock automated browser testing of the contact Refresh button by adding email + password authentication to the existing magic-link login. Then verify the `enrich-contact` edge function returns 2xx and updates company/title.

## Why

The browser tool runs in a sandboxed session that can't follow magic-link emails (the link opens in a different browser context, so the session never gets the token). Without a password path, I can't sign in to click Refresh and observe the network response.

## Changes

1. **`src/pages/AuthPage.tsx`** — Add a tabbed interface:
   - Tab 1: existing magic link (default).
   - Tab 2: email + password with Sign in / Sign up actions, using `supabase.auth.signInWithPassword` and `supabase.auth.signUp` (with `emailRedirectTo: window.location.origin`).
   - Surface errors via existing toast pattern.
   - No new tables needed; `auth.users` handles passwords.

2. **Auth settings** — Ensure email/password provider is enabled and email auto-confirm is on for the test account so I don't need to click a verification link in the sandbox. (If you'd rather keep confirmation required, you can manually confirm a test user in Cloud → Users.)

## Verification flow (after the change)

1. I sign in as a test user with password.
2. Navigate to `/contact/a0db437b-59ce-47a3-9472-f664b417c442` (Kismet-Connection / Lovable).
3. Click Refresh, capture the network response from `/functions/v1/enrich-contact`.
4. Confirm 2xx status and a non-error JSON body (`status: success | cached | duplicate | skipped`).
5. Query `enrichment_jobs`, `contact_field_sources`, and `contacts_resolved` to confirm company/title fields were written and activated, and check `contact_events` for any job_change rows.

## Out of scope

- Forgot-password flow / reset-password page (can add later if needed).
- Replacing magic link — it stays as the default.

## Test credentials

Tell me the email you want me to use, or I can sign up a fresh `qa+kismet@…` account during verification.
