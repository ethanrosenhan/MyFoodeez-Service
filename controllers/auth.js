

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { models } from '../utils/database.js';
import  { log } from '../lib/log-helper.js';
import { 
    TOKEN_SECRET, 
    TOKEN_EXPIRES_IN,
    REFRESH_TOKEN_SECRET, 
    REFRESH_TOKEN_EXPIRES_IN,
    INVALID_CREDENTIALS_ERROR,
    INVALID_REQUEST_ERROR
} from '../constants/global.js';

const buildToken = (email)=> {
    return jwt.sign({ email: email}, TOKEN_SECRET, { expiresIn: TOKEN_EXPIRES_IN });
}

const buildRefreshToken = (email)=> {
    return jwt.sign({ email: email}, REFRESH_TOKEN_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRES_IN });
}
const addUserToRequest = async (req, res, next) => {
    try {
        const authHeader = req.get("Authorization");
        if (authHeader) {
            const token = authHeader.split(' ')[1];
            const decodedToken = jwt.verify(token, TOKEN_SECRET);;
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
        decodedToken = jwt.verify(token, TOKEN_SECRET);
    } catch (error) {
        console.log(error);
        return res.status(401).json({ message: error.message || 'could not decode the token' });
    };

    if (!decodedToken)
        return res.status(401).json({ message: 'unauthorized' });

    const user = await models.user.findOne({ where : { email: decodedToken.email }});
    if (!user) {
        return res.status(401).json({ message: 'unauthorized' });
    }
    req.user = user.dataValues;
    req.decodedToken = decodedToken;
    next();
    
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
            bcrypt.compare(req.body.password, dbUser.password, async (err, compareRes) => {
                if (err) {
                    log(req, '/login',  { error: "error while checking user password" });
                    return res.status(502).json({message: INVALID_CREDENTIALS_ERROR});
                } else if (compareRes) { // password match
                    const token = buildToken(req.body.email);
                    const refreshToken = buildRefreshToken(req.body.email);
                    const decodedRefreshToken = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);
                    await models.refresh_token.create(({
                        token: refreshToken,
                        data: decodedRefreshToken
                    }));

                    const response = {
                        "status": "Logged in",
                        "token": token,
                        "refreshToken": refreshToken,
                    }

                    return res.status(200).json(response);
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

const token = async (req, res) => {
    const postData = req.body

    log(req, '/token',  {  refreshToken: postData.refreshToken });
    const refresh_token = await models.refresh_token.findOne({ where : { token: postData.refreshToken}});

    if (!refresh_token) {
        console.log("missing refresh_token token in db");

        return res.status(404).json({ message: INVALID_REQUEST_ERROR });
    }

    let decodedRefreshToken;
    try {
        decodedRefreshToken = jwt.verify(postData.refreshToken, REFRESH_TOKEN_SECRET);
    } catch (error) {
        console.log(error);
        return res.status(404).json({ message: INVALID_REQUEST_ERROR });
    };

    if (!decodedRefreshToken){
        console.log("failed to decode refresh token");

        return res.status(404).json({ message: INVALID_REQUEST_ERROR });
    }
     

    const dbUser = await models.user.findOne({ where : { email: decodedRefreshToken.email }})
    if (!dbUser)
        return res.status(404).json({ message: INVALID_REQUEST_ERROR });

    const token = buildToken(decodedRefreshToken.email);
    const response = {
       "token": token
    }
    // update the token in the list
    res.status(200).json(response);


};
export { login, token, isAuthorized, addUserToRequest };