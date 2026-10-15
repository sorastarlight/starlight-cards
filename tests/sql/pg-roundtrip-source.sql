-- Disposable source database for genuine pg_dump / pg_restore verification.
-- Never install on production.

create extension if not exists pgcrypto;

create schema if not exists auth;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;

create table public.site_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null,
  constraint site_roles_role_check check (role in ('owner', 'admin', 'super_moderator', 'moderator'))
);

create table public.site_settings (
  setting_key text primary key,
  setting_value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table public.ops_release_cohort (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table public.card_series (
  id text primary key,
  name text not null,
  sort_order integer not null default 0,
  is_visible boolean not null default true
);

create table public.cards (
  id text primary key,
  series_id text not null references public.card_series(id),
  name text not null,
  rarity text not null,
  card_number text not null,
  is_visible boolean not null default true,
  sort_order integer not null default 0,
  constraint cards_rarity_check check (rarity in ('Common','Uncommon','Rare','Epic','Legendary')),
  constraint cards_series_number_unique unique (series_id, card_number)
);

create table public.user_cards (
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id text not null references public.cards(id),
  quantity integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, card_id),
  constraint user_cards_quantity_positive check (quantity > 0)
);

create table public.staff_audit_log (
  id bigserial primary key,
  actor_user_id uuid references auth.users(id),
  action text not null,
  target_user_id uuid,
  target_resource_type text,
  target_resource_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.touch_user_cards_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger user_cards_touch_updated_at
before update on public.user_cards
for each row execute function public.touch_user_cards_updated_at();

create or replace function public.ops_feature_enabled(p_key text)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $$
declare raw jsonb;
begin
  select s.setting_value into raw from public.site_settings s where s.setting_key = p_key limit 1;
  if raw is null then return true; end if;
  if jsonb_typeof(raw) = 'boolean' then return (raw #>> '{}')::boolean; end if;
  return true;
end;
$$;

create or replace function public.ops_canary_feature_allowed(p_feature text)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  uid uuid := auth.uid();
  stage text;
  feature_enabled boolean;
  is_staff_admin boolean;
  in_cohort boolean;
begin
  if uid is null then return false; end if;
  select lower(coalesce(s.setting_value->>'stage','stable')) into stage
  from public.site_settings s where s.setting_key='ops_release_stage' limit 1;
  if coalesce(stage,'stable') <> 'canary' then return false; end if;
  select coalesce((s.setting_value -> p_feature ->> 'enabled')::boolean, false) into feature_enabled
  from public.site_settings s where s.setting_key='ops_canary_features' limit 1;
  if not coalesce(feature_enabled,false) then return false; end if;
  select exists(select 1 from public.site_roles r where r.user_id=uid and coalesce(r.role,'') in ('owner','admin'))
  into is_staff_admin;
  select exists(select 1 from public.ops_release_cohort c where c.user_id=uid) into in_cohort;
  return coalesce(is_staff_admin,false) or coalesce(in_cohort,false);
end;
$$;

create or replace function public.get_canary_feature(requested_feature text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  feature_key text := lower(trim(coalesce(requested_feature,'')));
  raw jsonb;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  if not public.ops_canary_feature_allowed(feature_key) then
    return jsonb_build_object('allowed', false, 'feature', feature_key, 'reason', 'canary_denied');
  end if;
  select s.setting_value -> feature_key into raw
  from public.site_settings s where s.setting_key='ops_canary_features' limit 1;
  return jsonb_build_object(
    'allowed', true,
    'feature', feature_key,
    'payload', coalesce(raw->'payload', '{}'::jsonb)
  );
end;
$$;

create or replace function public.admin_get_ops_pauses()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text;
begin
  if actor_id is null then raise exception 'You must be signed in.'; end if;
  select role into actor_role from public.site_roles where user_id = actor_id limit 1;
  if coalesce(actor_role, '') not in ('owner', 'admin') then
    raise exception 'Administrator access is required.';
  end if;
  return jsonb_build_object(
    'shopPurchasesPaused', not public.ops_feature_enabled('ops_feature_shop_purchases')
  );
end;
$$;

alter table public.ops_release_cohort enable row level security;
alter table public.user_cards enable row level security;
alter table public.site_settings enable row level security;

create policy ops_release_cohort_service_all
  on public.ops_release_cohort
  for all
  to service_role
  using (true)
  with check (true);

create policy user_cards_owner_select
  on public.user_cards
  for select
  to authenticated
  using (user_id = auth.uid());

create policy user_cards_owner_write
  on public.user_cards
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy site_settings_authenticated_read
  on public.site_settings
  for select
  to authenticated
  using (true);

revoke all on table public.ops_release_cohort from public, anon, authenticated;
grant select, insert, update, delete on table public.ops_release_cohort to service_role;

revoke all on table public.user_cards from public, anon;
grant select, insert, update, delete on table public.user_cards to authenticated, service_role;

revoke all on table public.site_settings from public, anon;
grant select on table public.site_settings to authenticated;
grant select, insert, update, delete on table public.site_settings to service_role;

revoke all on function public.get_canary_feature(text) from public, anon;
grant execute on function public.get_canary_feature(text) to authenticated;

revoke all on function public.admin_get_ops_pauses() from public, anon;
grant execute on function public.admin_get_ops_pauses() to authenticated;

revoke all on function public.ops_canary_feature_allowed(text) from public, anon;
grant execute on function public.ops_canary_feature_allowed(text) to authenticated, service_role;

revoke all on function public.ops_feature_enabled(text) from public, anon;
grant execute on function public.ops_feature_enabled(text) to authenticated, service_role;

insert into auth.users(id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'collector@roundtrip.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'admin@roundtrip.test'),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'cohort@roundtrip.test');

insert into public.site_roles(user_id, role) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'admin');

insert into public.ops_release_cohort(user_id, note, created_by) values
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'roundtrip cohort', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1');

insert into public.site_settings(setting_key, setting_value) values
  ('ops_feature_shop_purchases', 'true'::jsonb),
  ('ops_release_stage', jsonb_build_object('stage','stable','workerMin','1.1.5')),
  ('ops_canary_features', jsonb_build_object(
    'gallery_density_preview', jsonb_build_object(
      'enabled', true,
      'payload', jsonb_build_object('density','compact')
    )
  ));

insert into public.card_series(id, name, sort_order) values
  ('s-rt-01', 'Roundtrip Series', 1);

insert into public.cards(id, series_id, name, rarity, card_number, sort_order) values
  ('c-rt-01', 's-rt-01', 'Roundtrip Card', 'Common', '001', 1);

insert into public.user_cards(user_id, card_id, quantity) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'c-rt-01', 2);

insert into public.staff_audit_log(actor_user_id, action, target_resource_type, details)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'roundtrip_seed', 'fixture', '{"ok":true}'::jsonb);
