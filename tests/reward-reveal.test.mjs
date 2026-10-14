import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';

import {
  createRevealStackLayout,
  normalizeRevealCard,
  normalizeRevealOptions,
  REVEAL_PRESENTATION_VERSION,
  revealSfxForRarity,
  setSoundEffectsEnabled,
  soundEffectsEnabled,
  summarizeRevealCards
} from '../docs/js/reward-reveal.js';

function normalizeMotionContract(stylesheet) {
  const animationRules = [...stylesheet.matchAll(/([^{}]+)\{([^{}]*\banimation(?:-[a-z-]+)?\s*:[^{}]*)\}/g)]
    .map(match => `${match[1]}{${match[2]}}`.replace(/\s+/g, ' ').trim());
  const keyframes = [];
  const keyframePattern = /@keyframes stR3[A-Za-z0-9]+\s*\{/g;
  let match;

  while ((match = keyframePattern.exec(stylesheet))) {
    let depth = 0;
    let end = match.index;
    for (; end < stylesheet.length; end += 1) {
      if (stylesheet[end] === '{') depth += 1;
      if (stylesheet[end] === '}') depth -= 1;
      if (depth === 0 && end > match.index) break;
    }
    keyframes.push(stylesheet.slice(match.index, end + 1).replace(/\s+/g, ' ').trim());
    keyframePattern.lastIndex = end + 1;
  }

  return [...animationRules, ...keyframes].join('\n');
}

test('normalizes snake_case reward cards into the canonical reveal shape', () => {
  const card = normalizeRevealCard({
    card_id: 42,
    card_name: 'Moonlight Sora',
    image_url: '/cards/moonlight.png',
    rarity_name: 'LEGENDARY',
    category_name: 'event_cards',
    subcategory_id: 'summer-2026',
    finish_id: 'holographic',
    finish_name: 'Holographic',
    is_duplicate: 1,
    quantity: 12
  });

  assert.equal(card.id, 42);
  assert.equal(card.name, 'Moonlight Sora');
  assert.equal(card.imageUrl, '/cards/moonlight.png');
  assert.equal(card.rarity, 'legendary');
  assert.equal(card.categoryName, 'Event Cards');
  assert.equal(card.subcategoryName, 'Summer 2026');
  assert.equal(card.finishId, 'holographic');
  assert.equal(card.finishName, 'Holographic');
  assert.equal(card.isDuplicate, true);
  assert.equal(card.quantity, 12);
});

test('fills missing finish metadata from the cached card catalog when available', () => {
  const key = 'sora-starlight-card-binder-v86-supabase-card-catalog';
  const previous = globalThis.localStorage?.getItem?.(key);
  const storage = {
    getItem(name) {
      if (name !== key) return null;
      return JSON.stringify({
        version: 2,
        cards: [{ id: 's01-012', finishId: 'holographic', finishName: 'Holographic' }]
      });
    }
  };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage
  });

  try {
    const card = normalizeRevealCard({
      id: 's01-012',
      name: 'Rising Star Card 012',
      rarity: 'Legendary',
      image_url: '/cards/012.png'
    });
    assert.equal(card.finishId, 'holographic');
    assert.equal(card.finishName, 'Holographic');
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => previous } });
  }
});

test('normalizes reveal option aliases and supplies the canonical card back', () => {
  const snakeCase = normalizeRevealOptions({
    booster_name: 'Daily Booster',
    pack_image_url: '/packs/daily.png',
    card_back_url: '/cards/back.png'
  });

  assert.deepEqual(snakeCase, {
    title: 'Daily Booster',
    packImageUrl: '/packs/daily.png',
    cardBackUrl: '/cards/back.png',
    autoOpen: false,
    presentationMode: 'claim'
  });

  assert.equal(normalizeRevealOptions({ presentationMode: 'replay' }).presentationMode, 'replay');
  assert.match(normalizeRevealOptions({}).cardBackUrl, /StarlightCard_Back_NewLogo\.png$/);
});

test('builds one deterministic stack position per awarded card', () => {
  const layout = createRevealStackLayout(12);

  assert.equal(layout.length, 12);
  assert.deepEqual(layout[0], { depth: 0, x: 0, y: 0, rotation: 0, zIndex: 12 });
  assert.equal(layout[7].depth, 7);
  assert.equal(layout[11].depth, 7);
  assert.equal(layout[11].zIndex, 1);
});

test('summarizes new and duplicate cards for the result screen', () => {
  assert.deepEqual(summarizeRevealCards([
    { id: 'new', name: 'New Card' },
    { id: 'duplicate', name: 'Duplicate Card', is_duplicate: true },
    { id: 'new-again', name: 'Another New Card', isDuplicate: false }
  ]), { total: 3, newCards: 2, duplicates: 1 });
});

test('maps each reveal rarity to its dedicated sound tier', () => {
  assert.equal(revealSfxForRarity('LEGENDARY'), 'legendary');
  assert.equal(revealSfxForRarity('epic'), 'epic');
  assert.equal(revealSfxForRarity('not-a-rarity'), 'common');
});

test('keeps every configured reveal sound available as a non-empty asset', async () => {
  const files = [
    'Reveal_01_Common.wav',
    'Reveal_02_Uncommon.wav',
    'Reveal_03_Rare.wav',
    'Reveal_04_Epic.wav',
    'Reveal_05_Legendary.wav',
    'Reveal_Results_01.wav'
  ];

  const assets = await Promise.all(files.map(file => stat(
    new URL(`../docs/site_assets/sfx/${file}`, import.meta.url)
  )));
  assets.forEach(asset => assert.ok(asset.size > 44));
});

test('uses one deliberate pack, pile, and card motion system with reduced-motion support', async () => {
  const [script, stylesheet] = await Promise.all([
    readFile(new URL('../docs/js/reward-reveal.js', import.meta.url), 'utf8'),
    readFile(new URL('../docs/css/reward-reveal.css', import.meta.url), 'utf8')
  ]);

  assert.doesNotMatch(script, /\bsetTimeout\b|\bsr931\b/);
  assert.match(script, /new win\.Audio\(source\)/);
  assert.match(script, /booster-open\.wav/);
  assert.match(script, /Reveal_01_Common\.wav/);
  assert.match(script, /Reveal_02_Uncommon\.wav/);
  assert.match(script, /Reveal_03_Rare\.wav/);
  assert.match(script, /Reveal_04_Epic\.wav/);
  assert.match(script, /Reveal_05_Legendary\.wav/);
  assert.match(script, /Reveal_Results_01\.wav/);
  assert.match(script, /const showResults = \(\) => \{[\s\S]*playRevealSound\(win, 'results', activeAudio\)/);
  assert.match(script, /sora-starlight-card-binder-v7-sfx/);
  assert.match(stylesheet, /@keyframes stR3PackTop/);
  assert.match(stylesheet, /@keyframes stR3PackBottom/);
  assert.match(stylesheet, /@keyframes stR3CardRise/);
  assert.match(stylesheet, /@keyframes stR3CardSpin/);
  assert.match(stylesheet, /@keyframes stR3LegendaryRise/);
  assert.match(stylesheet, /@keyframes stR3LegendarySpin/);
  assert.match(stylesheet, /@keyframes stR3CuteBackdropFloat/);
  assert.match(stylesheet, /@keyframes stR3PileArrive/);
  assert.match(stylesheet, /@keyframes stR3ResultCardEnter/);
  assert.match(stylesheet, /@keyframes stR3ResultsGlow/);
  assert.match(stylesheet, /@keyframes stR3DetailsEnter/);
  assert.match(stylesheet, /@media \(prefers-reduced-motion: reduce\)/);
});

test('locks the approved reveal presentation and motion baseline', async () => {
  const stylesheet = await readFile(new URL('../docs/css/reward-reveal.css', import.meta.url), 'utf8');
  const contractHash = createHash('sha256').update(normalizeMotionContract(stylesheet)).digest('hex');

  assert.equal(REVEAL_PRESENTATION_VERSION, '1.5.21');
  assert.match(stylesheet, /Approved reveal presentation baseline: v1\.5\.21/);
  assert.equal(contractHash, '15a418208b0fe1d208ab050955c7254722d2e80a884d84a92ac57ef2af6c8377');
  assert.match(stylesheet, /\.st-r3-overlay\.is-embed-anchored/);
  assert.match(stylesheet, /\.st-r3-skip-bar/);
  assert.match(stylesheet, /\.st-r3-skip-btn/);
});

test('keeps the fixed-center reveal lightweight and progressively loads artwork', async () => {
  const [script, stylesheet] = await Promise.all([
    readFile(new URL('../docs/js/reward-reveal.js', import.meta.url), 'utf8'),
    readFile(new URL('../docs/css/reward-reveal.css', import.meta.url), 'utf8')
  ]);

  assert.match(script, /defer:\s*true/);
  assert.match(script, /createDocumentFragment\(\)/);
  assert.match(script, /prepareCurrentCard\(\)/);
  assert.match(script, /const visibleLayers = Math\.min\(remaining, MAX_PILE_LAYERS\)/);
  assert.match(script, /setPhase\('returning'\)/);
  assert.match(script, /overlay\.dataset\.phase = nextPhase/);
  assert.match(script, /acquireRevealViewportLock\(doc\)/);
  assert.match(script, /setProperty\('overflow-x', 'hidden', 'important'\)/);
  assert.match(script, /releaseViewportLock\(\)/);
  assert.match(script, /showPile\(\{ fromPack: true \}\)/);
  assert.match(script, /resultsScene\.addEventListener\('click'[\s\S]*event\.target\.closest\('\.st-r3-result-card, \.st-r3-results-heading, \.st-r3-done'\)[\s\S]*close\('results-backdrop'\)/);
  assert.match(script, /computedMotionDuration\(element, win\)/);
  assert.match(script, /waitForFrames\(win, computedMotionDuration/);
  assert.match(stylesheet, /\.st-r3-overlay[\s\S]*position: fixed !important;/);
  assert.match(stylesheet, /\.st-r3-card-actor[\s\S]*top: 50%;[\s\S]*left: 50%;/);
  assert.match(stylesheet, /\.st-r3-pile-button[\s\S]*top: 50%;[\s\S]*left: 50%;/);
  assert.match(stylesheet, /\.st-r3-overlay[\s\S]*rgba\(255, 246, 252, 0\.26\)[\s\S]*blur\(14px\)/);
  assert.match(stylesheet, /\.st-r3-reveal-open[\s\S]*overflow-x:\s*hidden !important[\s\S]*overflow-y:\s*hidden !important[\s\S]*scrollbar-width:\s*none !important/);
  assert.match(stylesheet, /\.st-r3-reveal-open::-webkit-scrollbar[\s\S]*display:\s*none !important/);
  assert.match(stylesheet, /\.st-r3-header-copy[\s\S]*clip-path:\s*inset\(50%\)/);
  assert.match(stylesheet, /@keyframes stR3CuteBackdropFloat/);
  assert.match(stylesheet, /@keyframes stR3CuteParticlesDrift/);
  assert.match(stylesheet, /@keyframes stR3PackHover/);
  assert.match(stylesheet, /@keyframes stR3PackPortalOrbit/);
  assert.match(stylesheet, /@keyframes stR3PackPortalPulse/);
  assert.match(stylesheet, /\.st-r3-pack-art[\s\S]*box-shadow: none/);
  assert.doesNotMatch(stylesheet, /width:\s*100vw\s*!important/);
  assert.match(stylesheet, /\.st-r3-badge\.rarity-common[^}]*#f6f7fb[^}]*#cfd6df/);
  assert.match(stylesheet, /\.st-r3-badge\.rarity-uncommon[^}]*#eaf5ff[^}]*#76bfff/);
  assert.match(stylesheet, /\.st-r3-badge\.rarity-rare[^}]*#fff0df[^}]*#ffb15c/);
  assert.match(stylesheet, /\.st-r3-badge\.rarity-epic[^}]*#ffe6f4[^}]*#ff9bd3/);
  assert.match(stylesheet, /\.st-r3-badge\.rarity-legendary[^}]*#ffe66d[^}]*#ffd21f/);
  assert.doesNotMatch(stylesheet, /stReveal|st-r3-backdrop-image|drop-shadow\(/);
  assert.match(stylesheet, /will-change: transform, opacity/);
  assert.match(stylesheet, /@keyframes stR3PileHover/);
  assert.match(stylesheet, /@keyframes stR3PileMagicPulse/);
  assert.match(stylesheet, /@keyframes stR3PileMagicRing/);
  assert.match(stylesheet, /\.st-r3-pile-scene\.is-arriving[\s\S]*stR3PileArrive/);
  assert.match(stylesheet, /\.st-r3-results[\s\S]*overflow-x:\s*hidden[\s\S]*scrollbar-width:\s*none/);
  assert.match(stylesheet, /\.st-r3-results::-webkit-scrollbar\s*\{\s*display:\s*none/);
  assert.match(stylesheet, /\.st-r3-results-grid[\s\S]*display:\s*flex[\s\S]*justify-content:\s*center[\s\S]*align-items:\s*stretch/);
  assert.match(stylesheet, /\.st-r3-result-card[\s\S]*flex:\s*0 1 168px[\s\S]*width:\s*min\(100%, 168px\)/);
  assert.match(stylesheet, /\.st-r3-result-copy[\s\S]*display:\s*flex[\s\S]*flex:\s*1[\s\S]*flex-direction:\s*column/);
  assert.match(stylesheet, /\.st-r3-result-card[\s\S]*stR3ResultCardEnter/);
  assert.match(stylesheet, /\.st-r3-results-heading[\s\S]*stR3ResultsHeadingEnter/);
});

test('keeps every production reward entry point on the canonical reveal engine', async () => {
  const consumers = await Promise.all([
    'daily-booster-page.js',
    'booster-shop-page.js',
    'received-rewards-page.js',
    'redeem-page.js'
  ].map(file => readFile(new URL(`../docs/js/pages/${file}`, import.meta.url), 'utf8')));

  consumers.forEach(source => {
    assert.match(source, /reward-reveal\.js\?v=1\.5\.21/);
    assert.match(source, /revealRewardSequence\s*\(/);
    assert.doesNotMatch(source, /@keyframes|stR3CardSpin|stR3PackTop/);
  });
});

test('offers Reveal All and Skip as presentation-only shortcuts to results', async () => {
  const script = await readFile(new URL('../docs/js/reward-reveal.js', import.meta.url), 'utf8');

  assert.match(script, /st-r3-skip-bar/);
  assert.match(script, /Reveal All/);
  assert.match(script, /Skip to results/);
  assert.match(script, /Presentation-only shortcut[^\n]*never awards inventory[\s\S]*const skipToResults = async/);
  assert.doesNotMatch(script, /skipToResults[\s\S]{0,400}\b(open_daily_booster|grant|insert|upsert|rpc\()/);
  assert.match(script, /revealAllButton\.addEventListener\('click'[\s\S]*skipToResults/);
  assert.match(script, /skipButton\.addEventListener\('click'[\s\S]*skipToResults/);
  assert.match(script, /skipBar\.hidden = !canSkip \|\| rewards\.length <= 1/);
  assert.match(script, /index = rewards\.length;[\s\S]*showResults\(\)/);
});

test('persists in-reveal sound mute without touching inventory APIs', () => {
  const store = new Map();
  const win = {
    localStorage: {
      getItem(key) {
        return store.has(key) ? store.get(key) : null;
      },
      setItem(key, value) {
        store.set(key, String(value));
      }
    }
  };

  assert.equal(soundEffectsEnabled(win), true);
  setSoundEffectsEnabled(win, false);
  assert.equal(soundEffectsEnabled(win), false);
  assert.equal(store.get('sora-starlight-card-binder-v7-sfx'), 'off');
  setSoundEffectsEnabled(win, true);
  assert.equal(soundEffectsEnabled(win), true);
});

test('surfaces Reveal All under prefers-reduced-motion without granting inventory', async () => {
  const script = await readFile(new URL('../docs/js/reward-reveal.js', import.meta.url), 'utf8');
  assert.match(script, /prefers-reduced-motion: reduce/);
  assert.match(script, /Reduced motion is on/);
  assert.match(script, /prefersReducedMotion && rewards\.length > 1/);
  assert.doesNotMatch(script, /prefersReducedMotion[\s\S]{0,200}\b(open_daily_booster|grant|rpc\()/);
});

test('wires a header sound toggle that only stops audio when muted', async () => {
  const [script, stylesheet] = await Promise.all([
    readFile(new URL('../docs/js/reward-reveal.js', import.meta.url), 'utf8'),
    readFile(new URL('../docs/css/reward-reveal.css', import.meta.url), 'utf8')
  ]);

  assert.match(script, /st-r3-sound/);
  assert.match(script, /setSoundEffectsEnabled\(win, sfxEnabled\)/);
  assert.match(script, /if \(!sfxEnabled\) stopAudio\(\)/);
  assert.doesNotMatch(script, /soundButton\.addEventListener[\s\S]{0,300}\b(open_daily_booster|grant|rpc\()/);
  assert.match(stylesheet, /\.st-r3-header-actions/);
  assert.match(stylesheet, /\.st-r3-sound\.is-muted/);
});

test('restores focus to the control that launched an embedded reveal', async () => {
  const script = await readFile(new URL('../docs/js/reward-reveal.js', import.meta.url), 'utf8');

  assert.match(script, /const returnFocus = sourceDocument\.activeElement/);
  assert.match(script, /returnFocus\?\.isConnected/);
  assert.match(script, /restoreFocus: false/);
});
