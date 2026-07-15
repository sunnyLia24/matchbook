-- looking_for is the wingperson's private note about their friend's type —
-- keep it in the app, stop publishing it on the public profile.

create or replace function public.get_profile(p_slug text) returns jsonb
language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'first_name', f.first_name, 'age', f.age, 'city', f.city,
    'pitch', f.pitch,
    'prompts', f.prompts, 'photos', f.photos,
    'job', f.job, 'height', f.height, 'interests', f.interests)
  from friends f
  where f.share_slug = p_slug and f.status = 'single' and f.consented
$$;
