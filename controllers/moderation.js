import Sequelize from 'sequelize';
import { models } from '../utils/database.js';
import { sendError, sendSuccess } from '../lib/response-helper.js';
import { canViewPostRecord, normalizeFriendPair } from '../lib/social-helper.js';
import { getOptionalEnv } from '../utils/env.js';
import { isEmailConfigured, sendEmail } from '../lib/email-helper.js';

const REPORT_REASONS = new Set([
    'spam',
    'harassment',
    'hate_or_abuse',
    'sexual_or_inappropriate',
    'false_or_misleading',
    'other'
]);
const Op = Sequelize.Op;

const reportPost = async (request, response) => {
    try {
        const postId = Number(request.params.id);
        if (!Number.isInteger(postId)) {
            return sendError(response, 400, 'Invalid post', 'invalid_request');
        }
        const post = await models.post.findOne({
            attributes: ['id', 'user_id', 'is_private'],
            where: { id: postId }
        });
        if (!post || !(await canViewPostRecord(request.user.id, post))) {
            return sendError(response, 404, 'Post not found', 'post_not_found');
        }
        if (Number(post.user_id) === Number(request.user.id)) {
            return sendError(response, 400, 'You cannot report your own post', 'report_own_post');
        }

        const reason = typeof request.body?.reason === 'string' ? request.body.reason.trim() : '';
        const details = typeof request.body?.details === 'string'
            ? request.body.details.trim().slice(0, 500)
            : null;
        if (!REPORT_REASONS.has(reason)) {
            return sendError(response, 400, 'Choose a valid report reason', 'invalid_report_reason');
        }

        const [report, created] = await models.content_report.findOrCreate({
            where: { reporter_user_id: request.user.id, post_id: postId },
            defaults: { reason, details: details || null, status: 'pending' }
        });
        if (!created) {
            await report.update({ reason, details: details || null, status: 'pending' });
        }

        const supportToEmail = getOptionalEnv('SUPPORT_RECEIVED_TO_EMAIL');
        const fromEmail = getOptionalEnv('PASSWORD_CHANGE_FROM_EMAIL') || getOptionalEnv('SIGNUP_FROM_EMAIL');
        if (isEmailConfigured() && supportToEmail && fromEmail) {
            try {
                await sendEmail({
                    from: fromEmail,
                    to: supportToEmail,
                    subject: `MyFoodeez content report: post ${postId}`,
                    text: `Reporter user: ${request.user.id}\nPost: ${postId}\nAuthor user: ${post.user_id}\nReason: ${reason}\nDetails: ${details || '(none)'}`
                });
            } catch (emailError) {
                console.error('content report notification failed', emailError);
            }
        }

        return sendSuccess(response, created ? 201 : 200, { reported: true });
    } catch (error) {
        console.error('reportPost failed', error);
        return sendError(response, 500, 'Unable to submit report', 'report_failed');
    }
};

const blockUser = async (request, response) => {
    try {
        const blockedUserId = Number(request.params.userId);
        if (!Number.isInteger(blockedUserId) || blockedUserId === Number(request.user.id)) {
            return sendError(response, 400, 'Invalid user', 'invalid_request');
        }
        const target = await models.user.findByPk(blockedUserId, { attributes: ['id'] });
        if (!target) {
            return sendError(response, 404, 'User not found', 'user_not_found');
        }

        await models.user_block.findOrCreate({
            where: { blocker_user_id: request.user.id, blocked_user_id: blockedUserId }
        });
        await models.friendship.destroy({
            where: normalizeFriendPair(request.user.id, blockedUserId)
        });

        // Remove existing collaborative ties in either direction so a blocked
        // person's notes do not remain embedded in the other person's posts.
        const authoredPosts = await models.post.findAll({
            attributes: ['id', 'user_id'],
            where: { user_id: { [Op.in]: [request.user.id, blockedUserId] } },
            raw: true
        });
        const viewerPostIds = authoredPosts
            .filter((post) => Number(post.user_id) === Number(request.user.id))
            .map((post) => Number(post.id));
        const blockedPostIds = authoredPosts
            .filter((post) => Number(post.user_id) === blockedUserId)
            .map((post) => Number(post.id));
        const collabClauses = [];
        if (viewerPostIds.length > 0) {
            collabClauses.push({ post_id: { [Op.in]: viewerPostIds }, user_id: blockedUserId });
        }
        if (blockedPostIds.length > 0) {
            collabClauses.push({ post_id: { [Op.in]: blockedPostIds }, user_id: request.user.id });
        }
        if (collabClauses.length > 0) {
            await models.post_collaborator.update(
                { status: 'removed' },
                { where: { status: 'active', [Op.or]: collabClauses } }
            );
        }

        return sendSuccess(response, 200, { blocked: true });
    } catch (error) {
        console.error('blockUser failed', error);
        return sendError(response, 500, 'Unable to block user', 'block_failed');
    }
};

const unblockUser = async (request, response) => {
    try {
        const blockedUserId = Number(request.params.userId);
        if (!Number.isInteger(blockedUserId)) {
            return sendError(response, 400, 'Invalid user', 'invalid_request');
        }
        await models.user_block.destroy({
            where: { blocker_user_id: request.user.id, blocked_user_id: blockedUserId }
        });
        return sendSuccess(response, 200, { blocked: false });
    } catch (error) {
        console.error('unblockUser failed', error);
        return sendError(response, 500, 'Unable to unblock user', 'unblock_failed');
    }
};

const listBlockedUsers = async (request, response) => {
    try {
        const rows = await models.user_block.findAll({
            where: { blocker_user_id: request.user.id },
            include: [{
                model: models.user,
                as: 'blocked_user',
                attributes: ['id', 'first_name', 'last_name']
            }],
            order: [['created_at', 'DESC']]
        });
        return sendSuccess(response, 200, {
            data: rows.filter((row) => row.blocked_user).map((row) => ({
                id: row.blocked_user.id,
                name: [row.blocked_user.first_name, row.blocked_user.last_name].filter(Boolean).join(' ').trim() || 'MyFoodeez user'
            }))
        });
    } catch (error) {
        console.error('listBlockedUsers failed', error);
        return sendError(response, 500, 'Unable to load blocked users', 'blocked_users_failed');
    }
};

export { blockUser, listBlockedUsers, reportPost, unblockUser, REPORT_REASONS };
