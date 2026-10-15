/**
 * Art-first fullscreen PNG lightbox for gallery / album browsing.
 * Hosts on the top same-origin document so it covers shell chrome.
 */

const ROOT_ID = 'starlight-png-lightbox';
const STYLE_ID = 'starlight-png-lightbox-css';
const STYLE_HREF = 'css/card-png-lightbox.css?v=1.0.3';
const DEFAULT_CARD_BACK = 'site_assets/StarlightCard_Back_NewLogo.png';

function lightboxFocusable(root) {
  return [...root.querySelectorAll([
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(','))].filter((el) => !el.hidden && el.getAttribute('aria-hidden') !== 'true');
}

function getHost() {
  try {
    if (window.top && window.top !== window && window.top.location.origin === window.location.origin) {
      return { win: window.top, doc: window.top.document };
    }
  } catch (_) {
    /* cross-origin */
  }
  return { win: window, doc: document };
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[char]));
}

function ensureStyles(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const hasLink = Array.from(doc.querySelectorAll('link[rel="stylesheet"]')).some(link =>
    String(link.getAttribute('href') || '').includes('card-png-lightbox.css')
  );
  if (hasLink) return;
  const link = doc.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  try {
    link.href = new URL(STYLE_HREF, doc.baseURI || location.href).href;
  } catch {
    link.href = STYLE_HREF;
  }
  doc.head.appendChild(link);
}

function ensureRoot(doc) {
  let root = doc.getElementById(ROOT_ID);
  if (root) return root;
  root = doc.createElement('div');
  root.id = ROOT_ID;
  root.className = 'png-lightbox';
  root.hidden = true;
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `
    <div class="png-lightbox-backdrop" data-png-close tabindex="-1"></div>
    <div class="png-lightbox-dialog" role="dialog" aria-modal="true" aria-labelledby="pngLightboxTitle">
      <button type="button" class="png-lightbox-close" data-png-close aria-label="Close">×</button>
      <button type="button" class="png-lightbox-nav png-lightbox-prev" data-png-prev aria-label="Previous card">‹</button>
      <button type="button" class="png-lightbox-nav png-lightbox-next" data-png-next aria-label="Next card">›</button>
      <div class="png-lightbox-stage">
        <div class="png-lightbox-art" data-png-art>
          <img class="png-lightbox-image" alt="" decoding="async"/>
        </div>
      </div>
      <div class="png-lightbox-meta">
        <div class="png-lightbox-copy">
          <p class="png-lightbox-kicker" data-png-kicker></p>
          <h2 id="pngLightboxTitle" data-png-title></h2>
          <p class="png-lightbox-sub" data-png-sub></p>
        </div>
        <div class="png-lightbox-actions">
          <button type="button" class="png-lightbox-holo" data-png-holo hidden>Holo On</button>
          <button type="button" class="png-lightbox-details" data-png-details>Details</button>
        </div>
      </div>
    </div>
  `;
  doc.body.appendChild(root);
  return root;
}

let active = null;

function bindLightboxImageFallback(img, fallback) {
  if (!img || img.dataset.fallbackBound === '1') return;
  img.dataset.fallbackBound = '1';
  img.addEventListener('error', () => {
    if (img.dataset.fallbackApplied === 'true') return;
    img.dataset.fallbackApplied = 'true';
    const target = active?.cardBackUrl || fallback || DEFAULT_CARD_BACK;
    if (target && img.getAttribute('src') !== target) img.src = target;
  });
}

function renderActive() {
  if (!active) return;
  const { root, list, index, getCardArt, getCardMeta, getFinish, supportsHolo, cardBackUrl } = active;
  const card = list[index];
  if (!card) return;
  const img = root.querySelector('.png-lightbox-image');
  const art = getCardArt(card);
  bindLightboxImageFallback(img, cardBackUrl || DEFAULT_CARD_BACK);
  img.dataset.fallbackApplied = 'false';
  img.src = art.src || cardBackUrl || DEFAULT_CARD_BACK;
  img.alt = art.alt || '';
  const meta = getCardMeta(card);
  root.querySelector('[data-png-kicker]').textContent = meta.kicker || '';
  root.querySelector('[data-png-title]').textContent = meta.title || '';
  root.querySelector('[data-png-sub]').textContent = meta.sub || '';
  root.querySelector('[data-png-prev]').disabled = list.length < 2;
  root.querySelector('[data-png-next]').disabled = list.length < 2;

  const artWrap = root.querySelector('[data-png-art]');
  const finish = getFinish?.(card) || { className: '', markup: '', holoOn: false };
  artWrap.className = `png-lightbox-art ${finish.className || ''}`.trim();
  artWrap.classList.toggle('is-holo-off', finish.holoOn === false && Boolean(supportsHolo?.(card)));
  Array.from(artWrap.querySelectorAll('.st-holo-spark')).forEach(node => node.remove());
  if (finish.markup) {
    artWrap.insertAdjacentHTML('beforeend', finish.markup);
  }

  const holoBtn = root.querySelector('[data-png-holo]');
  const canHolo = Boolean(supportsHolo?.(card));
  holoBtn.hidden = !canHolo;
  if (canHolo) {
    const on = finish.holoOn !== false;
    holoBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    holoBtn.textContent = on ? 'Holo On' : 'Holo Off';
  }
}

function step(dir) {
  if (!active?.list?.length) return;
  active.index = (active.index + dir + active.list.length) % active.list.length;
  renderActive();
  active.onStep?.(active.list[active.index], active.index);
}

function close() {
  if (!active) return;
  const { root, doc, onClose, keyHandler } = active;
  root.hidden = true;
  root.setAttribute('aria-hidden', 'true');
  root.classList.remove('is-open');
  doc.body.classList.remove('png-lightbox-open');
  doc.removeEventListener('keydown', keyHandler);
  const restore = active.restoreFocus;
  active = null;
  onClose?.();
  if (restore && typeof restore.focus === 'function') {
    try { restore.focus(); } catch (_) { /* ignore */ }
  }
}

function open(options = {}) {
  const list = Array.isArray(options.list) ? options.list.filter(Boolean) : [];
  if (!list.length) return null;
  const { win, doc } = getHost();
  ensureStyles(doc);
  const root = ensureRoot(doc);
  let index = Math.max(0, list.findIndex(card => String(card.id) === String(options.cardId || list[0].id)));
  if (index < 0) index = 0;

  if (active) close();

  const keyHandler = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      step(-1);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      step(1);
      return;
    }
    if (event.key !== 'Tab') return;
    const dialog = root.querySelector('.png-lightbox-dialog') || root;
    const items = lightboxFocusable(dialog);
    if (!items.length) {
      event.preventDefault();
      dialog.focus?.();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const current = doc.activeElement;
    if (event.shiftKey && (current === first || !dialog.contains(current))) {
      event.preventDefault();
      last.focus?.();
    } else if (!event.shiftKey && (current === last || !dialog.contains(current))) {
      event.preventDefault();
      first.focus?.();
    }
  };

  active = {
    root,
    doc,
    win,
    list,
    index,
    cardBackUrl: options.cardBackUrl || DEFAULT_CARD_BACK,
    getCardArt: options.getCardArt || ((card) => ({ src: card.imageUrl || '', alt: card.name || '' })),
    getCardMeta: options.getCardMeta || ((card) => ({
      kicker: card.series || '',
      title: card.name || 'Card',
      sub: [card.collectorNumber || card.number, card.rarity].filter(Boolean).join(' · ')
    })),
    getFinish: options.getFinish,
    supportsHolo: options.supportsHolo,
    onHoloToggle: options.onHoloToggle,
    onDetails: options.onDetails,
    onStep: options.onStep,
    onClose: options.onClose,
    restoreFocus: options.restoreFocus || doc.activeElement,
    keyHandler
  };

  root.onclick = (event) => {
    event.stopPropagation();
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-png-close]')) {
      event.preventDefault();
      close();
      return;
    }
    if (target.closest('[data-png-prev]')) {
      event.preventDefault();
      step(-1);
      return;
    }
    if (target.closest('[data-png-next]')) {
      event.preventDefault();
      step(1);
      return;
    }
    if (target.closest('[data-png-holo]')) {
      event.preventDefault();
      active?.onHoloToggle?.();
      renderActive();
      return;
    }
    if (target.closest('[data-png-details]')) {
      event.preventDefault();
      const card = active?.list?.[active.index];
      const onDetails = options.onDetails;
      close();
      onDetails?.(card);
    }
  };
  root.onpointerdown = (event) => {
    event.stopPropagation();
  };

  renderActive();
  root.hidden = false;
  root.removeAttribute('aria-hidden');
  root.classList.add('is-open');
  doc.body.classList.add('png-lightbox-open');
  doc.addEventListener('keydown', keyHandler);
  root.querySelector('.png-lightbox-close')?.focus?.();
  return {
    close,
    step,
    get index() { return active?.index ?? index; },
    get card() { return active?.list?.[active.index] || null; }
  };
}

window.StarlightPngLightbox = { open, close, step };

export { open, close, step, esc };
