# Gender Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the wingperson filter her roster (and the party-mode deck) by guys / girls / nonbinary friends, via a private optional `gender` field.

**Architecture:** One nullable `gender` column on `friends` (checked to `'guy' | 'girl' | 'nonbinary'`), deliberately excluded from `get_profile()` so the public web profile never shows it. The friend editor sets it with the existing chip pattern; the roster filters client-side with a chip row; the roster passes the active filter to `/deck` as a route param and the deck adds one `.eq()` to its query.

**Tech Stack:** Supabase (Postgres migration applied via Supabase MCP `apply_migration`), Expo SDK 57 / React Native / expo-router, backend tests are plain Node `.mjs` scripts under `backend/tests/`.

**Spec:** `docs/superpowers/specs/2026-07-08-gender-filter-design.md`

## Global Constraints

- Expo docs are versioned: consult https://docs.expo.dev/versions/v57.0.0/ before writing app code (per `app/AGENTS.md`).
- Gender values are exactly `'guy' | 'girl' | 'nonbinary'`, nullable, no default.
- Gender is PRIVATE: it must never be added to `get_profile()` or any public payload.
- Chip UI copy: filter chips read **All / Guys / Girls / Enby** (Enby only when a nonbinary friend exists); editor chips read lowercase `guy / girl / nonbinary`.
- Use theme tokens from `app/src/theme.ts` (`colors`, `radii`, `spacing`) — no hardcoded colors.
- App has no automated test suite; app tasks verify with `npx tsc --noEmit` and `npm run lint` (run from `app/`).
- Backend tests run against the live project: `cd backend/tests && node 06-gender.mjs`.

---

### Task 1: Migration 008 — `gender` column + backend test

**Files:**
- Create: `backend/tests/06-gender.mjs`
- Create: `backend/migrations/008_gender.sql`

**Interfaces:**
- Produces: `friends.gender` column (`text`, nullable, check-constrained to `guy|girl|nonbinary`) that Tasks 2–4 read and write. `get_profile()` is untouched.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/06-gender.mjs` (same harness pattern as `01-schema-rls.mjs`):

```js
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import assert from 'assert';

const cfg = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const anon = () => createClient(cfg.url, cfg.anonKey, { auth: { persistSession: false } });
const rand = () => Math.random().toString(36).slice(2, 10);

async function signUp() {
  const c = anon();
  const email = `test-${rand()}@matchbook-test.com`;
  const { data, error } = await c.auth.signUp({ email, password: 'test-pass-123!' });
  assert(!error, `signup failed: ${error?.message}`);
  assert(data.session, 'no session — is Confirm email disabled?');
  return c;
}

const a = await signUp();

// gender persists on insert
const { data: f, error: fe } = await a.from('friends')
  .insert({ first_name: 'Mina', gender: 'girl', consented: true }).select().single();
assert(!fe, `insert with gender failed: ${fe?.message}`);
assert(f.gender === 'girl', 'gender not persisted');

// null is allowed (existing friends are untouched)
const { data: n, error: ne } = await a.from('friends')
  .insert({ first_name: 'Noah' }).select().single();
assert(!ne, `insert without gender failed: ${ne?.message}`);
assert(n.gender === null, 'gender should default to null');

// invalid value rejected by the check constraint
const { error: bad } = await a.from('friends').insert({ first_name: 'Bad', gender: 'alien' });
assert(bad, 'check constraint missing: invalid gender accepted');

// gender stays private — public profile payload must not include it
const { data: prof, error: pe } = await anon().rpc('get_profile', { p_slug: f.share_slug });
assert(!pe, `get_profile failed: ${pe?.message}`);
assert(prof && !('gender' in prof), 'gender leaked into public profile');

// owner can filter by gender
const { data: girls } = await a.from('friends').select('id').eq('gender', 'girl');
assert(girls.some((r) => r.id === f.id), 'gender filter query missed the friend');

console.log('06-gender PASS');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend/tests && node 06-gender.mjs`
Expected: FAIL on the first insert — `insert with gender failed: column "gender" of relation "friends" does not exist` (message wording may vary; the point is the gender insert errors).

- [ ] **Step 3: Write the migration**

Create `backend/migrations/008_gender.sql`:

```sql
-- Private organizing field for the wingperson. Deliberately NOT added to
-- get_profile(): matches never see it.
alter table public.friends
  add column if not exists gender text
  check (gender in ('guy', 'girl', 'nonbinary'));
```

- [ ] **Step 4: Apply the migration to the live project**

Use the Supabase MCP tool `apply_migration` with name `gender` and the SQL above (find the project id via `list_projects` if needed — same project the app's `config.json` points at). Migration 007 was applied the same way.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend/tests && node 06-gender.mjs`
Expected: `06-gender PASS`

- [ ] **Step 6: Commit**

```bash
git add backend/migrations/008_gender.sql backend/tests/06-gender.mjs
git commit -m "feat: gender column on friends — private, check-constrained, excluded from get_profile"
```

---

### Task 2: `Friend` type + gender chips in the friend editor

**Files:**
- Modify: `app/src/types.ts`
- Modify: `app/app/friend/[id].tsx` (gender row after the Age/City row ~line 98; save `row` object ~line 55)

**Interfaces:**
- Consumes: `friends.gender` column from Task 1.
- Produces: `Gender` type and `Friend.gender: Gender | null` in `app/src/types.ts`, used by Tasks 3–4.

- [ ] **Step 1: Add the type**

In `app/src/types.ts`, add a `Gender` type and extend `Friend`:

```ts
export type Gender = 'guy' | 'girl' | 'nonbinary';
```

and inside `Friend`, after `interests: string[];`:

```ts
  gender: Gender | null;
```

- [ ] **Step 2: Add the gender chip row to the editor**

In `app/app/friend/[id].tsx`, directly AFTER the Age/City row (the `<View style={{ flexDirection: 'row', gap: 12 }}>` block containing the Age and City inputs) and BEFORE the Job/Height row, insert:

```tsx
      <View style={s.rowBetween}>
        <Text style={s.label}>Gender</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['guy', 'girl', 'nonbinary'] as const).map((g) => (
            <Pressable key={g} style={[s.chip, f.gender === g && s.chipOn]}
              onPress={() => set({ gender: f.gender === g ? null : g })}>
              <Text style={f.gender === g ? s.chipOnText : s.chipText}>{g}</Text>
            </Pressable>
          ))}
        </View>
      </View>
```

This reuses the existing `s.rowBetween` / `s.chip` / `s.chipOn` styles (the Status row pattern). Tapping the selected chip again unsets it back to `null`. No new styles needed.

- [ ] **Step 3: Include gender in the save payload**

In the `row` object inside `save()` (currently ends with the `interests:` line), add:

```ts
      gender: f.gender ?? null,
```

- [ ] **Step 4: Verify types and lint**

Run: `cd app && npx tsc --noEmit && npm run lint`
Expected: both exit clean (no new errors).

- [ ] **Step 5: Commit**

```bash
git add app/src/types.ts "app/app/friend/[id].tsx"
git commit -m "feat: optional gender chips (guy/girl/nonbinary) in the friend editor"
```

---

### Task 3: Roster filter chips + party button carries the filter

**Files:**
- Modify: `app/app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: `Gender` and `Friend.gender` from Task 2.
- Produces: routes to `/deck?gender=<guy|girl|nonbinary>` (param omitted for All) — Task 4 reads this exact param name.

- [ ] **Step 1: Add filter state and derived lists**

In `app/app/(tabs)/index.tsx`, import `Gender` alongside `Friend`:

```ts
import { Friend, Gender } from '../../src/types';
```

Inside `Roster()`, after the existing `useState` hooks, add:

```tsx
  type GenderFilter = 'all' | Gender;
  const FILTER_LABELS: Record<GenderFilter, string> = {
    all: 'All', guy: 'Guys', girl: 'Girls', nonbinary: 'Enby',
  };
  const [filter, setFilter] = useState<GenderFilter>('all');
  const hasEnby = friends.some((f) => f.gender === 'nonbinary');
  const filters: GenderFilter[] = hasEnby ? ['all', 'guy', 'girl', 'nonbinary'] : ['all', 'guy', 'girl'];
  const shown = filter === 'all' ? friends : friends.filter((f) => f.gender === filter);
```

(Friends with `gender = null` only appear under All — the strict equality does this for free.)

- [ ] **Step 2: Render the chip row and filter the list**

Directly above the `<FlatList>` (after the `needsName` card block), add — only when there are friends:

```tsx
      {friends.length > 0 && (
        <View style={s.filterRow}>
          {filters.map((g) => (
            <Pressable key={g} style={[s.filterChip, filter === g && s.filterChipOn]} onPress={() => setFilter(g)}>
              <Text style={filter === g ? s.filterChipOnText : s.filterChipText}>{FILTER_LABELS[g]}</Text>
            </Pressable>
          ))}
        </View>
      )}
```

Change the FlatList to render the filtered list with a filter-aware empty state:

```tsx
        data={shown}
```

```tsx
        ListEmptyComponent={<Text style={s.empty}>
          {filter === 'all'
            ? 'Add your first single friend 💘'
            : `No ${FILTER_LABELS[filter].toLowerCase()} on your roster yet 💔`}
        </Text>}
```

- [ ] **Step 3: Carry the filter into party mode**

Change the deck button to pass the param and reflect the filter in its label:

```tsx
      {friends.length > 0 && (
        <Pressable style={({ pressed }) => [s.deckBtn, pressed && s.deckBtnPressed]}
          onPress={() => router.push(filter === 'all' ? '/deck' : `/deck?gender=${filter}`)}>
          <Text style={s.deckText}>
            🎉 Party mode{filter !== 'all' ? ` · ${FILTER_LABELS[filter].toLowerCase()}` : ''}
          </Text>
        </Pressable>
      )}
```

- [ ] **Step 4: Add the chip styles**

In the `StyleSheet.create` block, add (matching the editor chip look):

```ts
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  filterChip: { minHeight: 32, borderWidth: 1, borderColor: colors.line, borderRadius: radii.pill,
                paddingVertical: 6, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  filterChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  filterChipText: { color: colors.muted, fontWeight: '600' },
  filterChipOnText: { color: colors.onBrand, fontWeight: '700' },
```

- [ ] **Step 5: Verify types and lint**

Run: `cd app && npx tsc --noEmit && npm run lint`
Expected: both exit clean.

- [ ] **Step 6: Commit**

```bash
git add "app/app/(tabs)/index.tsx"
git commit -m "feat: All/Guys/Girls filter chips on roster; party mode inherits the filter"
```

---

### Task 4: Deck honors the gender param

**Files:**
- Modify: `app/app/deck.tsx`

**Interfaces:**
- Consumes: `?gender=<guy|girl|nonbinary>` route param from Task 3 (absent = all, current behavior).

- [ ] **Step 1: Read the param and filter the query**

In `app/app/deck.tsx`, change the router import to include `useLocalSearchParams`:

```ts
import { useLocalSearchParams, useRouter } from 'expo-router';
```

Inside `Deck()`, read the param and apply it in the existing effect:

```tsx
  const { gender } = useLocalSearchParams<{ gender?: string }>();

  useEffect(() => {
    let q = supabase.from('friends').select('*').eq('status', 'single').eq('consented', true);
    if (gender) q = q.eq('gender', gender);
    q.order('created_at').then(({ data }) => setFriends((data as Friend[]) ?? []));
  }, [gender]);
```

The existing empty state ("No live profiles — check status + consent.") stays as-is.

- [ ] **Step 2: Verify types and lint**

Run: `cd app && npx tsc --noEmit && npm run lint`
Expected: both exit clean.

- [ ] **Step 3: Commit**

```bash
git add app/app/deck.tsx
git commit -m "feat: party deck deals only the gender the roster filter selected"
```

---

### Task 5: Manual end-to-end verification

**Files:** none (verification only)

**Interfaces:**
- Consumes: everything above, running in the Expo app against the live backend.

- [ ] **Step 1: Walk the manual checklist from the spec**

Start the app (`cd app && npx expo start`) and verify on device/simulator:

1. Existing friends load fine with no gender set; all appear under All.
2. Open a friend → tap `girl` chip → Save → reopen: chip still selected. Tap it again → Save → reopen: unset.
3. Roster chips: Guys shows only guy-tagged friends; Girls only girl-tagged; friends with no gender show only under All; Enby chip appears only once a friend is tagged nonbinary.
4. Filter to Girls → button reads "🎉 Party mode · girls" → deck shows only girls. Back out, set All → deck shows everyone.
5. Open a friend's public link (`/p/<slug>`) in a browser — no gender anywhere.

- [ ] **Step 2: Report results**

All five pass → done. Anything fails → fix before claiming completion (superpowers:verification-before-completion).
