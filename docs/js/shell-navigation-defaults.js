/** Default shell chrome config (mirrors binder.html). */

import { starBitNavIcon } from './star-bit-icon.js';
import { shellNavIcon } from './shell-nav-icons.js';

/** Clear, product-style destination labels for navigation chrome. */
export const PUBLIC_SHELL_DESTINATIONS = Object.freeze([
  { value: 'home', label: 'Home' },
  { value: 'binder', label: 'Card Gallery' },
  { value: 'daily', label: 'Free Daily Starlight Pack' },
  { value: 'shop', label: 'Card Shop' },
  { value: 'events', label: 'Events' },
  { value: 'redeem', label: 'Redeem Code' },
  { value: 'collection', label: 'My Card Binder' },
  { value: 'star-bits', label: 'My Star Bits' },
  { value: 'checklist', label: 'Card Checklist' },
  { value: 'quests', label: 'Missions' },
  { value: 'season-pass', label: 'Twitch Season Pass' },
  { value: 'trades', label: 'Trade' },
  { value: 'offers', label: 'Trade' },
  { value: 'rankings', label: 'Rankings' },
  { value: 'feed', label: 'Activity Feed' },
  { value: 'notifications', label: 'Notifications' },
  { value: 'rewards', label: 'Gifts' },
  { value: 'profile', label: 'Profile' },
  { value: 'about', label: 'About' },
  { value: 'socials', label: 'Socials' },
  { value: 'admin', label: 'Administration Hub' }
]);

export const COMMON_NAV_EMOJIS = Object.freeze([
  '✦', '♡', '🏠', '🗂️', '✨', '🛍️', '🎉', '🎟️', '☑', '🤝', '💫', '🔔', '🎁', '👤', '🛠️',
  '⭐', '🌟', '💎', '🎴', '📦', '🛒', '📰', '🎮', '📺', '🔗', '⚙️', '📋', '🧭', '🌈', '💜',
  '𝕏', '▶️', '🃏', '📖', '🎯', '🏆', '🎫'
]);

/** Brand mark presets for navigation (Twitch, YouTube, X). */
export { BRAND_ICONS, BRAND_ICON_IDS, brandIconToken } from './brand-icons.js';

/**
 * Old / branded nav labels → rewrite to current PUBLIC_SHELL_DESTINATIONS labels.
 * Page titles use a separate magical default and prefer that fallback when matched.
 */
export const SHELL_LABEL_REWRITES = Object.freeze({
  daily: Object.freeze([
    'Daily Wish',
    'Daily Booster',
    'Free Daily Booster',
    'Daily Free Booster',
    'Daily Free Booster Pack',
    'Free Daily Booster Pack'
  ]),
  shop: Object.freeze([
    'Starlight Card Shop',
    'Card Shop',
    'Shop',
    'Card Boutique'
  ]),
  collection: Object.freeze([
    'My Collection',
    'My Starlight Album',
    'My Card Collection & Favorites',
    'My Card Collection',
    'My Card Album Binder'
  ]),
  binder: Object.freeze([
    'The Starlight Card Series Binder',
    'Starlight Card Series Binder',
    'Starlight Card Gallery',
    'Starlight Cards Gallery',
    'Card Binder'
  ]),
  checklist: Object.freeze([
    'My Checklist',
    'Checklist',
    'Star Registry'
  ]),
  quests: Object.freeze([
    'Collection Quests',
    'Starlight Missions'
  ]),
  'season-pass': Object.freeze([
    'Seasonal Collection Pass',
    'Season Pass'
  ]),
  redeem: Object.freeze([
    'Redeem A Code'
  ]),
  'star-bits': Object.freeze([
    'Star Bits',
    'Star Bits Exchange'
  ]),
  events: Object.freeze([
    'Starlight Events',
    '✨ Starlight Events'
  ]),
  trades: Object.freeze([
    'My Wishlist',
    'Card Exchange',
    'Wishlist & Trades',
    'Trading',
    'Trading Hub',
    'Trade With Others',
    'Trade Offers',
    '🤝 Trade With Others'
  ]),
  rankings: Object.freeze([
    'User Rankings'
  ]),
  profile: Object.freeze([
    'Profile & Settings',
    'My Journal',
    'Journal'
  ]),
  feed: Object.freeze([
    'Pull Feed',
    'LIVE Feed'
  ]),
  rewards: Object.freeze([
    'Received Gifts',
    '🎁 Received Gifts'
  ])
});

export const SHELL_LAYOUT_MODES = Object.freeze(['masthead', 'hybrid']);

export function createDefaultShellNavigation() {
  return {
    version: 4,
    brandRibbon: 'Collectible Card Hub',
    chrome: {
      layout: 'masthead',
      showLiveFeed: true
    },
    // Page chrome titles match clear navigation labels.
    pageTitles: {
      home: 'Home',
      binder: 'Card Gallery',
      collection: 'My Card Binder',
      daily: 'Free Daily Starlight Pack',
      shop: 'Card Shop',
      events: 'Events',
      redeem: 'Redeem Code',
      'star-bits': 'My Star Bits',
      checklist: 'Card Checklist',
      quests: 'Missions',
      'season-pass': 'Twitch Season Pass',
      trades: 'Trade',
      offers: 'Trade',
      rankings: 'Rankings',
      feed: 'Activity Feed',
      notifications: 'Notifications',
      rewards: 'Gifts',
      profile: 'Profile',
      about: 'About',
      socials: 'Socials',
      admin: 'Administration Hub'
    },
    sidebar: {
      sections: [
        {
          id: 'home',
          label: '',
          icon: shellNavIcon('home'),
          staffOnly: false,
          mega: false,
          items: [
            { id: 'home', label: 'Home', icon: shellNavIcon('home'), destination: 'home', enabled: true, features: [] }
          ]
        },
        {
          id: 'cards',
          label: 'Cards',
          icon: shellNavIcon('cards'),
          staffOnly: false,
          mega: true,
          items: [
            { id: 'binder', label: 'Card Gallery', icon: shellNavIcon('gallery'), destination: 'binder', enabled: true, features: ['clearSeries', 'clearCardSet'] },
            { id: 'event-cards', label: 'Event Cards', icon: shellNavIcon('events'), destination: 'binder', enabled: true, features: ['eventCards', 'clearSeries'] },
            { id: 'special-cards', label: 'Special Cards', icon: shellNavIcon('season-pass'), destination: 'binder', enabled: true, features: ['specialCards', 'clearSeries'] }
          ]
        },
        {
          id: 'collect',
          label: 'My Collection',
          icon: shellNavIcon('collection'),
          staffOnly: false,
          mega: true,
          items: [
            { id: 'collection', label: 'My Card Binder', icon: shellNavIcon('collection'), destination: 'collection', enabled: true, features: [] },
            { id: 'checklist', label: 'Card Checklist', icon: shellNavIcon('checklist'), destination: 'checklist', enabled: true, features: [] },
            { id: 'star-bits', label: 'My Star Bits', icon: starBitNavIcon(), destination: 'star-bits', enabled: true, features: [] },
            { id: 'quests', label: 'Missions', icon: shellNavIcon('missions'), destination: 'quests', enabled: true, features: [] }
          ]
        },
        {
          id: 'shop',
          label: 'Shop',
          icon: shellNavIcon('shop'),
          staffOnly: false,
          mega: true,
          items: [
            { id: 'shop', label: 'Card Shop', icon: shellNavIcon('shop'), destination: 'shop', enabled: true, features: [], className: 'shell-shop-link' },
            { id: 'season-pass', label: 'Twitch Season Pass', icon: shellNavIcon('season-pass'), destination: 'season-pass', enabled: true, features: [] },
            { id: 'redeem', label: 'Redeem Code', icon: shellNavIcon('redeem'), destination: 'redeem', enabled: true, features: [] }
          ]
        },
        {
          id: 'community',
          label: 'Community',
          icon: shellNavIcon('community'),
          staffOnly: false,
          mega: true,
          items: [
            { id: 'events', label: 'Events', icon: shellNavIcon('events'), destination: 'events', enabled: true, features: [] },
            { id: 'trades', label: 'Trade', icon: shellNavIcon('trade'), destination: 'trades', enabled: true, features: ['tradeOfferBadge'] },
            { id: 'rankings', label: 'Rankings', icon: shellNavIcon('rankings'), destination: 'rankings', enabled: true, features: [] },
            { id: 'feed', label: 'Activity Feed', icon: shellNavIcon('feed'), destination: 'feed', enabled: true, features: [] }
          ]
        },
        {
          id: 'account',
          label: 'Account',
          icon: shellNavIcon('account'),
          staffOnly: false,
          mega: false,
          mobileOnly: false,
          items: [
            { id: 'profile', label: 'Profile', icon: shellNavIcon('profile'), destination: 'profile', enabled: true, features: [] },
            { id: 'notifications', label: 'Notifications', icon: shellNavIcon('notifications'), destination: 'notifications', enabled: true, features: ['notificationBadge'] },
            { id: 'rewards', label: 'Gifts', icon: shellNavIcon('gifts'), destination: 'rewards', enabled: true, features: ['receivedGiftBadge'] }
          ]
        }
      ]
    },
    topBar: {
      quickLinks: [
        { id: 'home-top', label: 'Home', destination: 'home', enabled: true, features: [] },
        { id: 'daily-top', label: 'Free Daily Card Pack', destination: 'daily', enabled: true, features: ['dailyBadge'], className: 'shell-daily-top-link' },
        { id: 'collection-top', label: 'My Binder', destination: 'collection', enabled: true, features: [] }
      ]
    },
    accountMenu: {
      signedIn: [
        { id: 'view-profile', label: 'View My Profile', destination: 'collector', enabled: true, features: ['profileLink'] },
        { id: 'profile-settings', label: 'Profile Settings', destination: 'profile', enabled: true, features: [] },
        { id: 'notifications', label: 'Notifications', destination: 'notifications', enabled: true, features: ['notificationBadge'] },
        { id: 'sign-out', label: 'Sign Out', destination: '', enabled: true, features: ['signOut'] }
      ],
      signedOut: [
        { id: 'sign-in', label: 'Sign In', destination: '', enabled: true, features: ['signIn'] },
        { id: 'register', label: 'Register', destination: '', enabled: true, features: ['signUp'] }
      ]
    }
  };
}

export function cloneDefaultShellNavigation() {
  return structuredClone(createDefaultShellNavigation());
}
