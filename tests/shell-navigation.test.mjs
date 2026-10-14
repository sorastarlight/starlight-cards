import assert from 'node:assert/strict';
import test from 'node:test';
import { cloneDefaultShellNavigation, PUBLIC_SHELL_DESTINATIONS } from '../docs/js/shell-navigation-defaults.js';
import { mergeShellNavigation, sanitizeShellNavigation } from '../docs/js/shell-navigation-model.js';
import { loginShellHref } from '../docs/js/shell-route-utils.js';
import { readFile } from 'node:fs/promises';

const read = relativePath => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('default shell navigation includes core destinations and slim account menu', () => {
  const nav = cloneDefaultShellNavigation();
  const ids = nav.sidebar.sections.map(section => section.id);
  assert.deepEqual(ids, ['home', 'cards', 'collect', 'shop', 'community', 'account']);
  assert.equal(nav.sidebar.sections[0].label, '');
  assert.equal(nav.sidebar.sections[1].label, 'Cards');
  assert.equal(nav.sidebar.sections[2].label, 'My Collection');
  assert.equal(nav.sidebar.sections[3].label, 'Shop');
  assert.ok(!nav.sidebar.sections.some(section => section.id === 'series'));
  assert.ok(!nav.sidebar.sections.some(section => section.staffOnly));
  assert.ok(!nav.accountMenu.signedIn.some(item =>
    item.destination === 'admin' && (item.features || []).includes('staffOnly')
  ));
  assert.deepEqual(
    nav.accountMenu.signedIn.map(item => item.label),
    ['View My Profile', 'Profile Settings', 'Notifications']
  );
  assert.ok(PUBLIC_SHELL_DESTINATIONS.some(entry => entry.value === 'offers'));
  assert.ok(PUBLIC_SHELL_DESTINATIONS.some(entry => entry.value === 'feed' && entry.label === 'Activity Feed'));
  assert.ok(PUBLIC_SHELL_DESTINATIONS.some(entry => entry.value === 'collection' && entry.label === 'My Card Binder'));
  assert.ok(PUBLIC_SHELL_DESTINATIONS.some(entry => entry.value === 'daily' && entry.label === 'Free Daily Starlight Pack'));
  assert.ok(PUBLIC_SHELL_DESTINATIONS.some(entry => entry.value === 'shop' && entry.label === 'Card Shop'));
  assert.ok(PUBLIC_SHELL_DESTINATIONS.some(entry => entry.value === 'season-pass' && entry.label === 'Twitch Season Pass'));
  assert.equal(nav.brandRibbon, 'Collectible Card Hub');
  assert.equal(nav.chrome?.layout, 'masthead');
  assert.ok(PUBLIC_SHELL_DESTINATIONS.some(entry => entry.value === 'checklist' && entry.label === 'Card Checklist'));
  assert.ok(PUBLIC_SHELL_DESTINATIONS.some(entry => entry.value === 'quests' && entry.label === 'Missions'));
  assert.ok(PUBLIC_SHELL_DESTINATIONS.some(entry => entry.value === 'trades' && entry.label === 'Trade'));
  assert.ok(PUBLIC_SHELL_DESTINATIONS.some(entry => entry.value === 'profile' && entry.label === 'Profile'));
  const home = nav.sidebar.sections.find(section => section.id === 'home');
  const cards = nav.sidebar.sections.find(section => section.id === 'cards');
  const collect = nav.sidebar.sections.find(section => section.id === 'collect');
  const shop = nav.sidebar.sections.find(section => section.id === 'shop');
  const community = nav.sidebar.sections.find(section => section.id === 'community');
  const account = nav.sidebar.sections.find(section => section.id === 'account');
  assert.ok(home.items.some(item => item.destination === 'home' && item.label === 'Home'));
  assert.ok(cards.items.some(item => item.destination === 'binder' && item.label === 'Card Gallery'));
  assert.ok(cards.items.some(item =>
    item.id === 'card-series'
    && item.label === 'Card Series'
    && item.destination === 'binder'
    && !(item.features || []).includes('sectionLabel')
  ));
  assert.ok(cards.items.some(item => item.id === 'event-cards' && item.label === 'Event Cards'));
  assert.ok(cards.items.some(item => item.id === 'special-cards' && item.label === 'Special Cards'));
  assert.ok(!cards.items.some(item => item.destination === 'daily'));
  assert.ok(collect.items.some(item => item.destination === 'collection' && item.label === 'My Card Binder'));
  assert.ok(!collect.items.some(item => item.id === 'card-series'));
  assert.ok(collect.items.some(item => item.destination === 'checklist' && item.label === 'Card Checklist'));
  assert.ok(collect.items.some(item => item.destination === 'star-bits' && item.label === 'My Star Bits'));
  assert.ok(collect.items.some(item => item.destination === 'quests' && item.label === 'Missions'));
  assert.ok(!collect.items.some(item => item.destination === 'shop'));
  assert.ok(!collect.items.some(item => item.destination === 'season-pass'));
  assert.ok(!collect.items.some(item => item.destination === 'redeem'));
  assert.ok(shop.items.some(item => item.destination === 'shop' && item.label === 'Card Shop'));
  assert.ok(shop.items.some(item => item.destination === 'season-pass' && item.label === 'Twitch Season Pass'));
  assert.ok(shop.items.some(item => item.destination === 'redeem' && item.label === 'Redeem Code'));
  assert.ok(community.items.some(item => item.destination === 'trades' && item.label === 'Trade'));
  assert.ok(community.items.some(item => item.destination === 'rankings' && item.label === 'Rankings'));
  assert.ok(community.items.some(item => item.destination === 'feed' && item.label === 'Activity Feed'));
  assert.ok(account.items.some(item => item.destination === 'rewards' && item.label === 'Gifts'));
  assert.equal(account.mobileOnly, false);
  assert.equal(nav.pageTitles.collection, 'My Card Binder');
  assert.equal(nav.pageTitles.binder, 'Card Gallery');
  assert.equal(nav.pageTitles.checklist, 'Card Checklist');
  assert.equal(nav.pageTitles.shop, 'Card Shop');
  assert.equal(nav.pageTitles.daily, 'Free Daily Starlight Pack');
  assert.equal(nav.pageTitles.quests, 'Missions');
  assert.equal(nav.pageTitles.trades, 'Trade');
  assert.equal(nav.pageTitles.rewards, 'Gifts');
  assert.equal(nav.pageTitles.rankings, 'Rankings');
  assert.equal(nav.pageTitles['star-bits'], 'My Star Bits');
  assert.equal(nav.pageTitles['season-pass'], 'Twitch Season Pass');
  assert.equal(nav.pageTitles.events, 'Events');
  assert.equal(nav.pageTitles.redeem, 'Redeem Code');
  assert.equal(nav.pageTitles.feed, 'Activity Feed');
  assert.ok(nav.topBar.quickLinks.some(link => link.destination === 'home' && link.label === 'Home'));
  assert.ok(nav.topBar.quickLinks.some(link =>
    link.destination === 'daily'
    && link.label === 'Free Daily Card Pack'
    && (link.features || []).includes('dailyBadge')
  ));
  assert.ok(!nav.topBar.quickLinks.some(link => link.destination === 'events'));
  assert.ok(!nav.topBar.quickLinks.some(link => link.destination === 'trades'));
  assert.ok(nav.accountMenu.signedIn.some(item => (item.features || []).includes('notificationBadge')));
  assert.ok(!nav.accountMenu.signedIn.some(item => (item.features || []).includes('receivedGiftBadge')));
  assert.ok(!nav.accountMenu.signedIn.some(item => (item.features || []).includes('tradeOfferBadge')));
  assert.ok(!nav.accountMenu.signedIn.some(item => (item.features || []).includes('signOut')));
  assert.ok(nav.accountMenu.signedOut.some(item => (item.features || []).includes('signIn')));
});

test('sanitizeShellNavigation migrates top bar off Events/Trade and onto Daily Pack', () => {
  const migrated = sanitizeShellNavigation({
    ...cloneDefaultShellNavigation(),
    topBar: {
      quickLinks: [
        { id: 'home-top', label: 'Home', destination: 'home', enabled: true },
        { id: 'events-top', label: 'Events', destination: 'events', enabled: true },
        { id: 'trades-top', label: 'Trade', destination: 'trades', enabled: true }
      ]
    },
    sidebar: {
      sections: cloneDefaultShellNavigation().sidebar.sections.map((section) => (
        section.id === 'collect' ? { ...section, label: 'Collection' } : section
      ))
    }
  });
  assert.equal(migrated.sidebar.sections.find(section => section.id === 'collect')?.label, 'My Collection');
  assert.ok(!migrated.topBar.quickLinks.some(link => link.destination === 'events'));
  assert.ok(!migrated.topBar.quickLinks.some(link => link.destination === 'trades'));
  assert.ok(migrated.topBar.quickLinks.some(link =>
    link.destination === 'daily'
    && link.label === 'Free Daily Card Pack'
    && (link.features || []).includes('dailyBadge')
  ));
});

test('sanitizeShellNavigation overwrites legacy product labels with new defaults', () => {
  const renamed = sanitizeShellNavigation({
    ...cloneDefaultShellNavigation(),
    pageTitles: {
      ...cloneDefaultShellNavigation().pageTitles,
      collection: 'My Card Collection & Favorites',
      daily: 'Free Daily Booster',
      shop: 'Starlight Card Shop',
      checklist: 'My Checklist',
      quests: 'Collection Quests',
      trades: 'Wishlist & Trades',
      profile: 'Profile & Settings',
      feed: 'Pull Feed'
    },
    sidebar: {
      sections: [{
        id: 'my-stuff',
        label: 'My Stuff',
        icon: { type: 'emoji', value: '♡' },
        staffOnly: false,
        items: [
          { id: 'collection', label: 'My Card Collection & Favorites', destination: 'collection', enabled: true, features: [] },
          { id: 'daily', label: 'Free Daily Booster', destination: 'daily', enabled: true, features: [] },
          { id: 'feed', label: 'Pull Feed', destination: 'feed', enabled: true, features: [] }
        ]
      }]
    }
  });
  assert.equal(renamed.pageTitles.collection, 'My Card Binder');
  assert.equal(renamed.pageTitles.daily, 'Free Daily Starlight Pack');
  assert.equal(renamed.pageTitles.shop, 'Card Shop');
  assert.equal(renamed.pageTitles.checklist, 'Card Checklist');
  assert.equal(renamed.pageTitles.quests, 'Missions');
  assert.equal(renamed.pageTitles.trades, 'Trade');
  assert.equal(renamed.pageTitles.profile, 'Profile');
  assert.equal(renamed.pageTitles.feed, 'Activity Feed');
  assert.equal(renamed.sidebar.sections[0].items[0].label, 'My Card Binder');
  assert.ok(!renamed.sidebar.sections[0].items.some(item => item.destination === 'daily'));
  assert.ok(renamed.sidebar.sections[0].items.some(item => item.destination === 'feed' && item.label === 'Activity Feed'));
});

test('sanitizeShellNavigation injects missing Cards destinations', () => {
  const patched = sanitizeShellNavigation({
    ...cloneDefaultShellNavigation(),
    sidebar: {
      sections: [
        {
          id: 'cards',
          label: 'Cards',
          icon: { type: 'emoji', value: '' },
          staffOnly: false,
          items: [
            { id: 'binder', label: 'Card Gallery', destination: 'binder', enabled: true, features: ['clearSeries', 'clearCardSet'] }
          ]
        },
        ...cloneDefaultShellNavigation().sidebar.sections.filter(section => section.id !== 'cards')
      ]
    }
  });
  const cards = patched.sidebar.sections.find(section => section.id === 'cards');
  assert.deepEqual(
    cards.items.map(item => item.label),
    ['Card Gallery', 'Card Series', 'Event Cards', 'Special Cards']
  );
  assert.ok(cards.items.some(item => item.id === 'event-cards' && (item.features || []).includes('eventCards')));
  assert.ok(cards.items.some(item => item.id === 'special-cards' && (item.features || []).includes('specialCards')));
});

test('sanitizeShellNavigation relocates checklist to Collection and keeps Daily off Cards', () => {
  const relocated = sanitizeShellNavigation({
    ...cloneDefaultShellNavigation(),
    sidebar: {
      sections: [
        {
          id: 'cards',
          label: 'Cards',
          icon: { type: 'emoji', value: '' },
          staffOnly: false,
          items: [
            { id: 'binder', label: 'Card Gallery', destination: 'binder', enabled: true, features: [] },
            { id: 'card-series', label: 'Card Series', destination: '', enabled: true, features: ['sectionLabel', 'seriesLinksSlot'] },
            { id: 'checklist', label: 'Card Checklist', destination: 'checklist', enabled: true, features: [] },
            { id: 'daily', label: 'Daily Booster', destination: 'daily', enabled: true, features: ['dailyBadge'] }
          ]
        },
        {
          id: 'collect',
          label: 'Collection',
          icon: { type: 'emoji', value: '' },
          staffOnly: false,
          items: [
            { id: 'collection', label: 'My Collection', destination: 'collection', enabled: true, features: [] },
            { id: 'shop', label: 'Shop', destination: 'shop', enabled: true, features: [] },
            { id: 'season-pass', label: 'Season Pass', destination: 'season-pass', enabled: true, features: [] },
            { id: 'redeem', label: 'Redeem Code', destination: 'redeem', enabled: true, features: [] }
          ]
        }
      ]
    }
  });
  const cards = relocated.sidebar.sections.find(section => section.id === 'cards');
  const collect = relocated.sidebar.sections.find(section => section.id === 'collect');
  const shop = relocated.sidebar.sections.find(section => section.id === 'shop');
  assert.ok(cards.items.some(item => item.label === 'Card Gallery'));
  assert.ok(cards.items.some(item =>
    item.id === 'card-series'
    && item.label === 'Card Series'
    && item.destination === 'binder'
    && !(item.features || []).includes('sectionLabel')
  ));
  assert.ok(cards.items.some(item => item.label === 'Event Cards'));
  assert.ok(cards.items.some(item => item.label === 'Special Cards'));
  assert.ok(!cards.items.some(item => item.destination === 'daily'));
  assert.ok(!cards.items.some(item => item.destination === 'checklist'));
  assert.ok(collect.items.some(item => item.destination === 'checklist' && item.label === 'Card Checklist'));
  assert.ok(!collect.items.some(item => item.id === 'card-series'));
  assert.ok(!collect.items.some(item => item.destination === 'daily'));
  assert.ok(!collect.items.some(item => item.destination === 'shop'));
  assert.ok(!collect.items.some(item => item.destination === 'season-pass'));
  assert.ok(!collect.items.some(item => item.destination === 'redeem'));
  assert.ok(shop?.items.some(item => item.destination === 'shop' && item.label === 'Card Shop'));
  assert.ok(shop?.items.some(item => item.destination === 'season-pass' && item.label === 'Twitch Season Pass'));
  assert.ok(shop?.items.some(item => item.destination === 'redeem' && item.label === 'Redeem Code'));
});

test('sanitizeShellNavigation rewrites Journal profile labels to Profile', () => {
  const renamed = sanitizeShellNavigation({
    ...cloneDefaultShellNavigation(),
    pageTitles: { ...cloneDefaultShellNavigation().pageTitles, profile: 'Journal' },
    sidebar: {
      sections: [{
        id: 'account',
        label: 'Account',
        icon: { type: 'emoji', value: '' },
        staffOnly: false,
        items: [
          { id: 'profile', label: 'Journal', destination: 'profile', enabled: true, features: [] }
        ]
      }]
    },
    accountMenu: {
      signedIn: [
        { id: 'profile-settings', label: 'Journal', destination: 'profile', enabled: true, features: [] }
      ],
      signedOut: cloneDefaultShellNavigation().accountMenu.signedOut
    }
  });
  assert.equal(renamed.pageTitles.profile, 'Profile');
  assert.equal(renamed.sidebar.sections[0].items[0].label, 'Profile');
  assert.equal(renamed.accountMenu.signedIn[0].label, 'Profile');
});

test('sanitizeShellNavigation merges duplicate trading hub sidebar links but keeps User Rankings separate', () => {
  const merged = sanitizeShellNavigation({
    ...cloneDefaultShellNavigation(),
    sidebar: {
      sections: [{
        id: 'my-stuff',
        label: 'My Stuff',
        icon: { type: 'emoji', value: '♡' },
        staffOnly: false,
        items: [
          { id: 'wishlist', label: 'My Wishlist', destination: 'trades', enabled: true, features: [] },
          { id: 'rankings', label: 'User Rankings', destination: 'rankings', enabled: true, features: [] },
          { id: 'offers', label: 'Trade Offers', destination: 'offers', enabled: true, features: ['tradeOfferBadge'] }
        ]
      }]
    }
  });

  const tradingItems = merged.sidebar.sections[0].items.filter(item => item.destination === 'trades');
  const rankingItems = merged.sidebar.sections[0].items.filter(item => item.destination === 'rankings');
  assert.equal(tradingItems.length, 1);
  assert.equal(rankingItems.length, 1);
  assert.equal(tradingItems[0].label, 'Trade');
  assert.equal(rankingItems[0].label, 'Rankings');
  assert.ok(tradingItems[0].features.includes('tradeOfferBadge'));
  assert.ok(!merged.sidebar.sections[0].items.some(item => item.destination === 'offers'));
});

test('sanitizeShellNavigation injects User Rankings when remote nav omits it', () => {
  const defaults = cloneDefaultShellNavigation();
  const remoteSection = defaults.sidebar.sections.find(section => section.id === 'community');
  const remoteItems = (remoteSection?.items || []).filter(item => item.destination !== 'rankings');
  const merged = sanitizeShellNavigation({
    ...defaults,
    sidebar: {
      sections: [{
        ...remoteSection,
        items: remoteItems
      }]
    }
  });

  assert.ok(merged.sidebar.sections[0].items.some(item => item.destination === 'rankings'));
  assert.equal(merged.pageTitles.rankings, 'Rankings');
});

test('sanitizeShellNavigation rejects unknown destinations and merges empty remote', () => {
  const merged = mergeShellNavigation({});
  assert.equal(merged.brandRibbon, 'Collectible Card Hub');
  assert.ok(merged.accountMenu.signedIn.length > 0);
  const renamed = sanitizeShellNavigation({
    ...cloneDefaultShellNavigation(),
    pageTitles: { ...cloneDefaultShellNavigation().pageTitles, feed: 'Pull Feed' },
    sidebar: {
      sections: [{
        id: 'my-stuff',
        label: 'My Stuff',
        icon: { type: 'emoji', value: '♡' },
        staffOnly: false,
        items: [
          { id: 'feed', label: 'Pull Feed', destination: 'feed', enabled: true, features: [] }
        ]
      }]
    }
  });
  assert.equal(renamed.pageTitles.feed, 'Activity Feed');
  assert.equal(renamed.sidebar.sections[0].items[0].label, 'Activity Feed');
  assert.throws(() => sanitizeShellNavigation({
    ...cloneDefaultShellNavigation(),
    topBar: { quickLinks: [{ id: 'x', label: 'Bad', destination: 'not-real', enabled: true }] }
  }), /Unsupported top-bar destination/);
});

test('website UI admin page and migration are wired', async () => {
  const [html, page, hub, migration, embed, shell] = await Promise.all([
    read('docs/admin-ui.html'),
    read('docs/js/pages/admin-ui-page.js'),
    read('docs/admin-hub.html'),
    read('supabase/migrations/20260722040000_shell_navigation_settings.sql'),
    read('docs/js/embed-mode.js'),
    read('docs/js/app-shell.js')
  ]);
  assert.match(html, /Navigation Studio/);
  assert.match(html, /Top Navigation/);
  assert.match(html, /Dropdown menus|panel-sidebar/);
  assert.match(html, /64[\u00d7x]64/i);
  assert.match(page, /Dropdown menu/);
  assert.match(page, /clearSeries/);
  assert.match(page, /eventCards/);
  assert.match(page, /specialCards/);
  assert.match(page, /linkFeature|TOP_BAR_FEATURES/);
  assert.match(page, /data-field="mega"/);
  assert.match(page, /uploadStudioAsset\(file, 'nav-icons'\)/);
  assert.doesNotMatch(html, /shellPreviewFrame|Live shell preview/);
  assert.doesNotMatch(page, /shellPreviewFrame|NAV_DRAFT|buildShellStudioPreviewUrl/);
  assert.doesNotMatch(html, /id="shellLayout"/);
  assert.doesNotMatch(html, /data-tab="account"/);
  assert.doesNotMatch(html, /data-tab="titles"/);
  assert.match(html, /id="shellLiveFeedToggle"/);
  assert.match(page, /navigation\.chrome\.layout/);
  assert.match(page, /navigation\.chrome\.showLiveFeed/);
  assert.match(page, /liveFeedToggle/);
  assert.match(hub, /Navigation Studio/);
  assert.match(hub, /admin-suite/);
  assert.match(await read('docs/js/pages/admin-hub-page.js'), /admin-ui\.html/);
  assert.match(migration, /admin_save_shell_navigation/);
  assert.match(embed, /'admin-ui\.html':'admin-ui'/);
  assert.match(embed, /'login\.html':'login'/);
  assert.match(embed, /hasAuthReturnParams/);
  assert.match(embed, /currentRoute === 'login' && hasAuthReturnParams\(\)/);
  assert.match(embed, /html\.starlight-embedded \.home/);
  assert.match(shell, /login:\{title:'Sign In',src:'login'\}/);
  assert.match(shell, /navigate\('login',\{extra:\{mode\}\}\)/);
  assert.match(shell, /admin-ui/);
  assert.match(shell, /refreshShellBadges|data-notification-dot/);
  assert.match(shell, /syncShellChromeHeights|applyLiveFeedVisibility/);
  const shellCss = await read('docs/css/app-shell.css');
  assert.match(shellCss, /z-index:\s*5000/);
  assert.match(shellCss, /--shell-chrome-pad/);
  assert.match(shellCss, /shell-live-strip-bottom/);
  assert.match(shellCss, /--shell-chrome-top/);
});

test('sanitizeShellNavigation preserves editor-authored top bar order and features', () => {
  const preserved = sanitizeShellNavigation({
    ...cloneDefaultShellNavigation(),
    topBar: {
      quickLinks: [
        {
          id: 'daily-top',
          label: 'Daily Freebie',
          destination: 'daily',
          enabled: true,
          features: [],
          className: 'shell-daily-top-link'
        },
        {
          id: 'home-top',
          label: 'Start',
          destination: 'home',
          enabled: true,
          features: []
        }
      ]
    }
  });
  assert.equal(preserved.topBar.quickLinks[0].destination, 'daily');
  assert.equal(preserved.topBar.quickLinks[0].label, 'Daily Freebie');
  assert.ok(!(preserved.topBar.quickLinks[0].features || []).includes('dailyBadge'));
  assert.equal(preserved.topBar.quickLinks[1].destination, 'home');
  assert.equal(preserved.topBar.quickLinks[1].label, 'Start');
});

test('shell refreshes Star Bits totals when wallet or rewards change', async () => {
  const [shell, economy, gifts, quests, season, shop, redeem, bits] = await Promise.all([
    read('docs/js/app-shell.js'),
    read('docs/js/shell-economy.js'),
    read('docs/js/pages/received-rewards-page.js'),
    read('docs/js/pages/collection-quests-page.js'),
    read('docs/js/pages/season-pass-page.js'),
    read('docs/js/pages/booster-shop-page.js'),
    read('docs/js/pages/redeem-page.js'),
    read('docs/js/pages/star-bits-page.js')
  ]);
  assert.match(economy, /export function notifyShellEconomyChanged/);
  assert.match(economy, /starlight-wallet-changed/);
  assert.match(economy, /starlight-dashboard-refresh/);
  assert.match(shell, /starlight-wallet-changed/);
  assert.match(shell, /starlight-rewards-changed[\s\S]*starlight-dashboard-refresh/);
  assert.match(gifts, /notifyShellEconomyChanged/);
  assert.match(quests, /notifyShellEconomyChanged/);
  assert.match(season, /notifyShellEconomyChanged/);
  assert.match(shop, /notifyShellEconomyChanged/);
  assert.match(redeem, /notifyShellEconomyChanged/);
  assert.match(bits, /notifyShellEconomyChanged/);
});

test('loginShellHref routes signed-out CTAs through the shell login view', () => {
  assert.equal(loginShellHref('signin'), 'binder?view=login&mode=signin');
  assert.equal(loginShellHref('signup'), 'binder?view=login&mode=signup');
  assert.equal(loginShellHref(), 'binder?view=login&mode=signin');
});

test('signed-out CTAs avoid standalone login.html links', async () => {
  const [shop, feed, comments, redeem, bits, profile, daily, collector, importPage] = await Promise.all([
    read('docs/js/pages/booster-shop-page.js'),
    read('docs/js/pages/pull-feed-page.js'),
    read('docs/js/card-comments.js'),
    read('docs/js/pages/redeem-page.js'),
    read('docs/js/pages/star-bits-page.js'),
    read('docs/js/pages/profile-settings-page.js'),
    read('docs/daily-booster.html'),
    read('docs/collector.html'),
    read('docs/import-collection.html')
  ]);

  for (const source of [shop, feed, comments, redeem, bits, profile]) {
    assert.doesNotMatch(source, /login\.html/);
  }
  assert.match(shop, /loginShellHref/);
  assert.match(comments, /loginShellHref/);
  assert.match(profile, /redirectToLogin/);
  assert.match(daily, /binder\?view=login/);
  assert.match(collector, /binder\?view=login/);
  assert.match(importPage, /binder\?view=login/);
});

test('sanitizeShellNavigation strips Series/Admin sidebar and keeps account menu slim', () => {
  const cleaned = sanitizeShellNavigation({
    ...cloneDefaultShellNavigation(),
    version: 3,
    sidebar: {
      sections: [
        {
          id: 'series',
          label: 'Series',
          icon: { type: 'emoji', value: '✦' },
          staffOnly: false,
          mega: true,
          items: [
            { id: 'all-series', label: 'All Series', destination: 'binder', enabled: true, features: ['clearSeries'] }
          ]
        },
        {
          id: 'cards',
          label: 'Cards',
          icon: { type: 'emoji', value: '🃏' },
          staffOnly: false,
          mega: true,
          items: [
            { id: 'binder', label: 'Starlight Card Gallery', destination: 'binder', enabled: true, features: [] }
          ]
        },
        {
          id: 'admin',
          label: 'Administration Hub',
          icon: { type: 'emoji', value: '🛠️' },
          staffOnly: true,
          mega: false,
          items: [
            { id: 'admin-hub', label: 'Open Administration Hub', destination: 'admin', enabled: true, features: ['staffOnly'] }
          ]
        }
      ]
    },
    accountMenu: {
      signedIn: [
        { id: 'profile-settings', label: 'Profile', destination: 'profile', enabled: true, features: [] },
        { id: 'sep-1', label: '', destination: '', enabled: true, features: ['separator'] },
        { id: 'sign-out', label: 'Sign Out', destination: '', enabled: true, features: ['signOut'] }
      ],
      signedOut: cloneDefaultShellNavigation().accountMenu.signedOut
    }
  });
  assert.ok(!cleaned.sidebar.sections.some(section => section.id === 'series'));
  assert.ok(!cleaned.sidebar.sections.some(section => section.id === 'admin'));
  assert.equal(cleaned.sidebar.sections.find(section => section.id === 'cards')?.label, 'Cards');
  assert.equal(
    cleaned.sidebar.sections.find(section => section.id === 'cards')?.items?.[0]?.label,
    'Card Gallery'
  );
  assert.deepEqual(
    cleaned.accountMenu.signedIn.map(item => item.label),
    ['View My Profile', 'Profile Settings', 'Notifications']
  );
  assert.equal(cleaned.version, 4);
});

test('shell navigation render gates staff account items', async () => {
  const render = await read('docs/js/shell-navigation-render.js');
  assert.match(render, /features\.includes\('staffOnly'\) && !isStaff/);
  assert.match(render, /map\(item => renderAccountMenuItem\(item, \{ isStaff \}\)/);
});

test('sanitizeShellNavigation upgrades legacy hybrid chrome to masthead', () => {
  const legacy = sanitizeShellNavigation({
    ...cloneDefaultShellNavigation(),
    version: 2,
    chrome: { layout: 'hybrid', showLiveFeed: true }
  });
  assert.equal(legacy.version, 4);
  assert.equal(legacy.chrome.layout, 'masthead');

  const explicitHybrid = sanitizeShellNavigation({
    ...cloneDefaultShellNavigation(),
    version: 3,
    chrome: { layout: 'hybrid', showLiveFeed: true }
  });
  assert.equal(explicitHybrid.chrome.layout, 'hybrid');
});

test('sanitizeShellNavigation preserves chrome layout mode', () => {
  const hybrid = sanitizeShellNavigation({
    ...cloneDefaultShellNavigation(),
    chrome: { layout: 'hybrid' }
  });
  assert.equal(hybrid.chrome.layout, 'hybrid');
  assert.equal(hybrid.chrome.showLiveFeed, true);

  const invalid = sanitizeShellNavigation({
    ...cloneDefaultShellNavigation(),
    chrome: { layout: 'sidebar-only' }
  });
  assert.equal(invalid.chrome.layout, 'masthead');

  const feedOff = sanitizeShellNavigation({
    ...cloneDefaultShellNavigation(),
    chrome: { layout: 'hybrid', showLiveFeed: false }
  });
  assert.equal(feedOff.chrome.showLiveFeed, false);
});

test('shell navigation render applies hybrid layout classes', async () => {
  const [render, shellCss, binderHtml, adminHtml] = await Promise.all([
    read('docs/js/shell-navigation-render.js'),
    read('docs/css/app-shell.css'),
    read('docs/binder.html'),
    read('docs/admin-ui.html')
  ]);
  assert.match(render, /is-bare/);
  assert.match(render, /applyShellLayoutToDom/);
  assert.match(render, /applyShellLiveFeedToDom/);
  assert.match(render, /querySelectorAll\('\.binder-ribbon'\)/);
  assert.match(render, /shell-hybrid-layout/);
  assert.match(render, /layout === 'hybrid'/);
  assert.match(shellCss, /shell-hybrid-layout/);
  assert.match(shellCss, /grid-template-areas/);
  assert.match(shellCss, /display:contents/);
  assert.match(shellCss, /shell-live-strip-bottom/);
  assert.match(shellCss, /--shell-chrome-top/);
  assert.match(binderHtml, /shell-live-strip-bottom/);
  assert.match(binderHtml, /id="shellLiveStrip"/);
  assert.match(binderHtml, /id="shellLiveStrip"[\s\S]*shell-live-feed-body[\s\S]*shell-live-feed-head/);
  assert.match(adminHtml, /shellLiveFeedToggle/);
});

test('shell navigation render and static shell HTML use extensionless binder hrefs', async () => {
  const [render, binderHtml, homeHtml] = await Promise.all([
    read('docs/js/shell-navigation-render.js'),
    read('docs/binder.html'),
    read('docs/home.html')
  ]);

  assert.match(render, /shellHref\(/);
  assert.match(render, /populateSeriesMegaMenus/);
  assert.match(render, /shell-mega-trigger/);
  assert.match(render, /data-series-mega-panel/);
  assert.doesNotMatch(render, /binder\.html\?/);
  assert.match(binderHtml, /href="binder\?view=home"/);
  assert.match(binderHtml, /shell-masthead/);
  assert.match(binderHtml, /shell-masthead-nav/);
  assert.match(binderHtml, /starlight-chrome\.css/);
  assert.match(binderHtml, /shell-masthead-layout/);
  assert.doesNotMatch(binderHtml, /shell-hybrid-layout/);
  assert.match(binderHtml, /shell-sidebar-brand/);
  assert.match(binderHtml, /binder-ribbon/);
  assert.match(homeHtml, /href="binder\?view=daily"/);
  assert.doesNotMatch(homeHtml, /binder\.html/);
});

test('sanitizeShellNavigation strips dailyRainbow and restores dailyBadge on daily links', () => {
  const migrated = sanitizeShellNavigation({
    ...cloneDefaultShellNavigation(),
    topBar: {
      quickLinks: [
        { id: 'home-top', label: 'Home', destination: 'home', enabled: true, features: [] },
        {
          id: 'daily-top',
          label: 'Free Daily Card Pack',
          destination: 'daily',
          enabled: true,
          features: ['dailyRainbow'],
          className: 'shell-daily-top-link'
        }
      ]
    }
  });
  const daily = migrated.topBar.quickLinks.find(link => link.destination === 'daily');
  assert.ok(daily);
  assert.ok((daily.features || []).includes('dailyBadge'));
  assert.ok(!(daily.features || []).includes('dailyRainbow'));
});

test('daily nav indicator module and READY badge markup are wired', async () => {
  const [indicator, render, dashboard, shell] = await Promise.all([
    read('docs/js/daily-nav-indicator.js'),
    read('docs/js/shell-navigation-render.js'),
    read('docs/js/site-dashboard.js'),
    read('docs/js/app-shell.js')
  ]);
  assert.match(indicator, /applyDailyNavReadyState/);
  assert.match(indicator, /data-daily-nav-badge/);
  assert.doesNotMatch(indicator, /dailyRainbow|data-daily-nav-rainbow/);
  assert.match(render, /data-daily-nav-badge/);
  assert.match(render, /shell-daily-top-link/);
  assert.doesNotMatch(render, /dailyRainbow|shell-daily-rainbow-link/);
  assert.match(dashboard, /applyDailyNavReadyState/);
  assert.match(shell, /hydrateDailyNavIndicator/);
});

test('masthead nav collapses for laptop widths and scaled 1920 displays', async () => {
  const [chrome, shell, fit, appShell] = await Promise.all([
    read('docs/css/starlight-chrome.css'),
    read('docs/css/app-shell.css'),
    read('docs/js/masthead-nav-fit.js'),
    read('docs/js/app-shell.js')
  ]);
  assert.match(chrome, /container-type:\s*inline-size/);
  assert.match(chrome, /@container shell-masthead \(min-width: 2000px\)/);
  assert.match(chrome, /shell-masthead--force-collapse/);
  assert.match(chrome, /shell-masthead-nav[\s\S]*display:\s*none/);
  assert.match(shell, /min-width:2000px[\s\S]*shell-masthead-nav\{display:flex\}/);
  assert.match(shell, /shell-masthead--force-collapse/);
  assert.match(fit, /syncMastheadNavFit|scrollWidth/);
  assert.match(appShell, /scheduleMastheadNavFit/);
});

test('shell masthead wires mega menus and series browse params', async () => {
  const [shell, defaults, render] = await Promise.all([
    read('docs/js/app-shell.js'),
    read('docs/js/shell-navigation-defaults.js'),
    read('docs/js/shell-navigation-render.js')
  ]);
  assert.match(shell, /wireMastheadMenus/);
  assert.match(shell, /closeAllMegaMenus/);
  assert.match(shell, /stopPropagation/);
  assert.match(shell, /data-series-key|dataset\.seriesKey/);
  assert.match(shell, /applyStarlightSeriesFilter/);
  assert.match(shell, /locationExtraParams/);
  assert.doesNotMatch(shell, /pointerenter[\s\S]*openMegaMenu/);
  assert.match(render, /destination === 'home'/);
  assert.match(render, /Home/);
  assert.match(render, /shell-daily-top-link|dailyBadge/);
  assert.match(defaults, /Free Daily Card Pack/);
  assert.match(defaults, /mega:\s*true/);
  assert.match(defaults, /clearSeries/);
  assert.match(defaults, /brandRibbon: 'Collectible Card Hub'/);
  assert.match(defaults, /home-top/);
});

test('shell refreshes account chrome after embedded login', async () => {
  const [shell, loginPage] = await Promise.all([
    read('docs/js/app-shell.js'),
    read('docs/js/pages/login-page.js')
  ]);

  assert.match(shell, /onAuthStateChange/);
  assert.match(shell, /INITIAL_SESSION/);
  assert.match(shell, /syncShellSessionFromMessage/);
  assert.match(shell, /scheduleHydrateAccount/);
  assert.match(shell, /applyAccountChrome/);
  assert.match(shell, /starlight-auth-changed[\s\S]*syncShellSessionFromMessage/);
  assert.match(shell, /previousRoute==='login'[\s\S]*scheduleHydrateAccount/);
  assert.match(loginPage, /starlight-auth-changed[\s\S]*access_token/);
});

test('binder.html defaults the shell to the Card Gallery view', async () => {
  const shell = await read('docs/js/app-shell.js');
  assert.match(shell, /function defaultShellView\(\)/);
  assert.match(shell, /if\(path==='binder'\)return 'binder'/);
  assert.match(shell, /get\('view'\)\|\|defaultShellView\(\)/);
});
