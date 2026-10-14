import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCardSearchHaystack,
  buildTradeSearchHaystack,
  cardDisplayNumber,
  filterCardList,
  formatBinderOwnedPill,
  formatSetProgressExplanation,
  resolveBinderBrowseList
} from '../docs/js/card-filter-utils.js';

const catalog = [
  {
    id: 'a1',
    number: '001',
    collectorNumber: 'RS-001',
    name: 'Rising Spark',
    series: 'Rising Star',
    rarity: 'Common',
    cardDescription: 'A bright start',
    artist: 'Sora'
  },
  {
    id: 'b2',
    number: '002',
    collectorNumber: 'S2-014',
    name: 'Moonlit Stage',
    series: 'Series II',
    rarity: 'Rare',
    cardDescription: 'Night performance',
    artist: 'Luna'
  },
  {
    id: 'c3',
    number: '003',
    collectorNumber: 'RS-003',
    name: 'Star Bit Glow',
    series: 'Rising Star',
    rarity: 'Epic',
    cardDescription: 'Currency sparkle',
    artist: 'Sora'
  }
];

test('buildCardSearchHaystack includes collector numbers', () => {
  const haystack = buildCardSearchHaystack(catalog[1]);
  assert.match(haystack, /s2-014/);
  assert.match(haystack, /moonlit stage/);
});

test('filterCardList matches collector number queries', () => {
  const list = filterCardList(catalog, { q: 'rs-003', series: 'All Series', rarity: 'All Rarities', view: 'all' }, {
    respectOwnership: false
  });
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'c3');
});

test('resolveBinderBrowseList shows full gallery for All Series without query', () => {
  const browse = resolveBinderBrowseList(catalog, {
    q: '',
    series: 'All Series',
    rarity: 'All Rarities',
    view: 'all'
  }, { isCollected: () => false });
  assert.equal(browse.showLanding, false);
  assert.equal(browse.list.length, 3);
  assert.equal(browse.poolSize, 3);
  assert.equal(browse.heading, 'Card Gallery');
  assert.match(browse.summary, /Showing 3 of 3 cards/);
  assert.doesNotMatch(browse.summary, /collected/);
});

test('resolveBinderBrowseList searches the full catalog when All Series + query', () => {
  const browse = resolveBinderBrowseList(catalog, {
    q: 'moon',
    series: 'All Series',
    rarity: 'All Rarities',
    view: 'all'
  });
  assert.equal(browse.showLanding, false);
  assert.equal(browse.heading, 'Search results');
  assert.equal(browse.list.length, 1);
  assert.equal(browse.list[0].id, 'b2');
  assert.match(browse.summary, /1 of 3/);
});

test('resolveBinderBrowseList keeps series-scoped search when a series is selected', () => {
  const browse = resolveBinderBrowseList(catalog, {
    q: 'star',
    series: 'Rising Star',
    rarity: 'All Rarities',
    view: 'all'
  });
  assert.equal(browse.showLanding, false);
  assert.equal(browse.heading, 'Rising Star');
  assert.equal(browse.list.length, 2);
  assert.ok(browse.list.every(card => card.series === 'Rising Star'));
});

test('filterCardList respects collected / missing ownership views', () => {
  const owned = new Set(['a1', 'c3']);
  const collected = filterCardList(catalog, {
    q: '',
    series: 'All Series',
    rarity: 'All Rarities',
    view: 'collected'
  }, {
    respectOwnership: true,
    isCollected: id => owned.has(id)
  });
  const missing = filterCardList(catalog, {
    q: '',
    series: 'All Series',
    rarity: 'All Rarities',
    view: 'missing'
  }, {
    respectOwnership: true,
    isCollected: id => owned.has(id)
  });
  assert.deepEqual(collected.map(card => card.id), ['a1', 'c3']);
  assert.deepEqual(missing.map(card => card.id), ['b2']);
});

test('filterCardList supports favorites-only gallery filtering', () => {
  const favorites = new Set(['a1']);
  const list = filterCardList(catalog, {
    q: '',
    series: 'All Series',
    rarity: 'All Rarities',
    view: 'all',
    favoritesOnly: true
  }, {
    respectOwnership: true,
    isCollected: () => true,
    isFavorite: id => favorites.has(id)
  });
  assert.deepEqual(list.map(card => card.id), ['a1']);
});

test('cardDisplayNumber prefers collector numbers', () => {
  assert.equal(cardDisplayNumber({ number: '001', collectorNumber: 'RS-001' }), 'RS-001');
  assert.equal(cardDisplayNumber({ number: '002' }), '002');
});

test('formatBinderOwnedPill stays honest for missing view', () => {
  assert.equal(formatBinderOwnedPill({ shown: 5, owned: 0, view: 'missing' }), 'Showing 5 not collected');
  assert.equal(formatBinderOwnedPill({ shown: 12, owned: 8, view: 'all' }), 'Collected: 8 / 12');
  assert.equal(formatBinderOwnedPill({ shown: 4, owned: 4, view: 'collected' }), 'Collected in view: 4');
  assert.equal(formatBinderOwnedPill({ shown: 3, owned: 3, view: 'duplicates' }), 'Duplicates in view: 3');
});

test('resolveBinderBrowseList explains set collection progress', () => {
  const browse = resolveBinderBrowseList(catalog, {
    q: '',
    series: 'Rising Star',
    rarity: 'All Rarities',
    view: 'all'
  }, { isCollected: id => id === 'a1' });
  assert.match(browse.summary, /1 of 2 collected in this set/);
});

test('formatSetProgressExplanation protects one copy when describing duplicates', () => {
  const text = formatSetProgressExplanation({
    series: 'Rising Star',
    owned: 2,
    total: 3,
    duplicateCards: 1,
    exchangeableCopies: 2
  });
  assert.match(text, /2 of 3 cards in Rising Star/);
  assert.match(text, /1 still missing/);
  assert.match(text, /2 exchangeable copies/);
  assert.match(text, /one copy stays in your collection/);
});

test('buildTradeSearchHaystack includes collector numbers', () => {
  const haystack = buildTradeSearchHaystack({
    cardNumber: '014',
    collectorNumber: 'S2-014',
    name: 'Moonlit Stage',
    rarity: 'Rare',
    seriesName: 'Series II'
  });
  assert.match(haystack, /s2-014/);
  assert.match(haystack, /moonlit stage/);
});
