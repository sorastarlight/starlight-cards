-- Disposable local fixture for ops integrity / canary / pause / role-gate tests.
-- Never install on production.

create extension if not exists pgcrypto;

create schema if not exists auth;
create schema if not exists starlight_test;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  created_at timestamptz default now()
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

create table if not exists public.site_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null
);

create table if not exists public.site_settings (
  setting_key text primary key,
  setting_value jsonb not null,
  updated_at timestamptz default now(),
  updated_by uuid
);

create table if not exists public.staff_audit_log (
  id bigserial primary key,
  actor_user_id uuid,
  action text not null,
  target_user_id uuid,
  target_resource_type text,
  target_resource_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ops_release_cohort (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid
);

insert into public.site_settings(setting_key, setting_value) values
  ('ops_feature_shop_purchases', 'true'::jsonb),
  ('ops_feature_conversions', 'true'::jsonb),
  ('ops_feature_trades', 'true'::jsonb),
  ('ops_release_stage', jsonb_build_object('stage','stable','workerMin','1.1.5')),
  ('ops_canary_features', jsonb_build_object(
    'gallery_density_preview', jsonb_build_object(
      'enabled', true,
      'label', 'Gallery density preview',
      'payload', jsonb_build_object('density','compact')
    )
  ))
on conflict (setting_key) do nothing;

create or replace function public.ops_feature_enabled(p_key text)
returns boolean
language plpgsql stable security definer set search_path to ''
as $function$
declare raw jsonb;
begin
  select s.setting_value into raw from public.site_settings s where s.setting_key = p_key limit 1;
  if raw is null then return true; end if;
  if jsonb_typeof(raw) = 'boolean' then return (raw #>> '{}')::boolean; end if;
  return true;
end;
$function$;

create or replace function public.ops_assert_feature(p_key text, p_message text)
returns void
language plpgsql security definer set search_path to ''
as $function$
begin
  if not public.ops_feature_enabled(p_key) then
    raise exception '%', coalesce(nullif(trim(p_message), ''), 'This feature is temporarily paused.');
  end if;
end;
$function$;

-- Minimal shop open stub used only to prove pause guard behavior.
create or replace function public.open_star_bits_booster_by_id(requested_booster_id text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'You must be signed in.'; end if;
  perform public.ops_assert_feature('ops_feature_shop_purchases', 'Star Bits shop purchases are temporarily paused.');
  return jsonb_build_object('ok', true, 'boosterId', requested_booster_id, 'uid', uid);
end;
$function$;

create or replace function public.ops_canary_feature_allowed(p_feature text)
returns boolean
language plpgsql stable security definer set search_path to ''
as $function$
declare
  uid uuid := auth.uid();
  stage text;
  feature_enabled boolean;
  is_staff_admin boolean;
  in_cohort boolean;
begin
  if uid is null then return false; end if;
  select lower(coalesce(s.setting_value->>'stage', 'stable')) into stage
  from public.site_settings s where s.setting_key='ops_release_stage' limit 1;
  if coalesce(stage,'stable') <> 'canary' then return false; end if;
  select coalesce((s.setting_value -> p_feature ->> 'enabled')::boolean, false) into feature_enabled
  from public.site_settings s where s.setting_key='ops_canary_features' limit 1;
  if not coalesce(feature_enabled,false) then return false; end if;
  select exists(select 1 from public.site_roles r where r.user_id=uid and coalesce(r.role,'') in ('owner','admin')) into is_staff_admin;
  select exists(select 1 from public.ops_release_cohort c where c.user_id=uid) into in_cohort;
  return coalesce(is_staff_admin,false) or coalesce(in_cohort,false);
end;
$function$;

create or replace function public.get_canary_feature(requested_feature text)
returns jsonb
language plpgsql security definer set search_path to ''
as $function$
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
  return jsonb_build_object('allowed', true, 'feature', feature_key, 'payload', coalesce(raw->'payload','{}'::jsonb));
end;
$function$;

-- Admin NULL-role gate pattern under test.
create or replace function public.admin_get_ops_pauses()
returns jsonb
language plpgsql security definer set search_path to ''
as $function$
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
$function$;

-- Seed identities
insert into auth.users(id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'collector@example.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'admin@example.test'),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'cohort@example.test')
on conflict (id) do nothing;

insert into public.site_roles(user_id, role) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'admin')
on conflict (user_id) do update set role = excluded.role;

insert into public.ops_release_cohort(user_id, note) values
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'isolated cohort')
on conflict (user_id) do nothing;
