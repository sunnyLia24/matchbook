# Design — "After Dark"

Mood: **"the party itself — a dim room, warm skin tones glowing, one hot lipstick-neon accent. The introduction happens at night."**

Direction chosen 2026-07-06 (Dribbble/Mobbin research: full-bleed photo + overlay type, dark nightlife surfaces, single hot accent). Replaces the light blush system.

## Color

Strategy: **dark-first everywhere.** Every surface (web + app) lives on deep plum-black; photos are the only bright thing on screen and therefore always win. One hot accent — neon lipstick `--brand` — owns primary actions and vouch moments. Dark ink on brand buttons (5.3:1), never white (3.6:1 — fails).

| Token | Hex | Role |
|---|---|---|
| `--bg` | `#17101A` | Page/app background (deep plum-black) |
| `--surface` | `#221727` | Cards, inputs, their-side chat bubbles |
| `--elevated` | `#2E1E33` | Raised chips, prompt cards, photo placeholders |
| `--ink` | `#F4EDF6` | Body text (16.3:1 on bg) |
| `--muted` | `#A891B5` | Secondary text (6.6:1 on bg, 6.1:1 on surface) |
| `--line` | `#3A2941` | Hairline borders |
| `--brand` | `#FF2E63` | Primary actions, accents, my-side bubbles (5.2:1 on bg as text) |
| `--brand-press` | `#D91E4F` | Pressed states |
| `--on-brand` | `#23060F` | Text/icons on brand surfaces (5.3:1) |
| `--champagne` | `#E3C08D` | Garnish only: vouched-by chip, deck highlight (10.8:1) |

Rules: photos full-bleed with a bottom scrim, name overlaid; brand glow shadows (`0 8px 28px rgba(255,46,99,.35)`) on primary CTAs only; champagne never a background; never white text on brand.

## Typography

- System stack (`-apple-system, 'SF Pro', 'Helvetica Neue', sans-serif`; default SF on RN). Personality = weight 900 + tight tracking, not font pairing.
- Display (names overlaid on photos): weight 900, letter-spacing -0.03em, `text-wrap: balance`.
- Body 16-17px, line-height 1.45. Safety copy (STOP hint) never below 13px.
- The wingperson's pitch: 18-19px weight 500, oversized `"` in `--brand`.

## Components & patterns

- **Buttons**: pill radius (999), 52px min height, weight 700. Primary = `--brand` bg + `--on-brand` text + glow. Quiet/destructive-adjacent = ghost `--muted`, visible and calm.
- **Cards**: `--surface` bg, 1px `--line` border, 20px radius.
- **Profile photos**: full-bleed 4:5, bottom scrim `linear-gradient(to top, var(--bg) 8%, transparent)`, name/age/city overlaid bottom-left.
- **Chat bubbles**: 18px radius; mine = `--brand` + `--on-brand`, theirs = `--surface` + `--line` + `--ink`.
- **Invite/vouch gate**: dark room with a brand glow — radial plum gradient bg, ink display type, brand pill CTA. No more drenched-red screen.
- **Vouched-by chip**: `--elevated` bg, `--line` border, `--champagne` text, pill.
- **Status badges**: lowercase, weight 600; live = `--brand`, ended/hidden = `--muted`.
- **Empty states**: one playful line + one action, on-voice.

## Motion

- Ease-out-quart, 200-350ms. Messages: 8px rise + fade. Invite gate: staggered 40ms fade-up. CTA glow may pulse once on load, never loop.
- All animation has `@media (prefers-reduced-motion: reduce)` instant/crossfade fallback. No bounce, no layout-property animation.

## Layout

- Mobile-first, one column, max-width 430px centered on web. Photos break the column (full-bleed to 430px edge).
- Safe-area insets on composers and floating/sticky buttons.
- Spacing rhythm: 4/8/12/16/24/40.

## Screens (canonical looks)

- **Web profile** (`/p/`): full-bleed photo carousel with overlaid display name; dark body; vouch quote; sticky brand pill "Say hi 👋" with glow.
- **Web chat** (`/c/`): dark, calm; STOP hint `--muted` 13px; ended state = centered quiet text.
- **Invite gate** (friend-side): dark radial glow, "{Name} vouches for this" in ink, brand pill "Enter chat".
- **App roster/chats**: dark utility, `--surface` cards; brand FAB + brand party-mode pill.
- **App deck (party mode)**: deepest bg (`#100A13`), full-bleed hero photo with scrim + overlaid name (matches web /p/), champagne accents allowed here.
