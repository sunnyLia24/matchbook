# Party deck photo carousel — design

**Date:** 2026-07-08
**Status:** Approved (mockup reviewed in session)

## Goal

In party mode, Lia can flip through **all** of a friend's photos, not just the first.
Today `deck.tsx` renders only `photos[0]`; the other photos (up to 4) are visible only
on the friend editor and the public web profile.

## Decisions made

- **Interaction:** tap-to-advance, stories-style. Tap the **right half** of the hero
  photo → next photo; **left half** → previous. Wraps around.
- **Why taps, not swipes:** the deck's outer `FlatList` is already a horizontal pager
  between friends. Tap zones avoid any nested-scroll/gesture conflict; horizontal
  swipes keep moving between profiles exactly as today.
- **Indicator:** thin segment bars across the top of the photo (one per photo),
  champagne (`colors.champagne`) for the active photo, translucent ink for the rest —
  garnish only, per the After Dark rules. No "photo 1 of 4" text (bars are enough).
- **Single-photo / no-photo profiles:** no bars, no tap zones — rendering identical to
  today. Nothing changes for them.
- **Layout:** hero stays a fixed-size single `Image`; only the source changes on tap.
  Name/age/city overlay, scrim, and share button untouched. The overlay becomes
  `pointerEvents="none"` so taps on the name area still advance photos.
- **Close button** stays on top (it renders after the FlatList) and keeps priority
  over the right tap zone; segment bars start below the status-bar area and stop short
  of the close button.

## Structure

`renderItem` needs per-card state (`photoIndex`), so the card body is extracted into a
`DeckCard` component in the same file (`app/app/deck.tsx`). No new files, no new deps.

## Error handling

No new failure modes: `photos` is already loaded with the friend row; index arithmetic
is modulo `photos.length` which is ≥ 2 whenever the controls render.

## Testing

Manual (the app has no test suite), after `npx tsc --noEmit && npm run lint` pass:

1. Friend with 4 photos: bars show 4 segments; right-tap cycles 1→2→3→4→1; left-tap
   goes back and wraps 1→4. Champagne bar tracks the visible photo.
2. Friend with 1 photo / no photos: no bars, no tap response on the photo; placeholder
   💘 unchanged.
3. Horizontal swipe still pages between friends; vertical scroll of pitch/prompts
   still works; close button still closes even with a right tap zone underneath.
4. Name overlay: tapping directly on the name still advances the photo.
