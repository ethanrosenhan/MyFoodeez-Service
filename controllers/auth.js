

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { models } from '../utils/database.js';
import  { log } from '../lib/log-helper.js';
import { AUTH_SECRET, AUTH_EXPIRES_IN, INVALID_CREDENTIALS_ERROR} from '../constants/global.js';

const buildJwtToken = (email)=> {
    return jwt.sign({ email: email}, AUTH_SECRET, { expiresIn: AUTH_EXPIRES_IN });
}

const addUserToRequest = async (req, res, next) => {
    try {
        const authHeader = req.get("Authorization");
        if (authHeader) {
            const token = authHeader.split(' ')[1];
            const decodedToken = jwt.verify(token, AUTH_SECRET);;
            if (decodedToken) {
                const user = await models.user.findOne({ where : { email: decodedToken.email }});
                if (!user) {
                    return res.status(401).json({ message: 'unauthorized' });
                }
                req.user = user.dataValues;
            };
        }
    } catch (error) {
        console.log(error);
    }

    next();
};

const isAuthorized = async (req, res, next) => {
    const authHeader = req.get("Authorization");

    if (!authHeader) {
        return res.status(401).json({ message: 'not authenticated' });
    };
    const token = authHeader.split(' ')[1];
    let decodedToken;
    try {
        decodedToken = jwt.verify(token, AUTH_SECRET);
    } catch (error) {
        console.log(error);
        return res.status(401).json({ message: error.message || 'could not decode the token' });
    };

    if (!decodedToken) {
        return res.status(401).json({ message: 'unauthorized' });
    } else {
        const user = await models.user.findOne({ where : { email: decodedToken.email }});
        if (!user) {
            return res.status(401).json({ message: 'unauthorized' });
        }
        req.user = user.dataValues;
        next();
    };
};

const login = async (req, res) => {

    log(req, '/login',  {  email: req.body.email });

    if (!req.body.email) {
        log(req, '/login',  { error: "missing email in the request body" });
        return res.status(401).json({message: INVALID_CREDENTIALS_ERROR});
    }
    if (!req.body.password) {
        log(req, '/login',  { error: "missing password in the request body" });
        return res.status(401).json({message: INVALID_CREDENTIALS_ERROR});
    }

    try {
        const dbUser = await models.user.findOne({ where : { email: req.body.email,}});
        if (!dbUser) {
            log(req, '/login',  { error: "user not found" });
            return res.status(404).json({message: INVALID_CREDENTIALS_ERROR});
        } else {
            bcrypt.compare(req.body.password, dbUser.password, (err, compareRes) => {
                if (err) {
                    log(req, '/login',  { error: "error while checking user password" });
                    return res.status(502).json({message: INVALID_CREDENTIALS_ERROR});
                } else if (compareRes) { // password match
                    const token = buildJwtToken(req.body.email);
                    return res.status(200).json({message: "user logged in", "token": token});
                } else {
                    return res.status(401).json({message: INVALID_CREDENTIALS_ERROR});
                };
            });
        };
    } catch (err) {
        log(req, '/login',  { error: err.message });
        console.log('error', err);
    }

};
export { login,isAuthorized, addUserToRequest };