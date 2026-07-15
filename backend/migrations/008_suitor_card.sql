-- Suitor card: optional vouch card (photo / name / IG / vouch tags) the
-- wingperson attaches when forwarding the friend's chat link. Friend-only:
-- get_chat includes it solely for the friend role — the guest payload never
-- contains the key. Written directly by the owning wingperson via a
-- column-level grant; the CHECK constraint is the trust boundary (this jsonb
-- is rendered in the friend's browser).

alter table public.chats
  add column if not exists suitor_card jsonb;

alter table public.chats drop constraint if exists chats_suitor_card_shape;
alter table public.chats add constraint chats_suitor_card_shape check (
  suitor_card is null or (
    jsonb_typeof(suitor_card) = 'object'
    and suitor_card - 'name' - 'photo' - 'ig' - 'tags' = '{}'::jsonb
    and (suitor_card->'name' is null or jsonb_typeof(suitor_card->'name') = 'string')
    and (suitor_card->'photo' is null or (
      jsonb_typeof(suitor_card->'photo') = 'string'
      and suitor_card->>'photo' like
        'https://gyhqbnyuufntgdmowrbi.supabase.co/storage/v1/object/public/photos/%'))
    and (suitor_card->'ig' is null or (
      jsonb_typeof(suitor_card->'ig') = 'string'
      and suitor_card->>'ig' ~ '^[A-Za-z0-9._]{1,30}$'))
    and (suitor_card->'tags' is null or jsonb_typeof(suitor_card->'tags') = 'array')
    and pg_column_size(suitor_card) < 2048
  )
);

-- Ownership-scoped write path; explicit WITH CHECK is defense in depth against
-- any future widening of the update column grant. Ended chats are immutable.
drop policy if exists chats_owner_card on public.chats;
create policy chats_owner_card on public.chats for update to authenticated
  using (status = 'active' and exists (
    select 1 from public.friends f
    where f.id = chats.friend_id and f.owner_id = auth.uid()))
  with check (exists (
    select 1 from public.friends f
    where f.id = chats.friend_id and f.owner_id = auth.uid()));

grant update (suitor_card), select (suitor_card) on public.chats to authenticated;

-- get_chat: card key appended ONLY in the friend-role branch — the key must be
-- entirely absent (not null-valued) from guest payloads.
create or replace function public.get_chat(p_token text) returns jsonb
language plpgsql security definer set search_path = public stable as $$
declare v record; v_out jsonb;
begin
  select c.id, c.status, c.ended_by, c.broadcast_key, r.role, f.first_name,
         w.display_name, c.suitor_card
    into v
    from public._chat_for(p_token) r
    join chats c on c.id = r.chat_id
    join friends f on f.id = c.friend_id
    join wingpeople w on w.id = f.owner_id;
  if v is null then return null; end if;
  v_out := jsonb_build_object(
    'status', v.status, 'ended_by', v.ended_by, 'role', v.role,
    'friend_name', v.first_name, 'wingperson_name', v.display_name,
    'broadcast_key', v.broadcast_key,
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('sender', m.sender, 'body', m.body,
                                          'created_at', m.created_at)
                       order by m.created_at)
      from messages m where m.chat_id = v.id), '[]'::jsonb));
  if v.role = 'friend' and v.suitor_card is not null then
    v_out := v_out || jsonb_build_object('suitor_card', v.suitor_card);
  end if;
  return v_out;
end $$;
