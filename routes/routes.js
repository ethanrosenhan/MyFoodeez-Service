import express from 'express';

import { login,token,isAuthorized, addUserToRequest } from '../controllers/auth.js';
import { signupStart,signupFinish } from '../controllers/signup.js';
import { passwordResetStart,passwordResetVerify, passwordResetChange, isPasswordChangeAuthorized } from '../controllers/password-reset.js';
import { info } from '../controllers/profile.js';
import {addPost,search, image, post } from '../controllers/journal.js';
const router = express.Router();

//non authorized
router.post('/login', express.json(), login);
router.post('/token', express.json(), token);
router.post('/signup-finish',express.json(), signupFinish);
router.post('/signup-start',express.json(), signupStart);
router.post('/password-reset-start',express.json(), passwordResetStart);
router.post('/password-reset-verify',express.json(), passwordResetVerify);

//TODO: Make images authorized to keep private
router.get('/journal/image/:id', express.json(), image);

//Partially authorized
router.post('/password-reset-change', express.json(), isPasswordChangeAuthorized, passwordResetChange);

//authorized
router.get('/journal/search', express.json(), isAuthorized, search);
router.post('/journal/add-post', express.json(), isAuthorized, addPost);
router.get('/journal/post/:id', express.json(), post);
router.get('/profile/info', express.json(), isAuthorized, info);

// will match any other path
router.use('/', (req, res, next) => {
    res.status(404).json({error : "page not found"});
});

export default router;