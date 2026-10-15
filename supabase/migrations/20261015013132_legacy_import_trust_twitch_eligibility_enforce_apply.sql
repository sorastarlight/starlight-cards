-- ---------------------------------------------------------------------------
-- Twitch grants: enforce cooldown + max_claims under advisory lock (non-manual)
-- ---------------------------------------------------------------------------
create or replace function public.apply_twitch_reward_v890(
  requested_user_id uuid,
  requested_reward_type text,
  requested_star_bits bigint default null::bigint,
  requested_card_id text default null::text,
  requested_card_quantity integer default null::integer,
  requested_booster_id text default null::text,
  requested_event_id text default null::text,
  requested_rule_id uuid default null::uuid,
  requested_twitch_user_id text default null::text,
  requested_source text default 'twitch'::text,
  requested_granted_by uuid default null::uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  payload jsonb;
  queued jsonb;
  rule public.twitch_reward_rules%rowtype;
  season_id text;
  access jsonb;
  existing_grant public.twitch_reward_grants%rowtype;
  source_key text;
  claim_count integer := 0;
  last_granted timestamptz;
  enforce_limits boolean := false;
begin
  source_key := coalesce(
    nullif(trim(requested_event_id), ''),
    requested_source || ':' || coalesce(requested_twitch_user_id, '') || ':' || extract(epoch from now())::bigint
  );

  -- Idempotent replay for the same EventSub / source id.
  if nullif(trim(requested_event_id), '') is not null then
    select * into existing_grant
    from public.twitch_reward_grants
    where event_id = requested_event_id
    limit 1;

    if found then
      return jsonb_build_object(
        'success', true,
        'pending', true,
        'idempotentReplay', true,
        'receivedRewardId', existing_grant.reward_snapshot->>'receivedRewardId',
        'grantId', existing_grant.id,
        'seasonId', existing_grant.reward_snapshot->'payload'->>'seasonId'
      );
    end if;
  end if;

  -- Manual staff grants bypass rule cooldown / max-claims; EventSub paths do not.
  enforce_limits :=
    requested_rule_id is not null
    and coalesce(requested_source, '') is distinct from 'manual';

  if enforce_limits then
    perform pg_advisory_xact_lock(
      hashtextextended(
        coalesce(requested_user_id::text, '') || ':' || requested_rule_id::text,
        0
      )
    );

    select * into rule
    from public.twitch_reward_rules
    where id = requested_rule_id;

    if found then
      select count(*)::integer, max(granted_at)
      into claim_count, last_granted
      from public.twitch_reward_grants
      where user_id = requested_user_id
        and rule_id = requested_rule_id;

      if rule.max_claims_per_user is not null
         and claim_count >= rule.max_claims_per_user then
        return jsonb_build_object(
          'success', false,
          'ignored', true,
          'reason', 'claim_limit',
          'message', 'Claim limit reached.'
        );
      end if;

      if coalesce(rule.cooldown_minutes, 0) > 0
         and last_granted is not null
         and last_granted > (now() - make_interval(mins => rule.cooldown_minutes)) then
        return jsonb_build_object(
          'success', false,
          'ignored', true,
          'reason', 'cooldown',
          'message', 'Reward cooldown active.'
        );
      end if;
    end if;
  end if;

  if requested_reward_type = 'season_pass_unlock' then
    if requested_rule_id is not null then
      select * into rule from public.twitch_reward_rules where id = requested_rule_id;
      season_id := rule.season_id;
    end if;
    if season_id is null then
      raise exception 'Season Pass unlock requires a season on the Twitch reward rule.';
    end if;

    access := public.grant_season_pass_access_v1(
      requested_user_id,
      season_id,
      case when requested_source = 'manual' then 'manual' else 'subscription_eventsub' end,
      requested_event_id,
      jsonb_build_object('ruleId', requested_rule_id, 'twitchUserId', requested_twitch_user_id)
    );

    payload := jsonb_build_object('seasonId', season_id);
    queued := public.queue_received_reward_v892(
      requested_user_id,
      case when requested_source = 'manual' then 'manual' else 'twitch' end,
      source_key,
      'Season Pass Unlocked',
      case
        when requested_source = 'manual' then 'A Season Pass unlock was sent to you.'
        else 'Your Twitch subscription unlocked the Seasonal Collection Pass.'
      end,
      'season_pass_unlock',
      payload,
      requested_granted_by,
      jsonb_build_object('ruleId', requested_rule_id, 'twitchUserId', requested_twitch_user_id, 'eventId', requested_event_id, 'access', access),
      null
    );

    insert into public.twitch_reward_grants(event_id, rule_id, user_id, twitch_user_id, reward_snapshot, source, granted_by)
    values (
      requested_event_id,
      requested_rule_id,
      requested_user_id,
      requested_twitch_user_id,
      jsonb_build_object('pending', true, 'receivedRewardId', queued->>'id', 'rewardType', requested_reward_type, 'payload', payload, 'access', access),
      coalesce(requested_source, 'twitch'),
      requested_granted_by
    )
    on conflict (event_id) where event_id is not null do nothing;

    return jsonb_build_object('success', true, 'pending', true, 'receivedRewardId', queued->>'id', 'seasonId', season_id);
  end if;

  payload := case requested_reward_type
    when 'star_bits' then jsonb_build_object('amount', requested_star_bits)
    when 'single_card' then jsonb_build_object('cardId', requested_card_id, 'quantity', greatest(coalesce(requested_card_quantity, 1), 1))
    when 'booster' then jsonb_build_object('boosterId', requested_booster_id)
    else '{}'::jsonb
  end;

  queued := public.queue_received_reward_v892(
    requested_user_id,
    case when requested_source = 'manual' then 'manual' else 'twitch' end,
    source_key,
    'Twitch reward',
    case when requested_source = 'manual' then 'A one-time reward was sent to you.' else 'Your Twitch activity unlocked a Starlight reward.' end,
    requested_reward_type,
    payload,
    requested_granted_by,
    jsonb_build_object('ruleId', requested_rule_id, 'twitchUserId', requested_twitch_user_id, 'eventId', requested_event_id),
    null
  );

  insert into public.twitch_reward_grants(event_id, rule_id, user_id, twitch_user_id, reward_snapshot, source, granted_by)
  values (
    requested_event_id,
    requested_rule_id,
    requested_user_id,
    requested_twitch_user_id,
    jsonb_build_object('pending', true, 'receivedRewardId', queued->>'id', 'rewardType', requested_reward_type, 'payload', payload),
    coalesce(requested_source, 'twitch'),
    requested_granted_by
  )
  on conflict (event_id) where event_id is not null do nothing;

  return jsonb_build_object('success', true, 'pending', true, 'receivedRewardId', queued->>'id');
end;
$function$;

revoke all on function public.apply_twitch_reward_v890(
  uuid, text, bigint, text, integer, text, text, uuid, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.apply_twitch_reward_v890(
  uuid, text, bigint, text, integer, text, text, uuid, text, text, uuid
) to service_role;