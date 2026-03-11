import { models } from '../utils/database.js';
import Sequelize from 'sequelize';
import { log } from '../lib/log-helper.js';
import { sendError, sendSuccess } from '../lib/response-helper.js';

const Op = Sequelize.Op;

const mapPostToListItem = (post) => ({
    id: post.id,
    post_date: post.post_date,
    cuisine: post.cuisine,
    rating: post.rating,
    place: post.place,
    place_id: post.place_id,
    place_latitude: post.place_latitude,
    place_longitude: post.place_longitude,
    comments: post.comments,
    image_url: `/post/image/${post.id}`
});

const search = async (request, response) => {
    try {
        const page = parseInt(request.query.page || 1, 10);
        const limit = parseInt(request.query.limit || 10, 10);
        const offset = (page - 1) * limit;
        const placeId = request.query.placeId && request.query.placeId.length > 0 ? request.query.placeId : null;

        const whereClause = { user_id: request.user.id };
        if (placeId) {
            whereClause.place_id = placeId;
        }

        log(request, '/posts/search', { page, limit, placeId });

        const posts = await models.post.findAll({
            attributes: ['id', 'post_date', 'cuisine', 'place_id', 'rating', 'place', 'comments', 'place_latitude', 'place_longitude'],
            where: whereClause,
            limit,
            offset,
            order: [['post_date', 'DESC']]
        });

        return sendSuccess(response, 200, { data: posts.map(mapPostToListItem) });
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

        log(request, '/posts/places', { page, limit });
        const whereClause = {
            user_id: request.user.id,
            place_id: { [Op.not]: null }
        };

        const posts = await models.post.findAll({
            attributes: ['id', 'post_date', 'cuisine', 'rating', 'place', 'place_id', 'comments', 'place_latitude', 'place_longitude'],
            where: whereClause,
            limit,
            offset,
            order: [['post_date', 'DESC']]
        });

        const placesMap = {};
        posts.forEach((post) => {
            if (!placesMap[post.place_id]) {
                placesMap[post.place_id] = {
                    place_id: post.place_id,
                    place: post.place,
                    place_latitude: post.place_latitude,
                    place_longitude: post.place_longitude,
                    post_count: 1
                };
            } else {
                placesMap[post.place_id].post_count += 1;
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
