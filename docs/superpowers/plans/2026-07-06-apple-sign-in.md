# Sign in with Apple Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One-tap Sign in with Apple on the iOS app's sign-in screen, alongside the existing email/password flow.

**Architecture:** `expo-apple-authentication` presents the native Apple sheet; the returned identity token is exchanged via `supabase.auth.signInWithIdToken({ provider: 'apple' })`. Apple's name (first authorization only) is saved to `wingpeople.display_name`; a home-screen safety-net prompt covers the no-name case. No backend, web, or schema changes.

**Tech Stack:** Expo SDK 57, expo-apple-authentication, Supabase JS auth, expo-router.

**Spec:** `docs/superpowers/specs/2026-07-06-apple-sign-in-design.md`

## Global Constraints

- Expo SDK 57 — consult https://docs.expo.dev/versions/v57.0.0/ for any API question; install packages with `npx expo install` so versions match the SDK.
- iOS bundle ID: `club.deardate.matchbook` (this is the Supabase Apple provider client ID).
- All colors/spacing come from `app/src/theme.ts` (`colors`, `radii`, `spacing`) — no hardcoded hex values.
- Error alerts use the existing pattern: `Alert.alert('Hmm', message)`.
- The app has no unit-test runner. Verification per task = `npx tsc --noEmit` (expect: no output, exit 0) and `npm run lint` (expect: no errors) from `app/`. Real end-to-end happens on the TestFlight build (Task 4 checklist).
- No changes to `backend/` or `web/`.
- Working directory for all commands: `/Users/lia/Claude/Matchbook/app` unless stated.

---

### Task 1: Package + native config

**Files:**
- Modify: `app/package.json` (via `npx expo install`)
- Modify: `app/app.json`

**Interfaces:**
- Produces: `expo-apple-authentication` importable in app code; the EAS build gets the Sign in with Apple entitlement via `usesAppleSignIn` + the config plugin.

- [ ] **Step 1: Install the SDK-matched package**

Run: `npx expo install expo-apple-authentication`
Expected: adds `"expo-apple-authentication": "~57.x.x"` to `app/package.json` dependencies.

- [ ] **Step 2: Add iOS entitlement flag and config plugin to app.json**

In `app/app.json`, add `"usesAppleSignIn": true` inside the existing `ios` block:

```json
"ios": {
  "icon": "./assets/expo.icon",
  "bundleIdentifier": "club.deardate.matchbook",
  "supportsTablet": false,
  "usesAppleSignIn": true,
  "infoPlist": {
    "ITSAppUsesNonExemptEncryption": false
  }
},
```

And add `"expo-apple-authentication"` to the `plugins` array:

```json
"plugins": [
  "expo-router",
  "expo-apple-authentication",
  [
    "expo-splash-screen",
    {
      "backgroundColor": "#208AEF",
      "image": "./assets/images/splash-icon.png",
      "imageWidth": 76
    }
  ]
],
```

- [ ] **Step 3: Verify the config resolves**

Run: `npx expo config --type prebuild | grep -i -A1 apple`
Expected: output includes `usesAppleSignIn: true` and the `expo-apple-authentication` plugin with no config errors.

Run: `npx tsc --noEmit`
Expected: no output, exit 0.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json app.json
git commit -m "feat: add expo-apple-authentication package and iOS entitlement config"
```

---

### Task 2: Apple button + token exchange on the sign-in screen

**Files:**
- Modify: `app/app/(auth)/sign-in.tsx`

**Interfaces:**
- Consumes: `expo-apple-authentication` (Task 1); existing `supabase` client from `app/src/lib/supabase.ts`; `colors`, `radii`, `spacing` from `app/src/theme.ts`.
- Produces: Apple sign-in flow — after success, a Supabase session exists and `wingpeople.display_name` is set from Apple's name when it was previously empty.

- [ ] **Step 1: Rewrite sign-in.tsx with the Apple flow**

Replace the full contents of `app/app/(auth)/sign-in.tsx` with:

```tsx
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from '../../src/lib/supabase';
import { colors, radii, spacing, buttonBase } from '../../src/theme';

export default function SignIn() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false));
  }, []);

  const go = async () => {
    if (mode === 'up' && !name.trim()) return Alert.alert('Hmm', 'Add your name — your friends’ matches see it on chat invites.');
    setBusy(true);
    const { data, error } = mode === 'in'
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
      : await supabase.auth.signUp({ email: email.trim(), password });
    if (!error && mode === 'up' && data.user) {
      // shown to friends on the chat intro screen: "<name> vouches for this"
      await supabase.from('wingpeople').update({ display_name: name.trim() }).eq('id', data.user.id);
    }
    setBusy(false);
    if (error) Alert.alert('Hmm', error.message);
  };

  const goApple = async () => {
    if (busy) return;
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error('Apple didn’t return a sign-in token. Try again.');
      setBusy(true);
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });
      if (error) throw error;
      // Apple shares the name only on first authorization — capture it now,
      // but never overwrite a name an existing (linked) account already has.
      const appleName = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(' ');
      if (appleName && data.user) {
        const { data: wp } = await supabase.from('wingpeople').select('display_name').eq('id', data.user.id).single();
        if (!wp?.display_name) {
          await supabase.from('wingpeople').update({ display_name: appleName }).eq('id', data.user.id);
        }
      }
    } catch (e) {
      if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return; // user closed the sheet — not an error
      Alert.alert('Hmm', e instanceof Error ? e.message : 'Apple sign-in failed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={s.logo}>Matchbook 🔥</Text>
      <Text style={s.tag}>Your single friends deserve better PR.</Text>
      {appleAvailable && (
        <>
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={radii.sm}
            style={s.apple}
            onPress={goApple}
          />
          <View style={s.orRow}>
            <View style={s.orLine} />
            <Text style={s.or}>or</Text>
            <View style={s.orLine} />
          </View>
        </>
      )}
      {mode === 'up' && (
        <TextInput style={s.input} placeholder="Your name (shown on chat invites)" placeholderTextColor={colors.muted}
          value={name} onChangeText={setName} />
      )}
      <TextInput style={s.input} placeholder="Email" placeholderTextColor={colors.muted} autoCapitalize="none" keyboardType="email-address"
        value={email} onChangeText={setEmail} />
      <TextInput style={s.input} placeholder="Password" placeholderTextColor={colors.muted} secureTextEntry value={password} onChangeText={setPassword} />
      <Pressable style={({ pressed }) => [s.btn, pressed && s.btnPressed]} disabled={busy} onPress={go}>
        <Text style={s.btnText}>{mode === 'in' ? 'Sign in' : 'Create account'}</Text>
      </Pressable>
      <Pressable onPress={() => setMode(mode === 'in' ? 'up' : 'in')} hitSlop={8}>
        <Text style={s.switch}>{mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in'}</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: 28, gap: spacing.md },
  logo: { fontSize: 40, fontWeight: '800', letterSpacing: -0.5, color: colors.ink, textAlign: 'center' },
  tag: { color: colors.muted, textAlign: 'center', marginBottom: 18, fontSize: 16 },
  apple: { height: 52 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  orLine: { flex: 1, height: 1, backgroundColor: colors.line },
  or: { color: colors.muted, fontSize: 14 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radii.sm,
           padding: 15, fontSize: 16, color: colors.ink },
  btn: { ...buttonBase, backgroundColor: colors.brand, marginTop: 6 },
  btnPressed: { backgroundColor: colors.brandDeep },
  btnText: { color: colors.white, fontSize: 17, fontWeight: '600' },
  switch: { color: colors.brand, textAlign: 'center', marginTop: 14, fontSize: 15, paddingVertical: spacing.sm },
});
```

Notes for the implementer:
- `AppleAuthenticationButton` must not receive `backgroundColor`/`borderRadius` via `style` — corner radius goes through the `cornerRadius` prop (SDK 57 requirement).
- The existing `go` (email/password) function is unchanged.
- Apple sign-in success needs no navigation code: the root layout already redirects on Supabase auth state change (same as the email flow).

- [ ] **Step 2: Verify typecheck and lint**

Run: `npx tsc --noEmit`
Expected: no output, exit 0.

Run: `npm run lint`
Expected: no errors on `app/(auth)/sign-in.tsx`.

- [ ] **Step 3: Commit**

```bash
git add "app/(auth)/sign-in.tsx"
git commit -m "feat: Sign in with Apple on the sign-in screen"
```

---

### Task 3: Missing-name safety net on the roster screen

**Files:**
- Modify: `app/app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: existing `supabase` client; `colors`, `radii`, `spacing`, `cardBase` from theme; RLS already lets a wingperson read/update their own `wingpeople` row.
- Produces: a signed-in wingperson with empty `display_name` sees an inline prompt on the roster; saving writes `wingpeople.display_name` and hides the prompt. Guarantees "<name> vouches for this" never renders an empty name.

- [ ] **Step 1: Add the name prompt to the roster screen**

In `app/app/(tabs)/index.tsx`, make these edits.

Change the react-native import (line 2) to include `TextInput`:

```tsx
import { FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
```

Inside `Roster()`, add state under the existing `friends` state:

```tsx
  const [needsName, setNeedsName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
```

Extend the existing `useFocusEffect` to also check the wingperson's name (RLS scopes the select to the signed-in user's own row):

```tsx
  useFocusEffect(useCallback(() => {
    supabase.from('friends').select('*').order('created_at')
      .then(({ data }) => setFriends((data as Friend[]) ?? []));
    supabase.from('wingpeople').select('display_name').single()
      .then(({ data }) => setNeedsName(!!data && !data.display_name));
  }, []));
```

Add the save handler after the `useFocusEffect`:

```tsx
  const saveName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('wingpeople').update({ display_name: trimmed }).eq('id', user.id);
    if (error) Alert.alert('Hmm', error.message);
    else setNeedsName(false);
  };
```

(`Alert` must be added to the react-native import as well: `import { Alert, FlatList, ... }`.)

In the JSX, insert the prompt card between `<View style={s.wrap}>` and `<FlatList`:

```tsx
      {needsName && (
        <View style={s.nameCard}>
          <Text style={s.nameCardText}>What’s your name? Your friends’ matches see it on chat invites.</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <TextInput style={s.nameInput} placeholder="Your name" placeholderTextColor={colors.muted}
              value={nameDraft} onChangeText={setNameDraft} />
            <Pressable style={({ pressed }) => [s.nameSave, pressed && s.nameSavePressed]} onPress={saveName}>
              <Text style={s.nameSaveText}>Save</Text>
            </Pressable>
          </View>
        </View>
      )}
```

Add to the StyleSheet:

```tsx
  nameCard: { ...cardBase, margin: 16, marginBottom: 0, padding: spacing.lg, gap: spacing.md },
  nameCardText: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  nameInput: { flex: 1, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line, borderRadius: radii.sm,
               paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.ink },
  nameSave: { backgroundColor: colors.brand, borderRadius: radii.sm, paddingHorizontal: 18, justifyContent: 'center' },
  nameSavePressed: { backgroundColor: colors.brandDeep },
  nameSaveText: { color: colors.white, fontWeight: '600' },
```

- [ ] **Step 2: Verify typecheck and lint**

Run: `npx tsc --noEmit`
Expected: no output, exit 0.

Run: `npm run lint`
Expected: no errors on `app/(tabs)/index.tsx`.

- [ ] **Step 3: Commit**

```bash
git add "app/(tabs)/index.tsx"
git commit -m "feat: prompt for display name on roster when missing"
```

---

### Task 4: Supabase provider config + TestFlight checklist

**Files:**
- Modify: `manual-test-checklist.md` (repo root)

**Interfaces:**
- Consumes: Supabase project `gyhqbnyuufntgdmowrbi` (SunnyMedia org); bundle ID `club.deardate.matchbook`.
- Produces: Apple provider enabled server-side; written manual test cases for the TestFlight build.

- [ ] **Step 1: Enable the Apple provider in the Supabase dashboard (human step — cannot be done via MCP/SQL)**

In https://supabase.com/dashboard/project/gyhqbnyuufntgdmowrbi → Authentication → Sign In / Providers → Apple:
1. Toggle **Enable Sign in with Apple** on.
2. In **Client IDs**, enter exactly: `club.deardate.matchbook`
3. Leave **Secret Key** empty (only needed for the web OAuth flow) and save.

- [ ] **Step 2: Append Apple sign-in cases to the manual test checklist**

Append to `manual-test-checklist.md`:

```markdown
## Sign in with Apple (TestFlight build required — does not work in Expo Go/simulator)

- [ ] Apple button (black, native) shows above the email form with an "or" divider
- [ ] Fresh Apple sign-up: Face ID sheet → lands on roster with no name-prompt card; a friend chat invite shows your Apple name in "<name> vouches for this"
- [ ] Cancel the Apple sheet: no error alert, stay on sign-in screen
- [ ] Apple sign-in with the same email as an existing email/password account: signs into the existing account (no duplicate), display name unchanged
- [ ] Missing-name safety net: account with empty display_name sees "What's your name?" card on roster; saving hides it and the name appears on chat invites
```

- [ ] **Step 3: Commit**

```bash
cd /Users/lia/Claude/Matchbook
git add manual-test-checklist.md
git commit -m "test: manual checklist for Apple sign-in on TestFlight"
```
