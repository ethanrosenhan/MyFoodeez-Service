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
    name: getDisplayName(user)
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

const getPostAccessWhere = async (userId, scope = 'mine') => {
    if (scope === 'friends') {
        const friendIds = await getAcceptedFriendIds(userId);
        return friendIds.length > 0
            ? { user_id: { [Op.in]: friendIds }, is_private: false }
            : { user_id: { [Op.in]: [] } };
    }

    if (scope === 'all') {
        const friendIds = await getAcceptedFriendIds(userId);
        if (friendIds.length === 0) {
            return { user_id: userId };
        }
        return {
            [Op.or]: [
                { user_id: userId },
                { user_id: { [Op.in]: friendIds }, is_private: false }
            ]
        };
    }

    return { user_id: userId };
};

const canViewPostRecord = async (userId, post) => {
    if (!post) {
        return false;
    }
    if (post.user_id === userId) {
        return true;
    }
    if (post.is_private) {
        return false;
    }

    const pair = normalizeFriendPair(userId, post.user_id);
    const friendship = await models.friendship.findOne({
        where: {
            ...pair,
            status: FRIENDSHIP_ACCEPTED
        }
    });

    return Boolean(friendship);
};

export {
    FRIENDSHIP_ACCEPTED,
    FRIENDSHIP_DECLINED,
    FRIENDSHIP_PENDING,
    canViewPostRecord,
    getAcceptedFriendIds,
    getDisplayName,
    getPostAccessWhere,
    mapOwnerSummary,
    mapUserSummary,
    normalizeFriendPair
};
