import { models } from '../utils/database.js';
import { sendError, sendSuccess } from '../lib/response-helper.js';
import { findById as findCuisineById } from '../constants/cuisines.js';
import { log } from '../lib/log-helper.js';

const toNullableString = (value) => {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};

const mapIntentToListItem = (row) => ({
    id: row.id,
    place_id: row.place_id,
    place: row.place,
    place_secondary_text: row.place_secondary_text,
    place_latitude: row.place_latitude,
    place_longitude: row.place_longitude,
    cuisine_id: row.cuisine_id,
    cuisine_label: row.cuisine_id ? (findCuisineById(row.cuisine_id)?.label || null) : null,
    note: row.note,
    created_at: row.created_at
});

// Shape that matches /posts/places so ExploreScreen.native can reuse the
// same pin-rendering code path when the "On my list" filter is active.
const mapIntentToPlace = (row) => ({
    place_id: row.place_id,
    place: row.place,
    place_secondary_text: row.place_secondary_text,
    place_latitude: row.place_latitude,
    place_longitude: row.place_longitude,
    post_count: 0, // wishlist places have no posts yet by definition
    is_mine: true, // shown on the user's own map
    owner: null,
    is_wishlist: true,
    cuisine_id: row.cuisine_id,
    top_cuisine_id: row.cuisine_id,
    top_cuisine_label: row.cuisine_id ? (findCuisineById(row.cuisine_id)?.label || null) : null,
    latest_post_id: null,
    latest_rating: null,
    latest_cuisine: null,
    latest_cuisine_id: null,
    latest_comments: row.note,
    latest_post_date: row.created_at
});

const addToWishlist = async (request, response) => {
    try {
        const body = request.body || {};
        const place_id = toNullableString(body.place_id);
        if (!place_id) {
            return sendError(response, 400, 'place_id is required', 'wishlist_missing_place_id');
        }
        const place = toNullableString(body.place);
        const place_secondary_text = toNullableString(body.place_secondary_text);
        const place_latitude = toNullableString(body.place_latitude);
        const place_longitude = toNullableString(body.place_longitude);
        const cuisine_id = toNullableString(body.cuisine_id);
        const note = toNullableString(body.note);

        // Idempotent: a re-add returns the existing row instead of erroring on
        // the unique (user_id, place_id) constraint. Update the captured place
        // metadata on re-add so a fresher payload from the client wins.
        const [row, created] = await models.user_place_intent.findOrCreate({
            where: { user_id: request.user.id, place_id },
            defaults: {
                user_id: request.user.id,
                place_id,
                place,
                place_secondary_text,
                place_latitude,
                place_longitude,
                cuisine_id,
                note
            }
        });

        if (!created) {
            await row.update({
                place: place || row.place,
                place_secondary_text: place_secondary_text || row.place_secondary_text,
                place_latitude: place_latitude || row.place_latitude,
                place_longitude: place_longitude || row.place_longitude,
                cuisine_id: cuisine_id || row.cuisine_id,
                note: note ?? row.note
            });
        }

        log(request, '/wishlist', { action: 'add', place_id, created });
        return sendSuccess(response, created ? 201 : 200, mapIntentToListItem(row));
    } catch (error) {
        console.error('addToWishlist failed', error);
        return sendError(response, 500, 'Unable to add to wishlist', 'wishlist_add_failed');
    }
};

const removeFromWishlist = async (request, response) => {
    try {
        const place_id = request.params.placeId;
        if (!place_id) {
            return sendError(response, 400, 'place_id is required', 'wishlist_missing_place_id');
        }
        const deleted = await models.user_place_intent.destroy({
            where: { user_id: request.user.id, place_id }
        });
        log(request, '/wishlist', { action: 'remove', place_id, deleted });
        return sendSuccess(response, 200, { deleted: deleted > 0 });
    } catch (error) {
        console.error('removeFromWishlist failed', error);
        return sendError(response, 500, 'Unable to remove from wishlist', 'wishlist_remove_failed');
    }
};

const listWishlist = async (request, response) => {
    try {
        const rows = await models.user_place_intent.findAll({
            where: { user_id: request.user.id },
            order: [['created_at', 'DESC']]
        });
        return sendSuccess(response, 200, { data: rows.map(mapIntentToListItem) });
    } catch (error) {
        console.error('listWishlist failed', error);
        return sendError(response, 500, 'Unable to load wishlist', 'wishlist_fetch_failed');
    }
};

const listWishlistPlaces = async (request, response) => {
    try {
        const rows = await models.user_place_intent.findAll({
            where: { user_id: request.user.id },
            order: [['created_at', 'DESC']]
        });
        // Only return wishlist entries that have geocoordinates — the map
        // can't render the others. The full list endpoint above includes them.
        const placesWithCoords = rows.filter((row) =>
            Number.isFinite(Number(row.place_latitude)) && Number.isFinite(Number(row.place_longitude))
        );
        return sendSuccess(response, 200, { data: placesWithCoords.map(mapIntentToPlace) });
    } catch (error) {
        console.error('listWishlistPlaces failed', error);
        return sendError(response, 500, 'Unable to load wishlist places', 'wishlist_places_failed');
    }
};

export { addToWishlist, removeFromWishlist, listWishlist, listWishlistPlaces };
