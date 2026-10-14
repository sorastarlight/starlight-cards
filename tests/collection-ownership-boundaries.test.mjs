import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACTIVE_COLLECTION_KEY,
  ACTIVE_FAVORITES_KEY,
  GUEST_COLLECTION_KEY,
  applyAwardedCardsToLocalStore,
  bindOwnershipToAuthUser,
  guestArchiveKeyPresent,
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

function readJson(storage, key) {
  const raw = storage.getItem(key);
  return raw ? JSON.parse(raw) : {};
}

test('stale document cannot rebind a superseded previous account', () => {
  installStorage();
  const a = bindOwnershipToAuthUser('user-a', { reason: 'signed-in' });
  const staleCallerGeneration = a.generation;

  const b = bindOwnershipToAuthUser('user-b', { reason: 'account-switch' });
  assert.equal(b.changed, true);
  assert.equal(readOwnershipMeta().ownerId, 'user-b');

  const rejected = bindOwnershipToAuthUser('user-a', {
    reason: 'stale-iframe',
    notBeforeGeneration: staleCallerGeneration
  });
  assert.equal(rejected.changed, false);
  assert.equal(rejected.reason, 'superseded');
  assert.equal(readOwnershipMeta().ownerId, 'user-b');
  assert.equal(readOwnershipMeta().generation, b.generation);
});

test('malformed guest archive is never overwritten or merged into an account', () => {
  const storage = installStorage({
    [GUEST_COLLECTION_KEY]: '{not-json',
    [ACTIVE_COLLECTION_KEY]: JSON.stringify({ 's01-001': true })
  });

  assert.equal(guestArchiveKeyPresent(), true);
  const preserved = preserveGuestWorkspaceForImport();
  assert.equal(preserved.preserved, false);
  assert.equal(preserved.reason, 'archive-exists');
  assert.equal(storage.getItem(GUEST_COLLECTION_KEY), '{not-json');

  const legacy = readLegacyGuestCollection();
  assert.equal(legacy.exists, true);
  assert.equal(legacy.source, 'guest-archive');
  assert.match(String(legacy.error || ''), /could not be read/i);
  assert.deepEqual(legacy.cardIds, []);

  bindOwnershipToAuthUser('user-a', { reason: 'signed-in' });
  assert.equal(storage.getItem(GUEST_COLLECTION_KEY), '{not-json');
  assert.deepEqual(readJson(storage, ACTIVE_COLLECTION_KEY), {});
});

test('repeated sign-in/out keeps the original guest archive bytes', () => {
  const storage = installStorage({
    [ACTIVE_COLLECTION_KEY]: JSON.stringify({ 's01-003': true }),
    [ACTIVE_FAVORITES_KEY]: JSON.stringify({ 's01-003': true })
  });

  bindOwnershipToAuthUser('user-a', { reason: 'signed-in' });
  const archiveAfterFirst = storage.getItem(GUEST_COLLECTION_KEY);
  assert.ok(archiveAfterFirst);
  assert.equal(JSON.parse(archiveAfterFirst)['s01-003'], true);

  bindOwnershipToAuthUser(null, { reason: 'signed-out' });
  bindOwnershipToAuthUser('user-b', { reason: 'signed-in' });
  bindOwnershipToAuthUser(null, { reason: 'signed-out' });
  bindOwnershipToAuthUser('user-a', { reason: 'signed-in' });

  assert.equal(storage.getItem(GUEST_COLLECTION_KEY), archiveAfterFirst);
  const legacy = readLegacyGuestCollection();
  assert.deepEqual(legacy.cardIds, ['s01-003']);
});

test('epoch rejection does not mutate local state (server award recovery is display-only)', () => {
  const storage = installStorage();
  const a = setActiveOwnershipOwner('user-a', { reason: 'test' });
  replaceActiveOwnershipSnapshot(
    {
      collected: { 's01-010': true },
      favorites: {},
      quantities: { 's01-010': 1 }
    },
    { expectedOwnerId: 'user-a', expectedGeneration: a.generation }
  );

  const before = storage.getItem(ACTIVE_COLLECTION_KEY);
  setActiveOwnershipOwner('user-b', { reason: 'switch' });
  const rejected = applyAwardedCardsToLocalStore(
    [{ id: 's01-099', quantity: 4 }],
    { epoch: { ownerId: 'user-a', generation: a.generation } }
  );

  assert.equal(rejected.applied, false);
  assert.equal(rejected.reason, 'stale-epoch');
  // Active belongs to B and stays empty — rejection did not write A's award.
  assert.deepEqual(readJson(storage, ACTIVE_COLLECTION_KEY), {});
  // A's scoped mirror still has only the earlier snapshot, not the rejected award.
  assert.equal(
    readJson(storage, `${ACTIVE_COLLECTION_KEY}:user:user-a`)['s01-099'],
    undefined
  );
  assert.equal(
    readJson(storage, `${ACTIVE_COLLECTION_KEY}:user:user-a`)['s01-010'],
    true
  );
  assert.notEqual(before, null);
});

test('shell/iframe generation guard: same-generation same-owner bind is a no-op', () => {
  installStorage();
  const a = bindOwnershipToAuthUser('user-a', { reason: 'shell-signed-in' });
  const again = bindOwnershipToAuthUser('user-a', {
    reason: 'iframe-signed-in',
    notBeforeGeneration: a.generation
  });
  assert.equal(again.changed, false);
  assert.equal(readOwnershipMeta().generation, a.generation);
  assert.equal(readOwnershipMeta().ownerId, 'user-a');
});
