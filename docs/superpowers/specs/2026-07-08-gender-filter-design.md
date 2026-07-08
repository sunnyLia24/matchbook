# Gender filter — design

**Date:** 2026-07-08
**Status:** Approved

## Goal

Lia wants to find her guy friends and girl friends easily in the Matchbook mobile app — on the roster list and in party mode. Gender is a private organizing field for the wingperson; it never appears on the public profile matches see.

## Decisions made

- **Where:** roster list + party-mode deck (filter carries from roster into deck).
- **Options:** `guy` / `girl` / `nonbinary`, optional (nullable). Existing friends without it set still appear under All.
- **Visibility:** private — excluded from `get_profile()`, so the public web profile is unchanged.
- **Approach:** filter chips on the roster; party mode deals the currently filtered set. (Grouped sections and free-text tags were considered and rejected as more machinery than the ask.)

## Data model

New migration `backend/migrations/008_gender.sql`:

```sql
alter table public.friends
  add column if not exists gender text
  check (gender in ('guy', 'girl', 'nonbinary'));
```

- Nullable, no default. No change to `get_profile()` — gender stays private.
- `app/src/types.ts`: `Friend` gains `gender: 'guy' | 'girl' | 'nonbinary' | null`.

## Friend editor (`app/app/friend/[id].tsx`)

- New "Gender" row directly after the Age/City row, using the existing chip pattern from the Status row (`s.chip` / `s.chipOn`).
- Chips: `guy` / `girl` / `nonbinary`. Tap to select; tap the selected chip again to unset (back to null).
- Optional — save works with it unset. Included in the `row` object on save (`gender: f.gender ?? null`).

## Roster (`app/app/(tabs)/index.tsx`)

- Chip row pinned above the list: **All · Guys · Girls**, plus **Enby** only when at least one friend has `gender = 'nonbinary'`.
- Filtering is client-side over the already-loaded `friends` array. Friends with `gender = null` appear only under All.
- Filter state is component-local (`useState`), defaults to All, resets when the screen remounts.
- Empty filtered list shows a filter-aware empty state (e.g. "No girls on your roster yet 💔"). The existing "Add your first single friend 💘" empty state stays for a truly empty roster.

## Party mode (`app/app/deck.tsx`)

- Roster passes the active filter as a route param: `/deck?gender=girl` (omitted for All).
- Deck adds `.eq('gender', param)` to its existing single+consented query when the param is present. All = current behavior, unchanged.
- The Party mode button on the roster reflects the active filter: "🎉 Party mode · girls" (plain "🎉 Party mode" for All).
- Deck's existing empty state stays as-is.

## Error handling

- No new failure modes: filtering is client-side; the deck query change is a single extra `.eq`. Save errors surface via the existing `Alert.alert('Save failed', …)` path.

## Testing

Manual (the app has no test suite):

1. Migration applies cleanly; existing friends load with `gender = null`.
2. Set gender on a friend, save, reopen — persists; unset works.
3. Roster chips filter correctly; Enby chip appears only when a nonbinary friend exists; null-gender friends show only under All.
4. Filter to girls → Party mode deals only girls; All deals everyone (current behavior).
5. Public web profile (`/p/<slug>`) shows no gender.
