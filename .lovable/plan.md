# Fix: "Open camera" button shows no preview

## Root cause

In `src/pages/ScanCardPage.tsx`, the `<video>` element is only rendered when `streaming === true`:

```tsx
{snapshot ? (...) : streaming ? (
  <video ref={videoRef} ... />
) : (...)}
```

But `startCamera()` tries to attach the MediaStream to `videoRef.current` **before** flipping `streaming` to true:

```ts
const s = await navigator.mediaDevices.getUserMedia({...});
streamRef.current = s;
if (videoRef.current) {           // <-- null, video isn't mounted yet
  videoRef.current.srcObject = s;
  await videoRef.current.play();
}
setStreaming(true);               // video mounts only now
```

Because `videoRef.current` is `null` at that moment, the stream is never bound to the element. After `setStreaming(true)` the `<video>` mounts empty — hence "no preview".

## Fix

In `src/pages/ScanCardPage.tsx`:

1. In `startCamera()`, request the stream, store it in `streamRef`, then immediately call `setStreaming(true)` (drop the inline assignment to `videoRef.current.srcObject`).
2. Add a `useEffect` keyed on `streaming` that, when `streaming` becomes true and both `videoRef.current` and `streamRef.current` exist, sets `videoRef.current.srcObject = streamRef.current` and calls `.play()` (catching the AbortError silently).

This guarantees the stream is attached after React mounts the `<video>` element. `getUserMedia` is still invoked synchronously inside the click handler, preserving the user-gesture chain.

No other files need to change.

## Verification

- Tap **+ → Scan card → Open camera**: browser prompts for camera permission, then the live camera preview renders inside the framed area.
- Tap **Capture**: snapshot replaces the live feed; tracks are stopped.
- Navigating away (or unmounting) still stops all tracks.
