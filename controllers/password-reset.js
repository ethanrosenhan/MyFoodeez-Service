
import randomstring from 'randomstring';
import { addMinutes, isAfter } from 'date-fns'
import jwt from 'jsonwebtoken';

import formData from 'form-data';
import Mailgun from 'mailgun.js';

const mailgun = new Mailgun(formData);
import { Sequelize } from 'sequelize';
import { models } from '../utils/database.js';
import  { log } from '../lib/log-helper.js';
import  { getPasswordValidator, getPasswordHash } from '../lib/password-helper.js';
const passwordValidator = getPasswordValidator();
import { PASSWORD_RESET_CODE_EXPIRES_IN ,PASSWORD_RESET_SUBJECT, PASSWORD_CHANGE_TOKEN_EXPIRES_IN} from '../constants/global.js';
const INVALID_REQUEST_ERROR = "invalid request";
const INTERNAL_SERVER_ERROR = "internal server error";
const INVALID_CODE_ERROR = "invalid code";
const MISSING_EMAIL_ERROR = "email address is required";
const EXPIRED_CODE_ERROR = "expired code";


const passwordResetStart = async (req, res) => {

    log(req, '/password-reset-start',  { email: req.body.email });
   
    try {

        if (!req.body.email) {
            return res.status(400).json({message: MISSING_EMAIL_ERROR});
        }
 
        const existingUser = await models.user.findOne({ where : Sequelize.where(Sequelize.fn('lower', Sequelize.col('email')),req.body.email.toLowerCase())});
        if (!existingUser) {
            //IF user doesn't exist return same status to prevent someone from fishing for valid emails
            return res.status(200).json({message: "verification code has been sent to the email address" });
        }

        const verifyCode = randomstring.generate({ length: 5,charset: 'numeric',readable: true });
        const codeExpires = addMinutes(Date.now(), PASSWORD_RESET_CODE_EXPIRES_IN);
        const password_reset = await models.password_reset.create(({
                            email: req.body.email,
                            code: verifyCode,
                            code_expires_at: codeExpires
                        }));

        const mg = mailgun.client({username: 'api', key: process.env.MAILGUN_API_KEY });
        const response = await mg.messages.create(process.env.MAILGUN_DOMAIN, {
            from: process.env.PASSWORD_CHANGE_FROM_EMAIL,
            to: [password_reset.email],
            subject: PASSWORD_RESET_SUBJECT,
            text: "Verification code: " + password_reset.code,
            html: "<h2>Verification code</h2><h3>" + password_reset.code + "</h3>"
        });

        return res.status(200).json({message: "verification code has been sent to the email address" });
       
    } catch(e) {
        console.log(e);
        return res.status(500).json({message: INTERNAL_SERVER_ERROR});
    }
};

/*  https://melodiessim.netlify.app/Reset%20Password%20Flow%20Using%20JWT/ */
const buildPasswordChangeToken = (email, secret)=> {
    return jwt.sign({ email: email}, secret, { expiresIn: PASSWORD_CHANGE_TOKEN_EXPIRES_IN });
}

const passwordResetVerify = async (req, res) => {

    log(req, '/password-reset-verify',  { code: req.body.code });
    try {

        if (!req.body.code)
            return res.status(400).json({message: INVALID_REQUEST_ERROR});

        const password_reset = await models.password_reset.findOne({ where : { code: req.body.code }});
        if (!password_reset) 
            return res.status(400).json({message: INVALID_CODE_ERROR});
      
        if (isAfter(Date.now(), password_reset.code_expires_at))
            return res.status(409).json({message: EXPIRED_CODE_ERROR});

        const existingUser = await models.user.findOne({ where : Sequelize.where(Sequelize.fn('lower', Sequelize.col('email')),password_reset.email.toLowerCase())});
       
        //User password hash was used as the secret key for the token
        const token = buildPasswordChangeToken(password_reset.email, existingUser.password);
        const response = {
            "status": "Verified user",
            "token": token
        }

        return res.status(200).json(response);
     
    } catch(e) {
        console.log('error', e);
        log(req, '/signup-finish',  { error: e.message });
        return res.status(500).json({message: INTERNAL_SERVER_ERROR});
    }
};


const passwordResetChange = async (req, res) => {

    log(req, '/pasword-reset-change',  {  });
    try {
        if (!req.body.newPassword || !req.body.confirmedPassword ) {
            return res.status(400).json({message: INVALID_REQUEST_ERROR});
        }
        if (!(req.body.confirmedPassword === req.body.newPassword)) {
            return res.status(400).json({message: INVALID_REQUEST_ERROR});
        }

        const errors = passwordValidator.validate(req.body.newPassword, { details: true });
        if (errors.length > 0) 
            return res.status(400).json({ message: errors.map(e => e.message).join("\n") });
        
        const passwordHash =  await getPasswordHash(req.body.newPassword);
        const existingUser = await models.user.findOne({ where : { email: req.user.email }});
        await existingUser.update({ password: passwordHash });
        return res.status(200).json({message: "password has been changed"});
     
    } catch(e) {
        console.log('error', e);
        return res.status(500).json({message: INTERNAL_SERVER_ERROR});
    }
};

const isPasswordChangeAuthorized = async (req, res, next) => {
    const authHeader = req.get("Authorization");

    if (!authHeader)  
        return res.status(401).json({ message: 'not authorized' });

    const token = authHeader.split(' ')[1];
    let decodedToken;
    try {
        decodedToken = jwt.decode(token);
    } catch (error) {
        console.log(error);
        return res.status(401).json({ message: 'not authorized'});
    };
    if (!decodedToken)
        return res.status(401).json({ message: 'not authorized' });

    const user = await models.user.findOne({ where : Sequelize.where(Sequelize.fn('lower', Sequelize.col('email')),decodedToken.email.toLowerCase())});
    if (!user)         
        return res.status(401).json({ message: 'not authorized' });
    try {
        //User password hash was used as the secret key
        jwt.verify(token, user.password);
    } catch (error) {
        console.log(error);
        return res.status(401).json({ message: 'not authorized'});
    };

    req.user = user.dataValues;
    req.decodedToken = decodedToken;
    
    next();
    
};
export { passwordResetStart,passwordResetVerify, passwordResetChange, isPasswordChangeAuthorized };