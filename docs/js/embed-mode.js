const params = new URLSearchParams(location.search);
const routes = {
  'binder.html':'binder','index.html':'binder','home.html':'home','collection.html':'collection','checklist.html':'checklist','daily-booster.html':'daily',
  'booster-shop.html':'shop','events.html':'events','star-bits.html':'star-bits','redeem.html':'redeem','notifications.html':'notifications','received-rewards.html':'rewards','profile-settings.html':'profile',
  'season-pass.html':'season-pass','collection-quests.html':'quests','login.html':'login',
  'trade-lists.html':'trades','trade-offers.html':'offers','user-rankings.html':'rankings','pull-feed.html':'feed','collector.html':'collector','report-profile.html':'report',
  'about.html':'about','socials.html':'socials','admin-hub.html':'admin','admin-codes.html':'admin-codes',
  'admin-staff.html':'admin-staff','admin-audit.html':'admin-audit','admin-moderation.html':'admin-moderation',
  'admin-boosters.html':'admin-boosters','admin-twitch.html':'admin-twitch','admin-quests.html':'admin-quests','admin-gifts.html':'admin-gifts','admin-news.html':'admin-news','admin-notifications.html':'admin-notifications','admin-ui.html':'admin-ui','admin-website.html':'admin-website','admin-users.html':'admin-users','admin-health.html':'admin-health'
};
const SHELL_PARAM_SKIP = new Set(['embed','view','shellBuild','shellLoad','shellRetry']);

function hasAuthReturnParams() {
  for (const key of params.keys()) {
    if (key === 'oauth' || key === 'code' || key === 'error' || key === 'error_description') {
      return true;
    }
  }
  const hash = String(location.hash || '');
  return Boolean(hash && /access_token|refresh_token|error/i.test(hash));
}

function shouldRedirectToShell() {
  if (!currentRoute || file === 'binder.html' || file === 'index.html') return false;
  if (currentRoute === 'login' && hasAuthReturnParams()) return false;
  return true;
}

function normalizePageName(value){
  const raw = String(value || '').split('/').pop().toLowerCase().split('?')[0].split('#')[0];
  if (!raw || raw === '/') return 'index.html';
  if (raw.endsWith('.html')) return raw;
  if (raw === 'binder' || raw === 'index') return `${raw === 'index' ? 'index' : 'binder'}.html`;
  return `${raw}.html`;
}

const file = normalizePageName(location.pathname);
const currentRoute = routes[file] || null;
const embedded = params.get('embed') === '1' || (window.parent !== window && !!currentRoute);

/** Pages that serve multiple shell routes (e.g. rankings + trades share trade-lists.html). */
const MULTI_VIEW_PAGES = {
  'trade-lists.html': new Set(['rankings', 'trades', 'offers'])
};

function embedShellView() {
  const fileView = currentRoute || file;
  if (window.parent === window) return fileView;
  try {
    const parentView = new URLSearchParams(window.parent.location.search).get('view');
    if (!parentView) return fileView;
    const aliases = MULTI_VIEW_PAGES[file];
    if (aliases?.has(parentView)) return parentView;
    return fileView;
  } catch {
    return fileView;
  }
}

function routeForUrl(value){
  try{
    const u = new URL(value, location.href);
    const name = normalizePageName(u.pathname);
    if (name === 'binder.html' || name === 'index.html') {
      const view = u.searchParams.get('view');
      return {u, route: view || 'binder'};
    }
    return {u, route: routes[name] || null};
  }catch{
    return {u:null, route:null};
  }
}

function shellHref(route, u){
  const out = new URLSearchParams();
  out.set('view', route);
  if (u) for (const [k,v] of u.searchParams) if (!SHELL_PARAM_SKIP.has(k) && k !== 'view') out.set(k, v);
  return `binder?${out.toString()}`;
}

function parentNavigate(route, u){
  if (!route) return false;
  const args = {type:'starlight-navigate', view:route, params:{}};
  if (u) for (const [k,v] of u.searchParams) if (!SHELL_PARAM_SKIP.has(k)) args.params[k] = v;
  parent.postMessage(args, location.origin);
  return true;
}

function rewriteShellLinks(root = document){
  root.querySelectorAll?.('a[href]')?.forEach(a => {
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('javascript:')) return;
    const {u, route} = routeForUrl(href);
    if (!route) return;
    a.setAttribute('href', shellHref(route, u));
    a.setAttribute('target', '_top');
    if (!a.hasAttribute('data-shell-view')) a.setAttribute('data-shell-view', route);
  });
}

function send(type, extra = {}){
  if (window.parent === window) return;
  parent.postMessage({type, view: embedShellView(), ...extra}, location.origin);
}

function resetEmbedDocumentScroll() {
  const docEl = document.documentElement;
  const body = document.body;
  if (docEl) docEl.scrollTop = 0;
  if (body) body.scrollTop = 0;
}

function measureContentHeight() {
  if (!embedScrollResetDone) {
    resetEmbedDocumentScroll();
    embedScrollResetDone = true;
  }
  const docEl = document.documentElement;
  const body = document.body;
  const main = document.querySelector('body > main')
    || document.querySelector('.site > .main')
    || document.querySelector('main')
    || body;
  if (!main) return 320;
  const layoutHeight = Math.max(
    main.scrollHeight || 0,
    main.offsetHeight || 0,
    Math.ceil(main.getBoundingClientRect().height || 0)
  );
  const contentOnly = Math.max(320, layoutHeight + 24);
  if (
    docEl.classList.contains('st-evo-open')
    || docEl.classList.contains('st-r3-reveal-open')
  ) {
    return contentOnly;
  }
  const scrollHeight = Math.max(
    body?.scrollHeight || 0,
    body?.offsetHeight || 0,
    docEl?.scrollHeight || 0,
    docEl?.offsetHeight || 0
  );
  if (scrollHeight > contentOnly + 120) return contentOnly;
  return Math.max(contentOnly, scrollHeight);
}

function documentHeight(){
  return measureContentHeight();
}

let lastHeight = 0;
let resizeFrame = 0;
let embedScrollResetDone = false;
function reportHeight(){
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    const height = documentHeight();
    if (Math.abs(height - lastHeight) > 2) {
      lastHeight = height;
      send('starlight-view-height', {
        height,
        loadToken: params.get('shellLoad') || ''
      });
    }
  });
}

function announceReady(){
  reportHeight();
  send('starlight-view-ready', {height: documentHeight(), loadToken: params.get('shellLoad') || ''});
}

if (!embedded && shouldRedirectToShell()) {
  const out = new URLSearchParams();
  out.set('view', currentRoute);
  for (const [k,v] of params) if (!SHELL_PARAM_SKIP.has(k)) out.set(k, v);
  location.replace(`binder?${out.toString()}`);
} else if (embedded) {
  document.documentElement.classList.add('starlight-embedded');
  window.addEventListener('message', event => {
    if (event.origin !== location.origin) return;
    const data = event.data || {};
    if (data.type === 'starlight-shell-layout') {
      document.documentElement.dataset.shellLayout = data.layout === 'hybrid' ? 'hybrid' : 'masthead';
    }
    if (data.type === 'starlight-sfx' && typeof data.sfxOn === 'boolean') {
      try {
        localStorage.setItem('sora-starlight-card-binder-v7-sfx', data.sfxOn ? 'on' : 'off');
      } catch {
        /* ignore */
      }
      document.body.classList.toggle('sfx-on', data.sfxOn);
      window.dispatchEvent(new CustomEvent('starlight-sfx-changed', { detail: { sfxOn: data.sfxOn } }));
    }
  });
  const style = document.createElement('style');
  style.textContent = `
    html.starlight-embedded,html.starlight-embedded body{background:transparent!important;min-height:0!important;height:auto!important;overflow:hidden!important;scroll-behavior:auto!important}
    html.starlight-embedded .sky{display:none!important}
    html.starlight-embedded .topbar,html.starlight-embedded .daily-nav,html.starlight-embedded .bits-nav,
    html.starlight-embedded .collector-nav,html.starlight-embedded .admin-nav,html.starlight-embedded .redeem-nav,
    html.starlight-embedded .site-footer-links{display:none!important}
    html.starlight-embedded .site{display:block!important;width:100%!important;max-width:none!important;margin:0!important;padding:0!important;min-height:0!important}
    html.starlight-embedded .site>.sidebar{display:none!important}
    html.starlight-embedded .main{width:100%!important;max-width:none!important;margin:0!important;padding:clamp(10px,1.6vw,16px)!important;min-height:0!important;overflow:visible!important}
    html.starlight-embedded .home,
    html.starlight-embedded .page,
    html.starlight-embedded .studio,
    html.starlight-embedded .daily-page,html.starlight-embedded .bits-page,html.starlight-embedded .collector-page,
    html.starlight-embedded .profile-settings-page,html.starlight-embedded .admin-page,html.starlight-embedded .redeem-page,
    html.starlight-embedded .trade-offers-page,html.starlight-embedded .trade-hub-page,html.starlight-embedded .shop-page,html.starlight-embedded .login-page,
    html.starlight-embedded .notifications-page,html.starlight-embedded .quests-page,html.starlight-embedded .season-pass-page,
    html.starlight-embedded .events-page,html.starlight-embedded .about-page,html.starlight-embedded .socials-page,
    html.starlight-embedded .checklist-page,html.starlight-embedded .pull-feed-page,html.starlight-embedded .received-rewards-page,
    html.starlight-embedded .card-album-page,html.starlight-embedded .card-gallery-page{
      width:100%!important;max-width:none!important;margin-left:0!important;margin-right:0!important;box-sizing:border-box!important
    }
    html.starlight-embedded .daily-page,html.starlight-embedded .bits-page,html.starlight-embedded .collector-page,
    html.starlight-embedded .profile-settings-page,html.starlight-embedded .admin-page,html.starlight-embedded .redeem-page,
    html.starlight-embedded .trade-offers-page,html.starlight-embedded .trade-hub-page,html.starlight-embedded .shop-page,html.starlight-embedded .login-page{padding:clamp(10px,1.6vw,16px)!important;min-height:0!important}
    html.starlight-embedded .admin-suite,
    html.starlight-embedded .admin-suite-frame,
    html.starlight-embedded .admin-panel,
    html.starlight-embedded .studio-app{
      width:100%!important;max-width:none!important;margin-left:0!important;margin-right:0!important;box-sizing:border-box!important
    }
    html.starlight-embedded .admin-suite-frame{padding-inline:clamp(10px,1.6vw,18px)!important}
    html.starlight-embedded .page-head:first-child{margin-top:0!important}
    html.starlight-embedded .embedded-filter-panel{margin:0 0 14px!important}
    html.starlight-embedded .page-status:not(.error),html.starlight-embedded .status.success{display:none!important}
  `;
  document.head.appendChild(style);
  document.addEventListener('pointerdown', () => {
    try {
      parent.postMessage({ type: 'starlight-shell-dismiss-menus' }, location.origin);
    } catch {
      /* ignore */
    }
  }, true);
  document.addEventListener('click', event => {
    const a = event.target.closest('a[href]');
    if (!a) return;
    const {u, route} = routeForUrl(a.getAttribute('href'));
    if (route) {
      event.preventDefault();
      event.stopImmediatePropagation();
      parentNavigate(route, u);
    }
  }, true);
  document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.querySelector('.site>.sidebar');
    const filters = sidebar?.querySelector('.filters');
    const main = document.querySelector('.site>.main');
    if (filters && main) {
      filters.classList.add('embedded-filter-panel');
      main.prepend(filters);
    }
    rewriteShellLinks(document);
    announceReady();
    if ('ResizeObserver' in window) {
      const ro = new ResizeObserver(reportHeight);
      ro.observe(document.documentElement);
      if (document.body) ro.observe(document.body);
    }
    const mo = new MutationObserver(reportHeight);
    const observerRoot = document.documentElement || document.body;
    if (observerRoot?.nodeType) {
      try {
        mo.observe(observerRoot, { childList: true, subtree: true, characterData: true });
      } catch (error) {
        console.warn('[Starlight] Embedded resize observer unavailable.', error);
      }
    }
    document.fonts?.ready?.then(reportHeight).catch(() => {});
    document.querySelectorAll('img').forEach(img => {
      if (!img.complete) img.addEventListener('load', reportHeight, {once:true});
    });
  });
  window.addEventListener('load', () => { announceReady(); setTimeout(announceReady, 120); });
  window.addEventListener('pageshow', () => { announceReady(); setTimeout(announceReady, 80); });
  window.addEventListener('starlight-cloud-ready', () => {
    announceReady();
    reportHeight();
  });
  window.__starlightEmbedAnnounceReady = announceReady;
  window.__starlightEmbedReportHeight = reportHeight;
  window.__starlightEmbedResetLayout = () => {
    reportHeight();
    send('starlight-view-reset', {
      height: documentHeight(),
      loadToken: params.get('shellLoad') || ''
    });
  };
}
