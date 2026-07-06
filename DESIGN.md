# Design

Mood: **"a great wingperson's introduction at a house party — lipstick-red confidence, champagne warmth, a wink not a swipe."**

Seed: `oklch(0.636 0.218 355.3)` (impeccable seed-115, lipstick red, hue 355°). Primary hue stays within ±10° of 355.

## Color

Strategy: **committed** — lipstick red carries the brand moments (buttons, invite screen, deck accents); surfaces stay clean so photos win.

Tokens (OKLCH; hex fallbacks for RN in parentheses):

| Token | Value | Hex (RN) | Role |
|---|---|---|---|
| `--brand` | `oklch(0.58 0.22 355)` | `#C2185B`-adjacent → use `#BE1E5E` | Primary actions, brand moments |
| `--brand-deep` | `oklch(0.42 0.19 355)` | `#8A1244` | Pressed states, dark-surface brand |
| `--bg` | `oklch(0.975 0.005 355)` | `#FBF7F9` | Light page background (barely-blush white, chroma 0.005 — NOT cream) |
| `--surface` | `oklch(1 0 0)` | `#FFFFFF` | Cards, inputs |
| `--ink` | `oklch(0.24 0.02 355)` | `#33222B` | Body text (≥4.5:1 on bg/surface) |
| `--muted` | `oklch(0.50 0.02 355)` | `#75606B` | Secondary text (4.5:1 on bg) |
| `--line` | `oklch(0.90 0.01 355)` | `#E4DBE0` | Hairline borders |
| `--night` | `oklch(0.22 0.03 355)` | `#2B1B24` | Party-mode (deck) background — deep plum, not brown |
| `--night-ink` | `oklch(0.96 0.01 355)` | `#F5EDF2` | Text on night |
| `--night-muted` | `oklch(0.72 0.03 355)` | `#B79FAC` | Secondary on night |
| `--champagne` | `oklch(0.80 0.10 85)` | `#E3C08D` | Rare garnish only (badges, deck highlight) — never backgrounds |

Rules: white/blush surfaces + ink for reading; lipstick `--brand` on primary buttons and vouch moments; the deck (party mode) is drenched `--night`. Never cream/terracotta. Never red-on-red text.

## Typography

- System stack everywhere (`-apple-system, 'SF Pro', 'Helvetica Neue', sans-serif` web; default SF on RN) — party-proof and fast. Personality comes from weight contrast, not font pairing.
- Display (names, "vouches for this"): weight 800, letter-spacing -0.02em, `text-wrap: balance`.
- Body 16-17px, line-height 1.45, max 70ch.
- The wingperson's pitch is typographically special: larger (18-19px), weight 500, with an oversized decorative `"` in `--brand` — it's the vouch, the emotional core.

## Components & patterns

- **Buttons**: 16px radius, 52px min height, weight 600. Primary = `--brand` bg + white text. Quiet/destructive-adjacent ("Not interested", "End chat") = ghost with `--muted` text — visible, calm, never hidden.
- **Cards**: white surface, 1px `--line` border, 20px radius. No side-stripes, no nested cards, no glassmorphism.
- **Profile photos**: 4:5, 24px radius, subtle inner hairline.
- **Chat bubbles**: 18px radius; mine = `--brand`/white, theirs = `--surface` + `--line` border + `--ink`.
- **Invite/vouch screen**: the brand moment — drenched `--brand` background, white type, big display "{Name} vouches for this", white primary button ("Enter chat") on it. Lipstick red owns this screen.
- **Status badges**: lowercase, weight 600; live = `--brand`, ended/hidden = `--muted`. No pill-spam.
- **Empty states**: one playful line + one action, on-voice ("No chats yet — go make an introduction 💌").

## Motion

- Ease-out-quart, 200-350ms. Chat messages: 8px rise + fade in. Deck cards: subtle scale-settle on page snap. Invite screen: content fades up once (staggered 40ms).
- Every animation has a `@media (prefers-reduced-motion: reduce)` instant/crossfade fallback. No bounce, no elastic, no layout-property animation.

## Layout

- Mobile-first, one column, max-width 430px centered on web.
- Safe-area insets respected (`env(safe-area-inset-bottom)`) on composers and floating buttons.
- Spacing rhythm: 4/8/12/16/24/40; vary section gaps for rhythm, don't grid everything.

## Screens (canonical looks)

- **Web profile** (`/p/`): light bg, photo leads, name in display weight, brand-red "Say hi 👋" pinned comfortable-thumb height, "via {wingperson}" vouch line under the pitch.
- **Web chat** (`/c/`): light, airy; STOP hint in `--muted` under composer; ended state = centered quiet card, not an error.
- **Invite gate** (friend-side): drenched brand red (see above).
- **App roster/chats**: light utility screens, white cards on `--bg`.
- **App deck (party mode)**: drenched `--night` plum; photo glows; `--champagne` accents allowed here only.
