function publishShellDetail(payload) {
  try {
    window.dispatchEvent(new CustomEvent('starlight-dashboard-refresh', { detail: payload }));
  } catch (_) {
    /* ignore */
  }

  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(payload, window.location.origin);
    }
  } catch (_) {
    /* ignore */
  }
}

/**
 * Notify the Binder shell (and any local dashboard listeners) that Star Bits /
 * collector economy totals may have changed.
 */
export function notifyShellEconomyChanged(detail = {}) {
  publishShellDetail({
    type: 'starlight-wallet-changed',
    ...detail
  });
}

/**
 * Ask the shell to reconcile ownership from cloud without treating the event
 * as a fresh award (no local quantity increments from payload cards).
 */
export function notifyShellCollectionReconcile(detail = {}) {
  publishShellDetail({
    type: 'starlight-collection-reconcile',
    source: detail.source || 'collection-reconcile',
    ...detail,
    cards: undefined
  });
}
