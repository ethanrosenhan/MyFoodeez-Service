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

// Blocking is mutual for visibility: once either person blocks the other,
// neither account or its content is surfaced to the pair.
const getBlockedUserIds = async (userId) => {
    const id = Number(userId);
    const rows = await models.user_block.findAll({
        attributes: ['blocker_user_id', 'blocked_user_id'],
        where: {
            [Op.or]: [
                { blocker_user_id: id },
                { blocked_user_id: id }
            ]
        },
        raw: true
    });
    return [...new Set(rows.map((row) => (
        Number(row.blocker_user_id) === id
            ? Number(row.blocked_user_id)
            : Number(row.blocker_user_id)
    )))];
};

const getBlockState = async (viewerUserId, targetUserId) => {
    const viewer = Number(viewerUserId);
    const target = Number(targetUserId);
    const rows = await models.user_block.findAll({
        attributes: ['blocker_user_id', 'blocked_user_id'],
        where: {
            [Op.or]: [
                { blocker_user_id: viewer, blocked_user_id: target },
                { blocker_user_id: target, blocked_user_id: viewer }
            ]
        },
        raw: true
    });
    return {
        viewer_blocked_target: rows.some((row) => Number(row.blocker_user_id) === viewer),
        target_blocked_viewer: rows.some((row) => Number(row.blocker_user_id) === target)
    };
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

    const blockedIds = new Set(await getBlockedUserIds(userId));
    return rows
        .map((row) => Number(row.user_one_id) === Number(userId) ? Number(row.user_two_id) : Number(row.user_one_id))
        .filter((id) => !blockedIds.has(id));
};

// Batched relationship lookup for review/list surfaces. Keeping this on the
// post DTO prevents clients from guessing that every non-owner is a stranger
// (or, conversely, a friend).
const loadRelationshipsForUsers = async (currentUserId, otherUserIds) => {
    const ids = [...new Set((otherUserIds || [])
        .map(Number)
        .filter((id) => Number.isInteger(id) && id !== Number(currentUserId)))];
    if (ids.length === 0) {
        return new Map();
    }

    const pairs = ids.map((otherId) => normalizeFriendPair(currentUserId, otherId));
    const rows = await models.friendship.findAll({
        where: {
            [Op.or]: pairs.map(({ user_one_id, user_two_id }) => ({ user_one_id, user_two_id }))
        }
    });

    const relationships = new Map();
    rows.forEach((row) => {
        const otherId = Number(row.user_one_id) === Number(currentUserId)
            ? Number(row.user_two_id)
            : Number(row.user_one_id);
        relationships.set(otherId, {
            friendship_status: row.status,
            friend_request_id: row.id,
            friend_request_direction: Number(row.requester_user_id) === Number(currentUserId) ? 'outgoing' : 'incoming'
        });
    });
    return relationships;
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
    let where;
    if (scope === 'friends') {
        const friendIds = await getAcceptedFriendIds(userId);
        where = friendIds.length > 0
            ? { user_id: { [Op.in]: friendIds }, is_private: false }
            : { user_id: { [Op.in]: [] } };
    } else if (scope === 'discover') {
        // The public, friends-of-everyone surface, plus my own and collab posts.
        const myCollabIds = await getCollabPostIds(userId);
        const clauses = [{ user_id: userId }, { is_private: false }];
        if (myCollabIds.length > 0) {
            clauses.push({ id: { [Op.in]: myCollabIds } });
        }
        where = { [Op.or]: clauses };
    } else if (scope === 'all') {
        const collabIds = await getCollabPostIds(userId);
        const friendIds = await getAcceptedFriendIds(userId);
        const clauses = [{ user_id: userId }];
        if (friendIds.length > 0) {
            clauses.push({ user_id: { [Op.in]: friendIds }, is_private: false });
        }
        if (collabIds.length > 0) {
            clauses.push({ id: { [Op.in]: collabIds } });
        }
        where = clauses.length === 1 ? clauses[0] : { [Op.or]: clauses };
    } else {
        const collabIds = await getCollabPostIds(userId);
        where = collabIds.length > 0
            ? { [Op.or]: [{ user_id: userId }, { id: { [Op.in]: collabIds } }] }
            : { user_id: userId };
    }

    const blockedIds = await getBlockedUserIds(userId);
    return blockedIds.length > 0
        ? { [Op.and]: [where, { user_id: { [Op.notIn]: blockedIds } }] }
        : where;
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

// Batched collaborator ratings for list responses. Returns a Map keyed by
// post_id whose value is an array of the ACTIVE collaborators' numeric
// ratings (1-5) for that post. Null / non-numeric takes are excluded — a
// collaborator who hasn't rated yet doesn't pull the average down. Used to
// fold collab "Takes" into a restaurant's average rating.
const loadCollabRatingsForPosts = async (postIds) => {
    if (!Array.isArray(postIds) || postIds.length === 0) {
        return new Map();
    }
    const rows = await models.post_collaborator.findAll({
        attributes: ['post_id', 'rating'],
        where: { post_id: { [Op.in]: postIds }, status: 'active' },
        raw: true
    });
    const map = new Map();
    rows.forEach((row) => {
        const parsed = Number(row.rating);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            return;
        }
        const key = Number(row.post_id);
        if (!map.has(key)) {
            map.set(key, []);
        }
        map.get(key).push(parsed);
    });
    return map;
};

const canViewPostRecord = async (userId, post) => {
    if (!post) {
        return false;
    }
    if (Number(post.user_id) === Number(userId)) {
        return true;
    }
    const blockState = await getBlockState(userId, post.user_id);
    if (blockState.viewer_blocked_target || blockState.target_blocked_viewer) {
        return false;
    }

    // Public posts are visible unless the users blocked one another.
    if (!post.is_private) {
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

    // Private posts are visible only to the author and active collaborators.
    return false;
};

export {
    FRIENDSHIP_ACCEPTED,
    FRIENDSHIP_DECLINED,
    FRIENDSHIP_PENDING,
    canViewPostRecord,
    getAcceptedFriendIds,
    getBlockedUserIds,
    getBlockState,
    getCollabPostIds,
    getDisplayName,
    getPostAccessWhere,
    loadRelationshipsForUsers,
    loadCollabRatingsForPosts,
    loadCollabStateForPosts,
    mapOwnerSummary,
    mapUserSummary,
    normalizeFriendPair
};
