/**
 * Account-scoped daily-pack reveal receipts (display hints only).
 * Server claim status + cardsAwarded / latestOpening remain authoritative when
 * the server exposes them (daily claimed status, or post-migration unlimited
 * latestOpening + get_my_daily_booster_opening).
 *
 * Historical unlimited openings from before server-backed recovery never wrote
 * a claim row and cannot be reconstructed. Receipt quantities are not current
 * inventory — reconcile live ownership separately on replay.
 */

import { statusSupportsOpeningRecovery } from './daily-booster-opening-request.js';

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
      claimId: parsed.claimId ?? null,
      requestId: parsed.requestId || null,
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
    claimId: receipt.claimId ?? null,
    requestId: receipt.requestId || null,
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

function latestOpeningCards(status) {
  if (!statusSupportsOpeningRecovery(status)) return [];
  const latest = status.latestOpening;
  if (!latest || typeof latest !== 'object') return [];
  return normalizeDailyAwardCards(latest.cards || latest.cardsAwarded);
}

/**
 * Reconcile local receipt hint with authoritative get_daily_booster_status payload.
 * Never invents availability; claimed recovery is never "another pack".
 * Unlimited View-latest uses status.latestOpening only when recovery is supported.
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

  const claimDate = String(status.claimDate || todayClaimDate);
  const receiptOk =
    receipt &&
    !receipt.corrupt &&
    String(receipt.ownerId) === String(ownerId) &&
    String(receipt.claimDate) === claimDate;
  const localReplayCards = receiptOk ? normalizeDailyAwardCards(receipt.cards) : [];
  const pendingReveal = Boolean(receiptOk && receipt.status === 'pending_reveal');
  const recoverySupported = statusSupportsOpeningRecovery(status);
  const serverLatestCards = latestOpeningCards(status);
  const viewLatestLabel =
    String(status.viewLatestLabel || '').trim() ||
    (String(status.mode || '') === 'unlimited' ? 'View latest pack' : "View today’s cards");

  // Unlimited (and other available) modes keep the pack open.
  // View action: pending local receipt first; else server latestOpening when supported.
  if (status.available) {
    const cards = localReplayCards.length
      ? localReplayCards
      : recoverySupported
        ? serverLatestCards
        : [];
    const viewSource = localReplayCards.length
      ? 'local-receipt'
      : serverLatestCards.length
        ? 'server-latest'
        : 'none';
    return {
      kind: 'available',
      available: true,
      disabled: false,
      mode: status.mode || null,
      cards,
      showViewAction: cards.length > 0,
      viewActionKind: localReplayCards.length
        ? 'pending-receipt'
        : serverLatestCards.length
          ? 'view-latest'
          : 'none',
      viewLatestLabel,
      pendingReveal,
      claimDate,
      claimedAt: status.latestOpening?.claimedAt || (receiptOk ? receipt.claimedAt : null),
      claimId: status.latestOpening?.claimId ?? (receiptOk ? receipt.claimId : null),
      requestId: status.latestOpening?.requestId || (receiptOk ? receipt.requestId : null),
      nextClaimAt: status.nextClaimAt || null,
      source: viewSource,
      recoverySupported,
      receiptOk: Boolean(receiptOk)
    };
  }

  const serverCards = normalizeDailyAwardCards(status.cardsAwarded);
  const localCards = localReplayCards;
  const cards = serverCards.length ? serverCards : localCards;
  const showViewAction =
    cards.length > 0 && (pendingReveal || !receiptOk || receipt.status !== 'complete');

  return {
    kind: 'claimed',
    available: false,
    disabled: false,
    mode: status.mode || null,
    claimDate,
    claimedAt: status.claimedAt || (receiptOk ? receipt.claimedAt : null),
    claimId: status.claimId ?? status.latestOpening?.claimId ?? (receiptOk ? receipt.claimId : null),
    requestId:
      status.requestId || status.latestOpening?.requestId || (receiptOk ? receipt.requestId : null),
    nextClaimAt: status.nextClaimAt || (receiptOk ? receipt.nextClaimAt : null),
    cards,
    source: serverCards.length ? 'server' : localCards.length ? 'local-receipt' : 'none',
    pendingReveal,
    showViewAction,
    viewActionKind: showViewAction ? 'claimed-recovery' : 'none',
    viewLatestLabel,
    recoverySupported,
    receiptOk
  };
}

/**
 * Decide recovery after a lost/ambiguous open_daily_booster response.
 * Uses status RPC only — never implies a new grant.
 * For unlimited + recoverySupported, latestOpening can recover cleared storage.
 */
export function resolveLostClaimRecovery(statusResult, { ownerId, todayClaimDate, epoch } = {}) {
  const reconciled = reconcileDailyRecoveryState({
    status: statusResult,
    receipt: readDailyReceipt(ownerId),
    ownerId,
    todayClaimDate,
    epoch
  });
  if (reconciled.kind === 'claimed' && reconciled.cards.length) {
    return { recoverable: true, reconciled };
  }
  // Post-migration unlimited: latestOpening recovers without a local receipt.
  if (
    reconciled.kind === 'available' &&
    reconciled.recoverySupported &&
    reconciled.source === 'server-latest' &&
    reconciled.cards.length
  ) {
    return { recoverable: true, reconciled };
  }
  return { recoverable: false, reconciled };
}

/**
 * Outcome after alreadyClaimed / lost open when a status read is attempted.
 * Never implies calling open_daily_booster again with a new request id.
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

/**
 * Display labels for replaying already-received daily cards (not a new grant).
 * Historical receipt quantities are not treated as current inventory — pass
 * currentQuantities from the live collection when available.
 */
export function buildReplayResultCards(cards, { currentQuantities = null } = {}) {
  return normalizeDailyAwardCards(cards).map((card) => {
    const id = String(card.id ?? card.cardId ?? card.card_id ?? '').trim();
    const liveQty =
      currentQuantities && id ? Number(currentQuantities[id]) : Number.NaN;
    const hasLive = Number.isFinite(liveQty) && liveQty > 0;
    return {
      ...card,
      // Strip historical award snapshot quantities unless live ownership is known.
      quantity: hasLive ? liveQty : null,
      isDuplicate: hasLive ? liveQty > 1 : false,
      resultPill: 'Already received',
      resultPillKind: 'replay'
    };
  });
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
