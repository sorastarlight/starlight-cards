-- Minimal Starlight schema fixture for isolated opening-recovery tests.
-- Local disposable DB only — not for production.

create extension if not exists pgcrypto;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  instance_id uuid,
  aud text,
  role text,
  email text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  created_at timestamptz,
  updated_at timestamptz
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create table if not exists public.site_settings (
  setting_key text primary key,
  setting_value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists public.card_series (
  id text primary key,
  name text not null
);

create table if not exists public.cards (
  id text primary key,
  card_number text,
  name text not null,
  rarity text not null default 'Common',
  image_url text,
  thumbnail_url text,
  series_id text references public.card_series(id),
  artist text,
  description text
);

create table if not exists public.user_cards (
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id text not null references public.cards(id),
  quantity int not null default 1,
  is_favorite boolean not null default false,
  first_obtained_at timestamptz,
  last_obtained_at timestamptz,
  updated_at timestamptz,
  primary key (user_id, card_id)
);

create table if not exists public.daily_booster_claims (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  claim_date date not null,
  claimed_at timestamptz not null default now(),
  cards_awarded jsonb not null default '[]'::jsonb
);

create unique index if not exists daily_booster_claims_user_id_claim_date_key
  on public.daily_booster_claims (user_id, claim_date);

create table if not exists public.collector_activity (
  id bigint generated always as identity primary key,
  actor_id uuid,
  activity_type text,
  summary text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.get_free_daily_booster_mode()
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select setting_value #>> '{}' from public.site_settings where setting_key = 'free_daily_booster_mode'),
    'daily'
  );
$$;

create or replace function public.draw_configured_booster_cards(requested_booster_id text)
returns text[]
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  ids text[];
begin
  select array_agg(id order by id)
  into ids
  from (
    select id from public.cards order by random() limit 4
  ) s;
  if ids is null or array_length(ids, 1) is null then
    raise exception 'No cards available for draw.';
  end if;
  return ids;
end;
$$;

create or replace function public.compute_pull_streak_days(requested_user_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  streak integer := 0;
  cursor_date date;
  expected date;
begin
  select max(claim_date) into cursor_date
  from public.daily_booster_claims
  where user_id = requested_user_id;

  if cursor_date is null then
    return 0;
  end if;

  expected := timezone('America/New_York', now())::date;
  if cursor_date < expected - 1 then
    return 0;
  end if;

  while exists (
    select 1 from public.daily_booster_claims
    where user_id = requested_user_id and claim_date = cursor_date
  ) loop
    streak := streak + 1;
    cursor_date := cursor_date - 1;
  end loop;

  return streak;
end;
$$;

create or replace function public.record_collector_activity(
  requested_actor_id uuid,
  requested_type text,
  requested_summary text,
  requested_payload jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  new_id bigint;
begin
  insert into public.collector_activity (actor_id, activity_type, summary, payload)
  values (requested_actor_id, requested_type, requested_summary, coalesce(requested_payload, '{}'::jsonb))
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.record_pull_activity_from_cards(
  requested_actor_id uuid,
  requested_source text,
  requested_cards jsonb,
  requested_metadata jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if requested_cards is null or jsonb_typeof(requested_cards) <> 'array' or jsonb_array_length(requested_cards) = 0 then
    return null;
  end if;
  return public.record_collector_activity(
    requested_actor_id,
    'pull',
    'opened ' || coalesce(requested_source, 'pack'),
    coalesce(requested_metadata, '{}'::jsonb) || jsonb_build_object('source', requested_source, 'cards', requested_cards)
  );
end;
$$;

create or replace function public.trg_record_pull_activity_from_daily()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.cards_awarded is null or new.cards_awarded = '[]'::jsonb then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.cards_awarded is not distinct from new.cards_awarded then
    return new;
  end if;
  perform public.record_pull_activity_from_cards(
    new.user_id,
    'daily',
    new.cards_awarded,
    jsonb_build_object('claimDate', new.claim_date, 'claimId', new.id)
  );
  return new;
end;
$$;

drop trigger if exists trg_daily_booster_claims_activity on public.daily_booster_claims;
create trigger trg_daily_booster_claims_activity
  after insert or update of cards_awarded on public.daily_booster_claims
  for each row
  when (new.cards_awarded is not null and new.cards_awarded <> '[]'::jsonb)
  execute function public.trg_record_pull_activity_from_daily();

-- Seed cards
insert into public.card_series (id, name) values ('s01', 'Rising Star')
on conflict (id) do nothing;

insert into public.cards (id, card_number, name, rarity, image_url, thumbnail_url, series_id)
values
  ('s01-001', '001', 'Star One', 'Common', 'a.png', 'a.png', 's01'),
  ('s01-002', '002', 'Star Two', 'Uncommon', 'b.png', 'b.png', 's01'),
  ('s01-003', '003', 'Star Three', 'Rare', 'c.png', 'c.png', 's01'),
  ('s01-004', '004', 'Star Four', 'Epic', 'd.png', 'd.png', 's01'),
  ('s01-005', '005', 'Star Five', 'Legendary', 'e.png', 'e.png', 's01'),
  ('s01-006', '006', 'Star Six', 'Common', 'f.png', 'f.png', 's01')
on conflict (id) do nothing;

insert into public.site_settings (setting_key, setting_value)
values ('free_daily_booster_mode', '"unlimited"'::jsonb)
on conflict (setting_key) do update set setting_value = excluded.setting_value;
