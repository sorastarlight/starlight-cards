import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = relativePath => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('shop catalog still loads when Star Bits preview fails for signed-out collectors', async () => {
  const page = await read('docs/js/pages/booster-shop-page.js');
  assert.match(page, /if\(boosterError\)throw boosterError;if\(slotError\)throw slotError;/);
  assert.doesNotMatch(page, /if\(previewError\)throw previewError/);
  assert.match(page, /Star Bits preview requires auth; skip the RPC for guests/);
  assert.match(page, /if\(currentUser\)\{[\s\S]*getStarBitsExchangePreview\(\)/);
  assert.match(page, /friendlyWalletMessage/);
  assert.match(page, /Browse the shop, then sign in to open packs/);
  assert.match(page, /Sign in to Open/);
  assert.match(page, /if\(previewError\)\{[\s\S]*say\(/);
});
