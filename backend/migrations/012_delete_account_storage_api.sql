-- Fix for 011: Supabase's storage layer rejects direct SQL deletes on
-- storage.objects ("Use the Storage API instead"), so delete_account() can no
-- longer purge photos itself. The client removes its own photo folder through
-- the Storage API first (owner list/delete policies from migration 004), then
-- calls this. The function keeps to what SQL can do: delete the auth user,
-- which cascades wingpeople -> friends -> chats -> messages.
create or replace function public.delete_account() returns void
language plpgsql security definer set search_path = public volatile as $$
declare v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'not_signed_in';
  end if;
  delete from auth.users where id = v_uid;
end $$;
