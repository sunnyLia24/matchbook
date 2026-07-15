import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import assert from 'assert';

const cfg = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const anon = () => createClient(cfg.url, cfg.anonKey, { auth: { persistSession: false } });
const rand = () => Math.random().toString(36).slice(2, 10);

const owner = anon();
const ownerEmail = `test-${rand()}@matchbook-test.com`;
const { data: ownerSignUp } = await owner.auth.signUp({ email: ownerEmail, password: 'test-pass-123!' });
await owner.from('wingpeople').update({ display_name: 'Test Wing' }).eq('id', ownerSignUp.user.id);
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
assert(g.wingperson_name === 'Test Wing', 'wingperson_name missing/wrong');
assert(g.messages.length === 2 && g.messages[0].sender === 'guest', 'history wrong');
assert((await t.v.rpc('get_chat', { p_token: 'bogus' })).data === null, 'bad token must be null');

// STOP in all normalizations, from either side; never stored; permanently locks
for (const stop of ['STOP', 'stop', '  Stop  ', 'stop\n', '\tSTOP ']) {
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
assert(!(await t.v.rpc('send_message', { p_token: t.guest, p_body: '\n\n' })).data.ok, 'whitespace-only (newlines) accepted');
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
