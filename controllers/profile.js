import { models } from '../utils/database.js';
import { log } from '../lib/log-helper.js';
import { sendError, sendSuccess } from '../lib/response-helper.js';

const info = async (request, response) => {
    log(request, '/profile/info', { email: request.user.email });
    try {
        const user = await models.user.findOne({ where: { email: request.user.email } });
        return sendSuccess(response, 200, {
            email: user.email,
            name: [user.first_name, user.last_name].filter(Boolean).join(' ').trim()
        });
    } catch (error) {
        console.error('profile info failed', error);
        log(request, '/profile/info', { error: error.message });
        return sendError(response, 500, 'Unable to load profile', 'profile_fetch_failed');
    }
};

const deleteUserAndPosts = async (request, response) => {
    log(request, '/profile/delete', { email: request.user.email });
    try {
        await models.post.destroy({ where: { user_id: request.user.id } });
        await models.user.destroy({ where: { id: request.user.id } });

        return sendSuccess(response, 200, { message: 'User and associated posts deleted successfully.' });
    } catch (error) {
        console.error('profile delete failed', error);
        log(request, '/profile/delete', { error: error.message });
        return sendError(response, 500, 'An error occurred while deleting the user and posts.', 'profile_delete_failed');
    }
};

export { info, deleteUserAndPosts };
