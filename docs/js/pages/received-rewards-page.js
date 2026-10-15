import { getReceivedRewards, claimReceivedReward, dismissReceivedReward } from '../received-rewards-service.js';
import { revealRewardSequence } from '../reward-reveal.js?v=1.5.23';
import { getCachedWebsiteContent } from '../website-content-hydrate.js';
import { maybeCelebrateSeriesCompletions } from '../series-complete-celebration.js?v=1.0.0';
import { notifyShellEconomyChanged } from '../shell-economy.js';
import { applyAwardedCardsToLocalStore, captureOwnershipEpoch } from '../collection-local-store.js';
import { starBitAmountHtml } from '../star-bit-icon.js';

let rewardsCopy = getCachedWebsiteContent()?.rewards || {};

const list = document.getElementById('list');
const status = document.getElementById('status');
let rewards = [];
let filter = 'pending';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[c]));

function label(r) {
  const p = r.rewardPayload || {};
  if (r.rewardType === 'star_bits') {
    return starBitAmountHtml(esc, p.amount || 0, { iconSize: 'sm', suffix: 'Star Bits' });
  }
  if (r.rewardType === 'single_card') return `${p.quantity || 1} card${Number(p.quantity || 1) === 1 ? '' : 's'}`;
  if (r.rewardType === 'booster') return p.boosterName || 'Booster Pack';
  if (r.rewardType === 'season_pass_unlock') return 'Seasonal Collection Pass Unlock';
  return 'Card Bundle';
}

function labelHtml(r) {
  if (r.rewardType === 'star_bits') return label(r);
  return esc(label(r));
}

function sourceLabel(r) {
  return ({
    twitch: 'Twitch Redeem',
    reward_code: 'Reward Code',
    admin_gift: 'Starlight Gift',
    event_reward: 'Event Reward'
  }[r.sourceType] || String(r.sourceType || 'Gift').replaceAll('_', ' '));
}

function render() {
  const rows = rewards.filter(r => filter === 'all' || r.status === filter);
  const emptyTitle = esc(rewardsCopy.emptyTitle || 'No gifts here right now âœ¨');
  const emptyLead = esc(rewardsCopy.emptyLead || 'Twitch redeems, codes, and gifts will appear here.');
  list.innerHTML = rows.map(r => `<article id="gift-${esc(r.id)}" class="reward ${esc(r.status)}"><div class="icon">${r.sourceType === 'twitch' ? 'ðŸ“º' : r.sourceType === 'reward_code' ? 'ðŸŽŸï¸' : 'ðŸŽ'}</div><div><h2>${esc(r.title)}</h2><div class="preview"><span class="chip">${labelHtml(r)}</span><span class="chip">${esc(sourceLabel(r))}</span><span class="chip">${r.status === 'pending' ? 'Ready to Open' : 'Claimed'}</span></div><p class="desc">${esc(r.message || 'A Starlight reward is waiting for you.')}</p><div class="meta">Received ${new Date(r.createdAt).toLocaleString()}${r.claimedAt ? ` Â· Claimed ${new Date(r.claimedAt).toLocaleString()}` : ''}</div></div><div class="actions">${r.status === 'pending' ? `<button class="btn claim" data-claim="${r.id}">Open Reward</button>` : `<button class="btn secondary" data-dismiss="${r.id}">Remove</button>`}</div></article>`).join('')
    || `<div class="empty"><h2>${emptyTitle}</h2><p>${emptyLead}</p></div>`;
  document.querySelectorAll('[data-claim]').forEach(b => { b.onclick = () => claim(b.dataset.claim); });
  document.querySelectorAll('[data-dismiss]').forEach(b => {
    b.onclick = async () => {
      await dismissReceivedReward(b.dataset.dismiss);
      await load();
      window.parent?.postMessage({ type: 'starlight-rewards-changed' }, location.origin);
    };
  });
}

async function claim(id) {
  try {
    status.textContent = 'Opening your rewardâ€¦';
    const reward = rewards.find(item => String(item.id) === String(id));
    const out = await claimReceivedReward(id);
    const snapshot = out?.snapshot?.result || out?.snapshot || {};
    const payload = reward?.rewardPayload || snapshot?.rewardPayload || {};
    const cards = snapshot?.cards || [];
    if (Array.isArray(cards) && cards.length) {
      const epoch = captureOwnershipEpoch();
      await revealRewardSequence(cards, {
        title: reward?.title || payload.boosterName || 'Starlight Gift',
        packImageUrl: payload.packImageUrl || payload.pack_image_url || snapshot.packImageUrl || snapshot.pack_image_url || '',
        cardBackUrl: payload.cardBackUrl || payload.card_back_url || snapshot.cardBackUrl || snapshot.card_back_url || undefined
      });
      await maybeCelebrateSeriesCompletions(cards);
      applyAwardedCardsToLocalStore(cards, { epoch });
      notifyShellEconomyChanged({
        source: 'received-gift',
        rewardType: out?.rewardType || reward?.rewardType,
        cards
      });
    } else if (out?.rewardType === 'season_pass_unlock' || reward?.rewardType === 'season_pass_unlock') {
      status.textContent = 'Season Pass unlocked! Open Seasonal Collection Pass to play the track.';
      window.parent?.postMessage({ type: 'starlight-navigate', view: 'season-pass' }, location.origin);
      await load();
      window.parent?.postMessage({ type: 'starlight-rewards-changed' }, location.origin);
      return;
    }
    status.textContent = 'Reward claimed successfully!';
    await load();
    window.parent?.postMessage({ type: 'starlight-rewards-changed' }, location.origin);
    if (
      out?.rewardType === 'star_bits'
      || reward?.rewardType === 'star_bits'
      || Number(snapshot?.amount || reward?.rewardPayload?.amount || 0) > 0
    ) {
      notifyShellEconomyChanged({ source: 'received-gift', rewardType: out?.rewardType || reward?.rewardType });
    }
  } catch (e) {
    status.textContent = e.message || 'Unable to claim reward.';
  }
}

async function load() {
  try {
    const out = await getReceivedRewards(null);
    rewards = out.rewards || [];
    const target = new URLSearchParams(location.search).get('rewardId') || new URLSearchParams(location.search).get('gift');
    if (target) {
      filter = 'all';
      document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.filter === 'all'));
    }
    render();
    if (target) {
      requestAnimationFrame(() => {
        const el = document.getElementById('gift-' + CSS.escape(target));
        if (el) {
          el.classList.add('targeted');
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    }
    status.textContent = '';
  } catch (e) {
    status.textContent = e.message || 'Unable to load received rewards.';
  }
}

document.querySelectorAll('.tab').forEach(b => {
  b.onclick = () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    filter = b.dataset.filter;
    render();
  };
});
window.addEventListener('starlight-website-content-hydrated', (event) => {
  rewardsCopy = event.detail?.rewards || rewardsCopy;
});
void load();
