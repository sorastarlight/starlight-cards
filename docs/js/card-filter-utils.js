/**
 * Shared card filter helpers for binder/collection browse (V1.1).
 * Pure functions so Node tests can import them without a DOM.
 */

export function cardSetHeading(cardSet = '') {
  const key = String(cardSet || '').trim().toLowerCase();
  if (key === 'event') return 'Event Cards';
  if (key === 'special') return 'Special Cards';
  return '';
}

export function buildCardSearchHaystack(card = {}) {
  return [
    card.number,
    card.collectorNumber,
    card.name,
    card.series,
    card.rarity,
    card.cardDescription,
    card.artist
  ].map(value => String(value ?? '')).join(' ').toLowerCase();
}

export function filterCardList(
  source,
  filters = {},
  { respectOwnership = true, isCollected = () => false, isFavorite = () => false, sortCards = list => list } = {}
) {
  const list = (Array.isArray(source) ? source : []).filter(card => {
    const haystack = buildCardSearchHaystack(card);
    const seriesMatches = !filters.series || filters.series === 'All Series' || card.series === filters.series;
    const rarityMatches = !filters.rarity || filters.rarity === 'All Rarities'
      || String(card.rarity || '').trim().toLowerCase() === String(filters.rarity || '').trim().toLowerCase();
    const query = String(filters.q || '').trim().toLowerCase();
    const searchMatches = !query || haystack.includes(query);
    const ownershipMatches = !respectOwnership || !filters.view || filters.view === 'all'
      || (filters.view === 'collected' ? isCollected(card.id) : !isCollected(card.id));
    const favoriteMatches = !filters.favoritesOnly || isFavorite(card.id);
    const cardSet = String(filters.cardSet || '').trim().toLowerCase();
    const distribution = String(card.distributionType || '').trim().toLowerCase();
    const cardSetMatches = !cardSet
      || (cardSet === 'event' && Boolean(card.isEventExclusive))
      || (cardSet === 'special' && (
        Boolean(card.isPromo)
        || distribution === 'promo'
        || distribution === 'special'
        || distribution === 'special_distribution'
      ));
    return seriesMatches && rarityMatches && searchMatches && ownershipMatches && favoriteMatches && cardSetMatches;
  });
  sortCards(list, filters.sort);
  return list;
}

/**
 * Binder browse: series landing vs in-series grid vs catalog search.
 * Grid and showcase must consume the same `list`.
 */
export function resolveBinderBrowseList(cards, filters = {}, options = {}) {
  const catalog = Array.isArray(cards) ? cards : [];
  const query = String(filters.q || '').trim();
  const searching = query.length > 0;
  const series = filters.series || 'All Series';
  const favoritesOnly = Boolean(filters.favoritesOnly);

  const pool = series === 'All Series'
    ? catalog
    : catalog.filter(card => card.series === series);

  const list = filterCardList(pool, { ...filters, series: 'All Series' }, options);
  const owned = list.filter(card => options.isCollected?.(card.id)).length;
  const heading = cardSetHeading(filters.cardSet)
    || (series === 'All Series'
      ? (searching ? 'Search results' : 'Card Gallery')
      : series);
  const favoriteNote = favoritesOnly ? ' · favorites only' : '';
  const view = String(filters.view || 'all').toLowerCase();
  const progressNote = series !== 'All Series' && !searching && view === 'all' && !favoritesOnly
    ? ` · ${owned} of ${pool.length} collected in this set`
    : '';
  const summary = searching
    ? `Showing ${list.length} of ${pool.length} cards matching “${query}”${favoriteNote}`
    : (series === 'All Series'
      ? `Showing ${list.length} of ${pool.length} cards${favoriteNote}`
      : `Showing ${list.length} of ${pool.length} cards in ${series}${favoriteNote}${progressNote}`);

  return {
    showLanding: false,
    list,
    poolSize: pool.length,
    owned,
    heading,
    summary
  };
}

/**
 * Explains set completion for binder headers without changing economy rules.
 * `owned` is unique collected cards in the set; extras/duplicates are ignored.
 */
export function formatSetProgressExplanation({
  series = '',
  owned = 0,
  total = 0,
  duplicateCards = 0,
  exchangeableCopies = 0
} = {}) {
  const setName = String(series || '').trim() || 'this set';
  const ownedCount = Math.max(0, Number(owned) || 0);
  const totalCount = Math.max(0, Number(total) || 0);
  const duplicateCount = Math.max(0, Number(duplicateCards) || 0);
  const exchangeable = Math.max(0, Number(exchangeableCopies) || 0);
  if (totalCount <= 0) {
    return `No cards are listed for ${setName} yet.`;
  }
  const remaining = Math.max(0, totalCount - ownedCount);
  const completion = remaining === 0
    ? `You have every card in ${setName}.`
    : `You have ${ownedCount} of ${totalCount} cards in ${setName} (${remaining} still missing).`;
  if (duplicateCount <= 0) {
    return `${completion} Progress counts unique cards, not extra copies.`;
  }
  return `${completion} ${duplicateCount} card${duplicateCount === 1 ? '' : 's'} with extras · ${exchangeable} exchangeable ${exchangeable === 1 ? 'copy' : 'copies'} (extras only; one copy stays in your collection).`;
}

/** Preferred on-card number label (collector number when present). */
export function cardDisplayNumber(card = {}) {
  const value = String(card.collectorNumber || card.cardNumber || card.number || '').trim();
  return value;
}

/**
 * Binder grid count pill copy that stays honest under Collected / Not Collected views.
 */
export function formatBinderOwnedPill({ shown = 0, owned = 0, view = 'all' } = {}) {
  const shownCount = Math.max(0, Number(shown) || 0);
  const ownedCount = Math.max(0, Number(owned) || 0);
  const mode = String(view || 'all').toLowerCase();
  if (mode === 'missing') return `Showing ${shownCount} not collected`;
  if (mode === 'collected') return `Collected in view: ${ownedCount}`;
  if (mode === 'duplicates') return `Duplicates in view: ${shownCount}`;
  return `Collected: ${ownedCount} / ${shownCount}`;
}

/** Trade-list search haystack (card number + optional collector number). */
export function buildTradeSearchHaystack(card = {}) {
  return [
    card.cardNumber,
    card.collectorNumber,
    card.number,
    card.name,
    card.rarity,
    card.seriesName,
    card.series
  ].map(value => String(value ?? '')).join(' ').toLowerCase();
}
