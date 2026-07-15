create extension if not exists pg_net;

create or replace function public.notify_new_chat() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text; v_token text;
begin
  select f.first_name, w.expo_push_token into v_name, v_token
    from friends f join wingpeople w on w.id = f.owner_id
    where f.id = new.friend_id;
  if v_token is not null and v_token like 'ExponentPushToken%' then
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object(
        'to', v_token,
        'title', 'Matchbook',
        'body', 'Someone wants to talk to ' || v_name || '! Open the app to forward them the chat link.'));
  end if;
  return new;
end $$;
create trigger on_chat_created after insert on public.chats
  for each row execute function public.notify_new_chat();

revoke all on function public.notify_new_chat() from public, anon, authenticated;
