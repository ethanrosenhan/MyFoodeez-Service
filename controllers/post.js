import  sequelize, {models} from '../utils/database.js';
import * as formidable from 'formidable';
import Sequelize from 'sequelize';
const Op = Sequelize.Op;
import sharp from 'sharp';
import  { log } from '../lib/log-helper.js';
import { 
    INVALID_REQUEST_ERROR
} from '../constants/global.js';

const addPost = async (request, response) => {
	try {
	
		var form = new formidable.IncomingForm();
		form.keepExtensions = true;
		const [fields] = await form.parse(request);
		const place = fields['place'] ? fields['place'][0] : 'Unknown';
		const place_id = fields['place_id'] ? fields['place_id'][0] : null;
		const place_secondary_text = fields['place_secondary_text'] ? fields['place_secondary_text'][0] : null;
		const place_latitude = fields['place_latitude'] ? fields['place_latitude'][0] : null;
		const place_longitude = fields['place_longitude'] ? fields['place_longitude'][0] : null;

		const cuisine = fields['cuisine'] ? fields['cuisine'][0] : 'Unknown';
		const comments = fields['comments'] ? fields['comments'][0] : '';
		const file = fields['file'] ? fields['file'][0]: null;
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

const image = async (request, response) => {
	try {
		const post = await models.post.findOne({ 
			attributes: ['image_data'],
			where: { id: request.params.id }
		});

		response.writeHead(200, {
		'Content-Type': 'image/png',
		'Content-Length': post.image_data.length
		});

		const img = Buffer.from(post.image_data, 'base64');

		response.end(img);

	} catch (error) {
		console.log(error);
		return response.status(500).json({ message: "Error please contact site adminstrator" });
	}


}
const post = async (request, response) => {

	const post = await models.post.findOne({ 
		attributes: ['id', 'post_date', 'cuisine', 'place', 'comments'],
		where: { id: request.params.id }
	});
	const data = {
		id: post.id,
		post_date: post.post_date,
		cuisine: post.cuisine,
		comments: post.comments,
		place: post.place,
		image_url: '/post/image/' + post.id
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


export  { addPost, image, post};