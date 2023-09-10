import { models } from '../utils/database.js';
import  { log } from '../lib/log-helper.js';

const info = async (request, response) => {
	log(request, '/profile/info', { email: request.user.email } );
	try {
		const user = await models.user.findOne({ where : { email: request.user.email }});
		response.status(200).json({
			email: user.email,
			name: user.name 
		});
	} catch(e) {
		console.log(e);
		log(request, '/profile/info',  { error: e.message });
		response.status(500);
	}
}

export  { info };