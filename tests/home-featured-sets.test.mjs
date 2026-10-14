import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('home wires featured sets from the live card catalog', async () => {
  const html = await readFile(new URL('../docs/home.html', import.meta.url), 'utf8');
  const js = await readFile(new URL('../docs/js/home-featured-sets.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../docs/css/pages/home.css', import.meta.url), 'utf8');

  assert.match(html, /id="homeFeaturedSets"/);
  assert.match(html, /home-featured-sets\.js\?v=/);
  assert.match(html, /Featured sets/);
  assert.match(js, /fetchFreshCardCatalog/);
  assert.match(js, /getCachedCardCatalog/);
  assert.match(js, /Browse set/);
  assert.doesNotMatch(js, /lorem|placeholder card/i);
  assert.match(css, /\.st-home-set-grid/);
  assert.match(css, /\.st-home-set__thumb/);
});
