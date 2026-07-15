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
