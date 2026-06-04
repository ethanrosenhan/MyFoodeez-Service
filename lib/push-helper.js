import { models } from '../utils/database.js';
import Sequelize from 'sequelize';

const Op = Sequelize.Op;

// Thin wrapper around the Expo Push API. Direct HTTP rather than the
// expo-server-sdk package — we don't want another dependency for one
// endpoint. The API is documented at
// https://docs.expo.dev/push-notifications/sending-notifications/.
//
// Behavior:
//   - Batches messages (Expo's hard limit is 100/request; we use 99).
//   - Prunes tokens that Expo reports as DeviceNotRegistered on the immediate
//     ticket response. Receipts (deferred status) are not yet polled — to be
//     added when ticket failure rate becomes a real concern.
//   - Validates Expo token shape before sending so a corrupt row in
//     device_tokens can't blow up an entire batch.

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH_SIZE = 99;

const isExpoToken = (token) => typeof token === 'string' && token.startsWith('ExponentPushToken[') && token.endsWith(']');

const chunk = (arr, size) => {
    const out = [];
    for (let i = 0; i < arr.length; i += size) {
        out.push(arr.slice(i, i + size));
    }
    return out;
};

const sendOnce = async (messages) => {
    const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
            'accept': 'application/json',
            'accept-encoding': 'gzip, deflate',
            'content-type': 'application/json'
        },
        body: JSON.stringify(messages)
    });
    if (!response.ok) {
        console.warn(`expo push HTTP ${response.status}`);
        return [];
    }
    const json = await response.json();
    return Array.isArray(json?.data) ? json.data : [];
};

const pruneDeadTokens = async (deadTokens) => {
    if (!Array.isArray(deadTokens) || deadTokens.length === 0) {
        return;
    }
    await models.device_token.destroy({
        where: { token: { [Op.in]: deadTokens } }
    });
};

/**
 * Send a push to every device of every user in `userIds`.
 *
 * @param {number[]} userIds
 * @param {Object} message - { title, body, data? }
 * @returns {Promise<{ sent: number, dead: number }>}
 */
const sendToUsers = async (userIds, message) => {
    if (!Array.isArray(userIds) || userIds.length === 0) {
        return { sent: 0, dead: 0 };
    }
    if (!message?.title || !message?.body) {
        return { sent: 0, dead: 0 };
    }

    const tokens = await models.device_token.findAll({
        attributes: ['token'],
        where: { user_id: { [Op.in]: userIds } },
        raw: true
    });
    const validTokens = tokens
        .map((row) => row.token)
        .filter((token) => isExpoToken(token));

    if (validTokens.length === 0) {
        return { sent: 0, dead: 0 };
    }

    const messages = validTokens.map((token) => ({
        to: token,
        sound: 'default',
        title: message.title,
        body: message.body,
        data: message.data || {}
    }));

    const deadTokens = [];
    let sent = 0;
    for (const batch of chunk(messages, BATCH_SIZE)) {
        const tickets = await sendOnce(batch);
        // Tickets are 1:1 with input messages in order. We use the index to
        // map an error back to which token to prune.
        tickets.forEach((ticket, idx) => {
            if (ticket?.status === 'error' && ticket?.details?.error === 'DeviceNotRegistered') {
                deadTokens.push(batch[idx].to);
            } else if (ticket?.status === 'ok') {
                sent += 1;
            }
        });
    }

    await pruneDeadTokens(deadTokens);
    return { sent, dead: deadTokens.length };
};

export { sendToUsers, isExpoToken };
