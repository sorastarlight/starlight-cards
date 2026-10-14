import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('collection cards open the shared full-view modal on click', async () => {
  const app = await read('docs/js/app.js');
  assert.match(app, /data-open-collection-card/);
  assert.match(app, /openFullView\(mode\)/);
  assert.match(app, /listMode === 'collection'/);
  assert.match(app, /listMode === 'duplicates'/);
});

test('user rankings avatars apply equipped frame classes from RPC payload', async () => {
  const page = await read('docs/js/pages/user-rankings-page.js');
  assert.match(page, /avatarFrameClassName\(entry\.frame/);
  assert.match(page, /avatarFrameOverlayMarkup/);
});

test('user rankings page loads avatar frame styles', async () => {
  const html = await read('docs/trade-lists.html');
  assert.match(html, /css\/avatar-frames\.css\?v=1\.3\.0/);
});

test('user rankings actions are ordered profile, follow, wishlist, trade', async () => {
  const page = await read('docs/js/pages/user-rankings-page.js');
  const block = page.match(/class="rankings-actions">([\s\S]*?)<\/div>\s*<div class="rankings-wishlist"/);
  assert.ok(block, 'rankings-actions block present');
  const html = block[1];
  const profile = html.indexOf('viewProfileCta');
  const follow = html.indexOf('followCta');
  const wishlist = html.indexOf('wishlistCta');
  const trade = html.indexOf('proposeTradeCta');
  assert.ok(profile >= 0 && follow >= 0 && wishlist >= 0 && trade >= 0);
  assert.ok(profile < follow, 'View profile comes before follow');
  assert.ok(follow < wishlist, 'Follow comes before wishlist');
  assert.ok(wishlist < trade, 'Wishlist comes before propose trade');
});

test('admin twitch reward modals use shared modal controllers only', async () => {
  const page = await read('docs/js/pages/admin-twitch-page.js');
  assert.match(page, /ruleModalController\.open/);
  assert.match(page, /testRuleModalController\.close/);
  assert.doesNotMatch(page, /\$\('ruleModal'\)\.classList\.(add|remove)\('hidden'\)/);
  assert.doesNotMatch(page, /\$\('testRuleModal'\)\.classList\.(add|remove)\('hidden'\)/);
  assert.match(page, /Revoked \/ Sync again/);
  assert.match(page, /Working \/ Online\$\{version\}/);
  assert.match(page, /\/admin\/events\/retry/);
  assert.match(page, /retry-event/);
});

test('rankings RPC migration exposes equipped avatar frames', async () => {
  const sql = await read('supabase/migrations/20260724160000_prestige_avatar_frames.sql');
  assert.match(sql, /collector_avatar_frames/);
  assert.match(sql, /'frame'/);
  assert.match(sql, /overlayImageUrl/);
});

test('shell iframe navigation avoids history-pushing src assignment', async () => {
  const shell = await read('docs/js/app-shell.js');
  assert.match(shell, /function setFrameLocation/);
  assert.match(shell, /location\.replace/);
  assert.match(shell, /setFrameLocation\(absolute\)/);
  assert.match(shell, /setFrameLocation\('about:blank'\)/);
  assert.doesNotMatch(shell, /if\(frame\)frame\.src='about:blank'/);
});

test('shell iframe load gates loading re-entry through shell-view-readiness', async () => {
  const shell = await read('docs/js/app-shell.js');
  assert.match(shell, /shouldReenterLoadingOnFrameLoad/);
  assert.match(shell, /shouldAcceptEmbeddedHandshake/);
  assert.match(shell, /daily:\{title:'Free Daily Starlight Pack',src:'daily-booster\.html'\}/);
  assert.match(shell, /from '\.\/shell-view-readiness\.js'/);
});
