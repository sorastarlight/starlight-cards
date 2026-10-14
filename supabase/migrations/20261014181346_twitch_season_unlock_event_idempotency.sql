-- Align season-unlock grant insert with event_id uniqueness
-- (same crash/retry class as apply_twitch_reward_v890).

create or replace function public.deliver_twitch_season_unlock_v1(
  requested_twitch_user_id text,
  requested_twitch_login text,
  requested_event_id text,
  requested_rule_id uuid default null::uuid,
  requested_season_id text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  rule public.twitch_reward_rules%rowtype;
  season_id text;
  conn public.twitch_connections%rowtype;
  queued jsonb;
  access jsonb;
  existing_grant public.twitch_reward_grants%rowtype;
begin
  if nullif(trim(requested_event_id), '') is not null then
    select * into existing_grant
    from public.twitch_reward_grants
    where event_id = requested_event_id
    limit 1;
    if found then
      return jsonb_build_object(
        'success', true,
        'linked', existing_grant.user_id is not null,
        'userId', existing_grant.user_id,
        'receivedRewardId', existing_grant.reward_snapshot->>'receivedRewardId',
        'seasonId', coalesce(existing_grant.reward_snapshot->>'seasonId', existing_grant.reward_snapshot->'payload'->>'seasonId'),
        'idempotentReplay', true
      );
    end if;
  end if;

  if requested_rule_id is not null then
    select * into rule from public.twitch_reward_rules where id = requested_rule_id;
  end if;

  season_id := coalesce(
    nullif(requested_season_id, ''),
    rule.season_id
  );

  if season_id is null then
    raise exception 'A season id is required for Season Pass unlock.';
  end if;

  select * into conn
  from public.twitch_connections
  where twitch_user_id = trim(requested_twitch_user_id)
  limit 1;

  if found then
    access := public.grant_season_pass_access_v1(
      conn.user_id,
      season_id,
      'subscription_eventsub',
      requested_event_id,
      jsonb_build_object('ruleId', requested_rule_id, 'twitchLogin', requested_twitch_login)
    );

    queued := public.queue_received_reward_v892(
      conn.user_id,
      'twitch',
      coalesce(nullif(requested_event_id, ''), 'season-unlock:' || conn.user_id || ':' || season_id),
      'Season Pass Unlocked',
      'Thanks for subscribing! Your Seasonal Collection Pass is ready.',
      'season_pass_unlock',
      jsonb_build_object('seasonId', season_id),
      null,
      jsonb_build_object('ruleId', requested_rule_id, 'eventId', requested_event_id),
      null
    );

    insert into public.twitch_reward_grants(event_id, rule_id, user_id, twitch_user_id, reward_snapshot, source, granted_by)
    values (
      requested_event_id,
      requested_rule_id,
      conn.user_id,
      conn.twitch_user_id,
      jsonb_build_object('rewardType', 'season_pass_unlock', 'seasonId', season_id, 'receivedRewardId', queued->>'id', 'access', access),
      'twitch',
      null
    )
    on conflict (event_id) where event_id is not null do nothing;

    return jsonb_build_object(
      'success', true,
      'linked', true,
      'userId', conn.user_id,
      'receivedRewardId', queued->>'id',
      'seasonId', season_id
    );
  end if;

  perform public.queue_twitch_pending_unlock_v1(
    requested_twitch_user_id,
    requested_twitch_login,
    season_id,
    requested_event_id,
    requested_rule_id,
    jsonb_build_object('twitchLogin', requested_twitch_login)
  );

  return jsonb_build_object(
    'success', true,
    'linked', false,
    'pending', true,
    'seasonId', season_id
  );
end;
$function$;

revoke all on function public.deliver_twitch_season_unlock_v1(text, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.deliver_twitch_season_unlock_v1(text, text, text, uuid, text) to service_role;
