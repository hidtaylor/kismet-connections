# Fix: tapping the + FAB does nothing

## Root cause

In `src/components/AppLayout.tsx` the floating action button and its radial menu live inside one full-screen overlay container:

```tsx
<div className={cn(
  "pointer-events-none fixed inset-0 z-50",
  fabOpen ? "pointer-events-auto" : ""
)}>
  ...backdrop...
  ...radial actions...
  <button onClick={() => setFabOpen(v => !v)}>+</button>
</div>
```

While the menu is closed, the container has `pointer-events-none`, and nothing inside it re-enables pointer events. That means the **+** button itself can never receive the click that would open the menu — so nothing happens when the user taps it.

The "Add contact" action (and Scan card, Voice note, Record meeting) are only reachable through this FAB, so the entire quick-add flow is currently broken.

## Fix

Make the overlay container always ignore pointer events, and explicitly re-enable them on the elements that need to be clickable:

- Backdrop: `pointer-events-auto` only when `fabOpen` is true (so it doesn't block the page when closed).
- Radial action buttons: already only interactive when `fabOpen` is true via existing `pointer-events-none` class — add `pointer-events-auto` when open.
- Main + button: always `pointer-events-auto` so the first tap is received.

Concretely in `src/components/AppLayout.tsx`:

1. Replace the conditional class on the outer wrapper with a constant `pointer-events-none fixed inset-0 z-50` (drop the `cn(... fabOpen ? "pointer-events-auto" : "")`).
2. Add `pointer-events-auto` to the backdrop's class list (it's already gated behind `fabOpen` via opacity; combine with conditional `pointer-events-auto` when open).
3. Add `pointer-events-auto` to the radial action buttons' open-state classes.
4. Add `pointer-events-auto` to the main FAB button's class list unconditionally.

No other files need to change. The FAB animation, radial layout, badges, and routes are all unaffected.

## Verification

After the change, on the Home screen:
- Tapping **+** opens the radial menu (icons fan out, backdrop blurs).
- Tapping **Add contact** navigates to `/contact/new`.
- Tapping the backdrop or pressing Escape closes the menu.
- When the menu is closed, the page underneath remains scrollable and clickable (no invisible overlay blocking taps).
