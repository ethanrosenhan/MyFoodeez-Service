import express from 'express';

import { login, token, isAuthorized, googleLogin, appleLogin } from '../controllers/auth.js';
import { signupStart, signupFinish } from '../controllers/signup.js';
import { passwordResetStart, passwordResetVerify, passwordResetChange, isPasswordChangeAuthorized } from '../controllers/password-reset.js';
import { info, uploadProfileImage, deleteProfileImage, getProfileImage, deleteUserAndPosts } from '../controllers/profile.js';
import { addPost, image, imageAtIndex, post, updatePost, deletePost, postMethodOverride, updateCollaboration, leaveCollaboration, videoUploadSignature } from '../controllers/post.js';
import { search, places, feed } from '../controllers/posts.js';
import { list as listCuisines } from '../controllers/cuisines.js';
import { addStar, removeStar } from '../controllers/stars.js';
import { addToWishlist, removeFromWishlist, listWishlist, listWishlistPlaces } from '../controllers/wishlist.js';
import { registerDeviceToken, unregisterDeviceToken } from '../controllers/device-tokens.js';
import { listMenu, addMenuItem, updateMenuItem, flagMenuItem, verifyMenuItem, removeMenuItem, parseMenu } from '../controllers/menu.js';
import { renderRestaurantPage } from '../controllers/restaurant.js';
import { health, version } from '../controllers/health.js';
import { supportPage, supportSubmit } from '../controllers/support.js';
import { privacyPage } from '../controllers/privacy.js';
import { proxyGooglePlaces } from '../controllers/maps.js';
import { sharePostImage, sharePostPage } from '../controllers/share.js';
import {
    acceptFriendRequest,
    declineFriendRequest,
    listFriendRequests,
    listFriends,
    removeFriend,
    requestFriend,
    searchUsers
} from '../controllers/social.js';
import { sendError } from '../lib/response-helper.js';

const router = express.Router();

router.get('/health', health);
router.get('/version', version);
router.post('/login', login);
router.post('/auth/google', googleLogin);
router.post('/auth/apple', appleLogin);
router.post('/token', token);
router.post('/signup-finish', signupFinish);
router.post('/signup-start', signupStart);
router.post('/password-reset-start', passwordResetStart);
router.post('/password-reset-verify', passwordResetVerify);
router.post('/password-reset-change', isPasswordChangeAuthorized, passwordResetChange);
router.get('/support', supportPage);
router.post('/support/submit', express.urlencoded({ extended: true }), supportSubmit);
router.get('/privacy', privacyPage);
router.get('/share/post/:id', sharePostPage);
router.get('/share/post/:id/image', sharePostImage);
// Public, unauthenticated restaurant page — SEO surface. Path is /r/<placeId>
// to keep the URL short and shareable.
router.get('/r/:placeId', renderRestaurantPage);

router.get('/maps/api/place/autocomplete/json', isAuthorized, proxyGooglePlaces);
router.get('/maps/api/place/details/json', isAuthorized, proxyGooglePlaces);

router.get('/users/search', isAuthorized, searchUsers);
router.get('/friends', isAuthorized, listFriends);
router.get('/friends/requests', isAuthorized, listFriendRequests);
router.post('/friends/requests', isAuthorized, requestFriend);
router.post('/friends/requests/:id/accept', isAuthorized, acceptFriendRequest);
router.post('/friends/requests/:id/decline', isAuthorized, declineFriendRequest);
router.delete('/friends/:userId', isAuthorized, removeFriend);

// Signed Cloudinary upload request for direct-from-client video uploads.
router.get('/post/media/video-signature', isAuthorized, videoUploadSignature);
router.get('/post/image/:id', isAuthorized, image);
router.get('/post/:id/image/:index', isAuthorized, imageAtIndex);
router.get('/posts/search', isAuthorized, search);
router.get('/posts/places', isAuthorized, places);
router.get('/feed', isAuthorized, feed);
router.get('/cuisines', listCuisines);
router.post('/post/:id/star', isAuthorized, addStar);
router.delete('/post/:id/star', isAuthorized, removeStar);
router.get('/wishlist', isAuthorized, listWishlist);
router.get('/wishlist/places', isAuthorized, listWishlistPlaces);
router.post('/wishlist', isAuthorized, addToWishlist);
router.delete('/wishlist/:placeId', isAuthorized, removeFromWishlist);
router.post('/device-tokens', isAuthorized, registerDeviceToken);
router.delete('/device-tokens/:token', isAuthorized, unregisterDeviceToken);
// Crowdsourced restaurant menus, keyed off Google Places place_id.
// Item routes use the opaque public_id, not the serial id.
router.get('/menu/:placeId', isAuthorized, listMenu);
router.post('/menu/:placeId/item', isAuthorized, addMenuItem);
// Phase 2 — Claude Vision: photograph/PDF a physical menu, seed it in bulk.
router.post('/menu/:placeId/parse', isAuthorized, parseMenu);
router.put('/menu/item/:id', isAuthorized, updateMenuItem);
router.delete('/menu/item/:id', isAuthorized, removeMenuItem);
router.post('/menu/item/:id/flag', isAuthorized, flagMenuItem);
router.post('/menu/item/:id/verify', isAuthorized, verifyMenuItem);
router.post('/post', isAuthorized, addPost);
router.get('/post/:id', isAuthorized, post);
router.put('/post/:id', isAuthorized, updatePost);
router.delete('/post/:id', isAuthorized, deletePost);
router.post('/post/:id', isAuthorized, postMethodOverride);
// Collab posts — a tagged collaborator manages their own take.
router.put('/post/:id/collab', isAuthorized, updateCollaboration);
router.delete('/post/:id/collab', isAuthorized, leaveCollaboration);
router.get('/profile/info', isAuthorized, info);
router.post('/profile/image', isAuthorized, uploadProfileImage);
router.delete('/profile/image', isAuthorized, deleteProfileImage);
router.get('/profile/image/:userId', isAuthorized, getProfileImage);
router.delete('/profile/delete', isAuthorized, deleteUserAndPosts);

router.use('/', (req, res) => {
    return sendError(res, 404, 'Page not found', 'not_found');
});

export default router;
