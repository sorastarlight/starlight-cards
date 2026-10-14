import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACTIVE_COLLECTION_KEY,
  ACTIVE_FAVORITES_KEY,
  ACTIVE_QUANTITIES_KEY,
  GUEST_COLLECTION_KEY,
  GUEST_FAVORITES_KEY,
  accountCollectionKey,
  applyAwardedCardsToLocalStore,
  bindOwnershipToAuthUser,
  captureOwnershipEpoch,
  preserveGuestWorkspaceForImport,
  readLegacyGuestCollection,
  readOwnershipMeta,
  replaceActiveOwnershipSnapshot,
  setActiveOwnershipOwner
} from '../docs/js/collection-local-store.js';

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
    raw: store
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

function readJson(storage, key) {
  const raw = storage.getItem(key);
  return raw ? JSON.parse(raw) : {};
}

test('A → sign-out → B clears displayed ownership and never merges accounts', () => {
  const storage = installStorage({
    [ACTIVE_COLLECTION_KEY]: JSON.stringify({ 's01-001': true }),
    [ACTIVE_FAVORITES_KEY]: JSON.stringify({ 's01-001': true }),
    [ACTIVE_QUANTITIES_KEY]: JSON.stringify({ 's01-001': 3 })
  });

  // Guest cards archived when A signs in; not attributed to A automatically.
  const toA = bindOwnershipToAuthUser('user-a', { reason: 'signed-in' });
  assert.equal(toA.changed, true);
  assert.deepEqual(readJson(storage, GUEST_COLLECTION_KEY), { 's01-001': true });
  assert.deepEqual(readJson(storage, ACTIVE_COLLECTION_KEY), {});

  replaceActiveOwnershipSnapshot(
    {
      collected: { 's01-010': true },
      favorites: { 's01-010': true },
      quantities: { 's01-010': 1 }
    },
    {
      expectedOwnerId: 'user-a',
      expectedGeneration: toA.generation
    }
  );
  assert.equal(readJson(storage, ACTIVE_COLLECTION_KEY)['s01-010'], true);
  assert.equal(readJson(storage, accountCollectionKey('user-a'))['s01-010'], true);

  const signedOut = bindOwnershipToAuthUser(null, { reason: 'signed-out' });
  assert.equal(signedOut.changed, true);
  assert.deepEqual(readJson(storage, ACTIVE_COLLECTION_KEY), {});
  assert.deepEqual(readJson(storage, ACTIVE_FAVORITES_KEY), {});
  assert.deepEqual(readJson(storage, ACTIVE_QUANTITIES_KEY), {});
  // Guest archive still intact for explicit import.
  assert.equal(readJson(storage, GUEST_COLLECTION_KEY)['s01-001'], true);

  const toB = bindOwnershipToAuthUser('user-b', { reason: 'signed-in' });
  assert.equal(toB.changed, true);
  assert.deepEqual(readJson(storage, ACTIVE_COLLECTION_KEY), {});
  assert.equal(readJson(storage, ACTIVE_COLLECTION_KEY)['s01-010'], undefined);
  assert.equal(readJson(storage, accountCollectionKey('user-a'))['s01-010'], true);
});

test('delayed A awards are rejected after switching to B', () => {
  installStorage();
  const a = bindOwnershipToAuthUser('user-a', { reason: 'signed-in' });
  const epochA = { ownerId: 'user-a', generation: a.generation };

  replaceActiveOwnershipSnapshot(
    {
      collected: { 's01-010': true },
      favorites: {},
      quantities: { 's01-010': 1 }
    },
    { expectedOwnerId: 'user-a', expectedGeneration: a.generation }
  );

  bindOwnershipToAuthUser('user-b', { reason: 'account-switch' });
  const rejected = applyAwardedCardsToLocalStore(
    [{ id: 's01-099', quantity: 2 }],
    { epoch: epochA }
  );
  assert.equal(rejected.applied, false);
  assert.equal(rejected.reason, 'stale-epoch');
  assert.deepEqual(rejected.updatedCardIds, []);

  const storage = globalThis.localStorage;
  assert.equal(readJson(storage, ACTIVE_COLLECTION_KEY)['s01-099'], undefined);
  assert.equal(readJson(storage, accountCollectionKey('user-b'))['s01-099'], undefined);
});

test('stale cloud snapshot for A cannot replace B active ownership', () => {
  installStorage();
  const a = bindOwnershipToAuthUser('user-a', { reason: 'signed-in' });
  const epochA = captureOwnershipEpoch();
  assert.equal(epochA.ownerId, 'user-a');

  bindOwnershipToAuthUser('user-b', { reason: 'account-switch' });
  const stale = replaceActiveOwnershipSnapshot(
    {
      collected: { 's01-010': true },
      favorites: {},
      quantities: { 's01-010': 1 }
    },
    {
      expectedOwnerId: 'user-a',
      expectedGeneration: a.generation
    }
  );
  assert.equal(stale.applied, false);
  assert.equal(stale.reason, 'stale-epoch');
  assert.deepEqual(readJson(globalThis.localStorage, ACTIVE_COLLECTION_KEY), {});
});

test('legacy guest import archive is preserved and never auto-attributed on sign-in', () => {
  const storage = installStorage({
    [ACTIVE_COLLECTION_KEY]: JSON.stringify({ 's01-003': true, 's01-008': true }),
    [ACTIVE_FAVORITES_KEY]: JSON.stringify({ 's01-003': true }),
    [ACTIVE_QUANTITIES_KEY]: JSON.stringify({ 's01-003': 2 })
  });

  const preserved = preserveGuestWorkspaceForImport();
  assert.equal(preserved.preserved, true);
  assert.deepEqual(readJson(storage, GUEST_COLLECTION_KEY), {
    's01-003': true,
    's01-008': true
  });
  assert.deepEqual(readJson(storage, GUEST_FAVORITES_KEY), { 's01-003': true });

  // Second preserve does not overwrite archive.
  storage.setItem(ACTIVE_COLLECTION_KEY, JSON.stringify({ 's02-001': true }));
  const again = preserveGuestWorkspaceForImport();
  assert.equal(again.preserved, false);
  assert.equal(again.reason, 'archive-exists');
  assert.equal(readJson(storage, GUEST_COLLECTION_KEY)['s02-001'], undefined);

  bindOwnershipToAuthUser('user-a', { reason: 'signed-in' });
  // Active display cleared for account; guest archive remains for import UI.
  assert.deepEqual(readJson(storage, ACTIVE_COLLECTION_KEY), {});
  const legacy = readLegacyGuestCollection();
  assert.equal(legacy.exists, true);
  assert.deepEqual(legacy.cardIds, ['s01-003', 's01-008']);
  assert.equal(legacy.source, 'guest-archive');
});

test('signed-in active mirror is not treated as importable guest data', () => {
  installStorage();
  const a = bindOwnershipToAuthUser('user-a', { reason: 'signed-in' });
  replaceActiveOwnershipSnapshot(
    {
      collected: { 's01-010': true },
      favorites: {},
      quantities: { 's01-010': 1 }
    },
    { expectedOwnerId: 'user-a', expectedGeneration: a.generation }
  );

  const legacy = readLegacyGuestCollection();
  assert.equal(legacy.exists, false);
  assert.deepEqual(legacy.cardIds, []);
});

test('applyAwardedCardsToLocalStore still updates active keys for current epoch', () => {
  const storage = installStorage();
  const a = setActiveOwnershipOwner('user-a', { reason: 'test' });
  const result = applyAwardedCardsToLocalStore(
    [
      { id: 's01-002', quantity: 1 },
      { id: 's01-001', quantity: 7 }
    ],
    { epoch: { ownerId: 'user-a', generation: a.generation } }
  );

  assert.equal(result.applied, true);
  assert.deepEqual(result.updatedCardIds, ['s01-002', 's01-001']);
  assert.equal(readJson(storage, ACTIVE_COLLECTION_KEY)['s01-001'], true);
  assert.equal(readJson(storage, ACTIVE_QUANTITIES_KEY)['s01-001'], 7);
  assert.equal(readOwnershipMeta().ownerId, 'user-a');
});
