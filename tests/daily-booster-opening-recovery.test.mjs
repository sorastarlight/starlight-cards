import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  clearPendingOpeningRequest,
  createOpeningRequestId,
  dailyOpeningRequestStorageKey,
  ensurePendingOpeningRequest,
  normalizeOpeningPayload,
  readPendingOpeningRequest,
  statusSupportsOpeningRecovery
} from '../docs/js/daily-booster-opening-request.js';
import {
  buildReplayResultCards,
  easternClaimDate,
  reconcileDailyRecoveryState,
  resolveLostClaimRecovery,
  writeDailyReceipt,
  readDailyReceipt,
  clearDailyReceipt
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
    },
    _store: store
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
    name: 'Rising Star',
    rarity: 'Common',
    quantity: 9,
    isDuplicate: true
  },
  {
    id: 's01-002',
    name: 'Second',
    rarity: 'Rare',
    quantity: 3,
    isDuplicate: true
  }
];

test('pending opening request UUID is owner-scoped and reused same day', () => {
  installStorage();
  const today = easternClaimDate();
  const first = ensurePendingOpeningRequest('user-a', { claimDate: today });
  assert.equal(first.written, true);
  assert.match(first.requestId, /^[0-9a-f-]{36}$/i);

  const second = ensurePendingOpeningRequest('user-a', { claimDate: today });
  assert.equal(second.reason, 'reused');
  assert.equal(second.requestId, first.requestId);

  const other = ensurePendingOpeningRequest('user-b', { claimDate: today });
  assert.notEqual(other.requestId, first.requestId);
  assert.equal(readPendingOpeningRequest('user-a').requestId, first.requestId);
  assert.equal(dailyOpeningRequestStorageKey('user-a').includes('user-a'), true);
});

test('account switch uses a different pending request key', () => {
  installStorage();
  ensurePendingOpeningRequest('user-a', { claimDate: '2026-10-14' });
  ensurePendingOpeningRequest('user-b', { claimDate: '2026-10-14' });
  assert.notEqual(
    readPendingOpeningRequest('user-a').requestId,
    readPendingOpeningRequest('user-b').requestId
  );
  clearPendingOpeningRequest('user-a');
  assert.equal(readPendingOpeningRequest('user-a'), null);
  assert.ok(readPendingOpeningRequest('user-b')?.requestId);
});

test('lost response: post-migration unlimited recovers via latestOpening without local receipt', () => {
  installStorage();
  const today = easternClaimDate();
  const status = {
    available: true,
    disabled: false,
    mode: 'unlimited',
    claimDate: today,
    cardsAwarded: [],
    recoverySupported: true,
    viewLatestLabel: 'View latest pack',
    latestOpening: {
      claimId: 42,
      requestId: '11111111-1111-4111-8111-111111111111',
      mode: 'unlimited',
      claimDate: today,
      claimedAt: '2026-10-14T12:00:00.000Z',
      cardsAwarded: sampleCards
    }
  };

  assert.equal(statusSupportsOpeningRecovery(status), true);
  const { recoverable, reconciled } = resolveLostClaimRecovery(status, {
    ownerId: 'user-a',
    todayClaimDate: today,
    epoch: { ownerId: 'user-a', generation: 1 }
  });
  assert.equal(recoverable, true);
  assert.equal(reconciled.kind, 'available');
  assert.equal(reconciled.source, 'server-latest');
  assert.equal(reconciled.viewActionKind, 'view-latest');
  assert.equal(reconciled.cards.length, 2);
  assert.equal(reconciled.showViewAction, true);
});

test('cleared storage pre-migration unlimited still cannot recover without latestOpening', () => {
  installStorage();
  const today = easternClaimDate();
  const cleared = reconcileDailyRecoveryState({
    status: {
      available: true,
      mode: 'unlimited',
      cardsAwarded: [],
      claimDate: today
    },
    receipt: null,
    ownerId: 'user-a',
    todayClaimDate: today
  });
  assert.equal(cleared.showViewAction, false);
  assert.equal(cleared.source, 'none');
  assert.equal(cleared.recoverySupported, false);
});

test('cleared-storage recovery uses server latestOpening when migration applied', () => {
  installStorage();
  clearDailyReceipt('user-a');
  const today = easternClaimDate();
  const reconciled = reconcileDailyRecoveryState({
    status: {
      available: true,
      mode: 'unlimited',
      cardsAwarded: [],
      claimDate: today,
      recoverySupported: true,
      latestOpening: {
        claimId: 7,
        requestId: createOpeningRequestId(),
        cards: sampleCards,
        claimedAt: '2026-10-14T15:00:00.000Z'
      },
      viewLatestLabel: 'View latest pack'
    },
    receipt: null,
    ownerId: 'user-a',
    todayClaimDate: today,
    epoch: { ownerId: 'user-a', generation: 2 }
  });
  assert.equal(reconciled.showViewAction, true);
  assert.equal(reconciled.viewActionKind, 'view-latest');
  assert.equal(reconciled.cards[0].id, 's01-001');
});

test('local pending receipt still preferred over latestOpening for interrupted reveal', () => {
  installStorage();
  const today = easternClaimDate();
  const pendingCards = [{ id: 'pending-1', name: 'Pending' }];
  writeDailyReceipt('user-a', {
    ownerId: 'user-a',
    claimDate: today,
    status: 'pending_reveal',
    cards: pendingCards,
    requestId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
  });
  const reconciled = reconcileDailyRecoveryState({
    status: {
      available: true,
      mode: 'unlimited',
      cardsAwarded: [],
      claimDate: today,
      recoverySupported: true,
      latestOpening: { cards: sampleCards, claimId: 99 }
    },
    receipt: readDailyReceipt('user-a'),
    ownerId: 'user-a',
    todayClaimDate: today
  });
  assert.equal(reconciled.source, 'local-receipt');
  assert.equal(reconciled.cards[0].id, 'pending-1');
  assert.equal(reconciled.viewActionKind, 'pending-receipt');
});

test('replay does not treat historical receipt quantities as live inventory', () => {
  const replay = buildReplayResultCards(sampleCards);
  for (const card of replay) {
    assert.equal(card.quantity, null);
    assert.equal(card.isDuplicate, false);
    assert.equal(card.resultPill, 'Already received');
  }
  const withLive = buildReplayResultCards(sampleCards, {
    currentQuantities: { 's01-001': 2, 's01-002': 1 }
  });
  assert.equal(withLive[0].quantity, 2);
  assert.equal(withLive[0].isDuplicate, true);
  assert.equal(withLive[1].quantity, 1);
  assert.equal(withLive[1].isDuplicate, false);
});

test('normalizeOpeningPayload rejects empty foreign-looking payloads', () => {
  assert.equal(normalizeOpeningPayload(null).found, false);
  assert.equal(normalizeOpeningPayload({ found: false }).found, false);
  assert.equal(
    normalizeOpeningPayload({ found: true, claimId: 1, cards: sampleCards }).found,
    true
  );
});

test('migration SQL enforces owner request uniqueness, daily partial unique, and anon revoke', async () => {
  const sql = await readFile(
    new URL('../supabase/migrations/20261014080000_daily_booster_opening_recovery.sql', import.meta.url),
    'utf8'
  );
  assert.match(sql, /daily_booster_claims_one_daily_per_day/);
  assert.match(sql, /daily_booster_claims_user_request_id/);
  assert.match(sql, /where mode = 'daily'/);
  assert.match(sql, /get_my_daily_booster_opening/);
  assert.match(sql, /idempotentReplay/);
  assert.match(sql, /order by claimed_at desc, id desc/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /create or replace function public\.open_daily_booster\(\)/);
  assert.match(sql, /revoke all on function public\.open_daily_booster\(\) from public, anon/);
  assert.match(sql, /revoke all on function public\.open_daily_booster\(uuid\) from public, anon/);
  assert.match(sql, /revoke all on function public\.get_my_daily_booster_opening/);
  assert.match(sql, /cannot be reconstructed|Historical unlimited/i);
  assert.match(sql, /Do NOT drop rows|do not restore the old/i);
  assert.match(sql, /Unlimited rows do not satisfy the daily unique index|cannot block a daily claim/i);
});

test('isolated DB suite covers concurrent/repeated, unlimited pair, daily limit, isolation, txn failure', async () => {
  const sql = await readFile(
    new URL('./sql/daily-booster-opening-recovery.sql', import.meta.url),
    'utf8'
  );
  assert.match(sql, /starlight_test\.run_opening_recovery_suite/);
  assert.match(sql, /DO NOT run against production/i);
  assert.match(sql, /starlight\.allow_opening_recovery_tests/);
  assert.match(sql, /cleanup_opening_recovery_suite/);
  assert.match(sql, /idempotentReplay/);
  assert.match(sql, /repeat does not grant again/);
  assert.match(sql, /second unlimited succeeds/);
  assert.match(sql, /alreadyClaimed/);
  assert.match(sql, /user B cannot read user A/);
  assert.match(sql, /forced draw failure/);
  assert.match(sql, /failed open leaves no claim row/);
  assert.match(sql, /daily status available despite same-day unlimited/);
  assert.match(sql, /cross-day replay/);
  assert.match(sql, /concurrency_same_request_session_a/);
  assert.match(sql, /assert_concurrency_same_request_outcome/);
  assert.match(sql, /must not inflate streak/);
});

test('uncertain timeout never counts as unsupported; definitive PGRST202 does', async () => {
  const { isUnsupportedRpcSignatureError } = await import(
    '../docs/js/daily-booster-rpc-errors.js'
  );

  assert.equal(
    isUnsupportedRpcSignatureError(
      { message: 'Timed out waiting for response', code: '408' },
      { functionName: 'open_daily_booster', argumentHint: 'requested_request_id' }
    ),
    false
  );
  assert.equal(
    isUnsupportedRpcSignatureError(
      { message: 'Failed to fetch', code: '' },
      { functionName: 'open_daily_booster', argumentHint: 'requested_request_id' }
    ),
    false
  );
  assert.equal(
    isUnsupportedRpcSignatureError(
      { message: '404', code: '404' },
      { functionName: 'open_daily_booster', argumentHint: 'requested_request_id' }
    ),
    false
  );
  assert.equal(
    isUnsupportedRpcSignatureError(
      {
        code: 'PGRST202',
        message:
          'Could not find the function public.open_daily_booster(requested_request_id) in the schema cache'
      },
      { functionName: 'open_daily_booster', argumentHint: 'requested_request_id' }
    ),
    true
  );
});

test('page open path persists request id helpers and never re-grants on view', async () => {
  const page = await readFile(
    new URL('../docs/js/pages/daily-booster-page.js', import.meta.url),
    'utf8'
  );
  const service = await readFile(
    new URL('../docs/js/daily-booster-service.js', import.meta.url),
    'utf8'
  );
  assert.match(page, /openDailyBooster\(\{\s*ownerId/);
  assert.match(page, /recoverOpeningByRequestId/);
  assert.match(page, /idempotentReplay/);
  assert.match(page, /View latest pack/);
  assert.match(service, /requested_request_id/);
  assert.match(service, /get_my_daily_booster_opening/);
  assert.match(service, /isUnsupportedRpcSignatureError/);
  assert.match(service, /_legacyOpen/);
  assert.match(service, /recoveryAttempt/);
  assert.doesNotMatch(
    page.slice(page.indexOf('async function viewTodayFlow'), page.indexOf('async function viewTodayFlow') + 1600),
    /forceNew:\s*true/
  );
});
