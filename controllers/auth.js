import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Sequelize } from 'sequelize';
import { models } from '../utils/database.js';
import { log } from '../lib/log-helper.js';
import { sendError, sendSuccess } from '../lib/response-helper.js';
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

        const token = buildToken(email);
        const refreshToken = buildRefreshToken(email);
        const decodedRefreshToken = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);

        await models.refresh_token.create({
            token: refreshToken,
            data: decodedRefreshToken
        });

        return sendSuccess(res, 200, {
            status: 'Logged in',
            token,
            refreshToken
        });
    } catch (error) {
        log(req, '/login', { error: error.message });
        return sendError(res, 500, 'Unable to login', 'login_failed');
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

export { addUserToRequest, isAuthorized, login, token };
