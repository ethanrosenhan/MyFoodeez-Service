import express from 'express';

import { login, token, isAuthorized } from '../controllers/auth.js';
import { signupStart, signupFinish } from '../controllers/signup.js';
import { passwordResetStart, passwordResetVerify, passwordResetChange, isPasswordChangeAuthorized } from '../controllers/password-reset.js';
import { info, deleteUserAndPosts } from '../controllers/profile.js';
import { addPost, image, post, updatePost, deletePost, postMethodOverride } from '../controllers/post.js';
import { search, places } from '../controllers/posts.js';
import { health, version } from '../controllers/health.js';
import { supportPage, supportSubmit } from '../controllers/support.js';
import { privacyPage } from '../controllers/privacy.js';
import { proxyGooglePlaces } from '../controllers/maps.js';
import {
    acceptFriendRequest,
    declineFriendRequest,
    followUser,
    listFriendRequests,
    listFriends,
    removeFriend,
    requestFriend,
    searchUsers,
    unfollowUser
} from '../controllers/social.js';
import { sendError } from '../lib/response-helper.js';

const router = express.Router();

router.get('/health', health);
router.get('/version', version);
router.post('/login', login);
router.post('/token', token);
router.post('/signup-finish', signupFinish);
router.post('/signup-start', signupStart);
router.post('/password-reset-start', passwordResetStart);
router.post('/password-reset-verify', passwordResetVerify);
router.post('/password-reset-change', isPasswordChangeAuthorized, passwordResetChange);
router.get('/support', supportPage);
router.post('/support/submit', express.urlencoded({ extended: true }), supportSubmit);
router.get('/privacy', privacyPage);

router.get('/maps/api/place/autocomplete/json', isAuthorized, proxyGooglePlaces);
router.get('/maps/api/place/details/json', isAuthorized, proxyGooglePlaces);

router.get('/users/search', isAuthorized, searchUsers);
router.get('/friends', isAuthorized, listFriends);
router.get('/friends/requests', isAuthorized, listFriendRequests);
router.post('/friends/requests', isAuthorized, requestFriend);
router.post('/friends/requests/:id/accept', isAuthorized, acceptFriendRequest);
router.post('/friends/requests/:id/decline', isAuthorized, declineFriendRequest);
router.delete('/friends/:userId', isAuthorized, removeFriend);
router.post('/follows/:userId', isAuthorized, followUser);
router.delete('/follows/:userId', isAuthorized, unfollowUser);

router.get('/post/image/:id', isAuthorized, image);
router.get('/posts/search', isAuthorized, search);
router.get('/posts/places', isAuthorized, places);
router.post('/post', isAuthorized, addPost);
router.get('/post/:id', isAuthorized, post);
router.put('/post/:id', isAuthorized, updatePost);
router.delete('/post/:id', isAuthorized, deletePost);
router.post('/post/:id', isAuthorized, postMethodOverride);
router.get('/profile/info', isAuthorized, info);
router.delete('/profile/delete', isAuthorized, deleteUserAndPosts);

router.use('/', (req, res) => {
    return sendError(res, 404, 'Page not found', 'not_found');
});

export default router;
