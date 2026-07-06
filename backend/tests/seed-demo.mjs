import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const cfg = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const c = createClient(cfg.url, cfg.anonKey, { auth: { persistSession: false } });
await c.auth.signUp({ email: `demo-${Math.random().toString(36).slice(2,8)}@matchbook-test.com`, password: 'test-pass-123!' });
const { data: f } = await c.from('friends').insert({
  first_name: 'Jenny', age: 29, city: 'Brooklyn', pitch: 'My funniest friend, dangerously good at karaoke',
  prompts: [{ q: 'Ideal Sunday', a: 'Dim sum then a long walk with no destination' }],
  looking_for: 'Someone who plans the date', consented: true }).select().single();
console.log('profile: /p/' + f.share_slug);
