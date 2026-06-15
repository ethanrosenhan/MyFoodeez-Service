import Sequelize from 'sequelize';
import { models } from '../utils/database.js';

const Op = Sequelize.Op;
const FRIENDSHIP_ACCEPTED = 'accepted';
const FRIENDSHIP_DECLINED = 'declined';
const FRIENDSHIP_PENDING = 'pending';

const normalizeFriendPair = (firstUserId, secondUserId) => {
    const first = Number(firstUserId);
    const second = Number(secondUserId);
    return {
        user_one_id: Math.min(first, second),
        user_two_id: Math.max(first, second)
    };
};

const getDisplayName = (user) => {
    if (!user) {
        return '';
    }
    return [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.email;
};

const mapUserSummary = (user) => ({
    id: user.id,
    name: getDisplayName(user),
    image_url: user.id ? `/profile/image/${user.id}` : null
});

const mapOwnerSummary = (user) => {
    if (!user) {
        return null;
    }
    return mapUserSummary(user);
};

const getAcceptedFriendIds = async (userId) => {
    const rows = await models.friendship.findAll({
        where: {
            status: FRIENDSHIP_ACCEPTED,
            [Op.or]: [
                { user_one_id: userId },
                { user_two_id: userId }
            ]
        }
    });

    return rows.map((row) => row.user_one_id === userId ? row.user_two_id : row.user_one_id);
};

// Post ids the user is an ACTIVE collaborator on (tagged in a collab post).
// These show on the user's own profile/feed even though they didn't author them.
const getCollabPostIds = async (userId) => {
    const rows = await models.post_collaborator.findAll({
        attributes: ['post_id'],
        where: { user_id: userId, status: 'active' },
        raw: true
    });
    return rows.map((row) => Number(row.post_id));
};

const getPostAccessWhere = async (userId, scope = 'mine') => {
    if (scope === 'friends') {
        const friendIds = await getAcceptedFriendIds(userId);
        return friendIds.length > 0
            ? { user_id: { [Op.in]: friendIds }, is_private: false }
            : { user_id: { [Op.in]: [] } };
    }

    // 'discover' — the public, friends-of-everyone surface. Every non-private
    // post in the system, plus all of my own posts (private included). This is
    // the same world-readable set already exposed by the public restaurant
    // web pages (controllers/restaurant.js), now available in-app so users can
    // explore strangers' reviews and find new people to follow.
    if (scope === 'discover') {
        return { [Op.or]: [{ user_id: userId }, { is_private: false }] };
    }

    // Posts I'm tagged in count as mine for profile/feed purposes.
    const collabIds = await getCollabPostIds(userId);

    if (scope === 'all') {
        const friendIds = await getAcceptedFriendIds(userId);
        const clauses = [{ user_id: userId }];
        if (friendIds.length > 0) {
            clauses.push({ user_id: { [Op.in]: friendIds }, is_private: false });
        }
        if (collabIds.length > 0) {
            clauses.push({ id: { [Op.in]: collabIds } });
        }
        return clauses.length === 1 ? clauses[0] : { [Op.or]: clauses };
    }

    // 'mine' — my own posts plus posts I'm tagged in.
    if (collabIds.length > 0) {
        return { [Op.or]: [{ user_id: userId }, { id: { [Op.in]: collabIds } }] };
    }
    return { user_id: userId };
};

// Batched membership for list responses. Returns:
//   mineSet: Set of post_ids the user is an active collaborator on
//   counts:  post_id -> active collaborator count
const loadCollabStateForPosts = async (postIds, userId) => {
    if (!Array.isArray(postIds) || postIds.length === 0) {
        return { mineSet: new Set(), counts: new Map() };
    }
    const countRows = await models.post_collaborator.findAll({
        attributes: ['post_id', [Sequelize.fn('COUNT', Sequelize.col('id')), 'collab_count']],
        where: { post_id: { [Op.in]: postIds }, status: 'active' },
        group: ['post_id'],
        raw: true
    });
    const counts = new Map();
    countRows.forEach((row) => counts.set(Number(row.post_id), Number(row.collab_count)));

    const mineRows = await models.post_collaborator.findAll({
        attributes: ['post_id'],
        where: { post_id: { [Op.in]: postIds }, user_id: userId, status: 'active' },
        raw: true
    });
    const mineSet = new Set(mineRows.map((row) => Number(row.post_id)));
    return { mineSet, counts };
};

const canViewPostRecord = async (userId, post) => {
    if (!post) {
        return false;
    }
    if (post.user_id === userId) {
        return true;
    }

    // Collaborators can always view a post they're tagged in (even if private).
    if (post.id) {
        const collab = await models.post_collaborator.findOne({
            attributes: ['id'],
            where: { post_id: post.id, user_id: userId, status: 'active' }
        });
        if (collab) {
            return true;
        }
    }

    // Private posts are visible only to the author, active collaborators
    // (handled above), and — kept for clarity — nobody else.
    if (post.is_private) {
        return false;
    }

    // Public (non-private) posts are world-readable. This matches the public
    // restaurant web pages and powers the in-app Discover surface, where users
    // browse reviews from people they aren't friends with yet. Friendship is no
    // longer required to VIEW a public post; it only governs the private feed.
    return true;
};

export {
    FRIENDSHIP_ACCEPTED,
    FRIENDSHIP_DECLINED,
    FRIENDSHIP_PENDING,
    canViewPostRecord,
    getAcceptedFriendIds,
    getCollabPostIds,
    getDisplayName,
    getPostAccessWhere,
    loadCollabStateForPosts,
    mapOwnerSummary,
    mapUserSummary,
    normalizeFriendPair
};
