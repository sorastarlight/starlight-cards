/**
 * Account-scoped daily-pack reveal receipts (display hints only).
 * Server claim status + cardsAwarded remain authoritative.
 */

export const DAILY_RECEIPT_KEY_PREFIX = 'starlight-daily-receipt-v1:user:';

export function easternClaimDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
}

export function dailyReceiptStorageKey(ownerId) {
  const id = String(ownerId || '').trim();
  if (!id) return null;
  return `${DAILY_RECEIPT_KEY_PREFIX}${id}`;
}

function getStorage() {
  return globalThis.localStorage ?? null;
}

function isCardLike(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const id = value.id ?? value.cardId ?? value.card_id;
  return Boolean(id || value.name || value.imageUrl || value.image_url);
}

/**
 * Normalize cardsAwarded / cards payloads from open_daily_booster or status RPC.
 */
export function normalizeDailyAwardCards(raw) {
  if (!raw) return [];
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (Array.isArray(value)) {
    return value.filter(isCardLike);
  }
  if (typeof value === 'object') {
    if (Array.isArray(value.cards)) return value.cards.filter(isCardLike);
    if (Array.isArray(value.cardsAwarded)) return value.cardsAwarded.filter(isCardLike);
  }
  return [];
}

export function readDailyReceipt(ownerId) {
  const key = dailyReceiptStorageKey(ownerId);
  const storage = getStorage();
  if (!key || !storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { corrupt: true, raw };
    }
    const cards = normalizeDailyAwardCards(parsed.cards);
    const claimDate = String(parsed.claimDate || '').trim();
    const owner = String(parsed.ownerId || '').trim();
    if (!claimDate || !owner || owner !== String(ownerId)) {
      return { corrupt: true, raw };
    }
    const status = ['pending_reveal', 'complete'].includes(parsed.status)
      ? parsed.status
      : 'pending_reveal';
    return {
      corrupt: false,
      ownerId: owner,
      claimDate,
      status,
      nextClaimAt: parsed.nextClaimAt || null,
      claimedAt: parsed.claimedAt || null,
      cards,
      generation: Number(parsed.generation) || 0,
      updatedAt: parsed.updatedAt || null
    };
  } catch {
    return { corrupt: true, raw: null };
  }
}

export function writeDailyReceipt(ownerId, receipt) {
  const key = dailyReceiptStorageKey(ownerId);
  const storage = getStorage();
  if (!key || !storage) return { written: false, reason: 'no-storage' };
  const claimDate = String(receipt?.claimDate || '').trim();
  const cards = normalizeDailyAwardCards(receipt?.cards);
  if (!claimDate || !cards.length) {
    return { written: false, reason: 'invalid-receipt' };
  }
  const payload = {
    ownerId: String(ownerId),
    claimDate,
    status: receipt.status === 'complete' ? 'complete' : 'pending_reveal',
    nextClaimAt: receipt.nextClaimAt || null,
    claimedAt: receipt.claimedAt || null,
    cards,
    generation: Number(receipt.generation) || 0,
    updatedAt: new Date().toISOString()
  };
  storage.setItem(key, JSON.stringify(payload));
  return { written: true, receipt: payload };
}

export function clearDailyReceipt(ownerId) {
  const key = dailyReceiptStorageKey(ownerId);
  const storage = getStorage();
  if (!key || !storage) return;
  storage.removeItem(key);
}

/**
 * Reconcile local receipt hint with authoritative get_daily_booster_status payload.
 * Never invents availability; claimed recovery is never "another pack".
 */
export function reconcileDailyRecoveryState({
  status,
  receipt,
  ownerId,
  todayClaimDate = easternClaimDate(),
  epoch = null
} = {}) {
  if (epoch && epoch.ownerId && String(epoch.ownerId) !== String(ownerId || '')) {
    return {
      kind: 'stale-account',
      available: false,
      cards: [],
      showViewAction: false,
      claimDate: todayClaimDate
    };
  }

  if (!status || typeof status !== 'object') {
    return {
      kind: 'unknown',
      available: false,
      cards: [],
      showViewAction: false,
      claimDate: todayClaimDate
    };
  }

  if (status.disabled) {
    return {
      kind: 'disabled',
      available: false,
      disabled: true,
      cards: [],
      showViewAction: false,
      claimDate: status.claimDate || todayClaimDate,
      nextClaimAt: status.nextClaimAt || null
    };
  }

  if (status.available) {
    return {
      kind: 'available',
      available: true,
      cards: [],
      showViewAction: false,
      claimDate: status.claimDate || todayClaimDate,
      nextClaimAt: status.nextClaimAt || null
    };
  }

  const claimDate = String(status.claimDate || todayClaimDate);
  const serverCards = normalizeDailyAwardCards(status.cardsAwarded);
  const receiptOk =
    receipt &&
    !receipt.corrupt &&
    String(receipt.ownerId) === String(ownerId) &&
    String(receipt.claimDate) === claimDate;

  // Midnight / wrong-day local hint: ignore for display, keep server truth.
  const localCards = receiptOk ? normalizeDailyAwardCards(receipt.cards) : [];
  const cards = serverCards.length ? serverCards : localCards;
  const pendingReveal = Boolean(receiptOk && receipt.status === 'pending_reveal');
  const showViewAction = cards.length > 0 && (pendingReveal || !receiptOk || receipt.status !== 'complete');

  return {
    kind: 'claimed',
    available: false,
    disabled: false,
    claimDate,
    claimedAt: status.claimedAt || (receiptOk ? receipt.claimedAt : null),
    nextClaimAt: status.nextClaimAt || (receiptOk ? receipt.nextClaimAt : null),
    cards,
    source: serverCards.length ? 'server' : localCards.length ? 'local-receipt' : 'none',
    pendingReveal,
    showViewAction,
    receiptOk
  };
}

/**
 * Decide recovery after a lost/ambiguous open_daily_booster response.
 * Uses status RPC only — never implies a new grant.
 */
export function resolveLostClaimRecovery(statusResult, { ownerId, todayClaimDate, epoch } = {}) {
  const reconciled = reconcileDailyRecoveryState({
    status: statusResult,
    receipt: readDailyReceipt(ownerId),
    ownerId,
    todayClaimDate,
    epoch
  });
  if (reconciled.kind !== 'claimed' || !reconciled.cards.length) {
    return { recoverable: false, reconciled };
  }
  return { recoverable: true, reconciled };
}

/**
 * Outcome after alreadyClaimed / lost open when a status read is attempted.
 * Never implies calling open_daily_booster again.
 */
export function resolvePostClaimStatusOutcome({
  status,
  error = null,
  ownerId,
  todayClaimDate,
  epoch = null,
  receipt = null
} = {}) {
  if (error || !status) {
    return {
      action: 'retry-status',
      recoverable: false,
      error: error || new Error('Missing daily booster status')
    };
  }
  const { recoverable, reconciled } = resolveLostClaimRecovery(status, {
    ownerId,
    todayClaimDate,
    epoch
  });
  if (recoverable) {
    return { action: 'show-recovery', recoverable: true, reconciled };
  }
  return { action: 'apply-reconciled', recoverable: false, reconciled };
}

/** Display labels for replaying already-received daily cards (not a new grant). */
export function buildReplayResultCards(cards) {
  return normalizeDailyAwardCards(cards).map((card) => ({
    ...card,
    resultPill: 'Already received',
    resultPillKind: 'replay'
  }));
}

export function shouldClearDisplayedResults(kind) {
  return ['available', 'disabled', 'stale-account', 'unknown'].includes(String(kind || ''));
}

/**
 * Pure epoch compare for DOM paint guards (does not read live ownership meta).
 * Delayed account-A responses must not paint after a switch to B.
 */
export function shouldPaintDailyResults(paintEpoch, currentEpoch) {
  if (!paintEpoch) return true;
  if (!currentEpoch) return false;
  return (
    String(paintEpoch.ownerId || '') === String(currentEpoch.ownerId || '') &&
    Number(paintEpoch.generation) === Number(currentEpoch.generation)
  );
}

/**
 * Simulate local quantity mutation used by applyAwardedCardsToLocalStore.
 * Replay must skip this path entirely so quantities stay unchanged.
 */
export function projectLocalQuantitiesAfterAward(quantities, cards) {
  const next = { ...(quantities || {}) };
  for (const card of cards || []) {
    const id = String(card?.id ?? card?.cardId ?? card?.card_id ?? '').trim();
    if (!id) continue;
    const quantityFromApi = Number(card?.quantity);
    if (Number.isFinite(quantityFromApi) && quantityFromApi > 0) {
      next[id] = Math.max(1, quantityFromApi);
    } else {
      next[id] = Math.max(1, Number(next[id] || 0) + 1);
    }
  }
  return next;
}
