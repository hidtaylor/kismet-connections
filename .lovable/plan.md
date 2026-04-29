## Problem

The app shows a blank white page because `src/integrations/supabase/client.ts` calls `createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, …)` with both values `undefined`. That throws synchronously at module import time, before React can render, so `#root` stays empty.

Root cause: in an earlier Phase 1.5 step we deleted `.env` (it was committed to a public repo). `.env` is auto-managed by Lovable Cloud and must exist locally — deleting it in the sandbox starves the Vite build of the env vars it injects at `import.meta.env.VITE_SUPABASE_*`.

## Fix

1. **Recreate `.env`** at the project root with the three Lovable Cloud variables this project expects:
   - `VITE_SUPABASE_URL` → `https://vdshiynolrrqmjkwbexl.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` → current anon key from Lovable Cloud config
   - `VITE_SUPABASE_PROJECT_ID` → `vdshiynolrrqmjkwbexl`

   Lovable manages this file automatically — restoring it in the sandbox unblocks Vite. Because `.env` is now in `.gitignore` (added in Phase 1.5), the secret will not be committed.

2. **Verify `.gitignore`** still contains `.env` (it does — confirmed in current file). No change needed there.

3. **Restart the Vite dev server** so the new env vars are picked up (Vite only reads `.env` at startup).

4. **Smoke test**: load `/`, confirm the auth screen renders (since you're not signed in), check console for no `Invalid URL`/Supabase init errors.

## What we are NOT doing

- Not rotating the anon key here — that's a separate manual step you do in the Supabase dashboard (already noted in the Phase 1.6 prompt). Restoring `.env` uses whatever key is currently active.
- Not modifying `client.ts`, schema, RLS, or any feature code. The app code is fine; only the env file is missing.
- Not adding a defensive check inside `client.ts` — that file is auto-generated and must not be edited.

## Acceptance

- Preview loads the Kismet auth screen instead of a white page.
- No `TypeError`/`Invalid URL` in console on boot.
- `.env` is present locally and ignored by git.
