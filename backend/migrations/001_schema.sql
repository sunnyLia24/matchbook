-- Matchbook schema. Anonymous visitors act only via SECURITY DEFINER functions
-- (migration 002); tables are closed by default.
create extension if not exists pgcrypto;

-- url-safe random token, 18 bytes = 144 bits
create or replace function public.matchbook_token() returns text
language sql volatile as $$
  select translate(encode(gen_random_bytes(18), 'base64'), '+/=', '-_')
$$;

create table public.wingpeople (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  expo_push_token text,
  created_at timestamptz not null default now()
);

create table public.friends (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.wingpeople(id) on delete cascade,
  first_name text not null,
  age int check (age between 18 and 120),
  city text,
  pitch text,
  prompts jsonb not null default '[]',
  looking_for text,
  photos jsonb not null default '[]',
  status text not null default 'single' check (status in ('single','taken','hidden')),
  consented boolean not null default false,
  share_slug text not null unique default public.matchbook_token(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.chats (
  id uuid primary key default gen_random_uuid(),
  friend_id uuid not null references public.friends(id) on delete cascade,
  status text not null default 'active' check (status in ('active','ended')),
  ended_by text check (ended_by in ('guest','friend')), -- NULL passes checks implicitly
  guest_token text not null unique default public.matchbook_token(),
  friend_token text not null unique default public.matchbook_token(),
  broadcast_key text not null default public.matchbook_token(),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create index chats_friend_id_idx on public.chats(friend_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  sender text not null check (sender in ('guest','friend')),
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index messages_chat_id_idx on public.messages(chat_id, created_at);

-- signup trigger: every auth user gets a wingpeople row
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.wingpeople (id, display_name)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.wingpeople enable row level security;
alter table public.friends enable row level security;
alter table public.chats enable row level security;
alter table public.messages enable row level security;

create policy wp_own on public.wingpeople for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy friends_own on public.friends for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy chats_owner_read on public.chats for select to authenticated
  using (exists (select 1 from public.friends f
                 where f.id = chats.friend_id and f.owner_id = auth.uid()));

-- lock down grants: messages fully closed; chats column-limited (no guest_token,
-- no broadcast_key — the app never joins rooms)
revoke all on public.messages from anon, authenticated;
revoke all on public.chats from anon, authenticated;
grant select (id, friend_id, status, ended_by, friend_token, created_at, ended_at)
  on public.chats to authenticated;
revoke all on public.friends from anon;
revoke all on public.wingpeople from anon;
