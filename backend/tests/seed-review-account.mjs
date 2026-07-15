// One-shot: creates the App Review demo account documented in
// docs/app-store-submission.md. Safe to re-run; it fails loudly if the
// account already exists.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const cfg = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const c = createClient(cfg.url, cfg.anonKey, { auth: { persistSession: false } });

const EMAIL = 'appreview@matchbook-demo.com';
const PASSWORD = 'Matchbook-Review-2026!';

const { data, error } = await c.auth.signUp({ email: EMAIL, password: PASSWORD });
if (error) { console.error('signUp failed:', error.message); process.exit(1); }
await c.from('wingpeople').update({ display_name: 'Demo Wingperson' }).eq('id', data.user.id);

const friends = [
  { first_name: 'Jenny', age: 29, city: 'Brooklyn', gender: 'girl',
    pitch: 'My funniest friend, dangerously good at karaoke', consented: true,
    looking_for: 'Someone who plans the date', job: 'Art director',
    interests: ['karaoke', 'dim sum', 'F1'],
    prompts: [{ q: 'Ideal Sunday', a: 'Dim sum then a long walk with no destination' }] },
  { first_name: 'Marcus', age: 32, city: 'Manhattan', gender: 'guy',
    pitch: 'Certified normal, cooks a legendary Sunday ragù', consented: true,
    looking_for: 'Someone to cook for', job: 'Product manager',
    interests: ['cooking', 'running', 'jazz'],
    prompts: [{ q: 'Best meal they cook', a: 'A six-hour ragù that has ended arguments' }] },
];
for (const f of friends) {
  const { data: row, error: fe } = await c.from('friends').insert(f).select().single();
  if (fe) { console.error('friend insert failed:', fe.message); process.exit(1); }
  console.log(`${row.first_name}: /p/${row.share_slug}`);
}
console.log(`review account ready: ${EMAIL}`);
