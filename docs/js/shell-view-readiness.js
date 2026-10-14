/**
 * Pure helpers for shell iframe loading / ready handshake isolation.
 * Keeps delayed messages from a previous route or shellLoad token from
 * clearing the current navigation's loading overlay.
 *
 * Cache compatibility: a newer shell still accepts legacy ready messages that
 * omit loadToken when the view matches, so an older cached embed page can finish
 * loading. Mismatched tokens/routes are rejected; missing ready still falls
 * through to the shell timeout → retry → recoverable error path (never endless).
 */

/**
 * @param {object} args
 * @param {string|null|undefined} args.messageView
 * @param {string|number|null|undefined} args.messageLoadToken shellLoad from the child
 * @param {string} args.currentRoute
 * @param {string|number|null|undefined} args.currentLoadToken
 * @param {boolean} [args.shareSrc] true when routes share one embedded document
 * @returns {boolean}
 */
export function shouldAcceptEmbeddedReady({
  messageView = null,
  messageLoadToken = null,
  currentRoute,
  currentLoadToken,
  shareSrc = false
} = {}) {
  const view = messageView == null || messageView === '' ? null : String(messageView);
  if (view && view !== String(currentRoute || '') && !shareSrc) {
    return false;
  }

  const token = messageLoadToken == null || messageLoadToken === ''
    ? null
    : String(messageLoadToken);
  const expected = currentLoadToken == null || currentLoadToken === ''
    ? null
    : String(currentLoadToken);

  // Stale document from a prior navigation of the same route (rapid re-entry).
  if (token && expected && token !== expected) {
    return false;
  }

  return true;
}

/**
 * True when the live iframe URL still belongs to the shell route being shown.
 * Extensionless and `.html` forms both match (GH Pages serves either).
 *
 * @param {string} frameHref
 * @param {string|null|undefined} routeSrc e.g. daily-booster.html or login
 * @returns {boolean}
 */
export function frameHrefMatchesRouteSrc(frameHref, routeSrc) {
  if (!routeSrc) return true;
  const href = String(frameHref || '');
  if (!href || href.includes('about:blank')) return false;
  try {
    const path = new URL(href, 'https://starlight.invalid').pathname.toLowerCase();
    const src = String(routeSrc).toLowerCase();
    const bare = src.replace(/\.html$/, '');
    const file = src.endsWith('.html') ? src : `${src}.html`;
    return path.endsWith(`/${bare}`)
      || path.endsWith(`/${file}`)
      || path.includes(`/${bare}.`)
      || path.endsWith(bare)
      || path.endsWith(file);
  } catch {
    return false;
  }
}

/**
 * Full handshake gate for embedded ready / height / reset messages.
 * Validates origin, iframe window source, route (+ optional shared src), load token,
 * and that the live iframe href still matches the expected route document.
 *
 * @param {object} args
 * @returns {boolean}
 */
export function shouldAcceptEmbeddedHandshake({
  origin = null,
  expectedOrigin = null,
  source = null,
  expectedSource = null,
  messageView = null,
  messageLoadToken = null,
  currentRoute,
  currentLoadToken,
  shareSrc = false,
  frameHref = '',
  routeSrc = null,
  requireFrameSrcMatch = true
} = {}) {
  if (!expectedOrigin || origin !== expectedOrigin) {
    return false;
  }
  if (expectedSource && source !== expectedSource) {
    return false;
  }
  if (!shouldAcceptEmbeddedReady({
    messageView,
    messageLoadToken,
    currentRoute,
    currentLoadToken,
    shareSrc
  })) {
    return false;
  }
  if (requireFrameSrcMatch && routeSrc && !frameHrefMatchesRouteSrc(frameHref, routeSrc)) {
    return false;
  }
  // When both sides carry a token, the live frame query should agree when present.
  const token = messageLoadToken == null || messageLoadToken === ''
    ? null
    : String(messageLoadToken);
  const expected = currentLoadToken == null || currentLoadToken === ''
    ? null
    : String(currentLoadToken);
  if (token && expected && frameHref) {
    try {
      const live = new URL(frameHref, 'https://starlight.invalid').searchParams.get('shellLoad');
      if (live && live !== expected) {
        return false;
      }
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Whether an iframe `load` event should push the shell back into the loading overlay.
 * Intentional navigations already call setViewState('loading') via loadEmbeddedView.
 * A late load after ready must never regress ready → loading.
 *
 * Cached older shells that re-entered loading on every load could cover a finished
 * view; current shells never re-enter from load alone, so missing ready surfaces as
 * timeout → retry → error instead of an endless overlay.
 *
 * @param {object} args
 * @param {string} [args.frameHref]
 * @param {string|null} [args.frameSrcAttr]
 * @param {'loading'|'ready'|'error'|string} [args.viewState]
 * @returns {boolean}
 */
export function shouldReenterLoadingOnFrameLoad({
  frameHref = '',
  frameSrcAttr = null,
  viewState = 'loading'
} = {}) {
  const href = String(frameHref || '');
  const srcAttr = frameSrcAttr == null ? '' : String(frameSrcAttr);
  if (href.includes('about:blank') || srcAttr === 'about:blank') {
    return false;
  }
  if (viewState === 'ready') {
    return false;
  }
  // loadEmbeddedView owns entering loading; the bare load event does not.
  return false;
}

/**
 * Resolve the visible shell view-state mode from the frame wrap classes / state node.
 * @param {{ classList?: { contains: (name: string) => boolean }, querySelector?: Function }|null} frameWrap
 * @returns {'loading'|'ready'|'error'}
 */
export function readShellViewState(frameWrap) {
  if (!frameWrap) return 'ready';
  if (frameWrap.classList?.contains('has-error')) return 'error';
  if (frameWrap.classList?.contains('is-loading')) return 'loading';
  const state = frameWrap.querySelector?.('.shell-view-state');
  if (state?.hidden || state?.dataset?.state === 'ready') return 'ready';
  if (state?.dataset?.state === 'error') return 'error';
  return 'loading';
}
