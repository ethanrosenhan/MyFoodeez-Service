import bcrypt from 'bcryptjs';
import randomstring from 'randomstring';
import { addMinutes, isAfter } from 'date-fns';
import EmailValidator from 'email-validator';
import { getPasswordValidator } from '../lib/password-helper.js';
import formData from 'form-data';
import Mailgun from 'mailgun.js';
import { models } from '../utils/database.js';
import { log } from '../lib/log-helper.js';
import { sendError, sendSuccess } from '../lib/response-helper.js';
import { SIGNUP_CODE_EXPIRES_IN, SIGNUP_SUBJECT } from '../constants/global.js';

const USER_ALREADY_EXISTS_ERROR = 'User already exists';
const INVALID_REQUEST_ERROR = 'Invalid request';
const INTERNAL_SERVER_ERROR = 'Internal server error';
const INVALID_CODE_ERROR = 'Invalid code';
const INVALID_EMAIL_ERROR = 'Invalid email address';
const EXPIRED_CODE_ERROR = 'Expired code';

const mailgun = new Mailgun(formData);
const passwordValidator = getPasswordValidator();
passwordValidator.is().min(8).is().max(100).has().uppercase().has().lowercase().has().digits().has().not().spaces().is().not().oneOf(['Passw0rd', 'Password123']);

const signupStart = async (req, res) => {
    const email = req.body?.email?.trim();
    log(req, '/signup-start', { email });

    try {
        if (!req.body?.firstname || !req.body?.lastname || !req.body?.password) {
            return sendError(res, 400, INVALID_REQUEST_ERROR, 'invalid_request');
        }

        if (!email || !EmailValidator.validate(email)) {
            return sendError(res, 400, INVALID_EMAIL_ERROR, 'invalid_email');
        }

        const existingUser = await models.user.findOne({ where: { email } });
        if (existingUser) {
            return sendError(res, 409, USER_ALREADY_EXISTS_ERROR, 'user_exists');
        }

        const errors = passwordValidator.validate(req.body.password, { details: true });
        if (errors.length > 0) {
            return sendError(res, 400, errors.map((error) => error.message).join('\n'), 'invalid_password');
        }

        const passwordHash = await bcrypt.hash(req.body.password, 12);
        const verifyCode = randomstring.generate({ length: 5, charset: 'numeric', readable: true });
        const codeExpires = addMinutes(Date.now(), SIGNUP_CODE_EXPIRES_IN);
        const signup = await models.signup.create({
            email,
            first_name: req.body.firstname,
            last_name: req.body.lastname,
            password: passwordHash,
            code: verifyCode,
            code_expires_at: codeExpires
        });

        if (process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN && process.env.SIGNUP_FROM_EMAIL) {
            const mg = mailgun.client({ username: 'api', key: process.env.MAILGUN_API_KEY });
            await mg.messages.create(process.env.MAILGUN_DOMAIN, {
                from: process.env.SIGNUP_FROM_EMAIL,
                to: [signup.email],
                subject: SIGNUP_SUBJECT,
                text: `Verification code: ${signup.code}`,
                html: `<h2>Verification code</h2><h3>${signup.code}</h3>`
            });
        }

        return sendSuccess(res, 200, { message: 'Verification code has been sent to the email address' });
    } catch (error) {
        console.error('signupStart failed', error);
        log(req, '/signup-start', { error: error.message });
        return sendError(res, 500, INTERNAL_SERVER_ERROR, 'signup_start_failed');
    }
};

const signupFinish = async (req, res) => {
    const code = req.body?.code?.trim();
    log(req, '/signup-finish', { code });

    try {
        if (!code) {
            return sendError(res, 400, INVALID_REQUEST_ERROR, 'invalid_request');
        }

        const signup = await models.signup.findOne({ where: { code } });
        if (!signup) {
            return sendError(res, 409, INVALID_CODE_ERROR, 'invalid_code');
        }

        if (isAfter(Date.now(), signup.code_expires_at)) {
            return sendError(res, 409, EXPIRED_CODE_ERROR, 'expired_code');
        }

        const existingUser = await models.user.findOne({ where: { email: signup.email } });
        if (existingUser) {
            return sendError(res, 409, USER_ALREADY_EXISTS_ERROR, 'user_exists');
        }

        await models.user.create({
            email: signup.email,
            first_name: signup.first_name,
            last_name: signup.last_name,
            password: signup.password
        });

        return sendSuccess(res, 200, { message: 'User has been created' });
    } catch (error) {
        console.error('signupFinish failed', error);
        log(req, '/signup-finish', { error: error.message });
        return sendError(res, 500, INTERNAL_SERVER_ERROR, 'signup_finish_failed');
    }
};

export { signupStart, signupFinish };
