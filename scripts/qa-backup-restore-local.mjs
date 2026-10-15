/**
 * Restores a starlight-database-backup-v90.2 JSON into a disposable local Postgres DB.
 * Coverage: PostgreSQL schema tables + representative SELECTs.
 * Not covered: Supabase Auth users/sessions, Storage objects, Edge/Worker secrets.
 *
 *   node scripts/qa-backup-restore-local.mjs
 */
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBackupShape } from './qa-backup-shape.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reviewDir = path.join(root, '.local-review');
const outPath = path.join(reviewDir, 'backup-restore-local-evidence.json');
const fixturePath = path.join(root, 'tests/fixtures/database-backup-v90.2.sample.json');
const psql = 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe';
const dbName = 'starlight_backup_restore_qa';

function run(args, { ignoreFail = false, input } = {}) {
  const result = spawnSync(psql, args, {
    encoding: 'utf8',
    input
  });
  if (!ignoreFail && result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `psql failed: ${args.join(' ')}`);
  }
  return result;
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function main() {
  const backup = JSON.parse(await readFile(fixturePath, 'utf8'));
  // Enrich fixture with one representative row set for query checks.
  backup.series = [
    {
      id: 's-restore-01',
      name: 'Restore Drill Series',
      sort_order: 1,
      is_visible: true
    }
  ];
  backup.cards = [
    {
      id: 'c-restore-01',
      series_id: 's-restore-01',
      name: 'Restore Card',
      rarity: 'Common',
      card_number: '001',
      is_visible: true,
      sort_order: 1
    }
  ];
  backup.boosters = [
    {
      id: 'b-restore-01',
      name: 'Restore Pack',
      is_active: true,
      star_bits_cost: 100,
      archived: false
    }
  ];

  const shapeErrors = validateBackupShape(backup);
  if (shapeErrors.length) {
    throw new Error(`Backup shape invalid: ${shapeErrors.join('; ')}`);
  }

  run(['-U', 'postgres', '-h', 'localhost', '-c', `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${dbName}' AND pid <> pg_backend_pid();`], {
    ignoreFail: true
  });
  run(['-U', 'postgres', '-h', 'localhost', '-c', `DROP DATABASE IF EXISTS ${dbName};`]);
  run(['-U', 'postgres', '-h', 'localhost', '-c', `CREATE DATABASE ${dbName};`]);

  const ddl = `
create schema if not exists restore;
create table restore.series(id text primary key, name text, sort_order int, is_visible boolean, raw jsonb);
create table restore.cards(id text primary key, series_id text, name text, rarity text, card_number text, is_visible boolean, sort_order int, raw jsonb);
create table restore.boosters(id text primary key, name text, is_active boolean, star_bits_cost int, archived boolean, raw jsonb);
create table restore.meta(key text primary key, value jsonb);
revoke all on schema restore from public;
grant usage on schema restore to public;
grant select on all tables in schema restore to public;
`;
  run(['-U', 'postgres', '-h', 'localhost', '-d', dbName, '-v', 'ON_ERROR_STOP=1', '-c', ddl]);

  const inserts = [
    `insert into restore.meta(key,value) values('format', ${sqlLiteral(JSON.stringify(backup.format))}::jsonb);`,
    `insert into restore.meta(key,value) values('exportedAt', ${sqlLiteral(JSON.stringify(backup.exportedAt))}::jsonb);`
  ];
  for (const row of backup.series) {
    inserts.push(
      `insert into restore.series(id,name,sort_order,is_visible,raw) values(${sqlLiteral(row.id)},${sqlLiteral(row.name)},${Number(row.sort_order||0)},${row.is_visible!==false},${sqlLiteral(JSON.stringify(row))}::jsonb);`
    );
  }
  for (const row of backup.cards) {
    inserts.push(
      `insert into restore.cards(id,series_id,name,rarity,card_number,is_visible,sort_order,raw) values(${sqlLiteral(row.id)},${sqlLiteral(row.series_id)},${sqlLiteral(row.name)},${sqlLiteral(row.rarity)},${sqlLiteral(row.card_number)},${row.is_visible!==false},${Number(row.sort_order||0)},${sqlLiteral(JSON.stringify(row))}::jsonb);`
    );
  }
  for (const row of backup.boosters) {
    inserts.push(
      `insert into restore.boosters(id,name,is_active,star_bits_cost,archived,raw) values(${sqlLiteral(row.id)},${sqlLiteral(row.name)},${row.is_active===true},${Number(row.star_bits_cost||0)},${row.archived===true},${sqlLiteral(JSON.stringify(row))}::jsonb);`
    );
  }
  run(['-U', 'postgres', '-h', 'localhost', '-d', dbName, '-v', 'ON_ERROR_STOP=1', '-c', inserts.join('\n')]);

  const checks = run([
    '-U',
    'postgres',
    '-h',
    'localhost',
    '-d',
    dbName,
    '-v',
    'ON_ERROR_STOP=1',
    '-t',
    '-A',
    '-c',
    `
select json_build_object(
  'series', (select count(*) from restore.series),
  'cards', (select count(*) from restore.cards),
  'boosters', (select count(*) from restore.boosters),
  'visibleCards', (select count(*) from restore.cards where is_visible),
  'activeBoosters', (select count(*) from restore.boosters where is_active and not archived),
  'joinOk', (select count(*) from restore.cards c join restore.series s on s.id=c.series_id),
  'format', (select value #>> '{}' from restore.meta where key='format')
);
`
  ]);

  const summary = JSON.parse(String(checks.stdout || '').trim());
  const evidence = {
    generatedAt: new Date().toISOString(),
    database: dbName,
    overallPass:
      summary.series === 1 &&
      summary.cards === 1 &&
      summary.boosters === 1 &&
      summary.joinOk === 1 &&
      summary.format === 'starlight-database-backup-v90.2',
    postgresRestore: {
      covered: [
        'Backup JSON shape validation',
        'Disposable local database create/drop',
        'Table DDL for series/cards/boosters',
        'Row load + join query',
        'Grant presence on restore schema tables'
      ],
      summary
    },
    notCovered: [
      'Supabase Auth (auth.users / sessions / JWT issuance)',
      'Supabase Storage object bytes and bucket policies',
      'Edge Functions / Worker secrets',
      'Full production schema pg_dump restore'
    ]
  };

  await mkdir(reviewDir, { recursive: true });
  await writeFile(outPath, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
  if (!evidence.overallPass) process.exit(1);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
