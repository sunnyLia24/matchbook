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
  ['name too long', { name: 'x'.repeat(51) }],
  ['photo path traversal', { photo: `${PHOTO_PREFIX}../avatars/steal.jpg` }],
];
for (const [label, card] of BAD) {
  ({ error } = await setCard(owner, t.id, card));
  assert(error, `constraint must reject: ${label}`);
}
assert.deepStrictEqual(await readCard(t.id), VALID, 'a bad payload landed');

// 6b. boundary: a 50-char name is still accepted
({ error } = await setCard(owner, t.id, { name: 'x'.repeat(50) }));
assert(!error, `50-char name must be accepted: ${error?.message}`);

// 7. clearing the card works; ended chats are immutable
({ error } = await setCard(owner, t.id, null));
assert(!error && (await readCard(t.id)) === null, 'clearing card failed');
await t.v.rpc('end_chat', { p_token: t.guest });
await setCard(owner, t.id, VALID);
assert((await readCard(t.id)) === null, 'ended chat card must be immutable');

console.log('05-suitor-card PASS');
