-- Apple sign-in gives us the user's real name only via the client; a fabricated
-- email-prefix default made every profile "named" and dead-ended both the Apple
-- name capture and the missing-name prompt. New signups start unnamed instead.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.wingpeople (id, display_name) values (new.id, null);
  return new;
end $$;
