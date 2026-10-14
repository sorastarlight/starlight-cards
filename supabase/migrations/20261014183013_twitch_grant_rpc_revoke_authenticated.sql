-- Narrow permission harden: Twitch grant RPCs are Worker/service_role only.
-- Ordinary authenticated clients must not call SECURITY DEFINER grant entry points.
-- Staff continue via admin_manual_twitch_reward_v890 (is_content_admin gated).
-- Worker continues via service_role.
--
-- No economic / data changes. Restores intended grants from v89 / season_pass migrations
-- after idempotency migrations incorrectly re-granted EXECUTE to authenticated.

revoke all on function public.apply_twitch_reward_v890(
  uuid, text, bigint, text, integer, text, text, uuid, text, text, uuid
) from public, anon, authenticated;

grant execute on function public.apply_twitch_reward_v890(
  uuid, text, bigint, text, integer, text, text, uuid, text, text, uuid
) to service_role;

revoke all on function public.deliver_twitch_season_unlock_v1(
  text, text, text, uuid, text
) from public, anon, authenticated;

grant execute on function public.deliver_twitch_season_unlock_v1(
  text, text, text, uuid, text
) to service_role;

-- Preserve staff path (internal auth check).
revoke all on function public.admin_manual_twitch_reward_v890(jsonb) from public, anon;
grant execute on function public.admin_manual_twitch_reward_v890(jsonb) to authenticated, service_role;
