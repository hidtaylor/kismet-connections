# Simplify navigation, Apple-style

Replace the current 5-tab + radial FAB with a calmer, more discoverable shell. Every screen in the app becomes reachable in one tap from the bottom bar or the center [+] action sheet.

## New tab bar

```text
[ Home ]  [ Contacts ]  [  +  ]  [ Inbox ]  [ Settings ]
```

- **Home** (`/`) — unchanged dashboard, with a search field pinned at the top so Search is one tap away without using a tab slot.
- **Contacts** (`/contacts`) — new page. A segmented control at the top toggles between **People** (existing contacts list) and **Companies** (current `/organizations` content). `/organizations` keeps working and redirects here on the Companies tab.
- **[ + ]** — center button, raised slightly. Opens an Apple-style action sheet (see below).
- **Inbox** (`/inbox`) — merges Triggers + Memories. Two sub-tabs at the top: **Triggers** (default) and **Memories**. Single combined badge on the tab icon (sum of both counts, capped at 99+). Old `/triggers` and `/inbox/memories` URLs redirect into the new page with the right sub-tab selected.
- **Settings** (`/settings`) — gains a new "Import" section linking to Calendar review and Gmail import.

The active tab uses the primary color and a subtle scale; inactive tabs are muted. Labels stay under each icon (Apple Phone-style).

## Center [+] action sheet

Tapping [+] slides a bottom sheet up (shadcn `Sheet` from `bottom`) with a clean vertical list, large tap targets, dividers, and an icon per row:

```text
Add contact          →  /contact/new
Scan business card   →  /capture/scan
Voice note           →  /capture/voice
Record meeting       →  /capture/meeting
————————————————
Import from calendar →  /import/calendar
Import from Gmail    →  /import/gmail
```

Tapping any row navigates and dismisses the sheet. Tapping the backdrop or swiping down dismisses. The current radial fan-out animation and its FAB code are removed.

## Files touched

- `src/components/AppLayout.tsx` — rewrite tab bar (5 items above), replace radial FAB with `Sheet`-based action sheet, compute combined Inbox badge.
- `src/pages/InboxPage.tsx` — **new**. Hosts a segmented Triggers/Memories switcher; embeds the existing list components.
- `src/pages/ContactsPage.tsx` — **new**. People/Companies segmented control. People view extracts the contacts list currently rendered on `HomePage`; Companies view embeds `OrganizationsPage` content.
- `src/pages/HomePage.tsx` — add a top search input that navigates to `/search?q=…` on submit (or filters inline). Keep dashboard widgets; remove the contacts list section if it now lives under Contacts (or keep a "Recent" preview that links to Contacts).
- `src/pages/SettingsPage.tsx` — add an "Import" section with two rows linking to `/import/calendar` and `/import/gmail`.
- `src/App.tsx` — add routes: `/contacts`, `/inbox`. Add redirects: `/organizations` → `/contacts?tab=companies`, `/triggers` → `/inbox?tab=triggers`, `/inbox/memories` → `/inbox?tab=memories`, `/search` stays (still reachable from Home search field and deep links).

## Visual polish

- Bottom bar: `bg-card/85 backdrop-blur-md` (already there), thin top hairline, taller hit areas (44pt min), labels in 10–11px, active state in `text-primary` with a 2px top indicator dot.
- Center [+]: 56pt circle, `bg-gradient-kismet`, soft shadow, sits centered in the bar with a small notch of negative margin so it lifts above the bar.
- Action sheet: rounded-top-2xl, drag handle at top, 56pt rows, system-style separators, safe-area padding.

## Out of scope

- No data model changes.
- No changes to detail/edit pages.
- Search page itself is unchanged; it just loses its tab slot in favor of the Home search field.
