-- Isolated Twitch grant authorization + crash-retry + concurrency suite.
-- Requires: starlight.allow_twitch_grant_tests=on
-- Never install on production.

create schema if not exists starlight_test;

create or replace function starlight_test.set_jwt(sub uuid, role_name text)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(sub::text, ''), true);
  perform set_config('request.jwt.claim.role', coalesce(role_name, 'anon'), true);
end;
$$;

create or replace function starlight_test.assert(cond boolean, msg text)
returns void
language plpgsql
as $$
begin
  if not coalesce(cond, false) then
    raise exception 'ASSERT FAILED: %', msg;
  end if;
end;
$$;

grant usage on schema starlight_test to authenticated, service_role;
grant execute on all functions in schema starlight_test to authenticated, service_role;

create or replace function starlight_test.simulate_worker_retry(p_event_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  prior uuid;
  applied jsonb;
begin
  select id into prior from public.twitch_reward_grants where event_id = p_event_id limit 1;
  if prior is not null then
    update public.twitch_reward_events
      set status = 'delivered', error_message = null, processed_at = now()
    where event_id = p_event_id;
    return jsonb_build_object('path', 'prior_grant', 'grantId', prior);
  end if;

  applied := public.apply_twitch_reward_v890(
    '33333333-3333-3333-3333-333333333333'::uuid,
    'star_bits',
    25,
    null, null, null,
    p_event_id,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    'twitch_target',
    'channel_points',
    null
  );
  update public.twitch_reward_events
    set status = 'delivered', processed_at = now(), error_message = null
  where event_id = p_event_id;
  return jsonb_build_object('path', 'apply', 'result', applied);
end;
$$;

create or replace function public.admin_manual_twitch_reward_v890(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  target record;
  result jsonb;
  rule_id uuid;
begin
  if not public.is_content_admin() then
    raise exception 'Administrator access is required.';
  end if;
  select * into target
  from public.twitch_connections
  where lower(twitch_login) = lower(trim(payload->>'twitchLogin'));
  if not found then
    raise exception 'No linked collector was found for that Twitch username.';
  end if;

  select id into rule_id
  from public.twitch_reward_rules
  where reward_type = coalesce(payload->>'rewardType', '')
  order by updated_at desc
  limit 1;

  result := public.apply_twitch_reward_v890(
    target.user_id,
    payload->>'rewardType',
    nullif(payload->>'starBitsAmount', '')::bigint,
    nullif(payload->>'cardId', ''),
    nullif(payload->>'cardQuantity', '')::integer,
    nullif(payload->>'boosterId', ''),
    null,
    rule_id,
    target.twitch_user_id,
    'manual',
    auth.uid()
  );
  return result || jsonb_build_object('collectorUserId', target.user_id, 'twitchLogin', target.twitch_login);
end;
$$;

revoke all on function public.admin_manual_twitch_reward_v890(jsonb) from public, anon;
grant execute on function public.admin_manual_twitch_reward_v890(jsonb) to authenticated, service_role;

create or replace function starlight_test.run_twitch_grant_auth_suite()
returns text
language plpgsql
as $$
declare
  ordinary uuid := '11111111-1111-1111-1111-111111111111';
  staff uuid := '22222222-2222-2222-2222-222222222222';
  target uuid := '33333333-3333-3333-3333-333333333333';
  evt_self text := 'evt-auth-self-grant';
  evt_concurrent text := 'evt-concurrent-same';
  evt_crash text := 'evt-crash-retry';
  evt_linked text := 'evt-season-linked';
  evt_unlinked text := 'evt-season-unlinked';
  ok boolean;
  err text;
  grants_before int;
  gifts_before int;
  grants_after int;
  gifts_after int;
  r jsonb;
  evt_status text;
begin
  if current_setting('starlight.allow_twitch_grant_tests', true) is distinct from 'on' then
    raise exception 'Refusing suite: set starlight.allow_twitch_grant_tests=on in isolated DB only.';
  end if;

  -- Baseline: with current (pre-harden) grants, authenticated CAN execute apply.
  perform starlight_test.assert(
    has_function_privilege('authenticated', 'public.apply_twitch_reward_v890(uuid,text,bigint,text,integer,text,text,uuid,text,text,uuid)', 'EXECUTE'),
    'precondition: authenticated currently has EXECUTE on apply (vulnerability under test)'
  );
  perform starlight_test.assert(
    has_function_privilege('authenticated', 'public.deliver_twitch_season_unlock_v1(text,text,text,uuid,text)', 'EXECUTE'),
    'precondition: authenticated currently has EXECUTE on deliver'
  );
  perform starlight_test.assert(
    not has_function_privilege('anon', 'public.apply_twitch_reward_v890(uuid,text,bigint,text,integer,text,text,uuid,text,text,uuid)', 'EXECUTE'),
    'anon must not execute apply'
  );

  -- Ordinary authenticated can grant to self/others BEFORE harden (document vulnerability).
  insert into public.twitch_reward_events(event_id, event_type, status)
  values (evt_self, 'channel_points', 'received')
  on conflict (event_id) do nothing;

  perform starlight_test.set_jwt(ordinary, 'authenticated');
  set local role authenticated;
  begin
    r := public.apply_twitch_reward_v890(
      ordinary, 'star_bits', 25, null, null, null, evt_self,
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'twitch_ordinary', 'channel_points', null
    );
    ok := true;
  exception when others then
    ok := false;
    err := sqlerrm;
  end;
  reset role;
  perform starlight_test.set_jwt(null, 'anon');
  perform starlight_test.assert(ok, 'VULN DEMO: ordinary authenticated must currently succeed calling apply (got: ' || coalesce(err, '') || ')');
  perform starlight_test.assert(
    (select count(*) from public.twitch_reward_grants where event_id = evt_self) = 1,
    'ordinary call created one grant'
  );

  -- Apply permission harden (same as production migration under test).
  revoke all on function public.apply_twitch_reward_v890(uuid, text, bigint, text, integer, text, text, uuid, text, text, uuid) from public, anon, authenticated;
  grant execute on function public.apply_twitch_reward_v890(uuid, text, bigint, text, integer, text, text, uuid, text, text, uuid) to service_role;
  revoke all on function public.deliver_twitch_season_unlock_v1(text, text, text, uuid, text) from public, anon, authenticated;
  grant execute on function public.deliver_twitch_season_unlock_v1(text, text, text, uuid, text) to service_role;

  perform starlight_test.assert(
    not has_function_privilege('authenticated', 'public.apply_twitch_reward_v890(uuid,text,bigint,text,integer,text,text,uuid,text,text,uuid)', 'EXECUTE'),
    'after harden: authenticated cannot EXECUTE apply'
  );
  perform starlight_test.assert(
    not has_function_privilege('anon', 'public.apply_twitch_reward_v890(uuid,text,bigint,text,integer,text,text,uuid,text,text,uuid)', 'EXECUTE'),
    'after harden: anon cannot EXECUTE apply'
  );
  perform starlight_test.assert(
    has_function_privilege('service_role', 'public.apply_twitch_reward_v890(uuid,text,bigint,text,integer,text,text,uuid,text,text,uuid)', 'EXECUTE'),
    'after harden: service_role can EXECUTE apply'
  );
  perform starlight_test.assert(
    not has_function_privilege('authenticated', 'public.deliver_twitch_season_unlock_v1(text,text,text,uuid,text)', 'EXECUTE'),
    'after harden: authenticated cannot EXECUTE deliver'
  );
  perform starlight_test.assert(
    has_function_privilege('service_role', 'public.deliver_twitch_season_unlock_v1(text,text,text,uuid,text)', 'EXECUTE'),
    'after harden: service_role can EXECUTE deliver'
  );

  -- Ordinary authenticated denied after harden
  perform starlight_test.set_jwt(ordinary, 'authenticated');
  set local role authenticated;
  begin
    perform public.apply_twitch_reward_v890(
      target, 'star_bits', 25, null, null, null, 'evt-should-deny',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'twitch_target', 'channel_points', null
    );
    ok := true;
  exception when insufficient_privilege then
    ok := false;
  when others then
    -- PostgreSQL may raise permission denied for schema/function
    ok := false;
    err := sqlerrm;
  end;
  reset role;
  perform starlight_test.set_jwt(null, 'anon');
  perform starlight_test.assert(not ok, 'ordinary authenticated must be denied apply after harden');

  -- Staff admin wrapper still works (SECURITY DEFINER calls apply as owner)
  perform starlight_test.set_jwt(staff, 'authenticated');
  set local role authenticated;
  begin
    r := public.admin_manual_twitch_reward_v890(jsonb_build_object(
      'twitchLogin', 'target_viewer',
      'rewardType', 'star_bits',
      'starBitsAmount', '10'
    ));
    ok := (r->>'success') = 'true';
  exception when others then
    ok := false;
    err := sqlerrm;
  end;
  reset role;
  perform starlight_test.set_jwt(null, 'anon');
  perform starlight_test.assert(ok, 'staff admin_manual must still succeed after harden: ' || coalesce(err, ''));

  -- Non-staff admin wrapper denied
  perform starlight_test.set_jwt(ordinary, 'authenticated');
  set local role authenticated;
  begin
    perform public.admin_manual_twitch_reward_v890(jsonb_build_object(
      'twitchLogin', 'target_viewer',
      'rewardType', 'star_bits',
      'starBitsAmount', '10'
    ));
    ok := true;
  exception when others then
    ok := false;
  end;
  reset role;
  perform starlight_test.set_jwt(null, 'anon');
  perform starlight_test.assert(not ok, 'ordinary user must not use admin_manual');

  -- Service role Worker path (table seed as owner; RPC as service_role)
  insert into public.twitch_reward_events(event_id, event_type, status)
  values ('evt-service-ok', 'channel_points', 'received')
  on conflict do nothing;
  set local role service_role;
  r := public.apply_twitch_reward_v890(
    target, 'star_bits', 25, null, null, null, 'evt-service-ok',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'twitch_target', 'channel_points', null
  );
  reset role;
  perform starlight_test.assert((r->>'success') = 'true', 'service_role apply succeeds');

  -- Simultaneous same-event: two service_role applies → one grant, one gift
  insert into public.twitch_reward_events(event_id, event_type, status)
  values (evt_concurrent, 'channel_points', 'received') on conflict do nothing;
  select count(*) into grants_before from public.twitch_reward_grants where event_id = evt_concurrent;
  select count(*) into gifts_before from public.received_rewards where source_id = evt_concurrent;
  set local role service_role;
  perform public.apply_twitch_reward_v890(
    target, 'star_bits', 25, null, null, null, evt_concurrent,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'twitch_target', 'channel_points', null
  );
  r := public.apply_twitch_reward_v890(
    target, 'star_bits', 25, null, null, null, evt_concurrent,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'twitch_target', 'channel_points', null
  );
  reset role;
  perform starlight_test.assert((r->>'idempotentReplay') = 'true', 'second same-event apply is idempotentReplay');
  select count(*) into grants_after from public.twitch_reward_grants where event_id = evt_concurrent;
  select count(*) into gifts_after from public.received_rewards where source_id = evt_concurrent;
  perform starlight_test.assert(grants_after = grants_before + 1, 'exactly one grant for concurrent same event');
  perform starlight_test.assert(gifts_after = gifts_before + 1, 'exactly one gift for concurrent same event');

  -- Crash: grant committed, event status left failed, then retry
  insert into public.twitch_reward_events(event_id, event_type, status)
  values (evt_crash, 'channel_points', 'received') on conflict do nothing;
  set local role service_role;
  perform public.apply_twitch_reward_v890(
    target, 'star_bits', 25, null, null, null, evt_crash,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'twitch_target', 'channel_points', null
  );
  -- Simulate crash before status update
  update public.twitch_reward_events
    set status = 'failed', error_message = 'simulated crash after grant'
  where event_id = evt_crash;
  reset role;

  select count(*) into grants_before from public.twitch_reward_grants where event_id = evt_crash;
  select count(*) into gifts_before from public.received_rewards where source_id = evt_crash;
  set local role service_role;
  r := starlight_test.simulate_worker_retry(evt_crash);
  reset role;
  select count(*) into grants_after from public.twitch_reward_grants where event_id = evt_crash;
  select count(*) into gifts_after from public.received_rewards where source_id = evt_crash;
  select e.status into evt_status from public.twitch_reward_events e where e.event_id = evt_crash;
  perform starlight_test.assert((r->>'path') = 'prior_grant', 'retry uses prior grant path');
  perform starlight_test.assert(grants_after = grants_before, 'retry does not duplicate grant');
  perform starlight_test.assert(gifts_after = gifts_before, 'retry does not duplicate gift');
  perform starlight_test.assert(evt_status = 'delivered', 'retry marks delivered');

  -- Linked season unlock + duplicate
  insert into public.twitch_reward_events(event_id, event_type, status)
  values (evt_linked, 'subscription', 'received') on conflict do nothing;
  set local role service_role;
  r := public.deliver_twitch_season_unlock_v1(
    'twitch_target', 'target_viewer', evt_linked,
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'season-test'
  );
  perform starlight_test.assert((r->>'linked') = 'true', 'linked season unlock');
  r := public.deliver_twitch_season_unlock_v1(
    'twitch_target', 'target_viewer', evt_linked,
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'season-test'
  );
  reset role;
  perform starlight_test.assert((r->>'idempotentReplay') = 'true', 'duplicate linked season is replay');
  perform starlight_test.assert(
    (select count(*) from public.twitch_reward_grants where event_id = evt_linked) = 1,
    'one season grant'
  );
  perform starlight_test.assert(
    (select count(*) from public.user_season_access where user_id = target and season_id = 'season-test') = 1,
    'one season access row'
  );

  -- Unlinked season unlock → pending, no grant; duplicate pending ok
  insert into public.twitch_reward_events(event_id, event_type, status)
  values (evt_unlinked, 'subscription', 'received') on conflict do nothing;
  set local role service_role;
  r := public.deliver_twitch_season_unlock_v1(
    'twitch_unknown', 'unknown_viewer', evt_unlinked,
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'season-test'
  );
  perform starlight_test.assert((r->>'linked') = 'false' and (r->>'pending') = 'true', 'unlinked pending');
  r := public.deliver_twitch_season_unlock_v1(
    'twitch_unknown', 'unknown_viewer', evt_unlinked,
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'season-test'
  );
  reset role;
  perform starlight_test.assert(
    (select count(*) from public.twitch_pending_unlocks where event_id = evt_unlinked) = 1,
    'one pending unlock'
  );
  perform starlight_test.assert(
    (select count(*) from public.twitch_reward_grants where event_id = evt_unlinked) = 0,
    'unlinked creates no grant'
  );

  return 'starlight_test.run_twitch_grant_auth_suite: PASS';
end;
$$;
