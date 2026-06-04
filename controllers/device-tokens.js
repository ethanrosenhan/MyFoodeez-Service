import { models } from '../utils/database.js';
import { sendError, sendSuccess } from '../lib/response-helper.js';
import { log } from '../lib/log-helper.js';

// Device token registration endpoint. Scaffolding only — the actual push
// notification triggers (weekly digest, "friend posted at a place you've
// been to", onboarding nudges) are deferred per current priorities. This
// gets the storage and registration in place so the app can start sending
// tokens immediately, and the triggers can be added in a follow-up without
// requiring an app update first.
//
// Tokens are Expo push tokens (ExponentPushToken[xxxxxxxxxxxxxxx]). Validation
// is intentionally light — we don't ping Expo here. The trigger job (when it
// exists) will get a "DeviceNotRegistered" response from Expo for dead tokens
// and clean them up there.

const VALID_PLATFORMS = ['ios', 'android', 'web'];

const toNullableString = (value) => {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};

const registerDeviceToken = async (request, response) => {
    try {
        const body = request.body || {};
        const token = toNullableString(body.token);
        const platformRaw = toNullableString(body.platform);
        const platform = platformRaw && VALID_PLATFORMS.includes(platformRaw.toLowerCase())
            ? platformRaw.toLowerCase()
            : null;

        if (!token) {
            return sendError(response, 400, 'token is required', 'device_token_missing');
        }

        // Upsert: if the token already exists (e.g. user reinstalls or
        // switches accounts on the same device), update the owner. Token is
        // globally unique per device.
        const [row, created] = await models.device_token.findOrCreate({
            where: { token },
            defaults: { user_id: request.user.id, token, platform }
        });

        if (!created && (row.user_id !== request.user.id || (platform && row.platform !== platform))) {
            await row.update({ user_id: request.user.id, platform: platform || row.platform });
        }

        log(request, '/device-tokens', { action: 'register', created, platform });
        return sendSuccess(response, created ? 201 : 200, { id: row.id, registered: true });
    } catch (error) {
        console.error('registerDeviceToken failed', error);
        return sendError(response, 500, 'Unable to register device token', 'device_token_register_failed');
    }
};

const unregisterDeviceToken = async (request, response) => {
    try {
        const token = toNullableString(request.params.token);
        if (!token) {
            return sendError(response, 400, 'token is required', 'device_token_missing');
        }
        // Scope the destroy to the current user so a malicious caller can't
        // remove another user's tokens by guessing.
        const deleted = await models.device_token.destroy({
            where: { user_id: request.user.id, token }
        });
        log(request, '/device-tokens', { action: 'unregister', deleted });
        return sendSuccess(response, 200, { deleted: deleted > 0 });
    } catch (error) {
        console.error('unregisterDeviceToken failed', error);
        return sendError(response, 500, 'Unable to remove device token', 'device_token_remove_failed');
    }
};

export { registerDeviceToken, unregisterDeviceToken };
