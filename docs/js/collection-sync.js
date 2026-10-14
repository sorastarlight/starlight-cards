import { supabase } from "./supabase-client.js";
import {
    applyAwardedCardsToLocalStore,
    readLegacyGuestCollection
} from "./collection-local-store.js";

export { applyAwardedCardsToLocalStore } from "./collection-local-store.js";

function compareOwnedCardRows(a, b) {
    const aCard = a?.cards || {};
    const bCard = b?.cards || {};
    const aSeries = aCard.card_series || {};
    const bSeries = bCard.card_series || {};
    const seriesSortDiff =
        Number(aSeries.sort_order ?? aSeries.sortOrder ?? 0)
        - Number(bSeries.sort_order ?? bSeries.sortOrder ?? 0);
    if (seriesSortDiff !== 0) return seriesSortDiff;

    const sortDiff =
        Number(aCard.sort_order ?? aCard.sortOrder ?? 0)
        - Number(bCard.sort_order ?? bCard.sortOrder ?? 0);
    if (sortDiff !== 0) return sortDiff;

    return String(a?.card_id || "").localeCompare(
        String(b?.card_id || ""),
        undefined,
        { numeric: true }
    );
}

/**
 * Reads the guest/legacy browser collection for explicit import.
 * Prefers the guest archive; never treats another account's active
 * mirror as importable guest data.
 */
export function readLegacyCollection() {
    return readLegacyGuestCollection();
}

/**
 * Creates a repeatable SHA-256 hash for the import.
 *
 * Importing the same exact local collection twice will produce
 * the same hash, allowing Supabase to reject duplicate imports.
 */
export async function createCollectionHash(cardIds) {
    const normalizedValue =
        JSON.stringify(
            [...cardIds].sort()
        );

    const encodedValue =
        new TextEncoder().encode(
            normalizedValue
        );

    const hashBuffer =
        await window.crypto.subtle.digest(
            "SHA-256",
            encodedValue
        );

    return Array.from(
        new Uint8Array(hashBuffer)
    )
        .map(byte => {
            return byte
                .toString(16)
                .padStart(2, "0");
        })
        .join("");
}

/**
 * Returns the current authenticated user.
 */
export async function getCurrentUser() {
    const {
        data,
        error
    } = await supabase.auth.getUser();

    if (error) {
        console.error(
            "Unable to retrieve the signed-in user:",
            error
        );

        return {
            user: null,
            error
        };
    }

    return {
        user: data.user,
        error: null
    };
}

/**
 * Loads catalog details for a list of card IDs.
 */
export async function loadCatalogCards(cardIds) {
    if (!Array.isArray(cardIds) || cardIds.length === 0) {
        return {
            cards: [],
            error: null
        };
    }

    const {
        data,
        error
    } = await supabase
        .from("cards")
        .select(`
            id,
            card_number,
            name,
            rarity,
            thumbnail_url,
            image_url,
            series_id
        `)
        .in("id", cardIds)
        .order("sort_order", {
            ascending: true
        });

    if (error) {
        console.error(
            "Unable to load card information:",
            error
        );

        return {
            cards: [],
            error
        };
    }

    return {
        cards: data || [],
        error: null
    };
}

/**
 * Imports the old browser collection through the secure
 * Supabase database function.
 */
export async function importLegacyCollection(cardIds) {
    if (!Array.isArray(cardIds)) {
        throw new Error(
            "The supplied collection is invalid."
        );
    }

    if (cardIds.length === 0) {
        throw new Error(
            "There are no collected cards to import."
        );
    }

    const importHash =
        await createCollectionHash(cardIds);

    const {
        data,
        error
    } = await supabase.rpc(
        "import_legacy_collection",
        {
            collected_card_ids: cardIds,
            requested_import_hash: importHash
        }
    );

    if (error) {
        console.error(
            "Collection import failed:",
            error
        );

        throw error;
    }

    return data;
}

/**
 * Loads all cards owned by the current signed-in user.
 */
export async function loadCloudCollection() {
    const {
        data,
        error
    } = await supabase
        .from("user_cards")
        .select(`
            card_id,
            quantity,
            is_favorite,
            first_obtained_at,
            last_obtained_at,
            cards (
                id,
                card_number,
                name,
                rarity,
                thumbnail_url,
                image_url,
                series_id,
                sort_order,
                card_series (
                    sort_order
                )
            )
        `)
        .order("card_id", {
            ascending: true
        });

    if (error) {
        console.error(
            "Unable to load the cloud collection:",
            error
        );

        return {
            cards: [],
            error
        };
    }

    const cards = Array.isArray(data) ? [...data].sort(compareOwnedCardRows) : [];

    return {
        cards,
        error: null
    };
}

