import { supabase } from './supabase-client.js';
import { getMyStaffAccess } from './staff-service.js';
import { getMyTradeOffers } from './trade-offer-service.js';
import { getMyNotifications } from './notification-service.js';
import { getActiveEvents } from './event-service.js';
import { getReceivedRewards } from './received-rewards-service.js';
import {
  aliasShellRoute,
  isKnownShellRoute,
  normalizeNotificationParams,
  resolveNotificationRoute,
  shellHref
} from './shell-route-utils.js';
import { getShellNavigation } from './shell-navigation-service.js';
import { applyShellNavigationToDom, applyShellPageTitles, populateSeriesMegaMenus } from './shell-navigation-render.js';
import { scheduleMastheadNavFit } from './masthead-nav-fit.js';
import { isStudioPreview, STUDIO_MSG } from './studio-preview.js';
import { initLiveFeedWidget } from './live-feed-widget.js?v=1.7';
import { applyAvatarFrameClass } from './avatar-frame-utils.js';
import { getMyProfileExtras } from './profile-extras-service.js';
import { applyDailyNavReadyState } from './daily-nav-indicator.js';
import { bindOwnershipToAuthUser } from './collection-local-store.js';
import {
  frameHrefMatchesRouteSrc,
  readShellViewState,
  shouldAcceptEmbeddedHandshake,
  shouldReenterLoadingOnFrameLoad
} from './shell-view-readiness.js';

const SHELL_BUILD = '94.5.5';
const VIEW_READY_TIMEOUT_MS = 6500;
const MAX_VIEW_RETRIES = 1;
const SFX_KEY = 'sora-starlight-card-binder-v7-sfx';

const routes = {
  home:{title:'Home',src:'home.html'},
  binder:{title:'Card Gallery',src:null}, collection:{title:'My Card Binder',src:'collection.html'},
  // Keep .html on production (GH Pages serves it with query intact). Extensionless also
  // works there, but this route is not changed solely for local static-server redirects.
  daily:{title:'Free Daily Starlight Pack',src:'daily-booster.html'}, shop:{title:'Shop',src:'booster-shop.html'}, events:{title:'Events',src:'events.html'}, redeem:{title:'Redeem Code',src:'redeem.html'},
  'star-bits':{title:'My Star Bits',src:'star-bits.html'},
  checklist:{title:'Card Checklist',src:'checklist.html'},
  quests:{title:'Missions',src:'collection-quests.html'},
  'season-pass':{title:'Twitch Season Pass',src:'season-pass.html'},
  trades:{title:'Trade',src:'trade-lists.html'}, offers:{title:'Trade',src:'trade-lists.html'},
  rankings:{title:'Rankings',src:'trade-lists.html'},
  feed:{title:'Activity Feed',src:'pull-feed.html'},
  notifications:{title:'Notifications',src:'notifications.html'}, rewards:{title:'Gifts',src:'received-rewards.html'}, profile:{title:'Profile',src:'profile-settings.html'}, login:{title:'Sign In',src:'login'}, collector:{title:'Collector Profile',src:'collector.html'},
  report:{title:'Report Profile',src:'report-profile.html'}, about:{title:'About',src:'about.html'}, socials:{title:'Socials',src:'socials.html'},
  admin:{title:'Administration Hub',src:'admin-hub.html'}, 'admin-codes':{title:'Reward Code Console',src:'admin-codes.html'},
  'admin-staff':{title:'Staff Management',src:'admin-staff.html'}, 'admin-audit':{title:'Audit Log',src:'admin-audit.html'},
  'admin-moderation':{title:'Moderation Dashboard',src:'admin-moderation.html'},
  'admin-boosters':{title:'Starlight Card Management',src:'admin-boosters.html'}, 'admin-twitch':{title:'Twitch Redeems',src:'admin-twitch.html'}, 'admin-quests':{title:'Quests & Season Pass',src:'admin-quests.html'}, 'admin-gifts':{title:'Send Gifts',src:'admin-gifts.html'}, 'admin-news':{title:'News & Updates Management',src:'admin-news.html'}, 'admin-users':{title:'Registered User Directory',src:'admin-users.html'}, 'admin-health':{title:'Database Health',src:'admin-health.html'}, 'admin-notifications':{title:'Notification Broadcasts',src:'admin-notifications.html'},
  'admin-ui':{title:'Navigation Studio',src:'admin-ui.html'},
  'admin-website':{title:'Website Editor',src:'admin-website.html'}
};

const nativeView=document.getElementById('binderNativeView');
const frameWrap=document.getElementById('shellViewFrame');
const frame=document.getElementById('shellViewIframe');
const menuButton=document.getElementById('shellMenuButton');
const drawerBackdrop=document.getElementById('shellDrawerBackdrop');
const accountMenuButton=document.getElementById('shellAccountMenuButton');
const accountMenu=document.getElementById('shellAccountMenu');
const mainContent=document.querySelector('.main');
const masthead=document.getElementById('shellMasthead');
const liveStrip=document.getElementById('shellLiveStrip');
const AVATAR_SILHOUETTE='<svg class="shell-avatar-silhouette" viewBox="0 0 40 40" width="22" height="22" focusable="false" aria-hidden="true"><circle cx="20" cy="14" r="7" fill="currentColor"/><path d="M8 33c1.8-7.2 6.4-10.5 12-10.5S30.2 25.8 32 33" fill="currentColor"/></svg>';
let profileUsername='';
let currentRoute='binder';
let currentLoadToken=0;
let readyTimer=0;
let retryCount=0;
let embeddedInitialScrollDone=false;
let liveFeedWidget = null;
let liveFeedAdminEnabled = true;
let liveFeedViewSuppressed = false;

function syncShellChromeHeights(){
  const liveH = (!liveFeedAdminEnabled || liveFeedViewSuppressed || liveStrip?.hidden)
    ? 0
    : Math.ceil(liveStrip?.getBoundingClientRect?.().height || 0);
  const mastTotalH = Math.ceil(masthead?.getBoundingClientRect?.().height || 0);
  document.documentElement.style.setProperty('--shell-live-feed-h', `${liveH}px`);
  if (mastTotalH > 0) {
    document.documentElement.style.setProperty('--shell-masthead-h', `${mastTotalH}px`);
    document.documentElement.style.setProperty('--shell-chrome-top', `${mastTotalH}px`);
  }
}

function applyLiveFeedVisibility(){
  const showAdmin = liveFeedAdminEnabled && !isStudioPreview();
  document.body.classList.toggle('shell-live-feed-off', !showAdmin);
  if (liveStrip) liveStrip.hidden = !showAdmin;
  const showWidget = showAdmin && !liveFeedViewSuppressed;
  liveFeedWidget?.setSuppressed?.(!showWidget);
  if (showAdmin && !liveFeedViewSuppressed) {
    const feed = document.getElementById('shellLiveFeed');
    if (feed) {
      feed.hidden = false;
      feed.classList.remove('is-suppressed');
    }
  }
  syncShellChromeHeights();
}

function closeAllMegaMenus(){
  document.querySelectorAll('.shell-mega.is-open').forEach(mega=>{
    mega.classList.remove('is-open');
    const trigger=mega.querySelector('[data-mega-trigger]');
    const panel=mega.querySelector('.shell-mega-panel');
    if(trigger) trigger.setAttribute('aria-expanded','false');
    if(panel) panel.hidden=true;
  });
}

function setShellMenuOpen(open){
  document.body.classList.toggle('shell-menu-open', open);
  if(drawerBackdrop) drawerBackdrop.hidden=!open;
  if(!open) closeAllMegaMenus();
}

function openMegaMenu(mega){
  if(!mega) return;
  closeAllMegaMenus();
  mega.classList.add('is-open');
  const trigger=mega.querySelector('[data-mega-trigger]');
  const panel=mega.querySelector('.shell-mega-panel');
  if(trigger) trigger.setAttribute('aria-expanded','true');
  if(panel) panel.hidden=false;
}

function wireMastheadMenus(){
  masthead?.addEventListener('click', event=>{
    const trigger=event.target.closest('[data-mega-trigger]');
    if(trigger){
      event.preventDefault();
      event.stopPropagation();
      const mega=trigger.closest('.shell-mega');
      const wasOpen=mega?.classList.contains('is-open');
      closeAllMegaMenus();
      if(!wasOpen) openMegaMenu(mega);
      return;
    }
    if(event.target.closest('.shell-mega-panel a, .shell-top-link')){
      closeAllMegaMenus();
      setShellMenuOpen(false);
    }
  });
  // Close when clicking anywhere outside an open mega (logo, account, chrome, empty page chrome).
  document.addEventListener('click', event=>{
    if(event.target.closest('.shell-mega.is-open')) return;
    closeAllMegaMenus();
  });
  // Content views load in an iframe, so parent document clicks never see them.
  window.addEventListener('blur', ()=>{
    requestAnimationFrame(()=>{
      const frame=document.getElementById('shellViewIframe');
      if(frame && document.activeElement===frame){
        closeAllMegaMenus();
        setShellMenuOpen(false);
      }
    });
  });
  document.addEventListener('keydown', event=>{
    if(event.key==='Escape'){
      closeAllMegaMenus();
      setShellMenuOpen(false);
    }
  });
}

function locationExtraParams(){
  const extra={};
  try{
    new URLSearchParams(location.search).forEach((value, key)=>{
      if(key!=='view' && value) extra[key]=value;
    });
  }catch(_e){/* ignore */}
  return extra;
}

window.StarlightShellNav = {
  populateSeriesMegaMenus,
  closeAllMegaMenus
};

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

function ensureViewStateUi(){
  if(!frameWrap)return {};
  let state=frameWrap.querySelector('.shell-view-state');
  if(!state){
    state=document.createElement('div');
    state.className='shell-view-state';
    state.innerHTML=`<div class="shell-view-loader" aria-hidden="true"></div><strong>Loading view…</strong><p>Please wait while the Starlight Binder prepares this page.</p><button type="button" class="shell-view-retry">Try Again</button>`;
    frameWrap.appendChild(state);
    state.querySelector('.shell-view-retry')?.addEventListener('click',()=>loadEmbeddedView(currentRoute,{force:true,resetRetry:true}));
  }
  return {state,retry:state.querySelector('.shell-view-retry'),label:state.querySelector('strong'),description:state.querySelector('p')};
}

function setViewState(mode,message=''){
  const {state,retry,label,description}=ensureViewStateUi();
  if(!state)return;
  state.dataset.state=mode;
  state.hidden=mode==='ready';
  frameWrap?.classList.toggle('is-loading',mode==='loading');
  frameWrap?.classList.toggle('has-error',mode==='error');
  if(label)label.textContent=mode==='error'?'This page did not finish loading':`Loading ${routes[currentRoute]?.title||'view'}…`;
  if(description)description.textContent=message||(mode==='error'?'This page did not finish loading. Try again — a cached copy may have been incomplete.':'Please wait while the Starlight Binder prepares this page.');
  if(retry)retry.hidden=mode!=='error';
}

function buildSrc(route,{retry=0,token=Date.now()}={}){
  const r=routes[route]||routes.binder;
  if(!r.src)return null;
  const current=new URLSearchParams(location.search);
  const p=new URLSearchParams();
  p.set('embed','1');
  p.set('shellBuild',SHELL_BUILD);
  p.set('shellLoad',String(token));
  if(retry)p.set('shellRetry',String(retry));
  for(const [k,v] of current){if(k!=='view'&&!p.has(k))p.set(k,v)}
  if(route==='collector' && !p.get('username') && profileUsername)p.set('username',profileUsername);
  return `${r.src}?${p.toString()}`;
}

function setActive(route){document.querySelectorAll('[data-shell-view]').forEach(a=>a.classList.toggle('active',a.dataset.shellView===route));}

function clearReadyTimer(){if(readyTimer){window.clearTimeout(readyTimer);readyTimer=0;}}

function armReadyTimeout(route,token){
  clearReadyTimer();
  readyTimer=window.setTimeout(()=>{
    if(route!==currentRoute||token!==currentLoadToken)return;
    if(retryCount<MAX_VIEW_RETRIES){
      retryCount+=1;
      loadEmbeddedView(route,{force:true});
      return;
    }
    setViewState('error');
  },VIEW_READY_TIMEOUT_MS);
}

function requestEmbeddedReady(){
  try{
    frame?.contentWindow?.postMessage({ type: 'starlight-shell-request-ready' }, location.origin);
  }catch{
    /* ignore */
  }
}

function loadEmbeddedView(route,{force=false,resetRetry=false}={}){
  if(!frame||!routes[route]?.src)return;
  if(resetRetry)retryCount=0;
  embeddedInitialScrollDone=false;
  const routeSrc=routes[route].src;
  const currentHref=getFrameLocation();
  const restoredSameRoute=force
    && currentHref
    && !currentHref.includes('about:blank')
    && frameHrefMatchesRouteSrc(currentHref, routeSrc);

  // Back/forward often restores the embedded document via session history while the
  // shell issues a new shellLoad token. Replacing again can race and leave loading
  // stuck because the live document still carries the previous token. Adopt it.
  if(restoredSameRoute){
    let liveToken='';
    try{ liveToken=new URL(currentHref).searchParams.get('shellLoad')||''; }catch{ /* ignore */ }
    currentLoadToken=liveToken||Date.now();
    setViewState('loading');
    frame.style.height='720px';
    frame.setAttribute('scrolling','no');
    frame.dataset.route=route;
    armReadyTimeout(route,currentLoadToken);
    requestEmbeddedReady();
    // Cached embeds may not listen for request-ready; finish immediately when the
    // restored document is already in embedded mode.
    try{
      const child=frame.contentDocument;
      if(child?.documentElement?.classList?.contains('starlight-embedded')){
        const height=Math.max(
          child.documentElement?.scrollHeight||0,
          child.body?.scrollHeight||0,
          720
        );
        markViewReady(
          { view: route, loadToken: currentLoadToken, height },
          { origin: location.origin, source: frame.contentWindow }
        );
      }
    }catch{ /* ignore */ }
    return;
  }

  currentLoadToken=Date.now();
  const src=buildSrc(route,{retry:retryCount,token:currentLoadToken});
  setViewState('loading');
  frame.style.height='720px';
  frame.setAttribute('scrolling','no');
  frame.dataset.route=route;
  const absolute=new URL(src,location.href).href;
  // Use location.replace so iframe document swaps do not create extra session
  // history entries that break the browser Back button alongside pushState.
  if(force||getFrameLocation()!==absolute)setFrameLocation(absolute);
  armReadyTimeout(route,currentLoadToken);
}

function getFrameLocation(){
  if(!frame)return '';
  try{
    return frame.contentWindow?.location?.href||'';
  }catch{
    return '';
  }
}

function setFrameLocation(url){
  if(!frame)return;
  const absolute=new URL(url,location.href).href;
  try{
    if(frame.contentWindow){
      frame.contentWindow.location.replace(absolute);
      return;
    }
  }catch{
    /* fall through to src assignment */
  }
  frame.src=absolute;
}

function navigate(route,{push=true,extra={}}={}){
  closeNotificationPopover();
  closeAccountMenu();
  const resolved = aliasShellRoute(route) || (isKnownShellRoute(route) ? route : '');
  if(!resolved){
    console.warn('[Starlight] Unknown shell route ignored:', route);
    return;
  }
  const previousRoute = currentRoute;
  route = resolved;
  if (route === 'rankings') {
    extra = { section: 'collectors', ...(extra || {}) };
  }
  if (route === 'trades' && !extra?.section) {
    extra = { section: 'my-trade', ...(extra || {}) };
  }
  if (route === 'offers') {
    route = 'trades';
    const tab = String(extra?.tab || '').toLowerCase();
    extra = {
      section: extra?.section || (extra?.username ? 'collectors' : 'progress'),
      ...(tab === 'incoming' || tab === 'outgoing' ? { sub: tab } : {}),
      ...(extra || {})
    };
    delete extra.tab;
  }
  currentRoute=route;
  retryCount=0;
  const url=new URL(location.href);
  const preserved = new Set(['view']);
  for (const key of [...url.searchParams.keys()]) {
    if (!preserved.has(key)) url.searchParams.delete(key);
  }
  url.searchParams.set('view',route);
  for(const[k,v]of Object.entries(extra||{})){if(v!=null&&v!=='')url.searchParams.set(k,v)}
  if(push)history.pushState({view:route},'',url);
  setActive(route);
  document.body.classList.remove('shell-menu-open');
  if(drawerBackdrop) drawerBackdrop.hidden=true;
  closeAllMegaMenus();
  mainContent?.scrollTo({top:0,left:0,behavior:'auto'});
  if(route==='binder'){
    clearReadyTimer();
    nativeView?.classList.remove('hidden');
    frameWrap?.classList.remove('active','is-loading','has-error');
    if(frame)setFrameLocation('about:blank');
    document.title='Card Gallery | Starlight Card Binder';
    const series = extra?.series;
    const hasCardSet = Object.prototype.hasOwnProperty.call(extra || {}, 'cardSet');
    if (hasCardSet && window.applyStarlightCardSetFilter) {
      window.applyStarlightCardSetFilter(extra.cardSet, { render: false });
    }
    if (series && window.applyStarlightSeriesFilter) {
      window.applyStarlightSeriesFilter(series);
    } else {
      window.renderAll?.();
    }
    if(previousRoute==='login')scheduleHydrateAccount();
    return;
  }
  nativeView?.classList.add('hidden');
  frameWrap?.classList.add('active');
  document.title=`${routes[route].title} | Starlight Card Binder`;
  loadEmbeddedView(route,{force:true,resetRetry:true});
  window.scrollTo({top:0,left:0,behavior:'auto'});
  if(previousRoute==='login')scheduleHydrateAccount();
}

function viewsShareEmbeddedSrc(a, b) {
  const left = routes[a];
  const right = routes[b];
  return Boolean(left?.src && right?.src && left.src === right.src);
}

function acceptEmbeddedHandshake(data={}, event=null){
  const shareSrc = Boolean(
    data.view
    && routes[data.view]
    && viewsShareEmbeddedSrc(data.view, currentRoute)
  );
  return shouldAcceptEmbeddedHandshake({
    origin: event?.origin,
    expectedOrigin: location.origin,
    source: event?.source ?? null,
    expectedSource: frame?.contentWindow || null,
    messageView: data.view,
    messageLoadToken: data.loadToken,
    currentRoute,
    currentLoadToken,
    shareSrc,
    frameHref: getFrameLocation(),
    routeSrc: routes[currentRoute]?.src || null,
    requireFrameSrcMatch: Boolean(routes[currentRoute]?.src)
  });
}

function markViewReady(data={}, event=null){
  if (!acceptEmbeddedHandshake(data, event)) {
    return;
  }
  clearReadyTimer();
  setViewState('ready');
  if(Number.isFinite(Number(data.height)))resizeEmbeddedView(Number(data.height));
  if(!embeddedInitialScrollDone){
    embeddedInitialScrollDone=true;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        mainContent?.scrollTo({top:0,left:0,behavior:'auto'});
        window.scrollTo({top:0,left:0,behavior:'auto'});
      });
    });
  }
}

function handleEmbeddedLoadFailure(){
  if(!frameWrap?.classList.contains('active'))return;
  if(currentRoute==='binder'||!routes[currentRoute]?.src)return;
  const token=currentLoadToken;
  const route=currentRoute;
  if(retryCount<MAX_VIEW_RETRIES){
    retryCount+=1;
    loadEmbeddedView(route,{force:true});
    return;
  }
  if(route!==currentRoute||token!==currentLoadToken)return;
  clearReadyTimer();
  setViewState('error');
}

function resetEmbeddedViewLayout(height){
  if(!frame)return;
  if(Number.isFinite(height)&&height>0)resizeEmbeddedView(height);
  mainContent?.scrollTo({top:0,left:0,behavior:'auto'});
  window.scrollTo({top:0,left:0,behavior:'auto'});
  frameWrap?.scrollIntoView?.({block:'start',behavior:'auto'});
}

function resizeEmbeddedView(value){
  if(!frame)return;
  const height=Math.max(560,Math.min(20000,Math.ceil(value||0)+8));
  frame.style.height=`${height}px`;
}



function normalizeNotificationRoute(value,notice={}){
  const hint=`${notice.notification_type||''} ${notice.title||''} ${notice.body||''} ${notice.source_key||''}`.toLowerCase();
  if(/reward|gift|twitch redeem|code accepted|booster.*waiting/.test(hint))return 'rewards';
  if(/daily.*booster/.test(hint))return 'daily';
  if(/trade/.test(hint)&&(!value||String(value).toLowerCase()==='binder'))return 'offers';
  const raw=String(value||'binder').trim();
  const withoutShell=raw.replace(/^https?:\/\/[^/]+\/?/i,'').replace(/^\/?binder\.html\?view=/i,'').replace(/^\/?/,'');
  const key=withoutShell.split(/[?&#]/)[0].toLowerCase();
  const aliases={daily:'daily','daily-booster':'daily','daily-booster.html':'daily','free-daily-booster':'daily',notifications:'notifications','notifications.html':'notifications',collection:'collection','collection.html':'collection',offers:'offers','trade-offers':'offers','trade-offers.html':'offers',trades:'trades','trade-lists':'trades','trade-lists.html':'trades',events:'events','events.html':'events',shop:'shop','booster-shop':'shop','booster-shop.html':'shop',profile:'profile','profile-settings':'profile','profile-settings.html':'profile',rewards:'rewards','received-rewards':'rewards','received-rewards.html':'rewards',collector:'collector','collector.html':'collector',report:'report','report-profile':'report','report-profile.html':'report',quests:'quests','collection-quests':'quests','collection-quests.html':'quests','season-pass':'season-pass','season-pass.html':'season-pass'};
  return aliases[key]||key||'binder';
}

function escShell(value){
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[char]));
}

function closeNotificationPopover(){
  const pop=document.querySelector('.shell-notification-popover');
  if(pop)pop.hidden=true;
}

function setAccountMenuOpen(open){
  if(!accountMenu||!accountMenuButton)return;
  accountMenu.hidden=!open;
  accountMenuButton.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function closeAccountMenu(){
  setAccountMenuOpen(false);
}

function setShellAvatar(photoUrl, frame = null){
  const avatar=document.querySelector('[data-shell-avatar]');
  if(!avatar)return;
  if(photoUrl){
    avatar.replaceChildren();
    avatar.style.backgroundImage=`url(${JSON.stringify(String(photoUrl))})`;
    avatar.style.backgroundSize='cover';
    avatar.style.backgroundPosition='center';
    avatar.classList.add('has-photo');
    avatar.classList.remove('is-placeholder');
  } else {
    avatar.style.backgroundImage='';
    avatar.classList.remove('has-photo');
    avatar.classList.add('is-placeholder');
    avatar.innerHTML=AVATAR_SILHOUETTE;
  }
  applyAvatarFrameClass(avatar, frame);
}

function ensureNotificationPopover(){
  const button=document.querySelector('.shell-notification-button');
  if(!button||document.querySelector('.shell-notification-popover'))return;
  const pop=document.createElement('div');
  pop.className='shell-notification-popover';
  pop.hidden=true;
  pop.innerHTML=`<div class="shell-popover-head"><strong>Notifications</strong><a href="${shellHref('notifications')}" data-shell-view="notifications">View all</a></div><div class="shell-popover-list">Loading…</div>`;
  button.parentElement?.appendChild(pop);
  button.addEventListener('click',async e=>{
    e.preventDefault();
    e.stopPropagation();
    pop.hidden=!pop.hidden;
    if(pop.hidden)return;
    try{
      const data=await getMyNotifications(5);
      const rows=data?.notifications||[];
      pop.querySelector('.shell-popover-list').innerHTML = rows.length
        ? rows.map(n => {
          const route = resolveNotificationRoute(n.route, n);
          const params = normalizeNotificationParams(n);
          return `<button type="button" data-notice-route="${escShell(route)}" data-notice-params='${escShell(JSON.stringify(params))}'>
            <span>${escShell(n.icon || '✦')}</span>
            <span><b>${escShell(n.title || 'Notification')}</b><small>${escShell(n.body || '')}</small></span>
          </button>`;
        }).join('')
        : '<p>All caught up ✨</p>';
    }catch{
      pop.querySelector('.shell-popover-list').textContent='Could not load notifications.';
    }
  });
  pop.addEventListener('click',e=>{
    const item=e.target.closest('[data-notice-route]');
    if(!item)return;
    let params={};
    try{params=JSON.parse(item.dataset.noticeParams||'{}')}catch{}
    pop.hidden=true;
    const route = aliasShellRoute(item.dataset.noticeRoute) || item.dataset.noticeRoute;
    if(!isKnownShellRoute(route)){
      navigate('notifications');
      return;
    }
    navigate(route,{extra:params});
  });
  document.addEventListener('click',e=>{if(!pop.hidden&&!pop.contains(e.target)&&e.target!==button)pop.hidden=true});
}

async function hydrateNotificationBadge(){
  document.querySelectorAll('[data-notification-badge]').forEach(b=>b.hidden=true);
  document.querySelectorAll('[data-notification-dot]').forEach(b=>b.hidden=true);
  try{
    const data=await getMyNotifications(20);const count=Number(data?.unreadCount||0);
    document.querySelectorAll('[data-notification-badge]').forEach(b=>{b.textContent=String(count);b.hidden=count===0});
    document.querySelectorAll('[data-notification-dot]').forEach(b=>{b.hidden=count===0});
  }catch(e){console.warn('[Starlight] Notification badge failed',e)}
}

async function hydrateReceivedGiftBadge(){
  const badges=document.querySelectorAll('[data-received-reward-badge]');badges.forEach(b=>b.hidden=true);
  try{const data=await getReceivedRewards('pending');const count=Number(data?.pendingCount??data?.rewards?.length??0);badges.forEach(b=>{b.textContent=String(count);b.hidden=count===0})}catch(e){console.warn('[Starlight] Received Gifts badge failed',e)}
}

async function hydrateActiveEventBanner(){
  const banner=document.querySelector('[data-shell-event-banner]');if(!banner)return;
  try{const events=await getActiveEvents();const event=events?.[0];if(!event){banner.hidden=true;return}banner.hidden=false;banner.style.setProperty('--event-accent',event.accentColor||'#ff82c8');banner.querySelector('[data-shell-event-name]').textContent=event.name||'Starlight Event';const end=new Date(event.endAt);const hours=Math.max(0,Math.ceil((end-Date.now())/36e5));banner.querySelector('[data-shell-event-time]').textContent=hours>48?`${Math.ceil(hours/24)} days remaining`:`${hours} hours remaining`;if(event.bannerImageUrl)banner.style.setProperty('--event-image',`url("${String(event.bannerImageUrl).replaceAll('"','%22')}")`)}catch(e){banner.hidden=true;console.warn('[Starlight] Event banner failed',e)}
}
async function hydrateTradeOfferBadge(){
  const badges=document.querySelectorAll('[data-trade-offer-badge]');
  badges.forEach(b=>b.hidden=true);
  try{
    const offers=await getMyTradeOffers();
    const count=(offers?.incoming||[]).filter(o=>o.status==='pending').length;
    badges.forEach(b=>{b.textContent=String(count);b.hidden=count===0});
  }catch(e){badges.forEach(b=>b.hidden=true);console.warn('[Starlight] Trade offer badge failed',e)}
}

async function hydrateDailyNavIndicator(){
  try{
    const { data: authData } = await supabase.auth.getUser();
    if(!authData?.user){
      applyDailyNavReadyState(false);
      return;
    }
    const { data: daily, error } = await supabase.rpc('get_daily_booster_status');
    if(error||!daily){
      applyDailyNavReadyState(false);
      return;
    }
    applyDailyNavReadyState(Boolean(daily.available));
  }catch(e){
    applyDailyNavReadyState(false);
    console.warn('[Starlight] Daily nav indicator failed',e);
  }
}

function refreshShellBadges(){
  hydrateTradeOfferBadge();
  hydrateNotificationBadge();
  hydrateReceivedGiftBadge();
  hydrateDailyNavIndicator();
}

function isShellSfxOn(){
  try{
    return localStorage.getItem(SFX_KEY) !== 'off';
  }catch{
    return true;
  }
}

function syncShellSfxToggle(){
  const on = isShellSfxOn();
  const btn = document.getElementById('sfxToggle');
  if(btn){
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  const state = document.querySelector('[data-shell-sfx-state]');
  if(state) state.textContent = on ? 'On' : 'Off';
  document.body.classList.toggle('sfx-on', on);
  try{
    const frame = document.getElementById('shellViewIframe');
    frame?.contentWindow?.postMessage({ type: 'starlight-sfx', sfxOn: on }, location.origin);
  }catch{
    /* iframe may be unavailable */
  }
}

function toggleShellSfx(){
  const next = !isShellSfxOn();
  try{
    localStorage.setItem(SFX_KEY, next ? 'on' : 'off');
  }catch{
    /* ignore */
  }
  syncShellSfxToggle();
}

function applyAccountChrome(isSignedIn){
  document.querySelectorAll('[data-shell-signed-out]').forEach(node=>{
    if(isSignedIn)node.setAttribute('hidden','');
    else node.removeAttribute('hidden');
  });
  document.querySelectorAll('[data-shell-signed-in]').forEach(node=>{
    if(isSignedIn)node.removeAttribute('hidden');
    else node.setAttribute('hidden','');
  });
}

async function resolveShellUser(){
  const { data: { session } } = await supabase.auth.getSession();
  if(session?.user)return session.user;
  const { data } = await supabase.auth.getUser();
  return data?.user ?? null;
}

async function syncShellSessionFromMessage(sessionPayload){
  if(!sessionPayload?.access_token||!sessionPayload?.refresh_token)return false;
  try{
    const { error } = await supabase.auth.setSession({
      access_token: sessionPayload.access_token,
      refresh_token: sessionPayload.refresh_token
    });
    if(error)throw error;
    return true;
  }catch(error){
    console.warn('[Starlight] Shell session sync failed', error);
    return false;
  }
}

let hydrateAccountQueue = Promise.resolve();

function scheduleHydrateAccount(){
  hydrateAccountQueue = hydrateAccountQueue
    .then(() => hydrateAccount())
    .catch(error => console.warn('[Starlight] Shell account hydration failed', error));
  return hydrateAccountQueue;
}

async function hydrateAccount(){
  const applyProfileLink=()=>{
    const link=document.querySelector('[data-shell-profile-link]');
    if(!link)return;
    link.href=profileUsername
      ? shellHref('collector', { username: profileUsername })
      : shellHref('profile');
  };
  let access = null;
  let signedIn = false;
  try{
    const user = await resolveShellUser();
    signedIn = Boolean(user);
    if(!user){
      setShellAvatar('');
      document.querySelector('[data-shell-account-name]').textContent='Welcome to Starlight Cards';
      document.querySelector('[data-shell-account-sub]').textContent='Sign in or register to collect cards';
      profileUsername='';
    } else {
      const {data:profile}=await supabase.from('profiles').select('username,display_name,onboarding_complete,username_locked,username_source,avatar_url,selected_title_id').eq('id',user.id).maybeSingle();
      profileUsername=profile?.username||'';
      const name=profile?.display_name||profile?.username||user.email||'Collector';
      document.querySelector('[data-shell-account-name]').textContent=name;
      document.querySelector('[data-shell-account-sub]').textContent=profile?.username?`@${profile.username}`:user.email;
      let shellFrame = null;
      try{
        const extras = await getMyProfileExtras();
        const selectedId = extras?.selectedFrameId || '';
        shellFrame = (extras?.frames || []).find((frame) => frame.id === selectedId) || null;
      }catch(frameError){
        console.warn('[Starlight] Shell avatar frame unavailable', frameError);
      }
      setShellAvatar(profile?.avatar_url||'', shellFrame);
      access=await getMyStaffAccess();
      if(profile && profile.onboarding_complete===false){
        try{
          const nudged=sessionStorage.getItem('starlight-onboarding-nudge');
          if(!nudged){
            sessionStorage.setItem('starlight-onboarding-nudge','1');
            if(currentRoute!=='profile')navigate('profile');
          }
        }catch(_e){/* sessionStorage may be unavailable */}
      }
    }
  }catch(e){
    console.warn('[Starlight] Shell account hydration failed',e);
    signedIn = false;
    setShellAvatar('');
    profileUsername='';
    document.querySelector('[data-shell-account-name]').textContent='Welcome to Starlight Cards';
    document.querySelector('[data-shell-account-sub]').textContent='Sign in or register to collect cards';
  }

  applyAccountChrome(signedIn);
  liveFeedWidget?.refresh?.();

  try{
    let navigation = await getShellNavigation();
    if(isStudioPreview() && window.__starlightShellNavigationDraft){
      navigation = window.__starlightShellNavigationDraft;
    }
    applyShellPageTitles(routes, navigation);
    applyShellNavigationToDom(navigation, { isStaff: Boolean(access?.isStaff) || isStudioPreview() });
    scheduleMastheadNavFit();
    liveFeedAdminEnabled = navigation?.chrome?.showLiveFeed !== false;
    applyLiveFeedVisibility();
    applyProfileLink();
    refreshShellBadges();
    if(currentRoute !== 'binder' && routes[currentRoute]?.title){
      document.title = `${routes[currentRoute].title} | Starlight Card Binder`;
    }
    if(isStudioPreview()){
      document.documentElement.classList.add('starlight-studio-preview');
      if(!window.__starlightStudioNavPreviewInstalled){
        window.__starlightStudioNavPreviewInstalled = true;
        window.addEventListener('message', event => {
          if(event.origin !== location.origin) return;
          const data = event.data || {};
          if(data.type !== STUDIO_MSG.NAV_DRAFT) return;
          window.__starlightShellNavigationDraft = data.navigation || null;
          applyShellPageTitles(routes, data.navigation || {});
          applyShellNavigationToDom(data.navigation || null, { isStaff: true });
          scheduleMastheadNavFit();
          liveFeedAdminEnabled = data.navigation?.chrome?.showLiveFeed !== false;
          applyLiveFeedVisibility();
          applyProfileLink();
          refreshShellBadges();
          setActive(currentRoute);
          applyAccountChrome(signedIn);
        });
      }
      try{
        parent.postMessage({ type: STUDIO_MSG.READY, kind: 'shell' }, location.origin);
      }catch(_e){/* ignore */}
    }
  }catch(e){
    console.warn('[Starlight] Shell navigation config failed', e);
    applyShellNavigationToDom(null, { isStaff: Boolean(access?.isStaff) });
    scheduleMastheadNavFit();
    applyProfileLink();
    refreshShellBadges();
  }

  applyAccountChrome(signedIn);

  if(access?.isStaff)document.querySelector('.unified-nav')?.classList.add('has-staff-access');
  document.querySelectorAll('.staff-link').forEach(el=>el.classList.toggle('visible',Boolean(access?.isStaff)));
  document.querySelector('.staff-only-menu')?.toggleAttribute('hidden',!access?.isStaff);

  if(signedIn){
    window.dispatchEvent(new CustomEvent('starlight-dashboard-refresh',{detail:{source:'shell-account'}}));
  }
}

document.addEventListener('click',e=>{
  const a=e.target.closest('[data-shell-view]');
  if(a){
    e.preventDefault();
    closeAccountMenu();
    const extra = {};
    if (a.dataset.seriesKey) extra.series = a.dataset.seriesKey;
    if (a.dataset.clearSeries === '1') extra.series = 'All Series';
    if (a.hasAttribute('data-card-set')) extra.cardSet = a.dataset.cardSet || '';
    const href = a.getAttribute('href') || '';
    try {
      const parsed = new URL(href, location.href);
      parsed.searchParams.forEach((value, key) => {
        if (key !== 'view' && value) extra[key] = extra[key] || value;
      });
    } catch {
      /* ignore */
    }
    navigate(a.dataset.shellView, { extra });
  }
});
menuButton?.addEventListener('click',()=>setShellMenuOpen(!document.body.classList.contains('shell-menu-open')));
drawerBackdrop?.addEventListener('click',()=>setShellMenuOpen(false));
wireMastheadMenus();
accountMenuButton?.addEventListener('click',e=>{
  e.stopPropagation();
  setAccountMenuOpen(Boolean(accountMenu?.hidden));
});
accountMenu?.addEventListener('click',async e=>{
  const sfxBtn=e.target.closest('#sfxToggle');
  if(sfxBtn){
    e.preventDefault();
    e.stopPropagation();
    toggleShellSfx();
    return;
  }
  const signOutBtn=e.target.closest('[data-shell-signout]');
  if(signOutBtn){
    e.preventDefault();
    e.stopPropagation();
    closeAccountMenu();
    try{
      await supabase.auth.signOut();
    }catch(err){
      console.warn('[Starlight] Sign out failed',err);
    }
    location.href=shellHref('home');
    return;
  }
  const authLink=e.target.closest('[data-shell-auth]');
  if(authLink){
    e.preventDefault();
    closeAccountMenu();
    const mode=authLink.dataset.shellAuth==='signup'?'signup':'signin';
    navigate('login',{extra:{mode}});
    return;
  }
  const profileLink=e.target.closest('[data-shell-profile-link]');
  if(profileLink){
    e.preventDefault();
    closeAccountMenu();
    if(profileUsername)navigate('collector',{extra:{username:profileUsername}});
    else navigate('profile');
    return;
  }
  const item=e.target.closest('[role="menuitem"]');
  if(!item)return;
  closeAccountMenu();
});
document.addEventListener('click',e=>{
  if(!accountMenu||accountMenu.hidden)return;
  if(e.target.closest('.shell-account-menu-wrap'))return;
  closeAccountMenu();
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape')closeAccountMenu();
});
window.addEventListener('popstate',()=>{
  const params=new URLSearchParams(location.search);
  const view=params.get('view')||'home';
  const extra=locationExtraParams();
  // Defer so iframe session history can settle with the parent entry before we
  // decide whether to adopt the restored document or navigate fresh.
  window.setTimeout(()=>{
    navigate(view,{push:false,extra});
  },0);
});
window.addEventListener('message',async e=>{
  if(e.origin!==location.origin)return;
  const data=e.data||{};
  if(data.type==='starlight-shell-dismiss-menus'){
    closeAllMegaMenus();
    setShellMenuOpen(false);
    return;
  }
  if(data.type==='starlight-close-notifications')closeNotificationPopover();
  if(data.type==='starlight-auth-changed'){
    await syncShellSessionFromMessage(data.session);
    scheduleHydrateAccount();
    liveFeedWidget?.refresh?.();
  }
  if(data.type==='starlight-navigate'){
    const view = data.view || data.route;
    const route = aliasShellRoute(view) || (isKnownShellRoute(view) ? view : '');
    if(route) navigate(route,{extra:data.params||{}});
  }
  if(data.type==='starlight-trades-changed'||data.type==='starlight-view-ready')hydrateTradeOfferBadge();
  if(data.type==='starlight-notifications-changed'||data.type==='starlight-view-ready')hydrateNotificationBadge();
  if(data.type==='starlight-rewards-changed'||data.type==='starlight-view-ready'||data.type==='starlight-content-ready')hydrateReceivedGiftBadge();
  if(
    data.type==='starlight-wallet-changed'
    || data.type==='starlight-rewards-changed'
    || data.type==='starlight-view-ready'
    || data.type==='starlight-content-ready'
  ){
    window.dispatchEvent(new CustomEvent('starlight-dashboard-refresh',{detail:data}));
  }
  if (data.type === 'starlight-feed-changed' || data.type === 'starlight-wallet-changed') {
    liveFeedWidget?.refresh?.();
  }
  if (data.type === 'starlight-view-ready' && data.claimed) {
    liveFeedWidget?.refresh?.();
  }
  if (data.type==='starlight-view-ready'||data.type==='starlight-content-ready'||data.type==='starlight-app-ready'){
    markViewReady(data, e);
    if (frame?.contentWindow && acceptEmbeddedHandshake(data, e)) {
      const layout = document.body.dataset.shellLayout || 'masthead';
      try {
        frame.contentWindow.postMessage({ type: 'starlight-shell-layout', layout }, location.origin);
        frame.contentWindow.postMessage({ type: 'starlight-sfx', sfxOn: isShellSfxOn() }, location.origin);
      } catch {
        /* iframe not ready */
      }
    }
  }
  if(data.type==='starlight-view-height'){
    if (!acceptEmbeddedHandshake(data, e)) return;
    resizeEmbeddedView(Number(data.height));
  }
  if(data.type==='starlight-view-reset'){
    if (!acceptEmbeddedHandshake(data, e)) return;
    resetEmbeddedViewLayout(Number(data.height));
  }
  if(data.type==='starlight-shell-chrome'){
    liveFeedViewSuppressed = Boolean(data.hideLiveFeed);
    applyLiveFeedVisibility();
  }
});

frame?.addEventListener('pointerdown',()=>{closeNotificationPopover();closeAccountMenu();});
frame?.addEventListener('load',()=>{
  closeNotificationPopover();
  closeAccountMenu();
  const href=getFrameLocation();
  const viewState=readShellViewState(frameWrap);
  if(!shouldReenterLoadingOnFrameLoad({
    frameHref:href,
    frameSrcAttr:frame.getAttribute('src'),
    viewState
  })){
    return;
  }
  setViewState('loading');
});
frame?.addEventListener('error',()=>{
  handleEmbeddedLoadFailure();
});

window.addEventListener('pageshow',event=>{
  if(event.persisted && currentRoute!=='binder')loadEmbeddedView(currentRoute,{force:true,resetRetry:true});
});

const initial=aliasShellRoute(new URLSearchParams(location.search).get('view')||'home')||'home';

liveFeedWidget = initLiveFeedWidget({
  onOpenFullFeed() {
    navigate('feed');
  }
});

if (isStudioPreview()) {
  liveFeedAdminEnabled = false;
  applyLiveFeedVisibility();
} else {
  syncShellChromeHeights();
  if (typeof ResizeObserver !== 'undefined') {
    const chromeObserver = new ResizeObserver(() => {
      syncShellChromeHeights();
      scheduleMastheadNavFit();
    });
    if (liveStrip) chromeObserver.observe(liveStrip);
    if (masthead) chromeObserver.observe(masthead);
  } else {
    window.addEventListener('resize', () => {
      syncShellChromeHeights();
      scheduleMastheadNavFit();
    });
  }
  window.addEventListener('starlight-shell-live-feed-changed', syncShellChromeHeights);
}

navigate(initial,{push:false,extra:locationExtraParams()});
syncShellSfxToggle();
supabase.auth.onAuthStateChange((event, session)=>{
  if(event==='INITIAL_SESSION'||event==='SIGNED_IN'||event==='SIGNED_OUT'||event==='USER_UPDATED'||event==='TOKEN_REFRESHED'){
    // Shell and iframe share localStorage ownership meta. Bind with the current
    // generation so a stale document cannot rebind a previous account.
    const priorGeneration = (()=>{
      try{
        const raw = JSON.parse(localStorage.getItem('sora-starlight-ownership-active-v1')||'{}');
        const generation = Number(raw.generation);
        return Number.isFinite(generation) && generation > 0 ? generation : 0;
      }catch{
        return 0;
      }
    })();
    if(event==='TOKEN_REFRESHED' && session?.user){
      bindOwnershipToAuthUser(session.user.id, {
        reason: 'shell-token-refresh',
        notBeforeGeneration: priorGeneration
      });
    }else if(event==='SIGNED_OUT'){
      // Confirmed sign-out only — do not treat transient null sessions on
      // TOKEN_REFRESHED as sign-out (that can archive/clear account mirrors).
      bindOwnershipToAuthUser(null, {
        reason: 'shell-signed-out',
        notBeforeGeneration: priorGeneration
      });
    }else if(event==='SIGNED_IN' || event==='USER_UPDATED' || event==='INITIAL_SESSION'){
      if(session?.user){
        bindOwnershipToAuthUser(session.user, {
          reason: `shell-${String(event).toLowerCase()}`,
          notBeforeGeneration: priorGeneration
        });
      }else if(event==='INITIAL_SESSION'){
        bindOwnershipToAuthUser(null, {
          reason: 'shell-initial-signed-out',
          notBeforeGeneration: priorGeneration
        });
      }
    }
    scheduleHydrateAccount();
    liveFeedWidget?.refresh?.();
  }
});
scheduleHydrateAccount().then(ensureNotificationPopover);
hydrateTradeOfferBadge();
hydrateNotificationBadge();
hydrateReceivedGiftBadge();
hydrateActiveEventBanner();
