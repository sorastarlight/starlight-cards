-- Post-restore verification for disposable roundtrip target DB.

do $verify$
declare
  fn_count int;
  pol_count int;
  trg_count int;
  ck_count int;
  fk_count int;
  card_qty int;
  canary jsonb;
  admin_ok boolean := false;
  collector_denied boolean := false;
begin
  select count(*) into fn_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'ops_feature_enabled',
      'ops_canary_feature_allowed',
      'get_canary_feature',
      'admin_get_ops_pauses',
      'touch_user_cards_updated_at'
    );
  if fn_count < 5 then
    raise exception 'function restore incomplete: %', fn_count;
  end if;

  select count(*) into pol_count
  from pg_policies
  where schemaname = 'public'
    and tablename in ('ops_release_cohort', 'user_cards', 'site_settings');
  if pol_count < 4 then
    raise exception 'RLS policy restore incomplete: %', pol_count;
  end if;

  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'user_cards' and not t.tgisinternal
  ) then
    raise exception 'user_cards trigger missing after restore';
  end if;

  select count(*) into ck_count
  from pg_constraint
  where contype = 'c'
    and conrelid in (
      'public.cards'::regclass,
      'public.user_cards'::regclass,
      'public.site_roles'::regclass
    );
  if ck_count < 3 then
    raise exception 'check constraints incomplete: %', ck_count;
  end if;

  select count(*) into fk_count
  from pg_constraint
  where contype = 'f'
    and conrelid in (
      'public.cards'::regclass,
      'public.user_cards'::regclass,
      'public.ops_release_cohort'::regclass
    );
  if fk_count < 3 then
    raise exception 'foreign keys incomplete: %', fk_count;
  end if;

  if not has_function_privilege('authenticated', 'public.get_canary_feature(text)', 'EXECUTE') then
    raise exception 'authenticated missing EXECUTE on get_canary_feature';
  end if;
  if has_function_privilege('anon', 'public.get_canary_feature(text)', 'EXECUTE') then
    raise exception 'anon unexpectedly has EXECUTE on get_canary_feature';
  end if;
  if not has_table_privilege('service_role', 'public.ops_release_cohort', 'SELECT') then
    raise exception 'service_role missing SELECT on ops_release_cohort';
  end if;

  select quantity into card_qty
  from public.user_cards
  where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' and card_id = 'c-rt-01';
  if card_qty is distinct from 2 then
    raise exception 'representative user_cards data missing/qty=%', card_qty;
  end if;

  -- Behavioral gates after restore.
  perform set_config('request.jwt.claim.sub', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', true);
  update public.site_settings
  set setting_value = jsonb_build_object('stage','canary','workerMin','1.1.5')
  where setting_key = 'ops_release_stage';
  canary := public.get_canary_feature('gallery_density_preview');
  if canary->>'allowed' is distinct from 'true' then
    raise exception 'cohort allow failed after restore';
  end if;

  update public.site_settings
  set setting_value = jsonb_set(setting_value, '{gallery_density_preview,enabled}', 'false'::jsonb, true)
  where setting_key = 'ops_canary_features';
  canary := public.get_canary_feature('gallery_density_preview');
  if canary->>'allowed' is distinct from 'false' then
    raise exception 'feature disable failed after restore';
  end if;
  update public.site_settings
  set setting_value = jsonb_set(setting_value, '{gallery_density_preview,enabled}', 'true'::jsonb, true)
  where setting_key = 'ops_canary_features';

  update public.site_settings
  set setting_value = jsonb_build_object('stage','stable','workerMin','1.1.5')
  where setting_key = 'ops_release_stage';
  canary := public.get_canary_feature('gallery_density_preview');
  if canary->>'allowed' is distinct from 'false' then
    raise exception 'stable deny failed after restore';
  end if;

  perform set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', true);
  begin
    perform public.admin_get_ops_pauses();
    admin_ok := true;
  exception when others then
    admin_ok := false;
  end;
  if not admin_ok then
    raise exception 'admin_get_ops_pauses failed after restore';
  end if;

  perform set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
  begin
    perform public.admin_get_ops_pauses();
    collector_denied := false;
  exception when others then
    collector_denied := true;
  end;
  if not collector_denied then
    raise exception 'collector was not denied admin_get_ops_pauses after restore';
  end if;

  raise notice 'pg-roundtrip-verify PASS functions=% policies=% checks=% fks=%',
    fn_count, pol_count, ck_count, fk_count;
end;
$verify$;
