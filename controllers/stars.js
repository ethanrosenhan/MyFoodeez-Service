import Sequelize from 'sequelize';
import { models } from '../utils/database.js';
import { sendError, sendSuccess } from '../lib/response-helper.js';
import { canViewPostRecord } from '../lib/social-helper.js';

const Op = Sequelize.Op;
const ALLOWED_REACTIONS = new Set(['heart', 'fire', 'yum', 'clap']);

// Counts community stars on a post and reports whether the requesting user
// is among them. Used by the toggle endpoints; the post list endpoints have
// their own batched variant in lib/star-helper.js.
const loadStarSummary = async (postId, userId) => {
    const rows = await models.post_star.findAll({
        where: { post_id: postId },
        attributes: ['user_id', 'reaction'],
        raw: true
    });
    const reactionCounts = {};
    rows.forEach((row) => {
        const reaction = ALLOWED_REACTIONS.has(row.reaction) ? row.reaction : 'heart';
        reactionCounts[reaction] = (reactionCounts[reaction] || 0) + 1;
    });
    const mine = rows.find((row) => Number(row.user_id) === Number(userId));
    const count = rows.length;
    return {
        star_count: count,
        is_starred_by_me: Boolean(mine),
        reaction_counts: reactionCounts,
        my_reaction: mine ? (ALLOWED_REACTIONS.has(mine.reaction) ? mine.reaction : 'heart') : null
    };
};

const ensureViewablePost = async (request) => {
    const post = await models.post.findOne({
        attributes: ['id', 'user_id', 'is_private'],
        where: { id: request.params.id }
    });
    if (!post) {
        return { post: null, accessError: { status: 404, message: 'Post not found', code: 'post_not_found' } };
    }
    const canView = await canViewPostRecord(request.user.id, post);
    if (!canView) {
        return { post: null, accessError: { status: 404, message: 'Post not found', code: 'post_not_found' } };
    }
    return { post };
};

const setReaction = async (request, response) => {
    try {
        const { post, accessError } = await ensureViewablePost(request);
        if (!post) {
            return sendError(response, accessError.status, accessError.message, accessError.code);
        }
        const reaction = typeof request.body?.reaction === 'string'
            ? request.body.reaction.trim().toLowerCase()
            : '';
        if (!ALLOWED_REACTIONS.has(reaction)) {
            return sendError(response, 400, 'Invalid reaction', 'invalid_reaction');
        }

        const [row, created] = await models.post_star.findOrCreate({
            where: { user_id: request.user.id, post_id: post.id },
            defaults: { user_id: request.user.id, post_id: post.id, reaction }
        });
        if (!created && row.reaction !== reaction) {
            await row.update({ reaction });
        }
        return sendSuccess(response, 200, await loadStarSummary(post.id, request.user.id));
    } catch (error) {
        console.error('setReaction failed', error);
        return sendError(response, 500, 'Unable to react to post', 'reaction_set_failed');
    }
};

const removeReaction = async (request, response) => {
    try {
        const { post, accessError } = await ensureViewablePost(request);
        if (!post) {
            return sendError(response, accessError.status, accessError.message, accessError.code);
        }
        await models.post_star.destroy({ where: { user_id: request.user.id, post_id: post.id } });
        return sendSuccess(response, 200, await loadStarSummary(post.id, request.user.id));
    } catch (error) {
        console.error('removeReaction failed', error);
        return sendError(response, 500, 'Unable to remove reaction', 'reaction_remove_failed');
    }
};

/* Legacy star endpoints remain for older app versions. A star maps to heart. */
const addStar = async (request, response) => {
    try {
        const { post, accessError } = await ensureViewablePost(request);
        if (!post) {
            return sendError(response, accessError.status, accessError.message, accessError.code);
        }

        // Upsert via findOrCreate so a double-tap from the client is a no-op,
        // not a unique-constraint error. The unique (user_id, post_id) index
        // is the source of truth.
        await models.post_star.findOrCreate({
            where: { user_id: request.user.id, post_id: post.id },
            defaults: { user_id: request.user.id, post_id: post.id, reaction: 'heart' }
        });

        const summary = await loadStarSummary(post.id, request.user.id);
        return sendSuccess(response, 200, summary);
    } catch (error) {
        console.error('addStar failed', error);
        return sendError(response, 500, 'Unable to star post', 'star_add_failed');
    }
};

const removeStar = async (request, response) => {
    try {
        const { post, accessError } = await ensureViewablePost(request);
        if (!post) {
            return sendError(response, accessError.status, accessError.message, accessError.code);
        }

        await models.post_star.destroy({
            where: { user_id: request.user.id, post_id: post.id }
        });

        const summary = await loadStarSummary(post.id, request.user.id);
        return sendSuccess(response, 200, summary);
    } catch (error) {
        console.error('removeStar failed', error);
        return sendError(response, 500, 'Unable to unstar post', 'star_remove_failed');
    }
};

// Batched lookup for list responses. Returns Maps keyed by post id:
//   counts: post_id -> integer star count
//   mineSet: Set of post_ids that the requesting user has starred
const loadStarStateForPosts = async (postIds, userId) => {
    if (!Array.isArray(postIds) || postIds.length === 0) {
        return { counts: new Map(), mineSet: new Set(), reactionCounts: new Map(), mine: new Map() };
    }

    const countRows = await models.post_star.findAll({
        attributes: ['post_id', [Sequelize.fn('COUNT', Sequelize.col('id')), 'star_count']],
        where: { post_id: { [Op.in]: postIds } },
        group: ['post_id'],
        raw: true
    });
    const counts = new Map();
    countRows.forEach((row) => {
        counts.set(Number(row.post_id), Number(row.star_count));
    });

    const mineRows = await models.post_star.findAll({
        attributes: ['post_id', 'reaction'],
        where: { user_id: userId, post_id: { [Op.in]: postIds } },
        raw: true
    });
    const mineSet = new Set(mineRows.map((row) => Number(row.post_id)));

    const reactionRows = await models.post_star.findAll({
        attributes: ['post_id', 'reaction'],
        where: { post_id: { [Op.in]: postIds } },
        raw: true
    });
    const reactionCounts = new Map();
    reactionRows.forEach((row) => {
        const postId = Number(row.post_id);
        const reaction = ALLOWED_REACTIONS.has(row.reaction) ? row.reaction : 'heart';
        if (!reactionCounts.has(postId)) {
            reactionCounts.set(postId, {});
        }
        const countsForPost = reactionCounts.get(postId);
        countsForPost[reaction] = (countsForPost[reaction] || 0) + 1;
    });
    const mine = new Map(mineRows.map((row) => [
        Number(row.post_id),
        ALLOWED_REACTIONS.has(row.reaction) ? row.reaction : 'heart'
    ]));

    return { counts, mineSet, reactionCounts, mine };
};

export { addStar, removeStar, setReaction, removeReaction, loadStarStateForPosts, loadStarSummary, ALLOWED_REACTIONS };
