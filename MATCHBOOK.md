# Matchbook 🔥 — Project Brief & Progress

*Last updated: 2026-07-07. This file is the portable summary of the app concept, architecture, and build status — written to be dropped into a Claude project as knowledge.*

## The concept

Matchbook is a **wingperson app**. You sign up as a wingperson and keep a roster of your single friends as beautiful profiles. At a party, you flip through them phone-in-hand ("party mode") and show people. When someone's interested, you share that friend's private profile link.

The magic is what happens next — **no one else ever needs an account**:

1. The party guest opens the link in their browser, sees the profile, and taps **"Say hi 👋"** — this creates a private chat room and drops them in.
2. You get a push notification ("Someone wants to talk to Jenny!") and forward Jenny her secret chat link by text.
3. Jenny opens it and first sees an **intro gate**: *"Lia vouches for this — they met someone who'd like to chat with you"* with **Enter chat** or **Not interested**. Before forwarding, the wingperson can attach an optional suitor card — photo, first name, Instagram, and tapped vouch reasons — that only the friend sees at the gate.
4. They chat in real time. Either person can type **STOP** (or tap End chat) at any moment — the chat locks **permanently, enforced in the database**, no reopening ever. Declining the intro does the same.

Positioning: introductions between real friends with a human vouching for them — *a wink, not a swipe*. Explicitly not Tinder/Hinge.

## Trust & safety model

- Profile and chat links are unguessable secrets (≥144-bit tokens); profiles are never browsable or searchable.
- Every friend has a consent flag ("they know they're on here") and a status toggle — flipping to `taken`/`hidden` instantly kills the profile link **and** ends all their active chats.
- STOP matching is server-side, whitespace/case-insensitive, never stored, never bypassable from the client.
- The wingperson sees chat metadata (exists, active/ended) but **cannot read messages** — the database denies it.
- Adversarially reviewed: token isolation, RLS leaks, STOP bypasses all tested live; zero error-level Supabase security findings; no secrets in the repo.

## Architecture

| Piece | Stack | What it does |
|---|---|---|
| iOS app (wingpeople) | Expo SDK 57 / React Native, expo-router | Auth (email + **Sign in with Apple**), roster CRUD with photos, party-mode deck, share links, chats tab with forward buttons, push notifications. TestFlight distribution. |
| Backend | Supabase (project `gyhqbnyuufntgdmowrbi`, SunnyMedia org) | Postgres + RLS, anonymous access ONLY via SECURITY DEFINER RPCs (`get_profile`, `create_chat`, `get_chat`, `send_message`, `end_chat`), Realtime broadcast for live chat, Storage for photos, pg_net trigger → Expo push API. |
| Web (guests + friends) | Single-file vanilla JS pages on Netlify | `/p/<slug>` profile page, `/c/<token>` chat room with intro gate + STOP. Live: **https://matchbook-party.netlify.app** |

Repo: **https://github.com/sunnyLia24/matchbook** — [PR #1](https://github.com/sunnyLia24/matchbook/pull/1) has the full v1. Spec, 15-task plan, and manual test checklist live in `docs/superpowers/`.

## Design

Brand system in `PRODUCT.md` + `DESIGN.md`. Current direction: **"After Dark"** (2026-07-06 redesign) — the whole product lives on deep plum-black nightlife surfaces (`#17101A`), photos full-bleed and glowing as the only bright thing, one hot neon-lipstick accent (`#FF2E63`) for actions and vouch moments, champagne garnish. Personality: flirty, confident, vouched-for. Voice: "Your single friends deserve better PR."

## Build status

**v1 is functionally complete, live, and review-gated.** Built via subagent-driven development: every task had an independent implementer + reviewer; the final whole-branch review verdict was READY.

Done and verified:
- Full backend live (schema, RLS, chat RPCs, STOP enforcement, photos, push trigger) — 4 test suites + a live e2e suite all pass, including realtime delivery over real websockets.
- Web app deployed and e2e-tested (23/23 checks: profile → say hi → intro gate → two-way live chat → STOP from both sides → status-flip kill).
- iOS app complete and typechecked; EAS configured; iOS build succeeded on Expo's servers.
- Sign in with Apple added (2026-07-07): native `expo-apple-authentication` + Supabase Apple provider; migration 006 removed email-prefix display-name defaults.
- Suitor card (2026-07-08): migration 008, app sheet, friend-gate card; suite 05 + full regression pass.

In flight / remaining:
- **TestFlight submit** — Lia's interactive `eas submit` (App Store Connect app record + upload). After the stored API key setup, future submits are hands-free.
- **Dark-theme refactor** (~5.8k lines, app + web) from the design workstream is **uncommitted in the working tree** — must be committed (or stashed) before any EAS build, since builds upload the working tree.
- Netlify redeploy pending for the web "Your friend" fallback copy (and the dark theme when it lands).
- Optional hardening: enable leaked-password protection in the Supabase dashboard. Repo is currently public.

## Working conventions (for any future session)

- Backend test scripts: `node --experimental-websocket backend/tests/<file>.mjs` (local Node 20 lacks native WebSocket). Test emails must use `@matchbook-test.com` (Supabase rejects `.dev`).
- The app's chats query must select explicit columns — `select('*')` fails by design (column-level grants).
- Progress ledger: `.superpowers/sdd/progress.md`. EAS project: `sunnylia24/matchbook`; Netlify site `de9934fc-b459-4299-86a6-46f299c2e824`.
- v2 candidates deliberately cut from v1: roster-swap between wingpeople, in-app intro requests, matching, Android, App Store public launch.
