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

const deleteUserAndPosts = async (request, response) => {
	log(request, '/profile/delete', { email: request.user.email });
	try {
		// Delete posts associated with the user
		await models.post.destroy({ where: { userId: request.user.id } });

		// Delete the user
		await models.user.destroy({ where: { id: request.user.id } });

		response.status(200).json({ message: 'User and associated posts deleted successfully.' });
	} catch (e) {
		console.log(e);
		log(request, '/profile/delete', { error: e.message });
		response.status(500).json({ error: 'An error occurred while deleting the user and posts.' });
	}
};

export  { info, deleteUserAndPosts };