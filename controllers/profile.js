import { IncomingForm } from 'formidable';
import { models } from '../utils/database.js';
import { log } from '../lib/log-helper.js';
import { sendError, sendSuccess } from '../lib/response-helper.js';
import Sequelize from 'sequelize';
import { FRIENDSHIP_ACCEPTED, normalizeFriendPair } from '../lib/social-helper.js';
import { INVALID_REQUEST_ERROR } from '../constants/global.js';

const Op = Sequelize.Op;

const normalizeFields = (fields) => {
    const normalized = {};
    if (!fields) {
        return normalized;
    }
    Object.entries(fields).forEach(([key, value]) => {
        normalized[key] = Array.isArray(value) ? value[0] : value;
    });
    return normalized;
};

const parseFormRequest = async (request) => {
    const contentType = request.headers['content-type'] || '';
    if (contentType.includes('application/json')) {
        return normalizeFields(request.body);
    }
    const form = new IncomingForm();
    form.keepExtensions = true;
    const [fields] = await form.parse(request);
    return normalizeFields(fields);
};

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
            id: user.id,
            email: user.email,
            name: [user.first_name, user.last_name].filter(Boolean).join(' ').trim(),
            first_name: user.first_name,
            last_name: user.last_name,
            posts_count: postsCount,
            friends_count: friendsCount,
            has_profile_image: Boolean(user.profile_image_data && user.profile_image_data.length > 0),
            profile_image_url: (user.profile_image_data && user.profile_image_data.length > 0)
                ? `/profile/image/${user.id}`
                : null
        });
    } catch (error) {
        console.error('profile info failed', error);
        log(request, '/profile/info', { error: error.message });
        return sendError(response, 500, 'Unable to load profile', 'profile_fetch_failed');
    }
};

const uploadProfileImage = async (request, response) => {
    try {
        const fields = await parseFormRequest(request);
        const base64 = fields.file;
        if (typeof base64 !== 'string' || base64.length === 0) {
            return sendError(response, 400, INVALID_REQUEST_ERROR, 'invalid_request');
        }
        const buffer = Buffer.from(base64, 'base64');
        if (buffer.length === 0) {
            return sendError(response, 400, INVALID_REQUEST_ERROR, 'invalid_request');
        }
        await models.user.update(
            { profile_image_data: buffer, profile_image_type: 'image/png' },
            { where: { id: request.user.id } }
        );
        return sendSuccess(response, 200, { updated: true });
    } catch (error) {
        console.error('uploadProfileImage failed', error);
        return sendError(response, 500, 'Unable to update profile picture', 'profile_image_update_failed');
    }
};

const deleteProfileImage = async (request, response) => {
    try {
        await models.user.update(
            { profile_image_data: null, profile_image_type: null },
            { where: { id: request.user.id } }
        );
        return sendSuccess(response, 200, { updated: true });
    } catch (error) {
        console.error('deleteProfileImage failed', error);
        return sendError(response, 500, 'Unable to remove profile picture', 'profile_image_delete_failed');
    }
};

const canViewProfileImage = async (viewerId, targetUserId) => {
    if (viewerId === targetUserId) {
        return true;
    }
    const pair = normalizeFriendPair(viewerId, targetUserId);
    const friendship = await models.friendship.findOne({
        where: {
            ...pair,
            status: FRIENDSHIP_ACCEPTED
        }
    });
    return Boolean(friendship);
};

const getProfileImage = async (request, response) => {
    try {
        const targetId = parseInt(request.params.userId, 10);
        if (!Number.isInteger(targetId)) {
            return sendError(response, 400, INVALID_REQUEST_ERROR, 'invalid_request');
        }
        if (!(await canViewProfileImage(request.user.id, targetId))) {
            return sendError(response, 404, 'Profile image not found', 'profile_image_not_found');
        }
        const target = await models.user.findOne({
            attributes: ['id', 'profile_image_data', 'profile_image_type'],
            where: { id: targetId }
        });
        if (!target || !target.profile_image_data || target.profile_image_data.length === 0) {
            return response.status(204).send();
        }
        response.writeHead(200, {
            'Content-Type': target.profile_image_type || 'image/png',
            'Content-Length': target.profile_image_data.length,
            'Cache-Control': 'private, max-age=300'
        });
        return response.end(Buffer.from(target.profile_image_data));
    } catch (error) {
        console.error('getProfileImage failed', error);
        return sendError(response, 500, 'Unable to load profile image', 'profile_image_failed');
    }
};

const deleteUserAndPosts = async (request, response) => {
    log(request, '/profile/delete', { email: request.user.email });
    try {
        const posts = await models.post.findAll({ where: { user_id: request.user.id }, attributes: ['id'] });
        const postIds = posts.map((p) => p.id);
        if (postIds.length > 0) {
            await models.post_image.destroy({ where: { post_id: postIds } });
        }
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

export { info, uploadProfileImage, deleteProfileImage, getProfileImage, deleteUserAndPosts };
