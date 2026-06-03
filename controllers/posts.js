import { models } from '../utils/database.js';
import Sequelize from 'sequelize';
import { log } from '../lib/log-helper.js';
import { sendError, sendSuccess } from '../lib/response-helper.js';
import { getPostAccessWhere, mapOwnerSummary } from '../lib/social-helper.js';
import { findById as findCuisineById } from '../constants/cuisines.js';

const Op = Sequelize.Op;

const VALID_SORTS = ['date', 'rating'];

const buildPostImageUrls = (postId, imageCount) => {
    if (imageCount > 0) {
        return Array.from({ length: imageCount }, (_, idx) => `/post/${postId}/image/${idx}`);
    }
    return [`/post/image/${postId}`];
};

const mapPostToListItem = (post, requestUserId, imageCount) => {
    const imageUrls = buildPostImageUrls(post.id, imageCount);
    return {
        id: post.id,
        post_date: post.post_date,
        cuisine: post.cuisine,
        cuisine_id: post.cuisine_id,
        rating: post.rating,
        place: post.place,
        place_id: post.place_id,
        place_secondary_text: post.place_secondary_text,
        place_latitude: post.place_latitude,
        place_longitude: post.place_longitude,
        comments: post.comments,
        image_url: imageUrls[0] || null,
        image_urls: imageUrls,
        is_private: post.is_private,
        is_mine: post.user_id === requestUserId,
        owner: mapOwnerSummary(post.user)
    };
};

const loadImageCountsForPosts = async (postIds) => {
    if (postIds.length === 0) {
        return new Map();
    }
    const rows = await models.post_image.findAll({
        attributes: ['post_id', [Sequelize.fn('COUNT', Sequelize.col('id')), 'image_count']],
        where: { post_id: { [Op.in]: postIds } },
        group: ['post_id'],
        raw: true
    });
    const map = new Map();
    rows.forEach((row) => {
        map.set(Number(row.post_id), Number(row.image_count));
    });
    return map;
};

const normalizeScope = (scope) => ['mine', 'friends', 'all'].includes(scope) ? scope : 'mine';

const extractMainText = (place, secondary) => {
    if (typeof place !== 'string' || place.length === 0) {
        return '';
    }
    if (typeof secondary === 'string' && secondary.length > 0 && place.endsWith(secondary)) {
        const stripped = place.slice(0, place.length - secondary.length).trim();
        return stripped.endsWith(',') ? stripped.slice(0, -1).trim() : stripped;
    }
    const idx = place.indexOf(',');
    return (idx >= 0 ? place.slice(0, idx) : place).trim();
};

const extractRestaurantBaseName = (mainText) => {
    if (typeof mainText !== 'string' || mainText.length === 0) {
        return '';
    }
    const idx = mainText.indexOf(' - ');
    return (idx >= 0 ? mainText.slice(0, idx) : mainText).trim();
};

const escapeLikePattern = (value) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

const search = async (request, response) => {
    try {
        const page = parseInt(request.query.page || 1, 10);
        const limit = parseInt(request.query.limit || 10, 10);
        const offset = (page - 1) * limit;
        const placeId = request.query.placeId && request.query.placeId.length > 0 ? request.query.placeId : null;
        const scope = normalizeScope(request.query.scope);
        const sort = VALID_SORTS.includes(request.query.sort) ? request.query.sort : 'date';

        const whereClause = await getPostAccessWhere(request.user.id, scope);
        if (placeId) {
            whereClause.place_id = placeId;
        }

        // `rating` is stored as STRING in the DB; CAST to FLOAT so Postgres
        // sorts numerically (otherwise "10" < "2" lexically). When community
        // upvotes are added later, add another branch here (e.g. 'stars').
        const orderClause = sort === 'rating'
            ? [
                [Sequelize.literal('CAST(rating AS FLOAT) DESC NULLS LAST')],
                ['post_date', 'DESC']
            ]
            : [['post_date', 'DESC']];

        log(request, '/posts/search', { page, limit, placeId, scope, sort });

        const posts = await models.post.findAll({
            attributes: ['id', 'user_id', 'post_date', 'cuisine', 'cuisine_id', 'place_id', 'rating', 'place', 'place_secondary_text', 'comments', 'place_latitude', 'place_longitude', 'is_private'],
            where: whereClause,
            include: [{ model: models.user, attributes: ['id', 'email', 'first_name', 'last_name'] }],
            limit,
            offset,
            order: orderClause
        });

        const imageCounts = await loadImageCountsForPosts(posts.map((p) => p.id));

        return sendSuccess(response, 200, {
            data: posts.map((post) => mapPostToListItem(post, request.user.id, imageCounts.get(post.id) || 0))
        });
    } catch (error) {
        console.error('search posts failed', error);
        log(request, '/posts/search', { error: error.message });
        return sendError(response, 500, 'Unable to load posts', 'posts_fetch_failed');
    }
};

const places = async (request, response) => {
    try {
        const page = parseInt(request.query.page || 1, 10);
        const limit = parseInt(request.query.limit || 200, 10);
        const offset = (page - 1) * limit;
        const scope = normalizeScope(request.query.scope);
        const placeName = typeof request.query.placeName === 'string' && request.query.placeName.length > 0
            ? request.query.placeName
            : null;
        const placeSecondaryText = typeof request.query.placeSecondaryText === 'string' && request.query.placeSecondaryText.length > 0
            ? request.query.placeSecondaryText
            : null;

        // Cuisine filter: validate against taxonomy. We accept any id, but
        // matching is prefix-based so passing a top-level (e.g. 'pizza') also
        // matches all children ('pizza-ny', 'pizza-neapolitan', ...).
        const rawCuisine = typeof request.query.cuisine === 'string' ? request.query.cuisine : null;
        const cuisineEntry = rawCuisine ? findCuisineById(rawCuisine) : null;
        const cuisineId = cuisineEntry ? cuisineEntry.id : null;

        const baseName = placeName
            ? extractRestaurantBaseName(extractMainText(placeName, placeSecondaryText))
            : null;

        log(request, '/posts/places', { page, limit, scope, placeName, baseName, cuisineId });
        const whereClause = await getPostAccessWhere(request.user.id, scope);
        whereClause.place_id = { [Op.not]: null };
        if (baseName) {
            const escapedBase = escapeLikePattern(baseName);
            whereClause.place = {
                [Op.or]: [
                    baseName,
                    { [Op.like]: `${escapedBase},%` },
                    { [Op.like]: `${escapedBase} -%` }
                ]
            };
        } else if (placeName) {
            whereClause.place = placeName;
        }
        if (cuisineId) {
            const escapedCuisine = escapeLikePattern(cuisineId);
            whereClause.cuisine_id = {
                [Op.or]: [
                    cuisineId,
                    { [Op.like]: `${escapedCuisine}-%` }
                ]
            };
        }

        const posts = await models.post.findAll({
            attributes: ['id', 'user_id', 'post_date', 'cuisine', 'cuisine_id', 'rating', 'place', 'place_id', 'place_secondary_text', 'comments', 'place_latitude', 'place_longitude', 'is_private'],
            where: whereClause,
            include: [{ model: models.user, attributes: ['id', 'email', 'first_name', 'last_name'] }],
            limit,
            offset,
            order: [['post_date', 'DESC']]
        });

        const filteredPosts = baseName
            ? posts.filter((post) => extractRestaurantBaseName(extractMainText(post.place, post.place_secondary_text)).toLowerCase() === baseName.toLowerCase())
            : posts;

        // Aggregate posts into places, and at the same time tally per-place
        // cuisine counts so we can pick a "top cuisine" for the pin. Tie-break
        // by most recent (post_date is already DESC ordered from the query).
        const placesMap = {};
        const cuisineTallies = {};
        filteredPosts.forEach((post) => {
            const postIsMine = post.user_id === request.user.id;
            if (!placesMap[post.place_id]) {
                placesMap[post.place_id] = {
                    place_id: post.place_id,
                    place: post.place,
                    place_secondary_text: post.place_secondary_text,
                    place_latitude: post.place_latitude,
                    place_longitude: post.place_longitude,
                    post_count: 1,
                    is_mine: postIsMine,
                    owner: mapOwnerSummary(post.user),
                    latest_post_id: post.id,
                    latest_rating: post.rating,
                    latest_cuisine: post.cuisine,
                    latest_cuisine_id: post.cuisine_id,
                    latest_comments: post.comments,
                    latest_post_date: post.post_date
                };
                cuisineTallies[post.place_id] = new Map();
            } else {
                placesMap[post.place_id].post_count += 1;
                if (postIsMine && !placesMap[post.place_id].is_mine) {
                    placesMap[post.place_id].is_mine = true;
                    placesMap[post.place_id].owner = mapOwnerSummary(post.user);
                }
            }
            // Tally cuisine_id occurrences for this place. null counts too so
            // we know when "Other / free-text" is the modal cuisine.
            const tally = cuisineTallies[post.place_id];
            const key = post.cuisine_id || '__null__';
            tally.set(key, (tally.get(key) || 0) + 1);
        });

        // Resolve top_cuisine_id per place: highest count, tie-break by most
        // recent post (the first one seen, since posts arrived post_date DESC).
        Object.keys(placesMap).forEach((placeId) => {
            const tally = cuisineTallies[placeId];
            let topKey = null;
            let topCount = -1;
            // Map iteration preserves insertion order, so first-seen wins ties.
            tally.forEach((count, key) => {
                if (count > topCount) {
                    topCount = count;
                    topKey = key;
                }
            });
            const topId = topKey === '__null__' ? null : topKey;
            placesMap[placeId].top_cuisine_id = topId;
            placesMap[placeId].top_cuisine_label = topId
                ? (findCuisineById(topId)?.label || null)
                : null;
        });

        return sendSuccess(response, 200, { data: Object.values(placesMap) });
    } catch (error) {
        console.error('places fetch failed', error);
        log(request, '/posts/places', { error: error.message });
        return sendError(response, 500, 'Unable to load places', 'places_fetch_failed');
    }
};

export { search, places };
