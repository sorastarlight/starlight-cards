-- Reconciled with production apply order (do not edit applied prod history).
-- Source content from 20261014080000 monolith, split to match:
--   20261014152518 schema, 20261014152704 helpers/status, 20261014152749 open RPCs

-- ---------------------------------------------------------------------------
-- open_daily_booster(uuid) â€” UUID-aware idempotent open (grants+claim atomic)
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
      -- Should not happen after a committed open; refuse empty â€œsuccessâ€.
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
-- open_daily_booster() â€” preserve deployed zero-arg client calls
-- ---------------------------------------------------------------------------
-- PostgREST resolves rpc('open_daily_booster') â†’ this overload, and
-- rpc('open_daily_booster', { requested_request_id }) â†’ the uuid overload.
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
