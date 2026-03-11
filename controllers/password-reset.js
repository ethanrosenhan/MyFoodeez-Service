import randomstring from 'randomstring';
import { addMinutes, isAfter } from 'date-fns';
import jwt from 'jsonwebtoken';
import formData from 'form-data';
import Mailgun from 'mailgun.js';
import { Sequelize } from 'sequelize';
import { models } from '../utils/database.js';
import { log } from '../lib/log-helper.js';
import { getPasswordValidator, getPasswordHash } from '../lib/password-helper.js';
import { sendError, sendSuccess } from '../lib/response-helper.js';
import { PASSWORD_RESET_CODE_EXPIRES_IN, PASSWORD_RESET_SUBJECT, PASSWORD_CHANGE_TOKEN_EXPIRES_IN } from '../constants/global.js';

const INVALID_REQUEST_ERROR = 'Invalid request';
const INTERNAL_SERVER_ERROR = 'Internal server error';
const INVALID_CODE_ERROR = 'Invalid code';
const MISSING_EMAIL_ERROR = 'Email address is required';
const EXPIRED_CODE_ERROR = 'Expired code';

const mailgun = new Mailgun(formData);
const passwordValidator = getPasswordValidator();

const passwordResetStart = async (req, res) => {
    const email = req.body?.email?.trim();
    log(req, '/password-reset-start', { email });

    try {
        if (!email) {
            return sendError(res, 400, MISSING_EMAIL_ERROR, 'missing_email');
        }

        const existingUser = await models.user.findOne({ where: Sequelize.where(Sequelize.fn('lower', Sequelize.col('email')), email.toLowerCase()) });
        if (!existingUser) {
            return sendSuccess(res, 200, { message: 'Verification code has been sent to the email address' });
        }

        const verifyCode = randomstring.generate({ length: 5, charset: 'numeric', readable: true });
        const codeExpires = addMinutes(Date.now(), PASSWORD_RESET_CODE_EXPIRES_IN);
        const passwordResetRecord = await models.password_reset.create({
            email,
            code: verifyCode,
            code_expires_at: codeExpires
        });

        if (process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN && process.env.PASSWORD_CHANGE_FROM_EMAIL) {
            const mg = mailgun.client({ username: 'api', key: process.env.MAILGUN_API_KEY });
            await mg.messages.create(process.env.MAILGUN_DOMAIN, {
                from: process.env.PASSWORD_CHANGE_FROM_EMAIL,
                to: [passwordResetRecord.email],
                subject: PASSWORD_RESET_SUBJECT,
                text: `Verification code: ${passwordResetRecord.code}`,
                html: `<h2>Verification code</h2><h3>${passwordResetRecord.code}</h3>`
            });
        }

        return sendSuccess(res, 200, { message: 'Verification code has been sent to the email address' });
    } catch (error) {
        console.error('passwordResetStart failed', error);
        return sendError(res, 500, INTERNAL_SERVER_ERROR, 'password_reset_start_failed');
    }
};

const buildPasswordChangeToken = (email, secret) => {
    return jwt.sign({ email }, secret, { expiresIn: PASSWORD_CHANGE_TOKEN_EXPIRES_IN });
};

const passwordResetVerify = async (req, res) => {
    const code = req.body?.code?.trim();
    log(req, '/password-reset-verify', { code });

    try {
        if (!code) {
            return sendError(res, 400, INVALID_REQUEST_ERROR, 'invalid_request');
        }

        const passwordResetRecord = await models.password_reset.findOne({ where: { code } });
        if (!passwordResetRecord) {
            return sendError(res, 400, INVALID_CODE_ERROR, 'invalid_code');
        }

        if (isAfter(Date.now(), passwordResetRecord.code_expires_at)) {
            return sendError(res, 409, EXPIRED_CODE_ERROR, 'expired_code');
        }

        const existingUser = await models.user.findOne({ where: Sequelize.where(Sequelize.fn('lower', Sequelize.col('email')), passwordResetRecord.email.toLowerCase()) });
        const token = buildPasswordChangeToken(passwordResetRecord.email, existingUser.password);

        return sendSuccess(res, 200, {
            status: 'Verified user',
            token
        });
    } catch (error) {
        console.error('passwordResetVerify failed', error);
        log(req, '/password-reset-verify', { error: error.message });
        return sendError(res, 500, INTERNAL_SERVER_ERROR, 'password_reset_verify_failed');
    }
};

const passwordResetChange = async (req, res) => {
    log(req, '/password-reset-change', {});
    try {
        const newPassword = req.body?.newPassword;
        const confirmedPassword = req.body?.confirmedPassword;

        if (!newPassword || !confirmedPassword || confirmedPassword !== newPassword) {
            return sendError(res, 400, INVALID_REQUEST_ERROR, 'invalid_request');
        }

        const errors = passwordValidator.validate(newPassword, { details: true });
        if (errors.length > 0) {
            return sendError(res, 400, errors.map((error) => error.message).join('\n'), 'invalid_password');
        }

        const passwordHash = await getPasswordHash(newPassword);
        const existingUser = await models.user.findOne({ where: { email: req.user.email } });
        await existingUser.update({ password: passwordHash });
        return sendSuccess(res, 200, { message: 'Password has been changed' });
    } catch (error) {
        console.error('passwordResetChange failed', error);
        return sendError(res, 500, INTERNAL_SERVER_ERROR, 'password_reset_change_failed');
    }
};

const isPasswordChangeAuthorized = async (req, res, next) => {
    const authHeader = req.get('Authorization');
    if (!authHeader) {
        return sendError(res, 401, 'Not authorized', 'not_authorized');
    }

    try {
        const token = authHeader.split(' ')[1];
        const decodedToken = jwt.decode(token);
        if (!decodedToken?.email) {
            return sendError(res, 401, 'Not authorized', 'not_authorized');
        }

        const user = await models.user.findOne({ where: Sequelize.where(Sequelize.fn('lower', Sequelize.col('email')), decodedToken.email.toLowerCase()) });
        if (!user) {
            return sendError(res, 401, 'Not authorized', 'not_authorized');
        }

        jwt.verify(token, user.password);
        req.user = user.dataValues;
        req.decodedToken = decodedToken;
        return next();
    } catch (error) {
        return sendError(res, 401, 'Not authorized', 'not_authorized');
    }
};

export { passwordResetStart, passwordResetVerify, passwordResetChange, isPasswordChangeAuthorized };
