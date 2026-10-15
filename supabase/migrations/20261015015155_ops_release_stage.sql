-- Staged release channel metadata. Does not change reward rules or collector economy.
-- Collectors always receive stable product behavior; canary is staff-visible signaling only.

insert into public.site_settings (setting_key, setting_value, updated_at)
values (
  'ops_release_stage',
  jsonb_build_object(
    'stage', 'stable',
    'workerMin', '1.1.5',
    'notes', '',
    'updatedAt', now()
  ),
  now()
)
on conflict (setting_key) do nothing;

create or replace function public.admin_get_ops_release_stage()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  actor_id uuid := auth.uid();
  actor_role text;
  raw jsonb;
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

  select s.setting_value into raw
  from public.site_settings s
  where s.setting_key = 'ops_release_stage'
  limit 1;

  return jsonb_build_object(
    'stage', coalesce(raw->>'stage', 'stable'),
    'workerMin', coalesce(raw->>'workerMin', '1.1.5'),
    'notes', coalesce(raw->>'notes', ''),
    'updatedAt', raw->>'updatedAt'
  );
end;
$function$;

revoke all on function public.admin_get_ops_release_stage() from public, anon;
grant execute on function public.admin_get_ops_release_stage() to authenticated;

create or replace function public.admin_set_ops_release_stage(
  requested_stage text,
  requested_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  actor_id uuid := auth.uid();
  actor_role text;
  stage text;
  notes text;
  payload jsonb;
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

  stage := lower(trim(coalesce(requested_stage, 'stable')));
  if stage not in ('stable', 'canary') then
    raise exception 'Release stage must be stable or canary.';
  end if;

  notes := left(coalesce(requested_notes, ''), 500);
  payload := jsonb_build_object(
    'stage', stage,
    'workerMin', '1.1.5',
    'notes', notes,
    'updatedAt', now()
  );

  insert into public.site_settings (setting_key, setting_value, updated_at, updated_by)
  values ('ops_release_stage', payload, now(), actor_id)
  on conflict (setting_key) do update
  set
    setting_value = excluded.setting_value,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;

  insert into public.staff_audit_log (
    actor_user_id,
    action,
    target_resource_type,
    target_resource_id,
    details
  ) values (
    actor_id,
    'ops_release_stage_set',
    'site_settings',
    'ops_release_stage',
    jsonb_build_object('stage', stage, 'notes', notes)
  );

  return public.admin_get_ops_release_stage();
end;
$function$;

revoke all on function public.admin_set_ops_release_stage(text, text) from public, anon;
grant execute on function public.admin_set_ops_release_stage(text, text) to authenticated;

-- Public read for staff banner only; collectors ignore canary.
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

revoke all on function public.get_ops_release_stage_public() from public;
grant execute on function public.get_ops_release_stage_public() to anon, authenticated;
