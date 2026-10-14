import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('My Collection surfaces per-series progress with unique-card explanations', async () => {
  const [collection, app, css] = await Promise.all([
    read('docs/collection.html'),
    read('docs/js/app.js'),
    read('docs/css/pages/card-album-page.css')
  ]);

  assert.match(collection, /id="collectionSeriesProgress"/);
  assert.match(collection, /Series Progress/);
  assert.match(collection, /Extra copies do not increase progress/);
  assert.match(collection, /1 protected/);
  assert.match(app, /function buildSeriesProgressRows\(/);
  assert.match(app, /collectionSeriesProgress/);
  assert.match(app, /formatSetProgressExplanation/);
  assert.match(css, /\.card-album-series-progress/);
  assert.match(css, /prefers-contrast:\s*more/);
});
