# App Store Submission Playbook

Everything Matchbook needs to go from TestFlight to the App Store.
Code-side requirements are implemented (spec:
`docs/superpowers/specs/2026-07-09-app-store-readiness-design.md`); this file
covers the two pending pushes and the App Store Connect console work only Lia
can do.

## 0. Pending pushes

✅ **Migrations 011 + 012 applied** (2026-07-09) and verified: backend suites
01–07 all pass against production. Note: `delete_account()` deletes the auth
user only — the app purges the user's photo folder through the Storage API
first, because Supabase blocks SQL deletes on `storage.objects` (012).

✅ **Web deployed** (2026-07-09, Lia drag-and-drop): `/privacy`, `/terms`,
`/support` serve 200 with clean URLs, and the Report actions are live on the
profile and chat pages. Every URL in section 2 resolves.

## 1. Build & submit

✅ **Build 1.0.0 (7) built and uploaded to App Store Connect** (2026-07-11);
Apple processes it into TestFlight/the release picker within minutes. For
future versions:

```sh
cd app
eas build --profile production --platform ios
eas submit --profile production --platform ios   # ascAppId 6788095749 is pinned
```

## 2. App Store Connect — App Information

✅ **Synced automatically via EAS Metadata** (2026-07-11, `app/store.config.json`
+ `eas metadata:push`): name **"Matchbook: Wingperson"** (plain "Matchbook" is
taken by another developer — rename in ASC if you prefer something else),
subtitle, description, keywords, categories, all three URLs, and the age
rating declaration (messaging/chat ✓, UGC ✓, infrequent/mild mature themes).
To change store copy later: edit `store.config.json`, run
`npx eas-cli metadata:push --profile production`.

## 3. Age rating questionnaire

✅ Declared via metadata push (see above). Double-check the computed rating in
ASC looks right for a dating-adjacent app before submitting.

## 4. App Privacy (nutrition labels)

Data **linked to the user**, all for App Functionality only, none used for
tracking (answer "No" to tracking):

- **Contact Info → Email Address** (account sign-in)
- **Contact Info → Name** (display name, shown on chat invites)
- **User Content → Photos or Videos** (roster photos)
- **User Content → Other User-Generated Content** (profiles, chat messages)
- **Identifiers → User ID** (account id, push token)

Nothing else is collected: no location, no browsing history, no diagnostics
SDKs, no advertising data.

## 5. App Review Information

- **Demo account:** `appreview@matchbook-demo.com` / `Matchbook-Review-2026!`
  (seeded with two consented profiles — Jenny and Marcus, with photos — and a
  pending chat).
- ⚠️ Couldn't push App Review contact info automatically: ASC requires a
  **phone number**. Either fill the review block into `store.config.json`
  (fields: firstName, lastName, email, phone, demoUsername, demoPassword,
  demoRequired, notes — content below) and re-run `eas metadata:push`, or
  paste it in ASC → App Review Information.
- **Notes for the reviewer** (paste as-is):

> Matchbook is a "wingperson" app: the signed-in user keeps profiles of their
> single friends (with the friend's consent — profiles are only served after
> the consent toggle is on) and shares a private profile link with people they
> meet. Recipients chat with the friend on the web, account-free.
> To test the full loop: sign in with the demo account → open Jenny → tap the
> share icon in Party mode (or copy the profile link) → open the link in
> Safari → tap "Say hi" → a chat opens; the Forward button in the app's Chats
> tab produces the friend-side link. Either chat participant can type STOP or
> tap End chat to permanently end a chat, and both web surfaces have Report
> actions. Account deletion: gear icon → Delete account.

## 6. Screenshots & description

✅ Description pushed via metadata. Screenshots captured from the real Release
build on an iPhone 17 Pro Max simulator with demo-account data, in
`app/store-assets/`:
- `*-65.png` = **1284×2778 (6.5")** — this app's version page shows a 6.5"
  screenshot well, so these are the ones to upload.
- `NN-*.png` (no suffix) = 1320×2868 (6.9") originals, kept for reference.

⬜ **Only remaining submission blocker:** drag the five `*-65.png` files into
ASC → the iPhone screenshot well (order: roster, deck, suitor, chats,
settings). EAS Metadata and browser automation can't transport local files
into the ASC uploader, so this drag is manual. Then click **Add for Review**.

Everything else on the version is done: build 1.0.0 (7) attached, pricing
(Free, all regions), Content Rights ("no third-party content"), App Privacy
labels published, and App Review contact + demo account. Apple's pre-submit
validation now lists **only** the screenshot as outstanding.

Note: a blue banner asks to answer new "social media" age-rating questions in
App Information by **Sept 7, 2026** — informational, not a blocker for this
submission.

## 7. Compliance already handled in the binary

- Sign in with Apple offered alongside email/password (4.8).
- In-app account deletion (5.1.1(v)) — Settings → Delete account.
- Privacy policy + terms linked in-app (Settings; sign-in screen).
- UGC report mechanisms + 24h moderation promise (1.2) on both web surfaces.
- Camera/photo permission strings; `ITSAppUsesNonExemptEncryption = false`.

## 8. Post-approval follow-up (not blocking)

- **Sign in with Apple token revocation on account deletion**: Apple requires
  SIWA apps to revoke tokens via their REST API when an account is deleted.
  Needs an edge function holding the ASC `.p8` key (Team ID + Key ID + client
  secret JWT) calling `https://appleid.apple.com/auth/revoke` before
  `delete_account`. The in-app deletion satisfies review today; add this for
  full compliance.
- Consider a dedicated support alias instead of the personal Gmail on
  `/privacy`, `/terms`, `/support` (currently cutiechoi@gmail.com).
- Moderation duty: reports land in the `reports` table (visible only via the
  Supabase dashboard). Check it — the public pages promise action within 24h.
