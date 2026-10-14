#!/usr/bin/env node
/**
 * Run isolated opening-recovery DB suite against local PostgreSQL.
 * Never points at production. Requires:
 *   - PostgreSQL with psql on PATH (or PG_BIN)
 *   - PGPASSWORD / peer auth for local postgres
 *
 * Usage:
 *   node scripts/run-opening-recovery-local.mjs
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const psql = process.env.PG_BIN
  ? path.join(process.env.PG_BIN, 'psql')
  : 'psql';
const db = process.env.OPENING_RECOVERY_DB || 'starlight_opening_recovery_test';
const host = process.env.PGHOST || 'localhost';
const user = process.env.PGUSER || 'postgres';

function run(args, options = {}) {
  const result = spawnSync(psql, args, {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
    ...options
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
run(['-U', user, '-h', host, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', `DROP DATABASE IF EXISTS ${db} WITH (FORCE);`]);
run(['-U', user, '-h', host, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', `CREATE DATABASE ${db};`]);
run([
  '-U', user, '-h', host, '-d', db, '-v', 'ON_ERROR_STOP=1', '-c',
  `DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
   DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
   DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`
]);
run(sqlFile('tests/sql/opening-recovery-local-fixture.sql'));
run(sqlFile('supabase/migrations/20261014080000_daily_booster_opening_recovery.sql'));
run(sqlFile('tests/sql/daily-booster-opening-recovery.sql'));
const suite = run([
  '-U', user, '-h', host, '-d', db, '-v', 'ON_ERROR_STOP=1', '-c',
  "select set_config('starlight.allow_opening_recovery_tests', 'on', false); select starlight_test.run_opening_recovery_suite();"
]);
process.stdout.write(suite);
if (!suite.includes('PASS')) {
  process.exitCode = 1;
  throw new Error('Suite did not report PASS');
}
console.log('Isolated suite PASS. Run two-session concurrency manually with tests/sql/_run_concurrency_*.sql');
