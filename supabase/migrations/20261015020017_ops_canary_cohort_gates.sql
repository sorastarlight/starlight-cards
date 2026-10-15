-- Server-authoritative canary feature exposure.
-- Unreleased canary features require: release stage = canary, feature enabled,
-- and membership in ops_release_cohort (staff owners/admins may also pass).
-- Disabling: set stage to stable OR feature.enabled=false. Does not change rewards.

create table if not exists public.ops_release_cohort (
  user_id uuid primary key references auth.users (id) on delete cascade,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

alter table public.ops_release_cohort enable row level security;

revoke all on table public.ops_release_cohort from public, anon, authenticated;
grant select, insert, update, delete on table public.ops_release_cohort to service_role;

insert into public.site_settings (setting_key, setting_value, updated_at)
values (
  'ops_canary_features',
  jsonb_build_object(
    'gallery_density_preview', jsonb_build_object(
      'enabled', true,
      'label', 'Gallery density preview',
      'payload', jsonb_build_object(
        'density', 'compact',
        'showSetProgressRail', true
      )
    )
  ),
  now()
)
on conflict (setting_key) do nothing;

create or replace function public.ops_canary_feature_allowed(p_feature text)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  uid uuid := auth.uid();
  stage text;
  feature_enabled boolean;
  is_staff_admin boolean;
  in_cohort boolean;
begin
  if uid is null then
    return false;
  end if;

  select lower(coalesce(s.setting_value->>'stage', 'stable'))
  into stage
  from public.site_settings s
  where s.setting_key = 'ops_release_stage'
  limit 1;

  if coalesce(stage, 'stable') <> 'canary' then
    return false;
  end if;

  select coalesce((s.setting_value -> p_feature ->> 'enabled')::boolean, false)
  into feature_enabled
  from public.site_settings s
  where s.setting_key = 'ops_canary_features'
  limit 1;

  if not coalesce(feature_enabled, false) then
    return false;
  end if;

  select exists (
    select 1
    from public.site_roles r
    where r.user_id = uid
      and coalesce(r.role, '') in ('owner', 'admin')
  )
  into is_staff_admin;

  select exists (
    select 1
    from public.ops_release_cohort c
    where c.user_id = uid
  )
  into in_cohort;

  return coalesce(is_staff_admin, false) or coalesce(in_cohort, false);
end;
$function$;

revoke all on function public.ops_canary_feature_allowed(text) from public, anon;
grant execute on function public.ops_canary_feature_allowed(text) to authenticated, service_role;

create or replace function public.get_canary_feature(requested_feature text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  feature_key text := lower(trim(coalesce(requested_feature, '')));
  raw jsonb;
  allowed boolean;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if feature_key = '' then
    raise exception 'Feature key is required.';
  end if;

  allowed := public.ops_canary_feature_allowed(feature_key);
  if not allowed then
    return jsonb_build_object(
      'allowed', false,
      'feature', feature_key,
      'reason', 'canary_denied'
    );
  end if;

  select s.setting_value -> feature_key
  into raw
  from public.site_settings s
  where s.setting_key = 'ops_canary_features'
  limit 1;

  return jsonb_build_object(
    'allowed', true,
    'feature', feature_key,
    'label', coalesce(raw->>'label', feature_key),
    'payload', coalesce(raw->'payload', '{}'::jsonb)
  );
end;
$function$;

revoke all on function public.get_canary_feature(text) from public, anon;
grant execute on function public.get_canary_feature(text) to authenticated;

create or replace function public.admin_list_ops_release_cohort()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  actor_id uuid := auth.uid();
  actor_role text;
begin
  if actor_id is null then
    raise exception 'You must be signed in.';
  end if;

  select role into actor_role
  from public.site_roles
  where user_id = actor_id
  limit 1;

  if coalesce(actor_role, '') not in ('owner', 'admin') then
    raise exception 'Administrator access is required.';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'userId', c.user_id,
          'note', c.note,
          'createdAt', c.created_at,
          'email', u.email
        )
        order by c.created_at desc
      )
      from public.ops_release_cohort c
      left join auth.users u on u.id = c.user_id
    ),
    '[]'::jsonb
  );
end;
$function$;

revoke all on function public.admin_list_ops_release_cohort() from public, anon;
grant execute on function public.admin_list_ops_release_cohort() to authenticated;

create or replace function public.admin_set_ops_release_cohort_member(
  requested_user_id uuid,
  requested_include boolean,
  requested_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  actor_id uuid := auth.uid();
  actor_role text;
begin
  if actor_id is null then
    raise exception 'You must be signed in.';
  end if;

  select role into actor_role
  from public.site_roles
  where user_id = actor_id
  limit 1;

  if coalesce(actor_role, '') not in ('owner', 'admin') then
    raise exception 'Administrator access is required.';
  end if;

  if requested_user_id is null then
    raise exception 'User id is required.';
  end if;

  if coalesce(requested_include, false) then
    insert into public.ops_release_cohort (user_id, note, created_by)
    values (requested_user_id, left(coalesce(requested_note, ''), 200), actor_id)
    on conflict (user_id) do update
    set note = excluded.note;
  else
    delete from public.ops_release_cohort where user_id = requested_user_id;
  end if;

  insert into public.staff_audit_log (
    actor_user_id,
    action,
    target_user_id,
    target_resource_type,
    target_resource_id,
    details
  ) values (
    actor_id,
    'ops_release_cohort_set',
    requested_user_id,
    'ops_release_cohort',
    requested_user_id::text,
    jsonb_build_object(
      'include', coalesce(requested_include, false),
      'note', left(coalesce(requested_note, ''), 200)
    )
  );

  return public.admin_list_ops_release_cohort();
end;
$function$;

revoke all on function public.admin_set_ops_release_cohort_member(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_ops_release_cohort_member(uuid, boolean, text) to authenticated;

-- Refresh public stage reader so clients can see stage without staff banner alone.
create or replace function public.get_ops_release_stage_public()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  raw jsonb;
begin
  select s.setting_value into raw
  from public.site_settings s
  where s.setting_key = 'ops_release_stage'
  limit 1;

  return jsonb_build_object(
    'stage', coalesce(raw->>'stage', 'stable'),
    'workerMin', coalesce(raw->>'workerMin', '1.1.5')
  );
end;
$function$;
