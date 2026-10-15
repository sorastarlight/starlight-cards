import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('admin health ops panels expose labelled regions and confirmable controls', async () => {
  const html = await read('docs/admin-health.html');
  const page = await read('docs/js/pages/admin-health-page.js');
  assert.match(html, /id="opsControls"/);
  assert.match(html, /id="status"[^>]*role="status"/);
  assert.match(page, /aria-labelledby="opsPauseTitle"/);
  assert.match(page, /aria-labelledby="opsReleaseTitle"/);
  assert.match(page, /aria-labelledby="opsCohortTitle"/);
  assert.match(page, /StarlightUI\.confirm/);
  assert.match(page, /listOpsReleaseCohort/);
});

test('shell skip link and canary feature panel stay keyboard-discoverable', async () => {
  const binder = await read('docs/binder.html');
  const shellCss = await read('docs/css/app-shell.css');
  const release = await read('docs/js/release-channel.js');
  assert.match(binder, /shell-skip-link/);
  assert.match(binder, /href="#main-content"/);
  assert.match(shellCss, /\.shell-skip-link:focus/);
  assert.match(release, /role', 'status'/);
  assert.match(release, /get_canary_feature/);
  assert.match(release, /allowed/);
});

test('pg dump/restore and auth-storage recovery docs stay honest about coverage', async () => {
  const dumpScript = await read('scripts/qa-pg-dump-restore-local.mjs');
  const authDoc = await read('docs/OVERHAUL_AUTH_STORAGE_RECOVERY.md');
  assert.match(dumpScript, /pg_dump/);
  assert.match(dumpScript, /pg_restore/);
  assert.match(dumpScript, /RLS enabled \+ policies/);
  assert.match(authDoc, /No Auth\/Storage restore was executed/);
  assert.match(authDoc, /not executed/i);
});
