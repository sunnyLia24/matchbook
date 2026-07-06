import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import assert from 'assert';

const cfg = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const anon = () => createClient(cfg.url, cfg.anonKey, { auth: { persistSession: false } });
const rand = () => Math.random().toString(36).slice(2, 10);

const owner = anon();
await owner.auth.signUp({ email: `test-${rand()}@matchbook-test.com`, password: 'test-pass-123!' });
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
