import  sequelize, {models} from '../utils/database.js';
import * as formidable from 'formidable';
import Sequelize from 'sequelize';
const Op = Sequelize.Op;
import  { log } from '../lib/log-helper.js';
import { 
    INVALID_REQUEST_ERROR
} from '../constants/global.js';

const addEntry = async (request, response) => {
	try {
	
		var form = new formidable.IncomingForm();
		form.keepExtensions = true;
		const [fields] = await form.parse(request);
		const place = fields['place'] ? fields['place'][0] : 'Unknown';
		const cuisine = fields['cuisine'] ? fields['cuisine'][0] : 'Unknown';
		const file = fields['file'] ? fields['file'][0]: null;
		//TODO: collect image type and size from the client
		if (!file || file === 'null') {
			return response.status(400).json({message: INVALID_REQUEST_ERROR});
		}

		const imageType = 'image/png';
		const imageName = 'Unknown';
		const journal_entry = await models.journal_entry.create(({
			place: place,
			entry_date: new Date(),
			cuisine: cuisine,
			image_type:  imageType,
			image_name: imageName,
			image_data: Buffer.from(file, "base64"),
			is_private: true
		}));
		return response.status(201).json({
			image: journal_entry.image_data.toString('base64')
		});

	} catch (error) {
			console.log(error);
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

		const entries = await models.journal_entry.findAll({ 
				attributes: ['id', 'entry_date', 'cuisine', 'place'],
				//where: { provider_name: PROVIDER_NAME },
				limit: limit,
				offset: offset,
				order: [['entry_date', 'DESC']]
		});

		const data = [];
		entries.forEach(entry=> {
			data.push({
				id: entry.id,
				entry_date: entry.entry_date,
				cuisine: entry.cuisine,
				place: entry.place,
				image_url: '/journal/image/' + entry.id
			})
		});

		response.json({
			data: data
		});

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

		//const data = [{ id: '12345', name: 'COMING SOON'}];
		// brands.forEach(brand=> {
		// 	data.push({
		// 		id: brand.id,
		// 		brand_name: brand.brand_name,
		// 		brand_image: brand.brand_image
		// 	})
		// });
	
		// response.json({
		// 	data: data
		// });
	} catch (e) {
		console.log(e);
		log(request, '/journal/search',  { error: e.message });
		response.json({error: e})
	}
}
const image = async (request, response) => {
	const entry = await models.journal_entry.findOne({ 
		attributes: ['image_data'],
		where: { id: request.params.id }
	});

	response.writeHead(200, {
     'Content-Type': 'image/png',
     'Content-Length': entry.image_data.length
   	});

	const img = Buffer.from(entry.image_data, 'base64');

	response.end(img);
}
const entry = async (request, response) => {

	const entry = await models.journal_entry.findOne({ 
		attributes: ['id', 'entry_date', 'cuisine', 'place'],
		where: { id: request.params.id }
	});
	const data = {
		id: entry.id,
		entry_date: entry.entry_date,
		cuisine: entry.cuisine,
		place: entry.place,
		image_url: '/journal/image/' + entry.id
	};
	response.json(data);
	
}





// server.get("/api/id/:w", function(req, res) {
//     var data = getIcon(req.params.w);
//     var img = Buffer.from(data, 'base64');

//    res.writeHead(200, {
//      'Content-Type': 'image/png',
//      'Content-Length': img.length
//    });
//    res.end(img); 
// });


export  { addEntry, search , image, entry};