import  sequelize, {models} from '../utils/database.js';

import * as formidable from 'formidable';
import fs from 'fs/promises';
import Sequelize from 'sequelize';
const Op = Sequelize.Op;
import  { log } from '../lib/log-helper.js';


const addEntry = async (request, response) => {
	try {
	
		var form = new formidable.IncomingForm();
		form.keepExtensions = true;
		const [fields, files] = await form.parse(request);
		const place = fields['place'] ? fields['place'][0] : 'Unknown';
		const cuisine = fields['cuisine'] ? fields['cuisine'][0] : 'Unknown';
		const file = files[Object.keys(files)[0]][0];
		const data = await fs.readFile(file.filepath);
		const journal_entry = await models.journal_entry.create(({
			place: place,
			entry_date: new Date(),
			cuisine: cuisine,
			image_type:  file.mimetype,
			image_name: file.originalFilename,
			image_data: data,
			is_private: true
		}));
		return response.status(201).json({
			image: journal_entry.image_data.toString('base64')
		});

	} catch (error) {
			return response.status(500).json({ error: error.message });
	}

}

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

		const data = [{ id: '12345', name: 'COMING SOON'}];
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

export  { addEntry, search };