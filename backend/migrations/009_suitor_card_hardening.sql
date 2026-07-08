-- Suitor card hardening (final-review follow-ups):
--   * cap name at 50 chars (it renders into the gate title and about button);
--   * reject '..' in photo so the storage-prefix LIKE can't be walked to a
--     sibling bucket on the same host;
--   * add status = 'active' to the write policy's WITH CHECK so the policy
--     delivers the active-only defense in depth its comment promises.

-- Backfill: null out any existing card the tightened constraint would reject
-- (test data from the pre-tightening suite; nothing user-facing loses data).
update public.chats set suitor_card = null
  where suitor_card is not null
    and (length(suitor_card->>'name') > 50
         or position('..' in coalesce(suitor_card->>'photo', '')) > 0);

alter table public.chats drop constraint if exists chats_suitor_card_shape;
alter table public.chats add constraint chats_suitor_card_shape check (
  suitor_card is null or (
    jsonb_typeof(suitor_card) = 'object'
    and suitor_card - 'name' - 'photo' - 'ig' - 'tags' = '{}'::jsonb
    and (suitor_card->'name' is null or (
      jsonb_typeof(suitor_card->'name') = 'string'
      and length(suitor_card->>'name') <= 50))
    and (suitor_card->'photo' is null or (
      jsonb_typeof(suitor_card->'photo') = 'string'
      and suitor_card->>'photo' like
        'https://gyhqbnyuufntgdmowrbi.supabase.co/storage/v1/object/public/photos/%'
      and position('..' in suitor_card->>'photo') = 0))
    and (suitor_card->'ig' is null or (
      jsonb_typeof(suitor_card->'ig') = 'string'
      and suitor_card->>'ig' ~ '^[A-Za-z0-9._]{1,30}$'))
    and (suitor_card->'tags' is null or jsonb_typeof(suitor_card->'tags') = 'array')
    and pg_column_size(suitor_card) < 2048
  )
);

drop policy if exists chats_owner_card on public.chats;
create policy chats_owner_card on public.chats for update to authenticated
  using (status = 'active' and exists (
    select 1 from public.friends f
    where f.id = chats.friend_id and f.owner_id = auth.uid()))
  with check (status = 'active' and exists (
    select 1 from public.friends f
    where f.id = chats.friend_id and f.owner_id = auth.uid()));
