import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  COLLECTOR_XP_PER_CARD,
  COLLECTOR_XP_SUMMARY,
  SEASON_PASS_SUMMARY,
  SEASON_POINT_SOURCES,
  STAR_BITS_SUMMARY,
  collectorXpRatesLine,
  describeCollectorProgress,
  formatSeasonEligibility,
  nextSeasonTier,
  seasonPointsHowTo
} from '../docs/js/progression-clarity.js';

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('collector XP rates match the award trigger rarity table', () => {
  assert.deepEqual(COLLECTOR_XP_PER_CARD, {
    Common: 1,
    Uncommon: 2,
    Rare: 5,
    Epic: 15,
    Legendary: 50
  });
  assert.match(collectorXpRatesLine(), /Common 1 · Uncommon 2 · Rare 5 · Epic 15 · Legendary 50/);
});

test('describeCollectorProgress reports next level milestone and frame unlock', () => {
  const progress = describeCollectorProgress(20);
  assert.equal(progress.level, 1);
  assert.equal(progress.toNextLevel, 5);
  assert.match(progress.milestone, /5 XP to Lv\. 2/);
  assert.equal(progress.nextFrame?.minXp, 25);
  assert.match(progress.unlockHint, /25/);
  assert.match(progress.summary, /never decreases/i);
});

test('nextSeasonTier prefers claimable then next locked tier', () => {
  assert.equal(nextSeasonTier(30, [
    { label: 'Dawn Spark', pointsRequired: 25, unlocked: true, claimed: false, rewardStarBits: 25 },
    { label: 'Binder Ribbon', pointsRequired: 75, unlocked: false, claimed: false, rewardStarBits: 50 }
  ]).kind, 'claimable');
  assert.match(nextSeasonTier(10, [
    { label: 'Dawn Spark', pointsRequired: 25, unlocked: false, claimed: false, rewardStarBits: 25 },
    { label: 'Binder Ribbon', pointsRequired: 75, unlocked: false, claimed: false, rewardStarBits: 50 }
  ]).label, /15 points to Dawn Spark/);
  assert.equal(nextSeasonTier(400, [
    { label: 'Finale', pointsRequired: 400, unlocked: true, claimed: true }
  ]).kind, 'complete');
});

test('season point sources mirror compute_season_points soft caps', () => {
  assert.deepEqual(
    SEASON_POINT_SOURCES.map((row) => [row.key, row.pointsEach, row.cap]),
    [
      ['boosterOpens', 10, 20],
      ['trades', 25, 10],
      ['giftsSent', 30, 10],
      ['seriesComplete', 100, 5],
      ['favorites', 5, 20],
      ['visitDays', 15, 30]
    ]
  );
  assert.match(seasonPointsHowTo(), /Booster opens: 10 pts each \(up to 20\)/);
});

test('formatSeasonEligibility distinguishes subscriber gating', () => {
  assert.match(
    formatSeasonEligibility({ hasAccess: true, accessRequired: 'twitch_subscribers' }),
    /subscriber/i
  );
  assert.match(
    formatSeasonEligibility({ hasAccess: false, accessRequired: 'twitch_subscribers', twitchLinked: false }),
    /linked Twitch/i
  );
  assert.match(formatSeasonEligibility({ accessRequired: 'all' }), /signed-in/i);
});

test('collection, star bits, and season pass surfaces wire progression clarity', async () => {
  const [collection, dashboard, starBitsHtml, starBitsPage, seasonHtml, seasonPage, clarity] = await Promise.all([
    read('docs/collection.html'),
    read('docs/js/site-dashboard.js'),
    read('docs/star-bits.html'),
    read('docs/js/pages/star-bits-page.js'),
    read('docs/season-pass.html'),
    read('docs/js/pages/season-pass-page.js'),
    read('docs/js/progression-clarity.js')
  ]);

  assert.match(collection, /data-level-milestone/);
  assert.match(collection, /data-level-progress/);
  assert.match(collection, /Set completion/);
  assert.match(dashboard, /describeCollectorProgress/);
  assert.match(dashboard, /paintCollectorProgress/);
  assert.match(starBitsHtml, /bits-clarity/);
  assert.match(starBitsHtml, /Current Balance/);
  assert.match(starBitsPage, /STAR_BITS_SUMMARY/);
  assert.match(seasonPage, /nextSeasonTier/);
  assert.match(seasonPage, /seasonPointsHowTo/);
  assert.match(seasonPage, /SEASON_PASS_SUMMARY/);
  assert.match(seasonPage, /Sign in to view season progress/);
  assert.match(seasonPage, /supabase\.auth\.getUser/);
  assert.match(seasonHtml, /season-pass-page\.js\?v=2\.6/);
  assert.match(clarity, /Collector XP is lifetime/);
  assert.match(clarity, /Star Bits are a spendable balance/);
  assert.match(clarity, /Season points are separate/);
});
