const DEFAULT_BACK = 'site_assets/StarlightCard_Back_NewLogo.png';
const ALLOWED_RARITIES = new Set(['common', 'uncommon', 'rare', 'epic', 'legendary']);
const MAX_PILE_LAYERS = 8;
const SFX_SETTING_KEY = 'sora-starlight-card-binder-v7-sfx';

const REVEAL_SFX = Object.freeze({
  pack: new URL('../site_assets/sfx/booster-open.wav', import.meta.url).href,
  common: new URL('../site_assets/sfx/Reveal_01_Common.wav', import.meta.url).href,
  uncommon: new URL('../site_assets/sfx/Reveal_02_Uncommon.wav', import.meta.url).href,
  rare: new URL('../site_assets/sfx/Reveal_03_Rare.wav', import.meta.url).href,
  epic: new URL('../site_assets/sfx/Reveal_04_Epic.wav', import.meta.url).href,
  legendary: new URL('../site_assets/sfx/Reveal_05_Legendary.wav', import.meta.url).href,
  results: new URL('../site_assets/sfx/Reveal_Results_01.wav', import.meta.url).href,
  return: new URL('../site_assets/sfx/page-turn.wav', import.meta.url).href
});

const prettyMeta = value => String(value || '')
  .trim()
  .replace(/[_-]+/g, ' ')
  .replace(/\b\w/g, character => character.toUpperCase());

const fillRevealTokens = (template, vars = {}) => String(template || '').replace(/\{(\w+)\}/g, (_, key) => (
  vars[key] == null ? '' : String(vars[key])
));

async function resolveRevealCopy() {
  let content = typeof window !== 'undefined' ? window.__starlightWebsiteContent : null;
  if (!content?.reveal) {
    try {
      const mod = await import('./website-content-hydrate.js');
      content = mod.getCachedWebsiteContent?.() || content;
    } catch {
      // Website content is optional for reveal; hard-coded fallbacks remain.
    }
  }
  return content?.reveal || {};
}

const categoryOf = card => prettyMeta(
  card?.categoryName || card?.category_name || card?.categoryId || card?.category_id || ''
);

const subcategoryOf = card => prettyMeta(
  card?.subcategoryName || card?.subcategory_name || card?.subcategoryId || card?.subcategory_id || ''
);

function rarityKey(value) {
  const key = String(value || 'common').trim().toLowerCase();
  return ALLOWED_RARITIES.has(key) ? key : 'common';
}

function frontUrl(card) {
  return card?.imageUrl
    || card?.image_url
    || card?.thumbnailUrl
    || card?.thumbnail_url
    || DEFAULT_BACK;
}

export function normalizeRevealCard(card = {}) {
  const id = card.id ?? card.cardId ?? card.card_id ?? '';
  const catalog = lookupCatalogFinish(id);
  const quantity = Math.max(
    0,
    Math.floor(Number(
      card.quantity
      ?? card.ownedQuantity
      ?? card.owned_quantity
      ?? card.totalQuantity
      ?? card.total_quantity
      ?? 0
    ) || 0)
  );
  return {
    ...card,
    id,
    name: card.name ?? card.cardName ?? card.card_name ?? 'Mystery Card',
    rarity: rarityKey(card.rarity ?? card.rarityName ?? card.rarity_name),
    imageUrl: frontUrl(card),
    categoryName: categoryOf(card),
    subcategoryName: subcategoryOf(card),
    finishId: card.finishId ?? card.finish_id ?? card.finish?.id ?? catalog.finishId ?? '',
    finishName: card.finishName ?? card.finish_name ?? card.finish?.name ?? catalog.finishName ?? '',
    effectStyle: card.effectStyle ?? catalog.effectStyle ?? '',
    effectIntensity: card.effectIntensity ?? catalog.effectIntensity,
    isDuplicate: Boolean(card.isDuplicate ?? card.is_duplicate ?? card.duplicate),
    quantity
  };
}

function lookupCatalogFinish(cardId) {
  if (!cardId) return {};
  try {
    const raw = localStorage.getItem('sora-starlight-card-binder-v86-supabase-card-catalog');
    if (!raw) return {};
    const cards = JSON.parse(raw)?.cards;
    if (!Array.isArray(cards)) return {};
    const match = cards.find(card => String(card?.id) === String(cardId));
    if (!match) return {};
    return {
      finishId: match.finishId || match.finish_id || '',
      finishName: match.finishName || match.finish_name || '',
      effectStyle: match.effectStyle || match.effect_style || '',
      effectIntensity: match.effectIntensity ?? match.effect_intensity
    };
  } catch (_) {
    return {};
  }
}

function cardFinishClass(card) {
  return window.StarlightUI?.cardFinishClass?.(card) || '';
}

function finishEffectBadge(card, doc) {
  const label = window.StarlightUI?.finishEffectLabel?.(card) || '';
  const badgeClass = window.StarlightUI?.finishEffectBadgeClass?.(card) || '';
  if (!label || !badgeClass) return null;
  return createElement(doc, 'span', `st-r3-badge ${badgeClass}`, label);
}

function attachHoloSpark(element, card) {
  if (window.StarlightPerspectiveCard?.hasPremiumPerspective?.(card)) return;
  const finish = cardFinishClass(card);
  window.StarlightUI?.ensureFinishEffectLayer?.(element, finish);
  if (!finish) return;
  // 3D drag only on the main reveal card — result thumbs keep foil only.
  const actor = element.closest?.('.st-r3-card-actor');
  if (!actor) return;
  window.StarlightUI?.attachCardDragTilt?.(actor, {
    foil: element,
    max: 14,
    shouldIgnore: () => {
      const scene = actor.closest('.st-r3-reveal-scene');
      return Boolean(scene && !scene.classList.contains('is-revealed'));
    }
  });
}

export function normalizeRevealOptions(options = {}) {
  const presentationMode = String(
    options.presentationMode || options.presentation_mode || options.mode || 'claim'
  )
    .trim()
    .toLowerCase();
  return {
    title: options.title || options.boosterName || options.booster_name || '',
    packImageUrl: options.packImageUrl || options.pack_image_url || '',
    cardBackUrl: options.cardBackUrl || options.card_back_url || DEFAULT_BACK,
    autoOpen: Boolean(options.autoOpen ?? options.auto_open),
    presentationMode: presentationMode === 'replay' ? 'replay' : 'claim'
  };
}

export function createRevealStackLayout(cardCount) {
  const count = Math.max(0, Math.floor(Number(cardCount) || 0));
  return Array.from({ length: count }, (_, index) => {
    const depth = Math.min(index, MAX_PILE_LAYERS - 1);
    return {
      depth,
      x: depth === 0 ? 0 : depth * -3,
      y: depth * 4,
      rotation: depth === 0 ? 0 : (depth % 2 ? -.45 : .45),
      zIndex: count - index
    };
  });
}

export function summarizeRevealCards(cards = []) {
  const normalized = cards.filter(Boolean).map(normalizeRevealCard);
  const duplicates = normalized.filter(card => card.isDuplicate).length;
  return {
    total: normalized.length,
    newCards: normalized.length - duplicates,
    duplicates
  };
}

export function revealSfxForRarity(rarity) {
  return rarityKey(rarity);
}

function getHost() {
  try {
    if (window.top && window.top !== window && window.top.location.origin === window.location.origin) {
      return { win: window.top, doc: window.top.document };
    }
  } catch (_) {
    // Cross-origin parents cannot host the reveal, so use the current document.
  }
  return { win: window, doc: document };
}

const revealViewportLocks = new WeakMap();

function acquireRevealViewportLock(doc) {
  const existing = revealViewportLocks.get(doc);
  if (existing) {
    existing.count += 1;
    return () => {
      existing.count -= 1;
      if (existing.count === 0) existing.restore();
    };
  }

  const root = doc.documentElement;
  const body = doc.body;
  const properties = ['overflow', 'overflow-x', 'overflow-y', 'overscroll-behavior', 'width', 'max-width', 'min-width', 'scrollbar-width'];
  const snapshots = [root, body].map(element => ({
    element,
    values: properties.map(property => ({
      property,
      value: element.style.getPropertyValue(property),
      priority: element.style.getPropertyPriority(property)
    }))
  }));
  const hadClass = root.classList.contains('st-r3-reveal-open');
  const lock = { count: 1, restore: null };

  root.classList.add('st-r3-reveal-open');
  [root, body].forEach(element => {
    element.style.setProperty('overflow', 'hidden', 'important');
    element.style.setProperty('overflow-x', 'hidden', 'important');
    element.style.setProperty('overflow-y', 'hidden', 'important');
    element.style.setProperty('overscroll-behavior', 'none', 'important');
    element.style.setProperty('width', '100%', 'important');
    element.style.setProperty('max-width', '100%', 'important');
    element.style.setProperty('min-width', '0', 'important');
    element.style.setProperty('scrollbar-width', 'none', 'important');
  });

  lock.restore = () => {
    snapshots.forEach(({ element, values }) => {
      values.forEach(({ property, value, priority }) => {
        if (value) element.style.setProperty(property, value, priority);
        else element.style.removeProperty(property);
      });
    });
    if (!hadClass) root.classList.remove('st-r3-reveal-open');
    revealViewportLocks.delete(doc);
  };
  revealViewportLocks.set(doc, lock);

  return () => {
    lock.count -= 1;
    if (lock.count === 0) lock.restore();
  };
}

export const REVEAL_PRESENTATION_VERSION = '1.5.19';

const REVEAL_STYLESHEET_ID = `starlight-reveal-v${REVEAL_PRESENTATION_VERSION.replace(/\./g, '')}`;
const REVEAL_STYLESHEET_URL = new URL(
  `../css/reward-reveal.css?v=${REVEAL_PRESENTATION_VERSION}`,
  import.meta.url
).href;
const stylesheetLoads = new WeakMap();
const imagePreparations = new WeakMap();

function installStyles(doc) {
  if (stylesheetLoads.has(doc)) return stylesheetLoads.get(doc);

  const existing = doc.getElementById(REVEAL_STYLESHEET_ID);
  if (existing?.sheet) {
    return Promise.resolve();
  }

  const link = existing || doc.createElement('link');
  const load = new Promise(resolve => {
    link.addEventListener('load', resolve, { once: true });
    link.addEventListener('error', resolve, { once: true });
  });
  if (!existing) {
    link.id = REVEAL_STYLESHEET_ID;
    link.rel = 'stylesheet';
    link.href = REVEAL_STYLESHEET_URL;
    doc.head.append(link);
  }
  stylesheetLoads.set(doc, load);
  return load;
}

function createElement(doc, tagName, className, text = '') {
  const element = doc.createElement(tagName);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function createImage(
  doc,
  source,
  alt,
  fallback = DEFAULT_BACK,
  className = 'st-r3-image',
  { defer = false, loading = 'eager' } = {}
) {
  const image = createElement(doc, 'img', className);
  image.alt = alt;
  image.loading = loading;
  image.decoding = 'async';
  if (defer) image.dataset.source = source || fallback;
  else if (source || fallback) image.src = source || fallback;
  image.addEventListener('error', () => {
    if (!fallback || image.dataset.fallbackApplied === 'true') return;
    image.dataset.fallbackApplied = 'true';
    image.src = fallback;
  });
  return image;
}

function mountCardArt(doc, host, card, { imgClass = 'st-r3-card-image', alt = '', defer = false } = {}) {
  const perspective = window.StarlightPerspectiveCard;
  const markup = perspective?.cardArtMarkup?.(card, {
    imageUrl: card.imageUrl,
    alt: alt || card.name,
    imgClass,
    visible: true
  });
  if (markup?.includes?.('data-perspective-card')) {
    const template = doc.createElement('template');
    template.innerHTML = markup.trim();
    const root = template.content.firstElementChild;
    host.replaceChildren(root);
    perspective.attachPerspectiveCard?.(root, { maxTilt: 14 });
    const img = root.querySelector('img');
    if (img && defer) {
      img.dataset.source = card.imageUrl || DEFAULT_BACK;
    } else if (img && card.imageUrl) {
      img.src = card.imageUrl;
    }
    return img || root;
  }
  const image = createImage(doc, card.imageUrl, alt || card.name, DEFAULT_BACK, imgClass, { defer });
  host.replaceChildren(image);
  return image;
}

function startImageLoad(image) {
  if (!image.hasAttribute('src') && image.dataset.source) {
    image.src = image.dataset.source;
    delete image.dataset.source;
  }
}

function prepareImage(image) {
  if (imagePreparations.has(image)) return imagePreparations.get(image);
  startImageLoad(image);
  const preparation = (async () => {
    if (!image.complete) {
      await new Promise(resolve => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      });
    }
    await image.decode?.().catch(() => {});
  })();
  imagePreparations.set(image, preparation);
  return preparation;
}

function nextPaint(win) {
  return new Promise(resolve => {
    win.requestAnimationFrame(() => win.requestAnimationFrame(resolve));
  });
}

function timeToMilliseconds(value) {
  const token = String(value || '').trim();
  if (token.endsWith('ms')) return Number.parseFloat(token) || 0;
  if (token.endsWith('s')) return (Number.parseFloat(token) || 0) * 1000;
  return 0;
}

function computedMotionDuration(element, win) {
  const nodes = [element, ...element.querySelectorAll('*')];
  return nodes.reduce((longest, node) => {
    const style = win.getComputedStyle(node);
    const animationNames = style.animationName.split(',');
    const animationDurations = style.animationDuration.split(',').map(timeToMilliseconds);
    const animationDelays = style.animationDelay.split(',').map(timeToMilliseconds);
    const animationIterations = style.animationIterationCount.split(',');
    const animationLength = animationDurations.reduce((maximum, duration, index) => {
      const name = animationNames[index % animationNames.length]?.trim();
      const iterations = animationIterations[index % animationIterations.length]?.trim();
      if (!name || name === 'none' || iterations === 'infinite') return maximum;
      return Math.max(
        maximum,
        duration * (Number.parseFloat(iterations) || 1) + animationDelays[index % animationDelays.length]
      );
    }, 0);
    const transitionDurations = style.transitionDuration.split(',').map(timeToMilliseconds);
    const transitionDelays = style.transitionDelay.split(',').map(timeToMilliseconds);
    const transitionLength = transitionDurations.reduce((maximum, duration, index) => Math.max(
      maximum,
      duration + transitionDelays[index % transitionDelays.length]
    ), 0);
    return Math.max(longest, animationLength, transitionLength);
  }, 0);
}

function waitForFrames(win, duration) {
  if (duration <= 0) return Promise.resolve();
  return new Promise(resolve => {
    const start = win.performance?.now?.() ?? Date.now();
    const tick = timestamp => {
      const elapsed = (Number.isFinite(timestamp) ? timestamp : Date.now()) - start;
      if (elapsed >= duration) resolve();
      else win.requestAnimationFrame(tick);
    };
    win.requestAnimationFrame(tick);
  });
}

async function waitForMotion(element, win) {
  if (win.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  await nextPaint(win);
  const animations = element.getAnimations?.({ subtree: true }) || [];
  const finiteAnimations = animations.filter(animation => animation.effect?.getTiming?.().iterations !== Infinity);
  if (finiteAnimations.length) {
    await Promise.allSettled(finiteAnimations.map(animation => animation.finished));
    return;
  }
  await waitForFrames(win, computedMotionDuration(element, win));
}

function cardDescription(card) {
  return [prettyMeta(card.rarity), card.categoryName, card.subcategoryName]
    .filter(Boolean)
    .join(' · ');
}

function createRepeatedElements(doc, parent, count, className, propertyName) {
  for (let index = 0; index < count; index += 1) {
    const element = createElement(doc, 'i', className);
    element.style.setProperty(propertyName, String(index));
    parent.append(element);
  }
}

export function soundEffectsEnabled(win = globalThis) {
  try {
    return win.localStorage?.getItem(SFX_SETTING_KEY) !== 'off';
  } catch (_) {
    return true;
  }
}

export function setSoundEffectsEnabled(win, enabled) {
  try {
    win.localStorage?.setItem(SFX_SETTING_KEY, enabled ? 'on' : 'off');
  } catch (_) {
    // Preference persistence is best-effort.
  }
  return Boolean(enabled);
}

function syncSoundToggle(button, enabled) {
  button.classList.toggle('is-muted', !enabled);
  button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  button.setAttribute(
    'aria-label',
    enabled ? 'Mute reveal sounds' : 'Unmute reveal sounds'
  );
  button.textContent = enabled ? 'Sound' : 'Muted';
}

function playRevealSound(win, name, activeAudio) {
  const source = REVEAL_SFX[name];
  if (!source || !soundEffectsEnabled(win) || typeof win.Audio !== 'function') return;
  try {
    const audio = new win.Audio(source);
    audio.preload = 'auto';
    audio.volume = name === 'legendary' ? .55 : name === 'results' ? .5 : name === 'pack' ? .46 : .38;
    activeAudio.add(audio);
    audio.addEventListener('ended', () => activeAudio.delete(audio), { once: true });
    audio.play().catch(() => activeAudio.delete(audio));
  } catch (_) {
    // Audio is an enhancement; reveal interaction must continue if playback is unavailable.
  }
}

export async function revealRewardSequence(cards = [], options = {}) {
  const revealCopy = await resolveRevealCopy();
  const mysteryName = revealCopy.mysteryName || 'Mystery Card';
  const fallbackMeta = revealCopy.fallbackMeta || 'Starlight Card';
  const rewards = cards.filter(Boolean).map((card) => {
    const normalized = normalizeRevealCard(card);
    const hasName = Boolean(card?.name ?? card?.cardName ?? card?.card_name);
    if (!hasName) return { ...normalized, name: mysteryName };
    return normalized;
  });
  if (!rewards.length) return;

  const sourceDocument = document;
  const returnFocus = sourceDocument.activeElement instanceof sourceDocument.defaultView.HTMLElement
    ? sourceDocument.activeElement
    : null;
  const { win, doc } = getHost();
  const normalizedOptions = normalizeRevealOptions(options);
  const isReplay = normalizedOptions.presentationMode === 'replay';
  const revealTitle = normalizedOptions.title || revealCopy.defaultTitle || 'Your Booster Pack';
  const packArtwork = normalizedOptions.packImageUrl || normalizedOptions.cardBackUrl;
  const summary = summarizeRevealCards(rewards);
  const cardsReadyText = rewards.length === 1
    ? (revealCopy.cardsReadyOne || '1 card ready.')
    : fillRevealTokens(revealCopy.cardsReady || '{count} cards ready.', { count: rewards.length });
  const alreadyReceivedBadge =
    revealCopy.badgeAlreadyReceived || revealCopy.badgeReplay || 'Already received';
  const resultsSummaryText = isReplay
    ? fillRevealTokens(
      revealCopy.resultsSummaryReplay ||
        '{total} cards · already received today (not a new pack)',
      { total: summary.total }
    )
    : summary.duplicates === 1
      ? fillRevealTokens(
        revealCopy.resultsSummaryOneDup || '{total} total · {new} new · 1 duplicate',
        { total: summary.total, new: summary.newCards }
      )
      : fillRevealTokens(
        revealCopy.resultsSummary || '{total} total · {new} new · {duplicates} duplicates',
        { total: summary.total, new: summary.newCards, duplicates: summary.duplicates }
      );
  await installStyles(doc);

  return new Promise(resolve => {
    let index = 0;
    let phase = 'pack';
    let settled = false;
    let controller = null;
    let fallbackCleanup = null;
    let currentFrontImage = null;
    let resultsPopulated = false;
    const activeAudio = new Set();
    const releaseViewportLock = acquireRevealViewportLock(doc);

    const overlay = createElement(doc, 'div', 'st-r3-overlay hidden');
    const dialog = createElement(doc, 'section', 'st-r3-dialog');
    const header = createElement(doc, 'header', 'st-r3-header');
    const headerCopy = createElement(doc, 'div', 'st-r3-header-copy');
    const eyebrow = createElement(doc, 'p', 'st-r3-eyebrow', revealCopy.eyebrow || 'Starlight Booster');
    const title = createElement(doc, 'h2', 'st-r3-title', revealTitle);
    const headerActions = createElement(doc, 'div', 'st-r3-header-actions');
    const soundButton = createElement(doc, 'button', 'st-r3-sound');
    const closeButton = createElement(doc, 'button', 'st-r3-close', '×');
    let sfxEnabled = soundEffectsEnabled(win);
    syncSoundToggle(soundButton, sfxEnabled);
    const liveStatus = createElement(
      doc,
      'p',
      'st-r3-live',
      cardsReadyText
    );
    const progress = createElement(doc, 'p', 'st-r3-progress');
    const skipBar = createElement(doc, 'div', 'st-r3-skip-bar');
    const revealAllButton = createElement(
      doc,
      'button',
      'st-r3-skip-btn',
      revealCopy.revealAllCta || 'Reveal All'
    );
    const skipButton = createElement(
      doc,
      'button',
      'st-r3-skip-btn st-r3-skip-btn--ghost',
      revealCopy.skipCta || 'Skip to results'
    );
    const stage = createElement(doc, 'div', 'st-r3-stage');
    overlay.dataset.phase = 'pack';
    dialog.dataset.phase = 'pack';

    const packScene = createElement(doc, 'section', 'st-r3-scene st-r3-pack-scene');
    const packButton = createElement(doc, 'button', 'st-r3-pack-button');
    const packArt = createElement(doc, 'span', 'st-r3-pack-art');
    const packImage = createImage(doc, packArtwork, `${revealTitle} pack`, normalizedOptions.cardBackUrl, 'st-r3-pack-image');
    const packTop = createImage(doc, packArtwork, '', normalizedOptions.cardBackUrl, 'st-r3-pack-half st-r3-pack-top');
    const packBottom = createImage(doc, packArtwork, '', normalizedOptions.cardBackUrl, 'st-r3-pack-half st-r3-pack-bottom');
    const packCount = createElement(doc, 'span', 'st-r3-pack-count', `${rewards.length} ${rewards.length === 1 ? 'card' : 'cards'}`);
    const packPrompt = createElement(doc, 'span', 'st-r3-prompt', revealCopy.packPrompt || 'Tap the booster to open');
    const packEnergy = createElement(doc, 'span', 'st-r3-pack-energy');
    const packCore = createElement(doc, 'i', 'st-r3-pack-core');
    const packRing = createElement(doc, 'i', 'st-r3-pack-ring');
    const packShards = createElement(doc, 'span', 'st-r3-pack-shards');

    const pileScene = createElement(doc, 'section', 'st-r3-scene st-r3-pile-scene');
    const pileButton = createElement(doc, 'button', 'st-r3-pile-button');
    const pileStack = createElement(doc, 'span', 'st-r3-pile-stack');
    const pileCount = createElement(doc, 'span', 'st-r3-pile-count');
    const pilePrompt = createElement(doc, 'span', 'st-r3-prompt st-r3-pile-prompt');

    const revealScene = createElement(doc, 'section', 'st-r3-scene st-r3-reveal-scene');
    const energy = createElement(doc, 'span', 'st-r3-energy');
    const energyCore = createElement(doc, 'i', 'st-r3-energy-core');
    const energyRingOne = createElement(doc, 'i', 'st-r3-energy-ring st-r3-energy-ring-one');
    const energyRingTwo = createElement(doc, 'i', 'st-r3-energy-ring st-r3-energy-ring-two');
    const rays = createElement(doc, 'span', 'st-r3-rays');
    const particles = createElement(doc, 'span', 'st-r3-particles');
    const actor = createElement(doc, 'button', 'st-r3-card-actor');
    const cardInner = createElement(doc, 'span', 'st-r3-card-inner');
    const cardBack = createElement(doc, 'span', 'st-r3-card-face st-r3-card-back');
    const cardFront = createElement(doc, 'span', 'st-r3-card-face st-r3-card-front');
    const cardBackImage = createImage(doc, normalizedOptions.cardBackUrl, '', DEFAULT_BACK, 'st-r3-card-image');
    const cardDetails = createElement(doc, 'div', 'st-r3-card-details');
    const cardName = createElement(doc, 'h3', 'st-r3-card-name');
    const cardMeta = createElement(doc, 'p', 'st-r3-card-meta');
    const cardBadges = createElement(doc, 'div', 'st-r3-card-badges');
    const continuePrompt = createElement(doc, 'p', 'st-r3-continue', revealCopy.continuePrompt || 'Tap the revealed card to continue');

    const resultsScene = createElement(doc, 'section', 'st-r3-results');
    const resultsHeading = createElement(doc, 'div', 'st-r3-results-heading');
    const resultsTitle = createElement(doc, 'h3', '', revealCopy.resultsTitle || 'Your Cards');
    const resultsSummary = createElement(
      doc,
      'p',
      '',
      resultsSummaryText
    );
    const resultsGrid = createElement(doc, 'div', 'st-r3-results-grid');
    const doneButton = createElement(doc, 'button', 'st-r3-done', revealCopy.doneCta || 'Done');

    title.id = `st-r3-title-${win.crypto?.randomUUID?.() || Date.now().toString(36)}`;
    soundButton.type = 'button';
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', revealCopy.closeLabel || 'Close booster reveal');
    closeButton.setAttribute('data-st-modal-close', '');
    headerActions.append(soundButton, closeButton);
    liveStatus.setAttribute('role', 'status');
    liveStatus.setAttribute('aria-live', 'polite');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', title.id);
    dialog.tabIndex = -1;
    dialog.dataset.phase = phase;
    packScene.setAttribute('aria-label', 'Booster pack opening');
    packButton.type = 'button';
    packButton.setAttribute('aria-label', `Open ${revealTitle}`);
    packTop.alt = '';
    packBottom.alt = '';
    packEnergy.setAttribute('aria-hidden', 'true');
    createRepeatedElements(doc, packShards, 10, 'st-r3-pack-shard', '--shard-index');
    packEnergy.append(packCore, packRing, packShards);
    packArt.append(packImage, packTop, packBottom);
    packButton.append(packArt, packCount, packPrompt);
    packScene.append(packEnergy, packButton);

    pileScene.hidden = true;
    pileScene.setAttribute('aria-label', 'Booster card pile');
    pileButton.type = 'button';
    pileButton.append(pileStack, pileCount, pilePrompt);
    pileScene.append(pileButton);

    revealScene.hidden = true;
    revealScene.setAttribute('aria-label', 'Current card reveal');
    energy.setAttribute('aria-hidden', 'true');
    createRepeatedElements(doc, rays, 8, 'st-r3-ray', '--ray-index');
    createRepeatedElements(doc, particles, 12, 'st-r3-particle', '--particle-index');
    energy.append(energyCore, energyRingOne, energyRingTwo, rays, particles);
    actor.type = 'button';
    actor.disabled = true;
    cardBackImage.alt = '';
    cardBack.append(cardBackImage);
    cardInner.append(cardBack, cardFront);
    actor.append(cardInner);
    cardDetails.hidden = true;
    cardDetails.append(cardName, cardMeta, cardBadges, continuePrompt);
    revealScene.append(energy, actor, cardDetails);

    resultsScene.hidden = true;
    resultsScene.setAttribute('aria-label', 'Booster results');
    doneButton.type = 'button';
    resultsHeading.append(resultsTitle, resultsSummary);
    resultsScene.append(resultsHeading, resultsGrid, doneButton);

    progress.hidden = true;
    revealAllButton.type = 'button';
    skipButton.type = 'button';
    revealAllButton.setAttribute(
      'aria-label',
      revealCopy.revealAllLabel || 'Reveal remaining cards without individual animations'
    );
    skipButton.setAttribute(
      'aria-label',
      revealCopy.skipLabel || 'Skip to results without revealing remaining cards one by one'
    );
    skipBar.hidden = true;
    skipBar.append(revealAllButton, skipButton);
    stage.append(packScene, pileScene, revealScene, resultsScene);
    headerCopy.append(eyebrow, title);
    header.append(headerCopy, headerActions);
    dialog.append(header, liveStatus, progress, skipBar, stage);
    overlay.append(dialog);
    overlay.hidden = true;
    doc.body.append(overlay);

    const pileLayers = Array.from({ length: MAX_PILE_LAYERS }, (_, layerIndex) => {
      const layer = createElement(doc, 'span', 'st-r3-pile-layer');
      const image = createImage(doc, normalizedOptions.cardBackUrl, '', DEFAULT_BACK, 'st-r3-pile-image');
      layer.style.setProperty('--layer-index', String(layerIndex));
      image.alt = '';
      layer.append(image);
      pileStack.append(layer);
      return layer;
    });

    const stopAudio = () => {
      activeAudio.forEach(audio => {
        audio.pause();
        audio.currentTime = 0;
      });
      activeAudio.clear();
    };

    const clearOverlayClass = () => {
      const api = win.StarlightUI || window.StarlightUI;
      if (api?.clearOverlayViewportAnchor) {
        api.clearOverlayViewportAnchor(overlay);
      } else {
        overlay.classList.remove('is-embed-anchored');
        overlay.style.removeProperty('--st-embed-overlay-top');
        overlay.style.removeProperty('--st-embed-overlay-height');
        ['position', 'inset', 'top', 'left', 'right', 'bottom', 'width', 'height', 'max-height', 'max-width']
          .forEach(property => overlay.style.removeProperty(property));
      }
      overlay.classList.remove('is-open');
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      stopAudio();
      fallbackCleanup?.();
      try {
        clearOverlayClass();
        overlay.remove();
      } catch {}
      releaseViewportLock();
      // Ensure embedded shell documents are interactive again after reveal.
      try {
        doc.documentElement.classList.remove('st-r3-reveal-open');
        doc.documentElement.style.removeProperty('overflow');
        doc.documentElement.style.removeProperty('overflow-x');
        doc.documentElement.style.removeProperty('overflow-y');
        doc.body?.style.removeProperty('overflow');
        doc.body?.style.removeProperty('overflow-x');
        doc.body?.style.removeProperty('overflow-y');
      } catch {}
      if (returnFocus?.isConnected) returnFocus.focus?.({ preventScroll: true });
      try {
        win.parent?.postMessage?.({
          type: 'starlight-view-height',
          height: Math.max(
            doc.documentElement?.scrollHeight || 0,
            doc.body?.scrollHeight || 0
          )
        }, win.location.origin);
      } catch {}
      resolve();
    };

    const close = reason => {
      if (controller) controller.close(undefined, reason);
      else finish();
    };

    const setPhase = nextPhase => {
      phase = nextPhase;
      overlay.dataset.phase = nextPhase;
      dialog.dataset.phase = nextPhase;
      const canSkip =
        nextPhase === 'pile' ||
        nextPhase === 'revealed' ||
        nextPhase === 'pack';
      skipBar.hidden = !canSkip || rewards.length <= 1;
      revealAllButton.disabled = !canSkip;
      skipButton.disabled = !canSkip;
    };

    const focusControl = control => {
      control.focus({ preventScroll: true });
      overlay.scrollTop = 0;
      stage.scrollTop = 0;
    };

    const populateResults = () => {
      if (resultsPopulated) return;
      resultsPopulated = true;
      const fragment = doc.createDocumentFragment();
      rewards.forEach(card => {
        const item = createElement(doc, 'article', `st-r3-result-card rarity-${card.rarity}`);
        const art = createElement(doc, 'span', `st-r3-result-art ${cardFinishClass(card)}`.trim());
        mountCardArt(doc, art, card, {
          imgClass: 'st-r3-result-image',
          alt: `${card.name} card artwork`,
          defer: false
        });
        const copy = createElement(doc, 'div', 'st-r3-result-copy');
        const name = createElement(doc, 'h4', '', card.name);
        const detail = createElement(doc, 'p', '', cardDescription(card) || fallbackMeta);
        const badges = createElement(doc, 'div', 'st-r3-result-badges');
        const rarity = createElement(doc, 'span', `st-r3-badge rarity-${card.rarity}`, prettyMeta(card.rarity));
        const status = createElement(
          doc,
          'span',
          `st-r3-result-status ${isReplay ? 'is-replay' : card.isDuplicate ? 'is-duplicate' : 'is-new'}`,
          isReplay
            ? alreadyReceivedBadge
            : card.isDuplicate
              ? (revealCopy.badgeDuplicate || 'Duplicate')
              : (revealCopy.badgeNew || 'New')
        );
        const finish = finishEffectBadge(card, doc);
        badges.append(rarity, ...(finish ? [finish] : []), status);
        copy.append(name, detail, badges);
        attachHoloSpark(art, card);
        item.append(art, copy);
        fragment.append(item);
      });
      resultsGrid.append(fragment);
      window.StarlightPerspectiveCard?.scanPerspectiveCards?.(resultsGrid);
    };

    const prepareCurrentCard = () => {
      const card = rewards[index];
      cardFront.className = `st-r3-card-face st-r3-card-front ${cardFinishClass(card)}`.trim();
      currentFrontImage = mountCardArt(doc, cardFront, card, {
        imgClass: 'st-r3-card-image',
        defer: true
      });
      attachHoloSpark(cardFront, card);
      actor.className = `st-r3-card-actor rarity-${card.rarity}`;
      actor.setAttribute('aria-label', `Reveal ${card.name}`);
      revealScene.dataset.rarity = card.rarity;
      startImageLoad(currentFrontImage);
    };

    const showPile = ({ fromPack = false } = {}) => {
      const remaining = rewards.length - index;
      const visibleLayers = Math.min(remaining, MAX_PILE_LAYERS);
      pileLayers.forEach((layer, layerIndex) => {
        const visible = layerIndex < visibleLayers;
        const centeredIndex = layerIndex - (visibleLayers - 1) / 2;
        layer.hidden = !visible;
        layer.style.setProperty('--pile-x', `${centeredIndex * 5}px`);
        layer.style.setProperty('--pile-y', `${(visibleLayers - layerIndex - 1) * -3}px`);
        layer.style.setProperty('--pile-rotation', `${centeredIndex * 2.2}deg`);
        layer.style.setProperty('--pile-z', String(layerIndex + 1));
      });
      const remainText = remaining === 1
        ? (revealCopy.pileRemainOne || '1 card remains')
        : fillRevealTokens(revealCopy.pileRemain || '{count} cards remain', { count: remaining });
      pileCount.textContent = remainText;
      pilePrompt.textContent = remaining === 1
        ? (revealCopy.pileTapLast || 'Tap the last card')
        : (revealCopy.pileTap || 'Tap the pile to reveal a card');
      pileButton.setAttribute('aria-label', `Reveal card ${index + 1} of ${rewards.length} from the pile`);
      pileButton.disabled = false;
      progress.hidden = false;
      progress.textContent = `Card ${index + 1} of ${rewards.length}`;
      packScene.hidden = true;
      revealScene.hidden = true;
      resultsScene.hidden = true;
      pileScene.hidden = false;
      pileScene.classList.toggle('is-arriving', fromPack);
      prepareCurrentCard();
      setPhase('pile');
      liveStatus.textContent = `${remainText}.`;
      focusControl(pileButton);
      if (fromPack) {
        waitForMotion(pileScene, win).then(() => {
          if (phase === 'pile') pileScene.classList.remove('is-arriving');
        });
      }
    };

    const showResults = () => {
      populateResults();
      progress.hidden = true;
      packScene.hidden = true;
      pileScene.hidden = true;
      revealScene.hidden = true;
      resultsScene.hidden = false;
      setPhase('results');
      playRevealSound(win, 'results', activeAudio);
      liveStatus.textContent = `Reveal complete. ${resultsSummary.textContent}`;
      focusControl(doneButton);
    };

    /** Presentation-only shortcut — never awards inventory. */
    const skipToResults = async ({ openPackFirst = false } = {}) => {
      if (phase === 'results' || phase === 'pack-opening' || phase === 'revealing' || phase === 'returning') {
        return;
      }
      if (openPackFirst && phase === 'pack') {
        setPhase('pack-opening');
        packButton.disabled = true;
        playRevealSound(win, 'pack', activeAudio);
        packScene.classList.add('is-bursting');
        await waitForMotion(packScene, win);
        packScene.classList.remove('is-bursting');
      }
      index = rewards.length;
      showResults();
    };

    const openPack = async () => {
      if (phase !== 'pack') return;
      setPhase('pack-opening');
      packButton.disabled = true;
      playRevealSound(win, 'pack', activeAudio);
      liveStatus.textContent = `Opening ${revealTitle}.`;
      packScene.classList.add('is-bursting');
      await waitForMotion(packScene, win);
      packScene.classList.remove('is-bursting');
      showPile({ fromPack: true });
    };

    const revealFromPile = async () => {
      if (phase !== 'pile') return;
      const card = rewards[index];
      setPhase('revealing');
      pileButton.disabled = true;
      playRevealSound(win, revealSfxForRarity(card.rarity), activeAudio);
      liveStatus.textContent = `Revealing card ${index + 1} of ${rewards.length}.`;
      await prepareImage(currentFrontImage);
      pileScene.hidden = true;
      revealScene.hidden = false;
      cardDetails.hidden = true;
      actor.disabled = true;
      revealScene.classList.remove('is-revealed');
      revealScene.classList.add('is-revealing');
      await waitForMotion(revealScene, win);
      revealScene.classList.remove('is-revealing');
      revealScene.classList.add('is-revealed');
      actor.disabled = false;
      actor.setAttribute('aria-label', `${card.name}, ${prettyMeta(card.rarity)}. Continue to the pile.`);
      cardName.textContent = card.name;
      cardMeta.textContent = cardDescription(card) || fallbackMeta;
      const finishBadge = finishEffectBadge(card, doc);
      cardBadges.replaceChildren(
        createElement(doc, 'span', `st-r3-badge rarity-${card.rarity}`, prettyMeta(card.rarity)),
        ...(finishBadge ? [finishBadge] : []),
        createElement(
          doc,
          'span',
          `st-r3-badge ${isReplay ? 'is-replay' : card.isDuplicate ? 'is-duplicate' : 'is-new'}`,
          isReplay
            ? alreadyReceivedBadge
            : card.isDuplicate
              ? (revealCopy.badgeDuplicate || 'Duplicate')
              : (revealCopy.badgeNewCard || 'New Card')
        )
      );
      cardDetails.hidden = false;
      setPhase('revealed');
      liveStatus.textContent = isReplay
        ? `${card.name}, ${prettyMeta(card.rarity)}. Already received today.`
        : `${card.name}, ${prettyMeta(card.rarity)}. ${card.isDuplicate ? 'Duplicate card.' : 'New card.'}`;
      focusControl(actor);
    };

    const returnToPile = () => {
      if (phase !== 'revealed') return;
      setPhase('returning');
      actor.disabled = true;
      if (index + 1 < rewards.length) playRevealSound(win, 'return', activeAudio);
      revealScene.hidden = true;
      revealScene.classList.remove('is-revealed');
      index += 1;
      if (index >= rewards.length) showResults();
      else showPile();
    };

    packButton.addEventListener('click', openPack);
    pileButton.addEventListener('click', revealFromPile);
    actor.addEventListener('click', returnToPile);
    revealAllButton.addEventListener('click', () => {
      void skipToResults({ openPackFirst: phase === 'pack' });
    });
    skipButton.addEventListener('click', () => {
      void skipToResults({ openPackFirst: phase === 'pack' });
    });
    soundButton.addEventListener('click', () => {
      sfxEnabled = !sfxEnabled;
      setSoundEffectsEnabled(win, sfxEnabled);
      syncSoundToggle(soundButton, sfxEnabled);
      if (!sfxEnabled) stopAudio();
    });
    doneButton.addEventListener('click', () => close('complete'));
    resultsScene.addEventListener('click', event => {
      if (phase !== 'results' || event.button !== 0) return;
      if (event.target.closest('.st-r3-result-card, .st-r3-results-heading, .st-r3-done')) return;
      close('results-backdrop');
    });
    closeButton.addEventListener('click', () => close('button'));
    dialog.addEventListener('keydown', event => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'ArrowRight' && phase === 'revealed') {
        event.preventDefault();
        returnToPile();
      }
    });

    const modalApi = win.StarlightUI || window.StarlightUI;
    controller = modalApi?.adoptModal?.(overlay, {
      dialog,
      labelledBy: title.id,
      closeOnBackdrop: false,
      initialFocus: packButton,
      restoreFocus: false,
      onClose: finish
    }) || null;

    if (controller) {
      controller.open();
    } else {
      const previousFocus = doc.activeElement;
      const onKeydown = event => {
        if (event.key === 'Escape') close('escape');
      };
      overlay.hidden = false;
      overlay.classList.remove('hidden');
      modalApi?.anchorOverlayToVisibleViewport?.(overlay);
      doc.addEventListener('keydown', onKeydown);
      fallbackCleanup = () => {
        doc.removeEventListener('keydown', onKeydown);
        modalApi?.clearOverlayViewportAnchor?.(overlay);
        previousFocus?.focus?.({ preventScroll: true });
      };
      focusControl(packButton);
    }

    if (normalizedOptions.autoOpen) {
      win.requestAnimationFrame(() => {
        openPack().catch(() => {});
      });
    }
  });
}
