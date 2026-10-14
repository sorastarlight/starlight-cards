#!/usr/bin/env node
/**
 * Isolated Twitch grant authorization + crash-retry suite (local Postgres only).
 * Never points at production.
 *
 *   node scripts/run-twitch-grant-auth-local.mjs
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const psql = process.env.PG_BIN ? path.join(process.env.PG_BIN, 'psql') : 'psql';
const db = process.env.TWITCH_GRANT_AUTH_DB || 'starlight_twitch_grant_auth_test';
const host = process.env.PGHOST || 'localhost';
const user = process.env.PGUSER || 'postgres';

function run(args) {
  const result = spawnSync(psql, args, {
    cwd: root,
    encoding: 'utf8',
    env: process.env
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || '');
    throw new Error(`psql failed: ${args.join(' ')}`);
  }
  return result.stdout;
}

function sqlFile(rel) {
  return ['-U', user, '-h', host, '-d', db, '-v', 'ON_ERROR_STOP=1', '-f', path.join(root, rel)];
}

console.log('Recreating isolated database', db);
run([
  '-U', user, '-h', host, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c',
  `DROP DATABASE IF EXISTS ${db} WITH (FORCE);`
]);
run([
  '-U', user, '-h', host, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c',
  `CREATE DATABASE ${db};`
]);

run(sqlFile('tests/sql/twitch-grant-auth-local-fixture.sql'));
// Current idempotent RPC bodies (as deployed), then suite demonstrates harden.
run(sqlFile('supabase/migrations/20261014181235_twitch_reward_grant_event_idempotency.sql'));
run(sqlFile('supabase/migrations/20261014181346_twitch_season_unlock_event_idempotency.sql'));
// Re-introduce vulnerable grants so the suite can prove the pre-fix hole, then harden.
run([
  '-U', user, '-h', host, '-d', db, '-v', 'ON_ERROR_STOP=1', '-c',
  `grant execute on function public.apply_twitch_reward_v890(uuid, text, bigint, text, integer, text, text, uuid, text, text, uuid) to authenticated;
   grant execute on function public.deliver_twitch_season_unlock_v1(text, text, text, uuid, text) to authenticated;`
]);
run(sqlFile('tests/sql/twitch-grant-auth-suite.sql'));

const out = run([
  '-U', user, '-h', host, '-d', db, '-v', 'ON_ERROR_STOP=1', '-c',
  "select set_config('starlight.allow_twitch_grant_tests', 'on', false); select starlight_test.run_twitch_grant_auth_suite();"
]);
process.stdout.write(out);
if (!out.includes('PASS')) {
  process.exitCode = 1;
  throw new Error('Twitch grant auth suite did not report PASS');
}
console.log('Twitch grant auth suite PASS.');
