/**
 * Presentation helpers for Collector XP, Star Bits, and Season Pass.
 * Copy mirrors server rules — do not invent economy values here.
 */

import { levelFromPoints } from './collector-level.js';
import { LEVEL_AVATAR_FRAME_UNLOCKS } from './avatar-frame-utils.js';

/** XP awarded per card quantity gained (matches award_collector_xp_from_card_quantity). */
export const COLLECTOR_XP_PER_CARD = Object.freeze({
  Common: 1,
  Uncommon: 2,
  Rare: 5,
  Epic: 15,
  Legendary: 50
});

/**
 * Soft-capped season scoring (matches compute_season_points).
 * pointsEach × min(count, cap) contributes to season points.
 */
export const SEASON_POINT_SOURCES = Object.freeze([
  { key: 'boosterOpens', label: 'Booster opens', pointsEach: 10, cap: 20 },
  { key: 'trades', label: 'Trades', pointsEach: 25, cap: 10 },
  { key: 'giftsSent', label: 'Gifts sent', pointsEach: 30, cap: 10 },
  { key: 'seriesComplete', label: 'Series completed', pointsEach: 100, cap: 5 },
  { key: 'favorites', label: 'Favorited cards', pointsEach: 5, cap: 20 },
  { key: 'visitDays', label: 'Active days', pointsEach: 15, cap: 30 }
]);

export const COLLECTOR_XP_SUMMARY =
  'Collector XP is lifetime progress from cards you earn. It never decreases when you convert extras or spend Star Bits.';

export function collectorXpRatesLine() {
  return Object.entries(COLLECTOR_XP_PER_CARD)
    .map(([rarity, xp]) => `${rarity} ${xp}`)
    .join(' · ');
}

export const STAR_BITS_SUMMARY =
  'Star Bits are a spendable balance. Convert only extra copies (one of each card stays protected), then spend them in the Card Shop. Missions, gifts, and season rewards can also grant Star Bits.';

export const SEASON_PASS_SUMMARY =
  'Season points are separate from Collector XP and Star Bits. They reset each season and unlock timed tier rewards while the season is active.';

export function nextAvatarFrameUnlock(xp) {
  const points = Math.max(0, Number(xp) || 0);
  return LEVEL_AVATAR_FRAME_UNLOCKS.find((entry) => entry.minXp > points) || null;
}

export function describeCollectorProgress(xp) {
  const progress = levelFromPoints(xp);
  const toNextLevel = Math.max(0, progress.next - progress.xp);
  const nextFrame = nextAvatarFrameUnlock(progress.xp);
  const nextLevelLabel = `Lv. ${progress.level + 1}`;
  const milestone = toNextLevel > 0
    ? `${toNextLevel.toLocaleString()} XP to ${nextLevelLabel}`
    : `Lv. ${progress.level}`;
  const unlockHint = nextFrame
    ? `Next avatar frame unlocks at ${nextFrame.minXp.toLocaleString()} XP.`
    : 'Binder colors and avatar frames unlock as you level up.';

  return {
    ...progress,
    toNextLevel,
    nextLevelLabel,
    nextFrame,
    milestone,
    unlockHint,
    summary: COLLECTOR_XP_SUMMARY
  };
}

export function nextSeasonTier(points, tiers = []) {
  const score = Math.max(0, Number(points) || 0);
  const ordered = (Array.isArray(tiers) ? tiers : [])
    .slice()
    .sort((a, b) => (Number(a.pointsRequired) || 0) - (Number(b.pointsRequired) || 0));
  const claimable = ordered.find((tier) =>
    !tier.claimed && (tier.unlocked || score >= (Number(tier.pointsRequired) || 0))
  );
  if (claimable) {
    return {
      kind: 'claimable',
      tier: claimable,
      pointsNeeded: 0,
      label: `Ready to claim: ${claimable.label || 'season reward'}`
    };
  }
  const next = ordered.find((tier) => !tier.claimed && score < (Number(tier.pointsRequired) || 0));
  if (!next) {
    return {
      kind: 'complete',
      tier: null,
      pointsNeeded: 0,
      label: 'All season tiers reached'
    };
  }
  const required = Number(next.pointsRequired) || 0;
  const needed = Math.max(0, required - score);
  return {
    kind: 'next',
    tier: next,
    pointsNeeded: needed,
    label: `${needed.toLocaleString()} points to ${next.label || 'next tier'} (${required.toLocaleString()} total)`
  };
}

export function seasonPointsHowTo() {
  return SEASON_POINT_SOURCES
    .map((source) => `${source.label}: ${source.pointsEach} pts each (up to ${source.cap})`)
    .join(' · ');
}

export function formatSeasonEligibility({ hasAccess, accessRequired, twitchLinked } = {}) {
  if (accessRequired === 'twitch_subscribers') {
    if (hasAccess) {
      return 'Eligible: Twitch subscriber Season Pass is active for this season.';
    }
    if (twitchLinked) {
      return 'Requires an active Twitch subscription unlock gift before tier claims open.';
    }
    return 'Requires a linked Twitch account and subscriber unlock for this season.';
  }
  return 'Open to signed-in collectors for this season.';
}
