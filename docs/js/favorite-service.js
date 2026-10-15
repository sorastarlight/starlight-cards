/**
 * Authenticated favorite reads/writes for surfaces outside the binder shell.
 * Uses set_card_favorite and mirrors ACTIVE_FAVORITES_KEY with ownership-epoch guards.
 */

import { supabase } from './supabase-client.js';
import {
  ACTIVE_FAVORITES_KEY,
  accountFavoritesKey,
  captureOwnershipEpoch,
  ownershipEpochMatches,
  readLocalStoreObject,
  writeLocalStoreObject
} from './collection-local-store.js';
import { favoriteButtonLabel } from './favorite-utils.js';

export { favoriteButtonLabel };

function normalizeCardId(cardId) {
  return String(cardId || '').trim();
}

function uniqueCardIds(cardIds = []) {
  return [...new Set(
    (Array.isArray(cardIds) ? cardIds : [])
      .map(normalizeCardId)
      .filter(Boolean)
  )];
}

export function readLocalFavoriteMap() {
  return readLocalStoreObject(ACTIVE_FAVORITES_KEY);
}

export function applyLocalFavoriteState(cardId, isFavorite, epoch) {
  const id = normalizeCardId(cardId);
  if (!id) return false;
  if (epoch && !ownershipEpochMatches(epoch)) return false;

  const store = { ...readLocalFavoriteMap() };
  if (isFavorite) store[id] = true;
  else delete store[id];
  writeLocalStoreObject(ACTIVE_FAVORITES_KEY, store);

  const ownerId = epoch?.ownerId || captureOwnershipEpoch()?.ownerId;
  if (ownerId) {
    writeLocalStoreObject(accountFavoritesKey(ownerId), { ...store });
  }
  return true;
}

/**
 * Load favorite flags for card ids. Server wins; local map fills gaps while offline.
 */
export async function fetchFavoriteStates(cardIds = []) {
  const ids = uniqueCardIds(cardIds);
  const local = readLocalFavoriteMap();
  const states = Object.fromEntries(ids.map((id) => [id, Boolean(local[id])]));

  if (!ids.length) {
    return { ok: true, signedIn: false, states };
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user) {
    return { ok: true, signedIn: false, states: Object.fromEntries(ids.map((id) => [id, false])) };
  }

  const epoch = captureOwnershipEpoch();
  if (epoch.ownerId && epoch.ownerId !== authData.user.id) {
    return { ok: false, signedIn: true, states, reason: 'stale-epoch' };
  }

  const { data, error } = await supabase
    .from('user_cards')
    .select('card_id,is_favorite')
    .in('card_id', ids);

  if (error) {
    return { ok: false, signedIn: true, states, error };
  }

  if (!ownershipEpochMatches(epoch) && epoch.ownerId) {
    return { ok: false, signedIn: true, states, reason: 'stale-epoch' };
  }

  for (const row of Array.isArray(data) ? data : []) {
    const id = normalizeCardId(row.card_id);
    if (!id) continue;
    states[id] = row.is_favorite === true;
  }

  // Cards just awarded may not appear in user_cards yet; keep local true if set.
  for (const id of ids) {
    if (states[id] == null) states[id] = Boolean(local[id]);
  }

  return { ok: true, signedIn: true, states, epoch };
}

/**
 * Persist a favorite toggle. Inventory is never modified.
 */
export async function setCardFavorite(cardId, favoriteState, options = {}) {
  const id = normalizeCardId(cardId);
  const nextState = Boolean(favoriteState);
  if (!id) {
    return { ok: false, reason: 'missing-card' };
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user) {
    return { ok: false, reason: 'signed-out' };
  }

  const epoch = options.epoch || captureOwnershipEpoch();
  if (epoch.ownerId && epoch.ownerId !== authData.user.id) {
    return { ok: false, skipped: true, reason: 'stale-epoch' };
  }

  const previousState = Boolean(readLocalFavoriteMap()[id]);
  applyLocalFavoriteState(id, nextState, epoch);

  const { data, error } = await supabase.rpc('set_card_favorite', {
    requested_card_id: id,
    favorite_state: nextState
  });

  if (!ownershipEpochMatches(epoch) && epoch.ownerId) {
    return { ok: false, skipped: true, reason: 'stale-epoch-after-rpc', rpcCompleted: !error };
  }

  if (error) {
    applyLocalFavoriteState(id, previousState, epoch);
    return { ok: false, error, previousState };
  }

  applyLocalFavoriteState(id, nextState, epoch);
  return { ok: true, data, favoriteState: nextState, epoch };
}
