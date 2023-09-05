import express from 'express';

import { signup,login,isAuthorized, addUserToRequest } from '../controllers/auth.js';
import Profile from '../controllers/profile.js';
import Journal from '../controllers/journal.js';
const router = express.Router();

//non authorized
router.post('/login', express.json(), login);
router.post('/signup',express.json(), signup);
router.get('/journal/search', express.json(), addUserToRequest, Journal.search);

//authorizeds
router.get('/profile/info', isAuthorized, Profile.info);

// will match any other path
router.use('/', (req, res, next) => {
    res.status(404).json({error : "page not found"});
});

export default router;