import {
  cloneDefaultShellNavigation,
  PUBLIC_SHELL_DESTINATIONS,
  SHELL_LABEL_REWRITES,
  SHELL_LAYOUT_MODES
} from './shell-navigation-defaults.js';
import { isKnownShellRoute } from './shell-route-utils.js';
import { isShellNavIconId, shellNavIconForKey } from './shell-nav-icons.js';

const ALLOWED_DESTINATIONS = new Set(PUBLIC_SHELL_DESTINATIONS.map(entry => entry.value));
const DEFAULT_DESTINATION_LABELS = Object.fromEntries(
  PUBLIC_SHELL_DESTINATIONS.map(entry => [entry.value, entry.label])
);

function rewriteLegacyLabel(destination, label, fallback, { preferFallback = false } = {}) {
  const current = String(label || '').trim();
  if (!current) return fallback;
  if (/^the community$|^community(\s+hub)?$/i.test(current)) return 'Community';
  const legacy = SHELL_LABEL_REWRITES[destination];
  if (!legacy?.length) return current;
  const matched = legacy.some(entry => entry.toLowerCase() === current.toLowerCase());
  if (!matched) return current;
  if (preferFallback) return fallback || DEFAULT_DESTINATION_LABELS[destination] || current;
  return DEFAULT_DESTINATION_LABELS[destination] || fallback || current;
}

function asIcon(icon) {
  if (!icon || typeof icon !== 'object') return { type: 'emoji', value: '' };
  if (icon.type === 'image' && icon.url) {
    return {
      type: 'image',
      url: String(icon.url),
      path: icon.path ? String(icon.path) : ''
    };
  }
  if (icon.type === 'svg' && icon.value) {
    return {
      type: 'svg',
      value: String(icon.value).trim().slice(0, 40)
    };
  }
  return { type: 'emoji', value: String(icon.value || '').slice(0, 8) };
}

/** Prefer cohesive SVG icons over legacy emoji; keep custom uploads. */
function upgradeShellIcon(icon, key) {
  if (icon?.type === 'image' && icon.url) return icon;
  if (icon?.type === 'svg' && isShellNavIconId(icon.value)) return icon;
  const upgraded = shellNavIconForKey(key);
  if (upgraded.type === 'svg') return upgraded;
  return icon;
}

function sanitizeNavFeatures(features = [], destination = '') {
  const list = Array.isArray(features) ? features.map(String).filter(Boolean) : [];
  const hadRainbow = list.includes('dailyRainbow');
  const next = list.filter(feature => feature !== 'dailyRainbow');
  if (destination === 'daily' && hadRainbow && !next.includes('dailyBadge')) {
    next.push('dailyBadge');
  }
  return next.slice(0, 8);
}

function sanitizeItem(item = {}, index = 0) {
  const destination = String(item.destination || '').trim();
  const features = sanitizeNavFeatures(item.features, destination);
  const isLabel = features.includes('sectionLabel');
  const isSeparator = features.includes('separator');
  const isAuthAction = features.some((feature) =>
    ['signOut', 'signIn', 'signUp', 'profileLink'].includes(feature)
  );
  const resolvedDestination = isLabel || isSeparator ? '' : destination;
  if (
    !isLabel &&
    !isSeparator &&
    !isAuthAction &&
    resolvedDestination &&
    !ALLOWED_DESTINATIONS.has(resolvedDestination) &&
    !isKnownShellRoute(resolvedDestination)
  ) {
    throw new Error(`Unsupported navigation destination: ${resolvedDestination}`);
  }
  const rawLabel = String(item.label || (isSeparator ? '' : 'Untitled')).trim().slice(0, 80)
    || (isSeparator ? '' : 'Untitled');
  return {
    id: String(item.id || `item-${index}`).slice(0, 64),
    label: isLabel || isSeparator
      ? rewriteLegacyLabel('', rawLabel, rawLabel)
      : rewriteLegacyLabel(resolvedDestination, rawLabel, rawLabel),
    icon: asIcon(item.icon),
    destination: resolvedDestination,
    enabled: item.enabled !== false,
    features,
    className: String(item.className || '').trim().slice(0, 80),
    seriesKey: String(item.seriesKey || '').trim().slice(0, 120)
  };
}

function sanitizeAccountMenuItems(items, fallback) {
  const source = Array.isArray(items) ? items : fallback;
  return source.map(sanitizeItem).slice(0, 16);
}

function ensureAccountMenuAdminHub(signedIn, defaults) {
  // Administration Hub lives in the drawer/sidebar; keep account menu slim.
  // Always keep Sign Out reachable for account switching.
  const list = Array.isArray(signedIn) ? [...signedIn] : [];
  if (list.some(item => (item.features || []).includes('signOut'))) return list;
  const defaultSignOut = (defaults?.accountMenu?.signedIn || [])
    .find(item => (item.features || []).includes('signOut'));
  if (defaultSignOut) {
    list.push(sanitizeItem({ ...defaultSignOut }, list.length));
  } else {
    list.push(sanitizeItem({
      id: 'sign-out',
      label: 'Sign Out',
      destination: '',
      enabled: true,
      features: ['signOut']
    }, list.length));
  }
  return list;
}

function consolidateTradingNavItems(items = []) {
  const result = [];
  let tradingHubItem = null;

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const features = Array.isArray(item.features) ? item.features : [];
    if (features.includes('sectionLabel') || features.includes('separator')) {
      result.push(item);
      continue;
    }

    let destination = String(item.destination || '').trim();
    if (destination === 'offers') destination = 'trades';

    const label = String(item.label || '').trim();
    const isTradingEntry = destination === 'trades'
      || /wishlist|trade with others|trade offers|card exchange|trading hub/i.test(label);

    if (!isTradingEntry) {
      result.push(item);
      continue;
    }

    if (!tradingHubItem) {
      tradingHubItem = {
        ...item,
        destination: 'trades',
        label: DEFAULT_DESTINATION_LABELS.trades || 'Trade',
        features: [...features]
      };
      result.push(tradingHubItem);
      continue;
    }

    if (features.includes('tradeOfferBadge') && !tradingHubItem.features.includes('tradeOfferBadge')) {
      tradingHubItem.features = [...tradingHubItem.features, 'tradeOfferBadge'];
    }
  }

  return result;
}

/** Move checklist → Collection when remote nav still uses the prior layout. */
function relocateSidebarDestinations(sections, defaults) {
  const moves = [
    { destination: 'checklist', targetSectionId: 'collect' }
  ];

  for (const move of moves) {
    const targetSection = sections.find(section => section.id === move.targetSectionId)
      || sections.find(section => {
        const defaultSection = (defaults.sidebar?.sections || []).find(entry => entry.id === move.targetSectionId);
        return defaultSection && section.label === defaultSection.label;
      });
    if (!targetSection) continue;

    let relocated = null;
    for (const section of sections) {
      if (section === targetSection) continue;
      const index = (section.items || []).findIndex(item => item.destination === move.destination);
      if (index < 0) continue;
      relocated = section.items.splice(index, 1)[0];
      break;
    }
    if (!relocated) continue;
    if ((targetSection.items || []).some(item => item.destination === move.destination)) continue;

    const defaultSection = (defaults.sidebar?.sections || []).find(entry => entry.id === move.targetSectionId);
    const defaultOrder = (defaultSection?.items || []).map(item => item.destination);
    const desiredIndex = defaultOrder.indexOf(move.destination);
    if (desiredIndex < 0) {
      targetSection.items.push(relocated);
      continue;
    }

    let insertAt = targetSection.items.length;
    for (let i = desiredIndex + 1; i < defaultOrder.length; i += 1) {
      const afterIndex = targetSection.items.findIndex(item => item.destination === defaultOrder[i]);
      if (afterIndex >= 0) {
        insertAt = afterIndex;
        break;
      }
    }
    if (insertAt === targetSection.items.length) {
      for (let i = desiredIndex - 1; i >= 0; i -= 1) {
        const beforeIndex = targetSection.items.findIndex(item => item.destination === defaultOrder[i]);
        if (beforeIndex >= 0) {
          insertAt = beforeIndex + 1;
          break;
        }
      }
    }
    targetSection.items.splice(insertAt, 0, relocated);
  }

  return sections;
}

/** Daily Pack lives on the top bar; keep it out of sidebar/mega sections. */
function stripDailyFromSidebar(sections = []) {
  for (const section of sections) {
    section.items = (section.items || []).filter(item => item.destination !== 'daily');
  }
  return sections;
}

/**
 * Migrate legacy Cards megas that still bury Daily Pack or use a non-clickable
 * Card Series label slot. Canonical Cards destinations: Card Gallery, Event Cards,
 * Special Cards. Drop Card Series when it only duplicates Gallery.
 */
function normalizeCardsSection(sections, defaults) {
  const cards = sections.find(section => section.id === 'cards');
  const defaultCards = (defaults.sidebar?.sections || []).find(section => section.id === 'cards');
  if (!cards || !defaultCards) return sections;

  cards.label = cards.label || defaultCards.label || 'Cards';
  cards.mega = true;

  const items = [...(cards.items || [])];
  const seriesIndex = items.findIndex(item =>
    item.id === 'card-series' || /^card series$/i.test(String(item.label || '').trim())
  );
  const seriesItem = seriesIndex >= 0 ? items[seriesIndex] : null;
  const seriesIsLegacyLabel = seriesItem
    && (
      (seriesItem.features || []).includes('sectionLabel')
      || (seriesItem.features || []).includes('seriesLinksSlot')
      || !seriesItem.destination
    );

  const hasDaily = items.some(item => item.destination === 'daily');
  const isEmpty = items.length === 0;
  const needsLegacyReset = isEmpty || hasDaily || seriesIsLegacyLabel;

  if (needsLegacyReset) {
    cards.items = defaultCards.items.map((item, index) => sanitizeItem(item, index));
    return sections;
  }

  const defaultItems = defaultCards.items || [];
  const used = new Set();
  const ordered = [];

  for (const def of defaultItems) {
    const matchIndex = items.findIndex((item, index) => {
      if (used.has(index)) return false;
      if (item.id && item.id === def.id) return true;
      if (def.id === 'binder' && item.destination === 'binder' && /gallery/i.test(String(item.label || ''))) return true;
      if (def.id === 'event-cards' && (/^event cards$/i.test(String(item.label || '').trim()) || (item.features || []).includes('eventCards'))) return true;
      if (def.id === 'special-cards' && (/^special cards$/i.test(String(item.label || '').trim()) || (item.features || []).includes('specialCards'))) return true;
      return false;
    });
    if (matchIndex >= 0) {
      used.add(matchIndex);
      const match = { ...items[matchIndex] };
      match.id = match.id || def.id;
      match.label = match.label || def.label;
      match.destination = match.destination || def.destination;
      if (!Array.isArray(match.features) || match.features.length === 0) {
        match.features = [...(def.features || [])];
      }
      ordered.push(sanitizeItem(match, ordered.length));
    } else {
      ordered.push(sanitizeItem(def, ordered.length));
    }
  }

  items.forEach((item, index) => {
    if (used.has(index)) return;
    const isSeriesDuplicate = item.id === 'card-series'
      || /^card series$/i.test(String(item.label || '').trim());
    // Card Series → binder is the same destination as Card Gallery; drop it.
    if (isSeriesDuplicate && item.destination === 'binder') return;
    ordered.push(sanitizeItem(item, ordered.length));
  });

  cards.items = ordered;
  return sections;
}

const SHOP_SECTION_DESTINATIONS = new Set(['shop', 'season-pass', 'redeem']);

/** Keep shop/economy items out of My Collection, and Card Series under Cards. */
function normalizeCollectSection(sections, defaults) {
  const collect = sections.find(section => section.id === 'collect');
  if (!collect) return sections;

  collect.items = (collect.items || []).filter(item =>
    item.id !== 'card-series'
    && !/^card series$/i.test(String(item.label || '').trim())
    && !SHOP_SECTION_DESTINATIONS.has(item.destination)
  );

  const starBits = collect.items.find(item => item.destination === 'star-bits');
  if (starBits && /^star bits$/i.test(String(starBits.label || '').trim())) {
    starBits.label = 'My Star Bits';
  }
  const collectionItem = collect.items.find(item => item.destination === 'collection');
  if (collectionItem && /^my collection$/i.test(String(collectionItem.label || '').trim())) {
    collectionItem.label = 'My Card Binder';
  }
  return sections;
}

/**
 * Ensure a Shop mega exists when shop destinations were stranded under Collection.
 * Do not rewrite an editor-authored Shop menu that already has shop destinations.
 */
function normalizeShopSection(sections, defaults) {
  const defaultShop = (defaults.sidebar?.sections || []).find(section => section.id === 'shop');
  if (!defaultShop) return sections;

  const collect = sections.find(section => section.id === 'collect');
  const strandedShopItems = collect
    ? (collect.items || []).filter(item => SHOP_SECTION_DESTINATIONS.has(item.destination))
    : [];
  if (collect) {
    collect.items = (collect.items || []).filter(item => !SHOP_SECTION_DESTINATIONS.has(item.destination));
  }

  let shop = sections.find(section => section.id === 'shop');
  if (!shop) {
    shop = sanitizeSection(structuredClone(defaultShop), sections.length);
    if (strandedShopItems.length) {
      shop.items = strandedShopItems.map((item, index) => sanitizeItem({
        ...item,
        label: item.destination === 'shop' && /^shop$/i.test(String(item.label || '').trim())
          ? 'Card Shop'
          : item.label
      }, index));
    }
    const collectIndex = sections.findIndex(section => section.id === 'collect');
    const communityIndex = sections.findIndex(section => section.id === 'community');
    const insertAt = collectIndex >= 0
      ? collectIndex + 1
      : (communityIndex >= 0 ? communityIndex : sections.length);
    sections.splice(insertAt, 0, shop);
    return sections;
  }

  if (strandedShopItems.length) {
    const present = new Set((shop.items || []).map(item => item.destination));
    for (const item of strandedShopItems) {
      if (present.has(item.destination)) continue;
      shop.items.push(sanitizeItem(item, shop.items.length));
      present.add(item.destination);
    }
  }

  if (/^(shop|card shop)$/i.test(String(shop.label || '').trim())) {
    shop.label = 'Shop';
  }
  return sections;
}

function ensureDefaultSidebarSections(sections, defaults) {
  const defaultSections = defaults.sidebar?.sections || [];
  const result = [...sections];

  defaultSections.forEach((defaultSection, defaultIndex) => {
    if (result.some(section => section.id === defaultSection.id)) return;
    const insert = sanitizeSection(structuredClone(defaultSection), defaultIndex);
    let insertAt = result.length;
    for (let i = defaultIndex - 1; i >= 0; i -= 1) {
      const prevIndex = result.findIndex(section => section.id === defaultSections[i].id);
      if (prevIndex >= 0) {
        insertAt = prevIndex + 1;
        break;
      }
    }
    result.splice(insertAt, 0, insert);
  });

  return result;
}

function ensureDefaultSidebarItems(sections, defaults) {
  const defaultSections = defaults.sidebar?.sections || [];
  const presentDestinations = new Set();
  sections.forEach(section => {
    (section.items || []).forEach(item => {
      if (item.destination) presentDestinations.add(item.destination);
    });
  });

  defaultSections.forEach(defaultSection => {
    const targetSection = sections.find(section => section.id === defaultSection.id)
      || sections.find(section => section.label === defaultSection.label);
    if (!targetSection) return;

    (defaultSection.items || []).forEach(defaultItem => {
      const destination = String(defaultItem.destination || '').trim();
      if (!destination || presentDestinations.has(destination)) return;
      if ((defaultItem.features || []).includes('sectionLabel')) return;

      const insertItem = sanitizeItem(defaultItem, targetSection.items.length);
      const tradesIndex = targetSection.items.findIndex(item => item.destination === 'trades');
      if (tradesIndex >= 0 && destination !== 'trades') {
        targetSection.items.splice(tradesIndex + 1, 0, insertItem);
      } else {
        targetSection.items.push(insertItem);
      }
      presentDestinations.add(destination);
    });
  });

  return sections;
}

function rewriteSectionLabel(section) {
  const id = String(section.id || '');
  const label = String(section.label || '').trim();
  if (id === 'home') return '';
  if (id === 'cards' && /^(cards|starlight cards gallery)$/i.test(label)) return 'Cards';
  if (id === 'collect' && /^(collect|collection|my collection)$/i.test(label)) return 'My Collection';
  if (id === 'shop' && /^(shop|card shop)$/i.test(label)) return 'Shop';
  if (id === 'community' && /^(community|community hub)$/i.test(label)) return 'Community';
  if (id === 'account' && /^account$/i.test(label)) return 'Account';
  return label || section.label;
}

/**
 * Strip legacy Community dupes from the top bar. Inject Daily Pack only when
 * migrating away from Events/Trade. Preserve editor-authored top-bar order,
 * labels, features, and className otherwise.
 */
function normalizeTopBarQuickLinks(links, defaults) {
  const defaultLinks = Array.isArray(defaults.topBar?.quickLinks) ? defaults.topBar.quickLinks : [];
  const defaultDaily = defaultLinks.find(link => link.destination === 'daily') || {
    id: 'daily-top',
    label: 'Free Daily Card Pack',
    destination: 'daily',
    enabled: true,
    features: ['dailyBadge'],
    className: 'shell-daily-top-link'
  };

  const communityDupes = new Set(['events', 'trades', 'offers']);
  const source = Array.isArray(links) ? links : [];
  const hadLegacyCommunity = source.some(link =>
    communityDupes.has(String(link?.destination || ''))
  );
  const cleaned = source.filter(link => link && !communityDupes.has(String(link.destination || '')));

  if (!cleaned.length) {
    return defaultLinks.map((link, index) => ({
      id: String(link.id || `top-${index}`).slice(0, 64),
      label: String(link.label || link.destination).slice(0, 40),
      destination: link.destination,
      enabled: link.enabled !== false,
      features: Array.isArray(link.features) ? [...link.features] : [],
      className: String(link.className || '').trim().slice(0, 80)
    })).slice(0, 10);
  }

  let next = cleaned.map((link) => {
    if (link.destination !== 'daily') return link;
    const label = !String(link.label || '').trim()
      || /^free daily( starlight)? (card )?pack$/i.test(String(link.label || '').trim())
      ? defaultDaily.label
      : link.label;
    return {
      ...link,
      label,
      className: link.className || defaultDaily.className || 'shell-daily-top-link'
    };
  });

  if (hadLegacyCommunity && !next.some(link => link.destination === 'daily')) {
    next = [...next, {
      ...defaultDaily,
      features: [...(defaultDaily.features || [])]
    }];
  }

  // Keep My Binder reachable from the top bar without reshuffling editor order.
  const defaultCollection = defaultLinks.find(link => link.destination === 'collection');
  if (defaultCollection && !next.some(link => link.destination === 'collection')) {
    next.push({
      ...defaultCollection,
      features: [...(defaultCollection.features || [])]
    });
  }

  return next.slice(0, 10);
}

function sanitizeSection(section = {}, index = 0) {
  const items = Array.isArray(section.items) ? section.items.map(sanitizeItem).slice(0, 40) : [];
  const next = {
    id: String(section.id || `section-${index}`).slice(0, 64),
    label: String(section.label || 'Section').trim().slice(0, 80) || 'Section',
    icon: asIcon(section.icon),
    staffOnly: Boolean(section.staffOnly),
    mega: Boolean(section.mega),
    mobileOnly: Boolean(section.mobileOnly),
    items: consolidateTradingNavItems(items)
  };
  next.label = rewriteSectionLabel(next);
  next.icon = upgradeShellIcon(next.icon, next.id);
  next.items = next.items.map((item) => ({
    ...item,
    icon: upgradeShellIcon(item.icon, item.destination || item.id)
  }));
  return next;
}

export function sanitizeShellNavigation(input) {
  const defaults = cloneDefaultShellNavigation();
  const source = input && typeof input === 'object' ? input : {};
  const pageTitles = { ...defaults.pageTitles };
  if (source.pageTitles && typeof source.pageTitles === 'object') {
    for (const [key, value] of Object.entries(source.pageTitles)) {
      if (!isKnownShellRoute(key)) continue;
      const next = String(value || '').trim().slice(0, 80) || defaults.pageTitles[key] || key;
      pageTitles[key] = rewriteLegacyLabel(key, next, defaults.pageTitles[key] || key, {
        preferFallback: true
      });
    }
  }

  const quickLinks = normalizeTopBarQuickLinks(
    Array.isArray(source.topBar?.quickLinks)
      ? source.topBar.quickLinks.slice(0, 10).map((link, index) => {
        const destination = String(link.destination || '').trim();
        if (!ALLOWED_DESTINATIONS.has(destination)) {
          throw new Error(`Unsupported top-bar destination: ${destination || '(empty)'}`);
        }
        const features = sanitizeNavFeatures(link.features, destination);
        const rawLabel = String(link.label || destination).trim().slice(0, 40) || destination;
        return {
          id: String(link.id || `top-${index}`).slice(0, 64),
          label: rewriteLegacyLabel(destination, rawLabel, destination).slice(0, 40),
          destination,
          enabled: link.enabled !== false,
          features,
          className: String(link.className || '').trim().slice(0, 80)
        };
      })
      : defaults.topBar.quickLinks,
    defaults
  );

  const sections = normalizeShopSection(
    normalizeCollectSection(
      normalizeCardsSection(
        stripDailyFromSidebar(
          ensureDefaultSidebarItems(
            ensureDefaultSidebarSections(
              relocateSidebarDestinations(
                Array.isArray(source.sidebar?.sections)
                  ? source.sidebar.sections.map(sanitizeSection).slice(0, 8)
                  : defaults.sidebar.sections.map(sanitizeSection),
                defaults
              ),
              defaults
            ),
            defaults
          )
        ),
        defaults
      ),
      defaults
    ),
    defaults
  ).filter(section => section.id !== 'series' && section.id !== 'admin');

  if (!sections.length) throw new Error('At least one sidebar section is required.');

  for (const key of Object.keys(defaults.pageTitles)) {
    if (!pageTitles[key]) pageTitles[key] = defaults.pageTitles[key];
  }

  // Nav chrome uses clear destination labels; page titles keep magical defaults.
  for (const key of Object.keys(pageTitles)) {
    pageTitles[key] = rewriteLegacyLabel(key, pageTitles[key], defaults.pageTitles[key] || key, {
      preferFallback: true
    });
  }
  for (const section of sections) {
    for (const item of section.items || []) {
      if (!item.destination) continue;
      item.label = rewriteLegacyLabel(item.destination, item.label, item.label);
    }
  }

  const accountMenuSource = source.accountMenu && typeof source.accountMenu === 'object'
    ? source.accountMenu
    : defaults.accountMenu;

  const sourceVersion = Number(source.version) || 0;
  const defaultVersion = Number(defaults.version) || 3;
  const useSlimAccountMenu = sourceVersion < 4;

  const accountMenu = {
    signedIn: ensureAccountMenuAdminHub(
      sanitizeAccountMenuItems(
        useSlimAccountMenu ? defaults.accountMenu.signedIn : accountMenuSource.signedIn,
        defaults.accountMenu.signedIn
      ),
      defaults
    ),
    signedOut: sanitizeAccountMenuItems(accountMenuSource.signedOut, defaults.accountMenu.signedOut)
  };
  for (const list of [accountMenu.signedIn, accountMenu.signedOut]) {
    for (const item of list) {
      if (!item.destination) continue;
      item.label = rewriteLegacyLabel(item.destination, item.label, item.label);
    }
  }

  const chromeSource = source.chrome && typeof source.chrome === 'object' ? source.chrome : {};
  let layoutRaw = String(chromeSource.layout || defaults.chrome?.layout || 'masthead').trim().toLowerCase();
  if (sourceVersion < 3 && layoutRaw === 'hybrid') {
    layoutRaw = 'masthead';
  }
  const layout = SHELL_LAYOUT_MODES.includes(layoutRaw) ? layoutRaw : defaults.chrome.layout;
  const showLiveFeed = chromeSource.showLiveFeed !== false
    && chromeSource.show_live_feed !== false
    && chromeSource.liveFeed !== false;
  const version = sourceVersion >= defaultVersion ? sourceVersion : defaultVersion;

  return {
    version,
    brandRibbon: String(source.brandRibbon ?? defaults.brandRibbon).trim().slice(0, 40) || defaults.brandRibbon,
    chrome: { layout, showLiveFeed },
    pageTitles,
    sidebar: { sections },
    topBar: { quickLinks },
    accountMenu
  };
}

export function mergeShellNavigation(remote) {
  try {
    return sanitizeShellNavigation(remote && typeof remote === 'object' ? remote : cloneDefaultShellNavigation());
  } catch {
    return cloneDefaultShellNavigation();
  }
}