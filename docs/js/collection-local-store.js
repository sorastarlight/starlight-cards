/**
 * Account-isolated local ownership cache.
 *
 * Active keys (read by app.js):
 *   sora-starlight-card-binder-v5-collected|favorites|v80-quantities
 *
 * Guest archive (explicit import only — never auto-merged into an account):
 *   …-guest-collected|favorites|quantities
 *
 * Per-account mirrors (optional warm cache; cloud remains authoritative):
 *   …-collected:user:<id> (and favorites/quantities variants)
 */

export const ACTIVE_COLLECTION_KEY =
  'sora-starlight-card-binder-v5-collected';
export const ACTIVE_FAVORITES_KEY =
  'sora-starlight-card-binder-v5-favorites';
export const ACTIVE_QUANTITIES_KEY =
  'sora-starlight-card-binder-v80-quantities';

export const GUEST_COLLECTION_KEY =
  'sora-starlight-card-binder-v5-guest-collected';
export const GUEST_FAVORITES_KEY =
  'sora-starlight-card-binder-v5-guest-favorites';
export const GUEST_QUANTITIES_KEY =
  'sora-starlight-card-binder-v80-guest-quantities';

export const OWNERSHIP_META_KEY =
  'sora-starlight-ownership-active-v1';

/** @deprecated Use ACTIVE_COLLECTION_KEY — kept for older imports/tests. */
export const LOCAL_COLLECTION_KEY = ACTIVE_COLLECTION_KEY;
/** @deprecated Use ACTIVE_QUANTITIES_KEY */
export const LOCAL_QUANTITIES_KEY = ACTIVE_QUANTITIES_KEY;

const OWNERSHIP_CHANGED_EVENT = 'starlight-ownership-changed';
const BROADCAST_CHANNEL_NAME = 'starlight-ownership-v1';

function getStorage() {
  return globalThis.localStorage ?? null;
}

function readLocalStoreObject(key) {
  try {
    const storage = getStorage();
    if (!storage) return {};
    const rawValue = storage.getItem(key);
    if (!rawValue) return {};
    const parsedValue = JSON.parse(rawValue);
    if (
      !parsedValue ||
      typeof parsedValue !== 'object' ||
      Array.isArray(parsedValue)
    ) {
      return {};
    }
    return parsedValue;
  } catch (error) {
    console.error(`[Starlight] Unable to read ${key}:`, error);
    return {};
  }
}

function writeLocalStoreObject(key, value) {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(key, JSON.stringify(value ?? {}));
}

function removeLocalStoreKey(key) {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(key);
}

function objectHasEntries(value) {
  return Boolean(value && typeof value === 'object' && Object.keys(value).length);
}

function normalizeOwnerId(ownerId) {
  if (ownerId == null || ownerId === '') return null;
  return String(ownerId);
}

export function accountCollectionKey(ownerId) {
  return `${ACTIVE_COLLECTION_KEY}:user:${normalizeOwnerId(ownerId)}`;
}

export function accountFavoritesKey(ownerId) {
  return `${ACTIVE_FAVORITES_KEY}:user:${normalizeOwnerId(ownerId)}`;
}

export function accountQuantitiesKey(ownerId) {
  return `${ACTIVE_QUANTITIES_KEY}:user:${normalizeOwnerId(ownerId)}`;
}

export function readOwnershipMeta() {
  const raw = readLocalStoreObject(OWNERSHIP_META_KEY);
  const ownerId = normalizeOwnerId(raw.ownerId);
  const generation = Number(raw.generation);
  return {
    ownerId,
    generation: Number.isFinite(generation) && generation > 0 ? generation : 0
  };
}

function writeOwnershipMeta(meta) {
  writeLocalStoreObject(OWNERSHIP_META_KEY, {
    ownerId: meta.ownerId,
    generation: meta.generation,
    updatedAt: new Date().toISOString()
  });
}

export function captureOwnershipEpoch() {
  return readOwnershipMeta();
}

export function ownershipEpochMatches(expected) {
  if (!expected) return false;
  const current = readOwnershipMeta();
  return (
    current.ownerId === normalizeOwnerId(expected.ownerId) &&
    current.generation === Number(expected.generation)
  );
}

function clearActiveOwnershipKeys() {
  writeLocalStoreObject(ACTIVE_COLLECTION_KEY, {});
  writeLocalStoreObject(ACTIVE_FAVORITES_KEY, {});
  writeLocalStoreObject(ACTIVE_QUANTITIES_KEY, {});
}

function readActiveSnapshot() {
  return {
    collected: readLocalStoreObject(ACTIVE_COLLECTION_KEY),
    favorites: readLocalStoreObject(ACTIVE_FAVORITES_KEY),
    quantities: readLocalStoreObject(ACTIVE_QUANTITIES_KEY)
  };
}

function writeActiveSnapshot({ collected = {}, favorites = {}, quantities = {} } = {}) {
  writeLocalStoreObject(ACTIVE_COLLECTION_KEY, collected);
  writeLocalStoreObject(ACTIVE_FAVORITES_KEY, favorites);
  writeLocalStoreObject(ACTIVE_QUANTITIES_KEY, quantities);
}

function persistActiveToAccountScope(ownerId) {
  const id = normalizeOwnerId(ownerId);
  if (!id) return;
  const snapshot = readActiveSnapshot();
  writeLocalStoreObject(accountCollectionKey(id), snapshot.collected);
  writeLocalStoreObject(accountFavoritesKey(id), snapshot.favorites);
  writeLocalStoreObject(accountQuantitiesKey(id), snapshot.quantities);
}

function hydrateActiveFromAccountScope(ownerId) {
  const id = normalizeOwnerId(ownerId);
  if (!id) {
    clearActiveOwnershipKeys();
    return;
  }
  writeActiveSnapshot({
    collected: readLocalStoreObject(accountCollectionKey(id)),
    favorites: readLocalStoreObject(accountFavoritesKey(id)),
    quantities: readLocalStoreObject(accountQuantitiesKey(id))
  });
}

/** True when a guest-archive key exists, even if JSON is malformed. */
export function guestArchiveKeyPresent() {
  const storage = getStorage();
  if (!storage) return false;
  const raw = storage.getItem(GUEST_COLLECTION_KEY);
  return raw != null && String(raw).trim() !== '';
}

/**
 * Copies the guest workspace into the import archive once.
 * Never copies account-mirrored active data into the guest archive.
 * Never merges guest data into an account store.
 * Never overwrites an existing archive key (including malformed values).
 */
export function preserveGuestWorkspaceForImport() {
  const meta = readOwnershipMeta();
  if (meta.ownerId != null) {
    return { preserved: false, reason: 'active-is-account' };
  }

  // Preserve original guest bytes: any existing key blocks overwrite.
  if (guestArchiveKeyPresent()) {
    return { preserved: false, reason: 'archive-exists' };
  }

  const snapshot = readActiveSnapshot();
  if (
    !objectHasEntries(snapshot.collected) &&
    !objectHasEntries(snapshot.favorites) &&
    !objectHasEntries(snapshot.quantities)
  ) {
    return { preserved: false, reason: 'empty' };
  }

  writeLocalStoreObject(GUEST_COLLECTION_KEY, snapshot.collected);
  writeLocalStoreObject(GUEST_FAVORITES_KEY, snapshot.favorites);
  writeLocalStoreObject(GUEST_QUANTITIES_KEY, snapshot.quantities);
  return { preserved: true, reason: 'archived' };
}

function notifyOwnershipChanged(detail) {
  try {
    globalThis.dispatchEvent?.(
      new CustomEvent(OWNERSHIP_CHANGED_EVENT, { detail })
    );
  } catch {
    /* non-DOM test environments */
  }

  try {
    if (typeof BroadcastChannel === 'function') {
      const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      channel.postMessage({ type: OWNERSHIP_CHANGED_EVENT, ...detail });
      channel.close();
    }
  } catch {
    /* BroadcastChannel unavailable */
  }
}

/**
 * Switches the active ownership context. Clears displayed ownership
 * immediately so the previous account cannot linger in the UI.
 *
 * Options:
 * - force: rehydrate account scope even when owner is unchanged
 * - notBeforeGeneration: reject if meta already advanced past this
 *   (blocks stale iframe/shell callers from rebinding an older account)
 * - allowGuestArchive: when true (default), guest→account archives guest data.
 *   Transient auth failures must never call bind(null) while an account
 *   mirror is active — use confirmedSignOut paths only.
 */
export function setActiveOwnershipOwner(nextOwnerId, options = {}) {
  const nextId = normalizeOwnerId(nextOwnerId);
  const previous = readOwnershipMeta();
  const reason = options.reason || 'manual';

  // Stale document/async completion: a newer ownership transition already won.
  if (
    options.notBeforeGeneration != null &&
    previous.generation > Number(options.notBeforeGeneration) &&
    previous.ownerId !== nextId
  ) {
    return {
      changed: false,
      ownerId: previous.ownerId,
      generation: previous.generation,
      reason: 'superseded'
    };
  }

  if (previous.ownerId === nextId) {
    // First binder open as guest: stamp a generation without clearing local cards.
    if (previous.generation === 0) {
      writeOwnershipMeta({ ownerId: nextId, generation: 1 });
      return {
        changed: false,
        ownerId: nextId,
        generation: 1,
        reason: 'initialized'
      };
    }
    if (!options.force) {
      return {
        changed: false,
        ownerId: nextId,
        generation: previous.generation,
        reason
      };
    }
    // force + same signed-out owner must never wipe the guest workspace.
    if (nextId == null) {
      return {
        changed: false,
        ownerId: null,
        generation: previous.generation,
        reason
      };
    }
  }

  if (previous.ownerId == null && nextId != null && options.allowGuestArchive !== false) {
    preserveGuestWorkspaceForImport();
  }

  if (previous.ownerId != null && previous.ownerId !== nextId) {
    persistActiveToAccountScope(previous.ownerId);
  }

  clearActiveOwnershipKeys();

  const generation = previous.generation + 1;
  writeOwnershipMeta({ ownerId: nextId, generation });

  if (nextId != null) {
    hydrateActiveFromAccountScope(nextId);
  }

  const result = {
    changed: true,
    ownerId: nextId,
    previousOwnerId: previous.ownerId,
    generation,
    reason
  };
  notifyOwnershipChanged(result);
  return result;
}

/**
 * Aligns local ownership with the auth user from session resolution.
 * Pass null only for confirmed sign-out / confirmed missing session.
 * Do not pass null for transient getUser/network failures.
 */
export function bindOwnershipToAuthUser(userOrId, options = {}) {
  const nextId =
    userOrId && typeof userOrId === 'object'
      ? normalizeOwnerId(userOrId.id)
      : normalizeOwnerId(userOrId);
  return setActiveOwnershipOwner(nextId, {
    reason: options.reason || 'auth',
    force: options.force,
    notBeforeGeneration: options.notBeforeGeneration,
    allowGuestArchive: options.allowGuestArchive
  });
}

/**
 * Replaces the active ownership mirror after a cloud fetch.
 * Rejects stale completions when the account generation changed.
 */
export function replaceActiveOwnershipSnapshot(
  snapshot,
  { expectedOwnerId, expectedGeneration } = {}
) {
  const expected = {
    ownerId: normalizeOwnerId(expectedOwnerId),
    generation: Number(expectedGeneration)
  };

  if (!ownershipEpochMatches(expected)) {
    return { applied: false, reason: 'stale-epoch' };
  }

  if (expected.ownerId == null) {
    return { applied: false, reason: 'guest-cloud-forbidden' };
  }

  const collected = snapshot?.collected || {};
  const favorites = snapshot?.favorites || {};
  const quantities = snapshot?.quantities || {};

  writeActiveSnapshot({ collected, favorites, quantities });
  persistActiveToAccountScope(expected.ownerId);

  return { applied: true, reason: 'ok' };
}

/**
 * Reads guest/legacy cards eligible for explicit import.
 * Prefers the guest archive; falls back to active keys only while unsigned.
 * Malformed archive keys are reported without falling through to account mirrors.
 */
export function readLegacyGuestCollection() {
  const storage = getStorage();
  const archiveRaw = storage?.getItem(GUEST_COLLECTION_KEY);
  const meta = readOwnershipMeta();

  if (archiveRaw != null && String(archiveRaw).trim() !== '') {
    try {
      const parsedValue = JSON.parse(archiveRaw);
      if (
        !parsedValue ||
        typeof parsedValue !== 'object' ||
        Array.isArray(parsedValue)
      ) {
        return {
          exists: true,
          cardIds: [],
          rawValue: archiveRaw,
          source: 'guest-archive',
          error: 'The browser collection exists, but it could not be read.'
        };
      }
      const cardIds = Object.entries(parsedValue)
        .filter(([, isCollected]) => isCollected === true)
        .map(([cardId]) => String(cardId).trim())
        .filter(Boolean)
        .filter((cardId, index, all) => all.indexOf(cardId) === index)
        .sort();
      return {
        exists: true,
        cardIds,
        rawValue: archiveRaw,
        source: 'guest-archive'
      };
    } catch {
      return {
        exists: true,
        cardIds: [],
        rawValue: archiveRaw,
        source: 'guest-archive',
        error: 'The browser collection exists, but it could not be read.'
      };
    }
  }

  if (meta.ownerId != null) {
    return {
      exists: false,
      cardIds: [],
      rawValue: null,
      source: 'none'
    };
  }

  const parsedValue = readLocalStoreObject(ACTIVE_COLLECTION_KEY);
  const rawValue = storage?.getItem(ACTIVE_COLLECTION_KEY);
  if (!objectHasEntries(parsedValue) && !rawValue) {
    return { exists: false, cardIds: [], rawValue: null, source: 'none' };
  }

  const cardIds = Object.entries(parsedValue)
    .filter(([, isCollected]) => isCollected === true)
    .map(([cardId]) => String(cardId).trim())
    .filter(Boolean)
    .filter((cardId, index, all) => all.indexOf(cardId) === index)
    .sort();

  return {
    exists: true,
    cardIds,
    rawValue: rawValue ?? JSON.stringify(parsedValue),
    source: 'active-guest'
  };
}

function awardedCardId(card = {}) {
  return String(card?.id ?? card?.cardId ?? card?.card_id ?? '').trim();
}

/**
 * Mirrors freshly awarded cards into the active browser stores used by app.js
 * without waiting for a full cloud resync.
 *
 * Pass expectedOwnerId / expectedGeneration (or an epoch object) when the
 * awards were requested for a specific account so delayed responses cannot
 * land on a later account.
 */
export function applyAwardedCardsToLocalStore(awardedCards = [], options = {}) {
  if (!Array.isArray(awardedCards) || awardedCards.length === 0) {
    return { updatedCardIds: [], applied: false, reason: 'empty' };
  }

  const expectedOwnerId = normalizeOwnerId(
    options.expectedOwnerId ?? options.ownerId ?? options.epoch?.ownerId
  );
  const expectedGeneration = Number(
    options.expectedGeneration ?? options.generation ?? options.epoch?.generation
  );

  if (
    options.epoch ||
    options.expectedOwnerId != null ||
    options.expectedGeneration != null ||
    options.ownerId != null ||
    options.generation != null
  ) {
    if (
      !ownershipEpochMatches({
        ownerId: expectedOwnerId,
        generation: expectedGeneration
      })
    ) {
      return { updatedCardIds: [], applied: false, reason: 'stale-epoch' };
    }
  }

  const collected = readLocalStoreObject(ACTIVE_COLLECTION_KEY);
  const quantities = readLocalStoreObject(ACTIVE_QUANTITIES_KEY);
  const increments = new Map();
  const updatedCardIds = [];

  for (const card of awardedCards) {
    const cardId = awardedCardId(card);
    if (!cardId) continue;

    collected[cardId] = true;

    const quantityFromApi = Number(card?.quantity);
    if (Number.isFinite(quantityFromApi) && quantityFromApi > 0) {
      quantities[cardId] = Math.max(1, quantityFromApi);
    } else {
      increments.set(cardId, (increments.get(cardId) || 0) + 1);
    }

    if (!updatedCardIds.includes(cardId)) {
      updatedCardIds.push(cardId);
    }
  }

  for (const [cardId, delta] of increments.entries()) {
    quantities[cardId] = Math.max(1, Number(quantities[cardId] || 0) + delta);
  }

  // Re-check after mutation prep in case another tab switched mid-loop.
  if (
    options.epoch ||
    options.expectedOwnerId != null ||
    options.expectedGeneration != null
  ) {
    if (
      !ownershipEpochMatches({
        ownerId: expectedOwnerId,
        generation: expectedGeneration
      })
    ) {
      return { updatedCardIds: [], applied: false, reason: 'stale-epoch' };
    }
  }

  writeLocalStoreObject(ACTIVE_COLLECTION_KEY, collected);
  writeLocalStoreObject(ACTIVE_QUANTITIES_KEY, quantities);

  const ownerId = readOwnershipMeta().ownerId;
  if (ownerId) {
    persistActiveToAccountScope(ownerId);
  }

  return { updatedCardIds, applied: true, reason: 'ok' };
}

export function clearGuestImportArchive() {
  removeLocalStoreKey(GUEST_COLLECTION_KEY);
  removeLocalStoreKey(GUEST_FAVORITES_KEY);
  removeLocalStoreKey(GUEST_QUANTITIES_KEY);
}

export {
  OWNERSHIP_CHANGED_EVENT,
  BROADCAST_CHANNEL_NAME,
  readLocalStoreObject,
  writeLocalStoreObject,
  clearActiveOwnershipKeys,
  readActiveSnapshot
};
