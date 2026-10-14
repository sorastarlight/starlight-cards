import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('permission harden migration revokes authenticated from Twitch grant RPCs', async () => {
  const sql = await readFile(
    new URL(
      '../supabase/migrations/20261014183013_twitch_grant_rpc_revoke_authenticated.sql',
      import.meta.url
    ),
    'utf8'
  );
  assert.match(sql, /revoke all on function public\.apply_twitch_reward_v890/);
  assert.match(sql, /from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.apply_twitch_reward_v890\([\s\S]*?\) to service_role;/);
  assert.match(sql, /revoke all on function public\.deliver_twitch_season_unlock_v1/);
  assert.match(sql, /grant execute on function public\.admin_manual_twitch_reward_v890\(jsonb\) to authenticated, service_role;/);
  assert.match(sql, /\) to service_role;\s*\r?\n\s*revoke all on function public\.deliver_twitch_season_unlock_v1/);
  assert.equal(
    (sql.match(/grant execute on function public\.apply_twitch_reward_v890/g) || []).length,
    1
  );
  assert.match(sql, /grant execute on function public\.apply_twitch_reward_v890\([\s\S]{0,200}?\) to service_role;/);
});

test('isolated Twitch grant auth suite covers roles, crash-retry, and season paths', async () => {
  const sql = await readFile(new URL('./sql/twitch-grant-auth-suite.sql', import.meta.url), 'utf8');
  assert.match(sql, /run_twitch_grant_auth_suite/);
  assert.match(sql, /VULN DEMO/);
  assert.match(sql, /after harden: authenticated cannot EXECUTE apply/);
  assert.match(sql, /staff admin_manual must still succeed/);
  assert.match(sql, /simulate_worker_retry/);
  assert.match(sql, /prior_grant/);
  assert.match(sql, /linked season unlock/);
  assert.match(sql, /unlinked pending/);
});
