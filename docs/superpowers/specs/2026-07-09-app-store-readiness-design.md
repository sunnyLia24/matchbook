# App Store Readiness — Design

**Date:** 2026-07-09
**Status:** Implemented autonomously per Lia's request ("implement them"); decisions recorded below for review.

## Goal

Take Matchbook from TestFlight-only (explicitly out of scope in the v1 spec) to
App Store submittable. This spec audits every Apple requirement against the
current app and defines the missing pieces.

## Audit

### Already satisfied (no work needed)

- **Sign in with Apple** alongside email/password (Guideline 4.8).
- **Permission strings** for camera + photo library (app.json plugin config).
- **Export compliance**: `ITSAppUsesNonExemptEncryption: false` in Info.plist.
- **App icon / splash / bundle id** (`club.deardate.matchbook`), EAS production
  profile with remote version autoincrement, `ascAppId` pinned for submit.
- **Consent for third-party content** (5.1.2): `get_profile` / `create_chat`
  are server-side gated on `consented = true` and `status = 'single'`.
- **Adults only data model**: friends' age DB-checked to 18–120.
- **Unwanted-contact kill switch**: STOP / End chat permanently ends a room,
  enforced server-side; hidden/taken status kills profile + chats.
- **No ads, no tracking** → no App Tracking Transparency prompt needed.

### Missing — implemented in this change

1. **Account deletion in-app (5.1.1(v))** — required for any app with account
   creation. New `delete_account()` SECURITY DEFINER function deletes the
   `auth.users` row (cascades wipe wingperson → friends → chats → messages)
   and the user's storage objects. Surfaced in a new Settings screen behind a
   typed confirmation.
2. **Sign out** — reviewers expect it; there was no way to leave an account.
3. **Privacy policy (5.1.1(i))** — required in App Store Connect *and*
   accessible in-app. New `web/privacy.html`, linked from Settings and the web
   footer.
4. **Terms of Use** — UGC apps need terms the user agrees to (1.2), with zero
   tolerance for objectionable content. New `web/terms.html`; sign-in screen
   gains a "By continuing you agree…" line linking terms + privacy.
5. **Support contact (1.2 + ASC support URL)** — new `web/support.html` with a
   monitored contact address.
6. **UGC report mechanism (1.2)** — the account-free web surfaces (profile
   page, chat) are where strangers encounter user content. New `reports` table
   plus anonymous `report_profile(slug, reason)` / `report_chat(token, reason)`
   RPCs, with a Report action on both pages. Blocking = existing STOP.
7. **Submission metadata playbook** — `docs/app-store-submission.md`: exact
   App Store Connect answers (privacy nutrition labels, age rating, review
   notes), demo reviewer account, and the follow-ups only Lia can do.

## Design decisions

- **Deletion is a SQL function, not an edge function.** `delete from
  auth.users where id = auth.uid()` inside a `security definer` function owned
  by `postgres` is the standard Supabase pattern; every table already cascades
  from `auth.users`. Storage: deleting the user's `storage.objects` rows makes
  every photo URL 404 immediately (public URL serving resolves through that
  table). No service-role key ever ships in the app.
- **Reports are write-only for the public.** RLS enabled with no select
  policies; inserts happen only through the two RPCs (reason length-capped,
  slug/token must resolve, no existence oracle — unknown slug/token is a
  silent no-op returning the same shape).
- **Settings is a modal screen** (gear in the roster header), matching the
  friend-editor pattern: display name edit, sign out, legal links, delete
  account. Delete requires typing DELETE to arm the button.
- **Web legal pages are static single-file pages** in the After Dark theme, no
  JS dependencies; `_redirects` gains `/privacy`, `/terms`, `/support`.
- **Apple token revocation on deletion** (required for Sign in with Apple
  apps) needs Lia's ASC `.p8` key + a small edge function; documented as the
  one code follow-up in the submission doc rather than blocking this change.

## Testing

- `backend/tests/07-account-and-reports.mjs` (same live-project harness as
  01–06): delete_account wipes sign-in, profile links, chats, photos row;
  report RPCs insert for valid slug/token, no-op for garbage, cap reason
  length; reports unreadable by anon/authenticated.
- App: `tsc --noEmit` + eslint; manual TestFlight pass for the settings flow.
- Web: deployed to Netlify, manual check of the four pages + report actions.

## Out of scope

App Store Connect console work (screenshots, description, age rating
questionnaire, privacy labels data entry, demo account notes) — documented in
`docs/app-store-submission.md` since it can only be done in Lia's ASC session.
Apple sign-in token revocation edge function (needs her Apple key). Android.
