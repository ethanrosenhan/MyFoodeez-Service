import  sequelize, {models} from '../utils/database.js';
import Sequelize from 'sequelize';
const Op = Sequelize.Op;
import  { log } from '../lib/log-helper.js';

const PROVIDER_NAME = 'WEGIFT';

const search = async (request, response) => {
	try {
		
		const page = parseInt(request.query.page || 1);
		const limit = parseInt(request.query.limit || 10);
		const offset = (page - 1) * limit;
		const keyword = request.query.keyword && request.query.keyword.length > 0 ? request.query.keyword + ':*' : '';
		
		log(request, '/journal/search', { keyword: keyword, page, page });

		// let brands = null;
		// if (request.query.keyword && request.query.keyword.length > 0) {
		// 	brands = await sequelize.query(
		// 		`SELECT * FROM brands where provider_name = '${PROVIDER_NAME}' and to_tsvector(brand_name) @@ to_tsquery(?) LIMIT ? OFFSET ?`, {
		// 		model: models.brand,
		// 		mapToModel: true,
		// 		replacements: [keyword, limit, offset]
		// 	});
		// } else {
		// 	brands = await models.brand.findAll({ 
		// 		where: {
		// 			provider_name: PROVIDER_NAME
		// 		},
		// 		limit: limit,
		// 		offset: offset,
		// 		order: [['brand_name', 'ASC']]
		// 	});
		// }

		const data = ["hello yo"];
		// brands.forEach(brand=> {
		// 	data.push({
		// 		id: brand.id,
		// 		brand_name: brand.brand_name,
		// 		brand_image: brand.brand_image
		// 	})
		// });
	
		response.json({
			data: data
		});
	} catch (e) {
		console.log(e);
		log(request, '/journal/search',  { error: e.message });
		response.json({error: e})
	}
}

export  { search };