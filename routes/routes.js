import express from 'express';

import { login,isAuthorized, addUserToRequest } from '../controllers/auth.js';
import { signupStart,signupFinish } from '../controllers/signup.js';

import { info } from '../controllers/profile.js';
import {search } from '../controllers/journal.js';
const router = express.Router();

//non authorized
router.post('/login', express.json(), login);
router.post('/signup-start',express.json(), signupStart);
router.post('/signup-finish',express.json(), signupFinish);
router.get('/journal/search', express.json(), isAuthorized, search);

//authorizeds
router.get('/profile/info', isAuthorized, info);

// will match any other path
router.use('/', (req, res, next) => {
    res.status(404).json({error : "page not found"});
});

export default router;