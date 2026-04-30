## What's actually broken

After your "Recompute now" click, the database shows:
- `sync_state.graph_strength` is stamped (so the edge function ran end-to-end without erroring)
- All 1072 `met_with` edges have a fresh `updated_at` (so the UPDATE statement physically ran)
- But every `strength_score` is still **0**

Running the scoring CTE manually as the postgres role produces 1072 pairs with raw scores from ~16 to ~98 — so the math works. The scores only collapse to 0 when the function runs through PostgREST under your auth context. The combination "UPDATE ran + scores are 0" points at the inner SUM expression evaluating to 0 (or NULL coerced to 0) inside the RPC's actual execution context, even though it doesn't outside it. Most likely culprit: the `CASE i.type WHEN 'in_person' THEN 10 ...` branch isn't matching the enum values the way we expect when the function runs as `SECURITY INVOKER` with the search_path pinned, so every row falls through to the `ELSE 1` branch and gets multiplied by a tiny time-decay factor — which then rounds to 0 after dividing by `max_score.m`.

Separately, none of your 3 contacts that have a `company` text value have an `organization_id` set, so no `works_at` edges exist and the org rollup has nothing to score.

## Plan

### 1. Rewrite `recompute_graph_strength` to be debuggable and correct

Replace the function with a version that:
- Casts the enum explicitly: `CASE i.type::text WHEN 'in_person' THEN 10 ...`
- Adds a small floor to the time-decay factor so very old interactions don't underflow to ~0
- Uses `COALESCE(SUM(...), 0)` and skips the divide-by-max if max is 0
- Returns diagnostic counts: pairs computed, pairs matched to edges, max raw score, min/max final score
- Keeps `SECURITY INVOKER` and the `auth.uid() = p_user_id` guard (no security regression)

The edge function will surface those diagnostics in the toast so we can immediately see whether it's a math problem or a join problem the next time it runs.

### 2. Backfill `contacts.organization_id` from the `company` text field

One-shot SQL migration that, for every contact with a non-empty `company` and a NULL `organization_id`:
- Finds an existing `organizations` row for the same `user_id` with a case-insensitive name match, OR
- Creates a new `organizations` row (kind `'other'`)
- Sets `contacts.organization_id` to that row's id

The existing `populate_works_at_edge` trigger will then automatically create `works_at` edges for those 3 contacts. The next recompute will give those orgs real scores.

### 3. Surface scoring diagnostics in the UI

Update the "Recompute now" toast to show:
`Scored N person edges (max raw X.X), M org edges, P pairs computed`

So if scores ever come back at 0 again, we'll know exactly which stage failed without having to query the DB.

### 4. Verify

After applying, click "Recompute now" once. Expected:
- Toast shows non-zero "max raw" and a non-zero person edge count
- Top Connections list in Settings shows scores in the 10–100 range, not 0
- 3 new `works_at` edges exist (one per contact with a company string), each with a real score

## Technical notes

- All changes are SECURITY INVOKER and respect existing RLS — no new linter warnings.
- The org backfill is idempotent (guarded by `WHERE organization_id IS NULL` and case-insensitive name match), so re-running it is safe.
- No new tables, no new edge functions, no schema changes beyond the function body and a one-time data backfill.
- Files touched: one new migration (function + backfill), `supabase/functions/recompute-graph-strength/index.ts` (return diagnostics), `src/pages/SettingsPage.tsx` (richer toast).