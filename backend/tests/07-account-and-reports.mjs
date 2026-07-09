import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import assert from 'assert';

const cfg = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const anon = () => createClient(cfg.url, cfg.anonKey, { auth: { persistSession: false } });
const rand = () => Math.random().toString(36).slice(2, 10);

const mkOwner = async () => {
  const c = anon();
  const email = `test-${rand()}@matchbook-test.com`;
  const password = 'test-pass-123!';
  const { data, error } = await c.auth.signUp({ email, password });
  assert(!error, `signUp: ${error?.message}`);
  return { c, email, password, uid: data.user.id };
};
const mkFriend = async (owner) => (await owner.from('friends').insert({
  first_name: 'Jenny', age: 29, pitch: 'Great taste in people', consented: true,
}).select().single()).data;

const visitor = anon();

// ---------- delete_account ----------
{
  const { c: owner, email, password, uid } = await mkOwner();
  const f = await mkFriend(owner);

  // photo in the owner's storage folder — must be unreachable after deletion
  const photoPath = `${uid}/${rand()}.jpg`;
  const { error: upErr } = await owner.storage.from('photos')
    .upload(photoPath, new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0, 0, 0, 0]).buffer,
            { contentType: 'image/jpeg' });
  assert(!upErr, `photo upload: ${upErr?.message}`);
  const photoUrl = owner.storage.from('photos').getPublicUrl(photoPath).data.publicUrl;
  assert((await fetch(photoUrl)).ok, 'photo should be publicly reachable before deletion');

  // a live chat with a message
  const { data: chat } = await visitor.rpc('create_chat', { p_slug: f.share_slug });
  const { data: sent } = await visitor.rpc('send_message', { p_token: chat.guest_token, p_body: 'hi!' });
  assert(sent.ok, 'send should work before deletion');

  // anonymous callers cannot delete anything
  const { error: anonDel } = await visitor.rpc('delete_account');
  assert(anonDel, 'delete_account must fail for anonymous callers');

  // the owner deletes their account
  const { error: delErr } = await owner.rpc('delete_account');
  assert(!delErr, `delete_account: ${delErr?.message}`);

  const { error: signInErr } = await anon().auth.signInWithPassword({ email, password });
  assert(signInErr, 'sign-in must fail after account deletion');

  const { data: prof } = await visitor.rpc('get_profile', { p_slug: f.share_slug });
  assert(prof === null, 'profile link must go dead after account deletion');

  const { data: deadChat } = await visitor.rpc('get_chat', { p_token: chat.guest_token });
  assert(deadChat === null, 'chat link must go dead after account deletion');

  const photoAfter = await fetch(photoUrl);
  assert(!photoAfter.ok, `photo must 404 after deletion (got ${photoAfter.status})`);

  console.log('delete_account ✓');
}

// ---------- reports ----------
{
  const { c: owner } = await mkOwner();
  const f = await mkFriend(owner);
  const { data: chat } = await visitor.rpc('create_chat', { p_slug: f.share_slug });

  const { error: rp } = await visitor.rpc('report_profile',
    { p_slug: f.share_slug, p_reason: 'test: fake profile' });
  assert(!rp, `report_profile: ${rp?.message}`);

  const { error: rc } = await visitor.rpc('report_chat',
    { p_token: chat.guest_token, p_reason: 'test: abusive messages' });
  assert(!rc, `report_chat: ${rc?.message}`);

  // unknown slug/token: silent no-op — same shape as success, no existence oracle
  const { error: rpBad } = await visitor.rpc('report_profile',
    { p_slug: 'not-a-real-slug', p_reason: 'whatever' });
  assert(!rpBad, 'report_profile must not reveal whether a slug exists');
  const { error: rcBad } = await visitor.rpc('report_chat',
    { p_token: 'not-a-real-token', p_reason: 'whatever' });
  assert(!rcBad, 'report_chat must not reveal whether a token exists');

  // reason validation
  const { error: empty } = await visitor.rpc('report_profile', { p_slug: f.share_slug, p_reason: '  ' });
  assert(empty, 'empty reason must be rejected');
  const { error: long } = await visitor.rpc('report_profile',
    { p_slug: f.share_slug, p_reason: 'x'.repeat(501) });
  assert(long, 'over-length reason must be rejected');

  // the reports table is not readable by anon or authenticated
  const { error: anonRead } = await visitor.from('reports').select('*');
  assert(anonRead, 'anon must not read reports');
  const { error: ownerRead } = await owner.from('reports').select('*');
  assert(ownerRead, 'authenticated must not read reports');

  console.log('reports ✓');
}

console.log('07-account-and-reports: all assertions passed');
