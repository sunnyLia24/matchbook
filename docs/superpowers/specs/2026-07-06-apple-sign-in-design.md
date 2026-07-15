# Sign in with Apple — Design

**Date:** 2026-07-06
**Status:** Approved by Lia
**Scope:** iOS app only (`app/`). No web, backend, or schema changes.

## Goal

Let wingpeople sign in to Matchbook with their Apple account, alongside the
existing email/password flow. One-tap Face ID sign-in via the native Apple
sheet — no browser redirect.

## Approach

Native Apple authentication with Supabase ID-token exchange:

1. `expo-apple-authentication` presents the native Apple sheet requesting the
   `EMAIL` and `FULL_NAME` scopes.
2. The returned `identityToken` is passed to
   `supabase.auth.signInWithIdToken({ provider: 'apple', token })`.
3. Supabase verifies the token against Apple and creates or signs in the user.

The browser-based `signInWithOAuth` flow was considered and rejected: worse
UX on iOS (Safari sheet), and it requires a Services ID plus a secret key that
expires every 6 months. The native flow needs neither.

## UX

- The standard black `AppleAuthenticationButton` (Apple's component, required
  styling) sits above the email/password form on the sign-in screen, separated
  by a subtle "or" divider.
- The button renders only when `AppleAuthentication.isAvailableAsync()` is
  true, which also keeps the screen safe on non-iOS platforms later.
- Everything else on the sign-in screen is unchanged.

## Display name

Apple returns the user's name only on the **first** authorization.

- On first successful Apple sign-in, write `givenName + familyName` to
  `wingpeople.display_name` (mirroring the email sign-up path). Skip the
  update if Apple returns no name.
- Safety net: if a signed-in wingperson has a null/empty `display_name`
  (e.g. they re-authorized after deleting their account, so Apple withheld
  the name), the home screen shows a one-field inline prompt asking for
  their name. This guarantees chat invites never render a missing name in
  "<name> vouches for this".

## Account linking

- Same email on an existing email/password account: Supabase automatic
  identity linking attaches the Apple identity to the existing user. No code.
- Apple "Hide My Email" relay addresses create a distinct account. Accepted.

## Config

- `app.json` (`app/app.json`): add `"usesAppleSignIn": true` under `ios`, and
  `"expo-apple-authentication"` to `plugins`.
- Package: `expo-apple-authentication` (Expo SDK 57 version).
- Supabase dashboard: enable the Apple provider with client ID
  `club.deardate.matchbook` (the iOS bundle ID). No secret needed for the
  native token flow.
- Requires a new EAS build — the entitlement is added automatically by the
  config plugin. Rides along with the pending TestFlight build.

## Errors

- User cancels the Apple sheet (`ERR_REQUEST_CANCELED`): return silently, per
  Apple's guidelines.
- Supabase rejects the token or any other failure: `Alert.alert('Hmm', …)`,
  matching the existing sign-in error pattern.

## Testing

- Apple sign-in cannot run in Expo Go or the simulator without an
  Apple-signed build. Code-level verification is TypeScript compilation and
  the existing backend test suites (which are untouched).
- Real end-to-end verification happens on the TestFlight build: fresh Apple
  sign-up (name captured), cancel path, and sign-in with an email/password
  account's address (linking).
