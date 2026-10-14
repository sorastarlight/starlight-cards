import { supabase } from "./supabase-client.js";
import "./card-catalog-service.js";

import {
    ACTIVE_COLLECTION_KEY,
    ACTIVE_FAVORITES_KEY,
    ACTIVE_QUANTITIES_KEY,
    OWNERSHIP_CHANGED_EVENT,
    OWNERSHIP_META_KEY,
    BROADCAST_CHANNEL_NAME,
    applyAwardedCardsToLocalStore,
    bindOwnershipToAuthUser,
    captureOwnershipEpoch,
    ownershipEpochMatches,
    readOwnershipMeta,
    replaceActiveOwnershipSnapshot
} from "./collection-local-store.js";
import {
    getCurrentUser,
    loadCloudCollection
} from "./collection-sync.js";

const COLLECTION_KEY = ACTIVE_COLLECTION_KEY;
const FAVORITES_KEY = ACTIVE_FAVORITES_KEY;
const QUANTITIES_KEY = ACTIVE_QUANTITIES_KEY;

const FAVORITE_CHECK_INTERVAL_MS = 1500;

let currentUser = null;
let favoriteMonitorTimer = null;
let previousFavoriteStore = {};
let favoriteSyncQueue = Promise.resolve();
let collectionRefreshQueue = Promise.resolve();
let collectionRefreshTimer = null;
let authLifecycleBound = false;
let ownershipListenersBound = false;

const COLLECTION_REFRESH_DEBOUNCE_MS = 350;

function shouldRefreshCollectionFromDetail(detail = {}) {
    const type = String(detail.type || "").trim();
    const source = String(detail.source || "").trim().toLowerCase();

    if (
        type === "starlight-wallet-changed" ||
        type === "starlight-rewards-changed" ||
        type === "starlight-collection-reconcile"
    ) {
        return true;
    }

    return /shop|daily|booster|gift|redeem|reward|received|duplicate-convert|quest|season|peer-gift/.test(source);
}

function scheduleCollectionRefresh(detail = {}) {
    if (!currentUser) return;

    const epoch = captureOwnershipEpoch();
    if (epoch.ownerId !== currentUser.id) return;

    const detailType = String(detail.type || "").trim();
    const awardedCards =
        detailType === "starlight-collection-reconcile"
            ? []
            : Array.isArray(detail.cards)
              ? detail.cards
              : [];
    if (awardedCards.length) {
        applyAwardedCardsToLocalStore(awardedCards, { epoch });
        if (ownershipEpochMatches(epoch) && typeof window.renderAll === "function") {
            window.renderAll();
        }
    }

    if (collectionRefreshTimer) {
        window.clearTimeout(collectionRefreshTimer);
    }

    collectionRefreshTimer = window.setTimeout(() => {
        collectionRefreshTimer = null;
        const queuedEpoch = captureOwnershipEpoch();
        collectionRefreshQueue = collectionRefreshQueue
            .then(async () => {
                if (!ownershipEpochMatches(queuedEpoch)) return;
                await synchronizeCloudCollection({
                    expectedEpoch: queuedEpoch
                });
                if (
                    ownershipEpochMatches(queuedEpoch) &&
                    typeof window.renderAll === "function"
                ) {
                    window.renderAll();
                }
            })
            .catch(error => {
                console.error(
                    "[Starlight] Collection refresh failed:",
                    error
                );
            });
    }, COLLECTION_REFRESH_DEBOUNCE_MS);
}

function startCollectionRefreshListener() {
    window.addEventListener("starlight-dashboard-refresh", event => {
        const detail = event.detail || {};
        if (!shouldRefreshCollectionFromDetail(detail)) return;
        scheduleCollectionRefresh(detail);
    });

    window.addEventListener("message", event => {
        if (event.origin !== window.location.origin) return;
        const detail = event.data || {};
        if (!shouldRefreshCollectionFromDetail(detail)) return;
        scheduleCollectionRefresh(detail);
    });

    document.addEventListener("visibilitychange", () => {
        if (document.hidden || !currentUser) return;
        scheduleCollectionRefresh({ source: "visibility" });
    });
}

/**
 * Safely reads one of the Binder's object-based localStorage values.
 */
function readLocalObject(key) {
    try {
        const rawValue =
            window.localStorage.getItem(key);

        if (!rawValue) {
            return {};
        }

        const parsedValue =
            JSON.parse(rawValue);

        if (
            !parsedValue ||
            typeof parsedValue !== "object" ||
            Array.isArray(parsedValue)
        ) {
            return {};
        }

        return parsedValue;
    } catch (error) {
        console.error(
            `[Starlight] Unable to read ${key}:`,
            error
        );

        return {};
    }
}

/**
 * Writes one of the Binder's object-based localStorage values.
 */
function writeLocalObject(key, value) {
    window.localStorage.setItem(
        key,
        JSON.stringify(value)
    );
}

/**
 * Converts Supabase ownership rows into the formats already used
 * by the original Binder.
 */
function createLocalStores(cloudRows) {
    const collectedCards = {};
    const favoriteCards = {};
    const quantities = {};

    for (const row of cloudRows) {
        const cardId =
            String(row?.card_id || "").trim();

        if (!cardId) {
            continue;
        }

        collectedCards[cardId] = true;
        quantities[cardId] = Math.max(1, Number(row.quantity || 1));

        if (row.is_favorite === true) {
            favoriteCards[cardId] = true;
        }
    }

    return {
        collectedCards,
        favoriteCards,
        quantities
    };
}

function stopFavoriteMonitor() {
    if (favoriteMonitorTimer) {
        window.clearInterval(favoriteMonitorTimer);
        favoriteMonitorTimer = null;
    }
    previousFavoriteStore = {};
}

function resetLocalSyncStateForOwner(user) {
    currentUser = user || null;
    stopFavoriteMonitor();
    favoriteSyncQueue = Promise.resolve();
    if (collectionRefreshTimer) {
        window.clearTimeout(collectionRefreshTimer);
        collectionRefreshTimer = null;
    }
    if (currentUser) {
        previousFavoriteStore = readLocalObject(FAVORITES_KEY);
        startFavoriteMonitor();
    }
}

async function readLiveSessionUser() {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
        return { user: null, sessionError: error, hasSession: false };
    }
    const user = data?.session?.user || null;
    return { user, sessionError: null, hasSession: Boolean(data?.session) };
}

/**
 * Downloads the signed-in user's cloud collection and mirrors it
 * into the localStorage keys used by app.js.
 *
 * Never clears ownership on transient getUser/network failures while a
 * session still exists. Never rebinds to an account that a newer shell
 * or tab has already superseded.
 */
async function synchronizeCloudCollection(options = {}) {
    const expectedEpoch =
        options.expectedEpoch || captureOwnershipEpoch();
    const callerGeneration = Number(
        options.notBeforeGeneration ?? expectedEpoch.generation ?? 0
    );

    const {
        user,
        error: userError
    } = await getCurrentUser();

    // Re-check session after the await so a concurrent sign-out/switch wins.
    const live = await readLiveSessionUser();

    if (userError || !user) {
        if (live.hasSession && live.user) {
            // Transient auth lookup failure — keep current ownership mirrors.
            console.warn(
                "[Starlight] Auth lookup failed while a session remains; ownership was not cleared.",
                userError
            );
            return {
                signedIn: true,
                synchronized: false,
                transientAuthError: true
            };
        }

        // Confirmed missing session only.
        bindOwnershipToAuthUser(null, {
            reason: "signed-out",
            notBeforeGeneration: callerGeneration
        });
        resetLocalSyncStateForOwner(null);

        console.log(
            "[Starlight] No signed-in account. Using the browser collection."
        );

        return {
            signedIn: false,
            synchronized: false
        };
    }

    if (!live.user || live.user.id !== user.id) {
        return {
            signedIn: Boolean(live.user),
            synchronized: false,
            stale: true
        };
    }

    if (
        expectedEpoch.ownerId &&
        expectedEpoch.ownerId !== user.id
    ) {
        return {
            signedIn: true,
            synchronized: false,
            stale: true
        };
    }

    // Another document already advanced ownership past this caller's view.
    const metaBeforeBind = readOwnershipMeta();
    if (
        metaBeforeBind.ownerId &&
        metaBeforeBind.ownerId !== user.id &&
        metaBeforeBind.generation > callerGeneration
    ) {
        return {
            signedIn: true,
            synchronized: false,
            stale: true,
            reason: "superseded-meta"
        };
    }

    if (options.rebind === false) {
        // Passive refresh for cross-tab adopt: never rewrite ownership meta.
        if (metaBeforeBind.ownerId !== user.id) {
            return {
                signedIn: true,
                synchronized: false,
                stale: true,
                reason: "passive-owner-mismatch"
            };
        }
    } else {
        const bindResult = bindOwnershipToAuthUser(user, {
            reason: options.bindReason || "cloud-sync",
            notBeforeGeneration: callerGeneration
        });
        if (bindResult.reason === "superseded") {
            return {
                signedIn: true,
                synchronized: false,
                stale: true,
                reason: "superseded"
            };
        }
    }

    const epoch = captureOwnershipEpoch();
    if (epoch.ownerId !== user.id) {
        return {
            signedIn: true,
            synchronized: false,
            stale: true
        };
    }

    resetLocalSyncStateForOwner(user);

    console.log(
        "[Starlight] Signed in as:",
        user.email
    );

    const {
        cards,
        error: collectionError
    } = await loadCloudCollection();

    // Session/owner may have changed during the network round-trip.
    const liveAfter = await readLiveSessionUser();
    if (!liveAfter.user || liveAfter.user.id !== user.id) {
        return {
            signedIn: Boolean(liveAfter.user),
            synchronized: false,
            stale: true
        };
    }

    if (!ownershipEpochMatches(epoch)) {
        return {
            signedIn: true,
            synchronized: false,
            stale: true
        };
    }

    if (collectionError) {
        throw collectionError;
    }

    const cloudRows =
        Array.isArray(cards)
            ? cards
            : [];

    const {
        collectedCards,
        favoriteCards,
        quantities
    } = createLocalStores(cloudRows);

    const applied = replaceActiveOwnershipSnapshot(
        {
            collected: collectedCards,
            favorites: favoriteCards,
            quantities
        },
        {
            expectedOwnerId: epoch.ownerId,
            expectedGeneration: epoch.generation
        }
    );

    if (!applied.applied) {
        return {
            signedIn: true,
            synchronized: false,
            stale: true
        };
    }

    previousFavoriteStore = {
        ...favoriteCards
    };

    const cardCount =
        Object.keys(collectedCards).length;

    const favoriteCount =
        Object.keys(favoriteCards).length;

    console.log(
        `[Starlight] Cloud synchronization complete: ${cardCount} collected card(s), ${favoriteCount} favorite card(s).`
    );

    return {
        signedIn: true,
        synchronized: true,
        cardCount,
        favoriteCount
    };
}

/**
 * Saves one favorite change through the protected Supabase
 * database function.
 */
async function saveFavoriteToCloud(
    cardId,
    favoriteState,
    previousState,
    epoch
) {
    if (!ownershipEpochMatches(epoch)) {
        return { skipped: true, reason: "stale-epoch" };
    }

    const {
        data,
        error
    } = await supabase.rpc(
        "set_card_favorite",
        {
            requested_card_id: cardId,
            favorite_state: favoriteState
        }
    );

    /*
     * The RPC may already have been accepted for the prior session.
     * If ownership moved, do not touch the next account's local favorites
     * (neither rollback nor success mirror). Server state for the prior
     * account is left as the server applied it.
     */
    if (!ownershipEpochMatches(epoch)) {
        return { skipped: true, reason: "stale-epoch-after-rpc", rpcCompleted: true };
    }

    if (error) {
        console.error(
            `[Starlight] Favorite sync failed for ${cardId}:`,
            error
        );

        /*
         * Roll the browser state back if Supabase rejects the change.
         * This normally happens if the account does not own the card.
         */
        const correctedStore =
            readLocalObject(FAVORITES_KEY);

        if (previousState) {
            correctedStore[cardId] = true;
        } else {
            delete correctedStore[cardId];
        }

        previousFavoriteStore = {
            ...correctedStore
        };

        writeLocalObject(
            FAVORITES_KEY,
            correctedStore
        );

        if (
            typeof window.renderAll ===
            "function"
        ) {
            window.renderAll();
        }

        window.StarlightUI?.toast?.(
            "Favorite could not sync. Your change was undone.",
            "error"
        );

        return { skipped: false, error };
    }

    console.log(
        `[Starlight] Favorite synchronized: ${cardId} = ${favoriteState}`,
        data
    );
    return { skipped: false, data };
}

/**
 * Detects changes made by app.js to the local favorites object and
 * sends those changes to Supabase.
 */
function checkForFavoriteChanges() {
    if (document.hidden) {
        return;
    }

    if (!currentUser) {
        return;
    }

    const epoch = captureOwnershipEpoch();
    if (epoch.ownerId !== currentUser.id) {
        return;
    }

    const latestFavoriteStore =
        readLocalObject(FAVORITES_KEY);

    const allCardIds =
        new Set([
            ...Object.keys(previousFavoriteStore),
            ...Object.keys(latestFavoriteStore)
        ]);

    const changes = [];

    for (const cardId of allCardIds) {
        const previousState =
            previousFavoriteStore[cardId] === true;

        const latestState =
            latestFavoriteStore[cardId] === true;

        if (previousState === latestState) {
            continue;
        }

        changes.push({
            cardId,
            previousState,
            latestState
        });
    }

    if (changes.length === 0) {
        return;
    }

    /*
     * Update our snapshot immediately so the same UI change is not
     * submitted repeatedly while the network request is running.
     */
    previousFavoriteStore = {
        ...latestFavoriteStore
    };

    for (const change of changes) {
        const changeEpoch = { ...epoch };
        favoriteSyncQueue =
            favoriteSyncQueue
                .then(() => {
                    return saveFavoriteToCloud(
                        change.cardId,
                        change.latestState,
                        change.previousState,
                        changeEpoch
                    );
                })
                .catch(error => {
                    console.error(
                        "[Starlight] Favorite synchronization queue failed:",
                        error
                    );
                });
    }
}

/**
 * Watches the favorite storage object for changes made by app.js.
 */
function startFavoriteMonitor() {
    if (
        !currentUser ||
        favoriteMonitorTimer
    ) {
        return;
    }

    previousFavoriteStore =
        readLocalObject(FAVORITES_KEY);

    favoriteMonitorTimer =
        window.setInterval(
            checkForFavoriteChanges,
            FAVORITE_CHECK_INTERVAL_MS
        );

    console.log(
        "[Starlight] Cloud favorite synchronization enabled."
    );
}

/**
 * Loads the original Binder application after cloud sync.
 */
async function loadBinderApplication() {
    const existingScript =
        document.querySelector(
            'script[data-starlight-app="true"]'
        );

    if (existingScript) {
        return;
    }

    window.StarlightCardFilters = await import('./card-filter-utils.js?v=1.1.2');
    window.StarlightFavoriteUtils = await import('./favorite-utils.js?v=1.0.0');

    return new Promise((resolve, reject) => {
        const perspectiveScript = document.createElement("script");
        perspectiveScript.src = "./js/starlight-perspective-card.js?v=1.0.1";
        perspectiveScript.async = false;

        perspectiveScript.addEventListener(
            "load",
            () => {
                const transitionScript = document.createElement("script");
                transitionScript.src = "./js/card-view-transition.js?v=1.0.1";
                transitionScript.async = false;

                transitionScript.addEventListener(
                    "load",
                    () => {
                        const script = document.createElement("script");
                        script.src = "./js/app.js?v=1.9.26";
                        script.async = false;
                        script.dataset.starlightApp = "true";

                        script.addEventListener(
                            "load",
                            () => {
                                console.log(
                                    "[Starlight] Binder application loaded."
                                );
                                resolve();
                            },
                            { once: true }
                        );

                        script.addEventListener(
                            "error",
                            () => {
                                reject(
                                    new Error(
                                        "The Binder application could not be loaded."
                                    )
                                );
                            },
                            { once: true }
                        );

                        document.body.appendChild(script);
                    },
                    { once: true }
                );

                transitionScript.addEventListener(
                    "error",
                    () => {
                        reject(
                            new Error(
                                "The card view transition module could not be loaded."
                            )
                        );
                    },
                    { once: true }
                );

                document.body.appendChild(transitionScript);
            },
            { once: true }
        );

        perspectiveScript.addEventListener(
            "error",
            () => {
                reject(
                    new Error(
                        "The premium card effect module could not be loaded."
                    )
                );
            },
            { once: true }
        );

        document.body.appendChild(perspectiveScript);
    });
}

/**
 * app.js normally initializes through DOMContentLoaded. Because it
 * loads after cloud synchronization, we send a replacement event.
 */
function startBinderApplication() {
    if (document.readyState === "loading") {
        return;
    }

    console.log(
        "[Starlight] Starting Binder application."
    );

    document.dispatchEvent(
        new Event("DOMContentLoaded")
    );
}

async function handleAuthOwnershipChange(event, session) {
    const nextUser = session?.user || null;
    const reason = String(event || "auth").toLowerCase();
    const priorEpoch = captureOwnershipEpoch();

    // Same account token refresh: keep local mirrors; cloud stays authoritative.
    if (
        reason === "token_refreshed" &&
        nextUser &&
        currentUser?.id === nextUser.id &&
        readOwnershipMeta().ownerId === nextUser.id
    ) {
        return;
    }

    // TOKEN_REFRESHED without a user is not a confirmed sign-out by itself;
    // wait for SIGNED_OUT / confirmed missing session before clearing.
    if (reason === "token_refreshed" && !nextUser) {
        const live = await readLiveSessionUser();
        if (live.hasSession && live.user) {
            return;
        }
        if (live.sessionError) {
            console.warn(
                "[Starlight] Token refresh reported no user, but session lookup erred; ownership kept.",
                live.sessionError
            );
            return;
        }
    }

    bindOwnershipToAuthUser(nextUser, {
        reason,
        notBeforeGeneration: priorEpoch.generation
    });
    resetLocalSyncStateForOwner(nextUser);

    if (!nextUser) {
        if (typeof window.renderAll === "function") {
            window.renderAll();
        }
        return;
    }

    try {
        await synchronizeCloudCollection({
            bindReason: reason,
            expectedEpoch: captureOwnershipEpoch(),
            notBeforeGeneration: priorEpoch.generation
        });
        if (typeof window.renderAll === "function") {
            window.renderAll();
        }
    } catch (error) {
        console.error(
            "[Starlight] Auth-driven collection sync failed:",
            error
        );
    }
}

function bindAuthLifecycle() {
    if (authLifecycleBound) return;
    authLifecycleBound = true;

    supabase.auth.onAuthStateChange((event, session) => {
        if (
            event === "INITIAL_SESSION" ||
            event === "SIGNED_IN" ||
            event === "SIGNED_OUT" ||
            event === "USER_UPDATED" ||
            event === "TOKEN_REFRESHED"
        ) {
            void handleAuthOwnershipChange(event, session);
        }
    });
}

function adoptOwnershipFromSharedMeta() {
    const meta = readOwnershipMeta();
    const nextId = meta.ownerId;
    if (nextId === currentUser?.id) {
        if (typeof window.renderAll === "function") {
            window.renderAll();
        }
        return;
    }

    // Passive adopt only — never rewrite ownership meta from cross-tab events
    // (avoids storage ↔ sync ↔ storage bounce loops).
    currentUser = nextId ? { id: nextId } : null;
    stopFavoriteMonitor();
    if (currentUser) {
        previousFavoriteStore = readLocalObject(FAVORITES_KEY);
        startFavoriteMonitor();
        void synchronizeCloudCollection({
            bindReason: "storage-event",
            rebind: false,
            expectedEpoch: meta,
            notBeforeGeneration: meta.generation
        }).then(() => {
            if (typeof window.renderAll === "function") {
                window.renderAll();
            }
        }).catch(error => {
            console.error(
                "[Starlight] Cross-tab collection sync failed:",
                error
            );
        });
    } else if (typeof window.renderAll === "function") {
        window.renderAll();
    }
}

function bindCrossTabOwnershipListeners() {
    if (ownershipListenersBound) return;
    ownershipListenersBound = true;

    // Same-document ownership writes already update currentUser via auth/sync
    // handlers. Only re-render here — do not re-enter sync (loop risk).
    window.addEventListener(OWNERSHIP_CHANGED_EVENT, () => {
        if (typeof window.renderAll === "function") {
            window.renderAll();
        }
    });

    // `storage` fires only in *other* documents/tabs for localStorage writes.
    window.addEventListener("storage", event => {
        if (event.key !== OWNERSHIP_META_KEY) return;
        adoptOwnershipFromSharedMeta();
    });

    try {
        if (typeof BroadcastChannel === "function") {
            const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
            channel.addEventListener("message", message => {
                if (message?.data?.type !== OWNERSHIP_CHANGED_EVENT) return;
                // Prefer storage-driven adopt for owner changes; channel is render-only.
                if (typeof window.renderAll === "function") {
                    window.renderAll();
                }
            });
        }
    } catch {
        /* ignore */
    }
}

/**
 * Synchronizes cloud ownership, starts the original Binder, and
 * then begins monitoring favorites.
 */
async function initializeStarlightBinder() {
    document.documentElement.classList.add(
        "starlight-cloud-loading"
    );

    bindAuthLifecycle();
    bindCrossTabOwnershipListeners();

    try {
        // Resolve session before first paint of ownership UI when possible.
        const { data: sessionData } = await supabase.auth.getSession();
        const sessionUser = sessionData?.session?.user || null;
        const priorMeta = readOwnershipMeta();
        const sessionOwnerId = sessionUser?.id || null;
        const ownershipMismatch = priorMeta.ownerId !== sessionOwnerId;
        bindOwnershipToAuthUser(sessionUser, {
            reason: sessionUser ? "initial-session" : "initial-signed-out",
            // Only force-clear when the cached owner disagrees with the session.
            force: ownershipMismatch
        });
        resetLocalSyncStateForOwner(sessionUser);

        await synchronizeCloudCollection({
            bindReason: "startup",
            expectedEpoch: captureOwnershipEpoch()
        });
    } catch (error) {
        console.error(
            "[Starlight] Cloud synchronization failed. Continuing with the browser collection:",
            error
        );
    }

    try {
        await loadBinderApplication();

        startBinderApplication();

        startFavoriteMonitor();
        startCollectionRefreshListener();
    } catch (error) {
        console.error(
            "[Starlight] Binder startup failed:",
            error
        );
    } finally {
        document.documentElement.classList.remove(
            "starlight-cloud-loading"
        );

        window.dispatchEvent(
            new CustomEvent(
                "starlight-cloud-ready"
            )
        );
    }
}

initializeStarlightBinder();
