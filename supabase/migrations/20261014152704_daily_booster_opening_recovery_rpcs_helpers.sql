-- Reconciled with production apply order (do not edit applied prod history).
-- Source content from 20261014080000 monolith, split to match:
--   20261014152518 schema, 20261014152704 helpers/status, 20261014152749 open RPCs

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.daily_booster_opening_payload(claim public.daily_booster_claims)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'claimId', claim.id,
    'requestId', claim.request_id,
    'mode', claim.mode,
    'claimDate', claim.claim_date,
    'claimedAt', claim.claimed_at,
    'cardsAwarded', coalesce(claim.cards_awarded, '[]'::jsonb),
    'cards', coalesce(claim.cards_awarded, '[]'::jsonb)
  );
$$;

revoke all on function public.daily_booster_opening_payload(public.daily_booster_claims) from public, anon, authenticated;
grant execute on function public.daily_booster_opening_payload(public.daily_booster_claims) to service_role;

create or replace function public.daily_booster_next_claim_at(claim_date date)
returns timestamptz
language sql
immutable
as $$
  select ((claim_date + 1)::timestamp at time zone 'America/New_York');
$$;

revoke all on function public.daily_booster_next_claim_at(date) from public, anon, authenticated;
grant execute on function public.daily_booster_next_claim_at(date) to authenticated, service_role;

create or replace function public.daily_booster_replay_payload(
  existing public.daily_booster_claims,
  free_mode text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  next_at timestamptz;
begin
  -- Replay always returns the stored opening (original claim_date/mode/cards),
  -- even after midnight or a free_daily mode change.
  if existing.mode = 'daily' then
    next_at := public.daily_booster_next_claim_at(existing.claim_date);
  else
    next_at := null;
  end if;

  return jsonb_build_object(
    'success', true,
    'alreadyClaimed', false,
    'idempotentReplay', true,
    'mode', existing.mode,
    'claimId', existing.id,
    'requestId', existing.request_id,
    'claimDate', existing.claim_date,
    'claimedAt', existing.claimed_at,
    'nextClaimAt', next_at,
    'cards', coalesce(existing.cards_awarded, '[]'::jsonb),
    'cardsAwarded', coalesce(existing.cards_awarded, '[]'::jsonb),
    'currentFreeMode', free_mode
  );
end;
$$;

revoke all on function public.daily_booster_replay_payload(public.daily_booster_claims, text) from public, anon, authenticated;
grant execute on function public.daily_booster_replay_payload(public.daily_booster_claims, text) to service_role;

-- ---------------------------------------------------------------------------
-- get_my_daily_booster_opening â€” owner-only read of one opening (never grants)
-- ---------------------------------------------------------------------------
create or replace function public.get_my_daily_booster_opening(
  requested_request_id uuid default null,
  requested_claim_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  claim public.daily_booster_claims%rowtype;
begin
  if uid is null then
    raise exception 'You must be signed in to view a Free Daily opening.';
  end if;

  if requested_request_id is not null then
    select * into claim
    from public.daily_booster_claims
    where user_id = uid
      and request_id = requested_request_id
    limit 1;
  elsif requested_claim_id is not null then
    select * into claim
    from public.daily_booster_claims
    where user_id = uid
      and id = requested_claim_id
    limit 1;
  else
    select * into claim
    from public.daily_booster_claims
    where user_id = uid
    order by claimed_at desc, id desc
    limit 1;
  end if;

  if not found then
    return jsonb_build_object(
      'found', false,
      'cardsAwarded', '[]'::jsonb,
      'cards', '[]'::jsonb
    );
  end if;

  if claim.user_id is distinct from uid then
    raise exception 'Opening not found.';
  end if;

  return public.daily_booster_opening_payload(claim) || jsonb_build_object('found', true);
end;
$$;

revoke all on function public.get_my_daily_booster_opening(uuid, bigint) from public, anon;
grant execute on function public.get_my_daily_booster_opening(uuid, bigint) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- get_daily_booster_status â€” unlimited exposes latest opening for View latest
-- ---------------------------------------------------------------------------
create or replace function public.get_daily_booster_status()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  free_mode text;
  today date;
  next_at timestamptz;
  claim public.daily_booster_claims%rowtype;
  latest public.daily_booster_claims%rowtype;
  recovery_supported boolean := true;
begin
  if uid is null then
    raise exception 'You must be signed in to check your daily booster.';
  end if;

  free_mode := public.get_free_daily_booster_mode();
  today := timezone('America/New_York', now())::date;
  next_at := public.daily_booster_next_claim_at(today);

  if free_mode = 'disabled' then
    return jsonb_build_object(
      'available', false,
      'disabled', true,
      'mode', free_mode,
      'nextClaimAt', null,
      'cardsAwarded', '[]'::jsonb,
      'recoverySupported', recovery_supported,
      'latestOpening', null
    );
  end if;

  if free_mode = 'unlimited' then
    select * into latest
    from public.daily_booster_claims
    where user_id = uid
    order by claimed_at desc, id desc
    limit 1;

    -- Keep cardsAwarded empty for unlimited so pre-migration clients stay on
    -- "available" and only use latestOpening for the explicit View-latest path.
    return jsonb_build_object(
      'available', true,
      'disabled', false,
      'mode', free_mode,
      'claimDate', today,
      'nextClaimAt', null,
      'cardsAwarded', '[]'::jsonb,
      'recoverySupported', recovery_supported,
      'latestOpening', case
        when found then public.daily_booster_opening_payload(latest)
        else null
      end,
      'viewLatestLabel', 'View latest pack'
    );
  end if;

  -- Daily mode: only mode='daily' rows consume the once-per-ET-day slot.
  -- Same-day unlimited rows must not mark the pack claimed.
  select * into claim
  from public.daily_booster_claims
  where user_id = uid
    and claim_date = today
    and daily_booster_claims.mode = 'daily'
  limit 1;

  if found then
    return jsonb_build_object(
      'available', false,
      'disabled', false,
      'mode', free_mode,
      'claimDate', today,
      'claimedAt', claim.claimed_at,
      'nextClaimAt', next_at,
      'cardsAwarded', coalesce(claim.cards_awarded, '[]'::jsonb),
      'claimId', claim.id,
      'requestId', claim.request_id,
      'recoverySupported', recovery_supported,
      'latestOpening', public.daily_booster_opening_payload(claim),
      'viewLatestLabel', 'View todayâ€™s cards'
    );
  end if;

  return jsonb_build_object(
    'available', true,
    'disabled', false,
    'mode', free_mode,
    'claimDate', today,
    'nextClaimAt', next_at,
    'cardsAwarded', '[]'::jsonb,
    'recoverySupported', recovery_supported,
    'latestOpening', null
  );
end;
$$;

revoke all on function public.get_daily_booster_status() from public, anon;
grant execute on function public.get_daily_booster_status() to authenticated, service_role;
