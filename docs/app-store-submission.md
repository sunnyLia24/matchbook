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

```sh
cd app
eas build --profile production --platform ios
eas submit --profile production --platform ios   # ascAppId 6788095749 is pinned
```

Version 1.0.0; build numbers auto-increment remotely.

## 2. App Store Connect — App Information

| Field | Value |
|---|---|
| Name | Matchbook |
| Subtitle | Your friends' wingperson |
| Category | Social Networking (secondary: Lifestyle) |
| Privacy Policy URL | https://matchbook-party.netlify.app/privacy |
| Support URL | https://matchbook-party.netlify.app/support |
| Marketing URL | https://matchbook-party.netlify.app |

## 3. Age rating questionnaire

Answer **Yes** to "Dating" (the app facilitates romantic introductions) and
**None/No** to gambling, violence, medical, unrestricted web access, and user
location. Dating forces the 17+/18+ tier — accept it; dating apps cannot ship
lower and Apple rejects attempts to dodge it.

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
  (already seeded with two consented profiles, Jenny and Marcus).
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

- Screenshot sizes: 6.9" (1320×2868) required; 6.5" (1284×2778) reused if
  omitted. Suggested five: roster, party-mode deck, suitor card sheet, web
  profile in Safari, chats tab.
- Description: lead with the one-liner ("Your single friends deserve better
  PR"), then the party flow, then safety (consent-gated profiles, STOP,
  wingperson can never read chats).

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
