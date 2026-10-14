const FALLBACK_JSON_URL = "data/cards.json";
const CARD_BACK_URL = "site_assets/StarlightCard_Back_NewLogo.png";
const BOOSTER_PACK_URL = "site_assets/series01_rising_star_booster.png";
const SFX = {
  flip: "site_assets/sfx/card-flip.wav",
  page: "site_assets/sfx/page-turn.wav",
  sparkle: "site_assets/sfx/sparkle-chime.wav",
  charge: "site_assets/sfx/cosmic-charge.wav",
  favorite: "site_assets/sfx/favorite-heart.wav",
  hover: "site_assets/sfx/card_mouse_over.wav",
  analyze: "site_assets/sfx/card_analyze.wav"
};
const STORAGE_KEY = "sora-starlight-card-binder-v5-collected";
const FAVORITES_KEY = "sora-starlight-card-binder-v5-favorites";
const QUANTITIES_KEY = "sora-starlight-card-binder-v80-quantities";
const SFX_KEY = "sora-starlight-card-binder-v7-sfx";
const PER_PAGE = 18;
const RARITY_SCORE = { Legendary: 5, Epic: 4, Rare: 3, Uncommon: 2, Common: 1 };

let cards = [];
let filtered = [];
let page = 1;
let activeCardSet = '';
let selectedIndex = 0;
let selected = null;
let sfxOn = localStorage.getItem(SFX_KEY) !== "off";
let previewFlipped = false;
let previewHoloEnabled = true;
let overlayFlipped = false;
let fullViewList = [];
let fullViewListMode = 'all';
let websiteContentPromise = null;
let websiteBinderLanding = null;
/** Analyzer session display toggles (not persisted). */
let analyzerHoloEnabled = true;
/** Full-view modal tab: details | story */
let analyzerActiveTab = 'details';
/** Current album binder spread page (1-based). */
let albumBinderPage = 1;

function fillWebsiteTokens(template, vars = {}) {
  return String(template || '').replace(/\{(\w+)\}/g, (_, key) => (
    vars[key] == null ? '' : String(vars[key])
  ));
}

function websiteSection(sectionKey) {
  return window.__starlightWebsiteContent?.[sectionKey] || {};
}

function binderDisplaySettings() {
  const settings = websiteSection('binderDisplay');
  return {
    sidePanel: settings.sidePanel === 'off' ? 'off' : 'on',
    unownedDisplay: settings.unownedDisplay === 'dullPreview' ? 'dullPreview' : 'cardBack',
    collectionStatusFilter: settings.collectionStatusFilter === 'off' ? 'off' : 'on'
  };
}

function isBinderSidePanelOn() {
  return binderDisplaySettings().sidePanel === 'on';
}

function isDullUnownedPreview() {
  return binderDisplaySettings().unownedDisplay === 'dullPreview';
}

function unownedArtClass(card, { flipped = false } = {}) {
  if (flipped || !card || isCollected(card.id)) return '';
  return isDullUnownedPreview() ? 'is-unowned-dull' : 'obscured';
}

function applyBinderDisplayLayout() {
  if (pageName !== 'binder') return;
  const panel = $('#v62Showcase');
  if (panel) {
    panel.hidden = true;
    panel.setAttribute('aria-hidden', 'true');
  }
}

function refreshBinderFiltersForDisplay() {
  if (pageName !== 'binder') return;
  const host = $('[data-card-filter-context]');
  if (!host) return;
  const preserved = activeFilters();
  delete host.dataset.filterControlsReady;
  renderFilterControls();
  hydrateFilters(preserved);
}

function syncBinderSeriesMode(browse) {
  if (pageName !== 'binder') return;
  document.body.classList.remove('series-select');
  const chrome = $('.binder-browse-chrome');
  if (chrome) {
    chrome.removeAttribute('hidden');
    chrome.hidden = false;
  }
}

function ensureBinderFilterPanel() {
  if (pageName !== 'binder') return;
  const host = document.querySelector('[data-card-filter-context="binder"]');
  if (!host) return;
  if (host.querySelector('.card-filter-fields')) return;
  delete host.dataset.filterControlsReady;
  renderFilterControls();
  hydrateFilters();
}

function hasWebsiteCopy(value) {
  return value != null && String(value).trim() !== '';
}

function applyOptionalText(el, value, fallback = '') {
  if (!el) return;
  if (value == null) {
    el.textContent = fallback;
    el.hidden = !fallback;
    el.classList.toggle('is-content-hidden', !fallback);
    return;
  }
  const next = String(value);
  el.textContent = next;
  el.hidden = !next.trim();
  el.classList.toggle('is-content-hidden', !next.trim());
  if (next.trim()) el.removeAttribute('aria-hidden');
  else el.setAttribute('aria-hidden', 'true');
}

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
const pageName = document.body.dataset.page || "binder";

function esc(v) { return String(v ?? "").replace(/[&<>'"]/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#039;",'"':"&quot;"}[m])); }
function readStore(key) { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } }
function writeStore(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function isCollected(id) { return !!readStore(STORAGE_KEY)[id]; }
function isFavorite(id) { return !!readStore(FAVORITES_KEY)[id]; }
function getCardQuantity(id) { return Math.max(isCollected(id) ? 1 : 0, Number(readStore(QUANTITIES_KEY)[id] || 0)); }
function cardSupportsHoloToggle(card) {
  return Boolean(card && isHolographicCard(card));
}
function analyzerDisplayTogglesHtml(card) {
  if (!card || !cardSupportsHoloToggle(card)) return '';
  return `<div class="analyzer-display-toggles"><button class="btn" type="button" data-toggle-analyzer-holo aria-pressed="${analyzerHoloEnabled ? 'true' : 'false'}">${analyzerHoloEnabled ? 'Holo On' : 'Holo Off'}</button></div>`;
}
function previewDisplayTogglesHtml(card, got = false) {
  if (!got || !card || !cardSupportsHoloToggle(card)) return '';
  return `<div class="v62-panel-toggles analyzer-display-toggles"><button class="btn" type="button" data-toggle-preview-holo aria-pressed="${previewHoloEnabled ? 'true' : 'false'}">${previewHoloEnabled ? 'Holo On' : 'Holo Off'}</button></div>`;
}
function rarityStarsHtml(card, label) {
  const score = RARITY_SCORE[card?.rarity] || RARITY_SCORE[label] || 1;
  const count = Math.max(1, Math.min(5, score));
  return `<div class="analyzer-rarity-stars" aria-label="${esc(label || card?.rarity || 'Rarity')}">${Array.from({ length: count }, () => '<span aria-hidden="true">★</span>').join('')}</div>`;
}
function analyzerStatRow(label, value, { icon = '' } = {}) {
  return `<div class="analyzer-stat-row"><span class="analyzer-stat-label">${esc(label)}</span>${icon ? `<span class="analyzer-stat-icon" aria-hidden="true">${icon}</span>` : ''}<span class="analyzer-stat-rule" aria-hidden="true"></span><span class="analyzer-stat-value">${value}</span></div>`;
}
function setAnalyzerTab(tab) {
  analyzerActiveTab = tab === 'story' ? 'story' : 'details';
  const root = $('#cardOverlay .analyzer-sekai-stage');
  if (!root) return;
  root.querySelectorAll('[data-analyzer-tab]').forEach(btn => {
    const active = btn.dataset.analyzerTab === analyzerActiveTab;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  root.querySelectorAll('[data-analyzer-panel]').forEach(panel => {
    const match = panel.dataset.analyzerPanel === analyzerActiveTab;
    panel.hidden = !match;
    panel.classList.toggle('is-active', match);
  });
  if (analyzerActiveTab === 'story') {
    root.querySelector('.analyzer-body')?.scrollTo?.({ top: 0, behavior: 'smooth' });
  }
}
function applyAnalyzerDisplayToggles() {
  const card = $('#fullCard3d');
  if (!card) return;
  card.classList.toggle('is-holo-off', !analyzerHoloEnabled);
  const frontFace = card.querySelector('.face.front');
  const got = selected && isCollected(selected.id);
  if (!analyzerHoloEnabled) {
    frontFace?.classList.remove('card-finish-holographic', 'card-finish-sparkle-foil', 'card-finish-gold');
    window.StarlightUI?.ensureFinishEffectLayer?.(frontFace, '');
    card.dataset.holographic = 'false';
  } else if (got) {
    const finishClass = cardFinishClass(selected, true);
    card.dataset.finishClass = finishClass;
    card.dataset.holographic = String(isHolographicCard(selected));
    frontFace?.classList.remove('card-finish-holographic', 'card-finish-sparkle-foil', 'card-finish-gold');
    if (finishClass) frontFace?.classList.add(finishClass);
    window.StarlightUI?.ensureFinishEffectLayer?.(frontFace, finishClass);
  }
}
function binderRarityBadgeHtml(card) {
  const label = getVisibleRarity(card);
  return `<span class="binder-rarity-badge ${rarityClass(card)}">${esc(label)}</span>`;
}
function percent(part, total) { return total ? Math.round((part / total) * 100) : 0; }
function padNumber(value, fallback) { return String(value || fallback).padStart(3, "0"); }
function rarityClass(card) { return `rarity-${String(card?.rarity || "common").toLowerCase().replace(/[^a-z0-9]/g, '')}`; }
function displayName(card) { return String(card?.name || '').trim() || `Card ${card?.number || ''}`.trim(); }
function taxonomyLabel(name, id, fallback = '') {
  const raw = String(name || id || fallback || '').trim();
  if (!raw) return '';
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, m => m.toUpperCase());
}
function categoryLabel(card) { return taxonomyLabel(card?.categoryName, card?.categoryId, 'Uncategorized'); }
function subcategoryLabel(card) { return taxonomyLabel(card?.subcategoryName, card?.subcategoryId); }
function variantLabel(card) { return taxonomyLabel(card?.variantName, card?.variantId, 'Standard Art'); }
function finishLabel(card) { return taxonomyLabel(card?.finishName, card?.finishId, 'Standard'); }
function cardFinishClass(card, visible = true) { return window.StarlightUI?.cardFinishClass?.(card, visible) || ''; }
function isHolographicCard(card) { return window.StarlightUI?.isHolographicCard?.(card) === true; }
function holoSparkMarkup(card, visible = true) { return window.StarlightUI?.finishEffectMarkup?.(card, visible) || window.StarlightUI?.holoSparkMarkup?.(card, visible) || ''; }
function perspectiveArt(card, { imageUrl, alt = '', imgClass = '', visible = true } = {}) {
  if (window.StarlightPerspectiveCard?.cardArtMarkup) {
    return window.StarlightPerspectiveCard.cardArtMarkup(card, { imageUrl, alt, imgClass, visible });
  }
  const src = imageUrl || card?.thumbnailUrl || card?.imageUrl || '';
  return `<img class="${imgClass}" src="${esc(src)}" alt="${esc(alt || card?.name || '')}" loading="lazy">`;
}
function perspectiveArtVisible(card, collected = false) {
  if (!collected) return false;
  return window.StarlightPerspectiveCard?.hasPremiumPerspective?.(card) === true;
}
function flashGalleryFilterTransition() {
  document.querySelectorAll('.card-gallery-grid, .starlight-gallery-grid, .v61-grid, .grid-page').forEach(el => {
    el.classList.add('is-filtering');
    window.clearTimeout(el._starlightFilterFlash);
    el._starlightFilterFlash = window.setTimeout(() => el.classList.remove('is-filtering'), 240);
  });
}
function cardTileContext() {
  return {
    esc,
    isCollected,
    isFavorite,
    getCardQuantity,
    rarityClass,
    perspectiveArt,
    perspectiveArtVisible,
    getVisibleName,
    galleryCardAriaLabel,
    getVisibleImage,
    displayName,
    cardIdentityChips,
    cardBackUrl: CARD_BACK_URL,
    cardDisplayNumber: window.StarlightCardFilters?.cardDisplayNumber,
    websiteBinderLanding,
    websiteSection,
    fillWebsiteTokens
  };
}
function renderSharedGalleryCard(card, i) {
  const api = window.StarlightCardTile;
  if (api?.renderGalleryTile) return api.renderGalleryTile(cardTileContext(), card, i);
  return renderGalleryCardLegacy(card, i);
}
function renderSharedAlbumCard(card, i) {
  const api = window.StarlightCardTile;
  if (api?.renderAlbumTile) return api.renderAlbumTile(cardTileContext(), card, i);
  return renderAlbumCardLegacy(card, i);
}
function renderSharedListCard(c, mode) {
  const api = window.StarlightCardTile;
  if (api?.renderListTile) return api.renderListTile(cardTileContext(), c, mode);
  return renderAlbumListCardLegacy(c, mode);
}
function scanPerspectiveCardsIn(root = document) {
  if (
    root?.classList?.contains('card-album-binder')
    || root?.querySelector?.('.card-album-binder')
  ) {
    return;
  }
  window.StarlightPerspectiveCard?.scanPerspectiveCards?.(root);
}
function distributionLabel(card) {
  const labels = {
    booster_pull: 'Booster Pull', redeem_code: 'Redeem Code', twitch_reward: 'Twitch Reward',
    event_reward: 'Event Reward', admin_gift: 'Admin Gift', promo: 'Promo', special: 'Special Distribution'
  };
  return labels[String(card?.distributionType || '').toLowerCase()] || taxonomyLabel('', card?.distributionType, 'Booster Pull');
}
function isStandardMeta(value) {
  return ['standard', 'standard art', 'booster pull', 'published'].includes(String(value || '').trim().toLowerCase());
}
function cardIdentityChips(card, { full = false, hidden = false } = {}) {
  if (hidden) return `<span class="card-meta-chip muted">Details unlock when collected</span>`;
  const chips = [
    `<span class="card-meta-chip rarity ${rarityClass(card)}">${esc(card?.rarity || 'Common')}</span>`,
    `<span class="card-meta-chip category">${esc(categoryLabel(card))}</span>`
  ];
  const sub = subcategoryLabel(card);
  if (sub) chips.push(`<span class="card-meta-chip subcategory">${esc(sub)}</span>`);
  const variant = variantLabel(card);
  const finish = finishLabel(card);
  if (full || !isStandardMeta(variant)) chips.push(`<span class="card-meta-chip variant">${esc(variant)}</span>`);
  if (full || !isStandardMeta(finish)) chips.push(`<span class="card-meta-chip finish">${esc(finish)}</span>`);
  return chips.join('');
}
function cardExpandedDetails(card) {
  const rows = [];
  const distribution = distributionLabel(card);
  if (distribution) rows.push(`<p><b>Distribution</b><span>${esc(distribution)}</span></p>`);
  if (card?.isPromo) rows.push(`<p><b>Special Status</b><span>Promo Card</span></p>`);
  if (card?.isEventExclusive) rows.push(`<p><b>Special Status</b><span>Event Exclusive</span></p>`);
  if (card?.availableFrom || card?.availableUntil) {
    const from = card.availableFrom ? new Date(card.availableFrom).toLocaleDateString() : 'Always';
    const until = card.availableUntil ? new Date(card.availableUntil).toLocaleDateString() : 'No end date';
    rows.push(`<p><b>Availability</b><span>${esc(from)} – ${esc(until)}</span></p>`);
  }
  if (Array.isArray(card?.tags) && card.tags.length) {
    rows.push(`<div class="card-tag-row">${card.tags.slice(0, 8).map(tag => `<span>${esc(tag)}</span>`).join('')}</div>`);
  }
  return rows.join('');
}

const activeSfx = {};
let lastHoverSfxAt = 0;
let lastHoverSfxId = '';
function playSfx(name, sourceId = '') {
  if (!sfxOn || !SFX[name]) return;
  if (name === 'hover') {
    const now = Date.now();
    // V49: binder hover sound should feel responsive, but not spammy.
    // It can replay on each new card entry, with a tiny global cooldown only.
    if (sourceId && sourceId === lastHoverSfxId && now - lastHoverSfxAt < 650) return;
    if (now - lastHoverSfxAt < 120) return;
    lastHoverSfxAt = now;
    lastHoverSfxId = sourceId || '';
  }
  try {
    if (activeSfx[name]) {
      activeSfx[name].pause();
      activeSfx[name].currentTime = 0;
    }
    const audio = new Audio(SFX[name]);
    activeSfx[name] = audio;
    audio.volume = name === 'hover' ? 0.24 : name === 'reset' ? 0.55 : name === 'legendary' ? 0.50 : (name === 'reveal' || name === 'charge' || name === 'pack' ? 0.42 : 0.28);
    audio.addEventListener('ended', () => { if (activeSfx[name] === audio) delete activeSfx[name]; }, { once: true });
    audio.play().catch(() => {});
  } catch {}
}


function attachTiltTo(el, options = {}) {
  if (!el || el.dataset.tiltReady === '1') return;
  el.dataset.tiltReady = '1';
  const max = Number(options.max || 10);
  let dragging = false;
  let lastX = 0, lastY = 0;
  const setTilt = (clientX, clientY) => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const px = (clientX - r.left) / r.width - 0.5;
    const py = (clientY - r.top) / r.height - 0.5;
    const rx = Math.max(-max, Math.min(max, -py * max * 2));
    const ry = Math.max(-max, Math.min(max, px * max * 2));
    el.style.setProperty('--tilt-x', `${rx}deg`);
    el.style.setProperty('--tilt-y', `${ry}deg`);
    el.classList.add('tilting');
  };
  el.addEventListener('pointermove', (e) => {
    if (options.drag && !dragging && e.pointerType !== 'mouse') return;
    if (options.drag && dragging) {
      lastX += e.movementX || 0;
      lastY += e.movementY || 0;
      lastX = Math.max(-38, Math.min(38, lastX));
      lastY = Math.max(-38, Math.min(38, lastY));
      el.style.setProperty('--drag-x', `${lastX}px`);
      el.style.setProperty('--drag-y', `${lastY}px`);
    }
    setTilt(e.clientX, e.clientY);
  });
  el.addEventListener('pointerenter', (e) => setTilt(e.clientX, e.clientY));
  el.addEventListener('pointerleave', () => {
    if (!dragging) {
      el.style.setProperty('--tilt-x', '0deg');
      el.style.setProperty('--tilt-y', '0deg');
      el.classList.remove('tilting');
    }
  });
  if (options.drag) {
    el.addEventListener('pointerdown', (e) => {
      dragging = true;
      el.setPointerCapture?.(e.pointerId);
      el.classList.add('is-dragging');
      setTilt(e.clientX, e.clientY);
    });
    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      el.releasePointerCapture?.(e.pointerId);
      el.classList.remove('is-dragging');
    };
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
  }
}

function attachTileTilts() {
  // V45: binder thumbnails no longer use pointer-tracking tilt.
  // Premium effectStyle cards use starlight-perspective-card instead.
  $$('.collection-card, .fav-spot').forEach(el => {
    if (el.querySelector('[data-perspective-card]')) return;
    attachTiltTo(el, { max: 5, drag: false });
  });
  scanPerspectiveCardsIn(document);
}

function attachBinderHoverSfx() { return; }



function normalize(row, i) {
  const number = padNumber(row.number || row.cardNumber || row.card || row.cardNumberInSeries, i + 1);
  const seriesId = String(row.seriesId || row.seriesID || row.setId || row.setID || "").trim();
  const seriesNameRaw = String(row.seriesName || row.setName || "").trim();
  const legacySeries = String(row.series || "Series 01: Rising Star").trim();
  const seriesName = seriesNameRaw || legacySeries.replace(/^Series\s*\d+\s*:\s*/i, "").trim() || legacySeries;
  const series = seriesId
    ? `Series ${String(seriesId).padStart(2, "0")}: ${seriesName}`
    : legacySeries;
  const seriesSort = Number(row.seriesSort || row.seriesOrder || row.setSort || seriesId || i + 1) || (i + 1);
  return {
    id: String(row.id || row.ID || `card-${seriesId || "series"}-${number}`).trim(),
    number,
    name: String(row.name || row.cardName || ``).trim(),
    series,
    seriesId,
    seriesName,
    seriesSort,
    seriesDescription: String(row.seriesDescription || row.setDescription || "").trim(),
    boosterImageUrl: String(row.boosterImageUrl || row.boosterImageURL || row.packImageUrl || row.packImageURL || BOOSTER_PACK_URL).trim(),
    rarity: String(row.rarity || "Common").trim(),
    categoryId: String(row.categoryId || row.category_id || "").trim(),
    categoryName: String(row.categoryName || row.category_name || "").trim(),
    subcategoryId: String(row.subcategoryId || row.subcategory_id || "").trim(),
    subcategoryName: String(row.subcategoryName || row.subcategory_name || "").trim(),
    variantId: String(row.variantId || row.variant_id || "").trim(),
    variantName: String(row.variantName || row.variant_name || "").trim(),
    finishId: String(row.finishId || row.finish_id || "").trim(),
    finishName: String(row.finishName || row.finish_name || "").trim(),
    effectStyle: String(row.effectStyle || row.effect_style || "").trim().toLowerCase(),
    effectIntensity: (() => {
      const value = Number(row.effectIntensity ?? row.effect_intensity);
      return Number.isFinite(value) ? value : undefined;
    })(),
    collectorNumber: String(row.collectorNumber || row.collector_number || number).trim(),
    sortOrder: Number(row.sortOrder ?? row.sort_order ?? i + 1) || (i + 1),
    distributionType: String(row.distributionType || row.distribution_type || "booster_pull").trim(),
    publishStatus: String(row.publishStatus || row.publish_status || "published").trim(),
    tags: Array.isArray(row.tags) ? row.tags : [],
    isPromo: Boolean(row.isPromo ?? row.is_promo ?? false),
    isEventExclusive: Boolean(row.isEventExclusive ?? row.is_event_exclusive ?? false),
    availableFrom: String(row.availableFrom || row.available_from || "").trim(),
    availableUntil: String(row.availableUntil || row.available_until || "").trim(),
    imageUrl: String(row.imageUrl || row.imageURL || row.image || CARD_BACK_URL).trim(),
    thumbnailUrl: String(row.thumbnailUrl || row.thumbnail || row.thumb || row.imageUrl || row.imageURL || row.image || CARD_BACK_URL).trim(),
    cardDescription: String(row.cardDescription || row.description || row.lore || "A mysterious Starlight card waiting to sparkle.").trim(),
    artist: String(row.artist || row.Artist || "Starlight Studio").trim()
  };
}

function applyLoadedCards(data, fromCache = false) {
  const normalized = Array.isArray(data) ? data.map(normalize).filter(c => c.id && c.number) : [];
  if (!normalized.length) return;
  cards = normalized;
  sortCards(cards, "numberAsc");
  selected = cards.find(c => c.id === selected?.id) || cards[0] || null;
  selectedIndex = Math.max(0, cards.findIndex(c => c.id === selected?.id));
  hydrateFilters();
  applySeriesQueryFromUrl();
  applyCardSetQueryFromUrl();
  renderAll();
  warmCriticalAssets();
  scheduleIdleImagePreload();
  // Card metadata is cached by card-catalog-service.js.
  // app.js no longer maintains a second catalog cache.
}

function warmCriticalAssets() {
  const seen = new Set();
  const urls = [CARD_BACK_URL, BOOSTER_PACK_URL, ...getSeriesGroups().map(g => g.boosterImageUrl)];
  cards.slice(0, PER_PAGE).forEach(c => {
    urls.push(c.thumbnailUrl);
    if (isCollected(c.id)) urls.push(c.imageUrl);
  });
  for (const url of urls.filter(Boolean)) {
    if (seen.has(url)) continue;
    seen.add(url);
    const img = new Image();
    img.decoding = "async";
    img.loading = "eager";
    img.src = url;
  }
}


function scheduleIdleImagePreload() {
  try {
    const urls = [];
    const push = (url) => { if (url && !urls.includes(url)) urls.push(url); };

    // First-load rule: warm chrome, booster art, and currently visible card art only.
    push(CARD_BACK_URL);
    push(BOOSTER_PACK_URL);
    getSeriesGroups().forEach(group => push(group.boosterImageUrl));

    const visibleSeries = ($('[data-series]')?.value || 'All Series');
    const firstVisibleCards = (visibleSeries === 'All Series'
      ? cards.slice(0, PER_PAGE)
      : cards.filter(c => c.series === visibleSeries).slice(0, PER_PAGE));
    firstVisibleCards.forEach(c => {
      push(c.thumbnailUrl);
      if (isCollected(c.id)) push(c.imageUrl);
    });

    const run = () => preloadImagesInBatches(urls, 4);
    if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 1800 });
    else window.setTimeout(run, 250);
  } catch (_) {}
}

function preloadImagesInBatches(urls, batchSize = 4) {
  let index = 0;
  const loadNext = () => {
    urls.slice(index, index + batchSize).forEach(url => {
      try {
        const img = new Image();
        img.decoding = 'async';
        img.loading = 'lazy';
        img.src = url;
      } catch (_) {}
    });
    index += batchSize;
    if (index < urls.length) window.setTimeout(loadNext, 90);
  };
  loadNext();
}

async function loadCards(options = {}) {
  const forceRefresh = options.forceRefresh === true;
  let renderedFromCache = false;
  const catalogService = window.StarlightCardCatalog;

  if (!forceRefresh && catalogService?.getCached) {
    try {
      const cached = catalogService.getCached();
      if (cached?.cards?.length) {
        applyLoadedCards(cached.cards, true);
        renderedFromCache = true;
      }
    } catch (_) {}
  }

  try {
    if (!catalogService?.fetchFresh) {
      throw new Error("The Supabase card catalog service is unavailable.");
    }

    const fresh = await catalogService.fetchFresh();
    applyLoadedCards(fresh.cards, false);
    return;
  } catch (error) {
    console.error("[Starlight] Supabase card catalog load failed.", error);

    if (renderedFromCache) {
      return;
    }

    // Emergency offline fallback only. This file is no longer the live source.
    const response = await fetch(FALLBACK_JSON_URL, { cache: "no-cache" });
    if (!response.ok) {
      throw error;
    }
    const data = await response.json();
    applyLoadedCards(data, false);
  }
}

async function refreshCardCatalog() {
  try {
    await loadCards({ forceRefresh: true });
  } catch (error) {
    console.error("[Starlight] Card catalog refresh failed.", error);
  }
}

window.refreshStarlightCardCatalog = refreshCardCatalog;

window.addEventListener("starlight-card-catalog-updated", () => {
  refreshCardCatalog();
});

function compareCatalogCardOrder(a, b) {
  const seriesDiff = Number(a.seriesSort || 0) - Number(b.seriesSort || 0);
  if (seriesDiff !== 0) return seriesDiff;
  const sortDiff = Number(a.sortOrder || 0) - Number(b.sortOrder || 0);
  if (sortDiff !== 0) return sortDiff;
  return a.number.localeCompare(b.number, undefined, { numeric: true });
}

function sortCards(list, mode) {
  list.sort((a, b) => {
    if (mode === "numberDesc") {
      const cmp = compareCatalogCardOrder(a, b);
      return cmp ? -cmp : 0;
    }
    if (mode === "nameAsc") return a.name.localeCompare(b.name) || compareCatalogCardOrder(a, b);
    if (mode === "rarityDesc") {
      return (RARITY_SCORE[b.rarity] || 0) - (RARITY_SCORE[a.rarity] || 0)
        || compareCatalogCardOrder(a, b);
    }
    return compareCatalogCardOrder(a, b);
  });
}


function getSeriesGroups() {
  const map = new Map();
  cards.forEach(card => {
    const key = card.series || "Series";
    if (!map.has(key)) {
      map.set(key, {
        series: key,
        seriesId: card.seriesId || "",
        seriesName: card.seriesName || key,
        seriesSort: Number(card.seriesSort || 9999),
        seriesDescription: card.seriesDescription || "",
        boosterImageUrl: card.boosterImageUrl || BOOSTER_PACK_URL,
        cards: []
      });
    }
    const group = map.get(key);
    group.cards.push(card);
    if (!group.seriesDescription && card.seriesDescription) group.seriesDescription = card.seriesDescription;
    if ((!group.boosterImageUrl || group.boosterImageUrl === BOOSTER_PACK_URL) && card.boosterImageUrl) group.boosterImageUrl = card.boosterImageUrl;
    group.seriesSort = Math.min(group.seriesSort, Number(card.seriesSort || group.seriesSort || 9999));
  });
  return [...map.values()].sort((a, b) => (a.seriesSort - b.seriesSort) || a.series.localeCompare(b.series, undefined, { numeric: true }));
}

function hydrateFilters(preserved = activeFilters()) {
  const series = ["All Series", ...getSeriesGroups().map(g => g.series)];
  $$('[data-series]').forEach(select => {
    const previous = preserved?.series || select.value || 'All Series';
    select.innerHTML = series.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
    if (previous && series.includes(previous)) select.value = previous;
  });
  const sortSelect = $('#sortSelect');
  if (sortSelect && preserved?.sort) {
    sortSelect.value = preserved.sort;
  }
  const viewFilter = preserved?.view || 'all';
  const viewInput = $(`[name="viewFilter"][value="${viewFilter}"]`);
  if (viewInput) viewInput.checked = true;
  const searchInput = $('#globalSearch');
  if (searchInput && preserved?.q) searchInput.value = preserved.q;
  const raritySelect = $('[data-rarity]');
  if (raritySelect && preserved?.rarity) raritySelect.value = preserved.rarity;
  const favoritesOnly = $('[data-filter-favorites]');
  if (favoritesOnly) favoritesOnly.checked = Boolean(preserved?.favoritesOnly);
  syncShellSeriesMenus();
}

function readSeriesQueryParam() {
  try {
    const params = new URLSearchParams(location.search);
    return String(params.get('series') || '').trim();
  } catch {
    return '';
  }
}

function readCardSetQueryParam() {
  try {
    return String(new URLSearchParams(location.search).get('cardSet') || '').trim().toLowerCase();
  } catch {
    return '';
  }
}

function applySeriesQueryFromUrl() {
  const requested = readSeriesQueryParam();
  if (!requested) return;
  const select = $('[data-series]');
  if (!select) return;
  const options = Array.from(select.options || []).map(option => option.value);
  if (requested === 'All Series' || options.includes(requested)) {
    select.value = requested;
  }
}

function applyCardSetQueryFromUrl() {
  activeCardSet = readCardSetQueryParam();
}

function syncShellSeriesMenus() {
  const populate = window.StarlightShellNav?.populateSeriesMegaMenus
    || window.parent?.StarlightShellNav?.populateSeriesMegaMenus;
  try {
    populate?.(getSeriesGroups());
  } catch {
    /* shell may be unavailable */
  }
}

function buildLightboxList(listMode = 'filtered') {
  if (listMode === 'favorites') {
    return filterCardList(cards.filter(c => isFavorite(c.id)), activeFilters(), { respectOwnership: false });
  }
  if (listMode === 'collection') {
    return filterCardList(cards.filter(c => isCollected(c.id)), activeFilters(), { respectOwnership: false });
  }
  if (listMode === 'duplicates') {
    return filterCardList(cards.filter(c => getCardQuantity(c.id) > 1), activeFilters(), { respectOwnership: false });
  }
  if (listMode === 'filtered') {
    applyFilters();
    return filtered.length ? [...filtered] : [...cards];
  }
  return [...cards];
}

function openPngLightbox(listMode = 'filtered') {
  if (!selected) return;
  const api = window.StarlightPngLightbox || window.parent?.StarlightPngLightbox;
  if (!api?.open) {
    openFullView(listMode);
    return;
  }
  const list = buildLightboxList(listMode);
  if (!list.find(c => c.id === selected.id)) list.unshift(selected);
  const index = Math.max(0, list.findIndex(c => c.id === selected.id));
  fullViewListMode = listMode;
  fullViewList = list;
  selectedIndex = index;
  let lightboxHoloEnabled = true;
  api.open({
    list,
    cardId: selected.id,
    restoreFocus: document.activeElement,
    getCardArt: (card) => {
      const got = isCollected(card.id);
      return {
        src: got ? (card.imageUrl || card.thumbnailUrl || CARD_BACK_URL) : CARD_BACK_URL,
        alt: getVisibleName(card)
      };
    },
    getCardMeta: (card) => ({
      kicker: card.series || 'Starlight Cards',
      title: getVisibleName(card),
      sub: [
        window.StarlightCardFilters?.cardDisplayNumber?.(card) || card.collectorNumber || card.number || '',
        getVisibleRarity(card)
      ].filter(Boolean).join(' · ')
    }),
    supportsHolo: (card) => isCollected(card.id) && cardSupportsHoloToggle(card),
    getFinish: (card) => {
      const got = isCollected(card.id);
      if (!got || !lightboxHoloEnabled || !cardSupportsHoloToggle(card)) {
        return { className: '', markup: '', holoOn: false };
      }
      return {
        className: cardFinishClass(card, true),
        markup: holoSparkMarkup(card, true),
        holoOn: true
      };
    },
    onHoloToggle: () => {
      lightboxHoloEnabled = !lightboxHoloEnabled;
      return lightboxHoloEnabled;
    },
    onStep: (card, nextIndex) => {
      selected = card;
      selectedIndex = nextIndex;
      previewFlipped = false;
    },
    onDetails: (card) => {
      if (card) {
        selected = card;
        selectedIndex = Math.max(0, list.findIndex(c => c.id === card.id));
      }
      openFullView(listMode);
    }
  });
  playSfx('analyze');
}

function applyAlbumBinderTheme() {
  if (pageName !== 'collection') return;
  const binder = $('#collectionGrid .card-album-binder') || $('#collectionGrid');
  if (!binder) return;
  const themes = window.StarlightBinderThemes;
  if (!themes?.applyTheme) return;
  const level = Number($('[data-collector-level]')?.textContent) || 1;
  const themeId = themes.resolveThemeId({
    storedId: themes.readStoredThemeId?.(),
    collectorLevel: level
  });
  themes.applyTheme(binder, themeId);
}

function getBinderOrganizeBy() {
  const sortSelect = $('#sortSelect');
  if (sortSelect?.value) return sortSelect.value;
  return window.StarlightAlbumBinder?.readOrganize?.() || 'numberAsc';
}

let albumCardOpening = false;

function openAlbumBinderCard(sourceEl) {
  const cardId = sourceEl?.dataset?.albumCard;
  if (!cardId || albumCardOpening) return;
  albumCardOpening = true;
  selected = cards.find(card => card.id === cardId) || selected;
  selectedIndex = Math.max(0, cards.findIndex(card => card.id === cardId));
  previewFlipped = false;
  window.requestAnimationFrame(() => {
    try {
      openPngLightbox('collection');
    } finally {
      window.setTimeout(() => {
        albumCardOpening = false;
      }, 280);
    }
  });
}

function sortedOwnedBinderCards(list) {
  const organizeBy = getBinderOrganizeBy();
  return window.StarlightAlbumBinder?.sortOwnedCards?.(list, organizeBy, { isFavorite })
    || list.slice();
}

function turnAlbumBinderSpread(direction) {
  const binderApi = window.StarlightAlbumBinder;
  const wrap = $('#collectionGrid');
  if (!wrap || !binderApi?.paginateSpread || binderApi.isAnimating?.()) return;
  const baseList = cards.filter(c => isCollected(c.id));
  const list = sortedOwnedBinderCards(filterCardList(baseList, activeFilters(), { respectOwnership: false }));
  const current = binderApi.paginateSpread(list, albumBinderPage);
  if (direction === 'prev' && albumBinderPage <= 1) return;
  if (direction === 'next' && albumBinderPage >= current.totalSpreads) return;
  playSfx('page');
  const binder = wrap.querySelector('.card-album-binder');
  const advance = () => {
    albumBinderPage += direction === 'prev' ? -1 : 1;
    binderApi.writePage(albumBinderPage);
    renderAlbumBinderSpread(wrap, list, { quietLayout: true });
  };
  if (binder && binderApi.animateSpreadTurn) {
    binderApi.animateSpreadTurn(binder, direction, advance);
    return;
  }
  advance();
}

function preloadAlbumBinderSpreadImages(list, spreadIndex) {
  const binderApi = window.StarlightAlbumBinder;
  if (!binderApi?.paginateSpread || !Array.isArray(list)) return;
  const sorted = sortedOwnedBinderCards(list);
  [spreadIndex - 1, spreadIndex + 1].filter(index => index >= 1).forEach(index => {
    const spreadData = binderApi.paginateSpread(sorted, index);
    [...spreadData.left, ...spreadData.right].forEach(card => {
      const url = card?.imageUrl || card?.thumbUrl;
      if (!url) return;
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
    });
  });
}

function notifyEmbedLayoutReady({ quiet = false } = {}) {
  window.__starlightEmbedReportHeight?.();
  if (quiet || pageName !== 'collection' || window.parent === window) return;
  window.__starlightEmbedAnnounceReady?.();
  window.parent.postMessage({
    type: 'starlight-app-ready',
    view: 'collection',
    height: document.documentElement?.scrollHeight || 0
  }, location.origin);
}

function initCardInteractionDelegation() {
  const collectionGrid = $('#collectionGrid');
  if (collectionGrid && collectionGrid.dataset.cardGridBound !== '1') {
    collectionGrid.dataset.cardGridBound = '1';
    const openFromEvent = (event) => {
      const btn = event.target.closest('[data-album-card]');
      if (!btn || pageName !== 'collection') return;
      if (window.StarlightAlbumBinder?.isAnimating?.()) return;
      event.preventDefault();
      event.stopPropagation();
      openAlbumBinderCard(btn);
    };
    collectionGrid.addEventListener('click', openFromEvent);
  }

  const galleryGrid = $('#seriesGridStage');
  if (galleryGrid && galleryGrid.dataset.cardGridBound !== '1') {
    galleryGrid.dataset.cardGridBound = '1';
    galleryGrid.addEventListener('click', event => {
      const btn = event.target.closest('[data-v61-card], .card-gallery-btn');
      const cardId = btn?.dataset?.v61Card;
      if (!cardId || pageName !== 'binder') return;
      event.preventDefault();
      event.stopPropagation();
      selected = cards.find(card => card.id === cardId) || selected;
      selectedIndex = Math.max(0, cards.findIndex(card => card.id === cardId));
      previewFlipped = false;
      openPngLightbox('filtered');
    });
  }
}

function renderAlbumBinderSpread(wrap, list, { quietLayout = false } = {}) {
  const binderApi = window.StarlightAlbumBinder;
  if (!wrap || !binderApi?.paginateSpread || !binderApi?.renderSpreadHtml) return false;
  const scrollY = quietLayout ? (window.scrollY || document.documentElement?.scrollTop || 0) : 0;
  const sorted = sortedOwnedBinderCards(list);
  const spreadData = binderApi.paginateSpread(sorted, albumBinderPage);
  albumBinderPage = spreadData.spread;
  binderApi.writePage(albumBinderPage);
  const level = Number($('[data-collector-level]')?.textContent) || 1;
  const themeId = window.StarlightBinderThemes?.resolveThemeId?.({ collectorLevel: level }) || 'starlight-classic';
  const pagerHtml = binderApi.renderPagerHtml(spreadData);
  wrap.innerHTML = binderApi.renderSpreadHtml({
    spreadData,
    ctx: cardTileContext(),
    themeId,
    pagerHtml
  });
  const binder = wrap.querySelector('.card-album-binder');
  window.StarlightBinderThemes?.applyTheme?.(binder, themeId, { updateBadge: true });
  preloadAlbumBinderSpreadImages(sorted, spreadData.spread);
  attachAlbumBinderHoverSfx(wrap);
  scanPerspectiveCardsIn(wrap);
  if (quietLayout) {
    window.requestAnimationFrame(() => {
      window.scrollTo(0, scrollY);
    });
    notifyEmbedLayoutReady({ quiet: true });
  } else {
    notifyEmbedLayoutReady();
  }
  return true;
}

function renderFilterControls() {
  const host = $('[data-card-filter-context]');
  if (!host || host.dataset.filterControlsReady === '1') return;
  const context = host.dataset.cardFilterContext || 'binder';
  const isCollection = context === 'collection';
  const isChecklist = context === 'checklist';
  const isBinder = context === 'binder';
  const binderCopy = websiteBinderLanding || websiteSection('binderLanding');
  const checklistCopy = websiteSection('checklist');
  const eyebrow = isChecklist
    ? (checklistCopy.filtersEyebrow || 'Find your cards')
    : (binderCopy.filtersEyebrow || 'Find your cards');
  const title = isCollection
    ? 'Collection Filters'
    : (isChecklist
      ? (checklistCopy.filtersTitle || 'Checklist Filters')
      : (binderCopy.filtersTitle || 'Binder Filters'));
  const resetLabel = binderCopy.filtersResetCta || 'Reset Filters';
  const showSearch = true;
  const display = binderDisplaySettings();
  const showView = isChecklist || (context === 'binder' && display.collectionStatusFilter === 'on');
  const fieldsHtml = `<div class="card-filter-fields${isBinder ? ' card-filter-fields--binder' : ''}">
      ${showSearch ? `<label class="card-filter-search"><span>Search</span><input id="globalSearch" type="search" placeholder="Search names, numbers, artists…" autocomplete="off"></label>` : ''}
      <label><span>Series</span><select data-series aria-label="Filter by series"></select></label>
      <label><span>Rarity</span><select data-rarity aria-label="Filter by rarity"><option>All Rarities</option><option>Common</option><option>Uncommon</option><option>Rare</option><option>Epic</option><option>Legendary</option></select></label>
      <label><span>Sort By</span><select id="sortSelect" aria-label="Sort cards"><option value="numberAsc">Number (Low to High)</option><option value="numberDesc">Number (High to Low)</option><option value="nameAsc">Name (A to Z)</option><option value="rarityDesc">Rarity (Best First)</option></select></label>
      ${showView ? `<fieldset class="card-filter-view"><legend>Collection Status</legend><label><input checked name="viewFilter" type="radio" value="all"> All Cards</label><label><input name="viewFilter" type="radio" value="collected"> Collected</label><label><input name="viewFilter" type="radio" value="missing"> Not Collected</label></fieldset>` : ''}
      ${isBinder ? `<label class="card-filter-favorites"><span>Favorites</span><span class="card-filter-favorites-control"><input class="qol-no-enhance" type="checkbox" data-filter-favorites value="1"><span>Favorites only</span></span></label>` : ''}
      <button class="card-filter-reset" type="button" data-reset-card-filters>${esc(resetLabel)}</button>
    </div>`;
  const setProgressHtml = `<div class="card-filter-set-progress" data-set-progress hidden>
        <div class="card-filter-set-progress-track">
          <div class="card-filter-set-progress-bar" data-set-progress-bar role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"></div>
        </div>
        <p class="card-filter-set-progress-label" data-set-progress-label></p>
      </div>`;
  host.innerHTML = isBinder
    ? `<p class="card-filter-binder-summary" data-filter-summary role="status" aria-live="polite">Preparing cards…</p>${setProgressHtml}${fieldsHtml}`
    : `<div class="card-filter-heading">
      <div><p class="eyebrow">${esc(eyebrow)}</p><h2>${esc(title)}</h2></div>
      <p data-filter-summary role="status" aria-live="polite">Preparing cards…</p>
      ${setProgressHtml}
    </div>
    ${fieldsHtml}`;
  host.dataset.filterControlsReady = '1';
}

function activeFilters() {
  return {
    q: ($('#globalSearch')?.value || '').trim().toLowerCase(),
    series: ($('[data-series]')?.value || 'All Series'),
    rarity: ($('[data-rarity]')?.value || 'All Rarities'),
    view: ($('[name="viewFilter"]:checked')?.value || 'all'),
    sort: ($('#sortSelect')?.value || 'numberAsc'),
    favoritesOnly: Boolean($('[data-filter-favorites]')?.checked),
    cardSet: activeCardSet || readCardSetQueryParam()
  };
}

function filterOptions() {
  return {
    respectOwnership: true,
    isCollected,
    isFavorite,
    sortCards
  };
}

function filterCardList(source, filters = activeFilters(), { respectOwnership = true } = {}) {
  const api = window.StarlightCardFilters;
  if (api?.filterCardList) {
    return api.filterCardList(source, filters, {
      respectOwnership,
      isCollected,
      isFavorite,
      sortCards
    });
  }
  // Compatibility fallback if utils failed to load.
  const list = source.filter(card => {
    const haystack = `${card.number} ${card.collectorNumber || ''} ${card.name} ${card.series} ${card.rarity} ${card.cardDescription} ${card.artist}`.toLowerCase();
    const seriesMatches = filters.series === 'All Series' || card.series === filters.series;
    const rarityMatches = filters.rarity === 'All Rarities' || String(card.rarity || '').trim().toLowerCase() === String(filters.rarity || '').trim().toLowerCase();
    const searchMatches = !filters.q || haystack.includes(filters.q);
    const ownershipMatches = !respectOwnership || filters.view === 'all' || (filters.view === 'collected' ? isCollected(card.id) : !isCollected(card.id));
    const favoriteMatches = !filters.favoritesOnly || isFavorite(card.id);
    return seriesMatches && rarityMatches && searchMatches && ownershipMatches && favoriteMatches;
  });
  sortCards(list, filters.sort);
  return list;
}

function resolveBinderBrowse() {
  const api = window.StarlightCardFilters;
  const filters = activeFilters();
  if (api?.resolveBinderBrowseList) {
    return api.resolveBinderBrowseList(cards, filters, filterOptions());
  }
  const searching = Boolean(filters.q);
  if (!searching && filters.series === 'All Series') {
    const list = filterCardList(cards, { ...filters, series: 'All Series' });
    const owned = list.filter(c => isCollected(c.id)).length;
    return {
      showLanding: false,
      list,
      poolSize: cards.length,
      heading: 'Card Gallery',
      summary: `Showing ${list.length} of ${cards.length} cards · ${owned} collected`
    };
  }
  const pool = filters.series === 'All Series' ? cards : cards.filter(c => c.series === filters.series);
  const list = filterCardList(pool, { ...filters, series: 'All Series' });
  return {
    showLanding: false,
    list,
    poolSize: pool.length,
    heading: filters.series === 'All Series' ? 'Search results' : filters.series,
    summary: `Showing ${list.length} of ${pool.length} cards`
  };
}

function applyFilters() {
  const browse = resolveBinderBrowse();
  filtered = browse.showLanding ? [] : browse.list.slice();
  const max = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  if (page > max) page = max;
  return browse;
}

function getVisibleImage(card) {
  if (isCollected(card.id)) return card.imageUrl;
  return isDullUnownedPreview() ? card.imageUrl : CARD_BACK_URL;
}
function getVisibleName(card) {
  if (isCollected(card.id) || isDullUnownedPreview()) return displayName(card);
  return "???";
}

/** Screen-reader label: keep mystery visuals, but name locked cards by number. */
function galleryCardAriaLabel(card) {
  const visible = getVisibleName(card);
  if (visible && visible !== '???') return `View ${visible}`;
  const number = window.StarlightCardFilters?.cardDisplayNumber?.(card)
    || card.collectorNumber
    || card.number
    || card.id
    || 'card';
  return `View uncollected card ${number}`;
}
function getVisibleRarity(card) {
  if (isCollected(card.id) || isDullUnownedPreview()) return card.rarity;
  return "Unknown";
}
function getVisibleDescription(card) { return isCollected(card.id) ? card.cardDescription : "This card has not been collected yet. Earn it from Free Daily Starlight Packs, reward codes, or future events."; }

function toggleFavorite(id) {
  const api = window.StarlightFavoriteUtils;
  const previous = readStore(FAVORITES_KEY);
  const result = api?.toggleFavoriteInStore
    ? api.toggleFavoriteInStore(previous, id)
    : (() => {
      const store = { ...previous };
      const isFavoriteNow = !store[id];
      if (store[id]) delete store[id]; else store[id] = true;
      return { store, isFavorite: isFavoriteNow };
    })();
  writeStore(FAVORITES_KEY, result.store);
  playSfx('favorite');

  const overlayOpen = Boolean($('#cardOverlay')?.classList.contains('open'));
  let needsFullViewRebuild = false;
  if (overlayOpen) {
    const resolved = api?.resolveFullViewAfterFavoriteChange
      ? api.resolveFullViewAfterFavoriteChange({
        list: fullViewList,
        selectedId: selected?.id,
        cardId: id,
        isFavorite: result.isFavorite,
        listMode: fullViewListMode
      })
      : {
        list: fullViewListMode === 'favorites' && !result.isFavorite
          ? fullViewList.filter(card => card.id !== id)
          : fullViewList,
        selectedId: selected?.id,
        shouldClose: false
      };
    fullViewList = resolved.list || [];
    if (resolved.shouldClose || (fullViewListMode === 'favorites' && !fullViewList.length)) {
      renderAll();
      closeFullView();
      return result.isFavorite;
    }
    if (resolved.selectedId && resolved.selectedId !== selected?.id) {
      selected = cards.find(card => card.id === resolved.selectedId) || fullViewList[0] || selected;
      selectedIndex = Math.max(0, fullViewList.findIndex(card => card.id === selected?.id));
      previewFlipped = false;
      overlayFlipped = false;
      needsFullViewRebuild = true;
    } else if (fullViewListMode === 'favorites' && !result.isFavorite) {
      needsFullViewRebuild = true;
    }
  }

  renderAll();
  if (overlayOpen && selected) {
    if (needsFullViewRebuild) {
      renderFullView();
    } else {
      const favBtn = $('#cardOverlay [data-toggle-favorite]');
      if (favBtn && favBtn.dataset.toggleFavorite === selected.id) {
        const full = websiteSection('binderFullView');
        favBtn.setAttribute('aria-pressed', result.isFavorite ? 'true' : 'false');
        favBtn.textContent = result.isFavorite
          ? (full.favoritedCta || '★ Favorited')
          : (full.favoriteCta || '♡ Favorite');
      } else {
        renderFullView();
      }
    }
  }
  return result.isFavorite;
}
function renderShell() {
  const total = cards.length;
  const got = cards.filter(c => isCollected(c.id)).length;
  const p = percent(got, total);
  $$('[data-total]').forEach(e => e.textContent = total);
  $$('[data-collected]').forEach(e => e.textContent = got);
  $$('[data-percent]').forEach(e => e.textContent = `${p}%`);
  $$('[data-progress]').forEach(e => e.style.width = `${p}%`);
  const mini = $('#miniSeries');
  if (mini) {
    const groups = [...new Set(cards.map(c => c.series))];
    mini.innerHTML = groups.map(series => {
      const list = cards.filter(c => c.series === series);
      const count = list.filter(c => isCollected(c.id)).length;
      return `<div class="mini-row"><b><span>${esc(series)}</span><span>${count} / ${list.length}</span></b><div class="bar"><span style="width:${percent(count, list.length)}%"></span></div></div>`;
    }).join("");
  }
  const ownedCards = cards.filter(card => isCollected(card.id));
  const rarityCounts = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'].map(rarity => ({
    rarity,
    count: ownedCards.filter(card => String(card.rarity).toLowerCase() === rarity.toLowerCase()).length
  }));
  const highestRarity = [...rarityCounts].reverse().find(item => item.count > 0);
  $$('[data-collection-highlight]').forEach(element => {
    element.textContent = highestRarity ? `${highestRarity.count} ${highestRarity.rarity} owned` : 'Your first card awaits';
  });
  const favoriteCount = cards.filter(card => isFavorite(card.id)).length;
  $$('[data-favorite-count]').forEach(element => {
    element.textContent = String(favoriteCount);
  });
  $$('[data-collection-insight]').forEach(element => {
    element.textContent = ownedCards.length
      ? `${favoriteCount} favorite${favoriteCount === 1 ? '' : 's'} selected · ${p}% of the full catalog collected.`
      : 'Collect your first card to begin building a rarity showcase.';
  });
  $$('[data-rarity-breakdown]').forEach(element => {
    element.innerHTML = rarityCounts.map(item => `<span class="rarity-${item.rarity.toLowerCase()}"><b>${item.count}</b> ${item.rarity}</span>`).join('');
  });
  $('#sfxToggle')?.classList.toggle('on', sfxOn);
}

function ensureWebsiteBinderLanding() {
  if (websiteBinderLanding) return Promise.resolve(websiteBinderLanding);
  if (window.__starlightWebsiteContent?.binderLanding) {
    websiteBinderLanding = window.__starlightWebsiteContent.binderLanding;
    return Promise.resolve(websiteBinderLanding);
  }
  if (!websiteContentPromise) {
    const studioPreview = new URLSearchParams(location.search).get('studioPreview') === '1';
    if (studioPreview) {
      websiteContentPromise = import('./website-content-hydrate.js')
        .then(({ loadAndHydrateWebsiteContent }) => loadAndHydrateWebsiteContent())
        .then((content) => {
          websiteBinderLanding = content?.binderLanding || null;
          return websiteBinderLanding;
        })
        .catch(() => null);
    } else {
      websiteContentPromise = import('./website-content-service.js')
        .then(({ getWebsiteContent }) => getWebsiteContent())
        .then((content) => {
          window.__starlightWebsiteContent = content;
          websiteBinderLanding = content?.binderLanding || null;
          return websiteBinderLanding;
        })
        .catch(() => {
          websiteBinderLanding = {
            eyebrow: 'Starlight Cards',
            title: 'Starlight Card Series Binder 📦',
            lead: 'Choose a booster pack to enter that series binder.',
            splashTitle: 'Choose A Series Booster Pack Below And Start Collecting!'
          };
          return websiteBinderLanding;
        });
    }
  }
  return websiteContentPromise;
}

window.addEventListener('starlight-website-content-hydrated', (event) => {
  websiteBinderLanding = event.detail?.binderLanding || websiteBinderLanding;
  try {
    refreshBinderFiltersForDisplay();
    applyBinderDisplayLayout();
    renderSeriesHero();
    if (pageName === 'binder') renderBinder();
  } catch (_error) {
    /* binder may not be ready yet */
  }
});

function renderSeriesHero() {
  const f = activeFilters();
  const toolbar = $('#seriesHeroToolbar');
  if (!toolbar) return;
  const landing = websiteBinderLanding || window.__starlightWebsiteContent?.binderLanding || websiteSection('binderLanding');
  const browsingSeries = f.series !== 'All Series';
  if (browsingSeries) {
    toolbar.hidden = false;
    toolbar.innerHTML = `<button id="backToSeries" class="btn" type="button">${esc(landing.backToSeriesCta || '← All Series')}</button>`;
  } else {
    toolbar.hidden = true;
    toolbar.innerHTML = '';
  }
}

function renderDetail() {
  const detail = $('#detailPanel');
  if (!detail) return;
  if (!selected) { detail.innerHTML = '<p class="description">Select a card to view details.</p>'; return; }
  selectedIndex = Math.max(0, cards.findIndex(c => c.id === selected.id));
  const got = isCollected(selected.id);
  const artClass = unownedArtClass(selected, { flipped: previewFlipped });
  const side = websiteSection('binderSidePanel');
  const qty = getCardQuantity(selected.id);
  detail.innerHTML = `
  <div class="detail-actions top-actions-preview">
    <button class="btn primary" id="flipPreview" type="button">${esc(side.flipCta || '↻ Flip')}</button>
    <button class="btn" id="openFullView" type="button">${esc(side.fullViewCta || '⛶ Full View')}</button>
  </div>
  <button class="preview-card flip-card simple-flip ${previewFlipped ? 'show-back showing-card-back' : ''} ${rarityClass(selected)}" id="previewCard" type="button" aria-label="Open full card view" data-finish-class="${esc(got ? cardFinishClass(selected, true) : '')}" data-holographic="${got && isHolographicCard(selected)}">
    <span class="preview-inner">
      <span class="face front ${cardFinishClass(selected, got && !previewFlipped)}"><img class="${artClass}" src="${esc(previewFlipped ? CARD_BACK_URL : getVisibleImage(selected))}" alt="${esc(previewFlipped ? 'Card back' : getVisibleName(selected))}" onerror="this.src='${CARD_BACK_URL}'">${holoSparkMarkup(selected, got && !previewFlipped)}</span>
      <span class="face back"><img src="${CARD_BACK_URL}" alt="Card back"></span>
    </span>
  </button>
  <div class="detail-card-info db2-card-info v91-side-details">
    <p class="db2-collector-line">${esc(selected.series)} · ${esc(selected.collectorNumber || selected.number)}</p>
    <h2>${esc(getVisibleName(selected))}</h2>
    <div class="v91-primary-facts">
      <span class="card-meta-chip rarity ${rarityClass(selected)}">${esc(getVisibleRarity(selected))}</span>
      <span class="card-meta-chip category">${esc(categoryLabel(selected))}</span>
      ${subcategoryLabel(selected) ? `<span class="card-meta-chip subcategory">${esc(subcategoryLabel(selected))}</span>` : ''}
      ${got && !isStandardMeta(finishLabel(selected)) ? `<span class="card-meta-chip finish">${esc(finishLabel(selected))}</span>` : ''}
    </div>
    <div class="detail-list clean-detail-list v91-identity-list">
      <p><b>${esc(side.seriesLabel || 'Series')}</b><span>${esc(selected.series)}</span></p>
      <p><b>${esc(side.collectorNumberLabel || 'Collector Number')}</b><span>${esc(selected.collectorNumber || selected.number)}</span></p>
      ${got && selected.artist ? `<p><b>${esc(side.artistLabel || 'Illustrator')}</b><span>${esc(selected.artist)}</span></p>` : ''}
      <p><b>${esc(side.ownedLabel || 'Owned')}</b><span>${got ? `×${qty}` : esc(side.notCollectedLabel || 'Not Collected')}</span></p>
    </div>
    <div class="db2-story"><b>${esc(side.storyLabel || 'Card Story')}</b><p>${esc(getVisibleDescription(selected))}</p></div>
    ${got ? `<details class="db2-more"><summary>${esc(side.additionalLabel || 'Additional Information')}</summary><div class="detail-list clean-detail-list"><p><b>Variant</b><span>${esc(variantLabel(selected))}</span></p><p><b>Finish</b><span>${esc(finishLabel(selected))}</span></p>${cardExpandedDetails(selected)}</div></details>` : ''}
  </div>`;
  $('#flipPreview')?.addEventListener('click', () => { previewFlipped = !previewFlipped; flipCardImage($('#previewCard'), getVisibleImage(selected), getVisibleName(selected), previewFlipped); playSfx('flip'); });
  $('#openFullView')?.addEventListener('click', () => openFullView('filtered'));
  $('#previewCard')?.addEventListener('click', (e) => { if (!e.target.closest('#flipPreview')) openFullView('filtered'); });
}

function notifyShellChrome({ hideLiveFeed = false } = {}) {
  try {
    window.parent?.postMessage?.(
      { type: 'starlight-shell-chrome', hideLiveFeed: Boolean(hideLiveFeed) },
      window.location.origin
    );
  } catch {
    /* ignore */
  }
}

let cardOverlayModal = null;
const FULL_VIEW_BACKDROP_HTML = '<button type="button" class="st-modal-backdrop" data-st-modal-backdrop tabindex="-1" aria-label="Close"></button>';
function bindFullViewBackdropClose(overlay) {
  if (!overlay || overlay.dataset.fullViewBackdropBound === 'true') return;
  overlay.dataset.fullViewBackdropBound = 'true';
  overlay.addEventListener('click', (event) => {
    if (!overlay.classList.contains('open')) return;
    const dialog = overlay.querySelector('.full-card-stage') || overlay.querySelector('.analyzer-modal');
    const clickedBackdrop = window.StarlightUI?.isBackdropClick?.(event, overlay, dialog)
      ?? (event.target === overlay
        || event.target.closest?.('[data-st-modal-backdrop]')
        || (dialog && overlay.contains(event.target) && !dialog.contains(event.target)));
    if (clickedBackdrop) closeFullView();
  });
}
function fullViewModal() {
  const overlay = $('#cardOverlay');
  if (!overlay || !window.StarlightUI) return null;
  if (!cardOverlayModal) {
    cardOverlayModal = window.StarlightUI.adoptModal(overlay, {
      dialog: element => element.querySelector('.full-card-stage') || element.querySelector('.analyzer-modal'),
      labelledBy: 'fullViewCardTitle',
      closeOnBackdrop: true,
      onOpen: () => {
        overlay.classList.add('open');
        document.body.classList.add('modal-open');
        notifyShellChrome({ hideLiveFeed: true });
      },
      onClose: () => {
        overlay.classList.remove('open', 'card-analyzer-open');
        document.body.classList.remove('modal-open');
        notifyShellChrome({ hideLiveFeed: false });
      }
    });
  }
  return cardOverlayModal;
}

function openFullView(listMode = 'all') {
  if (!selected) return;
  fullViewListMode = listMode;
  analyzerActiveTab = 'details';
  analyzerHoloEnabled = true;
  if (listMode === 'favorites') {
    fullViewList = filterCardList(cards.filter(c => isFavorite(c.id)), activeFilters(), { respectOwnership: false });
  } else if (listMode === 'collection') {
    fullViewList = filterCardList(cards.filter(c => isCollected(c.id)), activeFilters(), { respectOwnership: false });
  } else if (listMode === 'duplicates') {
    fullViewList = filterCardList(cards.filter(c => getCardQuantity(c.id) > 1), activeFilters(), { respectOwnership: false });
  } else if (listMode === 'filtered') {
    applyFilters();
    fullViewList = filtered.length ? [...filtered] : [...cards];
  } else {
    fullViewList = [...cards];
  }
  if (!fullViewList.find(c => c.id === selected.id)) fullViewList.unshift(selected);
  selectedIndex = Math.max(0, fullViewList.findIndex(c => c.id === selected.id));

  const revealModal = () => {
    overlayFlipped = previewFlipped;
    const overlay = $('#cardOverlay');
    if (overlay) {
      overlay.hidden = false;
      overlay.removeAttribute('aria-hidden');
    }
    overlay?.classList.add('card-analyzer-open');
    renderFullView();
    playSfx('analyze');
    const modal = fullViewModal();
    if (modal) modal.open({ initialFocus: '.overlay-close' });
    else {
      bindFullViewBackdropClose($('#cardOverlay'));
      $('#cardOverlay')?.classList.add('open');
      document.body.classList.add('modal-open');
      notifyShellChrome({ hideLiveFeed: true });
    }
  };

  revealModal();
}
function closeFullView() {
  $('#cardOverlay')?.classList.remove('card-analyzer-open');
  if (cardOverlayModal?.isOpen) cardOverlayModal.close(undefined, 'page');
  else {
    const overlay = $('#cardOverlay');
    overlay?.classList.remove('open');
    if (overlay) {
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('modal-open');
    notifyShellChrome({ hideLiveFeed: false });
  }
}
function stepFullView(dir) {
  const list = fullViewList.length ? fullViewList : cards;
  if (!list.length) return;
  selectedIndex = (selectedIndex + dir + list.length) % list.length;
  selected = list[selectedIndex];
  previewFlipped = false;
  overlayFlipped = false;
  renderDetail();
  renderFullView();
  playSfx('page');
}
function renderFullView() {
  const overlay = $('#cardOverlay'); if (!overlay || !selected) return;
  overlay.classList.add('card-analyzer-open');
  const got = isCollected(selected.id);
  const artClass = unownedArtClass(selected, { flipped: false });
  const visibleName = getVisibleName(selected);
  const visibleRarity = getVisibleRarity(selected);
  const full = websiteSection('binderFullView');
  const qty = getCardQuantity(selected.id);
  const finishClass = got && analyzerHoloEnabled ? cardFinishClass(selected, true) : '';
  const premiumPerspective = window.StarlightPerspectiveCard?.hasPremiumPerspective?.(selected);
  const holoMarkup = got && analyzerHoloEnabled && !overlayFlipped && !premiumPerspective ? holoSparkMarkup(selected, true) : '';
  const frontArt = perspectiveArt(selected, {
    imageUrl: getVisibleImage(selected),
    alt: visibleName,
    imgClass: artClass,
    visible: perspectiveArtVisible(selected, got && !overlayFlipped)
  });
  const seriesName = selected.series || 'Unknown Series';
  const subtitleRaw = String(selected.seriesDescription || seriesName).trim();
  const subtitle = subtitleRaw.length > 80 ? `${subtitleRaw.slice(0, 77)}…` : subtitleRaw;
  const collectorNo = selected.collectorNumber || selected.number || '???';
  const category = got || !isDullUnownedPreview() ? categoryLabel(selected) : '???';
  const sub = got ? subcategoryLabel(selected) : '';
  const variant = got ? variantLabel(selected) : '';
  const finish = got ? finishLabel(selected) : '';
  const storyText = got
    ? (selected.cardDescription || 'No card story has been added yet.')
    : getVisibleDescription(selected);
  const noteText = got
    ? 'Tap Flip to peek the back · drag the card to tilt.'
    : 'Collect this card to unlock its full story and details.';
  const traitName = got
    ? [category, sub].filter(Boolean).join(' · ')
    : (isDullUnownedPreview() ? visibleRarity : 'Details locked');
  // Artist is shown in its own Illustrator row — keep Trait free of that duplicate.
  const traitDetail = got
    ? [variant && !isStandardMeta(variant) ? variant : '', finish && !isStandardMeta(finish) ? finish : '']
        .filter(Boolean)
        .join(' · ') || `${finishLabel(selected)} finish`
    : 'Earn this card from Free Daily Starlight Packs, packs, or rewards.';
  if (analyzerActiveTab !== 'story') analyzerActiveTab = 'details';
  const detailsTabActive = analyzerActiveTab !== 'story';

  overlay.innerHTML = `${FULL_VIEW_BACKDROP_HTML}<div class="full-card-stage analyzer-full-stage analyzer-sekai-stage ${rarityClass(selected)}" role="dialog" aria-modal="true" aria-labelledby="fullViewCardTitle" tabindex="-1">
    <div class="analyzer-bg" aria-hidden="true"><span></span><span></span><span></span></div>
    <div class="analyzer-modal">
      <span class="analyzer-spark analyzer-spark-tl" aria-hidden="true">✦</span>
      <span class="analyzer-spark analyzer-spark-tr" aria-hidden="true">✧</span>
      <span class="analyzer-spark analyzer-spark-bl" aria-hidden="true">✧</span>
      <span class="analyzer-spark analyzer-spark-br" aria-hidden="true">✦</span>
      <header class="analyzer-chrome">
        <div class="analyzer-tabs" role="tablist" aria-label="Card view sections">
          <button class="analyzer-tab ${detailsTabActive ? 'is-active' : ''}" type="button" role="tab" data-analyzer-tab="details" aria-selected="${detailsTabActive ? 'true' : 'false'}">${esc(full.detailsTabLabel || 'Card Details')}</button>
          <button class="analyzer-tab ${detailsTabActive ? '' : 'is-active'}" type="button" role="tab" data-analyzer-tab="story" aria-selected="${detailsTabActive ? 'false' : 'true'}">${esc(full.storyTabLabel || 'Story')}</button>
        </div>
        <button class="overlay-close analyzer-close" type="button" data-st-modal-close aria-label="Close">×</button>
      </header>
      <div class="analyzer-body">
        <section class="analyzer-panel analyzer-panel-details ${detailsTabActive ? 'is-active' : ''}" data-analyzer-panel="details" ${detailsTabActive ? '' : 'hidden'}>
          <header class="analyzer-card-header">
            <div class="analyzer-header-copy">
              <p class="analyzer-subtitle">${esc(subtitle)}</p>
              <h2 id="fullViewCardTitle">${esc(visibleName)}</h2>
            </div>
            <div class="analyzer-header-meta">
              <div class="analyzer-series-badge" title="${esc(seriesName)}">
                <span class="analyzer-series-spark" aria-hidden="true">✦</span>
                <span class="analyzer-series-name">${esc(seriesName)}</span>
              </div>
              <span class="analyzer-category-chip" title="${esc(category)}">${esc(category)}</span>
            </div>
          </header>
          <div class="analyzer-main-row">
            <div class="analyzer-card-col">
              <div class="analyzer-card-stage">
                <button class="overlay-arrow left analyzer-arrow" type="button" aria-label="Previous card">‹</button>
                <button class="overlay-arrow right analyzer-arrow" type="button" aria-label="Next card">›</button>
                <div class="full-card-wrap simple-flip analyzer-card-shell analyzer-card-3d ${overlayFlipped ? 'show-back showing-card-back' : ''} ${analyzerHoloEnabled ? '' : 'is-holo-off'} ${rarityClass(selected)}" id="fullCard3d" aria-label="${esc(overlayFlipped ? 'Card back' : visibleName)}" data-holographic="${got && analyzerHoloEnabled && isHolographicCard(selected)}" data-finish-class="${esc(finishClass)}">
                  <span class="full-inner">
                    <span class="face front ${finishClass}">${frontArt}${!overlayFlipped ? holoMarkup : ''}</span>
                    <span class="face back"><img src="${esc(CARD_BACK_URL)}" alt="Card back" draggable="false"></span>
                  </span>
                </div>
              </div>
              ${rarityStarsHtml(selected, visibleRarity)}
              <div class="analyzer-card-tools">
                <button class="btn overlay-flip analyzer-flip" type="button">${esc(full.flipCta || '↻ Flip')}</button>
                <p class="analyzer-soft-note"><span aria-hidden="true">✧</span> ${esc(noteText)}</p>
              </div>
            </div>
            <aside class="analyzer-stats-panel">
              ${analyzerStatRow(full.rarityLabel || 'Rarity', `<b class="${rarityClass(selected)}">${esc(visibleRarity)}</b>`, { icon: '★' })}
              ${analyzerStatRow(full.collectorNumberLabel || 'Collector #', esc(collectorNo), { icon: '#' })}
              ${got ? analyzerStatRow(full.ownedLabel || 'Owned', `×${qty}`, { icon: '♡' }) : analyzerStatRow(full.ownedLabel || 'Owned', esc(full.notCollectedLabel || 'Not collected'), { icon: '♡' })}
              ${got && selected.artist ? analyzerStatRow(full.illustratorLabel || 'Artist', esc(selected.artist), { icon: '✎' }) : ''}
              <div class="analyzer-skill-block">
                <div class="analyzer-skill-head">
                  <span class="analyzer-stat-label">${esc(full.traitLabel || 'Trait')}</span>
                  <span class="analyzer-skill-name">${esc(traitName)}</span>
                </div>
                <p class="analyzer-skill-detail">${esc(traitDetail)}</p>
              </div>
              <div class="analyzer-actions-strip">
                <div class="analyzer-actions-row">
                  ${got ? `<button class="btn overlay-favorite analyzer-favorite" type="button" data-toggle-favorite="${esc(selected.id)}" aria-pressed="${isFavorite(selected.id) ? 'true' : 'false'}">${esc(isFavorite(selected.id) ? (full.favoritedCta || '★ Favorited') : (full.favoriteCta || '♡ Favorite'))}</button>` : ''}
                  ${got ? analyzerDisplayTogglesHtml(selected) : ''}
                </div>
              </div>
            </aside>
          </div>
        </section>
        <section class="analyzer-panel analyzer-panel-story ${detailsTabActive ? '' : 'is-active'}" data-analyzer-panel="story" ${detailsTabActive ? 'hidden' : ''}>
          <div class="analyzer-story-full">
            <header class="analyzer-side-story-head"><span>${esc(full.storyLabel || 'Card Story')}</span></header>
            <div class="analyzer-side-story-body">
              <p>${esc(storyText)}</p>
            </div>
          </div>
          ${got ? `<details class="analyzer-more"><summary>${esc(full.additionalLabel || 'Additional Information')}</summary><div class="detail-list clean-detail-list">${cardExpandedDetails(selected)}</div></details>` : ''}
          <div data-card-comments-host></div>
        </section>
      </div>
      <footer class="analyzer-footer">
        <button class="analyzer-footer-close" type="button" data-st-modal-close>${esc(full.closeCta || 'Close')}</button>
      </footer>
    </div>
  </div>`;

  const bindClose = (el) => el?.addEventListener('click', closeFullView);
  bindClose($('.overlay-close', overlay));
  bindClose($('.analyzer-footer-close', overlay));
  $('.overlay-arrow.left', overlay)?.addEventListener('click', () => stepFullView(-1));
  $('.overlay-arrow.right', overlay)?.addEventListener('click', () => stepFullView(1));
  overlay.querySelectorAll('[data-analyzer-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      setAnalyzerTab(btn.dataset.analyzerTab === 'story' ? 'story' : 'details');
      playSfx('page');
    });
  });
  setAnalyzerTab(analyzerActiveTab);
  $$('.overlay-flip', overlay).forEach(btn => btn.addEventListener('click', () => {
    overlayFlipped = !overlayFlipped;
    flipAnalyzerCard($('#fullCard3d'), getVisibleName(selected));
    const stars = overlay.querySelector('.analyzer-rarity-stars');
    if (stars) stars.hidden = overlayFlipped;
    playSfx('flip');
  }));
  const starsEl = overlay.querySelector('.analyzer-rarity-stars');
  if (starsEl) starsEl.hidden = overlayFlipped;
  attachFullViewTilt();
  applyAnalyzerDisplayToggles();
  const commentsHost = overlay.querySelector('[data-card-comments-host]');
  if (commentsHost && selected?.id) {
    import('./card-comments.js?v=1.1.0')
      .then((mod) => mod.mountCardComments(commentsHost, selected.id))
      .catch((error) => {
        commentsHost.innerHTML = `<p class="card-comments-status">Comments unavailable.</p>`;
        console.warn('[Starlight] Card comments failed to load', error);
      });
  }
  scanPerspectiveCardsIn(overlay);
}

function renderAlbumCard(card, i) { return renderSharedAlbumCard(card, i); }

function renderAlbumListCard(c, mode) { return renderSharedListCard(c, mode); }

function renderAlbumCardLegacy(card, i) {
  const got = isCollected(card.id);
  const numberLabel = window.StarlightCardFilters?.cardDisplayNumber?.(card) || String(card.collectorNumber || card.number || '');
  const qty = getCardQuantity(card.id);
  return `<article class="card-album-slot ${rarityClass(card)}" style="--i:${i}">
    <button class="card-album-btn" type="button" data-album-card="${esc(card.id)}" aria-label="Open ${esc(displayName(card))} full view">
      <span class="card-album-art">${perspectiveArt(card, { imageUrl: card.imageUrl, alt: displayName(card), visible: perspectiveArtVisible(card, got) })}</span>
      <span class="card-album-number">${esc(numberLabel)}</span>
    </button>
    <span class="card-album-meta"><strong>${esc(displayName(card))}</strong><span class="card-album-qty">×${qty}</span></span>
  </article>`;
}

function renderAlbumListCardLegacy(c, mode) {
  const got = isCollected(c.id);
  const quantity = getCardQuantity(c.id);
  const favorited = isFavorite(c.id);
  return `<article class="card-album-list-card ${rarityClass(c)}" data-id="${esc(c.id)}" data-open-collection-card="${esc(c.id)}" role="button" tabindex="0" aria-label="Open ${esc(getVisibleName(c))} full view">
    <div class="card-album-list-art">${perspectiveArt(c, { imageUrl: getVisibleImage(c), alt: getVisibleName(c), visible: perspectiveArtVisible(c, got) })}</div>
    <h3>${esc(getVisibleName(c))}</h3>
    <p class="card-album-list-sub">${esc(c.collectorNumber || c.number)} · ${esc(c.series)}</p>
    <div class="card-meta-chips compact">${cardIdentityChips(c, { hidden: !got })}</div>
    ${mode === 'duplicates' ? `<p class="duplicate-copy-summary"><strong>${quantity}</strong> total · <strong>${quantity - 1}</strong> exchangeable</p>` : ''}
    <div class="card-album-list-actions">
      <span class="ownership-status owned">×${quantity}</span>
      ${got ? `<button class="icon-btn" type="button" data-toggle-favorite="${esc(c.id)}" aria-label="${favorited ? 'Remove from favorites' : 'Add to favorites'}" aria-pressed="${favorited ? 'true' : 'false'}">${favorited ? '★' : '☆'}</button>` : ''}
    </div>
  </article>`;
}

function renderGridPage(target, mode) {
  const wrap = $(target); if (!wrap) return;
  let baseList = cards;
  if (mode === 'collection') baseList = cards.filter(c => isCollected(c.id));
  if (mode === 'favorites') baseList = cards.filter(c => isFavorite(c.id));
  if (mode === 'duplicates') baseList = cards.filter(c => getCardQuantity(c.id) > 1);
  const list = filterCardList(baseList, activeFilters(), { respectOwnership: false });
  if (mode === 'collection' || mode === 'favorites' || mode === 'duplicates') {
    const activeTab = document.querySelector('[data-collection-tab].active')?.dataset.collectionTab || 'all';
    const shouldAnnounce = (mode === 'collection' && activeTab === 'all')
      || (mode === 'favorites' && activeTab === 'favorites')
      || (mode === 'duplicates' && activeTab === 'duplicates');
    if (shouldAnnounce) {
      $$('[data-filter-summary]').forEach(element => {
        if (mode === 'favorites') {
          element.textContent = `Showing ${list.length} of ${baseList.length} favorite${baseList.length === 1 ? '' : 's'}`;
        } else if (mode === 'duplicates') {
          if (!list.length) {
            element.textContent = baseList.length
              ? 'No duplicate cards match these filters'
              : 'No duplicate cards yet — extras appear here when you own more than one copy';
          } else {
            const exchangeable = list.reduce((sum, card) => sum + Math.max(0, getCardQuantity(card.id) - 1), 0);
            const explain = window.StarlightCardFilters?.formatSetProgressExplanation?.({
              series: activeFilters().series === 'All Series' ? 'your collection' : activeFilters().series,
              owned: cards.filter(card => isCollected(card.id)).length,
              total: cards.length,
              duplicateCards: list.length,
              exchangeableCopies: exchangeable
            });
            element.textContent = explain
              || `Showing ${list.length} of ${baseList.length} duplicate card${baseList.length === 1 ? '' : 's'} · ${exchangeable} exchangeable ${exchangeable === 1 ? 'copy' : 'copies'} (one copy stays collected)`;
          }
        } else {
          element.textContent = `Showing ${list.length} of ${baseList.length} owned card${baseList.length === 1 ? '' : 's'}`;
        }
      });
    }
  }
  wrap.classList.toggle('empty-grid', !list.length);
  const collectionCopy = websiteSection('collection');
  const emptyTitle = baseList.length
    ? (collectionCopy.emptyFiltersTitle || 'No cards match these filters')
    : (mode === 'favorites'
      ? (collectionCopy.emptyFavoritesTitle || 'No favorites yet')
      : (collectionCopy.emptyAllTitle || 'No cards here yet'));
  const emptyLead = baseList.length
    ? (collectionCopy.emptyFiltersLead || 'Try resetting one or more filters to see additional cards.')
    : (mode === 'favorites'
      ? (collectionCopy.emptyFavoritesLead || 'Tap the star on your favorite cards and this showcase will sparkle to life.')
      : (collectionCopy.emptyAllLead || 'Earn cards from Free Daily Starlight Packs, redemption codes, and special rewards to fill your album binder.'));
  const emptyAction = baseList.length
    ? `<button class="btn primary" type="button" data-reset-card-filters>${esc(collectionCopy.emptyFiltersCta || 'Reset Filters')}</button>`
    : `<a class="btn primary" href="binder?view=binder">${esc(mode === 'favorites' ? (collectionCopy.emptyFavoritesCta || 'Open Card Gallery') : (collectionCopy.emptyAllCta || 'Open Card Gallery'))}</a>`;
  if (mode === 'collection') {
    if (list.length && renderAlbumBinderSpread(wrap, list)) return;
    wrap.innerHTML = `<div class="empty-state"><h2>${esc(emptyTitle)}</h2><p>${esc(emptyLead)}</p>${emptyAction}</div>`;
    return;
  }
  wrap.innerHTML = list.length
    ? `<div class="card-album-grid card-album-grid--list">${list.map(c => renderAlbumListCard(c, mode)).join('')}</div>`
    : `<div class="empty-state"><h2>${esc(emptyTitle)}</h2><p>${esc(emptyLead)}</p>${emptyAction}</div>`;
  attachTileTilts();
  scanPerspectiveCardsIn(wrap);
}

function renderFavoritesShowcase() {
  const showcase = $('#favoriteShowcase'); if (!showcase) return;
  const allFavorites = cards.filter(c => isFavorite(c.id));
  const favs = filterCardList(allFavorites, activeFilters(), { respectOwnership: false });
  const collectionCopy = websiteSection('collection');
  if (!favs.length) {
    const title = allFavorites.length
      ? (collectionCopy.emptyFiltersTitle || 'No favorites match these filters')
      : (collectionCopy.favoritesShowcaseTitle || 'Favorite Showcase');
    const lead = allFavorites.length
      ? (collectionCopy.emptyFiltersLead || 'Reset the filters to bring the rest of your favorite cards back into view.')
      : (collectionCopy.favoritesShowcaseEmptyLead || 'Star a card to put it on the Starlight stage. Your favorites will scroll here like a tiny idol parade.');
    const action = allFavorites.length
      ? `<button class="btn primary" type="button" data-reset-card-filters>${esc(collectionCopy.emptyFiltersCta || 'Reset Filters')}</button>`
      : `<a class="btn primary" href="binder?view=binder">${esc(collectionCopy.favoritesShowcaseCta || 'Find Favorites')}</a>`;
    showcase.innerHTML = `<div class="empty-state trophy-empty"><h2>${esc(title)}</h2><p>${esc(lead)}</p>${action}</div>`;
    return;
  }
  showcase.innerHTML = `<div class="favorite-carousel-head"><h2>${esc(collectionCopy.favoritesShowcaseTitle || 'Favorite Showcase')}</h2><p>${favs.length} favorite card${favs.length === 1 ? '' : 's'} · same list as the grid below</p></div><div class="favorite-carousel">${favs.map((c, i) => {
    const got = isCollected(c.id);
    const hidden = !got;
    return `<div class="fav-spot ${rarityClass(c)}" style="--i:${i}">
      <button class="fav-open" type="button" data-open-favorite="${esc(c.id)}" aria-label="Open ${esc(getVisibleName(c))} in full view">
        <span class="fav-image"><img class="${hidden ? 'obscured' : ''}" src="${esc(getVisibleImage(c))}" alt="${esc(getVisibleName(c))}"></span>
        <span>${esc(getVisibleName(c))}</span>
      </button>
      <button class="fav-unstar icon-btn" type="button" data-toggle-favorite="${esc(c.id)}" aria-label="Remove ${esc(getVisibleName(c))} from favorites" aria-pressed="true">★</button>
    </div>`;
  }).join('')}</div>`;
  attachTileTilts();
  attachBinderHoverSfx();
}


function exportCollectionData() {
  const payload = {
    app: 'Starlight Card Binder',
    version: 42,
    exportedAt: new Date().toISOString(),
    collected: readStore(STORAGE_KEY),
    favorites: readStore(FAVORITES_KEY),
    sfxOn
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0,10);
  a.href = url;
  a.download = `starlight-card-binder-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importCollectionData(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(String(reader.result || '{}'));
      const collected = payload.collected && typeof payload.collected === 'object' ? payload.collected : null;
      const favorites = payload.favorites && typeof payload.favorites === 'object' ? payload.favorites : null;
      if (!collected && !favorites) throw new Error('Missing collection data');
      // Ownership is cloud-authoritative and is never imported from a browser backup.
      if (favorites) writeStore(FAVORITES_KEY, favorites);
      if (typeof payload.sfxOn === 'boolean') { sfxOn = payload.sfxOn; localStorage.setItem(SFX_KEY, sfxOn ? 'on' : 'off'); }
      playSfx('sparkle');
      renderAll();
      window.StarlightUI?.toast('Your Starlight preferences and favorites were imported. Card ownership remains synced from your account.','success');
    } catch (err) {
      window.StarlightUI?.toast('That backup file could not be imported. Make sure it is a Starlight Card Binder JSON export.','error',5000);
      console.error(err);
    }
  };
  reader.readAsText(file);
}

function renderChecklist() {
  const body = $('#checklistBody'); if (!body) return;
  const list = filterCardList(cards, activeFilters(), { respectOwnership: true });
  $$('[data-filter-summary]').forEach(element => {
    element.textContent = `Showing ${list.length} of ${cards.length} card${cards.length === 1 ? '' : 's'}`;
  });
  if (!list.length) {
    body.innerHTML = `<tr class="item checklist-empty-row"><td colspan="8"><div class="empty-state"><h2>${cards.length ? 'No cards match these filters' : 'No cards in the checklist yet'}</h2><p>${cards.length ? 'Reset one or more filters to bring cards back into view.' : 'Cards will appear here once the Starlight catalog loads.'}</p>${cards.length ? '<button class="btn primary" type="button" data-reset-card-filters>Reset Filters</button>' : ''}</div></td></tr>`;
    return;
  }
  body.innerHTML = list.map(c => {
    const got = isCollected(c.id); const hidden = !got;
    // Registry rows stay flat thumbnails — premium perspective markup breaks .check-card sizing.
    const thumbUrl = got
      ? (c.thumbnailUrl || c.imageUrl || '')
      : getVisibleImage(c);
    return `<tr class="item"><td><div class="check-card">${perspectiveArt(c, { imageUrl: thumbUrl, alt: getVisibleName(c), imgClass: hidden ? 'obscured' : '', visible: false })}<span>${esc(c.collectorNumber || c.number)}</span></div></td><td>${esc(getVisibleName(c))}</td><td>${esc(c.series)}</td><td>${hidden?'—':`<span class="card-meta-chip category">${esc(categoryLabel(c))}</span>${subcategoryLabel(c)?`<br><small>${esc(subcategoryLabel(c))}</small>`:''}`}</td><td><span class="card-meta-chip rarity ${rarityClass(c)}">${esc(getVisibleRarity(c))}</span></td><td><b>×${getCardQuantity(c.id)}</b>${getCardQuantity(c.id)>1?`<br><small>+${getCardQuantity(c.id)-1} extra</small>`:""}</td><td><span class="ownership-status ${got ? 'owned' : 'locked'}">${got ? 'Collected' : 'Not Collected'}</span></td><td>${got ? `<button class="icon-btn" type="button" data-toggle-favorite="${esc(c.id)}" aria-label="${isFavorite(c.id) ? 'Remove from favorites' : 'Add to favorites'}" aria-pressed="${isFavorite(c.id) ? 'true' : 'false'}">${isFavorite(c.id)?'★':'☆'}</button>` : '<span class="soft-note">—</span>'}</td></tr>`;
  }).join('');
}
function renderAbout() {
  const about = $('#seriesAbout'); if (!about) return;
  const groups = [...new Set(cards.map(c => c.series))];
  about.innerHTML = groups.map(series => { const list = cards.filter(c => c.series === series); const legendary = list.filter(c=>c.rarity==='Legendary').length; return `<div class="collection-card text-card"><h3>${esc(series)}</h3><p>${esc(list.find(c=>c.seriesDescription)?.seriesDescription || 'A Starlight card series.')}</p><p><b>${list.length}</b> cards • <b>${legendary}</b> Legendary</p></div>`; }).join('');
}
function renderAll() {
  document.body.classList.toggle('sfx-on', sfxOn);
  renderShell();
  applyAlbumBinderTheme();
  if (pageName === 'binder') renderBinder();
  renderGridPage('#collectionGrid', 'collection');
  renderGridPage('#favoriteGrid', 'favorites');
  renderGridPage('#collectionDuplicateGrid', 'duplicates');
  renderFavoritesShowcase();
  renderChecklist();
  renderAbout();
  updateRaritySelectClass();
  initCardInteractionDelegation();
  notifyEmbedLayoutReady();
}
window.renderAll = renderAll;
window.applyStarlightSeriesFilter = (seriesName) => {
  const requested = String(seriesName || '').trim() || readSeriesQueryParam() || 'All Series';
  const select = $('[data-series]');
  if (select) {
    const options = Array.from(select.options || []).map(option => option.value);
    if (requested === 'All Series' || options.includes(requested) || !options.length) {
      select.value = requested;
    }
  }
  page = 1;
  renderAll();
};
window.applyStarlightCardSetFilter = (cardSet, { render = true } = {}) => {
  activeCardSet = String(cardSet || '').trim().toLowerCase();
  if (activeCardSet) {
    const select = $('[data-series]');
    if (select) select.value = 'All Series';
  }
  page = 1;
  if (render) renderAll();
};



function startPackOpen(series) {
  const select = $('[data-series]'); if (select) select.value = series;
  page = 1;
  const nextSeriesCards = cards.filter(c => c.series === series);
  selected = nextSeriesCards[0] || null;
  selectedIndex = selected ? cards.findIndex(c => c.id === selected.id) : 0;
  previewFlipped = false;
  playSfx('charge');
  renderAll();
}

function updateRaritySelectClass() {
  $$('[data-rarity]').forEach(select => {
    const value = String(select.value || 'All Rarities').toLowerCase().replace(/[^a-z0-9]/g, '');
    select.className = select.className.replace(/\brarity-select-\S+/g, '').trim();
    select.classList.add(`rarity-select-${value || 'allrarities'}`);
  });
}


// V35: pointer tilt is handled per card by attachTiltTo().
// The older global pointermove tilt was removed to prevent duplicate hover state and SFX jitter.
document.addEventListener('click', e => {
  if (e.target.closest('[data-toggle-analyzer-holo]')) {
    e.preventDefault();
    e.stopPropagation();
    analyzerHoloEnabled = !analyzerHoloEnabled;
    applyAnalyzerDisplayToggles();
    const btn = e.target.closest('[data-toggle-analyzer-holo]');
    if (btn) {
      btn.setAttribute('aria-pressed', analyzerHoloEnabled ? 'true' : 'false');
      btn.textContent = analyzerHoloEnabled ? 'Holo On' : 'Holo Off';
    }
    return;
  }
  const favoriteToggle = e.target.closest('[data-toggle-favorite]');
  if (favoriteToggle) {
    e.preventDefault();
    e.stopPropagation();
    toggleFavorite(favoriteToggle.dataset.toggleFavorite);
    return;
  }
  const openFavorite = e.target.closest('[data-open-favorite]');
  if (openFavorite) {
    e.preventDefault();
    const cardId = openFavorite.dataset.openFavorite;
    selected = cards.find(card => card.id === cardId) || selected;
    selectedIndex = Math.max(0, cards.findIndex(card => card.id === cardId));
    openFullView('favorites');
    return;
  }
  const openCollectionCard = e.target.closest('[data-open-collection-card]');
  if (openCollectionCard && pageName === 'collection') {
    e.preventDefault();
    const cardId = openCollectionCard.dataset.openCollectionCard;
    selected = cards.find(card => card.id === cardId) || selected;
    const tab = document.querySelector('[data-collection-tab].active')?.dataset.collectionTab || 'all';
    const mode = tab === 'favorites' ? 'favorites' : tab === 'duplicates' ? 'duplicates' : 'collection';
    openFullView(mode);
    return;
  }
  const pack = e.target.closest('[data-pack-series]');
  if (pack) {
    const select = $('[data-series]'); if (select) select.value = pack.dataset.packSeries;
    page = 1;
    startPackOpen(pack.dataset.packSeries);
    return;
  }
  if (e.target.closest('#backToSeries')) {
    $('#globalSearch') && ($('#globalSearch').value = '');
    $('[data-series]') && ($('[data-series]').value = 'All Series');
    $('[data-rarity]') && ($('[data-rarity]').value = 'All Rarities');
    $('#sortSelect') && ($('#sortSelect').value = 'numberAsc');
    const allCards = $('[name="viewFilter"][value="all"]');
    if (allCards) allCards.checked = true;
    page = 1;
    renderAll();
    updateRaritySelectClass();
    return;
  }
  const tile = e.target.closest('.card-tile');
  if (tile) { selected = cards.find(c => c.id === tile.dataset.id) || selected; selectedIndex = cards.findIndex(c => c.id === tile.dataset.id); previewFlipped = false; renderDetail(); playSfx('sparkle'); }
});
function applyCardFilterChange() {
  page = 1;
  albumBinderPage = 1;
  window.StarlightAlbumBinder?.writePage?.(1);
  flashGalleryFilterTransition();
  renderAll();
  updateRaritySelectClass();
  window.dispatchEvent(new CustomEvent('starlight-card-filters-changed'));
}
document.addEventListener('input', e => { if (e.target.matches('#globalSearch, [data-series], [data-rarity], [name="viewFilter"], #sortSelect, [data-filter-favorites]')) applyCardFilterChange(); });
document.addEventListener('change', e => {
  if (e.target.matches('#globalSearch, [data-series], [data-rarity], [name="viewFilter"], #sortSelect, [data-filter-favorites]')) applyCardFilterChange();
});
window.addEventListener('starlight-collection-tab-changed', () => {
  if (pageName === 'collection') renderAll();
});
document.addEventListener('click', e => {
  const albumSpreadBtn = e.target.closest('[data-album-spread]');
  if (albumSpreadBtn && pageName === 'collection') {
    e.preventDefault();
    if (!albumSpreadBtn.disabled) turnAlbumBinderSpread(albumSpreadBtn.dataset.albumSpread);
    return;
  }
  const reset = e.target.closest('[data-reset-card-filters]');
  if (!reset) return;
  $('#globalSearch') && ($('#globalSearch').value = '');
  $('[data-series]') && ($('[data-series]').value = 'All Series');
  $('[data-rarity]') && ($('[data-rarity]').value = 'All Rarities');
  $('#sortSelect') && ($('#sortSelect').value = 'numberAsc');
  const allCards = $('[name="viewFilter"][value="all"]');
  if (allCards) allCards.checked = true;
  const favoritesOnly = $('[data-filter-favorites]');
  if (favoritesOnly) favoritesOnly.checked = false;
  applyCardFilterChange();
});
document.addEventListener('keydown', e => {
  if ($('#cardOverlay')?.classList.contains('open')) {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      stepFullView(-1);
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      stepFullView(1);
    }
    return;
  }
  if (pageName === 'collection') {
    const activeTab = document.querySelector('[data-collection-tab].active')?.dataset.collectionTab || 'all';
    if (activeTab === 'all' && !window.StarlightAlbumBinder?.isAnimating?.()) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        turnAlbumBinderSpread('prev');
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        turnAlbumBinderSpread('next');
        return;
      }
    }
  }
  if ((e.key === 'Enter' || e.key === ' ') && pageName === 'collection') {
    const cardEl = e.target.closest?.('[data-open-collection-card]');
    if (!cardEl || e.target.closest('[data-toggle-favorite]')) return;
    e.preventDefault();
    cardEl.click();
  }
});
document.addEventListener('DOMContentLoaded', () => {
  albumBinderPage = window.StarlightAlbumBinder?.readPage?.() || 1;
  renderFilterControls();
  initCardInteractionDelegation();
  if (pageName === 'binder') {
    ensureWebsiteBinderLanding().then(() => {
      refreshBinderFiltersForDisplay();
      applyBinderDisplayLayout();
      applySeriesQueryFromUrl();
  applyCardSetQueryFromUrl();
      renderSeriesHero();
      renderBinder();
    });
  }
  loadCards();

  $('#prevPage')?.addEventListener('click', () => { page = Math.max(1, page - 1); renderAll(); playSfx('page'); });
  $('#nextPage')?.addEventListener('click', () => { page += 1; renderAll(); playSfx('page'); });
  $('#sfxToggle')?.addEventListener('click', () => { sfxOn = !sfxOn; localStorage.setItem(SFX_KEY, sfxOn ? 'on' : 'off'); renderAll(); });
  window.addEventListener('starlight-sfx-changed', (event) => {
    if (typeof event.detail?.sfxOn !== 'boolean') return;
    sfxOn = event.detail.sfxOn;
    $('#sfxToggle')?.classList.toggle('on', sfxOn);
    document.body.classList.toggle('sfx-on', sfxOn);
  });
  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin) return;
    if (event.data?.type === 'starlight-sfx' && typeof event.data.sfxOn === 'boolean') {
      sfxOn = event.data.sfxOn;
      localStorage.setItem(SFX_KEY, sfxOn ? 'on' : 'off');
      $('#sfxToggle')?.classList.toggle('on', sfxOn);
      document.body.classList.toggle('sfx-on', sfxOn);
    }
  });
  $('#exportData')?.addEventListener('click', exportCollectionData);
  $('#importData')?.addEventListener('click', () => $('#importFile')?.click());
  $('#importFile')?.addEventListener('change', e => { importCollectionData(e.target.files?.[0]); e.target.value = ''; });
});


/* ===== V79.3 regression fix: shared preview/full flip helper ===== */
function flipAnalyzerCard(cardEl, frontAlt) {
  if (!cardEl || cardEl.classList.contains('flip-turning')) return;
  const willShowBack = !cardEl.classList.contains('show-back');
  const duration = 920;

  cardEl.classList.remove('flip-turning', 'flip-to-back', 'flip-to-front');
  void cardEl.offsetWidth;
  cardEl.classList.add('flip-turning', willShowBack ? 'flip-to-back' : 'flip-to-front');
  cardEl.setAttribute('aria-label', willShowBack ? 'Card back' : (frontAlt || 'Card front'));

  window.setTimeout(() => {
    cardEl.classList.toggle('show-back', willShowBack);
    cardEl.classList.toggle('showing-card-back', willShowBack);
    cardEl.classList.remove('flip-turning', 'flip-to-back', 'flip-to-front');
  }, duration);
}

function flipCardImage(cardEl, frontUrl, frontAlt, showBack) {
  if (!cardEl) return;

  if (cardEl.classList.contains('analyzer-card-shell')) {
    flipAnalyzerCard(cardEl, frontAlt);
    return;
  }

  const swapMs = 280;
  const cleanupMs = 640;

  // Preview panels: one visible image surface with a quick spin swap.
  const frontImg = cardEl.querySelector('.face.front img');
  const frontFace = cardEl.querySelector('.face.front');
  cardEl.classList.remove('flip-turning', 'flipped', 'show-back', 'showing-card-back');
  void cardEl.offsetWidth;
  cardEl.classList.add('flip-turning');
  cardEl.setAttribute('aria-label', showBack ? 'Card back' : (frontAlt || 'Card front'));

  window.setTimeout(() => {
    if (frontImg) {
      frontImg.src = showBack ? CARD_BACK_URL : frontUrl;
      frontImg.alt = showBack ? 'Card back' : (frontAlt || 'Card front');
      frontImg.classList.remove('obscured', 'is-unowned-dull');
      if (!showBack && selected && !isCollected(selected.id)) {
        const artClass = unownedArtClass(selected);
        if (artClass) frontImg.classList.add(artClass);
      }
    }
    cardEl.classList.toggle('show-back', !!showBack);
    cardEl.classList.toggle('showing-card-back', !!showBack);
    const finishClass = !showBack ? (cardEl.dataset.finishClass || '') : '';
    frontFace?.classList.remove('card-finish-holographic', 'card-finish-sparkle-foil', 'card-finish-gold');
    if (finishClass) frontFace?.classList.add(finishClass);
    window.StarlightUI?.ensureFinishEffectLayer?.(frontFace, finishClass);
  }, swapMs);

  window.setTimeout(() => cardEl.classList.remove('flip-turning'), cleanupMs);
}

function attachFullViewTilt() {
  const card = $('#fullCard3d');
  if (!card) return;
  const perspective = card.querySelector('[data-perspective-card]');
  if (perspective) {
    window.StarlightPerspectiveCard?.attachPerspectiveCard?.(perspective, {
      maxTilt: 12,
      shouldIgnore: event => Boolean(event.target?.closest?.('button, a, .overlay-flip'))
    });
    return;
  }
  const frontFace = card.querySelector('.face.front');
  window.StarlightUI?.attachCardDragTilt?.(card, {
    max: 18,
    getFoil: () => (
      analyzerHoloEnabled && frontFace?.classList.contains('card-finish-holographic')
        ? frontFace
        : null
    ),
    shouldIgnore: event => Boolean(event.target?.closest?.('button, a, .overlay-flip'))
  });
}


/* ===== V61: Booster splash + magical grid binder replacement ===== */
function renderBinder() {
  const browse = applyFilters();
  syncBinderSeriesMode(browse);
  ensureBinderFilterPanel();
  renderSeriesHero();
  const grid = $('#seriesGridStage');
  if (grid) {
    grid.innerHTML = renderGalleryGridHtml(browse);
    scanPerspectiveCardsIn(grid);
  }
  attachGalleryHoverSfx();
}

function attachGalleryHoverSfx() {
  $$('.card-gallery-btn, .v61-card-btn').forEach(el => {
    if (el.dataset.galleryHoverReady === '1') return;
    el.dataset.galleryHoverReady = '1';
    el.addEventListener('mouseenter', () => playSfx('hover', el.dataset.v61Card || 'gallery'));
  });
}
function renderV61PackSlide(group, i) {
  const list = group.cards;
  const got = list.filter(c => isCollected(c.id)).length;
  const label = group.seriesName || group.series;
  const seriesIdLabel = group.seriesId ? `Series ${String(group.seriesId).padStart(2, "0")}` : 'Series Booster';
  const collectedTemplate = (websiteBinderLanding || websiteSection('binderLanding')).packCollectedLabel || '{owned} / {total} Collected';
  const collectedLabel = fillWebsiteTokens(collectedTemplate, { owned: got, total: list.length });
  const openLabel = `Open ${label}`;
  return `<article class="binder-series-slide" data-slide-index="${i}" role="group" aria-roledescription="slide" aria-label="${esc(openLabel)}" aria-hidden="true">
    <div class="binder-series-slide-shell">
      <button class="v61-pack v78-pack binder-series-pack" style="--i:${i}" type="button" data-v61-pack="${esc(group.series)}" aria-label="${esc(openLabel)}">
        <img src="${esc(group.boosterImageUrl || BOOSTER_PACK_URL)}" alt="${esc(label)} booster pack" loading="eager" onerror="this.src='${BOOSTER_PACK_URL}'">
        <span class="v61-pack-label"><small class="v79-pack-title-line">${esc(seriesIdLabel)} — ${esc(label)}</small><small>${esc(collectedLabel)}</small></span>
      </button>
    </div>
  </article>`;
}
function renderV61SeriesLandingHtml() {
  const groups = getSeriesGroups();
  const copy = websiteBinderLanding || websiteSection('binderLanding');
  const splashTitle = Object.prototype.hasOwnProperty.call(copy, 'splashTitle')
    ? copy.splashTitle
    : 'Choose A Series Booster Pack Below And Start Collecting!';
  const splashHeading = hasWebsiteCopy(splashTitle)
    ? `<div class="v61-splash-title"><h2>${esc(splashTitle)}</h2></div>`
    : '';
  return `<div class="v61-splash-inner v78-splash-inner">
    ${splashHeading}
    <div
      class="binder-series-carousel"
      id="binderSeriesCarousel"
      role="region"
      aria-roledescription="carousel"
      aria-label="Choose a series booster pack"
      tabindex="0"
    >
      <div class="binder-series-viewport">
        <div class="binder-series-stage" aria-live="polite">${groups.map(renderV61PackSlide).join('')}</div>
        <div class="binder-series-floor" aria-hidden="true"></div>
      </div>
      <div class="binder-series-controls">
        <button type="button" class="binder-series-nav binder-series-prev" aria-label="Previous series booster pack">‹</button>
        <div class="binder-series-dots" role="tablist" aria-label="Series booster packs"></div>
        <button type="button" class="binder-series-nav binder-series-next" aria-label="Next series booster pack">›</button>
      </div>
    </div>
  </div>`;
}
function initBinderSeriesCarouselLanding() {
  const root = document.getElementById('binderSeriesCarousel');
  if (root) window.StarlightBinderSeriesCarousel?.init(root);
}
function renderGalleryCard(card, i) { return renderSharedGalleryCard(card, i); }

function renderGalleryCardLegacy(card, i) {
  const got = isCollected(card.id);
  const img = got ? card.imageUrl : CARD_BACK_URL;
  const numberLabel = window.StarlightCardFilters?.cardDisplayNumber?.(card) || String(card.collectorNumber || card.number || '');
  const qty = getCardQuantity(card.id);
  const stateClass = got ? 'is-owned' : 'is-unowned';
  return `<article class="card-gallery-item ${rarityClass(card)} ${stateClass}" style="--i:${i}">
    <button class="card-gallery-btn" type="button" data-v61-card="${esc(card.id)}" aria-label="${esc(galleryCardAriaLabel(card))}">
      <span class="card-gallery-art">${perspectiveArt(card, { imageUrl: img, alt: getVisibleName(card), visible: perspectiveArtVisible(card, got) })}</span>
      <span class="card-gallery-number">${esc(numberLabel)}</span>
    </button>
    <span class="card-gallery-status">${esc(got
      ? fillWebsiteTokens((websiteBinderLanding || websiteSection('binderLanding')).ownedLabel || 'Owned ×{qty}', { qty })
      : ((websiteBinderLanding || websiteSection('binderLanding')).notCollectedLabel || 'Not Collected'))}${got ? ` · ${esc(card.rarity || '')}` : ''}</span>
  </article>`;
}

function updateSetProgressMeter(browse = {}) {
  const filters = activeFilters();
  const series = filters.series || 'All Series';
  const showMeter = series !== 'All Series'
    && !String(filters.q || '').trim()
    && filters.view === 'all'
    && !filters.favoritesOnly;
  const owned = Math.max(0, Number(browse.owned) || 0);
  const total = Math.max(0, Number(browse.poolSize) || 0);
  const percent = total > 0 ? Math.round((owned / total) * 100) : 0;
  $$('[data-set-progress]').forEach(wrap => {
    wrap.hidden = !showMeter || total <= 0;
    if (wrap.hidden) return;
    const bar = wrap.querySelector('[data-set-progress-bar]');
    const label = wrap.querySelector('[data-set-progress-label]');
    if (bar) {
      bar.style.width = `${percent}%`;
      bar.setAttribute('aria-valuenow', String(percent));
      bar.setAttribute('aria-valuetext', `${owned} of ${total} collected in ${series}`);
      bar.setAttribute('aria-label', `${series} set progress`);
    }
    if (label) {
      const explain = window.StarlightCardFilters?.formatSetProgressExplanation?.({
        series,
        owned,
        total
      });
      label.textContent = explain || `${owned} of ${total} collected in ${series}`;
    }
  });
}

function renderGalleryGridHtml(browse = resolveBinderBrowse()) {
  const list = browse.list || [];
  const poolSize = browse.poolSize || list.length;
  $$('[data-filter-summary]').forEach(element => {
    element.textContent = browse.summary || `Showing ${list.length} of ${poolSize} cards`;
  });
  updateSetProgressMeter(browse);
  const copy = websiteBinderLanding || websiteSection('binderLanding');
  const emptyTitle = copy.emptyFiltersTitle || 'No cards match these filters';
  const emptyLead = copy.emptyFiltersLead || 'Reset one or more filters to browse again.';
  const emptyCta = copy.emptyFiltersCta || copy.filtersResetCta || 'Reset Filters';
  if (!list.length) {
    return `<div class="empty-state"><h2>${esc(emptyTitle)}</h2><p>${esc(emptyLead)}</p><button class="btn primary" type="button" data-reset-card-filters>${esc(emptyCta)}</button></div>`;
  }
  return `<div class="card-gallery-grid">${list.map((card, i) => renderGalleryCard(card, i)).join('')}</div>`;
}

function renderV61CardGridHtml(browse = resolveBinderBrowse()) {
  return renderGalleryGridHtml(browse);
}

function renderV61Card(card, i) {
  return renderGalleryCard(card, i);
}

function applyPreviewSideToggles(cardEl, card, got) {
  if (!cardEl || !card) return;
  cardEl.classList.toggle('is-holo-off', !previewHoloEnabled);
  const frontFace = cardEl.querySelector('.face.front');
  const showFinish = got && previewHoloEnabled && !previewFlipped;
  const finishClass = showFinish ? cardFinishClass(card, true) : '';
  frontFace?.classList.remove('card-finish-holographic', 'card-finish-sparkle-foil', 'card-finish-gold');
  if (finishClass) frontFace?.classList.add(finishClass);
  window.StarlightUI?.ensureFinishEffectLayer?.(frontFace, finishClass);
  cardEl.dataset.holographic = showFinish && isHolographicCard(card) ? 'true' : 'false';
  cardEl.dataset.finishClass = finishClass;
}

function renderV62Showcase(inSeriesSelect = false, browse = resolveBinderBrowse()) {
  applyBinderDisplayLayout();
  const panel = $('#v62Showcase');
  if (!panel) return;
  if (!isBinderSidePanelOn()) {
    const list = browse.list || [];
    filtered = list.slice();
    if (!list.length) {
      selected = null;
      return;
    }
    if (!selected || !list.some(c => c.id === selected.id)) {
      selected = list[0] || null;
      selectedIndex = selected ? cards.findIndex(c => c.id === selected.id) : 0;
      previewFlipped = false;
    }
    return;
  }
  if (inSeriesSelect) { panel.innerHTML = ''; return; }
  const list = browse.list || [];
  filtered = list.slice();
  const copy = websiteBinderLanding || websiteSection('binderLanding');
  if (!list.length) {
    selected = null;
    panel.innerHTML = `<div class="v62-empty-showcase"><p class="eyebrow">${esc(copy.showcaseEmptyEyebrow || 'Selected Card')}</p><h2>${esc(copy.showcaseEmptyTitle || 'No matching card')}</h2><p>${esc(copy.showcaseEmptyLead || 'Adjust or reset the Binder filters to choose a card.')}</p><button class="btn primary" type="button" data-reset-card-filters>${esc(copy.showcaseEmptyCta || copy.filtersResetCta || 'Reset Filters')}</button></div>`;
    return;
  }
  if (!selected || !list.some(c => c.id === selected.id)) {
    selected = list[0] || null;
    selectedIndex = selected ? cards.findIndex(c => c.id === selected.id) : 0;
    previewFlipped = false;
  }
  const card = selected;
  if (!card) {
    panel.innerHTML = `<div class="v62-empty-showcase"><h2>${esc(copy.showcasePickTitle || 'Pick a Card ✨')}</h2><p>${esc(copy.showcasePickLead || 'Select a Starlight card to preview it here.')}</p></div>`;
    return;
  }
  const side = websiteSection('binderSidePanel');
  const got = isCollected(card.id);
  const artClass = unownedArtClass(card, { flipped: previewFlipped });
  const visibleImage = getVisibleImage(card);
  const visibleName = getVisibleName(card);
  const visibleRarity = getVisibleRarity(card);
  const qty = getCardQuantity(card.id);
  const ownedQtyText = fillWebsiteTokens(side.ownedQtyLabel || 'Owned ×{qty}', { qty });
  const finishClass = got && previewHoloEnabled && !previewFlipped ? cardFinishClass(card, true) : '';
  const premiumPerspective = window.StarlightPerspectiveCard?.hasPremiumPerspective?.(card);
  const previewHoloMarkup = previewFlipped || !previewHoloEnabled || premiumPerspective ? '' : holoSparkMarkup(card, got);
  const previewFrontArt = perspectiveArt(card, {
    imageUrl: previewFlipped ? CARD_BACK_URL : visibleImage,
    alt: previewFlipped ? 'Card back' : visibleName,
    imgClass: artClass,
    visible: perspectiveArtVisible(card, got && !previewFlipped)
  });
  panel.innerHTML = `<div class="v62-panel-inner ${rarityClass(card)} ${got ? 'is-collected' : 'is-hidden'}">
    <div class="v62-panel-actions">
      <button class="btn primary" id="v62Flip" type="button">${esc(side.flipCta || '↻ Flip')}</button>
      <button class="btn" id="v62Full" type="button">${esc(side.fullViewCta || '⛶ Full View')}</button>
    </div>
    ${previewDisplayTogglesHtml(card, got)}
    <button class="v62-preview-card flip-card simple-flip ${previewFlipped ? 'show-back showing-card-back' : ''} ${previewHoloEnabled ? '' : 'is-holo-off'}" id="v62PreviewCard" type="button" aria-label="Open full view for ${esc(visibleName)}" data-finish-class="${esc(finishClass)}" data-holographic="${got && previewHoloEnabled && isHolographicCard(card)}">
      <span class="preview-inner">
        <span class="face front ${finishClass}">${previewFrontArt}${previewHoloMarkup}</span>
        <span class="face back"><img src="${CARD_BACK_URL}" alt="Starlight card back"></span>
      </span>
    </button>
    <div class="v62-card-info">
      <h2>${esc(visibleName)}</h2>
      <span class="pill rarity-pill ${rarityClass(card)}">${esc(visibleRarity)}</span>
      <div class="v62-info-list">
        <p><b>${esc(side.seriesLabel || 'Series')}</b><span>${esc(card.series)}</span></p>
        <p><b>${esc(side.collectorNumberLabel || 'Collector Number')}</b><span>${esc(card.collectorNumber || card.number)}</span></p>
        <p><b>${esc(side.artistLabel || 'Artist')}</b><span>${esc(card.artist)}</span></p>
        <p><b>${esc(side.ownedLabel || 'Owned')}</b><span>×${qty}</span></p>
      </div>
      <p class="v62-description"><b>${esc(side.descriptionLabel || 'Description')}</b><br>${esc(getVisibleDescription(card))}</p>
    </div>
    <div class="v62-panel-buttons">
      <span class="ownership-status ${got ? 'owned' : 'locked'}">${got ? esc(ownedQtyText) : esc(side.notCollectedLabel || 'Not Collected')}</span>
      ${got ? `<button class="btn primary" id="v62Favorite" type="button" data-toggle-favorite="${esc(card.id)}" aria-pressed="${isFavorite(card.id) ? 'true' : 'false'}">${esc(isFavorite(card.id) ? (side.favoritedCta || '★ Favorited') : (side.favoriteCta || '♡ Favorite'))}</button>` : ''}
    </div>
  </div>`;
  applyPreviewSideToggles($('#v62PreviewCard'), card, got);
  scanPerspectiveCardsIn(panel);
  $('#v62Flip')?.addEventListener('click', (e) => { e.stopPropagation(); previewFlipped = !previewFlipped; flipCardImage($('#v62PreviewCard'), getVisibleImage(card), getVisibleName(card), previewFlipped); applyPreviewSideToggles($('#v62PreviewCard'), card, got); playSfx('flip'); });
  $('#v62Full')?.addEventListener('click', (e) => { e.stopPropagation(); playSfx('analyze'); openFullView('filtered'); });
  $('#v62PreviewCard')?.addEventListener('click', (e) => { if (e.target.closest('#v62Flip, [data-toggle-preview-holo], [data-toggle-favorite]')) return; playSfx('analyze'); openFullView('filtered'); });
  panel.querySelector('[data-toggle-preview-holo]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    previewHoloEnabled = !previewHoloEnabled;
    renderV62Showcase(false, browse);
  });
}

function attachV61HoverSfx() {
  $$('.v61-card-btn, .v61-pack').forEach(el => {
    if (el.dataset.v61HoverReady === '1') return;
    el.dataset.v61HoverReady = '1';
    el.addEventListener('mouseenter', () => playSfx('hover', el.dataset.v61Card || el.dataset.v61Pack || 'pack'));
  });
}

function attachAlbumBinderHoverSfx(root = document) {
  root.querySelectorAll?.('.card-album-btn, .album-binder-btn, .album-binder-3d-card')?.forEach(el => {
    if (el.dataset.albumHoverReady === '1') return;
    el.dataset.albumHoverReady = '1';
    el.addEventListener('mouseenter', () => playSfx('hover', el.dataset.albumCard || 'album'));
  });
}


document.addEventListener('click', e => {
  const pack = e.target.closest('[data-v61-pack]');
  if (pack) {
    e.preventDefault(); e.stopPropagation();
    const select = $('[data-series]'); if (select) select.value = pack.dataset.v61Pack;
    page = 1;
    const nextSeriesCards = cards.filter(c => c.series === pack.dataset.v61Pack);
    selected = nextSeriesCards[0] || null;
    selectedIndex = selected ? cards.findIndex(c => c.id === selected.id) : 0;
    previewFlipped = false;
    playSfx('charge');
    renderAll();
    return;
  }
  const cardBtn = e.target.closest('[data-v61-card], .card-gallery-btn');
  if (cardBtn?.dataset?.v61Card) {
    e.preventDefault(); e.stopPropagation();
    selected = cards.find(c => c.id === cardBtn.dataset.v61Card) || selected;
    selectedIndex = cards.findIndex(c => c.id === cardBtn.dataset.v61Card);
    previewFlipped = false;
    openPngLightbox('filtered');
    return;
  }
  const customizeBtn = e.target.closest('[data-binder-customize]');
  if (customizeBtn && pageName === 'collection') {
    e.preventDefault();
    e.stopPropagation();
    const level = Number($('[data-collector-level]')?.textContent) || 1;
    window.StarlightBinderCustomize?.openModal?.({ collectorLevel: level });
    return;
  }
}, true);
