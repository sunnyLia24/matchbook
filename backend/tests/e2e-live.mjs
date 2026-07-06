// Live end-to-end verification against the deployed Supabase project (Task 9b).
// Covers: seed -> get_profile -> create_chat -> get_chat metadata -> realtime wire
// (broadcast message/ended events across two independent clients) -> STOP permanence
// -> status-flip kill switch. Exits 0 on pass, throws (non-zero) on first failure.
//
// Run: node --experimental-websocket backend/tests/e2e-live.mjs
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import assert from 'assert';

const cfg = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const client = () => createClient(cfg.url, cfg.anonKey, { auth: { persistSession: false } });
const rand = () => Math.random().toString(36).slice(2, 10);

let passCount = 0;
function pass(label) {
  passCount++;
  console.log(`PASS: ${label}`);
}
function fail(label, detail) {
  console.error(`FAIL: ${label}${detail ? ` — ${detail}` : ''}`);
  process.exitCode = 1;
  throw new Error(`FAIL: ${label}`);
}

// ---------------------------------------------------------------------------
// 1. Seed: wingperson w/ display_name, friend (consented, single, with prompts)
// ---------------------------------------------------------------------------
console.log('\n--- Step 1: seed wingperson + friend ---');
const owner = client();
const ownerEmail = `test-${rand()}@matchbook-test.com`;
const displayName = 'Priya W.';
{
  const { data, error } = await owner.auth.signUp({ email: ownerEmail, password: 'test-pass-123!' });
  if (error || !data.session) fail('owner signup', error?.message ?? 'no session');
  else pass('owner signup (session returned, email confirm disabled)');

  const { error: updErr } = await owner.from('wingpeople').update({ display_name: displayName }).eq('id', data.user.id);
  if (updErr) fail('update wingpeople.display_name', updErr.message);
  else pass('wingpeople.display_name updated');
}

const { data: friend, error: friendErr } = await owner.from('friends').insert({
  first_name: 'Jenny',
  age: 29,
  city: 'Brooklyn',
  pitch: 'My funniest friend, dangerously good at karaoke',
  prompts: [{ q: 'Ideal Sunday', a: 'Dim sum then a long walk with no destination' }],
  looking_for: 'Someone who plans the date',
  consented: true,
}).select().single();
if (friendErr || !friend) fail('friend insert', friendErr?.message);
else pass(`friend inserted (share_slug=${friend.share_slug})`);

// ---------------------------------------------------------------------------
// 2. get_profile via RPC against LIVE project
// ---------------------------------------------------------------------------
console.log('\n--- Step 2: get_profile ---');
const visitor = client();
{
  const { data: prof, error } = await visitor.rpc('get_profile', { p_slug: friend.share_slug });
  if (error) fail('get_profile call', error.message);
  assert(prof.first_name === 'Jenny', 'first_name mismatch');
  assert(prof.age === 29, 'age mismatch');
  assert(prof.city === 'Brooklyn', 'city mismatch');
  assert(prof.pitch?.includes('karaoke'), 'pitch mismatch');
  assert(prof.looking_for === 'Someone who plans the date', 'looking_for mismatch');
  assert(Array.isArray(prof.prompts) && prof.prompts[0].a.includes('Dim sum'), 'prompts mismatch');
  assert(!('owner_id' in prof) && !('id' in prof) && !('consented' in prof) && !('share_slug' in prof), 'profile leaks internal fields');
  pass('get_profile returns correct fields, no internal leakage');
}

// ---------------------------------------------------------------------------
// 3. create_chat -> guest_token; owner reads chat metadata (explicit columns) -> friend_token
// ---------------------------------------------------------------------------
console.log('\n--- Step 3: create_chat + owner chat metadata read ---');
const { data: chat, error: chatErr } = await visitor.rpc('create_chat', { p_slug: friend.share_slug });
if (chatErr || !chat?.guest_token) fail('create_chat', chatErr?.message);
else pass(`create_chat returned guest_token (len=${chat.guest_token.length})`);

const { data: chatRows, error: chatRowsErr } = await owner
  .from('chats')
  .select('id, friend_id, status, ended_by, friend_token, created_at, ended_at')
  .eq('friend_id', friend.id);
if (chatRowsErr || chatRows?.length !== 1) fail('owner chat metadata read', chatRowsErr?.message ?? `rows=${chatRows?.length}`);
const chatRow = chatRows[0];
assert(chatRow.status === 'active', 'chat status should be active');
assert(chatRow.friend_token?.length >= 22, 'friend_token missing/short');
pass('owner reads chat metadata via explicit columns (no *), gets friend_token');

const guestToken = chat.guest_token;
const friendToken = chatRow.friend_token;

// ---------------------------------------------------------------------------
// 4. REALTIME WIRE CHECK — two separate supabase-js clients, broadcast channel
// ---------------------------------------------------------------------------
console.log('\n--- Step 4: realtime wire check (broadcast message/ended) ---');
const clientA = client(); // will act as guest
const clientB = client(); // will act as friend

const { data: chatA, error: gcaErr } = await clientA.rpc('get_chat', { p_token: guestToken });
if (gcaErr || !chatA) fail('get_chat (A/guest)', gcaErr?.message);
const { data: chatB, error: gcbErr } = await clientB.rpc('get_chat', { p_token: friendToken });
if (gcbErr || !chatB) fail('get_chat (B/friend)', gcbErr?.message);
assert(chatA.broadcast_key === chatB.broadcast_key, 'broadcast_key mismatch between guest/friend views');
assert(chatB.role === 'friend' && chatB.friend_name === 'Jenny', 'friend-side get_chat shape wrong');
assert(chatB.wingperson_name === displayName, `wingperson_name should be "${displayName}", got "${chatB.wingperson_name}"`);
assert(chatA.role === 'guest', 'guest-side role wrong');
pass('get_chat returns matching broadcast_key + correct role/names for both tokens');

const broadcastKey = chatA.broadcast_key;
const topic = 'chat:' + broadcastKey;

function waitForEvent(channel, event, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for '${event}' on ${topic}`)), timeoutMs);
    channel.on('broadcast', { event }, ({ payload }) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

// Subscribe B to receive 'message' events (B is the recipient in this leg)
const channelB = clientB.channel(topic);
const messageWait = waitForEvent(channelB, 'message');
await new Promise((resolve) => channelB.subscribe((status) => { if (status === 'SUBSCRIBED') resolve(); }));

// Also subscribe A's own channel so it can later receive 'ended' from B's STOP
const channelA = clientA.channel(topic);
const endedWaitForA = waitForEvent(channelA, 'ended');
await new Promise((resolve) => channelA.subscribe((status) => { if (status === 'SUBSCRIBED') resolve(); }));

// give subscriptions a beat to fully register on the server side
await new Promise((r) => setTimeout(r, 500));

// Send a message from client A (guest) via send_message RPC
const sentBody = 'hi jenny! this is the live realtime check';
const { data: sendRes, error: sendErr } = await clientA.rpc('send_message', { p_token: guestToken, p_body: sentBody });
if (sendErr || !sendRes?.ok) fail('send_message (A)', sendErr?.message ?? JSON.stringify(sendRes));

try {
  const payload = await messageWait;
  assert(payload.sender === 'guest', `expected sender 'guest', got '${payload.sender}'`);
  assert(payload.body === sentBody, `expected body '${sentBody}', got '${payload.body}'`);
  assert(typeof payload.created_at === 'string' && payload.created_at.length > 0, 'created_at missing');
  pass(`client B received 'message' broadcast within 5s: {sender:${payload.sender}, body match, created_at present}`);
} catch (e) {
  fail("client B receives 'message' broadcast within 5s", e.message);
}

// Send STOP from B (friend side) -> both A and B's subscriptions (and any other) should get 'ended'
const { data: stopRes, error: stopErr } = await clientB.rpc('send_message', { p_token: friendToken, p_body: 'STOP' });
if (stopErr || !stopRes?.ok || !stopRes?.ended) fail('send_message STOP (B)', stopErr?.message ?? JSON.stringify(stopRes));
else pass("send_message('STOP') from B returns {ok:true, ended:true}");

try {
  await endedWaitForA;
  pass("client A's subscriber received 'ended' broadcast within 5s");
} catch (e) {
  fail("client A receives 'ended' broadcast within 5s", e.message);
}

await clientA.removeChannel(channelA);
await clientB.removeChannel(channelB);

// ---------------------------------------------------------------------------
// 5. Post-STOP: both tokens rejected with 'ended'; get_chat shows ended; STOP not stored
// ---------------------------------------------------------------------------
console.log('\n--- Step 5: post-STOP invariants ---');
{
  const { data: r1 } = await clientA.rpc('send_message', { p_token: guestToken, p_body: 'are you there?' });
  assert(r1?.ok === false && r1?.error === 'ended', `guest send after STOP should be rejected with 'ended', got ${JSON.stringify(r1)}`);
  pass('guest token rejected post-STOP with error=ended');

  const { data: r2 } = await clientB.rpc('send_message', { p_token: friendToken, p_body: 'hello?' });
  assert(r2?.ok === false && r2?.error === 'ended', `friend send after STOP should be rejected with 'ended', got ${JSON.stringify(r2)}`);
  pass('friend token rejected post-STOP with error=ended');

  const { data: finalChat } = await clientA.rpc('get_chat', { p_token: guestToken });
  assert(finalChat.status === 'ended', 'get_chat should show status=ended');
  assert(finalChat.ended_by === 'friend', `ended_by should be 'friend' (B sent STOP), got '${finalChat.ended_by}'`);
  const bodies = finalChat.messages.map((m) => m.body);
  assert(!bodies.some((b) => b.trim().toUpperCase() === 'STOP'), 'STOP message must never be stored');
  assert(bodies.includes(sentBody), 'the earlier real message should still be present');
  pass('get_chat shows status=ended, ended_by=friend, STOP not present in messages, prior message intact');
}

// ---------------------------------------------------------------------------
// 6. Friend status flip to 'taken' (as owner) on a SECOND friend+chat
// ---------------------------------------------------------------------------
console.log('\n--- Step 6: status-flip kill switch ---');
const { data: friend2, error: friend2Err } = await owner.from('friends').insert({
  first_name: 'Marco',
  age: 31,
  city: 'Queens',
  pitch: 'Will beat you at chess and then buy you a drink',
  consented: true,
}).select().single();
if (friend2Err || !friend2) fail('second friend insert', friend2Err?.message);

const visitor2 = client();
const { data: chat2 } = await visitor2.rpc('create_chat', { p_slug: friend2.share_slug });
assert(chat2?.guest_token, 'second create_chat failed');
pass('second friend + chat created');

const { error: flipErr } = await owner.from('friends').update({ status: 'taken' }).eq('id', friend2.id);
if (flipErr) fail('status flip to taken', flipErr.message);

const { data: profAfterFlip } = await visitor2.rpc('get_profile', { p_slug: friend2.share_slug });
assert(profAfterFlip === null, 'get_profile should be null after status flip to taken');
pass('get_profile returns null after friend status -> taken');

const { data: chatAfterFlip } = await visitor2.rpc('get_chat', { p_token: chat2.guest_token });
assert(chatAfterFlip.status === 'ended', 'chat should be auto-ended after status flip');
pass('chat auto-ended after friend status flip (DB trigger confirmed on live project)');

// ---------------------------------------------------------------------------
console.log(`\n=== e2e-live: ALL ${passCount} ASSERTIONS PASSED ===`);
console.log('Seeded profile for manual/browser checks:');
console.log('  profile: /p/' + friend.share_slug + '  (NOTE: chat for this friend is now ENDED — use a fresh script run or seed-demo.mjs for a live browser chat demo)');
