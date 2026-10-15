import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('canary cohort migration enforces stage, feature flag, and cohort membership', async () => {
  const sql = await read('supabase/migrations/20261015020017_ops_canary_cohort_gates.sql');
  assert.match(sql, /create table if not exists public\.ops_release_cohort/);
  assert.match(sql, /ops_canary_feature_allowed/);
  assert.match(sql, /get_canary_feature/);
  assert.match(sql, /stage.*canary/s);
  assert.match(sql, /ops_canary_features/);
  assert.match(sql, /admin_set_ops_release_cohort_member/);
  assert.match(sql, /coalesce\(actor_role,\s*''\)\s+not in/);
});

test('release channel mounts canary UI only from server allowed payload', async () => {
  const js = await read('docs/js/release-channel.js');
  assert.match(js, /get_canary_feature/);
  assert.match(js, /gallery_density_preview/);
  assert.match(js, /ensureFeaturePanel/);
  assert.match(js, /allowed/);
});

test('ops integrity local suite covers authorized success and canary disable', async () => {
  const suite = await read('tests/sql/ops-integrity-suite.sql');
  assert.match(suite, /admin_get_ops_pauses/);
  assert.match(suite, /shop pause blocks/);
  assert.match(suite, /canary\+cohort allows feature/);
  assert.match(suite, /disabled feature denies cohort/);
});
