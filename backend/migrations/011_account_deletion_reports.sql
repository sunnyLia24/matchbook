-- App Store readiness (Guidelines 5.1.1(v) + 1.2): in-app account deletion and
-- an anonymous report channel for the public web surfaces.

-- ---------- account deletion ----------
-- Runs as the function owner (postgres). Deleting the auth.users row cascades
-- through wingpeople -> friends -> chats -> messages (all FKs are ON DELETE
-- CASCADE). Storage: removing the user's storage.objects rows makes every
-- public photo URL 404 immediately — the serving layer resolves through that
-- table.
create or replace function public.delete_account() returns void
language plpgsql security definer set search_path = public volatile as $$
declare v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'not_signed_in';
  end if;
  delete from storage.objects
    where bucket_id = 'photos' and (storage.foldername(name))[1] = v_uid::text;
  delete from auth.users where id = v_uid;
end $$;

revoke all on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;

-- ---------- reports ----------
-- Write-only for the public: RLS on with no policies, no table grants; the two
-- RPCs are the only path in. friend_id/chat_id are deliberately NOT foreign
-- keys — a report must survive the reported content (or account) being deleted.
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('profile', 'chat')),
  friend_id uuid,
  chat_id uuid,
  reason text not null check (length(reason) between 1 and 500),
  created_at timestamptz not null default now()
);
alter table public.reports enable row level security;
revoke all on public.reports from public, anon, authenticated;

-- Reason validation raises for every caller; an unknown slug/token is a silent
-- no-op so the RPCs never act as an existence oracle for secret links.
create or replace function public.report_profile(p_slug text, p_reason text) returns void
language plpgsql security definer set search_path = public volatile as $$
declare v_id uuid; v_reason text;
begin
  v_reason := btrim(coalesce(p_reason, ''));
  if v_reason = '' or length(v_reason) > 500 then
    raise exception 'invalid_reason';
  end if;
  select id into v_id from friends where share_slug = p_slug;
  if v_id is null then return; end if;
  insert into reports (kind, friend_id, reason) values ('profile', v_id, v_reason);
end $$;

create or replace function public.report_chat(p_token text, p_reason text) returns void
language plpgsql security definer set search_path = public volatile as $$
declare v record; v_reason text;
begin
  v_reason := btrim(coalesce(p_reason, ''));
  if v_reason = '' or length(v_reason) > 500 then
    raise exception 'invalid_reason';
  end if;
  select r.chat_id, c.friend_id into v
    from public._chat_for(p_token) r join chats c on c.id = r.chat_id;
  if v is null then return; end if;
  insert into reports (kind, friend_id, chat_id, reason)
    values ('chat', v.friend_id, v.chat_id, v_reason);
end $$;

revoke all on function public.report_profile(text, text),
              public.report_chat(text, text) from public;
grant execute on function public.report_profile(text, text),
                 public.report_chat(text, text) to anon, authenticated;
