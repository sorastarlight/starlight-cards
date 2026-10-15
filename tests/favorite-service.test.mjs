import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { favoriteButtonLabel } from '../docs/js/favorite-utils.js';

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('favoriteButtonLabel covers idle, saving, and retry states', () => {
  assert.equal(favoriteButtonLabel('Dawn Spark', false), 'Add Dawn Spark to favorites');
  assert.equal(favoriteButtonLabel('Dawn Spark', true), 'Remove Dawn Spark from favorites');
  assert.match(favoriteButtonLabel('Dawn Spark', false, { saving: true }), /Saving favorite/);
  assert.match(favoriteButtonLabel('Dawn Spark', true, { error: true }), /Retry favorite/);
});

test('favorite service guards ownership epochs and uses set_card_favorite', async () => {
  const source = await read('docs/js/favorite-service.js');
  assert.match(source, /set_card_favorite/);
  assert.match(source, /ownershipEpochMatches/);
  assert.match(source, /stale-epoch-after-rpc/);
  assert.match(source, /ACTIVE_FAVORITES_KEY/);
  assert.match(source, /from\('user_cards'\)/);
  assert.doesNotMatch(source, /open_daily_booster|grant_cards|insert\(|upsert\(/);
  assert.match(source, /Inventory is never modified/);
});

test('reveal results wire per-card favorites through the favorite service', async () => {
  const [reveal, css] = await Promise.all([
    read('docs/js/reward-reveal.js'),
    read('docs/css/reward-reveal.css')
  ]);
  assert.match(reveal, /import\('\.\/favorite-service\.js'\)/);
  assert.match(reveal, /favoriteButtonLabel/);
  assert.match(reveal, /st-r3-result-favorite/);
  assert.match(reveal, /hydrateResultFavorites/);
  assert.match(reveal, /fetchFavoriteStates/);
  assert.match(reveal, /setCardFavorite/);
  assert.match(reveal, /stale-epoch-after-rpc/);
  assert.match(reveal, /Always hydrate from the authenticated favorite service/);
  assert.match(css, /\.st-r3-result-favorite:focus-visible/);
  assert.match(css, /\.st-r3-result-favorite\.is-error/);
});
