/**
 * Supabase schema. Profiles key off auth.users; app data is stored as JSON documents with
 * the columns RLS and queries need. Clients only ever SELECT (through RLS, for Realtime);
 * every write goes through the service-role API, which enforces ownership rules.
 */
export const TABLES = ["profiles", "profile_private", "requests", "donations", "records", "chats", "messages", "notifications"];
export const LIVE_TABLES = ["profiles", "requests", "donations", "records", "chats", "messages", "notifications"];

export const SCHEMA_SQL = `
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('user','admin')),
  status text not null default 'incomplete' check (status in ('incomplete','pending','approved','rejected')),
  seeded boolean not null default false,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.profile_private (
  id uuid primary key references public.profiles(id) on delete cascade,
  email text not null unique,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.requests (
  id text primary key,
  uid uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'open',
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.donations (
  id text primary key,
  uid uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active',
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.records (
  id text primary key,
  uid uuid not null references public.profiles(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create table if not exists public.chats (
  id text primary key,
  participants uuid[] not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.messages (
  id text primary key,
  chat_id text not null references public.chats(id) on delete cascade,
  sender uuid not null references public.profiles(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create table if not exists public.notifications (
  id text primary key,
  uid uuid not null references public.profiles(id) on delete cascade,
  is_read boolean not null default false,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists requests_status_idx on public.requests(status, created_at desc);
create index if not exists messages_chat_idx on public.messages(chat_id, created_at);
create index if not exists notifications_uid_idx on public.notifications(uid, created_at desc);
create index if not exists chats_participants_idx on public.chats using gin(participants);

create or replace function public.is_admin() returns boolean
  language sql stable security definer set search_path = public
  as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') $$;

alter table public.profiles enable row level security;
alter table public.profile_private enable row level security;
alter table public.requests enable row level security;
alter table public.donations enable row level security;
alter table public.records enable row level security;
alter table public.chats enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "profiles readable by members" on public.profiles;
create policy "profiles readable by members" on public.profiles for select to authenticated using (true);
drop policy if exists "private data for owner or admin" on public.profile_private;
create policy "private data for owner or admin" on public.profile_private for select to authenticated using (id = auth.uid() or public.is_admin());
drop policy if exists "requests readable by members" on public.requests;
create policy "requests readable by members" on public.requests for select to authenticated using (true);
drop policy if exists "donations readable by members" on public.donations;
create policy "donations readable by members" on public.donations for select to authenticated using (true);
drop policy if exists "records readable by members" on public.records;
create policy "records readable by members" on public.records for select to authenticated using (true);
drop policy if exists "chats for participants" on public.chats;
create policy "chats for participants" on public.chats for select to authenticated using (auth.uid() = any(participants));
drop policy if exists "messages for participants" on public.messages;
create policy "messages for participants" on public.messages for select to authenticated
  using (exists (select 1 from public.chats c where c.id = chat_id and auth.uid() = any(c.participants)));
drop policy if exists "own notifications" on public.notifications;
create policy "own notifications" on public.notifications for select to authenticated using (uid = auth.uid());

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array[${LIVE_TABLES.map((t) => `'${t}'`).join(",")}] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
`;

/** Local development only: a stand-in for Supabase's auth schema. */
export const DEV_AUTH_SQL = `
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text unique, encrypted_password text, created_at timestamptz default now());
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
`;
