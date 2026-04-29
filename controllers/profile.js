import { models } from '../utils/database.js';
import { log } from '../lib/log-helper.js';
import { sendError, sendSuccess } from '../lib/response-helper.js';
import Sequelize from 'sequelize';
import { FRIENDSHIP_ACCEPTED } from '../lib/social-helper.js';

const Op = Sequelize.Op;

const info = async (request, response) => {
    log(request, '/profile/info', { email: request.user.email });
    try {
        const user = await models.user.findOne({ where: { email: request.user.email } });
        const [postsCount, friendsCount] = await Promise.all([
            models.post.count({ where: { user_id: user.id } }),
            models.friendship.count({
                where: {
                    status: FRIENDSHIP_ACCEPTED,
                    [Op.or]: [
                        { user_one_id: user.id },
                        { user_two_id: user.id }
                    ]
                }
            })
        ]);
        return sendSuccess(response, 200, {
            email: user.email,
            name: [user.first_name, user.last_name].filter(Boolean).join(' ').trim(),
            first_name: user.first_name,
            last_name: user.last_name,
            posts_count: postsCount,
            friends_count: friendsCount
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
        await models.friendship.destroy({
            where: {
                [Op.or]: [
                    { user_one_id: request.user.id },
                    { user_two_id: request.user.id }
                ]
            }
        });
        await models.user.destroy({ where: { id: request.user.id } });

        return sendSuccess(response, 200, { message: 'User and associated posts deleted successfully.' });
    } catch (error) {
        console.error('profile delete failed', error);
        log(request, '/profile/delete', { error: error.message });
        return sendError(response, 500, 'An error occurred while deleting the user and posts.', 'profile_delete_failed');
    }
};

export { info, deleteUserAndPosts };
