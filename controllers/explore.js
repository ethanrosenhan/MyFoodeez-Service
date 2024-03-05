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
		
		log(request, '/post/search', { keyword: keyword, page, page });

		const posts = await models.post.findAll({ 
				attributes: ['id', 'post_date', 'cuisine', 'place', 'place_latitude', 'place_longitude'],
				where: { user_id: request.user.id },
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
				place: post.place,
				place_latitude: post.place_latitude,
				place_longitude: post.place_longitude,
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
export { search };