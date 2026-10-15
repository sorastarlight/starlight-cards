import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('shared card tile module renders gallery, album, and list modes', async () => {
  const source = await read('docs/js/card-tile.js');
  assert.match(source, /renderGalleryTile/);
  assert.match(source, /renderAlbumTile/);
  assert.match(source, /renderSpreadSlot/);
  assert.match(source, /renderListTile/);
  assert.match(source, /card-gallery-item/);
  assert.match(source, /card-album-sleeve/);
  assert.match(source, /visible: false/);
  assert.match(source, /galleryCardAriaLabel/);
});

test('gallery aria labels keep mystery visuals but name locked cards by number', async () => {
  const app = await read('docs/js/app.js');
  assert.match(app, /function galleryCardAriaLabel\(card\)/);
  assert.match(app, /View uncollected card/);
  assert.match(app, /galleryCardAriaLabel,/);
});

test('binder theme config exposes registry and CSS variable hooks', async () => {
  const source = await read('docs/js/binder-theme-config.js');
  assert.match(source, /starlight-classic/);
  assert.match(source, /THEME_VARS/);
  assert.match(source, /applyThemeVars/);
  assert.match(source, /resolveThemeId/);
});

test('album binder module paginates two-page spreads', async () => {
  const source = await read('docs/js/album-binder.js');
  assert.match(source, /POCKETS_PER_PAGE = 9/);
  assert.match(source, /CARDS_PER_SPREAD = POCKETS_PER_PAGE \* 2/);
  assert.match(source, /paginateSpread/);
  assert.match(source, /renderSpreadHtml/);
  assert.match(source, /animateSpreadTurn/);
  assert.match(source, /card-album-binder-stage/);
  assert.match(source, /Pages \$\{leftPageNum\}–\$\{rightPageNum\}/);
});

test('app.js wires album spread rendering and full view open', async () => {
  const app = await read('docs/js/app.js');
  assert.match(app, /renderAlbumBinderSpread/);
  assert.match(app, /turnAlbumBinderSpread/);
  assert.match(app, /StarlightAlbumBinder/);
  assert.match(app, /getBinderOrganizeBy/);
  assert.match(app, /data-binder-customize/);
  assert.match(app, /data-album-spread/);
  assert.match(app, /initCardInteractionDelegation/);
  assert.match(app, /notifyEmbedLayoutReady/);
  assert.match(app, /openAlbumBinderCard/);
  assert.match(app, /card-album-binder/);
});

test('collection page loads spread binder modules and styles', async () => {
  const collection = await read('docs/collection.html');
  assert.match(collection, /album-binder\.js/);
  assert.match(collection, /card-album-page\.css/);
  assert.match(collection, /starlight-perspective-card\.js/);
  assert.doesNotMatch(collection, /album-binder-3d\.js/);
  assert.doesNotMatch(collection, /album-binder-3d\.css/);
  assert.match(collection, /binder-customize\.js/);
  assert.match(collection, /data-binder-customize/);
  assert.match(collection, /card-album-binder-mount/);
  assert.match(collection, /Customize Binder/);
});

test('gallery page loads shared card modules', async () => {
  const binder = await read('docs/binder.html');
  assert.match(binder, /card-tile\.js/);
  assert.match(binder, /binder-theme-config\.js/);
  assert.match(binder, /card-png-lightbox\.js/);
});

test('shell exposes a skip link to main content', async () => {
  const [binder, shellCss] = await Promise.all([
    read('docs/binder.html'),
    read('docs/css/app-shell.css')
  ]);
  assert.match(binder, /class="shell-skip-link"[^>]*href="#main-content"/);
  assert.match(binder, /id="main-content"/);
  assert.match(shellCss, /\.shell-skip-link:focus/);
});

test('card click opens png lightbox before the analyzer', async () => {
  const [app, lightbox] = await Promise.all([
    read('docs/js/app.js'),
    read('docs/js/card-png-lightbox.js')
  ]);
  assert.match(app, /openPngLightbox\('gallery'\)|openPngLightbox\('filtered'\)/);
  assert.match(app, /openPngLightbox\('album'\)|openPngLightbox\('collection'\)/);
  assert.match(app, /window\.applyStarlightSeriesFilter/);
  assert.match(app, /supportsHolo/);
  assert.match(lightbox, /openCardPngLightbox|function open\(/);
  assert.match(lightbox, /Details|data-png-details/);
  assert.match(lightbox, /data-png-holo/);
  assert.match(lightbox, /starlight-png-lightbox/);
  assert.match(lightbox, /stopPropagation/);
  assert.match(lightbox, /ArrowLeft|ArrowRight/);
  assert.match(lightbox, /lightboxFocusable|event\.key !== 'Tab'/);
  assert.match(lightbox, /event\.shiftKey/);
  const lightboxCss = await read('docs/css/card-png-lightbox.css');
  assert.match(lightboxCss, /z-index:\s*10050/);
  assert.match(lightboxCss, /max-width:\s*min\(100%,\s*340px\)/);
});
