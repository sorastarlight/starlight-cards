/**
 * Genuine pg_dump → pg_restore round trip on disposable local Postgres.
 * Verifies functions, grants, RLS policies, constraints, triggers, and data.
 * Does not touch production.
 *
 *   node scripts/qa-pg-dump-restore-local.mjs
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir as mkdirAsync, writeFile as writeFileAsync } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reviewDir = path.join(root, '.local-review');
const outPath = path.join(reviewDir, 'pg-dump-restore-local-evidence.json');
const bin = 'C:\\Program Files\\PostgreSQL\\17\\bin';
const psql = path.join(bin, 'psql.exe');
const pgDump = path.join(bin, 'pg_dump.exe');
const pgRestore = path.join(bin, 'pg_restore.exe');
const srcDb = 'starlight_pg_roundtrip_src';
const dstDb = 'starlight_pg_roundtrip_dst';

function run(cmd, args, { ignoreFail = false } = {}) {
  const result = spawnSync(cmd, args, { encoding: 'utf8' });
  if (!ignoreFail && result.status !== 0) {
    throw new Error(
      `${path.basename(cmd)} failed (${result.status}): ${result.stderr || result.stdout || args.join(' ')}`
    );
  }
  return result;
}

function terminateAndDrop(dbName) {
  run(
    psql,
    [
      '-U',
      'postgres',
      '-h',
      'localhost',
      '-c',
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${dbName}' AND pid <> pg_backend_pid();`
    ],
    { ignoreFail: true }
  );
  run(psql, ['-U', 'postgres', '-h', 'localhost', '-c', `DROP DATABASE IF EXISTS ${dbName};`]);
}

async function main() {
  const work = mkdtempSync(path.join(tmpdir(), 'starlight-pg-roundtrip-'));
  const dumpPath = path.join(work, 'roundtrip.dump');

  terminateAndDrop(srcDb);
  terminateAndDrop(dstDb);

  run(psql, ['-U', 'postgres', '-h', 'localhost', '-c', `CREATE DATABASE ${srcDb};`]);
  run(psql, [
    '-U',
    'postgres',
    '-h',
    'localhost',
    '-d',
    srcDb,
    '-v',
    'ON_ERROR_STOP=1',
    '-f',
    path.join(root, 'tests/sql/pg-roundtrip-source.sql')
  ]);

  run(pgDump, ['-U', 'postgres', '-h', 'localhost', '-Fc', '-f', dumpPath, srcDb]);

  run(psql, ['-U', 'postgres', '-h', 'localhost', '-c', `CREATE DATABASE ${dstDb};`]);
  const restore = run(pgRestore, [
    '-U',
    'postgres',
    '-h',
    'localhost',
    '-d',
    dstDb,
    '--no-owner',
    dumpPath
  ]);

  const verify = run(psql, [
    '-U',
    'postgres',
    '-h',
    'localhost',
    '-d',
    dstDb,
    '-v',
    'ON_ERROR_STOP=1',
    '-f',
    path.join(root, 'tests/sql/pg-roundtrip-verify.sql')
  ]);

  const catalog = run(psql, [
    '-U',
    'postgres',
    '-h',
    'localhost',
    '-d',
    dstDb,
    '-t',
    '-A',
    '-c',
    `
select json_build_object(
  'functions', (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('ops_feature_enabled','ops_canary_feature_allowed','get_canary_feature','admin_get_ops_pauses','touch_user_cards_updated_at')),
  'policies', (select count(*) from pg_policies where schemaname='public'),
  'triggers', (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal),
  'checkConstraints', (select count(*) from pg_constraint where contype='c' and connamespace='public'::regnamespace),
  'foreignKeys', (select count(*) from pg_constraint where contype='f' and connamespace='public'::regnamespace),
  'userCards', (select count(*) from public.user_cards),
  'cohort', (select count(*) from public.ops_release_cohort),
  'rlsUserCards', (select relrowsecurity from pg_class where oid='public.user_cards'::regclass),
  'authExecCanary', has_function_privilege('authenticated','public.get_canary_feature(text)','EXECUTE'),
  'anonExecCanary', has_function_privilege('anon','public.get_canary_feature(text)','EXECUTE')
);
`
  ]);

  const summary = JSON.parse(String(catalog.stdout || '').trim());
  const evidence = {
    generatedAt: new Date().toISOString(),
    sourceDatabase: srcDb,
    targetDatabase: dstDb,
    dumpFormat: 'custom (-Fc)',
    overallPass:
      /pg-roundtrip-verify PASS/.test(verify.stdout + verify.stderr) &&
      summary.functions >= 5 &&
      summary.policies >= 4 &&
      summary.triggers >= 1 &&
      summary.checkConstraints >= 3 &&
      summary.foreignKeys >= 3 &&
      summary.userCards === 1 &&
      summary.cohort === 1 &&
      summary.rlsUserCards === true &&
      summary.authExecCanary === true &&
      summary.anonExecCanary === false,
    catalog: summary,
    restoreExit: restore.status,
    verifyNotice: /pg-roundtrip-verify PASS/.test(verify.stdout + verify.stderr),
    coverage: [
      'pg_dump custom format of disposable source DB',
      'pg_restore into disposable target DB',
      'Functions + EXECUTE grants',
      'RLS enabled + policies',
      'CHECK/FK constraints',
      'BEFORE UPDATE trigger',
      'Representative series/cards/user_cards/cohort rows',
      'Post-restore canary allow/deny/disable + admin deny/allow behavior'
    ],
    notCovered: [
      'Production cluster dump',
      'Supabase Auth schema beyond stub auth.users/auth.uid',
      'Supabase Storage objects'
    ]
  };

  await mkdirAsync(reviewDir, { recursive: true });
  await writeFileAsync(outPath, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));

  terminateAndDrop(srcDb);
  terminateAndDrop(dstDb);
  try {
    rmSync(work, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  if (!evidence.overallPass) process.exit(1);
}

main().catch((error) => {
  console.error(error.message || error);
  try {
    terminateAndDrop(srcDb);
    terminateAndDrop(dstDb);
  } catch {
    /* ignore */
  }
  process.exit(1);
});
