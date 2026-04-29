import Sequelize from 'sequelize';
import { models } from '../utils/database.js';
import { sendError, sendSuccess } from '../lib/response-helper.js';
import {
    FRIENDSHIP_ACCEPTED,
    FRIENDSHIP_DECLINED,
    FRIENDSHIP_PENDING,
    mapUserSummary,
    normalizeFriendPair
} from '../lib/social-helper.js';

const Op = Sequelize.Op;

const getUserById = async (id) => {
    const userId = Number(id);
    if (!Number.isInteger(userId)) {
        return null;
    }
    return models.user.findByPk(userId);
};

const getFriendship = async (firstUserId, secondUserId) => {
    return models.friendship.findOne({
        where: normalizeFriendPair(firstUserId, secondUserId),
        include: [
            { model: models.user, as: 'requester', attributes: ['id', 'email', 'first_name', 'last_name'] },
            { model: models.user, as: 'addressee', attributes: ['id', 'email', 'first_name', 'last_name'] }
        ]
    });
};

const relationshipForUser = async (currentUserId, targetUserId) => {
    const friendship = await getFriendship(currentUserId, targetUserId);

    return {
        friendship_status: friendship?.status ?? null,
        friend_request_id: friendship?.id ?? null,
        friend_request_direction: friendship
            ? friendship.requester_user_id === currentUserId ? 'outgoing' : 'incoming'
            : null
    };
};

const serializeFriendship = (friendship, currentUserId) => {
    const otherUser = friendship.requester_user_id === currentUserId
        ? friendship.addressee
        : friendship.requester;

    return {
        id: friendship.id,
        status: friendship.status,
        direction: friendship.requester_user_id === currentUserId ? 'outgoing' : 'incoming',
        user: mapUserSummary(otherUser)
    };
};

const searchUsers = async (request, response) => {
    const query = (request.query.query || '').trim();
    if (query.length < 2) {
        return sendSuccess(response, 200, { data: [] });
    }

    try {
        const users = await models.user.findAll({
            attributes: ['id', 'email', 'first_name', 'last_name'],
            where: {
                id: { [Op.ne]: request.user.id },
                [Op.or]: [
                    { first_name: { [Op.iLike]: `%${query}%` } },
                    { last_name: { [Op.iLike]: `%${query}%` } },
                    Sequelize.where(
                        Sequelize.fn('concat', Sequelize.col('first_name'), ' ', Sequelize.col('last_name')),
                        { [Op.iLike]: `%${query}%` }
                    )
                ]
            },
            limit: 20,
            order: [['first_name', 'ASC'], ['last_name', 'ASC']]
        });

        const data = await Promise.all(users.map(async (user) => ({
            ...mapUserSummary(user),
            relationship: await relationshipForUser(request.user.id, user.id)
        })));

        return sendSuccess(response, 200, { data });
    } catch (error) {
        console.error('user search failed', error);
        return sendError(response, 500, 'Unable to search users', 'user_search_failed');
    }
};

const listFriends = async (request, response) => {
    try {
        const friendships = await models.friendship.findAll({
            where: {
                status: FRIENDSHIP_ACCEPTED,
                [Op.or]: [
                    { user_one_id: request.user.id },
                    { user_two_id: request.user.id }
                ]
            },
            include: [
                { model: models.user, as: 'requester', attributes: ['id', 'email', 'first_name', 'last_name'] },
                { model: models.user, as: 'addressee', attributes: ['id', 'email', 'first_name', 'last_name'] }
            ],
            order: [['updated_at', 'DESC']]
        });

        return sendSuccess(response, 200, {
            data: friendships.map((friendship) => serializeFriendship(friendship, request.user.id))
        });
    } catch (error) {
        console.error('friends list failed', error);
        return sendError(response, 500, 'Unable to load friends', 'friends_fetch_failed');
    }
};

const listFriendRequests = async (request, response) => {
    try {
        const friendships = await models.friendship.findAll({
            where: {
                status: FRIENDSHIP_PENDING,
                [Op.or]: [
                    { requester_user_id: request.user.id },
                    { addressee_user_id: request.user.id }
                ]
            },
            include: [
                { model: models.user, as: 'requester', attributes: ['id', 'email', 'first_name', 'last_name'] },
                { model: models.user, as: 'addressee', attributes: ['id', 'email', 'first_name', 'last_name'] }
            ],
            order: [['updated_at', 'DESC']]
        });

        return sendSuccess(response, 200, {
            data: friendships.map((friendship) => serializeFriendship(friendship, request.user.id))
        });
    } catch (error) {
        console.error('friend requests list failed', error);
        return sendError(response, 500, 'Unable to load friend requests', 'friend_requests_fetch_failed');
    }
};

const requestFriend = async (request, response) => {
    const targetUser = await getUserById(request.body?.user_id);
    if (!targetUser || targetUser.id === request.user.id) {
        return sendError(response, 400, 'Invalid friend request', 'invalid_friend_request');
    }

    try {
        const pair = normalizeFriendPair(request.user.id, targetUser.id);
        const existing = await models.friendship.findOne({ where: pair });
        if (existing && existing.status !== FRIENDSHIP_DECLINED) {
            return sendError(response, 409, 'Friend request already exists', 'friend_request_exists');
        }

        const friendship = existing
            ? await existing.update({
                requester_user_id: request.user.id,
                addressee_user_id: targetUser.id,
                status: FRIENDSHIP_PENDING
            })
            : await models.friendship.create({
                ...pair,
                requester_user_id: request.user.id,
                addressee_user_id: targetUser.id,
                status: FRIENDSHIP_PENDING
            });

        return sendSuccess(response, existing ? 200 : 201, {
            id: friendship.id,
            status: friendship.status
        });
    } catch (error) {
        console.error('friend request failed', error);
        return sendError(response, 500, 'Unable to send friend request', 'friend_request_failed');
    }
};

const findIncomingRequest = async (request) => {
    return models.friendship.findOne({
        where: {
            id: request.params.id,
            addressee_user_id: request.user.id,
            status: FRIENDSHIP_PENDING
        }
    });
};

const acceptFriendRequest = async (request, response) => {
    try {
        const friendship = await findIncomingRequest(request);
        if (!friendship) {
            return sendError(response, 404, 'Friend request not found', 'friend_request_not_found');
        }

        await friendship.update({ status: FRIENDSHIP_ACCEPTED });
        return sendSuccess(response, 200, { id: friendship.id, status: FRIENDSHIP_ACCEPTED });
    } catch (error) {
        console.error('friend accept failed', error);
        return sendError(response, 500, 'Unable to accept friend request', 'friend_accept_failed');
    }
};

const declineFriendRequest = async (request, response) => {
    try {
        const friendship = await findIncomingRequest(request);
        if (!friendship) {
            return sendError(response, 404, 'Friend request not found', 'friend_request_not_found');
        }

        await friendship.update({ status: FRIENDSHIP_DECLINED });
        return sendSuccess(response, 200, { id: friendship.id, status: FRIENDSHIP_DECLINED });
    } catch (error) {
        console.error('friend decline failed', error);
        return sendError(response, 500, 'Unable to decline friend request', 'friend_decline_failed');
    }
};

const removeFriend = async (request, response) => {
    const targetUser = await getUserById(request.params.userId);
    if (!targetUser) {
        return sendError(response, 404, 'User not found', 'user_not_found');
    }

    try {
        await models.friendship.destroy({
            where: {
                ...normalizeFriendPair(request.user.id, targetUser.id),
                status: FRIENDSHIP_ACCEPTED
            }
        });
        return sendSuccess(response, 200, { deleted: true });
    } catch (error) {
        console.error('friend remove failed', error);
        return sendError(response, 500, 'Unable to remove friend', 'friend_remove_failed');
    }
};

export {
    acceptFriendRequest,
    declineFriendRequest,
    listFriendRequests,
    listFriends,
    removeFriend,
    requestFriend,
    searchUsers
};
