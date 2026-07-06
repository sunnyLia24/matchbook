# Matchbook

Wingperson app: keep profiles of your single friends, show them at parties,
share a link, and let people chat with your friend account-free. Either chat
participant can type STOP to permanently end the chat.

- `backend/` — Supabase migrations + node test scripts (`node backend/tests/<f>.mjs`)
- `web/` — Netlify site: `/p/<slug>` profile page, `/c/<token>` chat page
- `app/` — Expo iOS app for wingpeople (TestFlight)

Spec: docs/superpowers/specs/2026-07-05-matchbook-v1-design.md
