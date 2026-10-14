import { supabase } from '../supabase-client.js';
import {
  clearPendingOpeningRequest,
  getDailyBoosterStatus,
  openDailyBooster,
  recoverOpeningByRequestId
} from '../daily-booster-service.js?v=1.1.0';
import {
  ACTIVE_QUANTITIES_KEY,
  applyAwardedCardsToLocalStore,
  captureOwnershipEpoch,
  ownershipEpochMatches
} from '../collection-local-store.js';
import {
  notifyShellCollectionReconcile,
  notifyShellEconomyChanged
} from '../shell-economy.js';
import { notifyShellFeedChanged } from '../shell-feed-notify.js';
import { revealRewardSequence } from '../reward-reveal.js?v=1.5.17';
import { getPublicBoosterConfig } from '../booster-config-service.js';
import { getCachedWebsiteContent } from '../website-content-hydrate.js';
import { maybeCelebrateSeriesCompletions } from '../series-complete-celebration.js?v=1.0.0';
import {
  buildReplayResultCards,
  clearDailyReceipt,
  easternClaimDate,
  normalizeDailyAwardCards,
  readDailyReceipt,
  reconcileDailyRecoveryState,
  resolvePostClaimStatusOutcome,
  shouldClearDisplayedResults,
  writeDailyReceipt
} from '../daily-booster-receipt.js?v=1.1.0';

let dailyCopy = getCachedWebsiteContent()?.daily || {};

const packImage = document.getElementById('daily-pack-image');
const portal = document.getElementById('portal-zone');
const pack = document.getElementById('pack-trigger');
const packLabel = document.getElementById('pack-ready-label');
const signIn = document.getElementById('sign-in-link');
const viewToday = document.getElementById('view-today-cards');
const retryStatus = document.getElementById('retry-daily-status');
const heading = document.getElementById('daily-status-heading');
const description = document.getElementById('daily-status-description');
const countdown = document.getElementById('countdown');
const rewardSection = document.getElementById('reward-section');
const rewardGrid = document.getElementById('reward-grid');
const rewardTitle = document.getElementById('reward-title');
const statusText = document.getElementById('page-status');

let timer = null;
let isBusy = false;
let pendingRecovery = null;
let activeOwnerId = null;

const READY_PACK_LABEL = dailyCopy.readyPackLabel || 'READY TO OPEN - CLICK THE PACK';

function status(message, type = '') {
  statusText.textContent = message;
  statusText.className = `page-status ${type}`.trim();
}

function format(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

function startCountdown(value) {
  clearInterval(timer);
  if (!value) {
    countdown.classList.add('hidden');
    return;
  }
  const target = new Date(value);
  countdown.classList.remove('hidden');
  const tick = () => {
    const left = target - Date.now();
    if (left <= 0) {
      clearInterval(timer);
      initialize();
      return;
    }
    countdown.textContent = format(left);
  };
  tick();
  timer = setInterval(tick, 1000);
}

function liveQuantities() {
  try {
    const raw = globalThis.localStorage?.getItem(ACTIVE_QUANTITIES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function setViewTodayVisible(visible, { label = null } = {}) {
  if (!viewToday) return;
  viewToday.classList.toggle('hidden', !visible);
  viewToday.disabled = !visible || isBusy;
  if (visible && label) {
    viewToday.textContent = label;
  } else if (visible && !viewToday.textContent.trim()) {
    viewToday.textContent = dailyCopy.viewTodayCta || "View today’s cards";
  }
}

function setRetryStatusVisible(visible) {
  if (!retryStatus) return;
  retryStatus.classList.toggle('hidden', !visible);
  retryStatus.disabled = !visible || isBusy;
}

/** Clear results / CTAs immediately (sync) before any network work. */
function clearRewardResults() {
  rewardGrid?.replaceChildren();
  rewardSection?.classList.add('hidden');
  if (rewardTitle) {
    rewardTitle.textContent = dailyCopy.pullsTitle || 'Your Pulls';
  }
}

function clearTransientActions() {
  setViewTodayVisible(false);
  setRetryStatusVisible(false);
  pendingRecovery = null;
}

function clearStalePresentation() {
  clearRewardResults();
  clearTransientActions();
}

function canPaint(epoch) {
  if (!epoch) return true;
  return ownershipEpochMatches(epoch);
}

function render(cards, title = dailyCopy.pullsTitle || 'Your Pulls', { epoch = null, replay = false } = {}) {
  if (!canPaint(epoch)) return;
  const displayCards = replay
    ? buildReplayResultCards(cards, { currentQuantities: liveQuantities() })
    : cards || [];
  rewardTitle.textContent = title;
  rewardGrid.replaceChildren();
  for (const card of displayCards) {
    const item = document.createElement('article');
    item.className = `reward-card rarity-${String(card.rarity || 'common').toLowerCase()}`;
    const art = card.imageUrl || card.thumbnailUrl || '';
    const name = card.name || 'Card';
    const number = card.cardNumber ?? card.card_number ?? '';
    const rarity = card.rarity || 'Unknown';
    const series = card.seriesName || card.series_name || '';
    const quantity = card.quantity;
    const quantityLine =
      quantity != null && Number.isFinite(Number(quantity))
        ? `<p>Quantity: ${quantity}</p>`
        : replay
          ? '<p>Owned in collection</p>'
          : '<p>Quantity: 1</p>';
    const pill = replay
      ? card.resultPill || 'Already received'
      : card.isDuplicate
        ? 'Duplicate Pull'
        : 'New Card!';
    const pillClass = replay ? 'replay' : card.isDuplicate ? 'duplicate' : '';
    item.innerHTML = `<span class="reward-card-art"><img src="${art}" alt="${name} card artwork"></span><h3>#${number} ${name}</h3><p>${rarity} • ${series}</p>${quantityLine}<span class="reward-pill ${pillClass}">${pill}</span>`;
    rewardGrid.append(item);
  }
  rewardSection.classList.remove('hidden');
}

function setPackBusy(busy) {
  if (busy) pack.setAttribute('aria-busy', 'true');
  else pack.removeAttribute('aria-busy');
}

function setPortalChecking() {
  clearStalePresentation();
  portal.classList.add('is-locked');
  pack.disabled = true;
  setPackBusy(true);
  packLabel.textContent = dailyCopy.checkingPackLabel || 'Checking availability';
  heading.textContent = dailyCopy.checkingTitle || 'Checking availability';
  description.textContent =
    dailyCopy.checkingLead || 'Confirming your Free Daily Starlight Pack status…';
  countdown.classList.add('hidden');
  signIn.classList.add('hidden');
}

function setPortalDisabled({ epoch = null } = {}) {
  if (!canPaint(epoch)) return;
  clearStalePresentation();
  portal.classList.add('is-locked');
  pack.disabled = true;
  setPackBusy(false);
  packLabel.textContent = dailyCopy.disabledPackLabel || 'Free Pack Unavailable';
  heading.textContent = dailyCopy.disabledTitle || 'Free Daily Starlight Pack Is Currently Disabled';
  description.textContent =
    dailyCopy.disabledLead ||
    'The Free Daily Starlight Pack has been paused by the site administrator.';
  countdown.classList.add('hidden');
}

function setPortalReady(
  { epoch = null, showView = false, cards = [], claimDate = null, nextClaimAt = null, claimedAt = null } = {}
) {
  if (!canPaint(epoch)) return;
  // Moving to today's available state must drop previous-day results immediately,
  // unless a same-day pending reveal receipt still needs a View action (e.g. unlimited mode).
  clearRewardResults();
  setRetryStatusVisible(false);
  if (!showView) {
    clearTransientActions();
  }
  portal.classList.remove('is-locked');
  pack.disabled = false;
  setPackBusy(false);
  packLabel.textContent = READY_PACK_LABEL;
  heading.textContent = dailyCopy.readyTitle || 'Your Free Pack Is Ready!';
  description.textContent = showView
    ? dailyCopy.readyWithRecoveryLead ||
      "Your Free Pack is ready again. You can also view today’s interrupted results without opening another pack."
    : dailyCopy.readyLead || "Click the pack to view today's cards.";
  countdown.classList.add('hidden');
  setViewTodayVisible(showView, {
    label:
      dailyCopy.viewLatestCta ||
      dailyCopy.viewTodayCta ||
      "View latest pack"
  });
  pendingRecovery = showView
    ? { cards, nextClaimAt, claimDate, claimedAt, viewActionKind: 'view-latest' }
    : null;
  if (showView && cards.length) {
    render(cards, dailyCopy.replayResultsTitle || 'Cards already received today', {
      epoch,
      replay: true
    });
  }
}

function setPortalClaimed(data, { showView = false, epoch = null, replay = false } = {}) {
  if (!canPaint(epoch)) return;
  setRetryStatusVisible(false);
  portal.classList.add('is-locked');
  pack.disabled = true;
  setPackBusy(false);
  packLabel.textContent = dailyCopy.claimedPackLabel || 'Free Pack Claimed';
  heading.textContent = dailyCopy.claimedTitle || 'Your Next Free Pack Is Charging';
  description.textContent =
    dailyCopy.claimedLead || 'The portal will awaken again at midnight Eastern Time.';
  startCountdown(data.nextClaimAt);
  if (Array.isArray(data.cardsAwarded) && data.cardsAwarded.length) {
    render(
      data.cardsAwarded,
      replay
        ? dailyCopy.replayResultsTitle || 'Cards already received today'
        : dailyCopy.resultsTitle || "Here Are Today’s Free Daily Starlight Pack Results",
      { epoch, replay }
    );
  } else {
    clearRewardResults();
  }
  setViewTodayVisible(showView, {
    label: dailyCopy.viewTodayCta || "View today’s cards"
  });
  pendingRecovery = showView
    ? {
        cards: data.cardsAwarded || [],
        nextClaimAt: data.nextClaimAt || null,
        claimDate: data.claimDate || null,
        claimedAt: data.claimedAt || null,
        claimId: data.claimId || null,
        requestId: data.requestId || null,
        viewActionKind: 'claimed-recovery'
      }
    : null;
}

function setPortalRecovery(data, { epoch = null } = {}) {
  if (!canPaint(epoch)) return;
  setRetryStatusVisible(false);
  portal.classList.add('is-locked');
  pack.disabled = true;
  setPackBusy(false);
  packLabel.textContent = dailyCopy.recoveryPackLabel || 'Pack Claimed — View Results';
  heading.textContent = dailyCopy.recoveryTitle || "Today’s cards are ready to view";
  description.textContent =
    dailyCopy.recoveryLead ||
    'Your Free Daily Starlight Pack was already claimed. View today’s cards without opening another pack.';
  startCountdown(data.nextClaimAt);
  setViewTodayVisible(true, {
    label: data.viewLatestLabel || dailyCopy.viewTodayCta || "View today’s cards"
  });
  pendingRecovery = {
    cards: data.cards || [],
    nextClaimAt: data.nextClaimAt || null,
    claimDate: data.claimDate || null,
    claimedAt: data.claimedAt || null,
    claimId: data.claimId || null,
    requestId: data.requestId || null,
    viewActionKind: data.viewActionKind || 'claimed-recovery'
  };
  if (data.cards?.length) {
    render(
      data.cards,
      dailyCopy.replayResultsTitle || 'Cards already received today',
      { epoch, replay: true }
    );
  } else {
    clearRewardResults();
  }
}

function showStatusRetry(message, { epoch = null } = {}) {
  if (!canPaint(epoch)) return;
  clearRewardResults();
  setViewTodayVisible(false);
  pendingRecovery = null;
  portal.classList.add('is-locked');
  pack.disabled = true;
  setPackBusy(false);
  packLabel.textContent = dailyCopy.statusRetryPackLabel || 'Status check needed';
  heading.textContent = dailyCopy.statusRetryTitle || 'Could not confirm pack status';
  description.textContent =
    dailyCopy.statusRetryLead ||
    'Your claim may already be saved. Use Retry status to recover today’s cards — this never opens another pack.';
  countdown.classList.add('hidden');
  setRetryStatusVisible(true);
  status(
    message ||
      dailyCopy.statusRetryStatus ||
      'Could not confirm today’s claim. Retry status when ready.',
    'error'
  );
}

async function playOpening(cards, title, { epoch, markComplete = true, mode = 'claim' } = {}) {
  const openEpoch = epoch || captureOwnershipEpoch();
  const isReplay = mode === 'replay';
  await revealRewardSequence(cards, {
    title: isReplay
      ? dailyCopy.replayRevealTitle || "Today’s Free Daily Starlight Pack Results"
      : 'Free Daily Starlight Pack',
    packImageUrl: packImage.currentSrc || packImage.src,
    autoOpen: true,
    presentationMode: isReplay ? 'replay' : 'claim'
  });
  if (!ownershipEpochMatches(openEpoch)) {
    return { completed: false, reason: 'stale-epoch' };
  }

  if (isReplay) {
    // Reconcile ownership from cloud — never re-apply awards or emit grant notifications.
    notifyShellCollectionReconcile({ source: 'daily-booster-replay' });
    if (ownershipEpochMatches(openEpoch)) {
      render(
        cards,
        title || dailyCopy.replayResultsTitle || 'Cards already received today',
        { epoch: openEpoch, replay: true }
      );
    }
  } else {
    await maybeCelebrateSeriesCompletions(cards);
    if (!ownershipEpochMatches(openEpoch)) {
      return { completed: false, reason: 'stale-epoch' };
    }
    const localApply = applyAwardedCardsToLocalStore(cards, { epoch: openEpoch });
    notifyShellEconomyChanged({ source: 'daily-booster', cards, localApply });
    notifyShellFeedChanged({ source: 'daily-booster' });
    if (ownershipEpochMatches(openEpoch)) {
      render(cards, title, { epoch: openEpoch, replay: false });
    }
  }

  if (markComplete && activeOwnerId && ownershipEpochMatches(openEpoch)) {
    const receipt = readDailyReceipt(activeOwnerId);
    if (receipt && !receipt.corrupt && receipt.claimDate === easternClaimDate()) {
      writeDailyReceipt(activeOwnerId, {
        ...receipt,
        status: 'complete',
        cards,
        generation: openEpoch.generation
      });
    }
  }
  return { completed: true };
}

function applyReconciledState(reconciled, { epoch = null } = {}) {
  if (!canPaint(epoch)) return;
  if (shouldClearDisplayedResults(reconciled.kind)) {
    clearRewardResults();
  }
  if (reconciled.kind === 'disabled') {
    setPortalDisabled({ epoch });
    return;
  }
  if (reconciled.kind === 'available') {
    const showView = Boolean(reconciled.showViewAction && reconciled.cards?.length);
    setPortalReady({
      epoch,
      showView,
      cards: reconciled.cards || [],
      claimDate: reconciled.claimDate || null,
      nextClaimAt: reconciled.nextClaimAt || null,
      claimedAt: reconciled.claimedAt || null
    });
    if (showView) {
      setViewTodayVisible(true, {
        label:
          reconciled.viewLatestLabel ||
          dailyCopy.viewLatestCta ||
          (reconciled.mode === 'unlimited' ? 'View latest pack' : "View today’s cards")
      });
      pendingRecovery = {
        cards: reconciled.cards || [],
        nextClaimAt: reconciled.nextClaimAt || null,
        claimDate: reconciled.claimDate || null,
        claimedAt: reconciled.claimedAt || null,
        claimId: reconciled.claimId || null,
        requestId: reconciled.requestId || null,
        viewActionKind: reconciled.viewActionKind || 'view-latest'
      };
    }
    return;
  }
  if (reconciled.kind === 'claimed') {
    if (reconciled.showViewAction && reconciled.cards.length) {
      setPortalRecovery(reconciled, { epoch });
      return;
    }
    setPortalClaimed(
      {
        nextClaimAt: reconciled.nextClaimAt,
        cardsAwarded: reconciled.cards,
        claimDate: reconciled.claimDate,
        claimedAt: reconciled.claimedAt,
        claimId: reconciled.claimId,
        requestId: reconciled.requestId
      },
      {
        showView: Boolean(reconciled.cards.length),
        epoch,
        replay: true
      }
    );
    return;
  }
  status('Could not confirm the Free Daily Starlight Pack.', 'error');
  setPackBusy(false);
}

async function initialize() {
  setPortalChecking();
  status('');
  try {
    const cfg = await getPublicBoosterConfig('free_daily');
    if (cfg?.pack_image_url && canPaint(captureOwnershipEpoch())) {
      packImage.src = cfg.pack_image_url;
    }
  } catch {
    /* keep fallback art */
  }

  const epoch = captureOwnershipEpoch();
  const { data, error } = await supabase.auth.getUser();
  if (!ownershipEpochMatches(epoch) && epoch.generation > 0) {
    // Ownership moved while loading; restart against the new account.
    return initialize();
  }

  if (error || !data.user) {
    clearStalePresentation();
    portal.classList.add('is-locked');
    pack.disabled = true;
    setPackBusy(false);
    packLabel.textContent = dailyCopy.signInCta || 'Sign In to Open';
    heading.textContent = dailyCopy.signInTitle || 'Sign In to Claim Your Free Pack';
    description.textContent =
      dailyCopy.signInLead ||
      'Free Daily Starlight Packs and Star Bits boosters are saved to your Starlight account.';
    signIn.classList.remove('hidden');
    activeOwnerId = null;
    return;
  }

  signIn.classList.add('hidden');
  activeOwnerId = data.user.id;
  const today = easternClaimDate();
  const receipt = readDailyReceipt(activeOwnerId);
  if (receipt?.corrupt) {
    clearDailyReceipt(activeOwnerId);
  } else if (receipt && !receipt.corrupt && receipt.claimDate !== today) {
    // Midnight America/New_York rolled over — discard yesterday's display hint.
    clearDailyReceipt(activeOwnerId);
  }

  const statusEpoch = captureOwnershipEpoch();
  const { status: daily, error: dailyError } = await getDailyBoosterStatus();
  if (!ownershipEpochMatches(statusEpoch)) {
    return initialize();
  }

  if (dailyError || !daily) {
    showStatusRetry(
      dailyError?.message || 'Could not check the Free Daily Starlight Pack.',
      { epoch: statusEpoch }
    );
    return;
  }

  const reconciled = reconcileDailyRecoveryState({
    status: daily,
    receipt: readDailyReceipt(activeOwnerId),
    ownerId: activeOwnerId,
    todayClaimDate: today,
    epoch: statusEpoch
  });
  applyReconciledState(reconciled, { epoch: statusEpoch });
}

async function recoverLostClaimResponse(openEpoch) {
  // Prefer request-id recovery (never grants again). Falls back for pre-migration.
  const byRequest = await recoverOpeningByRequestId({
    ownerId: activeOwnerId,
    allowIdempotentOpen: true
  });
  if (!ownershipEpochMatches(openEpoch)) {
    return { recovered: false, reason: 'stale-epoch' };
  }
  if (byRequest.recovered && byRequest.opening?.cards?.length) {
    const opening = byRequest.opening;
    writeDailyReceipt(activeOwnerId, {
      ownerId: activeOwnerId,
      claimDate: opening.claimDate || easternClaimDate(),
      status: 'pending_reveal',
      nextClaimAt: opening.nextClaimAt,
      claimedAt: opening.claimedAt,
      claimId: opening.claimId,
      requestId: opening.requestId,
      cards: opening.cards,
      generation: openEpoch.generation
    });
    clearPendingOpeningRequest(activeOwnerId);
    const reconciled = {
      kind: opening.mode === 'unlimited' ? 'available' : 'claimed',
      available: opening.mode === 'unlimited',
      cards: opening.cards,
      showViewAction: true,
      claimDate: opening.claimDate,
      claimedAt: opening.claimedAt,
      claimId: opening.claimId,
      requestId: opening.requestId,
      nextClaimAt: opening.nextClaimAt,
      mode: opening.mode,
      viewActionKind: opening.mode === 'unlimited' ? 'view-latest' : 'claimed-recovery',
      viewLatestLabel:
        opening.mode === 'unlimited' ? 'View latest pack' : "View today’s cards"
    };
    applyReconciledState(reconciled, { epoch: openEpoch });
    status(
      dailyCopy.recoveryStatus ||
        'Your pack opening was recovered. View results without opening another pack.',
      'success'
    );
    return { recovered: true, reconciled, via: byRequest.reason };
  }

  const { status: daily, error } = await getDailyBoosterStatus();
  if (!ownershipEpochMatches(openEpoch)) {
    return { recovered: false, reason: 'stale-epoch' };
  }
  const outcome = resolvePostClaimStatusOutcome({
    status: daily,
    error,
    ownerId: activeOwnerId,
    todayClaimDate: easternClaimDate(),
    epoch: openEpoch,
    receipt: readDailyReceipt(activeOwnerId)
  });
  if (outcome.action === 'retry-status') {
    return { recovered: false, reason: 'status-error', error: outcome.error };
  }
  if (outcome.action === 'show-recovery') {
    writeDailyReceipt(activeOwnerId, {
      ownerId: activeOwnerId,
      claimDate: outcome.reconciled.claimDate,
      status: 'pending_reveal',
      nextClaimAt: outcome.reconciled.nextClaimAt,
      claimedAt: outcome.reconciled.claimedAt,
      claimId: outcome.reconciled.claimId,
      requestId: outcome.reconciled.requestId,
      cards: outcome.reconciled.cards,
      generation: openEpoch.generation
    });
    clearPendingOpeningRequest(activeOwnerId);
    applyReconciledState(outcome.reconciled, { epoch: openEpoch });
    status(
      dailyCopy.recoveryStatus ||
        'Your pack was already claimed. Use View today’s cards to see the results.',
      'success'
    );
    return { recovered: true, reconciled: outcome.reconciled };
  }
  applyReconciledState(outcome.reconciled, { epoch: openEpoch });
  return { recovered: false, reason: 'not-claimed', reconciled: outcome.reconciled };
}

async function openPackFlow() {
  if (isBusy || pack.disabled) return;
  isBusy = true;
  pack.disabled = true;
  setViewTodayVisible(false);
  setRetryStatusVisible(false);
  packLabel.textContent = READY_PACK_LABEL;
  const openEpoch = captureOwnershipEpoch();
  try {
    // Persist client request UUID before the RPC so lost responses stay recoverable.
    const result = await openDailyBooster({
      ownerId: activeOwnerId,
      claimDate: easternClaimDate()
    });
    if (!ownershipEpochMatches(openEpoch)) {
      status('Account changed while opening the pack. Refreshing…', 'error');
      clearStalePresentation();
      await initialize();
      return;
    }

    if (result?.alreadyClaimed) {
      // Same-day daily slot already taken — never grant again.
      const cards = normalizeDailyAwardCards(result.cards || result.cardsAwarded);
      if (cards.length) {
        writeDailyReceipt(activeOwnerId, {
          ownerId: activeOwnerId,
          claimDate: result.claimDate || easternClaimDate(),
          status: 'pending_reveal',
          nextClaimAt: result.nextClaimAt || null,
          claimedAt: result.claimedAt || null,
          claimId: result.claimId || null,
          requestId: result.requestId || null,
          cards,
          generation: openEpoch.generation
        });
        clearPendingOpeningRequest(activeOwnerId);
        setPortalRecovery(
          {
            cards,
            nextClaimAt: result.nextClaimAt,
            claimDate: result.claimDate,
            claimedAt: result.claimedAt,
            claimId: result.claimId,
            requestId: result.requestId
          },
          { epoch: openEpoch }
        );
        status(
          dailyCopy.recoveryStatus ||
            'Your pack was already claimed. Use View today’s cards to see the results.',
          'success'
        );
        return;
      }
      const recovered = await recoverLostClaimResponse(openEpoch);
      if (!recovered.recovered) {
        if (recovered.reason === 'stale-epoch') {
          clearStalePresentation();
          await initialize();
          return;
        }
        if (recovered.reason === 'status-error') {
          showStatusRetry(
            recovered.error?.message ||
              'Could not confirm today’s claim status. Retry status — this will not open another pack.',
            { epoch: openEpoch }
          );
          return;
        }
      }
      return;
    }

    const cards = normalizeDailyAwardCards(result?.cards || result?.cardsAwarded);
    if (!cards.length) throw new Error('No cards were returned from this pack.');

    // Persist receipt before animation so refresh/close can recover without re-claiming.
    writeDailyReceipt(activeOwnerId, {
      ownerId: activeOwnerId,
      claimDate: result.claimDate || easternClaimDate(),
      status: 'pending_reveal',
      nextClaimAt: result.nextClaimAt || null,
      claimedAt: result.claimedAt || null,
      claimId: result.claimId || null,
      requestId: result.requestId || result._clientRequestId || null,
      cards,
      generation: openEpoch.generation
    });
    clearPendingOpeningRequest(activeOwnerId);

    const isReplay = Boolean(result?.idempotentReplay);
    const title = isReplay
      ? dailyCopy.replayResultsTitle || 'Cards already received today'
      : dailyCopy.resultsTitle || "Here Are Today’s Free Daily Starlight Pack Results";
    await playOpening(cards, title, {
      epoch: openEpoch,
      markComplete: true,
      mode: isReplay ? 'replay' : 'claim'
    });
    if (!ownershipEpochMatches(openEpoch)) {
      clearStalePresentation();
      await initialize();
      return;
    }

    if (result.mode === 'unlimited') {
      setPortalReady({
        epoch: openEpoch,
        showView: true,
        cards,
        claimDate: result.claimDate,
        nextClaimAt: result.nextClaimAt,
        claimedAt: result.claimedAt
      });
      setViewTodayVisible(true, {
        label: dailyCopy.viewLatestCta || 'View latest pack'
      });
      pendingRecovery = {
        cards,
        nextClaimAt: result.nextClaimAt,
        claimDate: result.claimDate,
        claimedAt: result.claimedAt,
        claimId: result.claimId,
        requestId: result.requestId,
        viewActionKind: 'view-latest'
      };
    } else {
      setPortalClaimed(
        {
          nextClaimAt: result.nextClaimAt,
          cardsAwarded: cards,
          claimDate: result.claimDate,
          claimedAt: result.claimedAt,
          claimId: result.claimId,
          requestId: result.requestId
        },
        { showView: true, epoch: openEpoch, replay: isReplay }
      );
    }
    window.parent?.postMessage(
      { type: 'starlight-view-ready', view: 'daily', claimed: true },
      location.origin
    );
  } catch (error) {
    // Ambiguous failure after a possible commit: recover by request id / status — never new UUID.
    const recovered = await recoverLostClaimResponse(openEpoch);
    if (!recovered.recovered) {
      if (recovered.reason === 'status-error') {
        showStatusRetry(
          recovered.error?.message ||
            error.message ||
            'Could not confirm today’s claim status. Retry status — this will not open another pack.',
          { epoch: openEpoch }
        );
      } else if (recovered.reason === 'stale-epoch') {
        clearStalePresentation();
        await initialize();
      } else {
        status(error.message || 'The free pack could not be opened.', 'error');
        await initialize();
      }
    }
  } finally {
    isBusy = false;
    if (retryStatus && !retryStatus.classList.contains('hidden')) {
      retryStatus.disabled = false;
    }
  }
}

async function retryStatusFlow() {
  if (isBusy) return;
  isBusy = true;
  setRetryStatusVisible(false);
  const retryEpoch = captureOwnershipEpoch();
  try {
    // Manual, single status read — never openDailyBooster, never auto-loop.
    setPortalChecking();
    status('');
    const { data, error: authError } = await supabase.auth.getUser();
    if (!ownershipEpochMatches(retryEpoch)) {
      await initialize();
      return;
    }
    if (authError || !data.user) {
      clearStalePresentation();
      await initialize();
      return;
    }
    activeOwnerId = data.user.id;
    const { status: daily, error } = await getDailyBoosterStatus();
    if (!ownershipEpochMatches(retryEpoch)) {
      await initialize();
      return;
    }
    const outcome = resolvePostClaimStatusOutcome({
      status: daily,
      error,
      ownerId: activeOwnerId,
      todayClaimDate: easternClaimDate(),
      epoch: retryEpoch,
      receipt: readDailyReceipt(activeOwnerId)
    });
    if (outcome.action === 'retry-status') {
      showStatusRetry(
        outcome.error?.message || 'Could not confirm today’s claim status. Try again when ready.',
        { epoch: retryEpoch }
      );
      return;
    }
    if (outcome.action === 'show-recovery') {
      writeDailyReceipt(activeOwnerId, {
        ownerId: activeOwnerId,
        claimDate: outcome.reconciled.claimDate,
        status: 'pending_reveal',
        nextClaimAt: outcome.reconciled.nextClaimAt,
        claimedAt: outcome.reconciled.claimedAt,
        claimId: outcome.reconciled.claimId,
        requestId: outcome.reconciled.requestId,
        cards: outcome.reconciled.cards,
        generation: retryEpoch.generation
      });
      applyReconciledState(outcome.reconciled, { epoch: retryEpoch });
      status(
        dailyCopy.recoveryStatus ||
          'Your pack was already claimed. Use View today’s cards to see the results.',
        'success'
      );
      return;
    }
    applyReconciledState(outcome.reconciled, { epoch: retryEpoch });
  } finally {
    isBusy = false;
    if (retryStatus && !retryStatus.classList.contains('hidden')) {
      retryStatus.disabled = false;
    }
  }
}

async function viewTodayFlow() {
  if (isBusy || !pendingRecovery?.cards?.length) return;
  isBusy = true;
  setViewTodayVisible(false);
  setRetryStatusVisible(false);
  const viewEpoch = captureOwnershipEpoch();
  try {
    // Reconcile with server immediately before reveal — never open with a new request id.
    const { status: daily, error } = await getDailyBoosterStatus();
    if (!ownershipEpochMatches(viewEpoch)) {
      clearStalePresentation();
      await initialize();
      return;
    }
    if (error) throw error;
    const reconciled = reconcileDailyRecoveryState({
      status: daily,
      receipt: readDailyReceipt(activeOwnerId),
      ownerId: activeOwnerId,
      todayClaimDate: easternClaimDate(),
      epoch: viewEpoch
    });
    if (!reconciled.cards?.length) {
      applyReconciledState(reconciled, { epoch: viewEpoch });
      return;
    }
    // Claimed recovery, unlimited pending receipt, and View latest pack all replay here.
    if (!(reconciled.kind === 'claimed' || reconciled.showViewAction)) {
      applyReconciledState(reconciled, { epoch: viewEpoch });
      return;
    }
    const title =
      reconciled.viewActionKind === 'view-latest'
        ? dailyCopy.latestResultsTitle || 'Latest pack results'
        : dailyCopy.replayResultsTitle || 'Cards already received today';
    await playOpening(reconciled.cards, title, {
      epoch: viewEpoch,
      markComplete: true,
      mode: 'replay'
    });
    if (!ownershipEpochMatches(viewEpoch)) {
      clearStalePresentation();
      await initialize();
      return;
    }
    applyReconciledState(reconciled, { epoch: viewEpoch });
  } catch (error) {
    status(error.message || 'Could not show today’s cards.', 'error');
    setViewTodayVisible(true, {
      label: pendingRecovery?.viewActionKind === 'view-latest'
        ? dailyCopy.viewLatestCta || 'View latest pack'
        : dailyCopy.viewTodayCta || "View today’s cards"
    });
  } finally {
    isBusy = false;
  }
}

pack.addEventListener('click', () => {
  void openPackFlow();
});

viewToday?.addEventListener('click', () => {
  void viewTodayFlow();
});

retryStatus?.addEventListener('click', () => {
  void retryStatusFlow();
});

window.addEventListener('starlight-website-content-hydrated', (event) => {
  dailyCopy = event.detail?.daily || dailyCopy;
});

window.addEventListener('starlight-ownership-changed', () => {
  // Clear painted results / CTAs synchronously before any await.
  clearStalePresentation();
  activeOwnerId = null;
  status('');
  void initialize();
});

initialize();
