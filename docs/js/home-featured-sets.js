/**
 * Home featured series strip — real catalog artwork (not placeholder tiles).
 */
import { fetchFreshCardCatalog, getCachedCardCatalog } from './card-catalog-service.js';

const host = document.getElementById('homeFeaturedSets');
const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

function groupSeries(cards) {
  const map = new Map();
  for (const card of cards || []) {
    if (!card?.isVisible || !card?.seriesId) continue;
    if (!map.has(card.seriesId)) {
      map.set(card.seriesId, {
        id: card.seriesId,
        name: card.seriesName || card.seriesId,
        sort: Number(card.seriesSort) || 0,
        boosterImageUrl: card.boosterImageUrl || '',
        cards: []
      });
    }
    const entry = map.get(card.seriesId);
    entry.cards.push(card);
    if (!entry.boosterImageUrl && card.boosterImageUrl) {
      entry.boosterImageUrl = card.boosterImageUrl;
    }
  }
  return [...map.values()]
    .map((series) => ({
      ...series,
      cards: series.cards
        .slice()
        .sort(
          (a, b) =>
            a.sortOrder - b.sortOrder ||
            String(a.number).localeCompare(String(b.number), undefined, { numeric: true })
        )
    }))
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}

function pickShowcase(cards, limit = 4) {
  if (!cards.length) return [];
  const preferred = cards.filter((c) =>
    /legendary|epic|rare/i.test(String(c.rarity || ''))
  );
  const pool = preferred.length >= limit ? preferred : cards;
  return pool.slice(0, limit);
}

function renderSeries(series) {
  const samples = pickShowcase(series.cards, 4);
  const art =
    series.boosterImageUrl ||
    samples[0]?.thumbnailUrl ||
    samples[0]?.imageUrl ||
    'site_assets/StarlightCard_Back_NewLogo.png';
  const thumbs = samples
    .map(
      (card) => `<li>
      <a class="st-home-set__thumb" href="binder?view=binder&amp;cardSet=${encodeURIComponent(series.id)}&amp;card=${encodeURIComponent(card.id)}" data-shell-view="binder" title="${esc(card.name)}">
        <img src="${esc(card.thumbnailUrl || card.imageUrl || art)}" alt="${esc(card.name)}" loading="lazy" decoding="async">
      </a>
    </li>`
    )
    .join('');

  return `<article class="st-home-set">
    <a class="st-home-set__pack" href="binder?view=binder&amp;cardSet=${encodeURIComponent(series.id)}" data-shell-view="binder">
      <img src="${esc(art)}" alt="" loading="lazy" decoding="async">
    </a>
    <div class="st-home-set__body">
      <p class="st-eyebrow">Featured set</p>
      <h3>${esc(series.name)}</h3>
      <p>${series.cards.length} card${series.cards.length === 1 ? '' : 's'} in this series</p>
      <ul class="st-home-set__thumbs" aria-label="${esc(series.name)} sample cards">${thumbs}</ul>
      <a class="st-link-cta" href="binder?view=binder&amp;cardSet=${encodeURIComponent(series.id)}" data-shell-view="binder">Browse set</a>
    </div>
  </article>`;
}

function render(seriesList) {
  if (!host) return;
  const featured = seriesList.filter((s) => s.cards.length).slice(0, 3);
  if (!featured.length) {
    host.innerHTML = `<p class="st-empty">Card sets will appear here once the catalog is available.</p>`;
    return;
  }
  host.innerHTML = featured.map(renderSeries).join('');
}

async function load() {
  if (!host) return;
  try {
    let catalog = getCachedCardCatalog();
    if (!catalog?.cards?.length) {
      catalog = await fetchFreshCardCatalog();
    }
    render(groupSeries(catalog?.cards || []));
  } catch (error) {
    console.error('Unable to load featured sets:', error);
    host.innerHTML = `<p class="st-empty">Could not load featured sets right now.</p>`;
  }
}

load();
