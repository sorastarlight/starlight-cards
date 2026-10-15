/**
 * Pure favorites helpers (V1.1) — safe for Node tests without a DOM.
 */

export function favoriteButtonLabel(cardName, isFavorite, { saving = false, error = false } = {}) {
  const name = String(cardName || 'card').trim() || 'card';
  if (saving) return `Saving favorite for ${name}`;
  if (error) return `Retry favorite for ${name}`;
  return isFavorite ? `Remove ${name} from favorites` : `Add ${name} to favorites`;
}

export function toggleFavoriteInStore(store = {}, cardId) {
  const next = { ...(store && typeof store === 'object' ? store : {}) };
  const id = String(cardId || '');
  if (!id) return { store: next, isFavorite: false };
  if (next[id]) {
    delete next[id];
    return { store: next, isFavorite: false };
  }
  next[id] = true;
  return { store: next, isFavorite: true };
}

export function countFavorites(store = {}) {
  return Object.keys(store && typeof store === 'object' ? store : {})
    .filter(id => store[id])
    .length;
}

/**
 * After a favorite toggle while browsing a full-view list.
 * When unfavoriting in favorites mode, drop the card and pick a neighbor.
 */
export function resolveFullViewAfterFavoriteChange({
  list = [],
  selectedId,
  cardId,
  isFavorite,
  listMode = 'all'
} = {}) {
  const source = Array.isArray(list) ? list.slice() : [];
  if (listMode !== 'favorites' || isFavorite) {
    return {
      list: source,
      selectedId: selectedId || null,
      shouldClose: false
    };
  }

  const nextList = source.filter(card => card?.id !== cardId);
  if (!nextList.length) {
    return { list: [], selectedId: null, shouldClose: true };
  }

  const removedIndex = Math.max(0, source.findIndex(card => card?.id === cardId));
  const fallback = nextList[Math.min(removedIndex, nextList.length - 1)] || nextList[0];
  return {
    list: nextList,
    selectedId: fallback?.id || null,
    shouldClose: false
  };
}
