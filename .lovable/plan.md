## Goal

Turn "Scan card" into a one-tap flow: tap **Scan card** → camera opens → app auto-captures the card the moment the image is sharp and well-framed → upload + parse run automatically → user lands on the prefilled contact edit page. No Capture / Read card buttons to press.

## Behavior changes

1. **Camera opens immediately** when `/scan` mounts (no "Open camera" button). The browser's camera permission prompt only appears the first time; on subsequent visits browsers remember the grant for the origin, so there's no extra click for the user after the first allow.
2. **Auto-capture loop** runs on every video frame (via `requestVideoFrameCallback`, fallback `requestAnimationFrame`):
   - Compute a **sharpness score** (variance of Laplacian on a downscaled grayscale center crop ~ 320px wide).
   - Compute a **brightness score** (mean luminance of same crop) to reject too-dark frames.
   - Require the card to fill enough of the frame: check that the center crop has sufficient edge density (sum of |gradient| above threshold).
   - When sharpness ≥ threshold AND brightness in range AND edge-density ≥ threshold for **3 consecutive frames within ~500ms**, snap.
   - A small on-screen hint shows live state: "Looking for card…" → "Hold steady…" → flash + "Captured".
3. **After capture**, immediately run the existing `runFrom("upload")` pipeline (upload → parse → navigate to `/contact/new?prefill=…`). The existing stepper UI continues to show progress.
4. **Manual fallback**: keep a small "Capture now" button visible in case auto-capture struggles (low light, glossy card). Also keep "Upload" (file picker) and "Retake".
5. **Permission denied / no camera**: show the existing toast and reveal an "Open camera" retry button + the file Upload control.
6. **Lifecycle**: stop tracks on unmount, on successful capture, and when the document is hidden (`visibilitychange`) to avoid the camera staying on in the background.

## Files to change

- `src/pages/ScanCardPage.tsx` — only file touched.
  - Auto-start camera in a `useEffect` on mount (guarded so StrictMode double-invoke doesn't double-request).
  - Add `useAutoCapture` logic inside the component (no new file needed): a `useEffect` that, while `streaming && !snapshot && status === "idle"`, runs the per-frame quality check on a hidden `<canvas>` and calls `snap()` when criteria are met for N consecutive frames.
  - After `snap()` sets `snapshotBlob`, immediately call `runFrom("upload")` (chain via a `useEffect` watching `snapshotBlob && status === "idle" && autoMode`).
  - Replace the initial "Open camera / Upload" button row with: live preview + small overlay hint + "Capture now" + "Upload" + "Retake (after snapshot)".
  - Add `visibilitychange` listener to stop camera when tab hidden; restart on visible if still on the page and not yet captured.

## Quality thresholds (technical)

- Downscale center crop to 320×214 grayscale on an offscreen canvas.
- **Laplacian variance ≥ ~120** (tunable) → "sharp".
- **Mean luminance between 50 and 220** (0–255) → acceptable lighting.
- **Edge-density ratio ≥ 0.04** of pixels with |Δ| > 25 → card actually present in the framed area.
- Need 3 consecutive passing frames (~250–500ms) before triggering capture, to avoid snapping on a blurry pan.
- Cooldown: once auto-capture fires, the loop stops until user retakes.

## Out of scope

- Persisting camera permission across browser sessions is controlled by the browser; we cannot bypass the first-time OS/browser permission prompt. We minimize re-prompts by relying on the standard "Remember this decision" behavior and by not closing/reopening the stream within a session.
- No model-based card-edge detection (keeping it light and dependency-free).

## Verification

- First visit to `/scan`: browser asks for camera once → preview appears → holding a card steady triggers auto-capture within ~1s → stepper runs upload/parse → app navigates to the contact edit page with prefilled fields.
- Subsequent visits in the same browser: no extra prompt; camera opens immediately.
- Low light or blurry: hint stays "Hold steady…", no false captures; user can tap "Capture now" to force.
- Permission denied: toast shown, Upload still works.
