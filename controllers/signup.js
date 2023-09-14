

import bcrypt from 'bcryptjs';
import randomstring from 'randomstring';
import { addMinutes, isAfter } from 'date-fns'
import EmailValidator from 'email-validator';
import PasswordValidator from 'password-validator';
import formData from 'form-data';
import Mailgun from 'mailgun.js';

// const formData = require('form-data');
// const Mailgun = require('mailgun.js');
const mailgun = new Mailgun(formData);



import { models } from '../utils/database.js';
import  { log } from '../lib/log-helper.js';
import { SIGNUP_CODE_EXPIRES_IN } from '../constants/global.js';
const USER_ALREADY_EXISTS_ERROR = "user already exists";
const INVALID_REQUEST_ERROR = "invalid request";
const INTERNAL_SERVER_ERROR = "internal server error";
const INVALID_CODE_ERROR = "invalid code";
const INVALID_EMAIL_ERROR = "invalid email address";
const EXPIRED_CODE_ERROR = "expired code";

const passwordValidator = new PasswordValidator();
//TODO:  move these valid criteria to global constants
passwordValidator.is().min(8)                          // Minimum length 8
	.is().max(100)                                  // Maximum length 100
	.has().uppercase()                              // Must have uppercase letters
	.has().lowercase()                              // Must have lowercase letters
	.has().digits()                                 // Must have digits
	.has().not().spaces()                           // Should not have spaces
	.is().not().oneOf(['Passw0rd', 'Password123']);

const signupStart = async (req, res) => {

    log(req, '/signup-start',  { email: req.body.email });
    try {
    
        if (!req.body.firstname) {
            log(req, '/signup-start',  { error: "missing firstname" });
            return res.status(400).json({message: INVALID_REQUEST_ERROR});
        }

        if (!req.body.lastname) {
            log(req, '/signup-start',  { error: "missing lastname" });
            return res.status(400).json({message: INVALID_REQUEST_ERROR});
        }

        if (!req.body.email || !EmailValidator.validate(req.body.email)) {
            log(req, '/signup-start',  { error: INVALID_EMAIL_ERROR });
            return res.status(400).json({message: INVALID_EMAIL_ERROR});
        }
        const existingUser = await models.user.findOne({ where : { email: req.body.email }});
        if (existingUser) {
            log(req, '/signup-start',  { error: "email already exists" });
            return res.status(409).json({message: USER_ALREADY_EXISTS_ERROR});
        }

        if (!req.body.password) {
            log(req, '/signup-start',  { error: "password not provided" });
            return res.status(400).json({message: INVALID_REQUEST_ERROR});
        }

        const errors = passwordValidator.validate(req.body.password, { details: true });
        if (errors.length > 0) {
            log(req, '/signup-start',  { error: errors });
            return res.status(400).json(errors);
        }
        const passwordHash =  await bcrypt.hash(req.body.password, 12);
        const verifyCode = randomstring.generate({ length: 5,charset: 'numeric',readable: true });

        const codeExpires = addMinutes(Date.now(), SIGNUP_CODE_EXPIRES_IN);
        const signup = await models.signup.create(({
                            email: req.body.email,
                            first_name: req.body.firstname,
                            last_name: req.body.lastname,
                            password: passwordHash,
                            code: verifyCode,
                            code_expires_at: codeExpires
                        }));
        log(req, '/signup-start',  { code:signup.code });

        const mg = mailgun.client({username: 'api', key: process.env.MAILGUN_API_KEY });
        const response = await mg.messages.create(process.env.MAILGUN_DOMAIN, {
            from: process.env.SIGNUP_FROM_EMAIL,
            to: [signup.email],
            subject: process.env.SIGNUP_SUBJECT,
            text: "Verification code: " + signup.code,
            html: "<h2>Verification code</h2><h3>" + signup.code + "</h3>"
        });

        return res.status(200).json({message: "verification code has been sent to the email address" });
       
    } catch(e) {
        console.log(e);
        
        log(req, '/signup-start', e);
        return res.status(500).json({message: INTERNAL_SERVER_ERROR});
    }
};

const signupFinish = async (req, res) => {

    log(req, '/signup-finish',  { email: req.body.code });
    try {
        if (!req.body.code) {
            log(req, '/signup-finish',  { error: "code not provided" });
            return res.status(400).json({message: INVALID_REQUEST_ERROR});
        }
        const signup = await models.signup.findOne({ where : { code: req.body.code }});
        
        if (!signup) {
            log(req, '/signup-finish',  { error: "invalid code" });
            return res.status(409).json({message: INVALID_CODE_ERROR});
        }

        if (isAfter(Date.now(), signup.code_expires_at)) {
            log(req, '/signup-finish',  { error: "invalid code" });
            return res.status(409).json({message: EXPIRED_CODE_ERROR});
        }
        const existingUser = await models.user.findOne({ where : { email: signup.email }});
        if (existingUser) {
            log(req, '/signup-finish',  { error: "email already exists" });
            return res.status(409).json({message: USER_ALREADY_EXISTS_ERROR});
        }

        const user = await models.user.create(({
            email: signup.email,
            first_name: signup.first_name,
            last_name: signup.last_name,
            password: signup.password
        }));

        await signup.destroy();

        return res.status(200).json({message: "user has been created"});
     
    } catch(e) {
        console.log('error', e);
        log(req, '/signup-finish',  { error: e.message });
        return res.status(500).json({message: INTERNAL_SERVER_ERROR});
    }
};

export { signupStart,signupFinish };