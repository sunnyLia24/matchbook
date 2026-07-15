# Matchbook v1 — Design

**Date:** 2026-07-05
**Status:** Approved by Lia (architecture, chat/STOP mechanics, and v1 scope each approved explicitly)

## What it is

Matchbook is a wingperson app. Users ("wingpeople") sign up and maintain a roster of
profiles for their single friends. At parties, a wingperson flips through profile cards
on their phone and shows them to people. When someone is interested, the wingperson
shares that friend's profile link. The recipient can start a private, account-free chat
with the single friend via secret links. Either chat participant can permanently end the
chat by sending "STOP" (or tapping an End button).

Singles and party guests never need accounts. Only wingpeople sign up.

## Architecture

Same stack as Dear Date:

1. **iOS app — Expo (React Native), modeled on `~/Claude/dear-date-mobile`.**
   The wingperson's tool: auth, roster CRUD, profile card deck for parties, share
   links, chat status list, push notifications. Distributed via TestFlight for v1.
2. **Supabase — one new project.**
   - Auth: wingperson accounts (email/password, matching Dear Date's setup).
   - Postgres: all data (tables below), with Row Level Security throughout.
   - Storage: friend photos.
   - Realtime: live message delivery in chat rooms.
   - Edge functions / SQL functions: token-authenticated access for account-free
     web visitors, chat creation, message sending, STOP enforcement.
3. **Web app — single-file vanilla JS pages on Netlify (Dear Date style).**
   Hosted on the free Netlify subdomain for v1 (custom domain is a later, trivial
   swap). Two pages, mobile-first:
   - **Profile page** (`/p/<share_slug>`): renders one friend's profile; "Say hi 👋"
     button creates a chat.
   - **Chat page** (`/c/<participant_token>`): the chat room. Same page for both
     participants; the token determines which seat you're in.

## Data model

All ids are UUIDs. All secret slugs/tokens are cryptographically random and unguessable
(≥128 bits, base64url).

- **wingpeople** — extends `auth.users`: `id`, `display_name` (collected at
  sign-up; shown to the friend on the chat intro screen), `expo_push_token`,
  `created_at`.
- **friends** — roster entries: `id`, `owner_id → wingpeople`, `first_name`, `age`,
  `city`, `pitch` (wingperson's one-liner), `prompts` (jsonb array of {question, answer},
  up to ~3), `looking_for`, `photos` (jsonb array of storage paths, up to 4),
  `status` (`single` | `taken` | `hidden`), `consented` (boolean: "they know they're
  on here"), `share_slug` (unique, secret), timestamps.
  - Setting `status` to anything but `single` makes the profile page return
    "profile unavailable" immediately AND ends (locks) any active chats for that
    friend, same as STOP.
- **chats** — `id`, `friend_id → friends`, `status` (`active` | `ended`),
  `ended_by` (`guest` | `friend` | null), `guest_token` (secret), `friend_token`
  (secret), `created_at`, `ended_at`.
- **messages** — `id`, `chat_id → chats`, `sender` (`guest` | `friend`), `body` (text,
  length-capped), `created_at`.

### Access control

- Wingpeople (authenticated) have full CRUD on their own `friends` rows and read
  access to `chats` **metadata** for their friends (existence, status, timestamps) —
  RLS denies them `messages` entirely. The wingperson cannot read chat contents.
- Web visitors are anonymous. They never query tables directly; all reads/writes go
  through SECURITY DEFINER SQL functions (or edge functions) keyed on the secret
  slug/token: `get_profile(share_slug)`, `create_chat(share_slug)`,
  `get_chat(token)`, `send_message(token, body)`. Functions return only the
  minimum fields needed.
- Photos live in a public-read, non-listable storage bucket under unguessable
  UUID paths (same trust model as profile links: possession of the URL is the
  credential). Uploads are RLS-restricted to the owner's folder.
  *(Amended 2026-07-05 during planning: Supabase signed URLs cannot be minted
  from SQL functions without an extra edge-function layer — YAGNI for v1.)*

## Flows

### Party flow
1. Wingperson opens the app → roster shown as a swipeable full-screen card deck.
2. Interested person found → **Share** button → iOS share sheet with
   `https://<domain>/p/<share_slug>`.
3. Recipient opens the profile in their browser. Taps **Say hi 👋**.
4. `create_chat` makes a `chats` row with two fresh tokens, returns the guest's
   chat URL (they're redirected straight into the room), and triggers a push
   notification to the wingperson: "Someone wants to talk to <name>!"
5. In the app, the wingperson sees the new chat with a **Forward to <name>** button
   → share sheet with the friend's chat URL (`/c/<friend_token>`) to text/DM them.
6. Friend opens their link and first sees an **intro screen** framing this as a
   vouched recommendation, naming the wingperson: "<Wingperson name> vouches for
   this — they met someone who'd like to chat with you", with two choices:
   **Enter chat** (joins the room) or **Not interested** (permanently ends the
   chat, same mechanics as STOP). Only after entering do they see the room.
   `get_chat` therefore returns the wingperson's display name, and wingpeople
   provide their display name at sign-up.
7. Both are in the room; realtime chat begins.

### STOP mechanics
- If either participant sends a message that, after trimming whitespace,
  case-insensitively equals `STOP`, the chat's status becomes `ended` permanently.
- Also an explicit **End chat** button in the chat UI (same effect) for
  discoverability.
- Enforcement is server-side in `send_message` (and an `end_chat(token)` function):
  once `status = 'ended'`, all sends are rejected and both pages render
  "This chat has ended." The STOP message itself is not delivered as a chat message.
  There is no way to reopen an ended chat; a new chat requires the profile link and
  a fresh "Say hi" (which creates a separate room).
- Multiple chats per friend can exist (different parties, different people).

### Roster management (in-app)
- Add/edit friend: photos (pick from library, client-side resize before upload),
  fields listed above, consent checkbox, status toggle.
- Deck view for parties; list view for management.
- Chats tab: per-friend list of chats with status badges (active / ended) and the
  forward button for rooms the friend hasn't joined yet. No message contents.

## Error handling

- Bad/expired slug or token → friendly "This link isn't active" page, no detail
  leaked about whether it ever existed.
- `hidden`/`taken` friend → profile and any active chat pages show unavailable/ended
  states (both statuses end active chats, per the data-model rule above).
- Sends to an ended chat → rejected server-side, UI shows the ended state.
- Message body validation: non-empty, ≤ 2000 chars, plain text only (rendered as
  text, never HTML).
- Push notification failure is non-fatal; chats always appear in the Chats tab.

## Testing

- SQL function behavior (the security-critical core): profile access by slug,
  chat creation, send/receive, STOP normalization ("stop", " Stop ", "STOP"),
  post-STOP rejection, token isolation (guest token can't act as friend), hidden
  profile behavior. Tested with pgTAP or a scripted test harness against a local
  Supabase instance.
- Web pages: manual test checklist on iPhone Safari (the actual party device) —
  profile render, say hi, two-browser chat, STOP from each side.
- Expo app: component-level tests where cheap; primary validation is TestFlight
  usage.

## Out of scope for v1

Browsing other wingpeople's rosters / roster swap, in-app intro requests, matching
logic, wingperson-readable chats, Android, App Store submission (TestFlight only),
web signup for wingpeople. The data model (wingpeople as first-class accounts,
friends decoupled from chats) is chosen so these can be added without rework.
