-- Server-backed Free Daily / unlimited opening recovery.
-- Reuses public.daily_booster_claims (activity trigger + streak + status already depend on it).
-- Does NOT reconstruct historical unlimited openings that never wrote a claim row.
--
-- Compatibility: keeps public.open_daily_booster() for the currently deployed client
-- and adds public.open_daily_booster(uuid) alongside it (PostgREST overload by args).
--
-- Rollout: apply only after isolated DB + two-session concurrency checks pass.
-- Rollback: restore prior RPC bodies only. Do NOT drop rows or restore the old
-- UNIQUE(user_id, claim_date) while unlimited multi-open rows exist.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
alter table public.daily_booster_claims
  add column if not exists mode text not null default 'daily';

alter table public.daily_booster_claims
  add column if not exists request_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'daily_booster_claims_mode_check'
      and conrelid = 'public.daily_booster_claims'::regclass
  ) then
    alter table public.daily_booster_claims
      add constraint daily_booster_claims_mode_check
      check (mode in ('daily', 'unlimited'));
  end if;
end $$;

-- Existing rows are once-per-day daily claims.
update public.daily_booster_claims
set mode = 'daily'
where mode is distinct from 'daily' and mode is distinct from 'unlimited';

alter table public.daily_booster_claims
  drop constraint if exists daily_booster_claims_user_id_claim_date_key;

drop index if exists public.daily_booster_claims_user_id_claim_date_key;

-- Daily mode remains one opening per user per America/New_York calendar day.
-- Unlimited rows (mode <> 'daily') do not participate — they cannot block a daily claim.
create unique index if not exists daily_booster_claims_one_daily_per_day
  on public.daily_booster_claims (user_id, claim_date)
  where mode = 'daily';

-- Client request UUID is unique per owner (idempotent open / lost-response recovery).
create unique index if not exists daily_booster_claims_user_request_id
  on public.daily_booster_claims (user_id, request_id)
  where request_id is not null;

-- Deterministic "latest opening" ordering.
create index if not exists daily_booster_claims_user_claimed_at_id_idx
  on public.daily_booster_claims (user_id, claimed_at desc, id desc);

comment on column public.daily_booster_claims.request_id is
  'Client-generated opening request UUID. Unique per user when present. Historical unlimited opens before this migration have no recoverable request_id or claim row.';

comment on column public.daily_booster_claims.mode is
  'daily = once per ET day; unlimited = many openings per day, each with its own request_id. Unlimited rows do not satisfy the daily unique index.';

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
-- get_my_daily_booster_opening — owner-only read of one opening (never grants)
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
-- get_daily_booster_status — unlimited exposes latest opening for View latest
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
      'viewLatestLabel', 'View today’s cards'
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

-- ---------------------------------------------------------------------------
-- open_daily_booster(uuid) — UUID-aware idempotent open (grants+claim atomic)
-- ---------------------------------------------------------------------------
-- Use an advisory xact lock so two simultaneous same-owner/same-request calls
-- serialize: the loser waits, then returns the committed opening (not an empty
-- mid-draw row). Daily mode locks the ET day slot so different UUIDs still
-- grant once.
create or replace function public.open_daily_booster(requested_request_id uuid)
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
  claim_id bigint;
  request_uuid uuid;
  selected text[];
  rewards jsonb;
  existing public.daily_booster_claims%rowtype;
  daily_existing public.daily_booster_claims%rowtype;
  lock_key text;
begin
  if uid is null then
    raise exception 'You must be signed in to open a daily booster.';
  end if;

  free_mode := public.get_free_daily_booster_mode();
  if free_mode = 'disabled' then
    raise exception 'The Free Daily Booster is currently disabled.';
  end if;

  today := timezone('America/New_York', now())::date;
  next_at := public.daily_booster_next_claim_at(today);
  request_uuid := coalesce(requested_request_id, gen_random_uuid());

  -- Serialize conflicting work before any insert/grant.
  if free_mode = 'daily' then
    lock_key := uid::text || '|daily|' || today::text;
  else
    lock_key := uid::text || '|req|' || request_uuid::text;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(lock_key, 0));

  -- Idempotent replay after lock: same owner + request_id, any claim_date/mode.
  select * into existing
  from public.daily_booster_claims
  where user_id = uid
    and request_id = request_uuid
  limit 1;

  if found then
    if existing.user_id is distinct from uid then
      raise exception 'Opening not found.';
    end if;
    if existing.cards_awarded is null
       or existing.cards_awarded = '[]'::jsonb then
      -- Should not happen after a committed open; refuse empty “success”.
      raise exception 'Opening is not ready yet. Retry status without opening another pack.';
    end if;
    return public.daily_booster_replay_payload(existing, free_mode);
  end if;

  if free_mode = 'daily' then
    select * into daily_existing
    from public.daily_booster_claims
    where user_id = uid
      and claim_date = today
      and daily_booster_claims.mode = 'daily'
    limit 1;

    if found then
      return jsonb_build_object(
        'success', false,
        'alreadyClaimed', true,
        'message', 'Today''s daily booster has already been opened.',
        'mode', free_mode,
        'claimId', daily_existing.id,
        'requestId', daily_existing.request_id,
        'claimDate', today,
        'claimedAt', daily_existing.claimed_at,
        'nextClaimAt', next_at,
        'cards', coalesce(daily_existing.cards_awarded, '[]'::jsonb),
        'cardsAwarded', coalesce(daily_existing.cards_awarded, '[]'::jsonb)
      );
    end if;
  end if;

  begin
    insert into public.daily_booster_claims (user_id, claim_date, cards_awarded, mode, request_id)
    values (uid, today, '[]'::jsonb, free_mode, request_uuid)
    returning id into claim_id;
  exception
    when unique_violation then
      -- Safety net if a lock was skipped or a concurrent path raced.
      select * into existing
      from public.daily_booster_claims
      where user_id = uid
        and (
          request_id = request_uuid
          or (
            free_mode = 'daily'
            and claim_date = today
            and daily_booster_claims.mode = 'daily'
          )
        )
      order by claimed_at desc, id desc
      limit 1;

      if not found then
        raise;
      end if;

      if existing.request_id is not distinct from request_uuid then
        if existing.cards_awarded is null
           or existing.cards_awarded = '[]'::jsonb then
          raise exception 'Opening is not ready yet. Retry status without opening another pack.';
        end if;
        return public.daily_booster_replay_payload(existing, free_mode);
      end if;

      return jsonb_build_object(
        'success', false,
        'alreadyClaimed', true,
        'message', 'Today''s daily booster has already been opened.',
        'mode', free_mode,
        'claimId', existing.id,
        'requestId', existing.request_id,
        'claimDate', today,
        'claimedAt', existing.claimed_at,
        'nextClaimAt', next_at,
        'cards', coalesce(existing.cards_awarded, '[]'::jsonb),
        'cardsAwarded', coalesce(existing.cards_awarded, '[]'::jsonb)
      );
  end;

  selected := public.draw_configured_booster_cards('free_daily');

  insert into public.user_cards (
    user_id, card_id, quantity, is_favorite, first_obtained_at, last_obtained_at, updated_at
  )
  select uid, x.card_id, x.qty, false, now(), now(), now()
  from (
    select card_id, count(*)::int qty
    from unnest(selected) card_id
    group by card_id
  ) x
  on conflict (user_id, card_id) do update
    set quantity = public.user_cards.quantity + excluded.quantity,
        last_obtained_at = now(),
        updated_at = now();

  select jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'cardNumber', c.card_number,
      'name', c.name,
      'rarity', c.rarity,
      'imageUrl', c.image_url,
      'thumbnailUrl', c.thumbnail_url,
      'seriesId', c.series_id,
      'seriesName', s.name,
      'artist', c.artist,
      'description', c.description,
      'quantity', uc.quantity,
      'isDuplicate', uc.quantity > 1
    )
    order by p.pos
  )
  into rewards
  from unnest(selected) with ordinality p(card_id, pos)
  join public.cards c on c.id = p.card_id
  join public.card_series s on s.id = c.series_id
  join public.user_cards uc on uc.user_id = uid and uc.card_id = c.id;

  update public.daily_booster_claims
  set cards_awarded = coalesce(rewards, '[]'::jsonb),
      claimed_at = now()
  where id = claim_id
    and user_id = uid;

  select * into existing from public.daily_booster_claims where id = claim_id and user_id = uid;

  return jsonb_build_object(
    'success', true,
    'alreadyClaimed', false,
    'idempotentReplay', false,
    'mode', free_mode,
    'claimId', claim_id,
    'requestId', request_uuid,
    'claimDate', today,
    'claimedAt', existing.claimed_at,
    'nextClaimAt', case when free_mode = 'daily' then next_at else null end,
    'cards', coalesce(rewards, '[]'::jsonb),
    'cardsAwarded', coalesce(rewards, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.open_daily_booster(uuid) from public, anon;
grant execute on function public.open_daily_booster(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- open_daily_booster() — preserve deployed zero-arg client calls
-- ---------------------------------------------------------------------------
-- PostgREST resolves rpc('open_daily_booster') → this overload, and
-- rpc('open_daily_booster', { requested_request_id }) → the uuid overload.
create or replace function public.open_daily_booster()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  return public.open_daily_booster(null::uuid);
end;
$$;

revoke all on function public.open_daily_booster() from public, anon;
grant execute on function public.open_daily_booster() to authenticated, service_role;

comment on function public.open_daily_booster() is
  'Compatibility wrapper for deployed clients. Delegates to open_daily_booster(uuid) with a server-generated request id.';

comment on function public.open_daily_booster(uuid) is
  'Idempotent Free Daily / unlimited open. Same owner+request_id returns the committed opening without granting again.';
