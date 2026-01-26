import  sequelize, {models} from '../utils/database.js';
import * as formidable from 'formidable';
import Sequelize from 'sequelize';
const Op = Sequelize.Op;
import sharp from 'sharp';
import  { log } from '../lib/log-helper.js';
import { 
    INVALID_REQUEST_ERROR
} from '../constants/global.js';

const normalizeFields = (fields) => {
	const normalized = {};
	if (!fields) {
		return normalized;
	}
	Object.entries(fields).forEach(([key, value]) => {
		if (Array.isArray(value)) {
			normalized[key] = value[0];
		} else {
			normalized[key] = value;
		}
	});
	return normalized;
};

const parsePostRequest = async (request) => {
	const contentType = request.headers['content-type'] || '';
	if (contentType.includes('application/json')) {
		return normalizeFields(request.body);
	}
	const form = new formidable.IncomingForm();
	form.keepExtensions = true;
	const [fields] = await form.parse(request);
	return normalizeFields(fields);
};

const addPost = async (request, response) => {
	try {
		const fields = await parsePostRequest(request);
		const place = fields['place'] ? fields['place'] : 'Unknown';
		const place_id = fields['place_id'] ? fields['place_id'] : null;
		const place_secondary_text = fields['place_secondary_text'] ? fields['place_secondary_text'] : null;
		const place_latitude = fields['place_latitude'] ? fields['place_latitude'] : null;
		const place_longitude = fields['place_longitude'] ? fields['place_longitude'] : null;

		const cuisine = fields['cuisine'] ? fields['cuisine'] : 'Unknown';
		const rating = fields['rating'] ? fields['rating'] : '';
		const comments = fields['comments'] ? fields['comments'] : '';
		const file = fields['file'] ? fields['file'] : null;
		//TODO: collect image type and size from the client

		let raw_image = null;
		// if (!file || file === 'null') {
		// 	return response.status(400).json({message: INVALID_REQUEST_ERROR});
		// }
		if (file && file !== 'null') {

			raw_image =Buffer.from(file, "base64");

		}
	
		// const thumbnail_image = await sharp(raw_image).rotate()
		// 			.resize({
		// 				//fit: sharp.fit.contain,
		// 				fit: sharp.fit.inside,
		// 				width: 1080
		// 			})
		// 			.jpeg({ mozjpeg: true })
		// 			.toBuffer();

		const imageType = 'image/png';
		const imageName = 'Unknown';
		const post = await models.post.create(({
		   
			place: place,
			place_id: place_id,
			place_secondary_text: place_secondary_text,
			place_latitude: place_latitude,
			place_longitude: place_longitude,
			post_date: new Date(),
			cuisine: cuisine,
			rating: rating,
			image_type:  imageType,
			image_name: imageName,
			comments: comments,
			image_data: raw_image || null,
			// image_thumbnail: thumbnail_image,
			is_private: true,
			user_id: request.user.id
		}));

		return response.status(201).json({
			id: post.id
			//image: post.image_data.toString('base64')
		});

	} catch (error) {
			console.log(error);
			return response.status(500).json({ message: "Error adding post please contact site adminstrator" });
	}

}

const updatePostWithFields = async (request, response, fields) => {
	const updates = {};
	const updatableFields = [
		'place',
		'place_id',
		'place_secondary_text',
		'place_latitude',
		'place_longitude',
		'cuisine',
		'rating',
		'comments'
	];

	updatableFields.forEach((field) => {
		if (fields[field] !== undefined) {
			updates[field] = fields[field];
		}
	});

	if (fields.file && fields.file !== 'null') {
		updates.image_data = Buffer.from(fields.file, 'base64');
		updates.image_type = 'image/png';
		updates.image_name = 'Unknown';
	}

	if (Object.keys(updates).length === 0) {
		return response.status(400).json({ message: INVALID_REQUEST_ERROR });
	}

	const post = await models.post.findOne({
		where: {
			id: request.params.id,
			user_id: request.user.id
		}
	});

	if (!post) {
		return response.status(404).json({ message: 'post not found' });
	}

	await post.update(updates);

	return response.status(200).json({
		id: post.id,
		updated: true
	});
};

const updatePost = async (request, response) => {
	try {
		const fields = await parsePostRequest(request);
		return await updatePostWithFields(request, response, fields);
	} catch (error) {
		console.log(error);
		return response.status(500).json({ message: "Error updating post please contact site adminstrator" });
	}
};

const deletePost = async (request, response) => {
	try {
		const post = await models.post.findOne({
			where: {
				id: request.params.id,
				user_id: request.user.id
			}
		});

		if (!post) {
			return response.status(404).json({ message: 'post not found' });
		}

		await post.destroy();
		return response.status(200).json({ deleted: true });
	} catch (error) {
		console.log(error);
		return response.status(500).json({ message: "Error deleting post please contact site adminstrator" });
	}
};

const postMethodOverride = async (request, response) => {
	try {
		const fields = await parsePostRequest(request);
		const method = (fields._method || '').toString().toUpperCase();
		if (method === 'PUT') {
			return await updatePostWithFields(request, response, fields);
		}
		if (method === 'DELETE') {
			return await deletePost(request, response);
		}
		return response.status(400).json({ message: INVALID_REQUEST_ERROR });
	} catch (error) {
		console.log(error);
		return response.status(500).json({ message: "Error processing request please contact site adminstrator" });
	}
};

const image = async (request, response) => {
	try {
		const post = await models.post.findOne({ 
			attributes: ['image_data'],
			where: { id: request.params.id }
		});

		if (post.image_data && post.image_data.length > 0) {

			response.writeHead(200, {
			'Content-Type': 'image/png',
			'Content-Length': post.image_data.length
			});

			const img = Buffer.from(post.image_data, 'base64');

			response.end(img);
		} else {
			return response.send("");
		}

	} catch (error) {
		console.log(error);
		return response.status(500).json({ message: "Error please contact site adminstrator" });
	}


}
const post = async (request, response) => {
	try {
		const post = await models.post.findOne({ 
			attributes: [
				'id',
				'post_date',
				'cuisine',
				'rating',
				'place',
				'place_id',
				'place_secondary_text',
				'place_latitude',
				'place_longitude',
				'comments'
			],
			where: { 
				id: request.params.id,
				user_id: request.user.id
			}
		});
		if (!post) {
			return response.status(404).json({ message: 'post not found' });
		}
		const data = {
			id: post.id,
			post_date: post.post_date,
			cuisine: post.cuisine,
			rating: post.rating,
			comments: post.comments,
			place: post.place,
			place_id: post.place_id,
			place_secondary_text: post.place_secondary_text,
			place_latitude: post.place_latitude,
			place_longitude: post.place_longitude,
			image_url: '/post/image/' + post.id
		};
		response.json(data);

	} catch (error) {
		console.log(error);
		return response.status(500).json({ message: "Error please contact site adminstrator" });
	}

	
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


export  { addPost, image, post, updatePost, deletePost, postMethodOverride};
