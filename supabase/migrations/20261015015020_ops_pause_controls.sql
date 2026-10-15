-- Operational pause controls for shop purchases, duplicate conversions, and trades.
-- Defaults keep features enabled. Pausing does not delete inventory or change payout rules.

insert into public.site_settings (setting_key, setting_value, updated_at)
values
  ('ops_feature_shop_purchases', 'true'::jsonb, now()),
  ('ops_feature_conversions', 'true'::jsonb, now()),
  ('ops_feature_trades', 'true'::jsonb, now())
on conflict (setting_key) do nothing;

create or replace function public.ops_feature_enabled(p_key text)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  raw jsonb;
begin
  select s.setting_value
  into raw
  from public.site_settings s
  where s.setting_key = p_key
  limit 1;

  if raw is null then
    return true;
  end if;

  if jsonb_typeof(raw) = 'boolean' then
    return (raw #>> '{}')::boolean;
  end if;

  if jsonb_typeof(raw) = 'object' then
    return coalesce((raw->>'enabled')::boolean, true);
  end if;

  if jsonb_typeof(raw) = 'string' then
    return lower(raw #>> '{}') not in ('false', '0', 'off', 'paused', 'disabled');
  end if;

  return true;
end;
$function$;

revoke all on function public.ops_feature_enabled(text) from public, anon;
grant execute on function public.ops_feature_enabled(text) to authenticated, service_role;

create or replace function public.ops_assert_feature(p_key text, p_message text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not public.ops_feature_enabled(p_key) then
    raise exception '%',
      coalesce(nullif(trim(p_message), ''), 'This feature is temporarily paused.');
  end if;
end;
$function$;

revoke all on function public.ops_assert_feature(text, text) from public, anon;
grant execute on function public.ops_assert_feature(text, text) to authenticated, service_role;

create or replace function public.admin_get_ops_pauses()
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

  return jsonb_build_object(
    'shopPurchasesPaused', not public.ops_feature_enabled('ops_feature_shop_purchases'),
    'conversionsPaused', not public.ops_feature_enabled('ops_feature_conversions'),
    'tradesPaused', not public.ops_feature_enabled('ops_feature_trades'),
    'features', jsonb_build_object(
      'ops_feature_shop_purchases', public.ops_feature_enabled('ops_feature_shop_purchases'),
      'ops_feature_conversions', public.ops_feature_enabled('ops_feature_conversions'),
      'ops_feature_trades', public.ops_feature_enabled('ops_feature_trades')
    )
  );
end;
$function$;

revoke all on function public.admin_get_ops_pauses() from public, anon;
grant execute on function public.admin_get_ops_pauses() to authenticated;

create or replace function public.admin_set_ops_pause(
  requested_feature text,
  requested_paused boolean
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  actor_id uuid := auth.uid();
  actor_role text;
  feature_key text;
  enabled boolean;
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

  feature_key := case lower(trim(coalesce(requested_feature, '')))
    when 'shop' then 'ops_feature_shop_purchases'
    when 'shop_purchases' then 'ops_feature_shop_purchases'
    when 'ops_feature_shop_purchases' then 'ops_feature_shop_purchases'
    when 'conversions' then 'ops_feature_conversions'
    when 'ops_feature_conversions' then 'ops_feature_conversions'
    when 'trades' then 'ops_feature_trades'
    when 'ops_feature_trades' then 'ops_feature_trades'
    else null
  end;

  if feature_key is null then
    raise exception 'Unknown ops feature. Use shop, conversions, or trades.';
  end if;

  enabled := not coalesce(requested_paused, false);

  insert into public.site_settings (setting_key, setting_value, updated_at, updated_by)
  values (feature_key, to_jsonb(enabled), now(), actor_id)
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
    'ops_pause_set',
    'site_settings',
    feature_key,
    jsonb_build_object(
      'feature', feature_key,
      'paused', not enabled,
      'enabled', enabled
    )
  );

  return public.admin_get_ops_pauses();
end;
$function$;

revoke all on function public.admin_set_ops_pause(text, boolean) from public, anon;
grant execute on function public.admin_set_ops_pause(text, boolean) to authenticated;

-- Patch collector RPCs with pause guards (idempotent).
do $patch$
declare
  def text;
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'open_star_bits_booster_by_id';

  if def is null then
    raise exception 'open_star_bits_booster_by_id missing';
  end if;

  if position('ops_assert_feature' in def) = 0 then
    def := regexp_replace(
      def,
      '(if uid is null then raise exception ''You must be signed in\.''; end if;)',
      E'\\1\r\n  perform public.ops_assert_feature(''ops_feature_shop_purchases'', ''Star Bits shop purchases are temporarily paused.'');',
      'i'
    );
    if position('ops_assert_feature' in def) = 0 then
      raise exception 'Failed to patch open_star_bits_booster_by_id';
    end if;
    execute def;
  end if;

  select pg_get_functiondef(p.oid) into def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'convert_all_duplicates_to_star_bits';

  if def is null then
    raise exception 'convert_all_duplicates_to_star_bits missing';
  end if;

  if position('ops_assert_feature' in def) = 0 then
    def := regexp_replace(
      def,
      '(if current_user_id is null then\s+raise exception\s+''You must be signed in to convert duplicate cards\.'';\s+end if;)',
      E'\\1\r\n\r\n    perform public.ops_assert_feature(''ops_feature_conversions'', ''Duplicate conversion is temporarily paused.'');',
      'i'
    );
    if position('ops_assert_feature' in def) = 0 then
      raise exception 'Failed to patch convert_all_duplicates_to_star_bits';
    end if;
    execute def;
  end if;

  select pg_get_functiondef(p.oid) into def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'convert_selected_duplicates_to_star_bits'
    and pg_get_function_identity_arguments(p.oid) = 'requested_selections jsonb';

  if def is null then
    raise exception 'convert_selected_duplicates_to_star_bits missing';
  end if;

  if position('ops_assert_feature' in def) = 0 then
    def := regexp_replace(
      def,
      '(if current_user_id is null then\s+raise exception ''You must be signed in to convert duplicate cards\.'';\s+end if;)',
      E'\\1\r\n\r\n    perform public.ops_assert_feature(''ops_feature_conversions'', ''Duplicate conversion is temporarily paused.'');',
      'i'
    );
    if position('ops_assert_feature' in def) = 0 then
      raise exception 'Failed to patch convert_selected_duplicates_to_star_bits';
    end if;
    execute def;
  end if;

  select pg_get_functiondef(p.oid) into def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'create_trade_offer'
    and pg_get_function_identity_arguments(p.oid) = 'requested_username text, offered_items jsonb, requested_items jsonb, requested_note text';

  if def is null then
    -- Fall back to any create_trade_offer overload.
    select pg_get_functiondef(p.oid) into def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_trade_offer'
    order by p.oid
    limit 1;
  end if;

  if def is null then
    raise exception 'create_trade_offer missing';
  end if;

  if position('ops_assert_feature' in def) = 0 then
    def := regexp_replace(
      def,
      '(if uid is null then\s+raise exception ''You must be signed in\.'';\s+end if;)',
      E'\\1\r\n\r\n  perform public.ops_assert_feature(''ops_feature_trades'', ''Trading is temporarily paused.'');',
      'i'
    );
    if position('ops_assert_feature' in def) = 0 then
      raise exception 'Failed to patch create_trade_offer';
    end if;
    execute def;
  end if;
end;
$patch$;
