/**
 * Client-generated opening request UUIDs for Free Daily / unlimited packs.
 * Persist before the open RPC so a lost HTTP response can be recovered by id
 * without granting again. Scoped per authenticated owner.
 */

export const DAILY_OPENING_REQUEST_KEY_PREFIX = 'starlight-daily-opening-request-v1:user:';

export function dailyOpeningRequestStorageKey(ownerId) {
  const id = String(ownerId || '').trim();
  if (!id) return null;
  return `${DAILY_OPENING_REQUEST_KEY_PREFIX}${id}`;
}

function getStorage() {
  return globalThis.localStorage ?? null;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || '')
  );
}

export function createOpeningRequestId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  // Fallback for older runtimes — still unique enough for client request keys.
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function readPendingOpeningRequest(ownerId) {
  const key = dailyOpeningRequestStorageKey(ownerId);
  const storage = getStorage();
  if (!key || !storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { corrupt: true, raw };
    }
    const owner = String(parsed.ownerId || '').trim();
    const requestId = String(parsed.requestId || '').trim();
    if (!owner || owner !== String(ownerId) || !isUuid(requestId)) {
      return { corrupt: true, raw };
    }
    return {
      corrupt: false,
      ownerId: owner,
      requestId,
      claimDate: String(parsed.claimDate || '').trim() || null,
      createdAt: parsed.createdAt || null
    };
  } catch {
    return { corrupt: true, raw: null };
  }
}

/**
 * Persist a new request UUID for this owner before calling open_daily_booster.
 * Reuses an existing same-day pending request so retries stay idempotent.
 */
export function ensurePendingOpeningRequest(ownerId, { claimDate = null, forceNew = false } = {}) {
  const key = dailyOpeningRequestStorageKey(ownerId);
  const storage = getStorage();
  if (!key || !storage || !String(ownerId || '').trim()) {
    return { written: false, reason: 'no-storage', requestId: null };
  }

  if (!forceNew) {
    const existing = readPendingOpeningRequest(ownerId);
    if (existing && !existing.corrupt) {
      const sameDay =
        !claimDate || !existing.claimDate || String(existing.claimDate) === String(claimDate);
      if (sameDay) {
        return { written: false, reason: 'reused', requestId: existing.requestId, pending: existing };
      }
    }
  }

  const requestId = createOpeningRequestId();
  const payload = {
    ownerId: String(ownerId),
    requestId,
    claimDate: claimDate ? String(claimDate) : null,
    createdAt: new Date().toISOString()
  };
  storage.setItem(key, JSON.stringify(payload));
  return { written: true, reason: 'created', requestId, pending: payload };
}

export function clearPendingOpeningRequest(ownerId) {
  const key = dailyOpeningRequestStorageKey(ownerId);
  const storage = getStorage();
  if (!key || !storage) return;
  storage.removeItem(key);
}

/**
 * Detect whether the status payload includes server-backed opening recovery.
 * Pre-migration deployments omit recoverySupported / latestOpening.
 */
export function statusSupportsOpeningRecovery(status) {
  if (!status || typeof status !== 'object') return false;
  if (status.recoverySupported === true) return true;
  if (status.latestOpening && typeof status.latestOpening === 'object') return true;
  return false;
}

export function normalizeOpeningPayload(raw) {
  if (!raw || typeof raw !== 'object') {
    return { found: false, cards: [], claimId: null, requestId: null };
  }
  const cards =
    Array.isArray(raw.cards) || Array.isArray(raw.cardsAwarded)
      ? raw.cards || raw.cardsAwarded
      : [];
  const found = raw.found !== false && (Boolean(raw.claimId) || Boolean(raw.requestId) || cards.length > 0);
  return {
    found,
    claimId: raw.claimId ?? raw.id ?? null,
    requestId: raw.requestId ?? null,
    mode: raw.mode || null,
    claimDate: raw.claimDate || null,
    claimedAt: raw.claimedAt || null,
    cards: Array.isArray(cards) ? cards : [],
    nextClaimAt: raw.nextClaimAt ?? null
  };
}
