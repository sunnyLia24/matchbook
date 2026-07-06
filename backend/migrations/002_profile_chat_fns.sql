-- Anonymous RPC layer: get_profile + create_chat, plus carryover hardening
-- from Task 2's security-advisor review (handle_new_user execute grants,
-- matchbook_token search_path).

create or replace function public.get_profile(p_slug text) returns jsonb
language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'first_name', f.first_name, 'age', f.age, 'city', f.city,
    'pitch', f.pitch, 'looking_for', f.looking_for,
    'prompts', f.prompts, 'photos', f.photos)
  from friends f
  where f.share_slug = p_slug and f.status = 'single' and f.consented
$$;

create or replace function public.create_chat(p_slug text) returns jsonb
language plpgsql security definer set search_path = public volatile as $$
declare v_friend uuid; v_token text;
begin
  select id into v_friend from friends
    where share_slug = p_slug and status = 'single' and consented;
  if v_friend is null then return null; end if;
  insert into chats (friend_id) values (v_friend) returning guest_token into v_token;
  return jsonb_build_object('guest_token', v_token);
end $$;

revoke all on function public.get_profile(text), public.create_chat(text) from public;
grant execute on function public.get_profile(text), public.create_chat(text) to anon, authenticated;

-- Carryover fix 1: handle_new_user is SECURITY DEFINER but only needs to run
-- via the auth.users trigger — anon/authenticated should never call it directly.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Carryover fix 2: pin matchbook_token's search_path (was mutable).
-- gen_random_bytes (pgcrypto) lives in the `extensions` schema on Supabase,
-- so it must be included alongside public/pg_temp for this to resolve.
create or replace function public.matchbook_token() returns text
language sql volatile set search_path = public, extensions, pg_temp as $$
  select translate(encode(gen_random_bytes(18), 'base64'), '+/=', '-_')
$$;
