-- Minimal Twitch grant schema for isolated authorization / idempotency tests.
-- Local disposable DB only — never install on production.

create extension if not exists pgcrypto;

create schema if not exists auth;
create schema if not exists starlight_test;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_app_meta_data jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
$$;

do $$ begin
  create role anon nologin;
exception when duplicate_object then null;
end $$;
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null;
end $$;
do $$ begin
  create role service_role nologin bypassrls;
exception when duplicate_object then null;
end $$;

create table if not exists public.content_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create or replace function public.is_content_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.content_admins where user_id = auth.uid()
  );
$$;

create table if not exists public.twitch_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  twitch_user_id text not null unique,
  twitch_login text not null
);

create table if not exists public.twitch_reward_rules (
  id uuid primary key default gen_random_uuid(),
  name text,
  event_type text,
  reward_type text not null,
  season_id text,
  star_bits_amount bigint,
  card_id text,
  card_quantity integer,
  booster_id text,
  twitch_reward_id text,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.twitch_reward_events (
  event_id text primary key,
  event_type text,
  twitch_user_id text,
  twitch_login text,
  payload jsonb,
  status text not null default 'received',
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists public.twitch_reward_grants (
  id uuid primary key default gen_random_uuid(),
  event_id text references public.twitch_reward_events(event_id) on delete set null,
  rule_id uuid references public.twitch_reward_rules(id) on delete set null,
  user_id uuid references auth.users(id) on delete cascade,
  twitch_user_id text,
  reward_snapshot jsonb,
  source text,
  granted_by uuid,
  granted_at timestamptz not null default now()
);

create table if not exists public.received_rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null,
  source_id text,
  title text,
  message text,
  reward_type text not null,
  reward_payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  created_by uuid,
  metadata jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists received_rewards_source_unique_idx
  on public.received_rewards (user_id, source_type, source_id)
  where source_id is not null;

create table if not exists public.user_season_access (
  user_id uuid not null,
  season_id text not null,
  source text,
  twitch_event_id text,
  granted_at timestamptz not null default now(),
  primary key (user_id, season_id)
);

create unique index if not exists user_season_access_twitch_event_uidx
  on public.user_season_access (twitch_event_id)
  where twitch_event_id is not null;

create table if not exists public.twitch_pending_unlocks (
  id uuid primary key default gen_random_uuid(),
  twitch_user_id text not null,
  twitch_login text,
  season_id text not null,
  event_id text not null unique,
  rule_id uuid,
  payload jsonb,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create or replace function public.queue_received_reward_v892(
  requested_user_id uuid,
  requested_source_type text,
  requested_source_id text,
  requested_title text,
  requested_message text,
  requested_reward_type text,
  requested_reward_payload jsonb,
  requested_created_by uuid,
  requested_metadata jsonb,
  requested_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  row public.received_rewards%rowtype;
begin
  insert into public.received_rewards(
    user_id, source_type, source_id, title, message, reward_type, reward_payload,
    created_by, metadata, expires_at
  ) values (
    requested_user_id, requested_source_type, requested_source_id, requested_title,
    requested_message, requested_reward_type, coalesce(requested_reward_payload, '{}'::jsonb),
    requested_created_by, requested_metadata, requested_expires_at
  )
  on conflict (user_id, source_type, source_id) where source_id is not null
  do update set title = excluded.title
  returning * into row;

  return jsonb_build_object('id', row.id, 'status', row.status);
end;
$$;

revoke all on function public.queue_received_reward_v892(uuid,text,text,text,text,text,jsonb,uuid,jsonb,timestamptz) from public, anon, authenticated;
grant execute on function public.queue_received_reward_v892(uuid,text,text,text,text,text,jsonb,uuid,jsonb,timestamptz) to service_role;

create or replace function public.grant_season_pass_access_v1(
  requested_user_id uuid,
  requested_season_id text,
  requested_source text,
  requested_event_id text,
  requested_metadata jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.user_season_access(user_id, season_id, source, twitch_event_id)
  values (requested_user_id, requested_season_id, requested_source, nullif(requested_event_id, ''))
  on conflict (user_id, season_id) do update
    set twitch_event_id = coalesce(excluded.twitch_event_id, public.user_season_access.twitch_event_id);
  return jsonb_build_object('success', true, 'seasonId', requested_season_id);
end;
$$;

create or replace function public.queue_twitch_pending_unlock_v1(
  requested_twitch_user_id text,
  requested_twitch_login text,
  requested_season_id text,
  requested_event_id text,
  requested_rule_id uuid,
  requested_payload jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.twitch_pending_unlocks(
    twitch_user_id, twitch_login, season_id, event_id, rule_id, payload
  ) values (
    trim(requested_twitch_user_id), requested_twitch_login, requested_season_id,
    trim(requested_event_id), requested_rule_id, requested_payload
  )
  on conflict (event_id) do nothing;
end;
$$;

-- Seed actors
insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ordinary@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'staff@example.test'),
  ('33333333-3333-3333-3333-333333333333', 'target@example.test')
on conflict (id) do nothing;

insert into public.content_admins(user_id)
values ('22222222-2222-2222-2222-222222222222')
on conflict do nothing;

insert into public.twitch_connections(user_id, twitch_user_id, twitch_login) values
  ('11111111-1111-1111-1111-111111111111', 'twitch_ordinary', 'ordinary_viewer'),
  ('33333333-3333-3333-3333-333333333333', 'twitch_target', 'target_viewer')
on conflict (user_id) do nothing;

insert into public.twitch_reward_rules(id, name, event_type, reward_type, season_id, star_bits_amount, active)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Bits', 'channel_points', 'star_bits', null, 25, true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Season', 'subscription', 'season_pass_unlock', 'season-test', null, true)
on conflict (id) do nothing;

-- Local role table access for SET ROLE tests (not a production model).
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to service_role, authenticated;
