import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const read = relative => readFile(new URL(`../${relative}`, import.meta.url), 'utf8');

function loadPerspectiveModule(source) {
  const context = {
    window: {},
    document: {
      querySelectorAll() { return []; }
    },
    matchMedia() { return { matches: false }; },
    requestAnimationFrame() { return 1; },
    cancelAnimationFrame() {}
  };
  context.window = context;
  context.global = context;
  vm.runInNewContext(source, context, { filename: 'starlight-perspective-card.js' });
  return context.StarlightPerspectiveCard;
}

test('perspective card module resolves effect styles and builds opt-in markup', async () => {
  const source = await read('docs/js/starlight-perspective-card.js');
  const api = loadPerspectiveModule(source);

  assert.equal(api.resolveEffectStyle({}), null);
  assert.equal(api.resolveEffectStyle({ effectStyle: 'none' }), null);
  assert.equal(api.resolveEffectStyle({ effectStyle: 'shine' }), 'shine');
  assert.equal(api.resolveEffectStyle({ effectStyle: 'special-art' }), 'special-art');
  assert.equal(api.resolveEffectIntensity({}), 65);
  assert.equal(api.resolveEffectIntensity({ effectIntensity: 120 }), 100);
  assert.equal(api.hasPremiumPerspective({ effectStyle: 'legendary' }), true);
  assert.equal(api.hasPremiumPerspective({ holographic: 'Y' }), false);

  const markup = api.buildPerspectiveCardMarkup({
    imageUrl: 'cards/012.png',
    alt: 'Demo',
    effectStyle: 'special-art',
    effectIntensity: 75
  });
  assert.match(markup, /data-perspective-card/);
  assert.match(markup, /starlight-perspective-card/);
  assert.match(markup, /starlight-card__transformer/);
  assert.match(markup, /starlight-card-shine/);
  assert.match(markup, /starlight-card__sparkles/);
  assert.match(markup, /data-effect-intensity="75"/);

  const shineMarkup = api.buildPerspectiveCardMarkup({
    imageUrl: 'cards/001.png',
    alt: 'Shine',
    effectStyle: 'shine',
    effectIntensity: 50
  });
  assert.match(shineMarkup, /starlight-effect-shine/);
  assert.doesNotMatch(shineMarkup, /starlight-card__sparkles/);

  const plain = api.cardArtMarkup({ id: 'x', name: 'Plain' }, { imageUrl: 'cards/001.png', alt: 'Plain' });
  assert.doesNotMatch(plain, /data-perspective-card/);
  assert.match(plain, /<img/);
  assert.match(plain, /data-fallback-src=/);
  assert.match(plain, /onerror=/);
  assert.match(markup, /data-fallback-src=/);
  assert.equal(typeof api.bindImageFallback, 'function');
});

test('binder and reveal surfaces integrate premium card art helpers', async () => {
  const [app, reveal, perspectiveCss, galleryPageCss, albumPageCss, styleCss, cards] = await Promise.all([
    read('docs/js/app.js'),
    read('docs/js/reward-reveal.js'),
    read('docs/css/starlight-perspective-card.css'),
    read('docs/css/pages/card-gallery-page.css'),
    read('docs/css/pages/card-album-page.css'),
    read('docs/css/style.css'),
    read('docs/data/cards.json')
  ]);

  assert.match(app, /function perspectiveArt\(/);
  assert.match(app, /scanPerspectiveCardsIn/);
  assert.match(app, /card-gallery-grid/);
  assert.match(app, /flashGalleryFilterTransition/);
  assert.match(app, /card-album-slot/);
  assert.match(reveal, /mountCardArt/);
  assert.match(reveal, /effectStyle/);
  assert.match(perspectiveCss, /perspective: 600px/);
  assert.match(perspectiveCss, /prefers-reduced-motion: reduce/);
  assert.match(perspectiveCss, /\.starlight-effect-shine/);
  assert.match(galleryPageCss, /\.card-gallery-grid/);
  assert.match(albumPageCss, /\.card-album-slot/);
  assert.match(styleCss, /starlight-gallery\.css/);
  assert.match(cards, /"effectStyle": "special-art"/);
});

test('card catalog service exposes premium effect fallback merge hooks', async () => {
  const source = await read('docs/js/card-catalog-service.js');
  assert.match(source, /CACHE_VERSION = 3/);
  assert.match(source, /mergeFallbackCardEffects/);
  assert.match(source, /effect_style/);
});

test('premium effects migration adds catalog columns and seeds s01-012', async () => {
  const migration = await read('supabase/migrations/20260724180000_card_premium_effects.sql');
  assert.match(migration, /effect_style/);
  assert.match(migration, /effect_intensity/);
  assert.match(migration, /get_public_card_catalog_v1/);
  assert.match(migration, /admin_save_card_v90/);
  assert.match(migration, /s01-012/);
  assert.match(migration, /special-art/);
});

test('shine gallery migration extends effect style constraint', async () => {
  const migration = await read('supabase/migrations/20260724190000_card_effect_shine_gallery.sql');
  assert.match(migration, /'shine'/);
  assert.match(migration, /admin_save_card_v90/);
});
