import { supabase } from "./supabase-client.js";
import {
  clearPendingOpeningRequest,
  ensurePendingOpeningRequest,
  normalizeOpeningPayload,
  readPendingOpeningRequest
} from "./daily-booster-opening-request.js";
import { normalizeDailyAwardCards } from "./daily-booster-receipt.js";
import { isUnsupportedRpcSignatureError } from "./daily-booster-rpc-errors.js";

export { isUnsupportedRpcSignatureError };

export async function getDailyBoosterStatus() {
  const { data, error } = await supabase.rpc("get_daily_booster_status");
  if (error) {
    console.error("Unable to check daily booster status:", error);
    return { status: null, error };
  }
  return { status: data, error: null };
}

/**
 * Owner-only opening lookup. Never grants. Pre-migration deployments omit the RPC.
 */
export async function getMyDailyBoosterOpening({
  requestId = null,
  claimId = null
} = {}) {
  const args = {};
  if (requestId) args.requested_request_id = requestId;
  if (claimId != null && claimId !== "") args.requested_claim_id = Number(claimId);

  const { data, error } = await supabase.rpc("get_my_daily_booster_opening", args);
  if (error) {
    if (
      isUnsupportedRpcSignatureError(error, {
        functionName: "get_my_daily_booster_opening"
      })
    ) {
      return {
        opening: { found: false, cards: [], recoverySupported: false },
        error: null,
        unsupported: true
      };
    }
    console.error("Unable to load daily booster opening:", error);
    return { opening: null, error, unsupported: false };
  }
  const opening = normalizeOpeningPayload(data);
  opening.cards = normalizeDailyAwardCards(opening.cards);
  opening.recoverySupported = true;
  return { opening, error: null, unsupported: false };
}

/**
 * Open (or idempotently replay) a Free Daily / unlimited pack.
 * Persists a client request UUID before the RPC when possible.
 *
 * Capability fallback to zero-arg open_daily_booster() is allowed ONLY after a
 * definitive unsupported-signature response, and ONLY for a fresh open (not
 * recovery of a known request id). Ambiguous timeouts never fall back.
 */
export async function openDailyBooster({
  ownerId = null,
  claimDate = null,
  requestId = null,
  allowLegacyFallback = true
} = {}) {
  let resolvedRequestId = requestId || null;
  const recoveryAttempt = Boolean(requestId);

  if (!resolvedRequestId && ownerId) {
    const pending = ensurePendingOpeningRequest(ownerId, { claimDate });
    resolvedRequestId = pending.requestId;
  }

  if (resolvedRequestId) {
    const { data, error } = await supabase.rpc("open_daily_booster", {
      requested_request_id: resolvedRequestId
    });
    if (!error) {
      return {
        ...data,
        requestId: data?.requestId || resolvedRequestId,
        _clientRequestId: resolvedRequestId,
        _recoverySupported: true
      };
    }

    const unsupported = isUnsupportedRpcSignatureError(error, {
      functionName: "open_daily_booster",
      argumentHint: "requested_request_id"
    });

    // Fresh open only: pre-migration has no uuid overload.
    // Recovery with a known request id must NEVER fall back to zero-arg.
    if (allowLegacyFallback && !recoveryAttempt && unsupported) {
      const legacy = await supabase.rpc("open_daily_booster");
      if (legacy.error) {
        console.error("Unable to open daily booster:", legacy.error);
        throw legacy.error;
      }
      return {
        ...legacy.data,
        requestId: null,
        _clientRequestId: resolvedRequestId,
        _recoverySupported: false,
        _legacyOpen: true
      };
    }

    console.error("Unable to open daily booster:", error);
    throw error;
  }

  const { data, error } = await supabase.rpc("open_daily_booster");
  if (error) {
    console.error("Unable to open daily booster:", error);
    throw error;
  }
  return {
    ...data,
    requestId: data?.requestId || null,
    _clientRequestId: null,
    _recoverySupported: Boolean(data?.requestId),
    _legacyOpen: !data?.requestId
  };
}

/**
 * Recover a lost open response without granting again.
 * Prefer get_my_daily_booster_opening(request_id); else idempotent open with the same id.
 * Never invents a new request UUID for the same attempt.
 */
export async function recoverOpeningByRequestId({
  ownerId,
  requestId = null,
  allowIdempotentOpen = true
} = {}) {
  const pending = requestId
    ? { requestId, corrupt: false }
    : readPendingOpeningRequest(ownerId);
  const id = pending && !pending.corrupt ? pending.requestId : requestId;
  if (!id) {
    return { recovered: false, reason: "no-request-id", opening: null };
  }

  const lookup = await getMyDailyBoosterOpening({ requestId: id });
  if (lookup.error) {
    return { recovered: false, reason: "lookup-error", error: lookup.error, opening: null };
  }
  if (lookup.opening?.found && lookup.opening.cards?.length) {
    if (ownerId) clearPendingOpeningRequest(ownerId);
    return {
      recovered: true,
      reason: "lookup",
      opening: lookup.opening,
      requestId: id
    };
  }

  if (!allowIdempotentOpen || lookup.unsupported) {
    return {
      recovered: false,
      reason: lookup.unsupported ? "unsupported" : "not-found",
      opening: lookup.opening,
      requestId: id
    };
  }

  // Same request id — server returns the committed opening or finishes an in-flight row.
  // Never allow legacy zero-arg fallback here (would grant a new opening).
  try {
    const replay = await openDailyBooster({
      ownerId,
      requestId: id,
      allowLegacyFallback: false
    });
    const cards = normalizeDailyAwardCards(replay?.cards || replay?.cardsAwarded);
    if (cards.length) {
      if (ownerId) clearPendingOpeningRequest(ownerId);
      return {
        recovered: true,
        reason: replay?.idempotentReplay ? "idempotent-replay" : "idempotent-open",
        opening: {
          found: true,
          claimId: replay.claimId ?? null,
          requestId: replay.requestId || id,
          mode: replay.mode || null,
          claimDate: replay.claimDate || null,
          claimedAt: replay.claimedAt || null,
          cards,
          nextClaimAt: replay.nextClaimAt ?? null
        },
        requestId: id,
        result: replay
      };
    }
  } catch (error) {
    return { recovered: false, reason: "idempotent-open-error", error, requestId: id };
  }

  return { recovered: false, reason: "empty", requestId: id, opening: null };
}

export async function openStarBitsBoosterById(boosterId) {
  const { data, error } = await supabase.rpc("open_star_bits_booster_by_id", {
    requested_booster_id: boosterId
  });
  if (error) throw error;
  return data;
}

export { clearPendingOpeningRequest, ensurePendingOpeningRequest, readPendingOpeningRequest };
