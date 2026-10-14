-- =============================================================================
-- Isolated-environment database tests: daily booster opening recovery
-- DO NOT run against production. DO NOT install starlight_test.* on production.
--
-- Prerequisites (disposable Supabase branch / local `supabase db` only):
--   - Migration 20261014080000 applied
--   - free_daily booster config + card pools
--   - Ability to insert auth.users OR pre-seed two users
--
-- Load then run:
--   \i tests/sql/daily-booster-opening-recovery.sql
--   select starlight_test.run_opening_recovery_suite();
--   select starlight_test.cleanup_opening_recovery_suite();
--
-- Two-session concurrency (required before production apply):
--   Session A: select starlight_test.concurrency_same_request_session_a();
--   Session B (overlap): select starlight_test.concurrency_same_request_session_b();
--   Then: select starlight_test.assert_concurrency_same_request_outcome();
-- =============================================================================

do $$
begin
  if current_setting('transaction_read_only', true) = 'on' then
    raise exception 'Refusing to run opening-recovery tests on a read-only session.';
  end if;
  -- Soft prod guard: refuse if this looks like a non-test project setting.
  if current_setting('starlight.allow_opening_recovery_tests', true) is distinct from 'on' then
    raise notice 'Set starlight.allow_opening_recovery_tests=on in the isolated DB session before running the suite.';
  end if;
end $$;

create schema if not exists starlight_test;

create or replace function starlight_test.assert_true(cond boolean, message text)
returns void
language plpgsql
as $$
begin
  if not coalesce(cond, false) then
    raise exception 'ASSERT FAILED: %', message;
  end if;
end;
$$;

create or replace function starlight_test.set_auth_user(uid uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end;
$$;

create or replace function starlight_test.ensure_test_user(email text)
returns uuid
language plpgsql
security definer
set search_path to 'auth', 'public'
as $$
declare
  uid uuid;
begin
  select id into uid from auth.users where auth.users.email = ensure_test_user.email limit 1;
  if uid is not null then
    return uid;
  end if;

  uid := gen_random_uuid();
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  values (
    uid,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    email,
    crypt('test-only-not-for-prod', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );
  return uid;
exception
  when undefined_table then
    raise exception 'auth.users unavailable — run against a full Supabase/Postgres stack.';
  when others then
    raise exception
      'Unable to create test user % (%). Pre-seed users or fix auth schema.',
      email, sqlerrm;
end;
$$;

create or replace function starlight_test.set_free_daily_mode(mode text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.site_settings (setting_key, setting_value, updated_at, updated_by)
  values ('free_daily_booster_mode', to_jsonb(mode), now(), null)
  on conflict (setting_key) do update
    set setting_value = excluded.setting_value,
        updated_at = now();
end;
$$;

create or replace function starlight_test.total_qty(uid uuid)
returns bigint
language sql
stable
as $$
  select coalesce(sum(quantity), 0)::bigint from public.user_cards where user_id = uid;
$$;

create or replace function starlight_test.cleanup_opening_recovery_suite()
returns text
language plpgsql
security definer
set search_path to 'public', 'starlight_test', 'auth'
as $$
declare
  user_a uuid;
  user_b uuid;
begin
  select id into user_a from auth.users where email = 'opening-recovery-a@example.invalid';
  select id into user_b from auth.users where email = 'opening-recovery-b@example.invalid';

  if user_a is not null then
    delete from public.daily_booster_claims where user_id = user_a;
    -- Keep user_cards: inventory retention is a product rule; suite may leave cards unless
    -- callers explicitly wipe. Documented: cleanup removes claims + activity metadata only.
    delete from public.collector_activity
    where actor_id = user_a
      and payload->>'source' = 'daily'
      and (payload->>'claimId') is not null;
  end if;
  if user_b is not null then
    delete from public.daily_booster_claims where user_id = user_b;
    delete from public.collector_activity
    where actor_id = user_b
      and payload->>'source' = 'daily'
      and (payload->>'claimId') is not null;
  end if;

  drop table if exists starlight_test.concurrency_probe;
  return 'starlight_test.cleanup_opening_recovery_suite: OK';
end;
$$;

create or replace function starlight_test.run_opening_recovery_suite()
returns text
language plpgsql
security definer
set search_path to 'public', 'starlight_test', 'auth'
as $$
declare
  user_a uuid;
  user_b uuid;
  req1 uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid;
  req2 uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid;
  req3 uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid;
  req4 uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid;
  req5 uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid;
  req_fail uuid := 'ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid;
  req_old uuid := '99999999-9999-4999-8999-999999999999'::uuid;
  first jsonb;
  second jsonb;
  third jsonb;
  fourth jsonb;
  lookup jsonb;
  qty_before bigint;
  qty_mid bigint;
  claim_count int;
  streak_before int;
  streak_after int;
  activity_before int;
  activity_after int;
  today date := timezone('America/New_York', now())::date;
  original_draw text;
  zero_arg_ok boolean;
  uuid_arg_ok boolean;
begin
  if current_setting('starlight.allow_opening_recovery_tests', true) is distinct from 'on' then
    raise exception
      'Refusing suite: set local starlight.allow_opening_recovery_tests = on in an isolated DB only.';
  end if;

  -- Overload + permission gates
  select exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'open_daily_booster'
      and pg_get_function_identity_arguments(p.oid) = ''
  ) into zero_arg_ok;
  select exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'open_daily_booster'
      and pg_get_function_identity_arguments(p.oid) in ('uuid', 'requested_request_id uuid')
  ) into uuid_arg_ok;
  perform starlight_test.assert_true(zero_arg_ok, 'open_daily_booster() must exist for deployed clients');
  perform starlight_test.assert_true(uuid_arg_ok, 'open_daily_booster(uuid) must exist');
  perform starlight_test.assert_true(
    not has_function_privilege('anon', 'public.open_daily_booster()', 'EXECUTE'),
    'anon must not EXECUTE open_daily_booster()'
  );
  perform starlight_test.assert_true(
    not has_function_privilege('anon', 'public.open_daily_booster(uuid)', 'EXECUTE'),
    'anon must not EXECUTE open_daily_booster(uuid)'
  );
  perform starlight_test.assert_true(
    has_function_privilege('authenticated', 'public.open_daily_booster()', 'EXECUTE'),
    'authenticated must EXECUTE open_daily_booster()'
  );
  perform starlight_test.assert_true(
    has_function_privilege('authenticated', 'public.open_daily_booster(uuid)', 'EXECUTE'),
    'authenticated must EXECUTE open_daily_booster(uuid)'
  );

  user_a := starlight_test.ensure_test_user('opening-recovery-a@example.invalid');
  user_b := starlight_test.ensure_test_user('opening-recovery-b@example.invalid');
  delete from public.daily_booster_claims where user_id in (user_a, user_b) and claim_date = today;

  -- -----------------------------------------------------------------------
  -- 1) Repeated same request_id: one grant
  -- -----------------------------------------------------------------------
  perform starlight_test.set_free_daily_mode('unlimited');
  perform starlight_test.set_auth_user(user_a);
  qty_before := starlight_test.total_qty(user_a);
  streak_before := public.compute_pull_streak_days(user_a);
  select count(*) into activity_before
  from public.collector_activity where actor_id = user_a and payload->>'source' = 'daily';

  first := public.open_daily_booster(req1);
  perform starlight_test.assert_true(coalesce((first->>'success')::boolean, false), 'first open succeeds');
  perform starlight_test.assert_true(
    coalesce((first->>'idempotentReplay')::boolean, true) is false,
    'first open is not replay'
  );
  qty_mid := starlight_test.total_qty(user_a);
  perform starlight_test.assert_true(qty_mid > qty_before, 'first open grants inventory');

  second := public.open_daily_booster(req1);
  perform starlight_test.assert_true(coalesce((second->>'idempotentReplay')::boolean, false), 'repeat is idempotentReplay');
  perform starlight_test.assert_true(second->'cards' = first->'cards', 'repeat returns same cards');
  perform starlight_test.assert_true(second->>'claimId' = first->>'claimId', 'repeat same claimId');
  perform starlight_test.assert_true(starlight_test.total_qty(user_a) = qty_mid, 'repeat does not grant again');
  select count(*) into claim_count from public.daily_booster_claims where user_id = user_a and request_id = req1;
  perform starlight_test.assert_true(claim_count = 1, 'one claim row per request_id');

  -- Zero-arg compatibility still works and creates a distinct server request id.
  third := public.open_daily_booster();
  perform starlight_test.assert_true(coalesce((third->>'success')::boolean, false), 'zero-arg open succeeds');
  perform starlight_test.assert_true(third->>'requestId' is not null, 'zero-arg assigns a request id');

  -- -----------------------------------------------------------------------
  -- 2) Two same-day unlimited openings (different UUIDs)
  -- -----------------------------------------------------------------------
  qty_mid := starlight_test.total_qty(user_a);
  fourth := public.open_daily_booster(req2);
  perform starlight_test.assert_true(coalesce((fourth->>'success')::boolean, false), 'second unlimited succeeds');
  perform starlight_test.assert_true(fourth->>'claimId' is distinct from first->>'claimId', 'distinct claim ids');
  perform starlight_test.assert_true(starlight_test.total_qty(user_a) > qty_mid, 'second unlimited grants');

  -- Streak uses EXISTS(claim_date) — multiple same-day rows must not inflate day count.
  streak_after := public.compute_pull_streak_days(user_a);
  perform starlight_test.assert_true(
    streak_after <= streak_before + 1,
    'unlimited multi-open must not inflate streak by more than one calendar day'
  );

  select count(*) into activity_after
  from public.collector_activity where actor_id = user_a and payload->>'source' = 'daily';
  -- Activity feed may add one item per opening (expected feed posts, not streak days).
  -- XP comes only from user_cards quantity triggers on real grants; missions use collection state.
  perform starlight_test.assert_true(
    activity_after >= activity_before + 1,
    'each committed opening may record feed activity'
  );

  -- -----------------------------------------------------------------------
  -- 3) Daily limit with different UUIDs
  -- -----------------------------------------------------------------------
  delete from public.daily_booster_claims where user_id = user_a and claim_date = today;
  perform starlight_test.set_free_daily_mode('daily');
  qty_before := starlight_test.total_qty(user_a);
  first := public.open_daily_booster(req3);
  perform starlight_test.assert_true(coalesce((first->>'success')::boolean, false), 'daily open succeeds');
  qty_mid := starlight_test.total_qty(user_a);
  second := public.open_daily_booster(req4);
  perform starlight_test.assert_true(coalesce((second->>'alreadyClaimed')::boolean, false), 'second daily UUID alreadyClaimed');
  perform starlight_test.assert_true(starlight_test.total_qty(user_a) = qty_mid, 'daily alreadyClaimed no grant');

  -- -----------------------------------------------------------------------
  -- 4) Unlimited rows must not block a later daily claim (mode change)
  -- -----------------------------------------------------------------------
  delete from public.daily_booster_claims where user_id = user_a and claim_date = today;
  perform starlight_test.set_free_daily_mode('unlimited');
  first := public.open_daily_booster(req5);
  perform starlight_test.assert_true((first->>'mode') = 'unlimited', 'recorded as unlimited');
  perform starlight_test.set_free_daily_mode('daily');
  lookup := public.get_daily_booster_status();
  perform starlight_test.assert_true(
    coalesce((lookup->>'available')::boolean, false),
    'daily status available despite same-day unlimited row'
  );
  second := public.open_daily_booster(gen_random_uuid());
  perform starlight_test.assert_true(coalesce((second->>'success')::boolean, false), 'daily claim after unlimited succeeds');
  perform starlight_test.assert_true((second->>'mode') = 'daily', 'new row is daily');

  -- -----------------------------------------------------------------------
  -- 5) Request replay returns original opening after mode change / “midnight”
  -- -----------------------------------------------------------------------
  perform starlight_test.set_free_daily_mode('unlimited');
  -- Simulate a prior-day claim with known request id.
  insert into public.daily_booster_claims (user_id, claim_date, cards_awarded, mode, request_id, claimed_at)
  values (
    user_a,
    today - 2,
    coalesce(first->'cards', '[{"id":"s01-001","name":"fixture"}]'::jsonb),
    'unlimited',
    req_old,
    now() - interval '2 days'
  );
  third := public.open_daily_booster(req_old);
  perform starlight_test.assert_true(coalesce((third->>'idempotentReplay')::boolean, false), 'cross-day replay');
  perform starlight_test.assert_true((third->>'claimDate') = (today - 2)::text, 'replay keeps original claimDate');
  perform starlight_test.assert_true((third->>'mode') = 'unlimited', 'replay keeps original mode');

  -- -----------------------------------------------------------------------
  -- 6) Owner isolation
  -- -----------------------------------------------------------------------
  perform starlight_test.set_auth_user(user_b);
  lookup := public.get_my_daily_booster_opening(req3, null);
  perform starlight_test.assert_true(
    coalesce((lookup->>'found')::boolean, true) is false,
    'user B cannot read user A request'
  );

  -- -----------------------------------------------------------------------
  -- 7) Transaction failure: no claim row, no inventory delta
  -- -----------------------------------------------------------------------
  perform starlight_test.set_auth_user(user_a);
  perform starlight_test.set_free_daily_mode('unlimited');
  select pg_get_functiondef('public.draw_configured_booster_cards(text)'::regprocedure)
    into original_draw;
  execute $fail$
    create or replace function public.draw_configured_booster_cards(requested_booster_id text)
    returns text[] language plpgsql as $fn$
    begin
      raise exception 'starlight_test forced draw failure';
    end;
    $fn$;
  $fail$;
  qty_before := starlight_test.total_qty(user_a);
  begin
    perform public.open_daily_booster(req_fail);
    perform starlight_test.assert_true(false, 'forced draw failure should raise');
  exception
    when others then
      perform starlight_test.assert_true(sqlerrm ilike '%forced draw failure%', 'expected forced failure');
  end;
  select count(*) into claim_count
  from public.daily_booster_claims where user_id = user_a and request_id = req_fail;
  perform starlight_test.assert_true(claim_count = 0, 'failed open leaves no claim row');
  perform starlight_test.assert_true(starlight_test.total_qty(user_a) = qty_before, 'failed open no inventory');
  execute original_draw;

  return 'starlight_test.run_opening_recovery_suite: PASS';
exception
  when others then
    begin
      if original_draw is not null then
        execute original_draw;
      end if;
    exception when others then
      null;
    end;
    raise;
end;
$$;

-- ---------------------------------------------------------------------------
-- Two-session concurrency helpers (manual overlap on isolated DB)
-- ---------------------------------------------------------------------------
create table if not exists starlight_test.concurrency_probe (
  label text primary key,
  result jsonb,
  qty_before bigint,
  qty_after bigint,
  noted_at timestamptz default now()
);

create or replace function starlight_test.concurrency_same_request_session_a()
returns text
language plpgsql
security definer
set search_path to 'public', 'starlight_test'
as $$
declare
  uid uuid;
  req uuid := '12121212-1212-4121-8121-121212121212'::uuid;
  qty bigint;
  result jsonb;
  lock_key text;
begin
  if current_setting('starlight.allow_opening_recovery_tests', true) is distinct from 'on' then
    raise exception 'concurrency probe refused without starlight.allow_opening_recovery_tests=on';
  end if;
  uid := starlight_test.ensure_test_user('opening-recovery-a@example.invalid');
  delete from public.daily_booster_claims where user_id = uid and request_id = req;
  perform starlight_test.set_free_daily_mode('unlimited');
  perform starlight_test.set_auth_user(uid);
  qty := starlight_test.total_qty(uid);
  -- Hold the same advisory key open_daily_booster(uuid) uses so session B blocks
  -- inside open until this transaction commits (reentrant for this session).
  lock_key := uid::text || '|req|' || req::text;
  perform pg_advisory_xact_lock(hashtextextended(lock_key, 0));
  perform pg_sleep(3);
  result := public.open_daily_booster(req);
  insert into starlight_test.concurrency_probe(label, result, qty_before, qty_after)
  values ('session_a', result, qty, starlight_test.total_qty(uid))
  on conflict (label) do update
    set result = excluded.result, qty_before = excluded.qty_before, qty_after = excluded.qty_after, noted_at = now();
  return 'session_a recorded — start session_b during the 3s hold';
end;
$$;

create or replace function starlight_test.concurrency_same_request_session_b()
returns text
language plpgsql
security definer
set search_path to 'public', 'starlight_test'
as $$
declare
  uid uuid;
  req uuid := '12121212-1212-4121-8121-121212121212'::uuid;
  qty bigint;
  result jsonb;
begin
  if current_setting('starlight.allow_opening_recovery_tests', true) is distinct from 'on' then
    raise exception 'concurrency probe refused without starlight.allow_opening_recovery_tests=on';
  end if;
  uid := starlight_test.ensure_test_user('opening-recovery-a@example.invalid');
  perform starlight_test.set_free_daily_mode('unlimited');
  perform starlight_test.set_auth_user(uid);
  qty := starlight_test.total_qty(uid);
  result := public.open_daily_booster(req);
  insert into starlight_test.concurrency_probe(label, result, qty_before, qty_after)
  values ('session_b', result, qty, starlight_test.total_qty(uid))
  on conflict (label) do update
    set result = excluded.result, qty_before = excluded.qty_before, qty_after = excluded.qty_after, noted_at = now();
  return 'session_b recorded';
end;
$$;

create or replace function starlight_test.assert_concurrency_same_request_outcome()
returns text
language plpgsql
security definer
set search_path to 'public', 'starlight_test'
as $$
declare
  a starlight_test.concurrency_probe%rowtype;
  b starlight_test.concurrency_probe%rowtype;
  uid uuid;
  req uuid := '12121212-1212-4121-8121-121212121212'::uuid;
  claim_count int;
  grant_delta bigint;
begin
  select * into a from starlight_test.concurrency_probe where label = 'session_a';
  select * into b from starlight_test.concurrency_probe where label = 'session_b';
  perform starlight_test.assert_true(a.label is not null and b.label is not null, 'both sessions must record');
  perform starlight_test.assert_true(a.result->>'claimId' = b.result->>'claimId', 'same claimId');
  perform starlight_test.assert_true(a.result->'cards' = b.result->'cards', 'same cards payload');
  perform starlight_test.assert_true(
    jsonb_array_length(coalesce(a.result->'cards', '[]'::jsonb)) > 0,
    'committed opening must include cards (not mid-draw empty)'
  );
  -- Exactly one of the two should be a fresh grant; the other idempotentReplay —
  -- or both replay if a prior run left the row. Inventory delta across both <= one grant.
  uid := starlight_test.ensure_test_user('opening-recovery-a@example.invalid');
  select count(*) into claim_count from public.daily_booster_claims where user_id = uid and request_id = req;
  perform starlight_test.assert_true(claim_count = 1, 'exactly one claim row after concurrent same request');
  -- Winner grants once; loser must be idempotentReplay. Re-runs may both replay.
  perform starlight_test.assert_true(
    (a.result->>'idempotentReplay' = 'true')
      or (b.result->>'idempotentReplay' = 'true')
      or (a.result->>'idempotentReplay' is distinct from b.result->>'idempotentReplay'),
    'at least one session must observe idempotentReplay (or both on re-run)'
  );
  -- Net inventory from the earlier qty_before baseline increases by at most one pack.
  grant_delta := greatest(greatest(a.qty_after, b.qty_after) - least(a.qty_before, b.qty_before), 0);
  perform starlight_test.assert_true(
    grant_delta = jsonb_array_length(coalesce(a.result->'cards', '[]'::jsonb))
      or (a.result->>'idempotentReplay' = 'true' and b.result->>'idempotentReplay' = 'true'),
    format('inventory granted once under concurrency (delta=%s)', grant_delta)
  );
  return 'starlight_test.assert_concurrency_same_request_outcome: PASS';
end;
$$;

do $$
begin
  raise notice 'Opening-recovery DB suite loaded (starlight_test schema).';
  raise notice 'Isolated only: set local starlight.allow_opening_recovery_tests = ''on'';';
  raise notice 'Then: select starlight_test.run_opening_recovery_suite();';
  raise notice 'Two-session: concurrency_same_request_session_a/b + assert_concurrency_same_request_outcome();';
  raise notice 'Cleanup: select starlight_test.cleanup_opening_recovery_suite();';
  raise notice 'DO NOT install or run on production.';
end $$;
