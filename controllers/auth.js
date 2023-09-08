import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import PasswordValidator from 'password-validator';
import { models } from '../utils/database.js';
import  { addAudit } from '../lib/AuditHelper.js';
import Redis from 'ioredis';
const { REDIS_URL } = process.env;
const redis = new Redis(REDIS_URL);


//TODO:  rotate this auth secret or store somewhere in the ENV
const AUTH_SECRET ="GF5JpZGZYJGGIHhnIphb";
const AUTH_EXPIRES_IN ="24h";
const buildJwtToken = (email)=> {
    return jwt.sign({ email: email}, AUTH_SECRET, { expiresIn: AUTH_EXPIRES_IN });
}

const passwordValidator = new PasswordValidator();
passwordValidator.is().min(8)                          // Minimum length 8
	.is().max(100)                                  // Maximum length 100
	.has().uppercase()                              // Must have uppercase letters
	.has().lowercase()                              // Must have lowercase letters
	.has().digits()                                 // Must have digits
	.has().not().spaces()                           // Should not have spaces
	.is().not().oneOf(['Passw0rd', 'Password123']);

const USER_ALREADY_EXISTS_ERROR = "user already exists";
const INVALID_REQUEST_ERROR = "invalid request";
const INTERNAL_SERVER_ERROR = "internal server error";
const INVALID_CREDENTIALS_ERROR = "invalid credentials";
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
    console.log(req.user);
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

const signup = async (req, res) => {

    addAudit(req, '/signup',  { email: req.body.email });
    // checks if email already exists
    try {
        const user = await models.user.findOne({ where : { email: req.body.email }});
        if (user) {
            addAudit(req, '/signup',  { error: "email already exists" });
            return res.status(409).json({message: USER_ALREADY_EXISTS_ERROR});
        } else if (req.body.email && req.body.password) {
            const errors = passwordValidator.validate(req.body.password, { details: true });
            if (errors.length > 0) {
                addAudit(req, '/signup',  { error: errors });
                return res.status(400).json(errors);
            }

            bcrypt.hash(req.body.password, 12, (err, passwordHash) => {
                if (err) {
                    addAudit(req, '/signup',  { error: "couldnt hash the password" });
                    return res.status(400).json({message: INVALID_REQUEST_ERROR}); 
                } else if (passwordHash) {
                    return models.user.create(({
                        email: req.body.email,
                        first_name: req.body.firstname,
                        last_name: req.body.lastname,
                        password: passwordHash,
                    }))
                    .then(() => {
                        addAudit(req, '/signup',  { error: "user created" });
                        res.status(200).json({message: "user created"});
                    })
                    .catch(err => {
                        console.log(err);
                        addAudit(req, '/signup',  { error: err });
                        res.status(502).json({message: INTERNAL_SERVER_ERROR});
                    });
                };
            });
        } else if (!req.body.password) {
            addAudit(req, '/signup',  { error: "password not provided" });
            return res.status(400).json({message: INVALID_REQUEST_ERROR});
        } else if (!req.body.email) {
            addAudit(req, '/signup',  { error: "email not provided" });
            return res.status(400).json({message: INVALID_REQUEST_ERROR});
        };
    } catch(e) {
        console.log('error', e);
        addAudit(req, '/signup',  { error: e.message });
        return res.status(500).json({message: INTERNAL_SERVER_ERROR});
        
    }
};

const login = async (req, res) => {

    addAudit(req, '/login',  {  email: req.body.email });

    if (!req.body.email) {
        addAudit(req, '/login',  { error: "missing email in the request body" });
        return res.status(401).json({message: INVALID_CREDENTIALS_ERROR});
    }
    if (!req.body.password) {
        addAudit(req, '/login',  { error: "missing password in the request body" });
        return res.status(401).json({message: INVALID_CREDENTIALS_ERROR});
    }

    try {
        let dbUser = null;
        const result = await redis.get("user-" + req.body.email);
        console.log(result);

        if (result) {
            dbUser = JSON.parse(result);
        } else {
            dbUser = await models.user.findOne({ where : { email: req.body.email,}});
            if (dbUser) {
                redis.set('user-' + req.body.email,JSON.stringify(dbUser)) 
            }
        }
        console.log(dbUser);
        if (!dbUser) {
            addAudit(req, '/login',  { error: "user not found" });
            return res.status(404).json({message: INVALID_CREDENTIALS_ERROR});
        } else {
            bcrypt.compare(req.body.password, dbUser.password, (err, compareRes) => {
                if (err) {
                    addAudit(req, '/login',  { error: "error while checking user password" });
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
        addAudit(req, '/login',  { error: err.message });
        console.log('error', err);
    }
   

    // redis.get("user-" + req.body.email).then((result) => {
    //     let dbUser=null;
    //     if (result) {
    //         console.log("error", error);
    //         redis.set("user-" + req.body.email, req.body.email);
    //     } else {
    //         console.log("result", result);
    //     }
    //     const token = buildJwtToken(req.body.email);
    //     return res.status(200).json({message: "user logged in", "token": token});
    // });


    // // checks if email already exists
    // models.user.findOne({ where : {
    //     email: req.body.email,
    // }})
    // .then(dbUser => {
    //     if (!dbUser) {
    //         addAudit(req, '/login',  { error: "user not found" });
    //         return res.status(404).json({message: INVALID_CREDENTIALS_ERROR});
    //     } else {
    //         bcrypt.compare(req.body.password, dbUser.password, (err, compareRes) => {
    //             if (err) {
    //                 addAudit(req, '/login',  { error: "error while checking user password" });
    //                 return res.status(502).json({message: INVALID_CREDENTIALS_ERROR});
    //             } else if (compareRes) { // password match
    //                 const token = buildJwtToken(req.body.email);
    //                 return res.status(200).json({message: "user logged in", "token": token});
    //             } else {
    //                 return res.status(401).json({message: INVALID_CREDENTIALS_ERROR});
    //             };
    //         });
    //     };
    // })
    // .catch(err => {
    //     addAudit(req, '/login',  { error: err.message });
    //     console.log('error', err);
    // });
};
export { signup, login,isAuthorized, addUserToRequest };