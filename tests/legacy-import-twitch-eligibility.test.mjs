import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const importMigration =
  '../supabase/migrations/20261015013211_legacy_import_trust_twitch_eligibility_enforce_import.sql';
const applyMigration =
  '../supabase/migrations/20261015013132_legacy_import_trust_twitch_eligibility_enforce_apply.sql';
const deliverMigration =
  '../supabase/migrations/20261015013157_legacy_import_trust_twitch_eligibility_enforce_deliver.sql';

test('legacy import migration revokes anon, one-shot gate, and skips collector XP', async () => {
  const sql = await readFile(new URL(importMigration, import.meta.url), 'utf8');
  assert.match(sql, /revoke all on function public\.import_legacy_collection\(text\[\], text\) from public, anon/);
  assert.match(sql, /grant execute on function public\.import_legacy_collection\(text\[\], text\) to authenticated, service_role/);
  assert.match(sql, /A legacy collection import was already recorded/);
  assert.match(sql, /starlight\.skip_collector_xp/);
  assert.match(sql, /collectorXpAwarded',\s*false/);
  assert.match(sql, /if current_setting\('starlight\.skip_collector_xp', true\) = 'on'/);
});

test('twitch eligibility migration locks rule claims and returns ignored reasons', async () => {
  const applySql = await readFile(new URL(applyMigration, import.meta.url), 'utf8');
  const deliverSql = await readFile(new URL(deliverMigration, import.meta.url), 'utf8');
  assert.match(applySql, /pg_advisory_xact_lock/);
  assert.match(applySql, /reason', 'claim_limit'/);
  assert.match(applySql, /reason', 'cooldown'/);
  assert.match(applySql, /coalesce\(requested_source, ''\) is distinct from 'manual'/);
  assert.match(
    applySql,
    /revoke all on function public\.apply_twitch_reward_v890[\s\S]*from public, anon, authenticated/
  );
  assert.match(
    applySql,
    /grant execute on function public\.apply_twitch_reward_v890[\s\S]*to service_role/
  );
  assert.match(deliverSql, /create or replace function public\.deliver_twitch_season_unlock_v1/);
  assert.match(
    deliverSql,
    /revoke all on function public\.deliver_twitch_season_unlock_v1\(text, text, text, uuid, text\)/
  );
});

test('worker marks DB eligibility denials as ignored and reports 1.1.5', async () => {
  const worker = await readFile(new URL('../cloudflare-worker/src/index.js', import.meta.url), 'utf8');
  assert.match(worker, /applied\.ignored === true/);
  assert.match(worker, /seasonResult\.ignored === true/);
  assert.match(worker, /status: 'ignored'/);
  assert.match(worker, /version: '1\.1\.5'/);
});

test('admin NULL role-gate migration rewrites actor_role NOT IN checks', async () => {
  const sql = await readFile(
    new URL('../supabase/migrations/20261015013346_fix_admin_rpc_null_role_gate.sql', import.meta.url),
    'utf8'
  );
  assert.match(sql, /coalesce\(actor_role, ''''\)/);
  assert.match(sql, /actor_role\[\[:space:\]\]\+not\[\[:space:\]\]\+in/);
  assert.match(sql, /Expected to rewrite at least one admin_\*/);
});
