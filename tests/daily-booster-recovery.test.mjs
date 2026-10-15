import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildReplayResultCards,
  clearDailyReceipt,
  dailyReceiptStorageKey,
  easternClaimDate,
  normalizeDailyAwardCards,
  projectLocalQuantitiesAfterAward,
  readDailyReceipt,
  reconcileDailyRecoveryState,
  resolveLostClaimRecovery,
  resolvePostClaimStatusOutcome,
  shouldClearDisplayedResults,
  shouldPaintDailyResults,
  writeDailyReceipt
} from '../docs/js/daily-booster-receipt.js';

function mockLocalStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    }
  };
}

function installStorage(initial = {}) {
  const storage = mockLocalStorage(initial);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage
  });
  return storage;
}

const sampleCards = [
  {
    id: 's01-001',
    cardNumber: '001',
    name: 'Rising Star',
    rarity: 'Common',
    imageUrl: 'cards/s01-001.png',
    seriesName: 'Rising Star',
    quantity: 1,
    isDuplicate: false
  },
  {
    id: 's01-002',
    cardNumber: '002',
    name: 'Second',
    rarity: 'Rare',
    imageUrl: 'cards/s01-002.png',
    seriesName: 'Rising Star',
    quantity: 2,
    isDuplicate: true
  }
];

test('normalizeDailyAwardCards accepts open and status payload shapes', () => {
  assert.equal(normalizeDailyAwardCards(sampleCards).length, 2);
  assert.equal(normalizeDailyAwardCards({ cards: sampleCards }).length, 2);
  assert.equal(normalizeDailyAwardCards(JSON.stringify(sampleCards)).length, 2);
  assert.deepEqual(normalizeDailyAwardCards('{bad'), []);
  assert.deepEqual(normalizeDailyAwardCards([{ nope: true }]), []);
});

test('successful claim receipt supports pending reveal recovery without availability', () => {
  installStorage();
  const today = easternClaimDate();
  writeDailyReceipt('user-a', {
    ownerId: 'user-a',
    claimDate: today,
    status: 'pending_reveal',
    nextClaimAt: '2026-10-14T04:00:00.000Z',
    cards: sampleCards,
    generation: 3
  });

  const reconciled = reconcileDailyRecoveryState({
    status: {
      available: false,
      disabled: false,
      claimDate: today,
      nextClaimAt: '2026-10-14T04:00:00.000Z',
      cardsAwarded: sampleCards
    },
    receipt: readDailyReceipt('user-a'),
    ownerId: 'user-a',
    todayClaimDate: today,
    epoch: { ownerId: 'user-a', generation: 3 }
  });

  assert.equal(reconciled.kind, 'claimed');
  assert.equal(reconciled.available, false);
  assert.equal(reconciled.showViewAction, true);
  assert.equal(reconciled.source, 'server');
  assert.equal(reconciled.cards.length, 2);
});

test('lost-response recovery uses server cardsAwarded and never marks pack available', () => {
  installStorage();
  const today = easternClaimDate();
  const status = {
    available: false,
    disabled: false,
    claimDate: today,
    claimedAt: '2026-10-13T18:00:00.000Z',
    nextClaimAt: '2026-10-14T04:00:00.000Z',
    cardsAwarded: sampleCards
  };
  const { recoverable, reconciled } = resolveLostClaimRecovery(status, {
    ownerId: 'user-a',
    todayClaimDate: today,
    epoch: { ownerId: 'user-a', generation: 2 }
  });
  assert.equal(recoverable, true);
  assert.equal(reconciled.available, false);
  assert.equal(reconciled.showViewAction, true);
  assert.equal(reconciled.cards[0].id, 's01-001');
});

test('alreadyClaimed + first status failure requires status-only retry, then recovers', () => {
  installStorage();
  const today = easternClaimDate();
  const epoch = { ownerId: 'user-a', generation: 5 };

  const failed = resolvePostClaimStatusOutcome({
    status: null,
    error: new Error('status unavailable'),
    ownerId: 'user-a',
    todayClaimDate: today,
    epoch
  });
  assert.equal(failed.action, 'retry-status');
  assert.equal(failed.recoverable, false);

  const recovered = resolvePostClaimStatusOutcome({
    status: {
      available: false,
      disabled: false,
      claimDate: today,
      nextClaimAt: '2026-10-14T04:00:00.000Z',
      cardsAwarded: sampleCards
    },
    error: null,
    ownerId: 'user-a',
    todayClaimDate: today,
    epoch
  });
  assert.equal(recovered.action, 'show-recovery');
  assert.equal(recovered.recoverable, true);
  assert.equal(recovered.reconciled.available, false);
  assert.equal(recovered.reconciled.cards.length, 2);
});

test('stale-account epoch blocks recovery presentation for another owner', () => {
  installStorage();
  const today = easternClaimDate();
  const reconciled = reconcileDailyRecoveryState({
    status: {
      available: false,
      claimDate: today,
      cardsAwarded: sampleCards,
      nextClaimAt: '2026-10-14T04:00:00.000Z'
    },
    receipt: null,
    ownerId: 'user-b',
    todayClaimDate: today,
    epoch: { ownerId: 'user-a', generation: 4 }
  });
  assert.equal(reconciled.kind, 'stale-account');
  assert.equal(reconciled.showViewAction, false);
  assert.deepEqual(reconciled.cards, []);
});

test('corrupted local receipt is ignored in favor of server cards', () => {
  const storage = installStorage();
  const today = easternClaimDate();
  storage.setItem(dailyReceiptStorageKey('user-a'), '{not-json');
  const receipt = readDailyReceipt('user-a');
  assert.equal(receipt.corrupt, true);

  const reconciled = reconcileDailyRecoveryState({
    status: {
      available: false,
      claimDate: today,
      cardsAwarded: sampleCards,
      nextClaimAt: '2026-10-14T04:00:00.000Z'
    },
    receipt,
    ownerId: 'user-a',
    todayClaimDate: today
  });
  assert.equal(reconciled.kind, 'claimed');
  assert.equal(reconciled.source, 'server');
  assert.equal(reconciled.showViewAction, true);
  assert.equal(reconciled.cards.length, 2);
});

test('unlimited availability still surfaces pending local receipt for View without re-grant', () => {
  installStorage();
  const today = easternClaimDate();
  writeDailyReceipt('user-a', {
    ownerId: 'user-a',
    claimDate: today,
    status: 'pending_reveal',
    cards: sampleCards,
    generation: 2
  });

  const reconciled = reconcileDailyRecoveryState({
    status: {
      available: true,
      disabled: false,
      mode: 'unlimited',
      cardsAwarded: [],
      nextClaimAt: null
    },
    receipt: readDailyReceipt('user-a'),
    ownerId: 'user-a',
    todayClaimDate: today,
    epoch: { ownerId: 'user-a', generation: 2 }
  });

  assert.equal(reconciled.kind, 'available');
  assert.equal(reconciled.available, true);
  assert.equal(reconciled.showViewAction, true);
  assert.equal(reconciled.source, 'local-receipt');
  assert.equal(reconciled.cards.length, 2);
});

test('unlimited pre-migration cannot recover after cleared storage without latestOpening', () => {
  // Pre-migration / no recoverySupported: status stays available with empty cardsAwarded.
  // Post-migration recovery is covered in daily-booster-opening-recovery.test.mjs.
  installStorage();
  const today = easternClaimDate();

  const cleared = reconcileDailyRecoveryState({
    status: {
      available: true,
      disabled: false,
      mode: 'unlimited',
      cardsAwarded: [],
      claimDate: today,
      nextClaimAt: null
    },
    receipt: null,
    ownerId: 'user-a',
    todayClaimDate: today,
    epoch: { ownerId: 'user-a', generation: 1 }
  });
  assert.equal(cleared.kind, 'available');
  assert.equal(cleared.showViewAction, false);
  assert.equal(cleared.source, 'none');
  assert.deepEqual(cleared.cards, []);

  const lostClaim = resolveLostClaimRecovery(
    {
      available: true,
      disabled: false,
      mode: 'unlimited',
      cardsAwarded: [],
      claimDate: today
    },
    { ownerId: 'user-a', todayClaimDate: today, epoch: { ownerId: 'user-a', generation: 1 } }
  );
  assert.equal(lostClaim.recoverable, false);
  assert.equal(lostClaim.reconciled.source, 'none');
});

test('America/New_York midnight boundary discards yesterday receipt for today availability', () => {
  installStorage();
  writeDailyReceipt('user-a', {
    ownerId: 'user-a',
    claimDate: '2026-10-12',
    status: 'pending_reveal',
    cards: sampleCards,
    nextClaimAt: '2026-10-13T04:00:00.000Z',
    generation: 1
  });

  // After ET midnight, server says available for 2026-10-13.
  const reconciled = reconcileDailyRecoveryState({
    status: {
      available: true,
      disabled: false,
      claimDate: '2026-10-13',
      nextClaimAt: '2026-10-14T04:00:00.000Z',
      cardsAwarded: []
    },
    receipt: readDailyReceipt('user-a'),
    ownerId: 'user-a',
    todayClaimDate: '2026-10-13'
  });
  assert.equal(reconciled.kind, 'available');
  assert.equal(reconciled.available, true);
  assert.equal(reconciled.showViewAction, false);
  assert.deepEqual(reconciled.cards, []);
  assert.equal(shouldClearDisplayedResults(reconciled.kind), true);

  // Helper used by the page to drop yesterday's hint.
  const receipt = readDailyReceipt('user-a');
  assert.equal(receipt.claimDate, '2026-10-12');
  if (receipt.claimDate !== '2026-10-13') clearDailyReceipt('user-a');
  assert.equal(readDailyReceipt('user-a'), null);
});

test('easternClaimDate formats a stable YYYY-MM-DD in America/New_York', () => {
  // 2026-10-14T02:30:00Z is still 2026-10-13 in Eastern (EDT, UTC-4).
  const beforeMidnightEt = easternClaimDate(new Date('2026-10-14T02:30:00.000Z'));
  assert.equal(beforeMidnightEt, '2026-10-13');
  // 2026-10-14T04:00:00Z is 2026-10-14 00:00 Eastern.
  const atMidnightEt = easternClaimDate(new Date('2026-10-14T04:00:00.000Z'));
  assert.equal(atMidnightEt, '2026-10-14');
});

test('delayed account-A paint epochs cannot repaint after switch to B', () => {
  const paintA = { ownerId: 'user-a', generation: 2 };
  const currentB = { ownerId: 'user-b', generation: 3 };
  assert.equal(shouldPaintDailyResults(paintA, currentB), false);
  assert.equal(shouldPaintDailyResults(paintA, paintA), true);
  assert.equal(shouldPaintDailyResults(null, currentB), true);
});

test('replay display cards use already-received wording, not New Card!', () => {
  const replay = buildReplayResultCards(sampleCards);
  assert.equal(replay.length, 2);
  for (const card of replay) {
    assert.equal(card.resultPill, 'Already received');
    assert.equal(card.resultPillKind, 'replay');
    assert.notEqual(card.resultPill, 'New Card!');
    // Historical receipt quantities are not current inventory.
    assert.equal(card.quantity, null);
  }
});

test('repeated replay leaves local quantities unchanged, including payloads without quantity', () => {
  const before = { 's01-001': 4, 's01-003': 1 };
  const cardsWithoutQuantity = [
    { id: 's01-001', name: 'Rising Star' },
    { id: 's01-003', name: 'Third' }
  ];
  // Fresh-claim apply path would increment missing quantities.
  const afterFreshApply = projectLocalQuantitiesAfterAward(before, cardsWithoutQuantity);
  assert.equal(afterFreshApply['s01-001'], 5);
  assert.equal(afterFreshApply['s01-003'], 2);

  // Replay must skip applyAwardedCardsToLocalStore entirely.
  const afterReplay = { ...before };
  assert.deepEqual(afterReplay, before);
  assert.notDeepEqual(afterFreshApply, before);
});

test('page wiring: status retry, ownership clear, and replay never re-grant', async () => {
  const { readFile } = await import('node:fs/promises');
  const page = await readFile(
    new URL('../docs/js/pages/daily-booster-page.js', import.meta.url),
    'utf8'
  );
  const html = await readFile(
    new URL('../docs/daily-booster.html', import.meta.url),
    'utf8'
  );
  const economy = await readFile(
    new URL('../docs/js/shell-economy.js', import.meta.url),
    'utf8'
  );

  assert.match(html, /id="view-today-cards"/);
  assert.match(html, /id="retry-daily-status"/);
  assert.match(page, /retryStatusFlow/);
  assert.match(page, /showStatusRetry/);
  assert.match(page, /clearStalePresentation|clearRewardResults/);
  assert.match(page, /starlight-ownership-changed/);
  assert.match(economy, /notifyShellCollectionReconcile/);

  const ownershipHandler = page.slice(
    page.indexOf("window.addEventListener('starlight-ownership-changed'")
  );
  const handlerBody = ownershipHandler.slice(0, 280);
  assert.match(handlerBody, /clearStalePresentation|clearRewardResults/);
  const clearIdx = handlerBody.search(/clearStalePresentation|clearRewardResults/);
  const initIdx = handlerBody.indexOf('initialize(');
  assert.ok(clearIdx >= 0 && initIdx > clearIdx, 'ownership clear must run before initialize');

  const retryFn = page.slice(page.indexOf('async function retryStatusFlow'));
  assert.doesNotMatch(retryFn.slice(0, 1200), /openDailyBooster\(/);
  assert.match(retryFn, /getDailyBoosterStatus/);
  assert.match(retryFn, /resolvePostClaimStatusOutcome/);

  const viewFn = page.slice(page.indexOf('async function viewTodayFlow'));
  assert.doesNotMatch(viewFn.slice(0, 1400), /openDailyBooster\(/);
  assert.doesNotMatch(viewFn.slice(0, 1400), /applyAwardedCardsToLocalStore/);
  assert.doesNotMatch(viewFn.slice(0, 1400), /notifyShellEconomyChanged/);
  assert.match(viewFn, /mode:\s*['"]replay['"]/);
  assert.match(viewFn, /reconciled\.kind === 'claimed' \|\| reconciled\.showViewAction/);
  assert.match(page, /notifyShellCollectionReconcile/);
  assert.match(page, /presentationMode:\s*isReplay\s*\?\s*['"]replay['"]/);
  assert.match(page, /Already received/);

  const renderFn = page.slice(page.indexOf('function render('), page.indexOf('function setPackBusy'));
  assert.match(renderFn, /safeCardArtUrl/);
  assert.match(renderFn, /createElement\('img'\)/);
  assert.match(renderFn, /textContent = /);
  assert.doesNotMatch(renderFn, /innerHTML\s*=/);
  assert.match(html, /daily-booster-page\.js\?v=1\.7\.6/);
});
