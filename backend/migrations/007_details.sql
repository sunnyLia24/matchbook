-- More profile detail: job, height, interests — shown on the public profile.
-- Prompts stay jsonb (no change needed for the prompt library).

alter table public.friends
  add column if not exists job text,
  add column if not exists height text,
  add column if not exists interests jsonb not null default '[]';

create or replace function public.get_profile(p_slug text) returns jsonb
language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'first_name', f.first_name, 'age', f.age, 'city', f.city,
    'pitch', f.pitch, 'looking_for', f.looking_for,
    'prompts', f.prompts, 'photos', f.photos,
    'job', f.job, 'height', f.height, 'interests', f.interests)
  from friends f
  where f.share_slug = p_slug and f.status = 'single' and f.consented
$$;
