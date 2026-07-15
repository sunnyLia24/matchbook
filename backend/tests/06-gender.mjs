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
