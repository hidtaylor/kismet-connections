## Problem

The auto-capture is firing on empty/blurry frames. Current thresholds are too lax, there's no warm-up period (camera's autoexposure/autofocus need ~1s to settle), no motion check, and edge density is computed over the whole frame so a high-contrast background (hand, edge of desk) can satisfy it without the card actually being in view.

## Fix (single file: `src/pages/ScanCardPage.tsx`)

Tighten the auto-capture detector and add stability gating.

### Stricter thresholds
- `SHARPNESS_MIN`: 120 → **250** (Laplacian variance).
- `EDGE_DENSITY_MIN`: 0.04 → **0.07**.
- `PASSES_REQUIRED`: 3 → **8** consecutive frames (~500–800ms of sustained quality).
- `LUMA_MIN/MAX`: 60 / 215.

### New gates
1. **Warm-up**: ignore frames for the first **1500ms** after camera starts (autoexposure/autofocus settling). Hint: "Adjusting camera…".
2. **Luma standard deviation ≥ 18**: rejects blank/near-uniform frames (lens cap, white wall, ceiling). Hint: "Point at a card…".
3. **Quadrant edge coverage**: split the analysis crop into 4 quadrants; each must have edge density ≥ **0.03**. This guarantees the card fills the framed area instead of one corner. Hint: "Center the card in the frame…".
4. **Motion check**: keep previous grayscale buffer; compute mean absolute difference vs current. Require **≤ 12** (out of 255) — i.e. camera is steady. Hint: "Hold steady…".
5. **Reset passes counter** whenever any gate fails, so partial progress doesn't accumulate across unrelated good frames.

### Hint priority (most informative wins)
warm-up → lighting → uniform/blank → framing (quadrants) → motion → sharpness → "Hold steady… (capturing)".

### Cooldown
Once auto-capture fires, the loop already stops via `capturedRef`. No change there.

## Verification

- Pointing the phone at the ceiling, a hand, or a blank wall: hint cycles through "Point at a card…" / "Center the card…" — no capture fires.
- Moving the phone around a card: hint stays "Hold steady…", no capture.
- Holding a card flat & steady within the frame for ~0.7s after the camera settles: capture fires once and pipeline runs.
- "Capture now" button still forces an immediate snap.
