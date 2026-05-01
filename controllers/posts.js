import { models } from '../utils/database.js';
import Sequelize from 'sequelize';
import { log } from '../lib/log-helper.js';
import { sendError, sendSuccess } from '../lib/response-helper.js';
import { getPostAccessWhere, mapOwnerSummary } from '../lib/social-helper.js';

const Op = Sequelize.Op;

const mapPostToListItem = (post, requestUserId) => ({
    id: post.id,
    post_date: post.post_date,
    cuisine: post.cuisine,
    rating: post.rating,
    place: post.place,
    place_id: post.place_id,
    place_secondary_text: post.place_secondary_text,
    place_latitude: post.place_latitude,
    place_longitude: post.place_longitude,
    comments: post.comments,
    image_url: `/post/image/${post.id}`,
    is_private: post.is_private,
    is_mine: post.user_id === requestUserId,
    owner: mapOwnerSummary(post.user)
});

const normalizeScope = (scope) => ['mine', 'friends', 'all'].includes(scope) ? scope : 'mine';

const search = async (request, response) => {
    try {
        const page = parseInt(request.query.page || 1, 10);
        const limit = parseInt(request.query.limit || 10, 10);
        const offset = (page - 1) * limit;
        const placeId = request.query.placeId && request.query.placeId.length > 0 ? request.query.placeId : null;
        const scope = normalizeScope(request.query.scope);

        const whereClause = await getPostAccessWhere(request.user.id, scope);
        if (placeId) {
            whereClause.place_id = placeId;
        }

        log(request, '/posts/search', { page, limit, placeId, scope });

        const posts = await models.post.findAll({
            attributes: ['id', 'user_id', 'post_date', 'cuisine', 'place_id', 'rating', 'place', 'place_secondary_text', 'comments', 'place_latitude', 'place_longitude', 'is_private'],
            where: whereClause,
            include: [{ model: models.user, attributes: ['id', 'email', 'first_name', 'last_name'] }],
            limit,
            offset,
            order: [['post_date', 'DESC']]
        });

        return sendSuccess(response, 200, { data: posts.map((post) => mapPostToListItem(post, request.user.id)) });
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

        log(request, '/posts/places', { page, limit, scope, placeName });
        const whereClause = await getPostAccessWhere(request.user.id, scope);
        whereClause.place_id = { [Op.not]: null };
        if (placeName) {
            whereClause.place = placeName;
        }

        const posts = await models.post.findAll({
            attributes: ['id', 'user_id', 'post_date', 'cuisine', 'rating', 'place', 'place_id', 'comments', 'place_latitude', 'place_longitude', 'is_private'],
            where: whereClause,
            include: [{ model: models.user, attributes: ['id', 'email', 'first_name', 'last_name'] }],
            limit,
            offset,
            order: [['post_date', 'DESC']]
        });

        const placesMap = {};
        posts.forEach((post) => {
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
                    latest_comments: post.comments,
                    latest_post_date: post.post_date
                };
            } else {
                placesMap[post.place_id].post_count += 1;
                if (postIsMine && !placesMap[post.place_id].is_mine) {
                    placesMap[post.place_id].is_mine = true;
                    placesMap[post.place_id].owner = mapOwnerSummary(post.user);
                }
            }
        });

        return sendSuccess(response, 200, { data: Object.values(placesMap) });
    } catch (error) {
        console.error('places fetch failed', error);
        log(request, '/posts/places', { error: error.message });
        return sendError(response, 500, 'Unable to load places', 'places_fetch_failed');
    }
};

export { search, places };
