import express from 'express';

import { login,token,isAuthorized, addUserToRequest } from '../controllers/auth.js';
import { signupStart,signupFinish } from '../controllers/signup.js';
import { passwordResetStart,passwordResetVerify, passwordResetChange, isPasswordChangeAuthorized } from '../controllers/password-reset.js';
import { info } from '../controllers/profile.js';
import {addPost,image, post } from '../controllers/post.js';
import {search, places } from '../controllers/posts.js';

import proxy from 'express-http-proxy';
const router = express.Router();

//PROXY for MAPS---NEED to MAKE this authorized

//Proxy for google maps API see https://github.com/FaridSafi/react-native-google-places-autocomplete/blob/master/README.md#web-support
// router.get('/maps/api', express.json(), isAuthorized, info);
//https://maps.googleapis.com/maps/api/place/details/json

router.get('/maps/api/place/autocomplete/json', proxy('maps.googleapis.com', {
    https: true,
    parseReqBody: false
}));

router.get('/maps/api/place/details/json', proxy('maps.googleapis.com', {
  https: true,
  parseReqBody: false
}));

//non authorized
router.post('/login', express.json(), login);
router.post('/token', express.json(), token);
router.post('/signup-finish',express.json(), signupFinish);
router.post('/signup-start',express.json(), signupStart);
router.post('/password-reset-start',express.json(), passwordResetStart);
router.post('/password-reset-verify',express.json(), passwordResetVerify);

//TODO: Make images authorized to keep private
router.get('/post/image/:id', express.json(), image);

//Partially authorized
router.post('/password-reset-change', express.json(), isPasswordChangeAuthorized, passwordResetChange);

//authorized
router.get('/posts/search', express.json(), isAuthorized, search );
router.get('/posts/places', express.json(), isAuthorized, places );
router.post('/post', express.json(), isAuthorized, addPost);
router.get('/post/:id', express.json(), post);
router.get('/profile/info', express.json(), isAuthorized, info);


// will match any other path
router.use('/', (req, res, next) => {
    res.status(404).json({error : "page not found"});
});

export default router;