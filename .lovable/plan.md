# Improve Scan a Card flow

Add a clear multi-step progress indicator and a dedicated retry control when something goes wrong, so users always know what's happening and can recover without starting over.

## What changes (user-facing)

When the user taps **Read card**, the action buttons are replaced by a compact stepper showing three stages:

```text
[●] Uploading  ──  [○] Parsing  ──  [○] Ready to review
```

- The active step pulses; completed steps show a check; pending steps are muted.
- A thin progress bar under the stepper animates during each stage.
- On success, the user is auto-navigated to the prefill form (existing behavior) right after "Ready to review" briefly flashes.
- On failure at any step:
  - The stepper marks the failing step with an error state (red dot + label like "Upload failed" / "Parsing failed").
  - A short, human error message appears beneath (mapped from the edge function's known errors: rate limited, AI credits exhausted, forbidden path, generic).
  - Two buttons appear: **Retry** (re-runs only from the failed step — re-upload if upload failed, re-invoke `scan-card` if parsing failed) and **Retake photo** (returns to capture).
  - The previously captured snapshot is preserved so Retry doesn't force re-capture.

The capture/preview area, header, and existing "Retake / Read card" buttons (pre-process state) are unchanged.

## Files touched

- `src/pages/ScanCardPage.tsx` — only file edited.
  - Replace the single `parsing` boolean with a `status` state machine: `idle | uploading | parsing | done | error`.
  - Track `errorStep: "upload" | "parse" | null` and `errorMessage: string | null`.
  - Track the uploaded `storage_path` separately so a parse-stage retry skips re-upload.
  - Split `process()` into `doUpload()` and `doParse()`; `process()` calls them in sequence; `retry()` resumes from the failed stage.
  - Add small presentational subcomponents in the same file: `<Stepper />` and `<StepDot />` using existing Tailwind tokens (`bg-primary`, `bg-muted`, `text-destructive`, `bg-gradient-kismet`). Use `lucide-react` icons already in the project (`Check`, `Loader2`, `AlertCircle`).
  - Use the existing `Progress` component (`@/components/ui/progress`) for the thin animated bar; drive it with an indeterminate-style value (e.g., oscillating via `setInterval`) since real upload progress isn't exposed by `supabase.storage.upload`.

## Technical notes

- No backend / edge function / schema changes. The `scan-card` function and `card-images` bucket usage stay identical.
- Error mapping: read `error.message` from `supabase.functions.invoke` and from storage upload; show as-is when present, otherwise a generic fallback.
- Cleanup: clear the progress interval on unmount and on status transitions to avoid leaks.
- Accessibility: stepper container gets `role="status"` and `aria-live="polite"` so screen readers announce stage changes. Each step has an `aria-current="step"` when active.
- No new dependencies.

## Out of scope

- Real upload byte-progress (Supabase JS doesn't expose it for `upload()`).
- Changes to the prefill / contact-edit screen.
- Persisting partial scans across navigation.
