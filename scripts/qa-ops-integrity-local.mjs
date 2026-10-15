/**
 * Runs isolated ops integrity suite against disposable local Postgres.
 * Does not touch production.
 *
 *   node scripts/qa-ops-integrity-local.mjs
 */
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reviewDir = path.join(root, '.local-review');
const outPath = path.join(reviewDir, 'ops-integrity-local-evidence.json');
const psql = 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe';
const dbName = 'starlight_ops_integrity_qa';

function run(args, { ignoreFail = false } = {}) {
  const result = spawnSync(psql, args, { encoding: 'utf8' });
  if (!ignoreFail && result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `psql failed: ${args.join(' ')}`);
  }
  return result;
}

async function main() {
  run(['-U', 'postgres', '-h', 'localhost', '-c', `DROP DATABASE IF EXISTS ${dbName};`], {
    ignoreFail: true
  });
  // terminate backends if needed
  run([
    '-U',
    'postgres',
    '-h',
    'localhost',
    '-c',
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${dbName}' AND pid <> pg_backend_pid();`
  ], { ignoreFail: true });
  run(['-U', 'postgres', '-h', 'localhost', '-c', `DROP DATABASE IF EXISTS ${dbName};`]);
  run(['-U', 'postgres', '-h', 'localhost', '-c', `CREATE DATABASE ${dbName};`]);

  const fixture = path.join(root, 'tests/sql/ops-integrity-local-fixture.sql');
  const suite = path.join(root, 'tests/sql/ops-integrity-suite.sql');
  const loadFixture = run(['-U', 'postgres', '-h', 'localhost', '-d', dbName, '-v', 'ON_ERROR_STOP=1', '-f', fixture]);
  const loadSuite = run(['-U', 'postgres', '-h', 'localhost', '-d', dbName, '-v', 'ON_ERROR_STOP=1', '-f', suite]);

  const evidence = {
    generatedAt: new Date().toISOString(),
    database: dbName,
    overallPass: true,
    notes: [
      'Isolated DB only — production pause flags were not toggled.',
      'Authorized admin success and canary cohort allow/deny proven via JWT claim stubs.'
    ],
    fixtureExit: loadFixture.status,
    suiteExit: loadSuite.status,
    suiteNotice: /ops-integrity-suite PASS/.test(loadSuite.stdout + loadSuite.stderr)
  };

  if (!evidence.suiteNotice) {
    evidence.overallPass = false;
    evidence.stdout = loadSuite.stdout;
    evidence.stderr = loadSuite.stderr;
  }

  await mkdir(reviewDir, { recursive: true });
  await writeFile(outPath, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
  if (!evidence.overallPass) process.exit(1);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
