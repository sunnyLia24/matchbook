-- Chat RPC layer: get_chat, send_message (server-side STOP enforcement),
-- end_chat, and the friend-status-change chat lock.

-- resolve a participant token to (chat id, role)
create or replace function public._chat_for(p_token text)
returns table (chat_id uuid, role text)
language sql security definer set search_path = public stable as $$
  select id, case when guest_token = p_token then 'guest' else 'friend' end
  from chats where guest_token = p_token or friend_token = p_token
$$;

create or replace function public.get_chat(p_token text) returns jsonb
language plpgsql security definer set search_path = public stable as $$
declare v record;
begin
  select c.id, c.status, c.ended_by, c.broadcast_key, r.role, f.first_name,
         w.display_name
    into v
    from public._chat_for(p_token) r
    join chats c on c.id = r.chat_id
    join friends f on f.id = c.friend_id
    join wingpeople w on w.id = f.owner_id;
  if v is null then return null; end if;
  return jsonb_build_object(
    'status', v.status, 'ended_by', v.ended_by, 'role', v.role,
    'friend_name', v.first_name, 'wingperson_name', v.display_name,
    'broadcast_key', v.broadcast_key,
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('sender', m.sender, 'body', m.body,
                                          'created_at', m.created_at)
                       order by m.created_at)
      from messages m where m.chat_id = v.id), '[]'::jsonb));
end $$;

create or replace function public._end_chat_row(p_chat uuid, p_by text) returns void
language plpgsql security definer set search_path = public volatile as $$
declare v_key text;
begin
  update chats set status = 'ended', ended_by = p_by, ended_at = now()
    where id = p_chat and status = 'active'
    returning broadcast_key into v_key;
  if v_key is not null then
    perform realtime.send('{}'::jsonb, 'ended', 'chat:' || v_key, false);
  end if;
end $$;

create or replace function public.send_message(p_token text, p_body text) returns jsonb
language plpgsql security definer set search_path = public volatile as $$
declare v record; v_body text; v_key text; v_msg record;
begin
  select r.chat_id, r.role, c.status, c.broadcast_key into v
    from public._chat_for(p_token) r join chats c on c.id = r.chat_id;
  if v is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v.status <> 'active' then return jsonb_build_object('ok', false, 'error', 'ended'); end if;
  v_body := btrim(p_body);
  if v_body = '' or length(v_body) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if upper(v_body) = 'STOP' then
    perform public._end_chat_row(v.chat_id, v.role);
    return jsonb_build_object('ok', true, 'ended', true);
  end if;
  insert into messages (chat_id, sender, body) values (v.chat_id, v.role, v_body)
    returning sender, body, created_at into v_msg;
  perform realtime.send(
    jsonb_build_object('sender', v_msg.sender, 'body', v_msg.body,
                       'created_at', v_msg.created_at),
    'message', 'chat:' || v.broadcast_key, false);
  return jsonb_build_object('ok', true, 'ended', false);
end $$;

create or replace function public.end_chat(p_token text) returns jsonb
language plpgsql security definer set search_path = public volatile as $$
declare v record;
begin
  select r.chat_id, r.role into v from public._chat_for(p_token) r;
  if v is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  perform public._end_chat_row(v.chat_id, v.role);
  return jsonb_build_object('ok', true, 'ended', true);
end $$;

-- leaving 'single' ends all active chats
create or replace function public.handle_friend_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if new.status <> 'single' and old.status = 'single' then
    for c in select id from chats where friend_id = new.id and status = 'active' loop
      perform public._end_chat_row(c.id, null);
    end loop;
  end if;
  return new;
end $$;
create trigger on_friend_status_change after update of status on public.friends
  for each row execute function public.handle_friend_status();

revoke all on function public.get_chat(text), public.send_message(text, text),
  public.end_chat(text) from public;
grant execute on function public.get_chat(text), public.send_message(text, text),
  public.end_chat(text) to anon, authenticated;
revoke all on function public._chat_for(text), public._end_chat_row(uuid, text) from public, anon, authenticated;

-- Mandatory carryover fix: matchbook_token was still executable by public/anon.
-- authenticated needs it (friends.share_slug/guest_token/friend_token/broadcast_key
-- column defaults fire on inserts by authenticated wingpeople).
revoke execute on function public.matchbook_token() from public, anon;

-- handle_friend_status is a trigger function (like handle_new_user in migration
-- 002) — it should only ever run via the trigger, never be called directly.
revoke execute on function public.handle_friend_status() from public, anon, authenticated;
