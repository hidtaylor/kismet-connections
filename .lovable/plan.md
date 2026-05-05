## Goal

After the first auto-capture, give the user the option to scan the **back of the card**, then send **both images** to the parser so fields from either side end up in the prefilled contact.

## Flow

1. Tap **Scan card** → camera opens, auto-captures **front** (current behavior).
2. New screen state: "Front captured" — show the front thumbnail and two buttons:
   - **Add back side** → re-opens camera, auto-captures a 2nd image (back).
   - **Skip — use front only** → runs parse with just the front (current behavior).
3. After back is captured (or skipped), upload all images and call `scan-card` with both, then navigate to `/contact/new?prefill=…` as today.
4. "Retake" buttons let the user redo either side individually before parsing.

## UI changes (`src/pages/ScanCardPage.tsx`)

- Replace single `snapshot/snapshotBlob` with `frontBlob/frontUrl` and `backBlob/backUrl` state.
- After auto-capture sets the front, **do not** auto-run the pipeline. Instead show a "Front captured" review card with thumbnail + the two buttons above.
- "Add back side" resets `capturedRef`, restarts the camera, and the same auto-capture loop fires for the back. When the back is captured, immediately run the pipeline with both blobs.
- "Skip" runs the pipeline with only the front.
- Retake-front / retake-back buttons clear the respective blob and restart the camera for that side.
- Stepper / progress UI is unchanged; "Uploading" step now uploads 1 or 2 images sequentially.

## Edge function changes (`supabase/functions/scan-card/index.ts`)

- Accept either `storage_path: string` (back-compat) or `storage_paths: string[]` (1 or 2 entries, validated, each must start with `${user.id}/`).
- Download all provided images, base64 each, and send them as multiple `image_url` content parts in the **same** Gemini message.
- Update the prompt to: "These images are the front and back of the same business card. Merge information from both sides into a single contact. Prefer non-empty fields; deduplicate emails/phones; concatenate raw_text with a `--- BACK ---` separator."
- Persist a single `card_scans` row using the **first** image's storage path in `image_url` (column is non-null text); store all paths in `ocr_json.storage_paths` for traceability and the merged parsed JSON in `parsed_json`.
- Return `{ parsed }` exactly as today so the client navigation logic stays the same.

## Verification

- Scan front only → "Skip" → parse runs as before, prefill page is correct.
- Scan front → "Add back side" → camera re-opens, auto-captures back → parse runs with both → prefill page includes fields that only appear on the back (e.g. address, secondary email).
- Retake front before adding back: replaces front blob, no extra upload.
- Old clients sending `storage_path` (single) keep working.

## Out of scope

- No more than 2 sides.
- No client-side OCR/merge — merging is done by the model in one call (cheaper and more accurate than two calls + manual reconcile).
