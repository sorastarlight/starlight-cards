import { loginShellHref } from '../shell-route-utils.js';
import { supabase } from '../supabase-client.js';
import { getStarBitsExchangePreview } from '../star-bits-service.js';
import { openStarBitsBoosterById } from '../daily-booster-service.js';
import { applyAwardedCardsToLocalStore, captureOwnershipEpoch } from '../collection-local-store.js';
import { revealRewardSequence } from '../reward-reveal.js?v=1.5.23';
import { getCachedWebsiteContent } from '../website-content-hydrate.js';
import { maybeCelebrateSeriesCompletions } from '../series-complete-celebration.js?v=1.0.0';
import { notifyShellEconomyChanged } from '../shell-economy.js';
import { notifyShellFeedChanged } from '../shell-feed-notify.js';
import { starBitAmountHtml, starBitIconHtml } from '../star-bit-icon.js';

let shopCopy = getCachedWebsiteContent()?.shop || {};

const packsEl = document.getElementById('packs');
const balanceEl = document.getElementById('balance');
const walletNote = document.getElementById('wallet-note');
const statusEl = document.getElementById('status');
const sortEl = document.getElementById('sort-packs');
const featuredStage = document.getElementById('featured-stage');
const shopTabs = [...document.querySelectorAll('[data-shop-tab]')];
const modal = document.getElementById('pack-modal');
const modalClose = document.getElementById('modal-close');
const modalTitle = document.getElementById('modal-title');
const modalImage = document.getElementById('modal-image');
const modalDescription = document.getElementById('modal-description');
const modalContents = document.getElementById('modal-contents');
const purchaseModal = document.getElementById('purchase-modal');
const purchaseImage = document.getElementById('purchase-image');
const purchaseTitle = document.getElementById('purchase-title');
const purchaseDescription = document.getElementById('purchase-description');
const purchaseCost = document.getElementById('purchase-cost');
const purchaseCostAmount = document.getElementById('purchase-cost-amount');
const purchaseBalance = document.getElementById('purchase-balance');
const purchaseCancel = document.getElementById('purchase-cancel');
const purchaseConfirm = document.getElementById('purchase-confirm');
const detailsModalController = window.StarlightUI.adoptModal(modal, {
  dialog: modal.querySelector('.st-dialog'),
  labelledBy: 'modal-title',
  initialFocus: modalClose,
  onClose: () => releasePortalModal(modal)
});
const purchaseModalController = window.StarlightUI.adoptModal(purchaseModal, {
  dialog: purchaseModal.querySelector('.st-dialog'),
  labelledBy: 'purchase-title',
  describedBy: 'purchase-description',
  initialFocus: purchaseConfirm,
  beforeClose: ({ reason }) => !busy || reason === 'purchase',
  onClose: () => releasePortalModal(purchaseModal)
});
const FALLBACK_PACK = 'site_assets/series01_rising_star_booster.png';
let currentBalance = 0;
let currentUser = null;
let boosterData = [];
let busy = false;
let pendingPurchase = null;
let currentTab = 'all';

function escapeHTML(value=''){
  return String(value).replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':'&quot;'}[char]));
}
function say(message='', isError=false){
  statusEl.textContent = message;
  statusEl.className = `shop-status${isError?' error':''}`;
}
function friendlyWalletMessage(error, signedIn){
  const raw = String(error?.message || error || '').trim();
  if (/permission denied|jwt|not authenticated|login required|must be signed in|authorization/i.test(raw)) {
    return signedIn
      ? 'Your Star Bits balance could not be loaded. Try signing in again.'
      : 'Sign in to see your Star Bits balance and open packs.';
  }
  if (!raw) return signedIn ? 'Star Bits balance could not be loaded.' : 'Sign in to see your Star Bits balance and open packs.';
  if (/PGRST|RPC|postgres|function|column|relation/i.test(raw)) {
    return signedIn
      ? 'Your Star Bits balance could not be loaded right now. Please try again shortly.'
      : 'Sign in to see your Star Bits balance and open packs.';
  }
  return raw;
}
function updateWalletChrome(){
  if(currentUser){
    balanceEl.textContent=currentBalance.toLocaleString();
    walletNote.textContent=currentBalance>0
      ? (shopCopy.walletReadyNote || 'Ready for your next pull')
      : (shopCopy.walletEmptyNote || 'Convert extras to earn more');
  }else{
    balanceEl.textContent='â€”';
    walletNote.textContent=shopCopy.walletSignedOutNote || 'Sign in to use Star Bits';
  }
}
function packActionHtml(booster, { featured=false } = {}){
  const cost = Number(booster.star_bits_cost) || 0;
  const id = escapeHTML(booster.id);
  const back = escapeHTML(booster.card_back_url || '');
  if (!currentUser) {
    const label = escapeHTML(shopCopy.signInToOpenCta || 'Sign in to Open');
    return `<a class="price-button gallery-link" href="${loginShellHref('signin')}" target="_top" data-shell-view="login">${label}</a>`;
  }
  const affordable = currentBalance >= cost;
  const openLabel = escapeHTML(affordable
    ? (featured ? (shopCopy.openFeaturedCta || 'Open Featured Pack') : (shopCopy.openPackCta || 'Open Pack'))
    : (shopCopy.needBitsCta || 'Need More Star Bits'));
  return `<button class="price-button" type="button" data-buy="${id}" data-cost="${cost}" data-back="${back}" ${affordable ? '' : 'disabled'}>${openLabel}</button>`;
}
function modeLabel(mode='slots'){
  return ({slots:'Rarity Pack',series:'Series Pack',exact:'Exact Reward Pack',weighted_pool:'Custom Pool',single:'Single Card Pack',mixed:'Cards + Star Bits'})[mode] || 'Starlight Pack';
}
function summarizeBooster(booster){
  if(booster.reward_mode === 'series') return `${Number(booster.card_count||1)} random card${Number(booster.card_count||1)===1?'':'s'} from one series`;
  if(booster.reward_mode === 'single') return 'One featured card';
  if(booster.reward_mode === 'exact') return 'A curated set of exact cards';
  if(booster.reward_mode === 'weighted_pool') return `${Number(booster.card_count||1)} cards from a custom pool`;
  if(booster.reward_mode === 'mixed') return `Cards plus ${Number(booster.bonus_star_bits||0)} bonus Star Bits`;
  const slots = booster.slots || [];
  if(!slots.length) return `${Number(booster.card_count||4)} configured cards`;
  return slots.map(slot=>{
    const qty=Number(slot.quantity)||0;
    const rates=(slot.booster_slot_rates||[]).filter(rate=>Number(rate.percentage)>0);
    const label=rates.length===1?rates[0].rarity:slot.name;
    return `${qty} Ã— ${label}`;
  }).join(' â€¢ ');
}
function sortedBoosters(){
  let list=[...boosterData];
  if(currentTab==='slots') list=list.filter(b=>b.reward_mode==='slots');
  if(currentTab==='series') list=list.filter(b=>b.reward_mode==='series');
  if(currentTab==='special') list=list.filter(b=>!['slots','series'].includes(b.reward_mode));
  switch(sortEl.value){
    case 'price-low': return list.sort((a,b)=>Number(a.star_bits_cost)-Number(b.star_bits_cost));
    case 'price-high': return list.sort((a,b)=>Number(b.star_bits_cost)-Number(a.star_bits_cost));
    case 'name': return list.sort((a,b)=>String(a.name).localeCompare(String(b.name)));
    default: return list.sort((a,b)=>(Number(a.sort_order||0)-Number(b.sort_order||0))||String(a.name).localeCompare(String(b.name)));
  }
}
function render(){
  const list=sortedBoosters();
  if(!list.length){
    featuredStage.innerHTML='';
    packsEl.innerHTML=`<div class="empty">${escapeHTML(shopCopy.emptyCategory||'No booster packs are currently available in this category.')}</div>`;
    return;
  }
  const featured=list[0];
  const featuredCost=Number(featured.star_bits_cost)||0;
  featuredStage.innerHTML=`<article class="featured-pack">
    <div class="featured-pack-copy">
      <p class="shop-kicker">${escapeHTML(shopCopy.featuredKicker||'Featured Booster')}</p>
      <h2>${escapeHTML(featured.name)}</h2>
      <p>${escapeHTML(featured.description||'A magical Starlight booster ready to join your collection.')}</p>
      <div class="featured-pack-meta"><span>${escapeHTML(modeLabel(featured.reward_mode))}</span><span>${escapeHTML(summarizeBooster(featured))}</span></div>
      <div class="featured-pack-actions"><strong>${starBitAmountHtml(escapeHTML, featuredCost, { iconSize: 'md', suffix: 'Star Bits' })}</strong>${packActionHtml(featured, { featured: true })}<button type="button" data-details="${escapeHTML(featured.id)}">${escapeHTML(shopCopy.previewContentsCta||'Preview Contents')}</button></div>
    </div>
    <div class="featured-pack-art"><div class="featured-orbit"></div><img src="${escapeHTML(featured.pack_image_url||FALLBACK_PACK)}" alt="${escapeHTML(featured.name)} booster pack"></div>
  </article>`;
  const guestBanner = currentUser ? '' : `<div class="signed-out shop-guest-banner" role="status"><h2>${escapeHTML(shopCopy.signedOutTitle||'Browse the shop, then sign in to open packs')}</h2><p>${escapeHTML(shopCopy.signedOutLead||'Packs are public to browse. Sign in so purchases and new cards save to your Starlight account.')}</p><a class="gallery-link" href="${loginShellHref('signin')}" target="_top" data-shell-view="login">${escapeHTML(shopCopy.signedOutCta||'Log In or Create Account')}</a></div>`;
  packsEl.innerHTML=guestBanner + list.map((booster)=>{
    const cost=Number(booster.star_bits_cost)||0;
    const image=escapeHTML(booster.pack_image_url||FALLBACK_PACK);
    const desc=escapeHTML(booster.description||'A specially configured Starlight booster pack.');
    const summary=escapeHTML(summarizeBooster(booster));
    return `<article class="pack-card">
      
      <div class="pack-art-wrap"><img class="pack-art" src="${image}" alt="${escapeHTML(booster.name)} booster pack" loading="lazy" decoding="async"></div>
      <div class="pack-copy">
        <h3 class="pack-name">${escapeHTML(booster.name)}</h3>
        <p class="pack-description">${desc}</p>
        <div class="pack-meta"><span class="meta-pill">${escapeHTML(modeLabel(booster.reward_mode))}</span><span class="meta-pill">${summary}</span></div>
        <div class="pack-price">${starBitIconHtml(escapeHTML, { size: 'md' })}<span>${cost.toLocaleString()}</span></div>
        <div class="pack-actions">
          ${packActionHtml(booster)}
          <button class="details-button" type="button" data-details="${escapeHTML(booster.id)}">${escapeHTML(shopCopy.whatsInsideCta||'Whatâ€™s Inside?')}</button>
        </div>
      </div>
    </article>`;
  }).join('');
}

function getPortalDocument(){
  try{
    if(window.parent && window.parent!==window && window.parent.document) return window.parent.document;
  }catch{}
  return document;
}
function ensureShopPortalStyles(targetDocument){
  if(targetDocument.getElementById('starlight-shop-portal-styles-v160')) return;
  const style=targetDocument.createElement('style');
  style.id='starlight-shop-portal-styles-v160';
  style.textContent=`
    .starlight-shop-portal{
      position:fixed!important;
      inset:0!important;
      z-index:2147483000!important;
      display:grid!important;
      place-items:center!important;
      width:100vw!important;
      height:100dvh!important;
      padding:clamp(12px,2.5vw,28px)!important;
      box-sizing:border-box!important;
      overflow:auto!important;
      background:rgba(37,44,88,.64)!important;
      backdrop-filter:blur(10px)!important;
      opacity:1!important;
    }
    .starlight-shop-portal.hidden{display:none!important}
    .starlight-shop-portal .st-dialog{
      position:relative!important;
      inset:auto!important;
      display:block!important;
      transform:none!important;
      width:min(620px,calc(100vw - 28px))!important;
      max-width:620px!important;
      max-height:calc(100dvh - 28px)!important;
      min-height:0!important;
      margin:auto!important;
      padding:clamp(18px,3vw,28px)!important;
      overflow:auto!important;
      box-sizing:border-box!important;
      text-align:center!important;
      scrollbar-width:thin!important;
    }
    .starlight-shop-portal .st-dialog>*{
      max-width:100%!important;
      box-sizing:border-box!important;
    }
    .starlight-shop-portal .purchase-art{
      display:block!important;
      width:min(170px,38vw)!important;
      height:min(225px,34vh)!important;
      max-width:170px!important;
      max-height:225px!important;
      margin:0 auto 10px!important;
      object-fit:contain!important;
      object-position:center!important;
      filter:drop-shadow(0 15px 20px rgba(61,83,132,.22))!important;
    }
    .starlight-shop-portal .purchase-cost{
      display:inline-flex!important;
      align-items:center!important;
      justify-content:center!important;
      gap:8px!important;
      margin:12px 0!important;
      padding:9px 16px!important;
      border-radius:999px!important;
      background:linear-gradient(135deg,#fff4ba,#ffe0ef)!important;
      color:#8b6500!important;
      font-weight:950!important;
    }
    .starlight-shop-portal .st-dialog-actions{
      display:flex!important;
      justify-content:center!important;
      align-items:center!important;
      flex-wrap:wrap!important;
      gap:12px!important;
      margin-top:18px!important;
    }
    .starlight-shop-portal .st-dialog-actions button{
      min-width:140px!important;
      min-height:46px!important;
      padding:10px 18px!important;
      border-radius:999px!important;
      font:inherit!important;
      font-weight:950!important;
      cursor:pointer!important;
    }
    .starlight-shop-portal .modal-pack{
      display:grid!important;
      grid-template-columns:minmax(150px,210px) minmax(0,1fr)!important;
      gap:20px!important;
      align-items:start!important;
      text-align:left!important;
    }
    .starlight-shop-portal .modal-pack img{
      display:block!important;
      width:100%!important;
      height:min(280px,42vh)!important;
      max-height:280px!important;
      object-fit:contain!important;
      margin:auto!important;
    }
    @media(max-width:640px){
      .starlight-shop-portal{padding:10px!important}
      .starlight-shop-portal .st-dialog{
        width:100%!important;
        max-height:calc(100dvh - 20px)!important;
        padding:18px 14px!important;
      }
      .starlight-shop-portal .modal-pack{
        grid-template-columns:1fr!important;
        text-align:center!important;
      }
      .starlight-shop-portal .modal-pack img{
        height:min(210px,30vh)!important;
      }
      .starlight-shop-portal .st-dialog-actions{
        flex-direction:column!important;
      }
      .starlight-shop-portal .st-dialog-actions button{
        width:100%!important;
      }
    }
  `;
  targetDocument.head.append(style);
}
function portalModal(element){
  const targetDocument=getPortalDocument();
  ensureShopPortalStyles(targetDocument);
  if(element.ownerDocument!==targetDocument) targetDocument.body.append(element);
  element.classList.add('starlight-shop-portal');
  targetDocument.defaultView?.requestAnimationFrame(()=>{
    const card=element.querySelector('.st-dialog');
    card?.scrollTo({top:0,left:0,behavior:'instant'});
  });
}
function releasePortalModal(element){
  element.classList.remove('starlight-shop-portal');
}

function openDetails(id){
  const booster=boosterData.find(item=>item.id===id);if(!booster)return;
  modalTitle.textContent=booster.name;
  modalImage.src=booster.pack_image_url||FALLBACK_PACK;
  modalImage.alt=`${booster.name} booster pack`;
  modalDescription.textContent=booster.description||'A specially configured Starlight booster pack.';
  const rows=[];
  if(booster.reward_mode==='slots'&&(booster.slots||[]).length){
    booster.slots.forEach(slot=>rows.push(`<div class="content-row"><span>${escapeHTML(slot.name)}</span><strong>${Number(slot.quantity)||0} card${Number(slot.quantity)===1?'':'s'}</strong></div>`));
  }else{
    rows.push(`<div class="content-row"><span>Reward Style</span><strong>${escapeHTML(modeLabel(booster.reward_mode))}</strong></div>`);
    rows.push(`<div class="content-row"><span>Pack Contents</span><strong>${escapeHTML(summarizeBooster(booster))}</strong></div>`);
  }
  if(Number(booster.bonus_star_bits)>0) rows.push(`<div class="content-row"><span>Bonus</span><strong>${starBitAmountHtml(escapeHTML, booster.bonus_star_bits, { iconSize: 'sm', suffix: 'Star Bits' })}</strong></div>`);
  modalContents.innerHTML=rows.join('');
  portalModal(modal);
  detailsModalController.open({initialFocus:modalClose});
}
function closeDetails(){
  detailsModalController.close(undefined,'page');
}
function openPurchaseModal(booster,button){
  const cost=Number(button.dataset.cost)||0;
  pendingPurchase={booster,button,cost};
  purchaseImage.src=booster.pack_image_url||FALLBACK_PACK;
  purchaseImage.alt=`${booster.name} booster pack`;
  purchaseTitle.textContent=`Open â€œ${booster.name}â€?`;
  purchaseDescription.textContent='This booster will open immediately and the cards will be saved to your collection.';
  if (purchaseCostAmount) {
    purchaseCostAmount.textContent = `${cost.toLocaleString()} Star Bits`;
  } else if (purchaseCost) {
    purchaseCost.innerHTML = `${starBitIconHtml(escapeHTML, { size: 'sm' })} <span>${cost.toLocaleString()} Star Bits</span>`;
  }
  purchaseBalance.textContent=`Your balance after purchase: ${(currentBalance-cost).toLocaleString()} Star Bits`;
  portalModal(purchaseModal);
  purchaseModalController.open({initialFocus:purchaseConfirm});
}
function closePurchaseModal(){
  if(busy)return;
  purchaseModalController.close(undefined,'page');
  pendingPurchase=null;
}
async function confirmPurchase(){
  if(busy||!pendingPurchase)return;
  const {booster,button}=pendingPurchase;
  busy=true;
  purchaseConfirm.disabled=true;purchaseCancel.disabled=true;purchaseConfirm.textContent='Openingâ€¦';
  button.disabled=true;button.textContent='Openingâ€¦';
  try{
    purchaseModalController.close(undefined,'purchase');
    const epoch = captureOwnershipEpoch();
    const result=await openStarBitsBoosterById(booster.id);
    const awardedCards = result.cards || [];
    await revealRewardSequence(awardedCards,{title:booster.name,packImageUrl:booster.pack_image_url||FALLBACK_PACK,cardBackUrl:booster.card_back_url||button.dataset.back||undefined,autoOpen:true});
    await maybeCelebrateSeriesCompletions(awardedCards);
    applyAwardedCardsToLocalStore(awardedCards, { epoch });
    pendingPurchase=null;
    notifyShellEconomyChanged({ source: 'shop-purchase', boosterId: booster.id, cards: awardedCards });
    notifyShellFeedChanged({ source: 'shop-purchase' });
    await load();
  }catch(error){
    say(error?.message||'This booster could not be opened.',true);
    button.disabled=false;
    render();
  }finally{
    busy=false;
    purchaseConfirm.disabled=false;purchaseCancel.disabled=false;purchaseConfirm.textContent='Open Pack';
  }
}
shopTabs.forEach(button=>button.addEventListener('click',()=>{
  currentTab=button.dataset.shopTab||'all';
  shopTabs.forEach(item=>item.classList.toggle('active',item===button));
  render();
}));

featuredStage.addEventListener('click',event=>{
  const buy=event.target.closest('[data-buy]');
  const details=event.target.closest('[data-details]');
  if(buy){
    const booster=boosterData.find(item=>item.id===buy.dataset.buy);
    if(booster) openPurchaseModal(booster,buy);
  }
  if(details) openDetails(details.dataset.details);
});

async function load(){
  try{
    say('');packsEl.innerHTML='<div class="empty">Preparing the Starlight Card Shopâ€¦</div>';
    balanceEl.textContent='â€”';
    walletNote.textContent='Checking accountâ€¦';
    const [{data:userData},{data:boosters,error:boosterError},{data:slots,error:slotError}] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('booster_types').select('id,name,description,star_bits_cost,pack_image_url,card_back_url,reward_mode,series_id,card_count,bonus_star_bits,sort_order').eq('is_active',true).eq('archived',false).gt('star_bits_cost',0).order('sort_order'),
      supabase.from('booster_slots').select('id,booster_id,name,quantity,sort_order,booster_slot_rates(rarity,percentage)').order('sort_order')
    ]);
    if(boosterError)throw boosterError;if(slotError)throw slotError;
    // Star Bits preview requires auth; skip the RPC for guests so browsing stays public.
    currentUser=userData?.user||null;
    let preview=null;
    let previewError=null;
    if(currentUser){
      ({preview, error:previewError} = await getStarBitsExchangePreview());
    }
    currentBalance=Number(preview?.starBitsBalance||0);
    updateWalletChrome();
    const byBooster=new Map();(slots||[]).forEach(slot=>{if(!byBooster.has(slot.booster_id))byBooster.set(slot.booster_id,[]);byBooster.get(slot.booster_id).push(slot)});
    boosterData=(boosters||[]).map(booster=>({...booster,slots:byBooster.get(booster.id)||[]}));render();
    if(previewError){
      say(friendlyWalletMessage(previewError, Boolean(currentUser)), true);
    }
    window.parent?.postMessage({type:'starlight-content-ready',view:'shop'},location.origin);
  }catch(error){packsEl.innerHTML='<div class="empty">The shop could not be loaded right now.</div>';say(friendlyWalletMessage(error, Boolean(currentUser)) || 'Could not load the Card Shop.',true)}
}

packsEl.addEventListener('click',async event=>{
  const details=event.target.closest('[data-details]');if(details){openDetails(details.dataset.details);return}
  const button=event.target.closest('[data-buy]');if(!button||busy)return;
  const booster=boosterData.find(item=>item.id===button.dataset.buy);if(!booster)return;
  openPurchaseModal(booster,button);
});
sortEl.addEventListener('change',render);
purchaseCancel.addEventListener('click',closePurchaseModal);
purchaseConfirm.addEventListener('click',confirmPurchase);
modalClose.addEventListener('click',closeDetails);
window.addEventListener('starlight-website-content-hydrated', (event) => {
  shopCopy = event.detail?.shop || shopCopy;
  // data-content hydrate can overwrite the wallet note; restore auth-aware copy.
  updateWalletChrome();
  if (boosterData.length) render();
});
void load();
