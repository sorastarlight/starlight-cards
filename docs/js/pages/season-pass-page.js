import { shellHref } from '../shell-route-utils.js';
import { notifyShellEconomyChanged } from '../shell-economy.js';
import {
  claimPendingTwitchUnlocks,
  claimSeasonPassTier,
  getMySeasonPass
} from '../season-pass-service.js';
import { beginTwitchLink, callTwitchWorker, getMyTwitchConnection } from '../twitch-service.js';
import { getCachedWebsiteContent } from '../website-content-hydrate.js';
import { starBitAmountHtml } from '../star-bit-icon.js';
import { supabase } from '../supabase-client.js';
import {
  SEASON_PASS_SUMMARY,
  formatSeasonEligibility,
  nextSeasonTier,
  seasonPointsHowTo
} from '../progression-clarity.js';

const seasonCopy = { ...(getCachedWebsiteContent()?.seasonPass || {}) };

const SUB_CHECK_STORAGE_KEY = 'starlight-season-sub-check-at';
const SUB_CHECK_TTL_MS = 30 * 60 * 1000;
const TWITCH_WORKER_TIMEOUT_MS = 8000;

const titleEl = document.getElementById('season-title');
const leadEl = document.getElementById('season-lead');
const summaryEl = document.getElementById('season-summary');
const trackEl = document.getElementById('season-track');
const benefitsEl = document.getElementById('season-benefits');
const benefitsBodyEl = document.getElementById('season-benefits-body');
const activationBannerEl = document.getElementById('season-activation-banner');
const promoHelpEl = document.getElementById('season-promo-help');

let seasonCountdownTimer = null;
let twitchProfile = { linked: false };

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[char]));

function toast(message, type = '') {
  if (window.StarlightUI?.toast) {
    window.StarlightUI.toast(message, type);
  }
  if (summaryEl) {
    summaryEl.textContent = message;
  }
}

function stopSeasonCountdown() {
  if (seasonCountdownTimer) {
    clearInterval(seasonCountdownTimer);
    seasonCountdownTimer = null;
  }
}

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(new Date(value));
  } catch {
    return '';
  }
}

function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  parts.push(`${hours}h`, `${minutes}m`, `${seconds}s`);
  return parts.join(' ');
}

function seasonScheduleHtml(season = {}) {
  const started = formatDate(season.startsAt);
  const ended = formatDate(season.endsAt);
  const startLabel = started ? `Started ${started}` : '';
  const endLabel = ended ? `Ended ${ended}` : 'Season ended';

  return `
    <div class="season-schedule">
      ${startLabel ? `<p class="season-started">${esc(startLabel)}</p>` : ''}
      <p class="season-countdown" data-season-countdown data-ends-at="${esc(season.endsAt || '')}" data-ended-label="${esc(endLabel)}" aria-atomic="true">Ends in —</p>
    </div>
  `;
}

function parseSeasonBenefits(season = {}) {
  const cmsList = String(seasonCopy.benefitsList || '').trim();
  if (cmsList) {
    return cmsList.split(/\r?\n+/).map((item) => item.trim()).filter(Boolean);
  }
  const raw = String(season.description || '').trim();
  if (raw.includes('*')) {
    return raw.split(/\s*\*\s*/).map((item) => item.trim()).filter(Boolean);
  }
  if (raw) return [raw];
  return [];
}

function applyExclusivePromoCopy() {
  const link = document.querySelector('.season-pass-promo-link');
  if (!link) return;
  const url = String(seasonCopy.exclusivePromoUrl || link.getAttribute('href') || '').trim();
  if (url) link.href = url;
}

function renderBenefits(season = {}) {
  if (!benefitsEl) return;
  const benefits = parseSeasonBenefits(season);
  benefitsEl.hidden = false;
  applyExclusivePromoCopy();

  if (!benefitsBodyEl) return;
  if (!benefits.length) {
    benefitsBodyEl.replaceChildren();
    return;
  }

  benefitsBodyEl.innerHTML = `
    <h2 class="season-benefits-title">${esc(seasonCopy.benefitsTitle || 'Included with your Twitch subscription')}</h2>
    <ul class="season-benefits-list">
      ${benefits.map((benefit) => `<li>${esc(benefit.replace(/^🎁\s*/, ''))}</li>`).join('')}
    </ul>
  `;
}

function activationIconMarkup(avatarUrl, state = 'active') {
  const url = String(avatarUrl || '').trim();
  if (url) {
    return `<img class="season-activation-avatar" src="${esc(url)}" alt="" width="44" height="44" decoding="async">`;
  }
  const glyph = state === 'pending' ? '!' : '✓';
  return `<span class="season-activation-icon" aria-hidden="true">${glyph}</span>`;
}

function renderActivationBanner(data = {}, season = {}) {
  if (!activationBannerEl) return;
  const linked = Boolean(data.twitchLinked);
  const login = String(data.twitchLogin || twitchProfile.login || '').trim();
  const avatarUrl = String(twitchProfile.avatarUrl || '').trim();
  const hasAccess = data.hasAccess !== false;

  if (hasAccess) {
    activationBannerEl.hidden = false;
    activationBannerEl.className = 'season-activation-banner is-active';
    activationBannerEl.innerHTML = `
      ${activationIconMarkup(avatarUrl, 'active')}
      <div class="season-activation-copy">
        <strong>${esc(seasonCopy.activatedTitle || 'Twitch subscriber · Season Pass active')}</strong>
        <span>${esc(seasonCopy.activatedLead || 'Your pass is unlocked for this season. Keep collecting to earn every tier reward.')}</span>
        ${login ? `<span class="season-activation-login">${esc(fillLoginToken(seasonCopy.activatedLinkedLabel || 'Linked as @{login}', login))}</span>` : ''}
      </div>
      <span class="season-activation-badge">${esc(seasonCopy.activatedBadge || 'Active now')}</span>
    `;
    return;
  }

  if (linked) {
    activationBannerEl.hidden = false;
    activationBannerEl.className = 'season-activation-banner is-pending';
    activationBannerEl.innerHTML = `
      ${activationIconMarkup(avatarUrl, 'pending')}
      <div class="season-activation-copy">
        <strong>${esc(seasonCopy.pendingTitle || 'Twitch linked · Pass not active yet')}</strong>
        <span>${esc(seasonCopy.pendingLead || 'Subscribe on Twitch, then open your Season Pass unlock gift in Received Gifts to activate.')}</span>
        ${login ? `<span class="season-activation-login">${esc(fillLoginToken(seasonCopy.activatedLinkedLabel || 'Linked as @{login}', login))}</span>` : ''}
      </div>
    `;
    return;
  }

  activationBannerEl.hidden = true;
  activationBannerEl.className = 'season-activation-banner';
  activationBannerEl.replaceChildren();
}

function fillLoginToken(template, login) {
  return String(template || '').replace(/\{login\}/g, login);
}

function renderHero(data = {}, season = {}) {
  titleEl.textContent = season.name || seasonCopy.title || 'Seasonal Collection Pass';
  if (leadEl) {
    leadEl.hidden = true;
    leadEl.textContent = '';
  }
  renderBenefits(season);
  renderActivationBanner(data, season);
}

function startSeasonCountdown() {
  stopSeasonCountdown();
  const el = summaryEl?.querySelector('[data-season-countdown]');
  if (!el) return;

  const endsAt = el.getAttribute('data-ends-at');
  const endedLabel = el.getAttribute('data-ended-label') || 'Season ended';
  if (!endsAt) {
    el.textContent = endedLabel;
    return;
  }

  const target = new Date(endsAt);
  if (Number.isNaN(target.getTime())) {
    el.textContent = endedLabel;
    return;
  }

  const tick = () => {
    const remaining = target.getTime() - Date.now();
    if (remaining <= 0) {
      el.textContent = endedLabel;
      el.classList.add('is-ended');
      stopSeasonCountdown();
      return;
    }
    el.classList.remove('is-ended');
    el.textContent = `Ends in ${formatCountdown(remaining)}`;
  };

  tick();
  seasonCountdownTimer = setInterval(tick, 1000);
}

function rewardLine(tier) {
  const parts = [];
  if (Number(tier.rewardStarBits) > 0) {
    parts.push(starBitAmountHtml(esc, tier.rewardStarBits, { iconSize: 'xs' }));
  }
  if (tier.rewardTitleName) parts.push(`Title: ${esc(tier.rewardTitleName)}`);
  if (tier.rewardFrameName) {
    parts.push(`<span class="reward-frame-chip">Frame: ${esc(tier.rewardFrameName)}</span>`);
  }
  return parts.length ? parts.join(' · ') : 'Season reward';
}

function renderLocked(data) {
  stopSeasonCountdown();
  const season = data.season || {};
  renderHero({ ...data, hasAccess: false }, season);
  const linked = Boolean(data.twitchLinked);
  const eligibility = formatSeasonEligibility({
    hasAccess: false,
    accessRequired: data.accessRequired || 'twitch_subscribers',
    twitchLinked: linked
  });
  summaryEl.innerHTML = `
    <div class="season-locked panel-inner">
      <p class="eyebrow">${esc(seasonCopy.subscriberEyebrow || 'Twitch Subscribers')}</p>
      <h2>${esc(seasonCopy.subscriberLockedTitle || 'Subscriber Collection Pass')}</h2>
      <p>${esc(seasonCopy.subscriberLockedLead || 'This season is for active Twitch subscribers. Link Twitch and subscribe to unlock the free track. New subs also receive a Season Pass unlock gift in Received Gifts.')}</p>
      <p class="season-clarity">${esc(SEASON_PASS_SUMMARY)}</p>
      <p class="season-eligibility">${esc(eligibility)}</p>
      ${seasonScheduleHtml(season)}
      <div class="season-locked-actions">
        ${linked
          ? `<p class="season-status">Linked as @${esc(data.twitchLogin || 'twitch')}</p>
             <a class="btn primary" data-shell-view="rewards" href="${shellHref('rewards')}">${esc(seasonCopy.openGiftsCta || 'Open Received Gifts')}</a>`
          : `<button class="btn primary" type="button" id="season-link-twitch">${esc(seasonCopy.linkTwitchCta || 'Link Twitch')}</button>`}
      </div>
    </div>
  `;
  startSeasonCountdown();
  trackEl.replaceChildren();
  document.getElementById('season-link-twitch')?.addEventListener('click', () => {
    beginTwitchLink('collector').catch((error) => toast(error.message || 'Unable to link Twitch.', 'error'));
  });
}

function render(data) {
  stopSeasonCountdown();

  if (!data?.found) {
    titleEl.textContent = seasonCopy.title || 'Seasonal Collection Pass';
    if (leadEl) {
      leadEl.hidden = false;
      leadEl.textContent = seasonCopy.emptyLead || seasonCopy.lead || 'No active season is configured yet.';
    }
    if (benefitsEl) {
      benefitsEl.hidden = true;
      benefitsEl.replaceChildren();
    }
    if (activationBannerEl) {
      activationBannerEl.hidden = true;
      activationBannerEl.replaceChildren();
    }
    summaryEl.innerHTML = `<p>${esc(seasonCopy.emptyTitle || 'No active season')}</p>`;
    trackEl.replaceChildren();
    return;
  }

  if (data.hasAccess === false && data.accessRequired === 'twitch_subscribers') {
    renderLocked(data);
    return;
  }

  const season = data.season || {};
  renderHero(data, season);
  const points = Number(data.points) || 0;
  const tiers = Array.isArray(data.tiers) ? data.tiers : [];
  const maxPoints = Math.max(...tiers.map((t) => Number(t.pointsRequired) || 0), 1);
  const pct = Math.min(100, Math.round((points / maxPoints) * 100));
  const milestone = nextSeasonTier(points, tiers);
  const eligibility = formatSeasonEligibility({
    hasAccess: data.hasAccess !== false,
    accessRequired: data.accessRequired,
    twitchLinked: Boolean(data.twitchLinked)
  });
  const rewardHint = milestone.tier
    ? [
        Number(milestone.tier.rewardStarBits) > 0
          ? `${Number(milestone.tier.rewardStarBits)} Star Bits`
          : '',
        milestone.tier.rewardTitleName ? `Title: ${milestone.tier.rewardTitleName}` : ''
      ].filter(Boolean).join(' · ')
    : '';

  summaryEl.innerHTML = `
    <div class="season-points">
      <div>
        <span>Season points</span>
        <strong>${points}</strong>
      </div>
      <div class="season-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${maxPoints}" aria-valuenow="${points}" aria-label="Season progress">
        <span style="width:${pct}%"></span>
      </div>
      <p class="season-next-milestone">${esc(milestone.label)}${rewardHint ? ` · ${esc(rewardHint)}` : ''}</p>
      <p class="season-clarity">${esc(SEASON_PASS_SUMMARY)}</p>
      <p class="season-eligibility">${esc(eligibility)}</p>
      <p class="season-howto"><span>How points earn</span>${esc(seasonPointsHowTo())}</p>
      ${seasonScheduleHtml(season)}
    </div>
  `;
  startSeasonCountdown();

  trackEl.replaceChildren();
  const fragment = document.createDocumentFragment();
  for (const tier of tiers) {
    const article = document.createElement('article');
    const state = tier.claimed ? 'claimed' : (tier.unlocked ? 'ready' : 'locked');
    article.className = `season-tier season-${state}`;
    article.innerHTML = `
      <div class="season-tier-index" aria-hidden="true">${Number(tier.tierIndex) || '?'}</div>
      <div class="season-tier-copy">
        <h2>${esc(tier.label)}</h2>
        <p>${Number(tier.pointsRequired) || 0} points · ${rewardLine(tier)}</p>
      </div>
      <div class="season-tier-actions"></div>
    `;
    const actions = article.querySelector('.season-tier-actions');
    if (tier.claimed) {
      const done = document.createElement('span');
      done.className = 'season-status';
      done.textContent = seasonCopy.claimedLabel || 'Claimed';
      actions.append(done);
    } else if (tier.unlocked) {
      const btn = document.createElement('button');
      btn.className = 'btn primary';
      btn.type = 'button';
      btn.textContent = seasonCopy.claimCta || 'Claim';
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          const result = await claimSeasonPassTier(tier.id);
          const bits = Number(result?.rewardStarBits) || 0;
          toast(bits > 0 ? `You discovered ${bits} Star Bits!` : 'Season reward claimed!', 'success');
          if (bits > 0) notifyShellEconomyChanged({ source: 'season-claim', rewardStarBits: bits });
          await load();
        } catch (error) {
          btn.disabled = false;
          toast(error.message || 'Unable to claim season reward.', 'error');
        }
      });
      actions.append(btn);
    } else {
      const status = document.createElement('span');
      status.className = 'season-status muted';
      status.textContent = seasonCopy.lockedLabel || 'Locked';
      actions.append(status);
    }
    fragment.append(article);
  }
  trackEl.append(fragment);
}

function shouldSkipSubscriptionCheck() {
  try {
    const lastCheck = Number(sessionStorage.getItem(SUB_CHECK_STORAGE_KEY) || 0);
    return Number.isFinite(lastCheck) && Date.now() - lastCheck < SUB_CHECK_TTL_MS;
  } catch {
    return false;
  }
}

function markSubscriptionChecked() {
  try {
    sessionStorage.setItem(SUB_CHECK_STORAGE_KEY, String(Date.now()));
  } catch {}
}

async function callTwitchWorkerWithTimeout(path, body = {}, timeoutMs = TWITCH_WORKER_TIMEOUT_MS) {
  let timer;
  try {
    return await Promise.race([
      callTwitchWorker(path, body),
      new Promise((_, reject) => {
        timer = window.setTimeout(() => reject(new Error('Twitch sync timed out.')), timeoutMs);
      })
    ]);
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}

async function maybeSyncActiveSubscription({ skipRecentCheck = true } = {}) {
  if (!twitchProfile?.linked) return false;
  let changed = false;
  try {
    const pending = await claimPendingTwitchUnlocks();
    if (Number(pending?.claimed) > 0) changed = true;
  } catch (_) {}

  if (skipRecentCheck && shouldSkipSubscriptionCheck()) {
    return changed;
  }

  try {
    await callTwitchWorkerWithTimeout('/viewer/subscription-check', {
      seasonId: 'season_2026_starlight_dawn'
    });
    markSubscriptionChecked();
    changed = true;
  } catch (_) {
    // Worker may not expose this endpoint yet; EventSub gifts + pending unlocks still work.
  }
  return changed;
}

async function refreshSeasonPassData() {
  const data = await getMySeasonPass();
  render(data);
  return data;
}

async function runBackgroundTwitchSync() {
  try {
    const shouldRefresh = await maybeSyncActiveSubscription();
    if (shouldRefresh) await refreshSeasonPassData();
  } catch (_) {}
}

async function load(options = {}) {
  const { backgroundSync = true } = options;
  try {
    stopSeasonCountdown();
    if (summaryEl) {
      summaryEl.innerHTML = `<p>${esc(seasonCopy.loadingLead || 'Loading season progress…')}</p>`;
    }

    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) {
      summaryEl.innerHTML = `
        <div class="season-locked panel-inner">
          <p class="eyebrow">Season Pass</p>
          <h2>Sign in to view season progress</h2>
          <p class="season-clarity">${esc(SEASON_PASS_SUMMARY)}</p>
          <p class="season-eligibility">${esc(formatSeasonEligibility({
            hasAccess: false,
            accessRequired: 'twitch_subscribers',
            twitchLinked: false
          }))}</p>
          <div class="season-locked-actions">
            <a class="btn primary" data-shell-view="login" href="${shellHref('login')}">Sign In</a>
          </div>
        </div>
      `;
      trackEl.replaceChildren();
      return;
    }

    const [data, connection] = await Promise.all([
      getMySeasonPass(),
      getMyTwitchConnection().catch(() => ({ linked: false }))
    ]);
    twitchProfile = connection || { linked: false };
    render(data);

    if (backgroundSync) {
      void runBackgroundTwitchSync();
    }
  } catch (error) {
    stopSeasonCountdown();
    const message = String(error?.message || 'Sign in required.');
    const needsSignIn = /sign in|jwt|auth|permission denied|not authenticated|login/i.test(message);
    summaryEl.innerHTML = `
      <div class="season-locked panel-inner">
        <p class="eyebrow">Season Pass</p>
        <h2>${esc(needsSignIn ? 'Sign in to view season progress' : 'Unable to load Season Pass')}</h2>
        <p class="season-clarity">${esc(SEASON_PASS_SUMMARY)}</p>
        <p>${esc(needsSignIn ? 'Sign in to track season points, eligibility, and tier rewards.' : message)}</p>
        ${needsSignIn
          ? `<div class="season-locked-actions"><a class="btn primary" data-shell-view="login" href="${shellHref('login')}">Sign In</a></div>`
          : ''}
      </div>
    `;
    trackEl.replaceChildren();
  }
}

applyExclusivePromoCopy();
if (titleEl && seasonCopy.title) {
  titleEl.textContent = seasonCopy.title;
}
renderBenefits({});
promoHelpEl?.addEventListener('click', () => {
  const message = String(seasonCopy.exclusivePromoHelp || '').trim()
    || 'This exclusive Starlight card cannot be pulled from regular boosters. Subscribe on Twitch during the season to unlock it through your Season Pass rewards.';
  if (window.StarlightUI?.alert) {
    window.StarlightUI.alert({
      title: seasonCopy.exclusivePromoTitle || 'Season Pass exclusive',
      message
    });
    return;
  }
  toast(message, 'info');
});
window.addEventListener('starlight-website-content-hydrated', (event) => {
  Object.assign(seasonCopy, event.detail?.seasonPass || {});
  applyExclusivePromoCopy();
});

void load();
