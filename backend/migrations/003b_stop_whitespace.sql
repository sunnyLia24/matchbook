-- Fix: STOP detection (and the general body-trim) only stripped ASCII spaces
-- via btrim(text). A body like "stop\n" or "\tSTOP " kept its interior/edge
-- whitespace beyond plain spaces and was stored/broadcast as a normal message
-- instead of locking the chat. Trim the full whitespace set (space, tab, CR,
-- LF) for both the stored body and the STOP comparison, per the design spec's
-- general "trim whitespace" requirement. Everything else in send_message is
-- unchanged from 003_chat_fns.sql (grants/search_path/security definer are
-- preserved by create-or-replace, but re-asserted below since this migration
-- re-declares the same grants/revokes as 003 for auditability).

create or replace function public.send_message(p_token text, p_body text) returns jsonb
language plpgsql security definer set search_path = public volatile as $$
declare v record; v_body text; v_key text; v_msg record;
begin
  select r.chat_id, r.role, c.status, c.broadcast_key into v
    from public._chat_for(p_token) r join chats c on c.id = r.chat_id;
  if v is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v.status <> 'active' then return jsonb_build_object('ok', false, 'error', 'ended'); end if;
  v_body := btrim(p_body, E' \t\r\n');
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

revoke all on function public.get_chat(text), public.send_message(text, text),
  public.end_chat(text) from public;
grant execute on function public.get_chat(text), public.send_message(text, text),
  public.end_chat(text) to anon, authenticated;
