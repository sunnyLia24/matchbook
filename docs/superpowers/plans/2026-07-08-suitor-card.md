# Suitor Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the wingman forwards a friend's chat link, an optional sheet lets them attach a suitor card (photo, first name, IG handle, tapped vouch reasons) that only the friend sees at the intro gate.

**Architecture:** One nullable `suitor_card` jsonb column on `chats`, written directly by the authenticated wingperson via a column-level grant + ownership-scoped RLS update policy, and returned by `get_chat` **only** for the friend role. The iOS app gains a modal sheet between "Forward" and the share sheet; `web/chat.html` renders the card inside the existing intro gate. Spec: `docs/superpowers/specs/2026-07-08-suitor-card-design.md` (QA-amended; its constraints are binding).

**Tech Stack:** Supabase Postgres (RLS, column grants, SECURITY DEFINER RPC), Expo SDK 57 / React Native / expo-router, single-file vanilla-JS web page, Node test scripts.

## Global Constraints

- **Working tree is dirty** with an unrelated dark-theme refactor. Every commit must `git add` explicit paths only — never `git add -A` / `git add .`.
- **Expo SDK 57:** read https://docs.expo.dev/versions/v57.0.0/ for any Expo API you touch (per `app/AGENTS.md`); mirror existing usage in `app/app/friend/[id].tsx` where possible.
- **UI tasks (2 and 3) must load the `impeccable:impeccable` skill before writing UI code** (Lia's standing preference), and use only After Dark tokens — app: `src/theme.ts`; web: existing CSS `var(--...)` values. On-brand text is `onBrand`/`--on-brand`, never white.
- **`chats` reads always name explicit columns** — `select('*')` fails by design (column-level grants).
- **Web rendering:** `createElement`/`textContent` only; never `innerHTML`; IG link only via fixed prefix + `encodeURIComponent`; `rel="noopener noreferrer"`.
- **Backend tests:** run `node --experimental-websocket backend/tests/<file>.mjs` from repo root; signup emails must use `@matchbook-test.com`; config comes from `backend/config.json` (already present).
- **Migrations:** applied to live project `gyhqbnyuufntgdmowrbi` via the Supabase MCP `apply_migration` tool AND mirrored verbatim into `backend/migrations/008_suitor_card.sql`.
- Card jsonb shape (server-enforced): object with only `name`/`photo`/`ig`/`tags` keys; `name`,`photo`,`ig` strings; `ig ~ '^[A-Za-z0-9._]{1,30}$'`; `photo` prefixed `https://gyhqbnyuufntgdmowrbi.supabase.co/storage/v1/object/public/photos/`; `tags` an array; total `< 2048` bytes.

---

### Task 1: Migration 008 + backend security tests

**Files:**
- Create: `backend/migrations/008_suitor_card.sql`
- Test: `backend/tests/05-suitor-card.mjs`

**Interfaces:**
- Consumes: existing `_chat_for`, `get_chat` (`backend/migrations/003_chat_fns.sql`), `chats` grants baseline (`001_schema.sql:84-87`).
- Produces: `chats.suitor_card` jsonb column updatable/selectable by owning wingperson; `get_chat` payload key `suitor_card` (object as stored) present **only when** role is `friend` AND card is non-null — key entirely absent otherwise. Task 2 writes this column; Task 3 reads this key.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/05-suitor-card.mjs`:

```js
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import assert from 'assert';

const cfg = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const anon = () => createClient(cfg.url, cfg.anonKey, { auth: { persistSession: false } });
const rand = () => Math.random().toString(36).slice(2, 10);
const PHOTO_PREFIX = `${cfg.url}/storage/v1/object/public/photos/`;

const signUp = async () => {
  const c = anon();
  const { data, error } = await c.auth.signUp({
    email: `test-${rand()}@matchbook-test.com`, password: 'test-pass-123!' });
  assert(!error, `signup: ${error?.message}`);
  return c;
};

const owner = await signUp();
const newChat = async () => {
  const { data: f } = await owner.from('friends')
    .insert({ first_name: 'Jenny', consented: true }).select().single();
  const v = anon();
  const { data: c } = await v.rpc('create_chat', { p_slug: f.share_slug });
  const { data: row } = await owner.from('chats')
    .select('id, friend_token').eq('friend_id', f.id).single();
  return { v, f, id: row.id, guest: c.guest_token, friend: row.friend_token };
};

const setCard = (client, id, card) =>
  client.from('chats').update({ suitor_card: card }).eq('id', id);
const readCard = async (id) =>
  (await owner.from('chats').select('suitor_card').eq('id', id).single()).data.suitor_card;

const VALID = { name: 'Dan', photo: `${PHOTO_PREFIX}someuid/somefile.jpg`,
                ig: 'dan.example', tags: ['funny', 'has a good job'] };

// 1. owner writes a valid card and reads it back
let t = await newChat();
let { error } = await setCard(owner, t.id, VALID);
assert(!error, `valid card rejected: ${error?.message}`);
assert.deepStrictEqual(await readCard(t.id), VALID, 'card readback mismatch');

// 2. friend payload carries the card; guest payload must NOT contain the key
let g = (await t.v.rpc('get_chat', { p_token: t.friend })).data;
assert.deepStrictEqual(g.suitor_card, VALID, 'friend payload missing card');
g = (await t.v.rpc('get_chat', { p_token: t.guest })).data;
assert(!('suitor_card' in g), 'guest payload leaks suitor_card key');

// 3. no card -> key absent for friend too
let t2 = await newChat();
g = (await t2.v.rpc('get_chat', { p_token: t2.friend })).data;
assert(!('suitor_card' in g), 'null card must omit key');

// 4. another wingperson cannot write my chat's card
const stranger = await signUp();
await setCard(stranger, t.id, { name: 'Mallory' });
assert.deepStrictEqual(await readCard(t.id), VALID, 'stranger overwrote card');

// 5. owner cannot touch non-granted columns
({ error } = await owner.from('chats').update({ status: 'ended' }).eq('id', t.id));
assert(error, 'status update must be permission-denied');
({ error } = await owner.from('chats').update({ ended_by: 'guest' }).eq('id', t.id));
assert(error, 'ended_by update must be permission-denied');

// 6. shape constraint rejects bad payloads
const BAD = [
  ['top-level array', ['funny']],
  ['extra key', { name: 'Dan', hacked: true }],
  ['non-string name', { name: 42 }],
  ['tags not array', { tags: 'funny' }],
  ['bad ig charset', { ig: 'dan/emailsignup' }],
  ['ig too long', { ig: 'x'.repeat(31) }],
  ['foreign photo origin', { photo: 'https://evil.example/pixel.jpg' }],
  ['javascript photo', { photo: 'javascript:alert(1)' }],
  ['oversize', { name: 'x'.repeat(2100) }],
];
for (const [label, card] of BAD) {
  ({ error } = await setCard(owner, t.id, card));
  assert(error, `constraint must reject: ${label}`);
}
assert.deepStrictEqual(await readCard(t.id), VALID, 'a bad payload landed');

// 7. clearing the card works; ended chats are immutable
({ error } = await setCard(owner, t.id, null));
assert(!error && (await readCard(t.id)) === null, 'clearing card failed');
await t.v.rpc('end_chat', { p_token: t.guest });
await setCard(owner, t.id, VALID);
assert((await readCard(t.id)) === null, 'ended chat card must be immutable');

console.log('05-suitor-card PASS');
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --experimental-websocket backend/tests/05-suitor-card.mjs`
Expected: FAIL — first `setCard` errors with permission denied (`42501`) because neither the grant nor the column exists yet.

- [ ] **Step 3: Write the migration**

Create `backend/migrations/008_suitor_card.sql`:

```sql
-- Suitor card: optional vouch card (photo / name / IG / vouch tags) the
-- wingperson attaches when forwarding the friend's chat link. Friend-only:
-- get_chat includes it solely for the friend role — the guest payload never
-- contains the key. Written directly by the owning wingperson via a
-- column-level grant; the CHECK constraint is the trust boundary (this jsonb
-- is rendered in the friend's browser).

alter table public.chats
  add column if not exists suitor_card jsonb;

alter table public.chats drop constraint if exists chats_suitor_card_shape;
alter table public.chats add constraint chats_suitor_card_shape check (
  suitor_card is null or (
    jsonb_typeof(suitor_card) = 'object'
    and suitor_card - 'name' - 'photo' - 'ig' - 'tags' = '{}'::jsonb
    and (suitor_card->'name' is null or jsonb_typeof(suitor_card->'name') = 'string')
    and (suitor_card->'photo' is null or (
      jsonb_typeof(suitor_card->'photo') = 'string'
      and suitor_card->>'photo' like
        'https://gyhqbnyuufntgdmowrbi.supabase.co/storage/v1/object/public/photos/%'))
    and (suitor_card->'ig' is null or (
      jsonb_typeof(suitor_card->'ig') = 'string'
      and suitor_card->>'ig' ~ '^[A-Za-z0-9._]{1,30}$'))
    and (suitor_card->'tags' is null or jsonb_typeof(suitor_card->'tags') = 'array')
    and pg_column_size(suitor_card) < 2048
  )
);

-- Ownership-scoped write path; explicit WITH CHECK is defense in depth against
-- any future widening of the update column grant. Ended chats are immutable.
drop policy if exists chats_owner_card on public.chats;
create policy chats_owner_card on public.chats for update to authenticated
  using (status = 'active' and exists (
    select 1 from public.friends f
    where f.id = chats.friend_id and f.owner_id = auth.uid()))
  with check (exists (
    select 1 from public.friends f
    where f.id = chats.friend_id and f.owner_id = auth.uid()));

grant update (suitor_card), select (suitor_card) on public.chats to authenticated;

-- get_chat: card key appended ONLY in the friend-role branch — the key must be
-- entirely absent (not null-valued) from guest payloads.
create or replace function public.get_chat(p_token text) returns jsonb
language plpgsql security definer set search_path = public stable as $$
declare v record; v_out jsonb;
begin
  select c.id, c.status, c.ended_by, c.broadcast_key, r.role, f.first_name,
         w.display_name, c.suitor_card
    into v
    from public._chat_for(p_token) r
    join chats c on c.id = r.chat_id
    join friends f on f.id = c.friend_id
    join wingpeople w on w.id = f.owner_id;
  if v is null then return null; end if;
  v_out := jsonb_build_object(
    'status', v.status, 'ended_by', v.ended_by, 'role', v.role,
    'friend_name', v.first_name, 'wingperson_name', v.display_name,
    'broadcast_key', v.broadcast_key,
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('sender', m.sender, 'body', m.body,
                                          'created_at', m.created_at)
                       order by m.created_at)
      from messages m where m.chat_id = v.id), '[]'::jsonb));
  if v.role = 'friend' and v.suitor_card is not null then
    v_out := v_out || jsonb_build_object('suitor_card', v.suitor_card);
  end if;
  return v_out;
end $$;
```

(Execute grants on `get_chat` survive `create or replace` — do not repeat 003's grant lines.)

- [ ] **Step 4: Apply to the live project**

Apply via the Supabase MCP `apply_migration` tool: project `gyhqbnyuufntgdmowrbi`, name `008_suitor_card`, query = the file's exact contents.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --experimental-websocket backend/tests/05-suitor-card.mjs`
Expected: `05-suitor-card PASS`

Then run the full existing suites to prove no regression:
`for f in 01-schema-rls 02-profile-chat 03-chat-stop 04-photos e2e-live; do node --experimental-websocket backend/tests/$f.mjs || break; done`
Expected: every suite prints its PASS line (e2e-live prints per-step PASS lines and exits 0).

- [ ] **Step 6: Commit**

```bash
git add backend/migrations/008_suitor_card.sql backend/tests/05-suitor-card.mjs
git commit -m "feat: suitor_card column, owner write policy, friend-only get_chat payload"
```

---

### Task 2: iOS app — "Who did they meet?" sheet

**Files:**
- Create: `app/app/suitor-card.tsx`
- Modify: `app/src/types.ts` (add `SuitorCard`)
- Modify: `app/app/_layout.tsx:31-33` (register modal route)
- Modify: `app/app/(tabs)/chats.tsx:27-29` (Forward opens the sheet)

**Interfaces:**
- Consumes: `chats.suitor_card` write/read from Task 1; existing `uploadPhoto(uri): Promise<string>` (`app/src/lib/photos.ts`), `WEB_BASE_URL` (`app/src/lib/config.ts`), theme tokens (`app/src/theme.ts`).
- Produces: route `/suitor-card?chat=<uuid>&token=<friend_token>&name=<friendName>`; type `SuitorCard = { name?: string; photo?: string; ig?: string; tags?: string[] }`. The share message string must remain byte-identical to today's (`chats.tsx:28`).

**Load the `impeccable:impeccable` skill before writing this UI.** No unit-test infra exists in `app/` — the test cycle is `tsc` + `eslint` (Step 4) plus the manual pass in Task 4.

- [ ] **Step 1: Add the type**

In `app/src/types.ts`, append:

```ts
export type SuitorCard = { name?: string; photo?: string; ig?: string; tags?: string[] };
```

- [ ] **Step 2: Create the sheet**

Create `app/app/suitor-card.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Share, StyleSheet,
         Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../src/lib/supabase';
import { uploadPhoto } from '../src/lib/photos';
import { WEB_BASE_URL } from '../src/lib/config';
import { SuitorCard } from '../src/types';
import { colors, radii, spacing, buttonBase, brandGlow, cardBase } from '../src/theme';

// On-voice vouch reasons the wingperson taps at the party.
const VOUCH_TAGS = ['funny', 'has a good job', 'your type', 'tall', 'great style',
                    'good texter', 'friend of a friend', 'certified normal'];
const IG_RE = /^[A-Za-z0-9._]{1,30}$/;

export default function SuitorCardSheet() {
  const { chat, token, name } = useLocalSearchParams<{ chat: string; token: string; name: string }>();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [suitorName, setSuitorName] = useState('');
  const [ig, setIg] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState('');

  // Re-opening the sheet pre-fills the existing card (fix a typo, add the photo).
  useEffect(() => {
    supabase.from('chats').select('suitor_card').eq('id', chat).single().then(({ data }) => {
      const c = (data?.suitor_card ?? null) as SuitorCard | null;
      if (!c) return;
      setPhoto(c.photo ?? null); setSuitorName(c.name ?? '');
      setIg(c.ig ?? ''); setTags(c.tags ?? []);
    });
  }, [chat]);

  const toggle = (t: string) =>
    setTags((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));

  const pickPhoto = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7,
      allowsEditing: true, aspect: [4, 5] });
    if (r.canceled) return;
    setBusy(true);
    try { setPhoto(await uploadPhoto(r.assets[0].uri)); }
    catch (e: any) { Alert.alert('Upload failed', e.message); }
    setBusy(false);
  };

  // Forwarding the link is the sacred path: a failed save never blocks the share.
  const share = async (withCard: boolean) => {
    setSharing(true);
    if (withCard) {
      const card: SuitorCard = {};
      if (photo) card.photo = photo;
      if (suitorName.trim()) card.name = suitorName.trim();
      const handle = ig.trim().replace(/^@/, '');
      if (handle && !IG_RE.test(handle)) {
        setSharing(false);
        return Alert.alert('That Instagram handle doesn’t look right',
          'Letters, numbers, dots and underscores only.');
      }
      if (handle) card.ig = handle;
      const all = [...new Set([...tags, customTag.trim()].filter(Boolean))];
      if (all.length) card.tags = all;
      const { error } = await supabase.from('chats')
        .update({ suitor_card: Object.keys(card).length ? card : null }).eq('id', chat);
      if (error) Alert.alert('Card didn’t save', `${error.message}\nSharing the link anyway.`);
    }
    await Share.share({
      message: `Someone met you through me and wants to chat 👀 Your private Matchbook link (type STOP anytime to end it): ${WEB_BASE_URL}/c/${token}`,
    });
    setSharing(false);
    router.back();
  };

  return (
    <ScrollView style={s.wrap} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 60 }}
                keyboardShouldPersistTaps="handled">
      <Text style={s.title}>Who did they meet?</Text>
      <Text style={s.sub}>Give {name || 'your friend'} a peek before they say yes. Everything’s optional.</Text>

      <Pressable style={[s.photo, !photo && s.photoAdd]} onPress={pickPhoto} disabled={busy}>
        {photo ? <Image source={{ uri: photo }} style={s.photo} />
               : busy ? <ActivityIndicator color={colors.muted} />
                      : <Text style={s.photoHint}>+ add their photo</Text>}
      </Pressable>

      <TextInput style={s.input} placeholder="Their first name" placeholderTextColor={colors.muted}
        value={suitorName} onChangeText={setSuitorName} autoCapitalize="words" />
      <View style={s.igRow}>
        <Text style={s.at}>@</Text>
        <TextInput style={[s.input, { flex: 1 }]} placeholder="their.instagram"
          placeholderTextColor={colors.muted} value={ig} onChangeText={setIg}
          autoCapitalize="none" autoCorrect={false} />
      </View>

      <Text style={s.label}>Why you’re introducing them</Text>
      <View style={s.chips}>
        {VOUCH_TAGS.map((t) => (
          <Pressable key={t} onPress={() => toggle(t)}
            style={[s.chip, tags.includes(t) && s.chipOn]}>
            <Text style={[s.chipText, tags.includes(t) && s.chipTextOn]}>{t}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput style={s.input} placeholder="add your own…" placeholderTextColor={colors.muted}
        value={customTag} onChangeText={setCustomTag} autoCapitalize="none"
        onSubmitEditing={() => { const t = customTag.trim();
          if (t) { setTags((p) => (p.includes(t) ? p : [...p, t])); setCustomTag(''); } }} />

      <Pressable style={({ pressed }) => [s.primary, pressed && { backgroundColor: colors.brandDeep }]}
        onPress={() => share(true)} disabled={sharing || busy}>
        {sharing ? <ActivityIndicator color={colors.onBrand} />
                 : <Text style={s.primaryText}>Share the link</Text>}
      </Pressable>
      <Pressable style={s.skip} onPress={() => share(false)} disabled={sharing}>
        <Text style={s.skipText}>Skip — just share the link</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 26, fontWeight: '900', letterSpacing: -0.5, color: colors.ink },
  sub: { color: colors.muted, fontSize: 14, lineHeight: 20, marginBottom: 4 },
  photo: { width: 120, height: 150, borderRadius: radii.md, backgroundColor: colors.elevated,
           alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  photoAdd: { borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed' },
  photoHint: { color: colors.muted, fontSize: 13 },
  input: { ...cardBase, borderRadius: radii.md, color: colors.ink, paddingHorizontal: 14,
           paddingVertical: 12, fontSize: 16 },
  igRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  at: { color: colors.muted, fontSize: 18, fontWeight: '700' },
  label: { color: colors.muted, fontSize: 13, fontWeight: '700', textTransform: 'uppercase',
           letterSpacing: 0.6, marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderRadius: radii.pill, borderWidth: 1, borderColor: colors.line,
          backgroundColor: colors.surface, paddingVertical: 8, paddingHorizontal: 14 },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  chipTextOn: { color: colors.onBrand },
  primary: { ...buttonBase, ...brandGlow, backgroundColor: colors.brand, marginTop: 10 },
  primaryText: { color: colors.onBrand, fontWeight: '800', fontSize: 17 },
  skip: { ...buttonBase, minHeight: 44 },
  skipText: { color: colors.muted, fontWeight: '500', fontSize: 15 },
});
```

- [ ] **Step 3: Wire the route and the Forward button**

In `app/app/_layout.tsx`, after the `friend/[id]` screen (line 31-32), add:

```tsx
      <Stack.Screen name="suitor-card" options={{ headerShown: true, title: '', presentation: 'modal',
        headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.ink, headerShadowVisible: false }} />
```

In `app/app/(tabs)/chats.tsx`: add `useRouter` to the expo-router import (line 3: `import { useFocusEffect, useRouter } from 'expo-router';`), remove `Share` from the react-native import (line 2), add `const router = useRouter();` inside the component, and replace the `forward` function (lines 27-29) with:

```tsx
  const forward = (r: Row) => router.push({
    pathname: '/suitor-card',
    params: { chat: r.id, token: r.friend_token, name: r.friendName },
  });
```

- [ ] **Step 4: Verify — typecheck and lint**

Run: `cd app && npx tsc --noEmit && npx eslint .`
Expected: both exit 0 with no output (warnings acceptable only if pre-existing).

- [ ] **Step 5: Commit**

```bash
git add app/app/suitor-card.tsx app/src/types.ts app/app/_layout.tsx "app/app/(tabs)/chats.tsx"
git commit -m "feat: suitor card sheet between Forward and the share sheet"
```

---

### Task 3: Web — the friend sees the card

**Files:**
- Modify: `web/chat.html` (invite-gate markup ~line 215-224, CSS in the invite block ~line 127-195, JS `load()` ~line 260-285)

**Interfaces:**
- Consumes: `get_chat` payload key `suitor_card` (Task 1) — present only for friend role with a non-null card; shape `{name?, photo?, ig?, tags?}` with server-validated `ig` and `photo`, but `tags` elements are NOT server-typed (filter to strings client-side).
- Produces: nothing downstream.

**Load the `impeccable:impeccable` skill before writing this UI.** Rendering rules from Global Constraints are mandatory (`createElement`/`textContent`; `img.src` assignment only, with `onerror` removal; IG link = `'https://instagram.com/' + encodeURIComponent(handle)` gated on `^[A-Za-z0-9._]{1,30}$`, `target="_blank" rel="noopener noreferrer"`; never assign a card value directly to `href`).

- [ ] **Step 1: Markup**

Inside `.inviteCard` in `web/chat.html`, add an empty card container between the emoji div and the `<h2>`, and give the gate a second heading role for the about-overlay reuse:

```html
    <div id="sCard"></div>
```

In the header line (`<header class="hidden" id="hdr">…`), add a ghost button before End chat:

```html
<button id="about" class="hidden ghostBtn"></button>
```

- [ ] **Step 2: CSS** (inside the existing `<style>`, after the `.inviteCard button.ghost` rule; use existing `var(--…)` tokens only)

```css
  #sCard { display: contents; }
  .sPhoto {
    width: 148px; height: 185px; object-fit: cover; border-radius: 18px;
    margin: 0 auto; display: block;
    box-shadow: 0 10px 34px rgba(255, 46, 99, 0.3);
    opacity: 0; animation: fade-up 320ms var(--ease-out-quart) 0ms both;
  }
  .sTags { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center;
    margin-top: 14px; opacity: 0; animation: fade-up 320ms var(--ease-out-quart) 60ms both; }
  .sTag { border: 1px solid var(--line); border-radius: 999px; padding: 6px 12px;
    font-size: 13px; font-weight: 600; color: var(--ink); }
  .sIg { display: inline-block; margin-top: 12px; color: var(--brand);
    font-weight: 700; font-size: 15px; text-decoration: none;
    opacity: 0; animation: fade-up 320ms var(--ease-out-quart) 90ms both; }
  .ghostBtn { background: none; border: 0; color: var(--muted); font-size: 13px;
    font-weight: 600; min-height: 44px; padding: 0 10px; }
```

Also extend the reduced-motion block's selector list with `.inviteCard .sPhoto, .inviteCard .sTags, .inviteCard .sIg`.

- [ ] **Step 3: JS — render + gate + about overlay**

Add above `load()`:

```js
  const IG_OK = (h) => typeof h === 'string' && /^[A-Za-z0-9._]{1,30}$/.test(h);
  function renderCard(card) {
    const wrap = $('sCard'); wrap.replaceChildren();
    if (!card || typeof card !== 'object') return false;
    let any = false;
    if (typeof card.photo === 'string') {
      const img = document.createElement('img');
      img.className = 'sPhoto'; img.alt = '';
      img.onerror = () => img.remove();
      img.src = card.photo;
      wrap.appendChild(img); any = true;
    }
    const tags = Array.isArray(card.tags) ? card.tags.filter((t) => typeof t === 'string') : [];
    if (tags.length) {
      const row = document.createElement('div'); row.className = 'sTags';
      for (const t of tags) {
        const c = document.createElement('span'); c.className = 'sTag';
        c.textContent = t; row.appendChild(c);
      }
      wrap.appendChild(row); any = true;
    }
    if (IG_OK(card.ig)) {
      const a = document.createElement('a'); a.className = 'sIg';
      a.href = 'https://instagram.com/' + encodeURIComponent(card.ig);
      a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.textContent = '@' + card.ig;
      wrap.appendChild(a); any = true;
    }
    return any || typeof card.name === 'string';
  }
```

In `load()`, replace the friend-side intro-gate block (currently `if (c.role === 'friend' && !entered && …) { $('inviteTitle').textContent = …; $('invite').classList.remove('hidden'); }`) with:

```js
    const suitorName = typeof c.suitor_card?.name === 'string' ? c.suitor_card.name : null;
    const gateTitle = (c.wingperson_name || 'Your friend')
      + ' vouches for ' + (suitorName || 'this');
    const hasCard = c.role === 'friend' && renderCard(c.suitor_card);
    if (c.role === 'friend' && !entered && !c.messages.some((m) => m.sender === 'friend')) {
      $('inviteTitle').textContent = gateTitle;
      $('invite').classList.remove('hidden');
    }
    if (hasCard) {
      $('about').textContent = 'about ' + (suitorName || 'them');
      $('about').classList.remove('hidden');
      $('about').onclick = () => {
        $('inviteTitle').textContent = gateTitle;
        $('decline').classList.add('hidden');
        $('enter').textContent = 'Back to chat';
        $('invite').classList.remove('hidden');
      };
    }
```

(The existing `$('enter')` click handler already hides the overlay and stores the entered flag — re-using it as "Back to chat" needs no new code path. Verify the handler only hides/stores; if it does anything guest-visible, keep it friend-only as today.)

- [ ] **Step 4: Verify locally against live backend**

Seed a chat with a card: create a throwaway script at `backend/tests/tmp-seed-card.mjs` (it must live in `backend/tests/` for its `node_modules`; do NOT commit it):

```js
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const cfg = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const anon = () => createClient(cfg.url, cfg.anonKey, { auth: { persistSession: false } });
const rand = () => Math.random().toString(36).slice(2, 10);
const owner = anon();
const { data: su } = await owner.auth.signUp({
  email: `test-${rand()}@matchbook-test.com`, password: 'test-pass-123!' });
await owner.from('wingpeople').update({ display_name: 'Lia' }).eq('id', su.user.id);
const { data: f } = await owner.from('friends')
  .insert({ first_name: 'Jenny', consented: true }).select().single();
await anon().rpc('create_chat', { p_slug: f.share_slug });
const { data: row } = await owner.from('chats')
  .select('id, friend_token').eq('friend_id', f.id).single();
await owner.from('chats').update({ suitor_card: {
  name: 'Dan', ig: 'dan.example', tags: ['funny', 'has a good job', 'your type'],
} }).eq('id', row.id);
console.log(`friend gate: /c/${row.friend_token}`);
```

Run `node --experimental-websocket backend/tests/tmp-seed-card.mjs`, serve `web/` with the preview tools (static server on any port with `/c/*` → `chat.html` rewrite per `web/` deploy config — check `web/_redirects` or `netlify.toml` for the rewrite rule; if serving raw, open `chat.html` and hardcode the token temporarily is NOT acceptable — replicate the rewrite), and check with preview snapshot/console:
- Friend URL: gate shows "Lia vouches for Dan", three chips, `@dan.example` link with `href="https://instagram.com/dan.example"`, no photo element (none set), zero console errors.
- After Enter chat: header shows "about Dan"; tapping it reopens the card with "Back to chat".
- A second seeded chat **without** a card: gate identical to today ("Lia vouches for this", no card elements).
- Guest URL of the same chat: no card anywhere, no `suitor_card` in the `get_chat` network response.
Then `rm backend/tests/tmp-seed-card.mjs`.

- [ ] **Step 5: Commit**

```bash
git add web/chat.html
git commit -m "feat: suitor card on the friend intro gate + about overlay"
```

---

### Task 4: Checklist, docs, deploy

**Files:**
- Modify: `docs/superpowers/manual-test-checklist.md` (append a section)
- Modify: `MATCHBOOK.md` (status + concept blurb)

**Interfaces:**
- Consumes: everything above.
- Produces: shipped feature; updated regression docs.

- [ ] **Step 1: Append to the manual checklist**

Add a new numbered section at the end (use the next number after the file's last section):

```markdown
## <next number>. Suitor card (wingman → friend)
In the app, tap **Forward** on an active chat.
**Expected:** the "Who did they meet?" sheet appears (not the share sheet). Add a photo,
name, IG, tap 2 vouch chips, tap **Share the link** — share sheet opens with the same
message as before. Re-tap Forward: sheet reopens pre-filled. Tap **Skip** on another
chat: share sheet opens immediately, nothing saved.
Open the friend link on a chat with a card.
**Expected:** gate reads "<Wingperson> vouches for <Name>" with photo, chips, tappable
@handle (opens instagram.com/<handle>); after entering, an "about <Name>" header button
reopens the card. A chat without a card shows today's plain gate. The guest side never
shows any of it (and `get_chat` for the guest token has no `suitor_card` key).
```

- [ ] **Step 2: Update MATCHBOOK.md**

In the concept section, after the intro-gate sentence (step 3 of the numbered flow), add one sentence: `Before forwarding, the wingperson can attach an optional suitor card — photo, first name, Instagram, and tapped vouch reasons — that only the friend sees at the gate.` In Build status, add a line under "Done and verified" once tasks 1-3 are merged and verified: `Suitor card (2026-07-08): migration 008, app sheet, friend-gate card; suite 05 + full regression pass.`

- [ ] **Step 3: Deploy the web app**

Deploy `web/` to Netlify site `de9934fc-b459-4299-86a6-46f299c2e824` using the same flow as previous deploys (Netlify MCP deploy-services, or the zip drag-drop Lia uses — the `web/deploy-*.zip` files are artifacts of that flow; exclude `*.zip` from the new bundle). **Flag to Lia before deploying:** the working tree's dark-theme changes to `web/*.html` ship with it (they were already pending deploy per MATCHBOOK.md — confirm that's still desired in the same breath).

- [ ] **Step 4: Verify live + full regression**

Run the whole backend suite against live (same loop command as Task 1 Step 5) — all PASS. Repeat Task 3 Step 4's checks against `https://matchbook-party.netlify.app`. Walk the new manual-checklist section on a device/simulator for the app side.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/manual-test-checklist.md MATCHBOOK.md
git commit -m "docs: suitor card regression checklist + project brief update"
```

---

## Out of scope (from the spec)

Guest-supplied self-info; storage GC for orphaned photos (v2 follow-up); realtime card updates on an open chat page; EAS/TestFlight build (rides the existing pending build once the dark theme lands).
