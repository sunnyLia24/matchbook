import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import assert from 'assert';

const cfg = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const anon = () => createClient(cfg.url, cfg.anonKey, { auth: { persistSession: false } });
const rand = () => Math.random().toString(36).slice(2, 10);
const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));

const owner = anon();
const { data: su } = await owner.auth.signUp({ email: `test-${rand()}@matchbook-test.com`, password: 'test-pass-123!' });
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
