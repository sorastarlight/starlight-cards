import { supabase } from "./supabase-client.js";
import { applyDailyNavReadyState } from "./daily-nav-indicator.js";
import {
  COLLECTOR_XP_SUMMARY,
  collectorXpRatesLine,
  describeCollectorProgress
} from "./progression-clarity.js";

let countdownTimer = null;

function setText(selector, value) {
  document.querySelectorAll(selector).forEach(el => { el.textContent = String(value); });
}
function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function startCountdown(dateValue) {
  if (countdownTimer) clearInterval(countdownTimer);
  const target = new Date(dateValue);
  const tick = () => {
    const remaining = target.getTime() - Date.now();
    if (remaining <= 0) {
      setText('[data-daily-countdown]', 'Available now!');
      clearInterval(countdownTimer);
      return;
    }
    setText('[data-daily-countdown]', formatCountdown(remaining));
  };
  tick();
  countdownTimer = setInterval(tick, 1000);
}
function paintCollectorProgress(xp, { signedIn = true } = {}) {
  const progress = describeCollectorProgress(xp);
  setText('[data-collector-level]', progress.level);
  setText('[data-collector-points]', progress.xp.toLocaleString());
  setText('[data-next-level-points]', progress.next.toLocaleString());
  setText(
    '[data-level-milestone]',
    signedIn ? progress.milestone : 'Sign in to track level progress'
  );
  document.querySelectorAll('[data-level-progress]').forEach((el) => {
    el.style.width = `${signedIn ? progress.percent : 0}%`;
  });
  document.querySelectorAll('[data-progression-gloss]').forEach((el) => {
    el.textContent = `${COLLECTOR_XP_SUMMARY} XP per card: ${collectorXpRatesLine()}.`;
  });
  document.querySelectorAll('[data-level-unlock-hint]').forEach((el) => {
    if (!signedIn || !progress.unlockHint) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = progress.unlockHint;
  });
}

async function loadEconomy() {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    setText('[data-star-bits]', '—'); setText('[data-duplicates]', '—');
    setText('[data-favorite-count]', '—');
    setText('[data-total-copies]', '—');
    paintCollectorProgress(0, { signedIn: false });
    document.querySelectorAll('[data-daily-status]').forEach(el=>el.textContent='Sign in to claim');
    document.querySelectorAll('[data-daily-cta]').forEach(el=>{el.classList.remove('is-loading','is-ready','is-claimed');el.classList.add('is-claimed');});
    setText('[data-daily-cta-label]', 'Sign In for Free Daily Starlight Pack');
    applyDailyNavReadyState(false);
    return;
  }
  const [{data: preview,error:previewError},{data: daily,error:dailyError},{data: rows,error:cardsError},{data: profile},{data: wallet}] = await Promise.all([
    supabase.rpc('get_star_bits_exchange_preview'),
    supabase.rpc('get_daily_booster_status'),
    supabase.from('user_cards').select('card_id,quantity,is_favorite,cards(rarity)'),
    supabase.from('profiles').select('username,onboarding_complete').eq('id', authData.user.id).maybeSingle(),
    supabase.from('user_wallets').select('collector_xp').eq('user_id', authData.user.id).maybeSingle()
  ]);
  if (profile?.username && profile?.onboarding_complete) {
    document.querySelectorAll('[data-public-profile-link]').forEach(link => {
      link.href = `collector.html?username=${encodeURIComponent(profile.username)}`;
    });
  }
  if (!previewError && preview) {
    setText('[data-star-bits]', Number(preview.starBitsBalance ?? 0).toLocaleString());
    setText('[data-duplicates]', Number(preview.totalDuplicateCopies ?? 0).toLocaleString());
    setText('#starBitsBalance', Number(preview.starBitsBalance ?? 0).toLocaleString());
    setText('#duplicateCardCount', Number(preview.totalDuplicateCopies ?? 0).toLocaleString());
  }
  if (!dailyError && daily) {
    const ctas = document.querySelectorAll('[data-daily-cta]');
    if (daily.available) {
      document.querySelectorAll('[data-daily-status]').forEach(el=>{el.textContent='Ready to Open!';el.classList.remove('daily-claimed');el.classList.add('daily-ready');});
      setText('[data-daily-countdown]', 'Free pack available now');
      setText('[data-daily-cta-label]', '🌟 CLAIM YOUR FREE DAILY STARLIGHT PACK');
      ctas.forEach(el=>{el.classList.remove('is-loading','is-claimed');el.classList.add('is-ready');el.setAttribute('aria-label','Free Daily Starlight Pack available to open now');});
      applyDailyNavReadyState(true);
    } else {
      document.querySelectorAll('[data-daily-status]').forEach(el=>{el.textContent='Claimed Today';el.classList.remove('daily-ready');el.classList.add('daily-claimed');});
      setText('[data-daily-cta-label]', 'Free Pack Claimed');
      ctas.forEach(el=>{el.classList.remove('is-loading','is-ready');el.classList.add('is-claimed');el.setAttribute('aria-label','View Free Daily Starlight Pack countdown');});
      applyDailyNavReadyState(false);
      startCountdown(daily.nextClaimAt);
    }
  }
  if (!cardsError && Array.isArray(rows)) {
    let totalCopies=0,favorites=0;
    rows.forEach(r=>{ const q=Number(r.quantity||0); totalCopies+=q; if(r.is_favorite) favorites++; });
    // Collector XP is lifetime progression. It increases when cards are earned,
    // but never decreases when extras are traded or converted into Star Bits.
    const points=Math.max(0,Number(wallet?.collector_xp||0));
    paintCollectorProgress(points, { signedIn: true });
    setText('[data-total-copies]', totalCopies);
    setText('[data-favorite-count]', favorites);
  } else if (wallet) {
    paintCollectorProgress(Math.max(0, Number(wallet.collector_xp || 0)), { signedIn: true });
  }
}

document.addEventListener('DOMContentLoaded', loadEconomy);
window.addEventListener('starlight-cloud-ready', loadEconomy);
window.addEventListener('starlight-dashboard-refresh', loadEconomy);
