import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Sequelize } from 'sequelize';
import { OAuth2Client } from 'google-auth-library';
import { models } from '../utils/database.js';
import { log } from '../lib/log-helper.js';
import { sendError, sendSuccess } from '../lib/response-helper.js';
import { verifyAppleIdToken } from '../lib/apple-auth.js';
import { getOptionalEnv } from '../utils/env.js';
import {
    TOKEN_SECRET,
    TOKEN_EXPIRES_IN,
    REFRESH_TOKEN_SECRET,
    REFRESH_TOKEN_EXPIRES_IN,
    INVALID_CREDENTIALS_ERROR,
    INVALID_REQUEST_ERROR
} from '../constants/global.js';

const buildToken = (email) => {
    return jwt.sign({ email }, TOKEN_SECRET, { expiresIn: TOKEN_EXPIRES_IN });
};

const buildRefreshToken = (email) => {
    return jwt.sign({ email }, REFRESH_TOKEN_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRES_IN });
};

const getUserByEmail = async (email) => {
    return models.user.findOne({
        where: Sequelize.where(Sequelize.fn('lower', Sequelize.col('email')), email.toLowerCase())
    });
};

// Mint an access token + refresh token for an authenticated email and persist
// the refresh token. Shared by password login and the OAuth flows so the
// session shape stays identical regardless of how the user authenticated.
const issueSession = async (email) => {
    const accessToken = buildToken(email);
    const refreshToken = buildRefreshToken(email);
    const decodedRefreshToken = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);

    await models.refresh_token.create({
        token: refreshToken,
        data: decodedRefreshToken
    });

    return { token: accessToken, refreshToken };
};

// Split a provider-supplied display name into first/last. Apple sends a
// structured { givenName, familyName }; Google sends given_name/family_name in
// the verified token. Falls back to splitting a single name string.
const splitName = ({ firstName, lastName, fullName }) => {
    if (firstName || lastName) {
        return { first_name: firstName || '', last_name: lastName || '' };
    }
    const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
        return { first_name: '', last_name: '' };
    }
    return { first_name: parts[0], last_name: parts.slice(1).join(' ') };
};

// Find an existing user by provider id or verified email, linking the provider
// to a pre-existing email/password account when the verified emails match.
// Creates a passwordless account when no match exists.
const findOrCreateOAuthUser = async ({ provider, providerId, email, firstName, lastName }) => {
    const providerColumn = provider === 'apple' ? 'apple_id' : 'google_id';

    // 1) Already linked? Match on the stable provider id.
    let user = await models.user.findOne({ where: { [providerColumn]: providerId } });
    if (user) {
        return user;
    }

    // 2) Existing account with the same verified email — link the provider.
    if (email) {
        user = await getUserByEmail(email);
        if (user) {
            await user.update({ [providerColumn]: providerId, auth_provider: user.auth_provider || provider });
            return user;
        }
    }

    // 3) Brand new account. Apple can withhold email (private relay opt-out is
    // rare, but the field can be absent on repeat auths) — require it here so
    // we never create an account we can't key off an email.
    if (!email) {
        throw new Error('email_unavailable');
    }
    const { first_name, last_name } = splitName({ firstName, lastName });
    user = await models.user.create({
        email,
        first_name,
        last_name,
        password: null,
        [providerColumn]: providerId,
        auth_provider: provider
    });
    return user;
};

const addUserToRequest = async (req, res, next) => {
    try {
        const authHeader = req.get('Authorization');
        if (!authHeader) {
            return next();
        }

        const token = authHeader.split(' ')[1];
        const decodedToken = jwt.verify(token, TOKEN_SECRET);
        const user = await getUserByEmail(decodedToken.email);
        if (user) {
            req.user = user.dataValues;
        }
    } catch (error) {
        console.warn('Unable to attach user to request', error.message);
    }

    next();
};

const isAuthorized = async (req, res, next) => {
    const authHeader = req.get('Authorization');
    if (!authHeader) {
        return sendError(res, 401, 'Not authorized', 'not_authorized');
    }

    try {
        const token = authHeader.split(' ')[1];
        const decodedToken = jwt.verify(token, TOKEN_SECRET);
        const user = await getUserByEmail(decodedToken.email);

        if (!user) {
            return sendError(res, 401, 'Not authorized', 'not_authorized');
        }

        req.user = user.dataValues;
        req.decodedToken = decodedToken;
        return next();
    } catch (error) {
        return sendError(res, 401, 'Not authorized', 'not_authorized');
    }
};

const login = async (req, res) => {
    const email = req.body?.email?.trim();
    const password = req.body?.password;

    log(req, '/login', { email });

    if (!email || !password) {
        return sendError(res, 400, INVALID_REQUEST_ERROR, 'invalid_request');
    }

    try {
        const dbUser = await getUserByEmail(email);
        if (!dbUser || !dbUser.password) {
            return sendError(res, 401, INVALID_CREDENTIALS_ERROR, 'invalid_credentials');
        }

        const matches = await bcrypt.compare(password, dbUser.password);
        if (!matches) {
            return sendError(res, 401, INVALID_CREDENTIALS_ERROR, 'invalid_credentials');
        }

        const session = await issueSession(email);

        return sendSuccess(res, 200, {
            status: 'Logged in',
            token: session.token,
            refreshToken: session.refreshToken
        });
    } catch (error) {
        log(req, '/login', { error: error.message });
        return sendError(res, 500, 'Unable to login', 'login_failed');
    }
};

// POST /auth/google — exchange a Google ID token (obtained client-side via the
// native Google sign-in / expo-auth-session) for a Foodeez session. We verify
// the token against Google's certs so a forged token can't mint a session.
const googleLogin = async (req, res) => {
    const idToken = req.body?.idToken || req.body?.id_token;
    log(req, '/auth/google', { hasIdToken: Boolean(idToken) });

    if (!idToken) {
        return sendError(res, 400, INVALID_REQUEST_ERROR, 'invalid_request');
    }

    // Accept tokens issued for any of the platform client ids we ship with
    // (iOS, Android, Web/Expo). Empty entries are filtered out.
    const audiences = [
        getOptionalEnv('GOOGLE_OAUTH_IOS_CLIENT_ID'),
        getOptionalEnv('GOOGLE_OAUTH_ANDROID_CLIENT_ID'),
        getOptionalEnv('GOOGLE_OAUTH_WEB_CLIENT_ID')
    ].filter((value) => typeof value === 'string' && value.length > 0);

    if (audiences.length === 0) {
        return sendError(res, 503, 'Google sign-in is not configured', 'google_not_configured');
    }

    try {
        const client = new OAuth2Client();
        const ticket = await client.verifyIdToken({ idToken, audience: audiences });
        const payload = ticket.getPayload();

        if (!payload || !payload.sub) {
            return sendError(res, 401, INVALID_CREDENTIALS_ERROR, 'invalid_credentials');
        }
        // Google sets email_verified=false only for unusual edge cases; treat
        // an unverified email as "no email" so we don't link to it.
        const email = payload.email_verified === false ? null : (payload.email || null);

        const user = await findOrCreateOAuthUser({
            provider: 'google',
            providerId: payload.sub,
            email,
            firstName: payload.given_name,
            lastName: payload.family_name
        });

        const session = await issueSession(user.email);
        return sendSuccess(res, 200, {
            status: 'Logged in',
            token: session.token,
            refreshToken: session.refreshToken
        });
    } catch (error) {
        log(req, '/auth/google', { error: error.message });
        if (error.message === 'email_unavailable') {
            return sendError(res, 400, 'Google did not share an email address', 'email_unavailable');
        }
        return sendError(res, 401, INVALID_CREDENTIALS_ERROR, 'invalid_credentials');
    }
};

// POST /auth/apple — exchange an Apple identity token for a Foodeez session.
// Apple only returns the user's name on the FIRST authorization, so the client
// forwards it (fullName) when present; on later sign-ins we rely on the stored
// record.
const appleLogin = async (req, res) => {
    const identityToken = req.body?.identityToken || req.body?.identity_token;
    log(req, '/auth/apple', { hasIdentityToken: Boolean(identityToken) });

    if (!identityToken) {
        return sendError(res, 400, INVALID_REQUEST_ERROR, 'invalid_request');
    }

    const audience = getOptionalEnv('APPLE_CLIENT_ID');
    if (!audience) {
        return sendError(res, 503, 'Apple sign-in is not configured', 'apple_not_configured');
    }

    try {
        const payload = await verifyAppleIdToken(identityToken, audience);
        if (!payload || !payload.sub) {
            return sendError(res, 401, INVALID_CREDENTIALS_ERROR, 'invalid_credentials');
        }
        const email = payload.email_verified === 'false' ? null : (payload.email || null);

        const user = await findOrCreateOAuthUser({
            provider: 'apple',
            providerId: payload.sub,
            email,
            firstName: req.body?.firstName,
            lastName: req.body?.lastName
        });

        const session = await issueSession(user.email);
        return sendSuccess(res, 200, {
            status: 'Logged in',
            token: session.token,
            refreshToken: session.refreshToken
        });
    } catch (error) {
        log(req, '/auth/apple', { error: error.message });
        if (error.message === 'email_unavailable') {
            return sendError(res, 400, 'Apple did not share an email address', 'email_unavailable');
        }
        return sendError(res, 401, INVALID_CREDENTIALS_ERROR, 'invalid_credentials');
    }
};

const token = async (req, res) => {
    const refreshToken = req.body?.refreshToken;
    log(req, '/token', { hasRefreshToken: Boolean(refreshToken) });

    if (!refreshToken) {
        return sendError(res, 400, INVALID_REQUEST_ERROR, 'invalid_request');
    }

    try {
        const savedRefreshToken = await models.refresh_token.findOne({ where: { token: refreshToken } });
        if (!savedRefreshToken) {
            return sendError(res, 404, INVALID_REQUEST_ERROR, 'invalid_request');
        }

        const decodedRefreshToken = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);
        const dbUser = await getUserByEmail(decodedRefreshToken.email);
        if (!dbUser) {
            return sendError(res, 404, INVALID_REQUEST_ERROR, 'invalid_request');
        }

        const nextToken = buildToken(decodedRefreshToken.email);
        return sendSuccess(res, 200, { token: nextToken });
    } catch (error) {
        return sendError(res, 404, INVALID_REQUEST_ERROR, 'invalid_request');
    }
};

export { addUserToRequest, isAuthorized, login, token, googleLogin, appleLogin };
