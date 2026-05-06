# Fix truncated timeline items on Contact detail

## Problem
On the Contact detail page (`/contact/:id`), items in the **Timeline** section are visually truncated:

- **Interaction summaries** are clamped to 3 lines (`line-clamp-3`), hiding the rest of meeting/call summaries.
- **Interaction titles** use `truncate` (single line, ellipsis), so long meeting titles get cut off.
- **Note bodies** render full text, but the timestamp column uses `shrink-0` while the note text wraps fine — no change needed there.

## Change
Edit `src/pages/ContactDetailPage.tsx` in the Timeline section only:

1. Remove `line-clamp-3` from the interaction `summary` paragraph so the full summary is visible.
2. Replace `truncate` on the interaction title with `break-words` (or remove `truncate`) so long titles wrap instead of getting cut.
3. Keep the timestamp on its own line / shrink-0 so the layout stays clean when titles wrap.

No business logic, no data, no other pages touched. Pure presentation tweak to make every timeline entry fully readable, matching the Apple-simple "show me everything I wrote" expectation.

## Files
- `src/pages/ContactDetailPage.tsx` (Timeline render block only)
