/**
 * Starlight premium card perspective + shine (inspired by interactive gallery cards).
 * Opt-in via card.effectStyle; standard cards stay unchanged.
 */
(function initStarlightPerspectiveCard(global) {
  const EFFECT_STYLES = new Set(['none', 'shine', 'special-art', 'holographic', 'legendary', 'rainbow']);
  const SPARKLE_STYLES = new Set(['special-art', 'legendary', 'rainbow']);
  const DEFAULT_CARD_BACK = 'site_assets/StarlightCard_Back_NewLogo.png';
  const controllers = new WeakMap();

  function motionReduced() {
    return Boolean(
      global.StarlightBrowser?.reducedMotion
      || global.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    );
  }

  function liteMode() {
    return Boolean(global.StarlightBrowser?.lite);
  }

  function escapeAttr(value = '') {
    return String(value).replace(/"/g, '&quot;');
  }

  /** One-shot broken-art recovery; keeps gallery/reveal tiles from showing empty images. */
  function bindImageFallback(image, fallback = DEFAULT_CARD_BACK) {
    if (!image || image.dataset.fallbackBound === '1') return image;
    image.dataset.fallbackBound = '1';
    const target = String(fallback || DEFAULT_CARD_BACK).trim() || DEFAULT_CARD_BACK;
    image.addEventListener('error', () => {
      if (image.dataset.fallbackApplied === 'true') return;
      image.dataset.fallbackApplied = 'true';
      if (target && image.getAttribute('src') !== target) image.src = target;
    });
    return image;
  }

  function imageWithFallbackAttrs(src, alt, imgClass = '', fallback = DEFAULT_CARD_BACK) {
    const safeFallback = escapeAttr(fallback || DEFAULT_CARD_BACK);
    return `<img class="${imgClass}" src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" loading="lazy" data-fallback-src="${safeFallback}" onerror="if(this.dataset.fallbackApplied==='true')return;this.dataset.fallbackApplied='true';this.src=this.dataset.fallbackSrc||'${safeFallback}'">`;
  }

  /** @returns {string|null} Active effect style or null when unchanged / standard. */
  function resolveEffectStyle(card = {}) {
    const raw = String(card.effectStyle ?? card.effect_style ?? '').trim().toLowerCase();
    if (!raw) return null;
    if (raw === 'none') return null;
    return EFFECT_STYLES.has(raw) ? raw : null;
  }

  function resolveEffectIntensity(card = {}, fallback = 65) {
    const value = Number(card.effectIntensity ?? card.effect_intensity);
    if (!Number.isFinite(value)) return fallback;
    return Math.max(20, Math.min(100, Math.round(value)));
  }

  function hasPremiumPerspective(card = {}) {
    return Boolean(resolveEffectStyle(card));
  }

  function sparklesMarkup(effectStyle) {
    if (!SPARKLE_STYLES.has(effectStyle)) return '';
    return '<div class="starlight-card-sparkles starlight-card__sparkles" aria-hidden="true"><i></i><i></i><i></i></div>';
  }

  function buildPerspectiveCardMarkup({
    imageUrl = '',
    alt = '',
    effectStyle = 'special-art',
    effectIntensity = 65,
    imgClass = '',
    cardBackUrl = DEFAULT_CARD_BACK
  } = {}) {
    if (!effectStyle || effectStyle === 'none') {
      return imageWithFallbackAttrs(imageUrl, alt, imgClass, cardBackUrl);
    }
    const safeFallback = escapeAttr(cardBackUrl || DEFAULT_CARD_BACK);
    return `<div class="starlight-card starlight-perspective-card starlight-card--interactive starlight-effect-${escapeAttr(effectStyle)}" data-effect-style="${escapeAttr(effectStyle)}" data-effect-intensity="${effectIntensity}" data-perspective-card>
      <div class="starlight-card__transformer starlight-card-transformer">
        <div class="starlight-card__front starlight-card-front">
          <img class="${imgClass}" src="${escapeAttr(imageUrl)}" alt="${escapeAttr(alt)}" loading="lazy" draggable="false" data-fallback-src="${safeFallback}" onerror="if(this.dataset.fallbackApplied==='true')return;this.dataset.fallbackApplied='true';this.src=this.dataset.fallbackSrc||'${safeFallback}'">
        </div>
        <div class="starlight-card__shine starlight-card-shine" aria-hidden="true"></div>
        ${sparklesMarkup(effectStyle)}
      </div>
    </div>`;
  }

  function cardArtMarkup(card = {}, { imageUrl, alt = '', imgClass = '', visible = true, cardBackUrl = DEFAULT_CARD_BACK } = {}) {
    const style = resolveEffectStyle(card);
    const src = imageUrl || card.thumbnailUrl || card.imageUrl || '';
    const label = alt || card.name || 'Card artwork';
    const fallback = cardBackUrl || DEFAULT_CARD_BACK;
    if (!style || !visible || !src) {
      return imageWithFallbackAttrs(src || fallback, label, imgClass, fallback);
    }
    return buildPerspectiveCardMarkup({
      imageUrl: src,
      alt: label,
      effectStyle: style,
      effectIntensity: resolveEffectIntensity(card),
      imgClass,
      cardBackUrl: fallback
    });
  }

  class PerspectiveController {
    constructor(root, options = {}) {
      this.root = root;
      this.transformer = root.querySelector('.starlight-card-transformer, .starlight-card__transformer');
      this.shine = root.querySelector('.starlight-card-shine, .starlight-card__shine');
      this.intensity = Number(root.dataset.effectIntensity || 65) / 100;
      this.maxTilt = (Number(options.maxTilt ?? 10)) * this.intensity;
      this.active = false;
      this.rafId = 0;
      this.pointerX = 0.5;
      this.pointerY = 0.5;
      this.currentX = 0.5;
      this.currentY = 0.5;
      this.reduced = motionReduced() || liteMode();
      this.shouldIgnore = options.shouldIgnore || (() => false);

      this.onPointerEnter = this.onPointerEnter.bind(this);
      this.onPointerMove = this.onPointerMove.bind(this);
      this.onPointerLeave = this.onPointerLeave.bind(this);
      this.tick = this.tick.bind(this);

      root.addEventListener('pointerenter', this.onPointerEnter);
      root.addEventListener('pointermove', this.onPointerMove);
      root.addEventListener('pointerleave', this.onPointerLeave);

      if (!this.reduced && global.IntersectionObserver) {
        this.observer = new IntersectionObserver(entries => {
          if (!entries.some(entry => entry.isIntersecting)) this.deactivate();
        }, { rootMargin: '48px', threshold: 0.04 });
        this.observer.observe(root);
      }

      if (this.reduced) {
        root.classList.add('is-reduced-motion');
        this.applyStaticHighlight();
      }
    }

    onPointerEnter(event) {
      if (this.reduced || this.shouldIgnore(event)) return;
      this.active = true;
      this.root.classList.add('is-active');
      if (!this.rafId) this.rafId = global.requestAnimationFrame(this.tick);
    }

    onPointerMove(event) {
      if (this.reduced || !this.active || this.shouldIgnore(event)) return;
      const rect = this.root.getBoundingClientRect();
      this.pointerX = (event.clientX - rect.left) / Math.max(1, rect.width);
      this.pointerY = (event.clientY - rect.top) / Math.max(1, rect.height);
    }

    onPointerLeave() {
      this.deactivate();
    }

    deactivate() {
      this.active = false;
      this.pointerX = 0.5;
      this.pointerY = 0.5;
      this.root.classList.remove('is-active');
      if (this.rafId) {
        global.cancelAnimationFrame(this.rafId);
        this.rafId = 0;
      }
      this.applyTransform(0.5, 0.5, true);
    }

    tick() {
      if (!this.active) {
        this.rafId = 0;
        return;
      }
      const ease = 0.16;
      this.currentX += (this.pointerX - this.currentX) * ease;
      this.currentY += (this.pointerY - this.currentY) * ease;
      this.applyTransform(this.currentX, this.currentY);
      this.rafId = global.requestAnimationFrame(this.tick);
    }

    applyTransform(x, y, reset = false) {
      if (!this.transformer) return;
      const tiltY = (x - 0.5) * this.maxTilt * 2;
      const tiltX = (0.5 - y) * this.maxTilt * 2;
      const scale = reset ? 1 : 1 + 0.015 * this.intensity;
      const lift = reset ? 0 : -4 * this.intensity;
      this.transformer.style.transform = reset
        ? 'rotateX(0deg) rotateY(0deg) translateY(0px) scale(1)'
        : `rotateX(${tiltX.toFixed(2)}deg) rotateY(${tiltY.toFixed(2)}deg) translateY(${lift.toFixed(2)}px) scale(${scale.toFixed(3)})`;

      if (this.shine) {
        const angle = Math.atan2(y - 0.5, x - 0.5) * (180 / Math.PI) + 90;
        const dist = Math.hypot(x - 0.5, y - 0.5);
        const style = String(this.root.dataset.effectStyle || '').toLowerCase();
        const opacityCap = style === 'shine' ? 0.42 : 0.65;
        const opacity = reset ? 0 : Math.min(opacityCap, (0.15 + dist * 0.72) * this.intensity);
        this.root.style.setProperty('--shine-angle', `${angle.toFixed(1)}deg`);
        this.root.style.setProperty('--shine-opacity', opacity.toFixed(3));
        this.shine.style.opacity = reset ? '0' : String(Math.min(1, opacity + 0.06));
      }
    }

    applyStaticHighlight() {
      this.root.style.setProperty('--shine-angle', '132deg');
      this.root.style.setProperty('--shine-opacity', '0.16');
      if (this.shine) this.shine.style.opacity = '0.2';
    }

    destroy() {
      this.deactivate();
      this.observer?.disconnect();
      this.root.removeEventListener('pointerenter', this.onPointerEnter);
      this.root.removeEventListener('pointermove', this.onPointerMove);
      this.root.removeEventListener('pointerleave', this.onPointerLeave);
    }
  }

  function attachPerspectiveCard(root, options = {}) {
    if (!root || root.dataset.perspectiveBound === '1') return root;
    root.dataset.perspectiveBound = '1';
    const img = root.querySelector('img');
    if (img) bindImageFallback(img, options.cardBackUrl || img.dataset.fallbackSrc || DEFAULT_CARD_BACK);
    controllers.set(root, new PerspectiveController(root, options));
    return root;
  }

  function detachPerspectiveCard(root) {
    controllers.get(root)?.destroy();
    controllers.delete(root);
    root?.removeAttribute('data-perspective-bound');
  }

  function scanPerspectiveCards(container = global.document, options = {}) {
    if (!container?.querySelectorAll) return;
    container.querySelectorAll('[data-perspective-card]:not([data-perspective-bound])').forEach(root => {
      attachPerspectiveCard(root, options);
    });
  }

  function refreshPerspectiveCards(container = global.document, options = {}) {
    if (!container?.querySelectorAll) return;
    container.querySelectorAll('[data-perspective-bound="1"]').forEach(root => detachPerspectiveCard(root));
    scanPerspectiveCards(container, options);
  }

  const api = {
    DEFAULT_CARD_BACK,
    resolveEffectStyle,
    resolveEffectIntensity,
    hasPremiumPerspective,
    bindImageFallback,
    buildPerspectiveCardMarkup,
    cardArtMarkup,
    attachPerspectiveCard,
    detachPerspectiveCard,
    scanPerspectiveCards,
    refreshPerspectiveCards
  };

  global.StarlightPerspectiveCard = api;
  if (global.StarlightUI) Object.assign(global.StarlightUI, api);
}(window));
