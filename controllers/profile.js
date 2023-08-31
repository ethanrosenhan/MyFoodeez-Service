import { models } from '../utils/database.js';
import  { addAudit } from '../lib/AuditHelper.js';

const info = async (request, response) => {
	addAudit(request, '/profile/info', { email: request.user.email } );
	try {
		const user = await models.user.findOne({ where : { email: request.user.email }});
		response.status(200).json({
			email: user.email,
			name: user.name 
		});
	} catch(e) {
		console.log(e);
		addAudit(request, '/profile/info',  { error: e.message });
		response.status(500);
	}
}

export default { info };