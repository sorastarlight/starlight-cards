-- Isolated positive/negative checks. Run after ops-integrity-local-fixture.sql.
-- Expects starlight_test schema.

create schema if not exists starlight_test;

create or replace function starlight_test.expect(cond boolean, label text)
returns void language plpgsql as $$
begin
  if not cond then
    raise exception 'ASSERT FAIL: %', label;
  end if;
end;
$$;

do $suite$
declare
  got jsonb;
  denied boolean;
begin
  -- Collector cannot call admin pause RPC (NULL role fails closed via coalesce).
  perform set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
  begin
    perform public.admin_get_ops_pauses();
    denied := false;
  exception when others then
    denied := true;
  end;
  perform starlight_test.expect(denied, 'collector denied admin_get_ops_pauses');

  -- Admin authorized success.
  perform set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', true);
  got := public.admin_get_ops_pauses();
  perform starlight_test.expect(got ? 'shopPurchasesPaused', 'admin_get_ops_pauses returns payload');

  -- Pause guard: isolated toggle (not production).
  update public.site_settings set setting_value='false'::jsonb where setting_key='ops_feature_shop_purchases';
  begin
    perform public.open_star_bits_booster_by_id('demo');
    denied := false;
  exception when others then
    denied := position('paused' in lower(sqlerrm)) > 0;
  end;
  perform starlight_test.expect(denied, 'shop pause blocks open_star_bits_booster_by_id');
  update public.site_settings set setting_value='true'::jsonb where setting_key='ops_feature_shop_purchases';
  got := public.open_star_bits_booster_by_id('demo');
  perform starlight_test.expect((got->>'ok')::boolean, 'shop resume allows open stub');

  -- Canary: stable stage denies cohort member.
  update public.site_settings
  set setting_value = jsonb_build_object('stage','stable','workerMin','1.1.5')
  where setting_key='ops_release_stage';
  perform set_config('request.jwt.claim.sub', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', true);
  got := public.get_canary_feature('gallery_density_preview');
  perform starlight_test.expect(got->>'allowed' = 'false', 'stable stage denies canary feature');

  -- Canary: canary stage + cohort allows.
  update public.site_settings
  set setting_value = jsonb_build_object('stage','canary','workerMin','1.1.5')
  where setting_key='ops_release_stage';
  got := public.get_canary_feature('gallery_density_preview');
  perform starlight_test.expect(got->>'allowed' = 'true', 'canary+cohort allows feature');

  -- Canary: canary stage + non-cohort collector denied.
  perform set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
  got := public.get_canary_feature('gallery_density_preview');
  perform starlight_test.expect(got->>'allowed' = 'false', 'non-cohort denied under canary');

  -- Canary: feature disable blocks even cohort.
  update public.site_settings
  set setting_value = jsonb_set(setting_value, '{gallery_density_preview,enabled}', 'false'::jsonb, true)
  where setting_key='ops_canary_features';
  perform set_config('request.jwt.claim.sub', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', true);
  got := public.get_canary_feature('gallery_density_preview');
  perform starlight_test.expect(got->>'allowed' = 'false', 'disabled feature denies cohort');

  -- Restore canary feature enabled + stable stage for clean fixture end-state.
  update public.site_settings
  set setting_value = jsonb_set(setting_value, '{gallery_density_preview,enabled}', 'true'::jsonb, true)
  where setting_key='ops_canary_features';
  update public.site_settings
  set setting_value = jsonb_build_object('stage','stable','workerMin','1.1.5')
  where setting_key='ops_release_stage';

  raise notice 'ops-integrity-suite PASS';
end;
$suite$;
