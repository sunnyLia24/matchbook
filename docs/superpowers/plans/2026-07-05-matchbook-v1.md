# Matchbook v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Matchbook v1 — an Expo iOS app where wingpeople manage single-friend profiles, plus a Supabase backend and two Netlify web pages that let anyone view a shared profile and chat account-free, with STOP permanently ending chats.

**Architecture:** Three pieces sharing one Supabase project: (1) Postgres schema with RLS where wingpeople own `friends` rows and anonymous visitors act only through SECURITY DEFINER RPC functions keyed on secret slugs/tokens; (2) two single-file vanilla-JS pages (profile, chat) on Netlify using supabase-js from CDN and Realtime broadcast for live messages; (3) an Expo (SDK 54, expo-router) iOS app mirroring `~/Claude/dear-date-mobile` patterns for auth, roster CRUD, party deck, sharing, and chat-status viewing.

**Tech Stack:** Supabase (Postgres, Auth, Storage, Realtime broadcast, pg_net), vanilla JS + supabase-js@2 CDN, Netlify, Expo SDK 54 / React Native 0.81 / expo-router 6, TypeScript, EAS Build → TestFlight.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-05-matchbook-v1-design.md` — read it before starting any task.
- All secret slugs/tokens: ≥128 bits, base64url, generated server-side by `matchbook_token()` (Task 3).
- STOP normalization is exactly: `upper(btrim(body)) = 'STOP'`; the STOP message is never stored or delivered; ended chats permanently reject sends — enforced in SQL, never only in UI.
- Anonymous web visitors NEVER select tables directly; only `get_profile`, `create_chat`, `get_chat`, `send_message`, `end_chat` RPCs.
- Wingpeople can never read `messages` (no grants). The app fetches only chat metadata columns.
- Message bodies: non-empty after trim, ≤ 2000 chars, always rendered as text (`textContent`, never `innerHTML`).
- Profile pages/chat creation require `status = 'single'` AND `consented = true`.
- Setting a friend's status to anything but `single` ends all their active chats (DB trigger).
- Monorepo layout: `backend/` (migrations, tests), `web/` (Netlify site), `app/` (Expo). Commit after every task.
- The Supabase anon key is public by design (same as Dear Date); the service role key must never appear in any file in this repo.
- The app scaffolded on Expo SDK 57 (accepted deviation from the original SDK 54 target; same architecture). Tasks 11–14: before using an SDK-sensitive API from this plan's code (expo-file-system `legacy` import, expo-image-picker `mediaTypes`, expo-notifications tokens), verify it exists in the installed SDK and adapt minimally if the API moved — the behavior contract in each task is what's binding, not the exact import path.
- Node test scripts are the backend test suite: run with `node --experimental-websocket backend/tests/<file>.mjs` (local Node is 20.x, whose supabase-js needs the WebSocket flag); they exit 0 on pass, non-zero with an assertion error on fail.

---

### Task 1: Repo scaffold + Supabase project + config plumbing

**Files:**
- Create: `README.md`, `.gitignore`, `backend/config.json`, `backend/tests/package.json`, `web/config.js`

**Interfaces:**
- Produces: `backend/config.json` = `{"url": "https://<ref>.supabase.co", "anonKey": "<anon key>"}` — every later backend test reads this. `web/config.js` defines `const SUPABASE_URL`, `const SUPABASE_ANON_KEY` (plain script, no export).

- [ ] **Step 1: Create the Supabase project**

Use the Supabase MCP: `list_organizations` → `get_cost` (project) → `confirm_cost` → `create_project` with name `matchbook`, then poll `get_project` until status is `ACTIVE_HEALTHY`. Record the project ref/URL and get the anon key via `get_publishable_keys`.

- [ ] **Step 2: Disable email confirmation** (needed for scripted test signups and friction-free TestFlight signups)

Manual dashboard step (MCP cannot change auth settings): supabase.com dashboard → project `matchbook` → Authentication → Sign In / Providers → Email → turn OFF "Confirm email". If running unattended, pause and ask Lia to do this; verify afterwards by signing up a throwaway user with the anon key and checking a session is returned immediately.

- [ ] **Step 3: Write scaffold files**

`.gitignore`:
```
node_modules/
.env
.DS_Store
app/ios/
app/.expo/
```

`backend/config.json` (real values from Step 1):
```json
{ "url": "https://REPLACE.supabase.co", "anonKey": "REPLACE" }
```

`web/config.js`:
```js
// Matchbook web config — anon key is public by design.
const SUPABASE_URL = 'https://REPLACE.supabase.co';
const SUPABASE_ANON_KEY = 'REPLACE';
```

`backend/tests/package.json`:
```json
{
  "name": "matchbook-backend-tests",
  "private": true,
  "type": "module",
  "dependencies": { "@supabase/supabase-js": "^2.104.0" }
}
```

`README.md`:
```markdown
# Matchbook

Wingperson app: keep profiles of your single friends, show them at parties,
share a link, and let people chat with your friend account-free. Either chat
participant can type STOP to permanently end the chat.

- `backend/` — Supabase migrations + node test scripts (`node backend/tests/<f>.mjs`)
- `web/` — Netlify site: `/p/<slug>` profile page, `/c/<token>` chat page
- `app/` — Expo iOS app for wingpeople (TestFlight)

Spec: docs/superpowers/specs/2026-07-05-matchbook-v1-design.md
```

- [ ] **Step 4: Install test deps and verify the project answers**

Run: `cd backend/tests && npm install && node -e "import('@supabase/supabase-js').then(async ({createClient})=>{const c=JSON.parse((await import('fs')).readFileSync('../config.json'));const s=createClient(c.url,c.anonKey);const {error}=await s.auth.getSession();if(error)throw error;console.log('OK')})"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: scaffold repo, create Supabase project, config plumbing"
```

---

### Task 2: Schema migration + RLS + signup trigger

**Files:**
- Create: `backend/migrations/001_schema.sql`
- Test: `backend/tests/01-schema-rls.mjs`

**Interfaces:**
- Produces tables: `wingpeople(id uuid pk, display_name text, expo_push_token text, created_at)`; `friends(id uuid pk default gen_random_uuid(), owner_id uuid, first_name text, age int, city text, pitch text, prompts jsonb default '[]', looking_for text, photos jsonb default '[]', status text default 'single', consented bool default false, share_slug text unique, created_at, updated_at)`; `chats(id uuid pk, friend_id uuid, status text default 'active', ended_by text, guest_token text unique, friend_token text unique, broadcast_key text, created_at, ended_at)`; `messages(id uuid pk, chat_id uuid, sender text, body text, created_at)`.
- Wingperson-readable chat columns (column-level grant): `id, friend_id, status, ended_by, friend_token, created_at, ended_at` — the app and later tests must select these explicitly, never `*`.

- [ ] **Step 1: Write the failing test**

`backend/tests/01-schema-rls.mjs`:
```js
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import assert from 'assert';

const cfg = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const anon = () => createClient(cfg.url, cfg.anonKey, { auth: { persistSession: false } });
const rand = () => Math.random().toString(36).slice(2, 10);

async function signUp() {
  const c = anon();
  const email = `test-${rand()}@matchbook-test.dev`;
  const { data, error } = await c.auth.signUp({ email, password: 'test-pass-123!' });
  assert(!error, `signup failed: ${error?.message}`);
  assert(data.session, 'no session — is Confirm email disabled?');
  return c;
}

const a = await signUp();
const b = await signUp();

// signup trigger created a wingpeople row
const { data: me } = await a.from('wingpeople').select('id, display_name').single();
assert(me, 'wingpeople row missing after signup');

// owner can insert a friend; share_slug is auto-generated and long
const { data: f, error: fe } = await a.from('friends')
  .insert({ first_name: 'Jenny', age: 29, city: 'NYC', pitch: 'The funniest person I know',
            consented: true }).select().single();
assert(!fe, `friend insert failed: ${fe?.message}`);
assert(f.share_slug && f.share_slug.length >= 22, 'share_slug not generated');
assert(f.status === 'single', 'default status wrong');

// another user cannot see it
const { data: leak } = await b.from('friends').select('id').eq('id', f.id);
assert(leak.length === 0, 'RLS LEAK: user B sees user A friend');

// anon (signed out) cannot see it
const { data: anonLeak } = await anon().from('friends').select('id');
assert((anonLeak ?? []).length === 0, 'RLS LEAK: anon sees friends');

// messages table is fully closed to authenticated users
const { error: me2 } = await a.from('messages').select('id').limit(1);
assert(me2, 'messages should be unreadable by wingpeople');

console.log('01-schema-rls PASS');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node backend/tests/01-schema-rls.mjs`
Expected: FAIL (relation `wingpeople` does not exist / wingpeople row missing)

- [ ] **Step 3: Write the migration**

`backend/migrations/001_schema.sql`:
```sql
-- Matchbook schema. Anonymous visitors act only via SECURITY DEFINER functions
-- (migration 002); tables are closed by default.
create extension if not exists pgcrypto;

-- url-safe random token, 18 bytes = 144 bits
create or replace function public.matchbook_token() returns text
language sql volatile as $$
  select translate(encode(gen_random_bytes(18), 'base64'), '+/=', '-_')
$$;

create table public.wingpeople (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  expo_push_token text,
  created_at timestamptz not null default now()
);

create table public.friends (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.wingpeople(id) on delete cascade,
  first_name text not null,
  age int check (age between 18 and 120),
  city text,
  pitch text,
  prompts jsonb not null default '[]',
  looking_for text,
  photos jsonb not null default '[]',
  status text not null default 'single' check (status in ('single','taken','hidden')),
  consented boolean not null default false,
  share_slug text not null unique default public.matchbook_token(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.chats (
  id uuid primary key default gen_random_uuid(),
  friend_id uuid not null references public.friends(id) on delete cascade,
  status text not null default 'active' check (status in ('active','ended')),
  ended_by text check (ended_by in ('guest','friend')), -- NULL passes checks implicitly
  guest_token text not null unique default public.matchbook_token(),
  friend_token text not null unique default public.matchbook_token(),
  broadcast_key text not null default public.matchbook_token(),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create index chats_friend_id_idx on public.chats(friend_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  sender text not null check (sender in ('guest','friend')),
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index messages_chat_id_idx on public.messages(chat_id, created_at);

-- signup trigger: every auth user gets a wingpeople row
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.wingpeople (id, display_name)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.wingpeople enable row level security;
alter table public.friends enable row level security;
alter table public.chats enable row level security;
alter table public.messages enable row level security;

create policy wp_own on public.wingpeople for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy friends_own on public.friends for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy chats_owner_read on public.chats for select to authenticated
  using (exists (select 1 from public.friends f
                 where f.id = chats.friend_id and f.owner_id = auth.uid()));

-- lock down grants: messages fully closed; chats column-limited (no guest_token,
-- no broadcast_key — the app never joins rooms)
revoke all on public.messages from anon, authenticated;
revoke all on public.chats from anon, authenticated;
grant select (id, friend_id, status, ended_by, friend_token, created_at, ended_at)
  on public.chats to authenticated;
revoke all on public.friends from anon;
revoke all on public.wingpeople from anon;
```

- [ ] **Step 4: Apply the migration**

Use Supabase MCP `apply_migration` with name `schema` and the file's contents. Verify with MCP `list_tables`: expect `wingpeople`, `friends`, `chats`, `messages` with `rls_enabled: true`.

- [ ] **Step 5: Run test to verify it passes**

Run: `node backend/tests/01-schema-rls.mjs`
Expected: `01-schema-rls PASS`

- [ ] **Step 6: Commit**

```bash
git add backend && git commit -m "feat: schema, RLS, signup trigger"
```

---

### Task 3: Anonymous RPCs — get_profile + create_chat

**Files:**
- Create: `backend/migrations/002_profile_chat_fns.sql`
- Test: `backend/tests/02-profile-chat.mjs`

**Interfaces:**
- Consumes: tables from Task 2.
- Produces (RPCs, callable with anon key):
  - `get_profile(p_slug text) returns jsonb` → `{first_name, age, city, pitch, looking_for, prompts, photos}` or SQL NULL when missing/not single/not consented.
  - `create_chat(p_slug text) returns jsonb` → `{"guest_token": "..."}` or NULL under the same conditions.

- [ ] **Step 1: Write the failing test**

`backend/tests/02-profile-chat.mjs`:
```js
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import assert from 'assert';

const cfg = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const anon = () => createClient(cfg.url, cfg.anonKey, { auth: { persistSession: false } });
const rand = () => Math.random().toString(36).slice(2, 10);

const owner = anon();
await owner.auth.signUp({ email: `test-${rand()}@matchbook-test.dev`, password: 'test-pass-123!' });
const mk = async (over = {}) => (await owner.from('friends').insert({
  first_name: 'Jenny', age: 29, pitch: 'Great taste in people', consented: true,
  prompts: [{ q: 'Ideal Sunday', a: 'Dim sum then a long walk' }], ...over,
}).select().single()).data;

const visitor = anon();
const f = await mk();

// happy path
const { data: prof, error: pe } = await visitor.rpc('get_profile', { p_slug: f.share_slug });
assert(!pe, `get_profile error: ${pe?.message}`);
assert(prof.first_name === 'Jenny' && prof.prompts[0].a.includes('Dim sum'), 'profile fields wrong');
assert(!('owner_id' in prof) && !('id' in prof), 'profile leaks internal fields');

// unavailable cases return null
for (const bad of [await mk({ status: 'taken' }), await mk({ status: 'hidden' }), await mk({ consented: false })]) {
  const { data } = await visitor.rpc('get_profile', { p_slug: bad.share_slug });
  assert(data === null, `profile should be unavailable (friend ${bad.id})`);
}
const { data: nope } = await visitor.rpc('get_profile', { p_slug: 'not-a-real-slug' });
assert(nope === null, 'bad slug should return null');

// create_chat
const { data: chat, error: ce } = await visitor.rpc('create_chat', { p_slug: f.share_slug });
assert(!ce && chat.guest_token?.length >= 22, 'create_chat should return guest_token');
const { data: noChat } = await visitor.rpc('create_chat', { p_slug: (await mk({ status: 'hidden' })).share_slug });
assert(noChat === null, 'create_chat must refuse unavailable profiles');

// owner sees chat metadata but cannot select guest_token or messages
const { data: rows, error: re } = await owner.from('chats')
  .select('id, status, friend_token, created_at').eq('friend_id', f.id);
assert(!re && rows.length === 1 && rows[0].status === 'active', 'owner metadata read failed');
const { error: gt } = await owner.from('chats').select('guest_token').eq('friend_id', f.id);
assert(gt, 'guest_token must not be selectable');

console.log('02-profile-chat PASS');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node backend/tests/02-profile-chat.mjs`
Expected: FAIL (`get_profile` not found)

- [ ] **Step 3: Write the migration**

`backend/migrations/002_profile_chat_fns.sql`:
```sql
create or replace function public.get_profile(p_slug text) returns jsonb
language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'first_name', f.first_name, 'age', f.age, 'city', f.city,
    'pitch', f.pitch, 'looking_for', f.looking_for,
    'prompts', f.prompts, 'photos', f.photos)
  from friends f
  where f.share_slug = p_slug and f.status = 'single' and f.consented
$$;

create or replace function public.create_chat(p_slug text) returns jsonb
language plpgsql security definer set search_path = public volatile as $$
declare v_friend uuid; v_token text;
begin
  select id into v_friend from friends
    where share_slug = p_slug and status = 'single' and consented;
  if v_friend is null then return null; end if;
  insert into chats (friend_id) values (v_friend) returning guest_token into v_token;
  return jsonb_build_object('guest_token', v_token);
end $$;

revoke all on function public.get_profile(text), public.create_chat(text) from public;
grant execute on function public.get_profile(text), public.create_chat(text) to anon, authenticated;
```

- [ ] **Step 4: Apply migration via MCP** (`apply_migration`, name `profile_chat_fns`)

- [ ] **Step 5: Run test to verify it passes**

Run: `node backend/tests/02-profile-chat.mjs`
Expected: `02-profile-chat PASS`

- [ ] **Step 6: Commit**

```bash
git add backend && git commit -m "feat: get_profile and create_chat RPCs"
```

---

### Task 4: Chat RPCs — get_chat, send_message (STOP), end_chat + status-change lock

**Files:**
- Create: `backend/migrations/003_chat_fns.sql`
- Test: `backend/tests/03-chat-stop.mjs`

**Interfaces:**
- Consumes: `chats`, `messages`, `matchbook_token()` from Tasks 2–3.
- Produces (RPCs, anon-callable):
  - `get_chat(p_token text) returns jsonb` → `{status, ended_by, role: 'guest'|'friend', friend_name, wingperson_name, broadcast_key, messages: [{sender, body, created_at}]}` or NULL for a bad token. `wingperson_name` is the friend's owner's `wingpeople.display_name` — the chat page's friend-side intro screen names them.
  - `send_message(p_token text, p_body text) returns jsonb` → `{"ok":true,"ended":false}` normal send (also broadcasts event `message` payload `{sender, body, created_at}` on Realtime topic `chat:<broadcast_key>`); `{"ok":true,"ended":true}` when body normalizes to STOP (broadcasts event `ended`, stores nothing); `{"ok":false,"error":"ended"|"invalid"|"not_found"}` otherwise.
  - `end_chat(p_token text) returns jsonb` → `{"ok":true,"ended":true}` (idempotent).
- Produces trigger: `friends` status leaving `'single'` → all that friend's active chats become `ended` (`ended_by` null, `ended_at` now()).

- [ ] **Step 1: Write the failing test**

`backend/tests/03-chat-stop.mjs`:
```js
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import assert from 'assert';

const cfg = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const anon = () => createClient(cfg.url, cfg.anonKey, { auth: { persistSession: false } });
const rand = () => Math.random().toString(36).slice(2, 10);

const owner = anon();
const ownerEmail = `test-${rand()}@matchbook-test.dev`;
await owner.auth.signUp({ email: ownerEmail, password: 'test-pass-123!' });
const newChat = async () => {
  const { data: f } = await owner.from('friends')
    .insert({ first_name: 'Jenny', consented: true }).select().single();
  const v = anon();
  const { data: c } = await v.rpc('create_chat', { p_slug: f.share_slug });
  const { data: row } = await owner.from('chats')
    .select('id, friend_token').eq('friend_id', f.id).single();
  return { v, f, guest: c.guest_token, friend: row.friend_token };
};

// send + history + roles
let t = await newChat();
let r = (await t.v.rpc('send_message', { p_token: t.guest, p_body: 'hi jenny!' })).data;
assert(r.ok && !r.ended, 'guest send failed');
r = (await t.v.rpc('send_message', { p_token: t.friend, p_body: 'hey! who is this?' })).data;
assert(r.ok, 'friend send failed');
let g = (await t.v.rpc('get_chat', { p_token: t.friend })).data;
assert(g.role === 'friend' && g.friend_name === 'Jenny' && g.broadcast_key.length >= 22, 'get_chat shape wrong');
assert(g.wingperson_name === ownerEmail.split('@')[0], 'wingperson_name missing/wrong (signup trigger defaults display_name to email prefix)');
assert(g.messages.length === 2 && g.messages[0].sender === 'guest', 'history wrong');
assert((await t.v.rpc('get_chat', { p_token: 'bogus' })).data === null, 'bad token must be null');

// STOP in all normalizations, from either side; never stored; permanently locks
for (const stop of ['STOP', 'stop', '  Stop  ']) {
  const s = await newChat();
  await s.v.rpc('send_message', { p_token: s.guest, p_body: 'hello' });
  const sr = (await s.v.rpc('send_message', { p_token: stop === 'stop' ? s.friend : s.guest, p_body: stop })).data;
  assert(sr.ok && sr.ended, `STOP variant ${JSON.stringify(stop)} did not end chat`);
  const after = (await s.v.rpc('get_chat', { p_token: s.guest })).data;
  assert(after.status === 'ended' && after.messages.length === 1, 'STOP stored or status wrong');
  const dead = (await s.v.rpc('send_message', { p_token: s.friend, p_body: 'please?' })).data;
  assert(!dead.ok && dead.error === 'ended', 'send to ended chat must be rejected');
}

// "stop it" is NOT a stop; empty/oversize are invalid
t = await newChat();
r = (await t.v.rpc('send_message', { p_token: t.guest, p_body: 'stop it' })).data;
assert(r.ok && !r.ended, '"stop it" wrongly ended chat');
assert(!(await t.v.rpc('send_message', { p_token: t.guest, p_body: '   ' })).data.ok, 'blank accepted');
assert(!(await t.v.rpc('send_message', { p_token: t.guest, p_body: 'x'.repeat(2001) })).data.ok, 'oversize accepted');

// end_chat button path
t = await newChat();
r = (await t.v.rpc('end_chat', { p_token: t.guest })).data;
assert(r.ok && r.ended, 'end_chat failed');

// friend status change locks active chats
t = await newChat();
await owner.from('friends').update({ status: 'taken' }).eq('id', t.f.id);
g = (await t.v.rpc('get_chat', { p_token: t.guest })).data;
assert(g.status === 'ended', 'status change must end active chats');

console.log('03-chat-stop PASS');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node backend/tests/03-chat-stop.mjs`
Expected: FAIL (`send_message` not found)

- [ ] **Step 3: Write the migration**

`backend/migrations/003_chat_fns.sql`:
```sql
-- resolve a participant token to (chat id, role)
create or replace function public._chat_for(p_token text)
returns table (chat_id uuid, role text)
language sql security definer set search_path = public stable as $$
  select id, case when guest_token = p_token then 'guest' else 'friend' end
  from chats where guest_token = p_token or friend_token = p_token
$$;

create or replace function public.get_chat(p_token text) returns jsonb
language plpgsql security definer set search_path = public stable as $$
declare v record;
begin
  select c.id, c.status, c.ended_by, c.broadcast_key, r.role, f.first_name,
         w.display_name
    into v
    from public._chat_for(p_token) r
    join chats c on c.id = r.chat_id
    join friends f on f.id = c.friend_id
    join wingpeople w on w.id = f.owner_id;
  if v is null then return null; end if;
  return jsonb_build_object(
    'status', v.status, 'ended_by', v.ended_by, 'role', v.role,
    'friend_name', v.first_name, 'wingperson_name', v.display_name,
    'broadcast_key', v.broadcast_key,
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('sender', m.sender, 'body', m.body,
                                          'created_at', m.created_at)
                       order by m.created_at)
      from messages m where m.chat_id = v.id), '[]'::jsonb));
end $$;

create or replace function public._end_chat_row(p_chat uuid, p_by text) returns void
language plpgsql security definer set search_path = public volatile as $$
declare v_key text;
begin
  update chats set status = 'ended', ended_by = p_by, ended_at = now()
    where id = p_chat and status = 'active'
    returning broadcast_key into v_key;
  if v_key is not null then
    perform realtime.send('{}'::jsonb, 'ended', 'chat:' || v_key, false);
  end if;
end $$;

create or replace function public.send_message(p_token text, p_body text) returns jsonb
language plpgsql security definer set search_path = public volatile as $$
declare v record; v_body text; v_key text; v_msg record;
begin
  select r.chat_id, r.role, c.status, c.broadcast_key into v
    from public._chat_for(p_token) r join chats c on c.id = r.chat_id;
  if v is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v.status <> 'active' then return jsonb_build_object('ok', false, 'error', 'ended'); end if;
  v_body := btrim(p_body);
  if v_body = '' or length(v_body) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if upper(v_body) = 'STOP' then
    perform public._end_chat_row(v.chat_id, v.role);
    return jsonb_build_object('ok', true, 'ended', true);
  end if;
  insert into messages (chat_id, sender, body) values (v.chat_id, v.role, v_body)
    returning sender, body, created_at into v_msg;
  perform realtime.send(
    jsonb_build_object('sender', v_msg.sender, 'body', v_msg.body,
                       'created_at', v_msg.created_at),
    'message', 'chat:' || v.broadcast_key, false);
  return jsonb_build_object('ok', true, 'ended', false);
end $$;

create or replace function public.end_chat(p_token text) returns jsonb
language plpgsql security definer set search_path = public volatile as $$
declare v record;
begin
  select r.chat_id, r.role into v from public._chat_for(p_token) r;
  if v is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  perform public._end_chat_row(v.chat_id, v.role);
  return jsonb_build_object('ok', true, 'ended', true);
end $$;

-- leaving 'single' ends all active chats
create or replace function public.handle_friend_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if new.status <> 'single' and old.status = 'single' then
    for c in select id from chats where friend_id = new.id and status = 'active' loop
      perform public._end_chat_row(c.id, null);
    end loop;
  end if;
  return new;
end $$;
create trigger on_friend_status_change after update of status on public.friends
  for each row execute function public.handle_friend_status();

revoke all on function public.get_chat(text), public.send_message(text, text),
  public.end_chat(text) from public;
grant execute on function public.get_chat(text), public.send_message(text, text),
  public.end_chat(text) to anon, authenticated;
revoke all on function public._chat_for(text), public._end_chat_row(uuid, text) from public, anon, authenticated;
```

- [ ] **Step 4: Apply migration via MCP** (`apply_migration`, name `chat_fns`)

- [ ] **Step 5: Run test to verify it passes**

Run: `node backend/tests/03-chat-stop.mjs`
Expected: `03-chat-stop PASS`

- [ ] **Step 6: Run all backend tests, check advisors, commit**

Run: `for f in backend/tests/0*.mjs; do node $f || exit 1; done` — all PASS.
Run MCP `get_advisors` (security): no ERROR-level findings on the new functions/tables (function search_path warnings should be absent since every function pins `search_path`).

```bash
git add backend && git commit -m "feat: chat RPCs with STOP enforcement and status-change locking"
```

---

### Task 5: Photo storage bucket + owner-scoped uploads

**Files:**
- Create: `backend/migrations/004_storage.sql`
- Test: `backend/tests/04-photos.mjs`

**Interfaces:**
- Produces: public bucket `photos`; authenticated users can write only under `<their-uid>/...`; app stores the full public URL (`<url>/storage/v1/object/public/photos/<uid>/<uuid>.jpg`) into `friends.photos` jsonb array. `get_profile` already returns `photos` as-is.

- [ ] **Step 1: Write the failing test**

`backend/tests/04-photos.mjs`:
```js
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import assert from 'assert';

const cfg = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const anon = () => createClient(cfg.url, cfg.anonKey, { auth: { persistSession: false } });
const rand = () => Math.random().toString(36).slice(2, 10);
const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));

const owner = anon();
const { data: su } = await owner.auth.signUp({ email: `test-${rand()}@matchbook-test.dev`, password: 'test-pass-123!' });
const uid = su.user.id;

// owner can upload into own folder
const path = `${uid}/${crypto.randomUUID()}.png`;
const { error: ue } = await owner.storage.from('photos').upload(path, png, { contentType: 'image/png' });
assert(!ue, `upload failed: ${ue?.message}`);

// public URL is fetchable without auth
const url = `${cfg.url}/storage/v1/object/public/photos/${path}`;
assert((await fetch(url)).ok, 'public photo URL not readable');

// cannot upload outside own folder
const { error: oe } = await owner.storage.from('photos').upload(`someone-else/${crypto.randomUUID()}.png`, png, { contentType: 'image/png' });
assert(oe, 'upload outside own folder must fail');

// bucket is not listable anonymously
const { data: listing } = await anon().storage.from('photos').list(uid);
assert((listing ?? []).length === 0, 'anon must not list photos');

console.log('04-photos PASS');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node backend/tests/04-photos.mjs`
Expected: FAIL (bucket not found)

- [ ] **Step 3: Write the migration**

`backend/migrations/004_storage.sql`:
```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy photos_owner_write on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy photos_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy photos_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy photos_owner_list on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
```

- [ ] **Step 4: Apply migration via MCP** (`apply_migration`, name `storage`)

- [ ] **Step 5: Run test to verify it passes**

Run: `node backend/tests/04-photos.mjs`
Expected: `04-photos PASS`

- [ ] **Step 6: Commit**

```bash
git add backend && git commit -m "feat: photos bucket with owner-scoped uploads"
```

---

### Task 6: Push notification on new chat (pg_net → Expo push API)

**Files:**
- Create: `backend/migrations/005_push.sql`
- Test: extend manual checklist (device push is verified in Task 14); automated test only asserts the trigger doesn't break chat creation.

**Interfaces:**
- Consumes: `chats`, `friends`, `wingpeople.expo_push_token` (written by Task 14).
- Produces: AFTER INSERT trigger on `chats` that POSTs `{to, title, body}` to `https://exp.host/--/api/v2/push/send` via `pg_net` when the owner has a push token. Failure is async and non-fatal by construction.

- [ ] **Step 1: Write the migration**

`backend/migrations/005_push.sql`:
```sql
create extension if not exists pg_net;

create or replace function public.notify_new_chat() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text; v_token text;
begin
  select f.first_name, w.expo_push_token into v_name, v_token
    from friends f join wingpeople w on w.id = f.owner_id
    where f.id = new.friend_id;
  if v_token is not null and v_token like 'ExponentPushToken%' then
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object(
        'to', v_token,
        'title', 'Matchbook',
        'body', 'Someone wants to talk to ' || v_name || '! Open the app to forward them the chat link.'));
  end if;
  return new;
end $$;
create trigger on_chat_created after insert on public.chats
  for each row execute function public.notify_new_chat();
```

- [ ] **Step 2: Apply migration via MCP** (`apply_migration`, name `push`)

- [ ] **Step 3: Verify chat creation still works with the trigger installed**

Run: `node backend/tests/03-chat-stop.mjs`
Expected: `03-chat-stop PASS` (trigger is exercised on every create_chat; no push token set, so no HTTP call)

- [ ] **Step 4: Commit**

```bash
git add backend && git commit -m "feat: push notification trigger on new chats"
```

---

### Task 7: Web profile page (`/p/<slug>`)

**Files:**
- Create: `web/_redirects`, `web/profile.html`
- Consumes: `web/config.js` (Task 1), `get_profile`, `create_chat` RPCs.

**Interfaces:**
- Produces: page at `/p/<share_slug>`. "Say hi 👋" → `create_chat` → `location.href = '/c/' + guest_token`. Unavailable/missing → friendly "This link isn't active" state with no detail.

- [ ] **Step 1: Write the redirects file**

`web/_redirects`:
```
/p/*  /profile.html  200
/c/*  /chat.html     200
```

- [ ] **Step 2: Write the page**

`web/profile.html` (complete file):
```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>Matchbook</title>
<style>
  :root { --ink:#2b2018; --paper:#faf5ef; --accent:#c4553d; --soft:#eadfd3; }
  * { box-sizing:border-box; margin:0; }
  body { font-family:-apple-system,'Helvetica Neue',sans-serif; background:var(--paper);
         color:var(--ink); min-height:100dvh; display:flex; justify-content:center; }
  .card { width:100%; max-width:430px; padding:20px 20px 40px; }
  .photos { display:flex; gap:8px; overflow-x:auto; scroll-snap-type:x mandatory;
            border-radius:20px; -webkit-overflow-scrolling:touch; }
  .photos img { width:100%; flex:none; aspect-ratio:4/5; object-fit:cover;
                border-radius:20px; scroll-snap-align:center; background:var(--soft); }
  h1 { font-size:32px; margin-top:18px; }
  h1 small { font-weight:400; color:#7a6a5b; font-size:22px; }
  .city { color:#7a6a5b; margin-top:2px; }
  .pitch { margin-top:14px; font-size:18px; line-height:1.45; }
  .pitch::before { content:'“'; color:var(--accent); }
  .pitch::after { content:'” — their wingperson'; color:#7a6a5b; font-size:14px; }
  .prompt { background:#fff; border:1px solid var(--soft); border-radius:16px;
            padding:14px 16px; margin-top:12px; }
  .prompt .q { font-size:12px; text-transform:uppercase; letter-spacing:.06em; color:#7a6a5b; }
  .prompt .a { margin-top:4px; font-size:17px; }
  .looking { margin-top:14px; color:#7a6a5b; font-size:15px; }
  button { width:100%; margin-top:26px; padding:16px; font-size:18px; font-weight:600;
           border:0; border-radius:16px; background:var(--accent); color:#fff; }
  button:disabled { opacity:.5; }
  .state { text-align:center; padding:34dvh 30px 0; color:#7a6a5b; font-size:17px; }
  .hidden { display:none; }
</style>
</head>
<body>
<div class="card hidden" id="card">
  <div class="photos" id="photos"></div>
  <h1><span id="name"></span> <small id="age"></small></h1>
  <div class="city" id="city"></div>
  <div class="pitch" id="pitch"></div>
  <div id="prompts"></div>
  <div class="looking" id="looking"></div>
  <button id="sayhi">Say hi 👋</button>
</div>
<div class="state hidden" id="state"></div>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="/config.js"></script>
<script>
  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const $ = (id) => document.getElementById(id);
  const slug = location.pathname.split('/')[2] || '';
  const showState = (msg) => { $('state').textContent = msg; $('state').classList.remove('hidden'); };

  async function load() {
    const { data: p, error } = await sb.rpc('get_profile', { p_slug: slug });
    if (error) return showState('Something went wrong — try again in a minute.');
    if (!p) return showState("This link isn't active.");
    document.title = p.first_name + ' · Matchbook';
    for (const url of (p.photos || [])) {
      const img = document.createElement('img'); img.src = url; $('photos').appendChild(img);
    }
    $('name').textContent = p.first_name;
    $('age').textContent = p.age ? p.age : '';
    $('city').textContent = p.city || '';
    $('pitch').textContent = p.pitch || '';
    for (const pr of (p.prompts || [])) {
      const d = document.createElement('div'); d.className = 'prompt';
      const q = document.createElement('div'); q.className = 'q'; q.textContent = pr.q;
      const a = document.createElement('div'); a.className = 'a'; a.textContent = pr.a;
      d.append(q, a); $('prompts').appendChild(d);
    }
    if (p.looking_for) $('looking').textContent = 'Looking for: ' + p.looking_for;
    $('card').classList.remove('hidden');
  }

  $('sayhi').addEventListener('click', async () => {
    $('sayhi').disabled = true; $('sayhi').textContent = 'Opening chat…';
    const { data, error } = await sb.rpc('create_chat', { p_slug: slug });
    if (error || !data) { $('sayhi').disabled = false; $('sayhi').textContent = 'Say hi 👋'; return; }
    location.href = '/c/' + data.guest_token;
  });

  load();
</script>
</body>
</html>
```

- [ ] **Step 3: Test locally against the real backend**

Seed a friend (reuse the test helper): `node -e "..."` — simplest is a tiny seed script; run:
`node backend/tests/seed-demo.mjs` — create this file:
```js
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const cfg = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const c = createClient(cfg.url, cfg.anonKey, { auth: { persistSession: false } });
await c.auth.signUp({ email: `demo-${Math.random().toString(36).slice(2,8)}@matchbook-test.dev`, password: 'test-pass-123!' });
const { data: f } = await c.from('friends').insert({
  first_name: 'Jenny', age: 29, city: 'Brooklyn', pitch: 'My funniest friend, dangerously good at karaoke',
  prompts: [{ q: 'Ideal Sunday', a: 'Dim sum then a long walk with no destination' }],
  looking_for: 'Someone who plans the date', consented: true }).select().single();
console.log('profile: /p/' + f.share_slug);
```
Then serve: `cd web && python3 -m http.server 8788` and open `http://localhost:8788/profile.html` — note: local http.server doesn't apply `_redirects`, so for local testing open `http://localhost:8788/profile.html#` won't carry the slug in the path. Instead test path parsing with: `npx serve web` does not handle `_redirects` either — therefore local verification is: temporarily open `http://localhost:8788/profile.html` and in DevTools run `history.replaceState(null,'','/p/<slug>'); location.reload()` — or simply rely on Step 4 verification after Netlify deploy (Task 9) where `/p/<slug>` works natively. Minimum local check now: page loads, shows "This link isn't active." for a missing slug.
Expected: profile renders with name, pitch, prompts (after deploy); local check shows the inactive state without console errors.

- [ ] **Step 4: Commit**

```bash
git add web backend/tests/seed-demo.mjs && git commit -m "feat: web profile page"
```

---

### Task 8: Web chat page (`/c/<token>`) with realtime + STOP UI

**Files:**
- Create: `web/chat.html`
- Consumes: `get_chat`, `send_message`, `end_chat` RPCs; Realtime broadcast topic `chat:<broadcast_key>`, events `message` and `ended` (Task 4).

**Interfaces:**
- Produces: chat room page used by both participants (role from `get_chat`). Live updates via broadcast subscription; refetches history when the tab becomes visible again (poll fallback). "End chat" button = `end_chat` after a `confirm()`. A hint under the composer says a lone "STOP" ends the chat too.
- Friend-side intro gate: when `role === 'friend'`, the chat is active, and the friend hasn't sent a message yet (and hasn't entered this session — `sessionStorage`), a full-screen intro is shown instead of the room: "💌 <wingperson_name> vouches for this — they met someone who'd like to chat with you", with **Enter chat** (dismisses the gate) and **Not interested** (confirm → `end_chat`). Guests never see the gate.

- [ ] **Step 1: Write the page**

`web/chat.html` (complete file):
```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>Matchbook chat</title>
<style>
  :root { --ink:#2b2018; --paper:#faf5ef; --accent:#c4553d; --soft:#eadfd3; }
  * { box-sizing:border-box; margin:0; }
  html, body { height:100%; }
  body { font-family:-apple-system,'Helvetica Neue',sans-serif; background:var(--paper);
         color:var(--ink); display:flex; flex-direction:column; }
  header { padding:14px 16px; display:flex; align-items:center; justify-content:space-between;
           border-bottom:1px solid var(--soft); background:var(--paper); }
  header b { font-size:17px; }
  header button { border:0; background:none; color:var(--accent); font-size:15px; padding:6px; }
  #log { flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:8px; }
  .msg { max-width:78%; padding:10px 14px; border-radius:18px; font-size:16px; line-height:1.35;
         background:#fff; border:1px solid var(--soft); align-self:flex-start;
         overflow-wrap:break-word; }
  .msg.me { background:var(--accent); border-color:var(--accent); color:#fff; align-self:flex-end; }
  .sys { text-align:center; color:#7a6a5b; font-size:13px; padding:8px 20px; }
  form { display:flex; gap:8px; padding:10px 12px calc(10px + env(safe-area-inset-bottom));
         border-top:1px solid var(--soft); background:var(--paper); }
  input { flex:1; padding:12px 16px; font-size:16px; border:1px solid var(--soft);
          border-radius:22px; background:#fff; outline:none; }
  form button { border:0; border-radius:22px; padding:0 18px; font-size:16px; font-weight:600;
                background:var(--accent); color:#fff; }
  .hint { text-align:center; font-size:11px; color:#a4937f; padding:0 12px 8px; background:var(--paper); }
  .state { text-align:center; padding:34dvh 30px 0; color:#7a6a5b; font-size:17px; }
  .invite { position:fixed; inset:0; background:var(--paper); display:flex; align-items:center;
            justify-content:center; padding:28px; z-index:10; }
  .inviteCard { text-align:center; max-width:340px; }
  .inviteCard h2 { font-size:24px; margin-top:12px; }
  .inviteCard p { color:#7a6a5b; margin-top:12px; line-height:1.5; font-size:15px; }
  .inviteCard button { width:100%; margin-top:22px; padding:15px; font-size:17px; font-weight:600;
                       border:0; border-radius:14px; background:var(--accent); color:#fff; }
  .inviteCard button.ghost { background:none; color:#7a6a5b; font-weight:400; margin-top:6px; }
  .hidden { display:none; }
</style>
</head>
<body>
<div class="invite hidden" id="invite">
  <div class="inviteCard">
    <div style="font-size:44px">💌</div>
    <h2 id="inviteTitle"></h2>
    <p>They met someone who'd like to chat with you. No accounts, no pressure — send “STOP” anytime and the chat ends for good.</p>
    <button id="enter">Enter chat</button>
    <button id="decline" class="ghost">Not interested</button>
  </div>
</div>
<header class="hidden" id="hdr"><b id="title"></b><button id="end">End chat</button></header>
<div id="log" class="hidden"></div>
<form id="composer" class="hidden" autocomplete="off">
  <input id="box" placeholder="Message…" maxlength="2000">
  <button>Send</button>
</form>
<div class="hint hidden" id="hint">Sending “STOP” by itself permanently ends this chat.</div>
<div class="state hidden" id="state"></div>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="/config.js"></script>
<script>
  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const $ = (id) => document.getElementById(id);
  const token = location.pathname.split('/')[2] || '';
  let role = null, channel = null;

  const showState = (msg) => {
    for (const id of ['hdr','log','composer','hint']) $(id).classList.add('hidden');
    $('state').textContent = msg; $('state').classList.remove('hidden');
  };
  const addMsg = (m) => {
    const d = document.createElement('div');
    d.className = 'msg' + (m.sender === role ? ' me' : '');
    d.textContent = m.body;
    $('log').appendChild(d); $('log').scrollTop = $('log').scrollHeight;
  };
  const showEnded = () => {
    $('composer').classList.add('hidden'); $('hint').classList.add('hidden');
    $('end').classList.add('hidden');
    const d = document.createElement('div'); d.className = 'sys';
    d.textContent = 'This chat has ended.';
    $('log').appendChild(d); $('log').scrollTop = $('log').scrollHeight;
    if (channel) sb.removeChannel(channel);
  };

  async function load(first) {
    const { data: c, error } = await sb.rpc('get_chat', { p_token: token });
    if (error) return first && showState('Something went wrong — try again in a minute.');
    if (!c) return showState("This link isn't active.");
    role = c.role;
    $('title').textContent = c.role === 'guest' ? 'Chat with ' + c.friend_name : 'Your Matchbook chat';
    $('log').replaceChildren();
    c.messages.forEach(addMsg);
    if (c.status === 'ended') { $('invite').classList.add('hidden'); for (const id of ['hdr','log']) $(id).classList.remove('hidden'); return showEnded(); }
    for (const id of ['hdr','log','composer','hint']) $(id).classList.remove('hidden');
    // friend-side intro gate: this is a vouched recommendation, entering is a choice
    const entered = sessionStorage.getItem('entered:' + token);
    if (c.role === 'friend' && !entered && !c.messages.some((m) => m.sender === 'friend')) {
      $('inviteTitle').textContent = c.wingperson_name + ' vouches for this';
      $('invite').classList.remove('hidden');
    }
    if (first) {
      channel = sb.channel('chat:' + c.broadcast_key)
        .on('broadcast', { event: 'message' }, ({ payload }) => addMsg(payload))
        .on('broadcast', { event: 'ended' }, showEnded)
        .subscribe();
    }
  }

  $('composer').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = $('box').value.trim();
    if (!body) return;
    $('box').value = '';
    const { data: r } = await sb.rpc('send_message', { p_token: token, p_body: body });
    if (!r?.ok) { if (r?.error === 'ended') showEnded(); return; }
    // own broadcasts are not echoed back by default config — render locally
    if (!r.ended) addMsg({ sender: role, body });
  });

  $('end').addEventListener('click', async () => {
    if (!confirm('Permanently end this chat? This can’t be undone.')) return;
    await sb.rpc('end_chat', { p_token: token });
    showEnded();
  });

  $('enter').addEventListener('click', () => {
    sessionStorage.setItem('entered:' + token, '1');
    $('invite').classList.add('hidden');
  });

  $('decline').addEventListener('click', async () => {
    if (!confirm('Pass on this one? The chat ends permanently for both of you.')) return;
    await sb.rpc('end_chat', { p_token: token });
    $('invite').classList.add('hidden');
    for (const id of ['hdr','log']) $(id).classList.remove('hidden');
    showEnded();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && role) load(false);
  });

  load(true);
</script>
</body>
</html>
```

- [ ] **Step 2: Two-browser smoke test (scripted setup, manual verify after deploy)**

Full verification happens in Task 9 Step 3 once `/c/<token>` routing exists. Now: open `web/chat.html` locally via `python3 -m http.server 8788` → shows "This link isn't active." with no console errors.

- [ ] **Step 3: Commit**

```bash
git add web && git commit -m "feat: web chat page with realtime and STOP"
```

---

### Task 9: Netlify deploy + end-to-end web verification

**Files:**
- Create: `web/index.html` (landing stub), `docs/superpowers/manual-test-checklist.md`
- Modify: `README.md` (add live URL)

**Interfaces:**
- Produces: live site URL (e.g. `https://matchbook-party.netlify.app`) — record it; Task 10's `app/src/lib/config.ts` `WEB_BASE_URL` must equal it exactly.

- [ ] **Step 1: Landing stub**

`web/index.html`:
```html
<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Matchbook</title>
<style>body{font-family:-apple-system,sans-serif;background:#faf5ef;color:#2b2018;
display:grid;place-items:center;min-height:100dvh;text-align:center;padding:30px}
h1{font-size:40px}p{color:#7a6a5b;margin-top:10px}</style></head>
<body><div><h1>Matchbook 🔥</h1><p>Profiles here are shared by invitation only.</p></div></body></html>
```

- [ ] **Step 2: Deploy**

Use the Netlify MCP tools (`netlify-deploy-services-updater`) to create a site named `matchbook-party` (or nearest available) for team and deploy the `web/` directory; alternatively `npx netlify-cli deploy --dir web --prod`. Record the final URL in `README.md`.

- [ ] **Step 3: End-to-end verification (the core product loop, on the real URL)**

1. `node backend/tests/seed-demo.mjs` → gives `/p/<slug>`.
2. Open `https://<site>/p/<slug>` — profile renders (name, pitch, prompts).
3. Tap **Say hi 👋** — lands on `/c/<guest_token>`, composer visible.
4. Get the friend token: `node -e` one-liner won't have the owner session; instead extend the seed script output — modify `backend/tests/seed-demo.mjs` to also create a chat and print both sides:
```js
// append to seed-demo.mjs before the final console.log:
const v = createClient(cfg.url, cfg.anonKey, { auth: { persistSession: false } });
const { data: ch } = await v.rpc('create_chat', { p_slug: f.share_slug });
const { data: row } = await c.from('chats').select('friend_token').eq('friend_id', f.id).single();
console.log('guest chat:  /c/' + ch.guest_token);
console.log('friend chat: /c/' + row.friend_token);
```
5. Open the friend link — the intro gate appears first ("<wingperson> vouches for this") with Enter chat / Not interested; tap **Enter chat**. Open the guest link in a different browser (no gate there); send messages both ways — they appear live on the other side without reloading. Separately, on a fresh chat, verify **Not interested** on the friend link ends the chat for both sides.
6. Send `stop` from one side → both sides show "This chat has ended." (the other side within a second, via broadcast); reloading either link shows ended state; STOP itself never appears as a message.
7. Save this list as `docs/superpowers/manual-test-checklist.md` (write the 6 numbered checks above into the file, plus: profile hidden after `status='taken'`; ended chat rejects sends after reload) — it's the regression checklist for every later change.

Expected: every check passes on iPhone Safari at minimum.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: deploy web to Netlify, e2e checklist"
```

---

### Task 10: Expo app scaffold + Supabase client + auth

**Files:**
- Create: `app/` via create-expo-app, then `app/src/lib/supabase.ts`, `app/src/lib/config.ts`, `app/src/types.ts`, `app/app/_layout.tsx`, `app/app/(auth)/sign-in.tsx`, `app/app/(tabs)/_layout.tsx`, `app/app/(tabs)/index.tsx` (placeholder), `app/app/(tabs)/chats.tsx` (placeholder)

**Interfaces:**
- Consumes: Supabase URL + anon key (Task 1), live web URL (Task 9).
- Produces: `supabase` client export identical in pattern to dear-date-mobile; `WEB_BASE_URL` const; `Friend` and `ChatMeta` types used by Tasks 11–13:
```ts
export type Prompt = { q: string; a: string };
export type Friend = {
  id: string; first_name: string; age: number | null; city: string | null;
  pitch: string | null; prompts: Prompt[]; looking_for: string | null;
  photos: string[]; status: 'single' | 'taken' | 'hidden';
  consented: boolean; share_slug: string;
};
export type ChatMeta = {
  id: string; friend_id: string; status: 'active' | 'ended';
  ended_by: 'guest' | 'friend' | null; friend_token: string;
  created_at: string; ended_at: string | null;
};
```

- [ ] **Step 1: Scaffold**

Run: `cd /Users/lia/Claude/Matchbook && npx create-expo-app@latest app --template default && cd app && npx expo install @supabase/supabase-js @react-native-async-storage/async-storage react-native-url-polyfill expo-image-picker expo-notifications expo-device expo-file-system && npm i base64-arraybuffer`
Then delete the template screens: `rm -rf app/app/(tabs) app/app/_layout.tsx` contents will be replaced below (keep the folder structure expo-router expects).

- [ ] **Step 2: Core libs**

`app/src/lib/config.ts`:
```ts
export const WEB_BASE_URL = 'https://REPLACE.netlify.app'; // exact URL from Task 9
```

`app/src/lib/supabase.ts` (same pattern as dear-date-mobile):
```ts
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

const SUPABASE_URL = 'https://REPLACE.supabase.co';
const SUPABASE_ANON_KEY = 'REPLACE';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
```

`app/src/types.ts`: exactly the `Prompt`, `Friend`, `ChatMeta` types from the Interfaces block above.

- [ ] **Step 3: Root layout with auth gate**

`app/app/_layout.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../src/lib/supabase';

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!ready) return;
    const inAuth = segments[0] === '(auth)';
    if (!session && !inAuth) router.replace('/(auth)/sign-in');
    if (session && inAuth) router.replace('/(tabs)');
  }, [ready, session, segments]);

  if (!ready) return null;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)/sign-in" />
      <Stack.Screen name="friend/[id]" options={{ headerShown: true, title: '', presentation: 'modal' }} />
      <Stack.Screen name="deck" options={{ animation: 'fade' }} />
    </Stack>
  );
}
```

- [ ] **Step 4: Sign-in screen**

`app/app/(auth)/sign-in.tsx`:
```tsx
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../../src/lib/supabase';

export default function SignIn() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

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

  return (
    <KeyboardAvoidingView style={s.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={s.logo}>Matchbook 🔥</Text>
      <Text style={s.tag}>Your single friends deserve better PR.</Text>
      {mode === 'up' && (
        <TextInput style={s.input} placeholder="Your name (shown on chat invites)"
          value={name} onChangeText={setName} />
      )}
      <TextInput style={s.input} placeholder="Email" autoCapitalize="none" keyboardType="email-address"
        value={email} onChangeText={setEmail} />
      <TextInput style={s.input} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
      <Pressable style={s.btn} disabled={busy} onPress={go}>
        <Text style={s.btnText}>{mode === 'in' ? 'Sign in' : 'Create account'}</Text>
      </Pressable>
      <Pressable onPress={() => setMode(mode === 'in' ? 'up' : 'in')}>
        <Text style={s.switch}>{mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in'}</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#faf5ef', justifyContent: 'center', padding: 28, gap: 12 },
  logo: { fontSize: 40, fontWeight: '700', color: '#2b2018', textAlign: 'center' },
  tag: { color: '#7a6a5b', textAlign: 'center', marginBottom: 18 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#eadfd3', borderRadius: 14,
           padding: 15, fontSize: 16 },
  btn: { backgroundColor: '#c4553d', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 6 },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  switch: { color: '#c4553d', textAlign: 'center', marginTop: 14, fontSize: 15 },
});
```

- [ ] **Step 5: Tabs layout + placeholders**

`app/app/(tabs)/_layout.tsx`:
```tsx
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#c4553d', headerShown: true,
      headerStyle: { backgroundColor: '#faf5ef' }, headerShadowVisible: false }}>
      <Tabs.Screen name="index" options={{ title: 'Roster',
        tabBarIcon: ({ color, size }) => <Ionicons name="people" color={color} size={size} /> }} />
      <Tabs.Screen name="chats" options={{ title: 'Chats',
        tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles" color={color} size={size} /> }} />
    </Tabs>
  );
}
```

`app/app/(tabs)/index.tsx` and `app/app/(tabs)/chats.tsx` placeholders (replaced in Tasks 11/13):
```tsx
import { Text, View } from 'react-native';
export default function Screen() {
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text>Coming soon</Text></View>;
}
```

- [ ] **Step 6: Verify**

Run: `cd app && npx tsc --noEmit` — Expected: no errors.
Run: `npx expo start --ios` (or Expo Go) — sign up with a fresh email → lands on tabs; kill and reopen app → still signed in.

- [ ] **Step 7: Commit**

```bash
git add app && git commit -m "feat: Expo scaffold, supabase client, auth flow"
```

---

### Task 11: Roster — list, add/edit friend, photo upload

**Files:**
- Create: `app/src/lib/photos.ts`, `app/app/friend/[id].tsx`
- Modify: `app/app/(tabs)/index.tsx` (replace placeholder)

**Interfaces:**
- Consumes: `supabase`, `Friend`/`Prompt` types, photos bucket policies (Task 5).
- Produces: `uploadPhoto(uri: string): Promise<string>` in `photos.ts` returning the full public URL; roster screen navigating to `/friend/new` and `/friend/<id>`, and to `/deck` (Task 12).

- [ ] **Step 1: Photo upload helper**

`app/src/lib/photos.ts`:
```ts
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';

export async function uploadPhoto(uri: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const ext = uri.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
  const path = `${user.id}/${Crypto.randomUUID()}.${ext}`;
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
  const { error } = await supabase.storage.from('photos')
    .upload(path, decode(base64), { contentType: ext === 'png' ? 'image/png' : 'image/jpeg' });
  if (error) throw error;
  return supabase.storage.from('photos').getPublicUrl(path).data.publicUrl;
}
```
Note: add the `expo-crypto` dependency via `npx expo install expo-crypto`.

- [ ] **Step 2: Roster screen**

`app/app/(tabs)/index.tsx`:
```tsx
import { useCallback, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { Friend } from '../../src/types';

export default function Roster() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const router = useRouter();

  useFocusEffect(useCallback(() => {
    supabase.from('friends').select('*').order('created_at')
      .then(({ data }) => setFriends((data as Friend[]) ?? []));
  }, []));

  return (
    <View style={s.wrap}>
      <FlatList
        data={friends}
        keyExtractor={(f) => f.id}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        ListEmptyComponent={<Text style={s.empty}>Add your first single friend 💘</Text>}
        renderItem={({ item }) => (
          <Pressable style={s.row} onPress={() => router.push(`/friend/${item.id}`)}>
            {item.photos[0]
              ? <Image source={{ uri: item.photos[0] }} style={s.avatar} />
              : <View style={[s.avatar, s.avatarEmpty]}><Text style={{ fontSize: 22 }}>💘</Text></View>}
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{item.first_name}{item.age ? `, ${item.age}` : ''}</Text>
              <Text style={s.pitch} numberOfLines={1}>{item.pitch ?? ''}</Text>
            </View>
            <Text style={[s.badge, item.status !== 'single' && s.badgeOff]}>
              {item.status === 'single' ? (item.consented ? 'live' : 'no consent') : item.status}
            </Text>
          </Pressable>
        )}
      />
      {friends.length > 0 && (
        <Pressable style={s.deckBtn} onPress={() => router.push('/deck')}>
          <Text style={s.deckText}>🎉 Party mode</Text>
        </Pressable>
      )}
      <Pressable style={s.add} onPress={() => router.push('/friend/new')}>
        <Text style={{ color: '#fff', fontSize: 30, lineHeight: 32 }}>+</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#faf5ef' },
  empty: { textAlign: 'center', color: '#7a6a5b', marginTop: 60, fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff',
         borderRadius: 16, padding: 12, borderWidth: 1, borderColor: '#eadfd3' },
  avatar: { width: 54, height: 54, borderRadius: 27 },
  avatarEmpty: { backgroundColor: '#eadfd3', alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 17, fontWeight: '600', color: '#2b2018' },
  pitch: { color: '#7a6a5b', marginTop: 2 },
  badge: { fontSize: 12, color: '#2e7d32', fontWeight: '600', textTransform: 'uppercase' },
  badgeOff: { color: '#a4937f' },
  deckBtn: { position: 'absolute', bottom: 24, alignSelf: 'center', backgroundColor: '#2b2018',
             borderRadius: 26, paddingVertical: 14, paddingHorizontal: 26 },
  deckText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  add: { position: 'absolute', right: 20, bottom: 24, width: 52, height: 52, borderRadius: 26,
         backgroundColor: '#c4553d', alignItems: 'center', justifyContent: 'center' },
});
```

- [ ] **Step 3: Friend editor (`/friend/new` and `/friend/<id>`)**

`app/app/friend/[id].tsx`:
```tsx
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Switch,
         Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../src/lib/supabase';
import { uploadPhoto } from '../../src/lib/photos';
import { Friend, Prompt } from '../../src/types';

const PROMPT_QS = ['Ideal Sunday', 'Green flag they wave', 'Will win you over with'];

export default function FriendEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState<Partial<Friend>>({
    first_name: '', prompts: PROMPT_QS.map((q) => ({ q, a: '' })), photos: [],
    status: 'single', consented: false,
  });

  useEffect(() => {
    if (!isNew) supabase.from('friends').select('*').eq('id', id).single()
      .then(({ data }) => data && setF(data as Friend));
  }, [id]);

  const set = (patch: Partial<Friend>) => setF((p) => ({ ...p, ...patch }));

  const addPhoto = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7,
      allowsEditing: true, aspect: [4, 5] });
    if (r.canceled) return;
    setBusy(true);
    try { set({ photos: [...(f.photos ?? []), await uploadPhoto(r.assets[0].uri)] }); }
    catch (e: any) { Alert.alert('Upload failed', e.message); }
    setBusy(false);
  };

  const save = async () => {
    if (!f.first_name?.trim()) return Alert.alert('Needs a name');
    setBusy(true);
    const row = {
      first_name: f.first_name.trim(), age: f.age || null, city: f.city || null,
      pitch: f.pitch || null, looking_for: f.looking_for || null,
      prompts: (f.prompts ?? []).filter((p: Prompt) => p.a.trim()),
      photos: f.photos ?? [], status: f.status, consented: f.consented,
    };
    const q = isNew
      ? supabase.from('friends').insert({ ...row, owner_id: (await supabase.auth.getUser()).data.user!.id })
      : supabase.from('friends').update(row).eq('id', id);
    const { error } = await q;
    setBusy(false);
    if (error) return Alert.alert('Save failed', error.message);
    router.back();
  };

  const remove = () => Alert.alert('Remove from roster?', 'Their profile link and chats stop working immediately.',
    [{ text: 'Cancel' }, { text: 'Remove', style: 'destructive', onPress: async () => {
      await supabase.from('friends').delete().eq('id', id); router.back(); } }]);

  return (
    <ScrollView style={s.wrap} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 60 }}>
      <ScrollView horizontal style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8 }}>
        {(f.photos ?? []).map((url) => (
          <Pressable key={url} onLongPress={() => set({ photos: f.photos!.filter((u) => u !== url) })}>
            <Image source={{ uri: url }} style={s.photo} />
          </Pressable>
        ))}
        {(f.photos ?? []).length < 4 && (
          <Pressable style={[s.photo, s.photoAdd]} onPress={addPhoto} disabled={busy}>
            {busy ? <ActivityIndicator /> : <Text style={{ fontSize: 30, color: '#a4937f' }}>+</Text>}
          </Pressable>
        )}
      </ScrollView>
      <Text style={s.hint}>Long-press a photo to remove it.</Text>
      <TextInput style={s.input} placeholder="First name" value={f.first_name}
        onChangeText={(t) => set({ first_name: t })} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <TextInput style={[s.input, { flex: 1 }]} placeholder="Age" keyboardType="number-pad"
          value={f.age ? String(f.age) : ''} onChangeText={(t) => set({ age: parseInt(t) || null })} />
        <TextInput style={[s.input, { flex: 2 }]} placeholder="City" value={f.city ?? ''}
          onChangeText={(t) => set({ city: t })} />
      </View>
      <TextInput style={[s.input, s.multi]} multiline placeholder="The pitch — why are they a catch?"
        value={f.pitch ?? ''} onChangeText={(t) => set({ pitch: t })} />
      {(f.prompts ?? []).map((p: Prompt, i: number) => (
        <View key={p.q}>
          <Text style={s.label}>{p.q}</Text>
          <TextInput style={s.input} value={p.a} placeholder="Their answer…"
            onChangeText={(t) => { const ps = [...f.prompts!]; ps[i] = { ...p, a: t }; set({ prompts: ps }); }} />
        </View>
      ))}
      <TextInput style={s.input} placeholder="Looking for…" value={f.looking_for ?? ''}
        onChangeText={(t) => set({ looking_for: t })} />
      <View style={s.rowBetween}>
        <Text style={s.label}>They know they're on here</Text>
        <Switch value={!!f.consented} onValueChange={(v) => set({ consented: v })} trackColor={{ true: '#c4553d' }} />
      </View>
      <View style={s.rowBetween}>
        <Text style={s.label}>Status</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['single', 'taken', 'hidden'] as const).map((st) => (
            <Pressable key={st} style={[s.chip, f.status === st && s.chipOn]} onPress={() => set({ status: st })}>
              <Text style={f.status === st ? s.chipOnText : s.chipText}>{st}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <Pressable style={s.save} onPress={save} disabled={busy}>
        <Text style={s.saveText}>{isNew ? 'Add to roster' : 'Save'}</Text>
      </Pressable>
      {!isNew && <Pressable onPress={remove}><Text style={s.remove}>Remove from roster</Text></Pressable>}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#faf5ef' },
  photo: { width: 96, height: 120, borderRadius: 14, backgroundColor: '#eadfd3' },
  photoAdd: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#dcd0c2',
              borderStyle: 'dashed' },
  hint: { fontSize: 12, color: '#a4937f' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#eadfd3', borderRadius: 12,
           padding: 13, fontSize: 16 },
  multi: { minHeight: 80 },
  label: { fontSize: 14, color: '#7a6a5b', marginBottom: 6, fontWeight: '600' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  chip: { borderWidth: 1, borderColor: '#eadfd3', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  chipOn: { backgroundColor: '#c4553d', borderColor: '#c4553d' },
  chipText: { color: '#7a6a5b' }, chipOnText: { color: '#fff', fontWeight: '600' },
  save: { backgroundColor: '#c4553d', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 10 },
  saveText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  remove: { color: '#b3261e', textAlign: 'center', marginTop: 16 },
});
```

- [ ] **Step 4: Verify**

Run: `cd app && npx expo install expo-crypto && npx tsc --noEmit` — no errors.
In simulator: add a friend with 2 photos + prompts + consent ON → appears in roster with "live" badge → edit, flip status to `taken` → badge changes → run `node backend/tests/03-chat-stop.mjs` still PASS (regression) → open the friend's `/p/<slug>` URL (query slug from the app: it's in the editor's loaded data; or via seed) → shows "This link isn't active." for the taken friend.

- [ ] **Step 5: Commit**

```bash
git add app && git commit -m "feat: roster list and friend editor with photo upload"
```

---

### Task 12: Party deck + share

**Files:**
- Create: `app/app/deck.tsx`

**Interfaces:**
- Consumes: `Friend` type, `WEB_BASE_URL`.
- Produces: full-screen swipeable card deck of `status='single' AND consented` friends; Share button → iOS share sheet with `${WEB_BASE_URL}/p/${share_slug}`.

- [ ] **Step 1: Write the deck screen**

`app/app/deck.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { Dimensions, FlatList, Image, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import { WEB_BASE_URL } from '../src/lib/config';
import { Friend } from '../src/types';

const { width: W } = Dimensions.get('window');

export default function Deck() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const router = useRouter();

  useEffect(() => {
    supabase.from('friends').select('*').eq('status', 'single').eq('consented', true)
      .order('created_at').then(({ data }) => setFriends((data as Friend[]) ?? []));
  }, []);

  const share = (f: Friend) =>
    Share.share({ message: `Meet ${f.first_name} 🔥 ${WEB_BASE_URL}/p/${f.share_slug}` });

  return (
    <View style={s.wrap}>
      <FlatList
        horizontal pagingEnabled showsHorizontalScrollIndicator={false}
        data={friends} keyExtractor={(f) => f.id}
        ListEmptyComponent={<View style={{ width: W, justifyContent: 'center' }}>
          <Text style={s.empty}>No live profiles — check status + consent.</Text></View>}
        renderItem={({ item }) => (
          <View style={s.card}>
            {item.photos[0]
              ? <Image source={{ uri: item.photos[0] }} style={s.photo} />
              : <View style={[s.photo, s.noPhoto]}><Text style={{ fontSize: 60 }}>💘</Text></View>}
            <Text style={s.name}>{item.first_name}{item.age ? `, ${item.age}` : ''}</Text>
            {!!item.city && <Text style={s.city}>{item.city}</Text>}
            {!!item.pitch && <Text style={s.pitch}>“{item.pitch}”</Text>}
            {(item.prompts ?? []).slice(0, 2).map((p) => (
              <View key={p.q} style={s.prompt}>
                <Text style={s.q}>{p.q.toUpperCase()}</Text><Text style={s.a}>{p.a}</Text>
              </View>
            ))}
            <Pressable style={s.share} onPress={() => share(item)}>
              <Text style={s.shareText}>Share {item.first_name}'s profile</Text>
            </Pressable>
          </View>
        )}
      />
      <Pressable style={s.close} onPress={() => router.back()}><Text style={s.closeText}>✕</Text></Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#2b2018' },
  card: { width: W, padding: 24, paddingTop: 70 },
  photo: { width: '100%', aspectRatio: 4 / 5, borderRadius: 24, backgroundColor: '#463a2e' },
  noPhoto: { alignItems: 'center', justifyContent: 'center' },
  name: { color: '#fff', fontSize: 34, fontWeight: '700', marginTop: 16 },
  city: { color: '#c9b8a5', fontSize: 16, marginTop: 2 },
  pitch: { color: '#f5e9db', fontSize: 17, marginTop: 10, lineHeight: 24 },
  prompt: { backgroundColor: '#3a2e23', borderRadius: 14, padding: 12, marginTop: 10 },
  q: { color: '#a4937f', fontSize: 11, letterSpacing: 1 },
  a: { color: '#f5e9db', fontSize: 16, marginTop: 3 },
  share: { backgroundColor: '#c4553d', borderRadius: 16, padding: 16, alignItems: 'center', marginTop: 18 },
  shareText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  empty: { color: '#c9b8a5', textAlign: 'center', paddingHorizontal: 40, fontSize: 16 },
  close: { position: 'absolute', top: 58, right: 22, width: 36, height: 36, borderRadius: 18,
           backgroundColor: 'rgba(255,255,255,.15)', alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#fff', fontSize: 17 },
});
```

- [ ] **Step 2: Verify**

`npx tsc --noEmit` clean. In simulator: Party mode → swipe between friends → Share opens the sheet with the correct `/p/<slug>` URL → open that URL in Safari → profile renders (full loop!). A `taken` friend does not appear in the deck.

- [ ] **Step 3: Commit**

```bash
git add app && git commit -m "feat: party deck with share sheet"
```

---

### Task 13: Chats tab — status list + forward link

**Files:**
- Modify: `app/app/(tabs)/chats.tsx` (replace placeholder)

**Interfaces:**
- Consumes: `ChatMeta` type; chats column grant (`id, friend_id, status, ended_by, friend_token, created_at, ended_at` — NEVER `select('*')`, it will error on ungranted columns); `WEB_BASE_URL`.
- Produces: list of chats grouped under friend names, newest first; each active chat has **Forward to <name>** sharing `${WEB_BASE_URL}/c/${friend_token}`; ended chats show an "ended" badge.

- [ ] **Step 1: Write the screen**

`app/app/(tabs)/chats.tsx`:
```tsx
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Share, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { WEB_BASE_URL } from '../../src/lib/config';
import { ChatMeta } from '../../src/types';

type Row = ChatMeta & { friendName: string };

export default function Chats() {
  const [rows, setRows] = useState<Row[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const [{ data: chats }, { data: friends }] = await Promise.all([
      supabase.from('chats')
        .select('id, friend_id, status, ended_by, friend_token, created_at, ended_at')
        .order('created_at', { ascending: false }),
      supabase.from('friends').select('id, first_name'),
    ]);
    const names = new Map((friends ?? []).map((f) => [f.id, f.first_name]));
    setRows(((chats as ChatMeta[]) ?? []).map((c) => ({ ...c, friendName: names.get(c.friend_id) ?? '?' })));
  };
  useFocusEffect(useCallback(() => { load(); }, []));

  const forward = (r: Row) => Share.share({
    message: `Someone met you through me and wants to chat 👀 Your private Matchbook link (type STOP anytime to end it): ${WEB_BASE_URL}/c/${r.friend_token}`,
  });

  return (
    <FlatList
      style={s.wrap} contentContainerStyle={{ padding: 16, gap: 10 }}
      data={rows} keyExtractor={(r) => r.id}
      refreshControl={<RefreshControl refreshing={refreshing}
        onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      ListEmptyComponent={<Text style={s.empty}>When someone taps “Say hi” on a shared profile, the chat shows up here.</Text>}
      renderItem={({ item }) => (
        <View style={s.card}>
          <View style={{ flex: 1 }}>
            <Text style={s.name}>Chat for {item.friendName}</Text>
            <Text style={s.meta}>{new Date(item.created_at).toLocaleString()}</Text>
          </View>
          {item.status === 'active'
            ? <Pressable style={s.fwd} onPress={() => forward(item)}>
                <Text style={s.fwdText}>Forward to {item.friendName}</Text>
              </Pressable>
            : <Text style={s.ended}>ended</Text>}
        </View>
      )}
    />
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#faf5ef' },
  empty: { textAlign: 'center', color: '#7a6a5b', marginTop: 60, fontSize: 15, lineHeight: 22 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff',
          borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#eadfd3' },
  name: { fontSize: 16, fontWeight: '600', color: '#2b2018' },
  meta: { color: '#a4937f', fontSize: 12, marginTop: 2 },
  fwd: { backgroundColor: '#c4553d', borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12 },
  fwdText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  ended: { color: '#a4937f', fontWeight: '600', fontSize: 12, textTransform: 'uppercase' },
});
```

- [ ] **Step 2: Verify the full product loop on device/simulator**

1. Deck → share a profile link → open in Safari → Say hi.
2. App Chats tab (pull to refresh) → new chat appears → **Forward** → share sheet contains `/c/<friend_token>`.
3. Open forwarded link in a second browser → chat both ways with the Safari guest.
4. Either side sends STOP → Chats tab shows "ended" after refresh.
Expected: all four pass. `npx tsc --noEmit` clean.

- [ ] **Step 3: Commit**

```bash
git add app && git commit -m "feat: chats tab with forward-to-friend"
```

---

### Task 14: Push notification registration

**Files:**
- Create: `app/src/lib/push.ts`
- Modify: `app/app/(tabs)/_layout.tsx` (register on mount)

**Interfaces:**
- Consumes: `wingpeople.expo_push_token` column (Task 2), push trigger (Task 6).
- Produces: on app open (signed in), asks notification permission and saves the Expo push token to the user's `wingpeople` row.

- [ ] **Step 1: Write the helper**

`app/src/lib/push.ts`:
```ts
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from './supabase';

export async function registerPush() {
  try {
    if (!Device.isDevice) return; // simulator: skip
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
    await supabase.from('wingpeople').update({ expo_push_token: token })
      .eq('id', (await supabase.auth.getUser()).data.user!.id);
  } catch {
    // non-fatal: chats still appear in the Chats tab
  }
}
```

- [ ] **Step 2: Call it from the tabs layout**

In `app/app/(tabs)/_layout.tsx`, add:
```tsx
import { useEffect } from 'react';
import { registerPush } from '../../src/lib/push';
```
and inside the component before `return`:
```tsx
useEffect(() => { registerPush(); }, []);
```

- [ ] **Step 3: Verify**

`npx tsc --noEmit` clean. Simulator: app runs, no crash (helper exits early). Real verification on a physical device happens in Task 15 Step 4: after TestFlight install, tap Say hi on a shared profile from another phone → push arrives: "Someone wants to talk to <name>!"

- [ ] **Step 4: Commit**

```bash
git add app && git commit -m "feat: push notification registration"
```

---

### Task 15: EAS build → TestFlight

**Files:**
- Create: `app/eas.json` (generated by `eas init` / `eas build:configure`)
- Modify: `app/app.json` (bundle identifier, name, icon)

**Interfaces:**
- Consumes: everything. Produces: Matchbook installable on Lia's iPhone via TestFlight.

- [ ] **Step 1: Configure app identity**

In `app/app.json` set: `"name": "Matchbook"`, `"slug": "matchbook"`, `"ios": { "bundleIdentifier": "club.deardate.matchbook", "supportsTablet": false }`, `"scheme": "matchbook"`. Keep the default Expo icon for v1 (custom icon is post-v1 polish).

- [ ] **Step 2: EAS setup (requires Lia's Expo + Apple accounts — pause for her if credentials prompt)**

Run: `cd app && npx eas-cli init && npx eas-cli build:configure`
Then: `npx eas-cli build --platform ios --profile production` (EAS handles certificates; needs Apple Developer login — Lia has one if dear-date-mobile shipped; otherwise she enrolls at developer.apple.com, $99/yr).

- [ ] **Step 3: Submit to TestFlight**

Run: `npx eas-cli submit --platform ios --latest`
Then App Store Connect → TestFlight → add Lia as internal tester.

- [ ] **Step 4: Device verification (the real party test)**

On the installed app: sign in → roster shows friends → party mode → share to a second phone → Say hi → **push notification arrives on Lia's phone** → forward the chat link → two-phone chat → STOP ends it everywhere. Run through `docs/superpowers/manual-test-checklist.md` end to end.

- [ ] **Step 5: Commit + tag**

```bash
git add app && git commit -m "feat: EAS/TestFlight config" && git tag v1.0
```

---

## Self-Review Notes

- **Spec coverage:** schema/RLS (T2), anonymous function layer (T3–4), STOP semantics incl. normalization + never-stored + permanence (T4), status-change chat locking (T4), unguessable slugs/tokens ≥128 bits (T2 `matchbook_token`, 18 bytes = 144 bits), photos public-unguessable per amended spec (T5), push (T6, T14), profile page + say-hi (T7), chat page + realtime + End button + ended states (T8), Netlify deploy + manual checklist incl. iPhone Safari (T9), Expo auth (T10), roster CRUD + consent + status (T11), deck + share (T12), chats metadata + forward, no message reading (T13), TestFlight (T15). Error handling: bad links (T7/T8 states), sends-to-ended (T4), push failure non-fatal (T6/T14), body validation (T4).
- **Known soft guarantee (matches spec intent, documented):** the wingperson holds `friend_token` (needed for forwarding), so "can't read chats" is app-design, not cryptographic.
- **Type consistency check:** RPC names/params identical across SQL (T3/T4), web pages (T7/T8), and tests; chat column list identical in T2 grant, T3 test, and T13 select; `Friend`/`ChatMeta` fields match schema.
