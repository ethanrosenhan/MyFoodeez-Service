import Sequelize from 'sequelize';
import { models } from '../utils/database.js';
import { sendError, sendSuccess } from '../lib/response-helper.js';
import { deleteUserAndAllData } from '../lib/user-cleanup.js';

const Op = Sequelize.Op;

// True if the requesting user has the admin flag. Checked per request against
// the DB (not the JWT) so revoking admin takes effect immediately.
const isRequestAdmin = async (request) => {
    const user = await models.user.findOne({
        attributes: ['id', 'is_admin'],
        where: { id: request.user.id }
    });
    return Boolean(user && user.is_admin);
};

// Guard used by every admin route. Returns true when allowed; otherwise sends
// a 403 and returns false so the caller can bail.
const ensureAdmin = async (request, response) => {
    if (await isRequestAdmin(request)) {
        return true;
    }
    sendError(response, 403, 'Admin access required', 'admin_required');
    return false;
};

// DELETE /admin/post/:id — remove ANY post (moderation). Cleans the post's
// children explicitly so it works regardless of FK cascade configuration.
const deletePostAsAdmin = async (request, response) => {
    if (!(await ensureAdmin(request, response))) {
        return undefined;
    }
    try {
        const postId = parseInt(request.params.id, 10);
        if (!Number.isInteger(postId)) {
            return sendError(response, 400, 'Invalid request', 'invalid_request');
        }
        const post = await models.post.findOne({ attributes: ['id'], where: { id: postId } });
        if (!post) {
            return sendError(response, 404, 'Post not found', 'post_not_found');
        }

        await models.post_image.destroy({ where: { post_id: postId } });
        await models.post_media.destroy({ where: { post_id: postId } });
        await models.post_star.destroy({ where: { post_id: postId } });
        await models.post_menu_item.destroy({ where: { post_id: postId } });
        await models.post_collaborator.destroy({ where: { post_id: postId } });
        await models.user_place_intent.update(
            { source_post_id: null },
            { where: { source_post_id: postId } }
        );
        await models.post.destroy({ where: { id: postId } });

        return sendSuccess(response, 200, { deleted: true, post_id: postId });
    } catch (error) {
        console.error('admin deletePost failed', error);
        return sendError(response, 500, 'Unable to delete post', 'admin_post_delete_failed');
    }
};

// DELETE /admin/users/:id — remove an account and all its data (spam / leftover
// test accounts). Won't delete your own account through this path — use the
// in-app account deletion flow for that, to avoid an accidental self-lockout.
const deleteUserAsAdmin = async (request, response) => {
    if (!(await ensureAdmin(request, response))) {
        return undefined;
    }
    try {
        const targetId = parseInt(request.params.id, 10);
        if (!Number.isInteger(targetId)) {
            return sendError(response, 400, 'Invalid request', 'invalid_request');
        }
        if (targetId === request.user.id) {
            return sendError(response, 400, 'Use account settings to delete your own account', 'admin_cannot_self_delete');
        }
        const target = await models.user.findOne({ attributes: ['id'], where: { id: targetId } });
        if (!target) {
            return sendError(response, 404, 'User not found', 'user_not_found');
        }

        const summary = await deleteUserAndAllData(targetId);
        return sendSuccess(response, 200, { deleted: true, ...summary });
    } catch (error) {
        console.error('admin deleteUser failed', error);
        return sendError(response, 500, 'Unable to delete user', 'admin_user_delete_failed');
    }
};

export { isRequestAdmin, deletePostAsAdmin, deleteUserAsAdmin };
