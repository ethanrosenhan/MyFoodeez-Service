import  sequelize, {models} from '../utils/database.js';
import Sequelize from 'sequelize';
const Op = Sequelize.Op;
import  { log } from '../lib/log-helper.js';
const search = async (request, response) => {
	try {
		const page = parseInt(request.query.page || 1);
		const limit = parseInt(request.query.limit || 10);
		const offset = (page - 1) * limit;
		const keyword = request.query.keyword && request.query.keyword.length > 0 ? request.query.keyword + ':*' : '';


		const placeId = request.query.placeId && request.query.placeId.length > 0 ? request.query.placeId : null;


		log(request, '/posts/places', { keyword: keyword, page, page });
		const whereClause = { user_id: request.user.id };
		if (placeId) {
			whereClause.place_id = placeId;
		}

		log(request, '/posts/search', { keyword: keyword, page, page });

		const posts = await models.post.findAll({ 
				attributes: ['id', 'post_date', 'cuisine', 'place_id', 'rating','place', 'comments','place_latitude', 'place_longitude'],
				where: whereClause,
				limit: limit,
				offset: offset,
				order: [['post_date', 'DESC']]
		});

		const data = [];
		posts.forEach(post=> {
			data.push({
				id: post.id,
				post_date: post.post_date,
				cuisine: post.cuisine,
				rating: post.rating,
				place: post.place,
				place_id: post.place_id,
				place_latitude: post.place_latitude,
				place_longitude: post.place_longitude,
				comments: post.comments,
				image_url: '/post/image/' + post.id
			})
		});
		response.json({
			data: data
		});

	} catch (e) {
		console.log(e);
		log(request, '/post/search',  { error: e.message });
		response.json({error: e})
	}
}

const places = async (request, response) => {
	try {
		const page = parseInt(request.query.page || 1);
		const limit = parseInt(request.query.limit || 10);
		const offset = (page - 1) * limit;

		log(request, '/posts/places', { page, page });
		const whereClause = { 
			user_id: request.user.id,
			place_id: { [Op.not]: null }
		 };

		const posts = await models.post.findAll({
				attributes: ['id', 'post_date', 'cuisine', 'rating','place', 'place_id', 'comments','place_latitude', 'place_longitude'],
				where: whereClause,
				limit: limit,
				offset: offset,
				order: [['post_date', 'DESC']]
		});

		const places = {};
		posts.forEach(post=> {
			if (!places[post.place_id]) {
				places[post.place_id] = {
					place_id: post.place_id,
					place: post.place,
					place_latitude: post.place_latitude,
					place_longitude: post.place_longitude,
					post_count: 1
				}
			} else {
				places[post.place_id].post_count++;
			}

		});
		response.json({
			data: Object.values(places)
		});

	} catch (e) {
		console.log(e);
		log(request, '/post/search',  { error: e.message });
		response.json({error: e})
	}
}
export { search, places };