import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  frameHrefMatchesRouteSrc,
  readShellViewState,
  shouldAcceptEmbeddedHandshake,
  shouldAcceptEmbeddedReady,
  shouldReenterLoadingOnFrameLoad
} from '../docs/js/shell-view-readiness.js';

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const origin = 'https://cards.sorastarlight.net';
const iframeWindow = { id: 'iframe' };
const otherWindow = { id: 'other' };

test('ready followed by late load must not re-enter loading overlay', () => {
  assert.equal(
    shouldReenterLoadingOnFrameLoad({
      frameHref: `${origin}/login?embed=1&shellLoad=100`,
      frameSrcAttr: null,
      viewState: 'ready'
    }),
    false
  );
  assert.equal(
    shouldReenterLoadingOnFrameLoad({
      frameHref: `${origin}/daily-booster.html?embed=1&shellLoad=100`,
      frameSrcAttr: '',
      viewState: 'loading'
    }),
    false
  );
  assert.equal(
    shouldReenterLoadingOnFrameLoad({
      frameHref: 'about:blank',
      frameSrcAttr: null,
      viewState: 'loading'
    }),
    false
  );
});

test('rapid navigation rejects stale readiness from a previous route or load token', () => {
  assert.equal(
    shouldAcceptEmbeddedReady({
      messageView: 'login',
      messageLoadToken: '1',
      currentRoute: 'daily',
      currentLoadToken: '2'
    }),
    false,
    'previous route ready must not clear the new route'
  );

  assert.equal(
    shouldAcceptEmbeddedReady({
      messageView: 'daily',
      messageLoadToken: '1',
      currentRoute: 'daily',
      currentLoadToken: '2'
    }),
    false,
    'stale same-route shellLoad must not mark the newer navigation ready'
  );

  assert.equal(
    shouldAcceptEmbeddedReady({
      messageView: 'daily',
      messageLoadToken: '2',
      currentRoute: 'daily',
      currentLoadToken: '2'
    }),
    true,
    'current document ready is accepted'
  );

  assert.equal(
    shouldAcceptEmbeddedReady({
      messageView: 'trades',
      messageLoadToken: '9',
      currentRoute: 'rankings',
      currentLoadToken: '9',
      shareSrc: true
    }),
    true,
    'shared embedded src (trades/rankings) may announce under either view'
  );
});

test('handshake validates origin, iframe source, route, load token, and frame href', () => {
  const base = {
    origin,
    expectedOrigin: origin,
    source: iframeWindow,
    expectedSource: iframeWindow,
    messageView: 'daily',
    messageLoadToken: '42',
    currentRoute: 'daily',
    currentLoadToken: '42',
    frameHref: `${origin}/daily-booster.html?embed=1&shellLoad=42`,
    routeSrc: 'daily-booster.html'
  };

  assert.equal(shouldAcceptEmbeddedHandshake(base), true);

  assert.equal(
    shouldAcceptEmbeddedHandshake({ ...base, origin: 'https://evil.example' }),
    false,
    'foreign origin rejected'
  );
  assert.equal(
    shouldAcceptEmbeddedHandshake({ ...base, source: otherWindow }),
    false,
    'non-iframe source rejected'
  );
  assert.equal(
    shouldAcceptEmbeddedHandshake({ ...base, messageView: 'login' }),
    false,
    'wrong route rejected'
  );
  assert.equal(
    shouldAcceptEmbeddedHandshake({ ...base, messageLoadToken: '99' }),
    false,
    'wrong load token rejected'
  );
  assert.equal(
    shouldAcceptEmbeddedHandshake({
      ...base,
      frameHref: `${origin}/login?embed=1&shellLoad=42`
    }),
    false,
    'iframe document must match the shell route src'
  );
});

test('cached old embed without loadToken can still finish; mismatched combos stay recoverable', () => {
  // New shell + legacy embed ready (no loadToken): view match is enough to clear loading.
  assert.equal(
    shouldAcceptEmbeddedHandshake({
      origin,
      expectedOrigin: origin,
      source: iframeWindow,
      expectedSource: iframeWindow,
      messageView: 'login',
      messageLoadToken: '',
      currentRoute: 'login',
      currentLoadToken: '77',
      frameHref: `${origin}/login?embed=1&shellLoad=77`,
      routeSrc: 'login'
    }),
    true,
    'legacy missing token still accepted when view + frame src match'
  );

  // Late load never recreates an endless overlay after ready.
  assert.equal(
    shouldReenterLoadingOnFrameLoad({
      frameHref: `${origin}/login?embed=1&shellLoad=77`,
      viewState: 'ready'
    }),
    false
  );

  // Extensionless production daily URL still matches daily-booster.html route src.
  assert.equal(frameHrefMatchesRouteSrc(`${origin}/daily-booster?embed=1`, 'daily-booster.html'), true);
  assert.equal(frameHrefMatchesRouteSrc(`${origin}/daily-booster.html?embed=1`, 'daily-booster.html'), true);
  assert.equal(frameHrefMatchesRouteSrc(`${origin}/login?embed=1`, 'login'), true);
  assert.equal(frameHrefMatchesRouteSrc('about:blank', 'daily-booster.html'), false);
});

test('readShellViewState mirrors frame wrap loading/error/ready classes', () => {
  const loading = {
    classList: { contains: (name) => name === 'is-loading' },
    querySelector: () => ({ hidden: false, dataset: { state: 'loading' } })
  };
  const ready = {
    classList: { contains: () => false },
    querySelector: () => ({ hidden: true, dataset: { state: 'ready' } })
  };
  const errored = {
    classList: { contains: (name) => name === 'has-error' },
    querySelector: () => ({ hidden: false, dataset: { state: 'error' } })
  };
  assert.equal(readShellViewState(loading), 'loading');
  assert.equal(readShellViewState(ready), 'ready');
  assert.equal(readShellViewState(errored), 'error');
});

test('shell wires handshake helpers, timeout error recovery, and keeps production daily .html src', async () => {
  const [shell, binder, readiness] = await Promise.all([
    read('docs/js/app-shell.js'),
    read('docs/binder.html'),
    read('docs/js/shell-view-readiness.js')
  ]);

  assert.match(shell, /from '\.\/shell-view-readiness\.js'/);
  assert.match(shell, /shouldAcceptEmbeddedHandshake/);
  assert.match(shell, /acceptEmbeddedHandshake/);
  assert.match(shell, /shouldReenterLoadingOnFrameLoad/);
  assert.match(shell, /handleEmbeddedLoadFailure/);
  assert.match(shell, /armReadyTimeout/);
  assert.match(shell, /setViewState\('error'\)/);
  assert.match(shell, /VIEW_READY_TIMEOUT_MS/);
  assert.match(shell, /markViewReady\(data, e\)/);
  assert.match(shell, /restoredSameRoute/);
  assert.match(shell, /starlight-shell-request-ready/);
  assert.match(shell, /daily:\{title:'Free Daily Starlight Pack',src:'daily-booster\.html'\}/);
  assert.match(shell, /login:\{title:'Sign In',src:'login'\}/);
  assert.match(binder, /app-shell\.js\?v=1\.8\.9/);

  assert.match(readiness, /shouldAcceptEmbeddedHandshake/);
  assert.match(readiness, /frameHrefMatchesRouteSrc/);
  assert.match(readiness, /shouldReenterLoadingOnFrameLoad/);
  assert.match(await read('docs/js/embed-mode.js'), /starlight-shell-request-ready/);

  const loadHandler = shell.match(/frame\?\.addEventListener\('load',\(\)=>\{[\s\S]*?\n\}\);/);
  assert.ok(loadHandler, 'iframe load listener present');
  assert.match(loadHandler[0], /shouldReenterLoadingOnFrameLoad/);
});
