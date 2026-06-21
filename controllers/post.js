import sequelize, { models } from '../utils/database.js';
import { IncomingForm } from 'formidable';
import { sendError, sendSuccess } from '../lib/response-helper.js';
import { INVALID_REQUEST_ERROR } from '../constants/global.js';
import { findById as findCuisineById } from '../constants/cuisines.js';
import { canViewPostRecord, getAcceptedFriendIds, mapOwnerSummary, mapUserSummary } from '../lib/social-helper.js';
import { isRequestAdmin } from './admin.js';
import { loadStarSummary } from './stars.js';
import { notifyFriendsOfPostAtPlace, notifyCollaboratorsTagged } from '../lib/notifications.js';
import {
    isConfigured as isCloudinaryConfigured,
    buildVideoUploadSignature,
    buildThumbnailUrl,
    deleteVideo
} from '../lib/cloudinary.js';

const MAX_IMAGES_PER_POST = 5;
// "A handful" of people can share one collab post.
const MAX_COLLABORATORS = 8;

const normalizeFields = (fields) => {
    const normalized = {};
    if (!fields) {
        return normalized;
    }
    Object.entries(fields).forEach(([key, value]) => {
        normalized[key] = Array.isArray(value) ? value[0] : value;
    });
    return normalized;
};

const parsePostRequest = async (request) => {
    const contentType = request.headers['content-type'] || '';
    if (contentType.includes('application/json')) {
        return normalizeFields(request.body);
    }
    // Base64 images are sent as multipart *fields* (FormData string parts), so
    // the relevant cap is maxFieldsSize. formidable defaults it to 20MB across
    // all fields combined — raise it so a 5-photo post can't silently trip a
    // "maxFieldsSize exceeded" error. (Photos are JPEG-compressed client-side,
    // so a 5-photo post is now only a couple of MB; this is headroom.)
    const form = new IncomingForm({ keepExtensions: true, maxFieldsSize: 50 * 1024 * 1024 });
    const [fields] = await form.parse(request);
    return normalizeFields(fields);
};

const toNullableString = (value) => {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};

const parsePrivateFlag = (value, fallback = true) => {
    if (typeof value !== 'string') {
        return fallback;
    }
    const normalized = value.trim().toLowerCase();
    if (['false', '0', 'no'].includes(normalized)) {
        return false;
    }
    if (['true', '1', 'yes'].includes(normalized)) {
        return true;
    }
    return fallback;
};

// Resolve the (cuisine_id, cuisine) pair from the client payload.
//
// Two valid client shapes:
//  (1) Structured pick: cuisine_id = taxonomy id (e.g. 'pizza-ny'). We
//      authoritatively set `cuisine` to the taxonomy label so display can't
//      drift from id.
//  (2) "Other" free text: cuisine_id is missing/null, cuisine is free text.
//
// On update, if the client sends neither (e.g. an old client that doesn't
// know about cuisine_id yet), preserve whatever the existing post had.
const resolveCuisine = (fields, existingPost) => {
    const rawId = toNullableString(fields.cuisine_id);
    const entry = rawId ? findCuisineById(rawId) : null;

    if (entry && entry.id !== 'other') {
        // Structured pick — server owns the label.
        return { cuisine_id: entry.id, cuisine: entry.label };
    }

    // Free-text / Other path. Trust the client's cuisine string; fall back
    // to existing values; finally fall back to the legacy 'Unknown' default
    // so the NOT NULL constraint on `cuisine` is satisfied.
    const cuisine = toNullableString(fields.cuisine)
        || existingPost?.cuisine
        || 'Unknown';
    // If client explicitly sent cuisine_id='other' or omitted it on update,
    // preserve existing cuisine_id (don't blow away a previously-categorized
    // post just because the new payload lacks the field).
    const cuisine_id = rawId === null
        ? (existingPost?.cuisine_id ?? null)
        : null;
    return { cuisine_id, cuisine };
};

const parseFieldsToPostValues = (fields, existingPost = null) => {
    const place = toNullableString(fields.place) || existingPost?.place || 'Unknown';
    const { cuisine, cuisine_id } = resolveCuisine(fields, existingPost);
    const rating = toNullableString(fields.rating);
    const comments = typeof fields.comments === 'string' ? fields.comments.trim() : existingPost?.comments || '';

    return {
        place,
        place_id: toNullableString(fields.place_id),
        place_secondary_text: toNullableString(fields.place_secondary_text),
        place_latitude: toNullableString(fields.place_latitude),
        place_longitude: toNullableString(fields.place_longitude),
        cuisine,
        cuisine_id,
        rating,
        comments,
        is_private: parsePrivateFlag(fields.is_private, existingPost?.is_private ?? false)
    };
};

// The client references menu items by their opaque public_id (never the serial
// FK). Resolve them to internal menu_item.id values so the join table stays
// real integers and public_id remains opaque to clients. Returns an ORDERED,
// de-duplicated array of internal ids.
//   - menu_item_ids present (new multi-select clients) -> JSON array of public_ids
//   - menu_item_id present  (legacy single-select clients) -> one public_id
//   - neither present       -> on create: []; on update: undefined (unchanged)
//   - empty/unknown ids      -> dropped
const resolveMenuItemIds = async (fields, existingPost = null) => {
    let publicIds = null;

    if (Object.prototype.hasOwnProperty.call(fields, 'menu_item_ids')) {
        publicIds = [];
        try {
            const parsed = JSON.parse(fields.menu_item_ids);
            if (Array.isArray(parsed)) {
                publicIds = parsed.filter((value) => typeof value === 'string' && value.trim().length > 0);
            }
        } catch (error) {
            publicIds = [];
        }
    } else if (Object.prototype.hasOwnProperty.call(fields, 'menu_item_id')) {
        // Legacy single-item field.
        const publicId = toNullableString(fields.menu_item_id);
        publicIds = publicId ? [publicId] : [];
    }

    if (publicIds === null) {
        // Field absent entirely: leave unchanged on update, none on create.
        return existingPost ? undefined : [];
    }
    if (publicIds.length === 0) {
        return [];
    }

    const rows = await models.menu_item.findAll({
        attributes: ['id', 'public_id'],
        where: { public_id: publicIds }
    });
    const internalByPublic = new Map(rows.map((row) => [row.public_id, row.id]));

    // Preserve the client's order, drop unknowns, de-dupe.
    const seen = new Set();
    const ids = [];
    for (const publicId of publicIds) {
        const internalId = internalByPublic.get(publicId);
        if (internalId && !seen.has(internalId)) {
            seen.add(internalId);
            ids.push(internalId);
        }
    }
    return ids;
};

// Replace a post's linked menu items with the given ordered internal ids.
const syncPostMenuItems = async (postId, internalIds) => {
    await models.post_menu_item.destroy({ where: { post_id: postId } });
    if (!internalIds || internalIds.length === 0) {
        return;
    }
    const rows = internalIds.map((menu_item_id, idx) => ({
        post_id: postId,
        menu_item_id,
        sort_order: idx
    }));
    await models.post_menu_item.bulkCreate(rows);
};

// Resolve the tagged collaborator user ids from the client payload. Only the
// author's ACCEPTED FRIENDS can be tagged (you can't tag a stranger), the
// author themselves is excluded, and the set is capped + de-duped.
//   - field absent -> on create: []; on update: undefined (leave unchanged)
const resolveCollaboratorUserIds = async (fields, authorId, existingPost = null) => {
    if (!Object.prototype.hasOwnProperty.call(fields, 'collaborator_user_ids')) {
        return existingPost ? undefined : [];
    }
    let ids = [];
    try {
        const parsed = JSON.parse(fields.collaborator_user_ids);
        if (Array.isArray(parsed)) {
            ids = parsed
                .map((value) => Number(value))
                .filter((value) => Number.isInteger(value) && value > 0 && value !== authorId);
        }
    } catch (error) {
        ids = [];
    }
    if (ids.length === 0) {
        return [];
    }
    const friendIds = new Set(await getAcceptedFriendIds(authorId));
    const seen = new Set();
    const result = [];
    for (const id of ids) {
        if (friendIds.has(id) && !seen.has(id)) {
            seen.add(id);
            result.push(id);
        }
    }
    return result.slice(0, MAX_COLLABORATORS);
};

// Reconcile a post's collaborator set. Returns the newly-added user ids (for
// notifications). Author untags become 'removed'; self-removed rows are left
// untouched so re-tagging doesn't override someone who opted out.
const syncPostCollaborators = async (postId, userIds) => {
    const existing = await models.post_collaborator.findAll({ where: { post_id: postId } });
    const existingByUser = new Map(existing.map((row) => [row.user_id, row]));
    const desired = new Set(userIds);

    for (const row of existing) {
        if (row.status === 'active' && !desired.has(row.user_id)) {
            await row.update({ status: 'removed' });
        }
    }

    const newUserIds = userIds.filter((id) => !existingByUser.has(id));
    if (newUserIds.length > 0) {
        await models.post_collaborator.bulkCreate(
            newUserIds.map((user_id) => ({ post_id: postId, user_id, status: 'active' }))
        );
    }
    return newUserIds;
};

const collectImageBase64s = (fields) => {
    const images = [];
    if (fields.file && fields.file !== 'null') {
        images.push(fields.file);
    }
    for (let i = 0; i < MAX_IMAGES_PER_POST; i += 1) {
        const value = fields[`file_${i}`];
        if (value && value !== 'null') {
            images.push(value);
        }
    }
    return images.slice(0, MAX_IMAGES_PER_POST);
};

const parseKeptImageIds = (fields) => {
    const raw = fields.kept_image_ids;
    if (typeof raw !== 'string' || raw.length === 0) {
        return null;
    }
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return null;
        }
        return parsed.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
    } catch (error) {
        return null;
    }
};

// Sniff the real format from the decoded bytes so the stored Content-Type
// matches what the client sent. The app now uploads JPEG; older posts/clients
// may still send PNG, and we don't want to mislabel either.
const detectImageMime = (buffer) => {
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return 'image/jpeg';
    }
    if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
        return 'image/png';
    }
    return 'image/jpeg';
};

const createPostImages = async (postId, base64Images, startingOrder = 0) => {
    const rows = base64Images.map((base64, idx) => {
        const buffer = Buffer.from(base64, 'base64');
        const mime = detectImageMime(buffer);
        return {
            post_id: postId,
            image_data: buffer,
            image_type: mime,
            image_name: mime === 'image/png' ? 'meal.png' : 'meal.jpg',
            sort_order: startingOrder + idx
        };
    });
    if (rows.length === 0) {
        return;
    }
    await models.post_image.bulkCreate(rows);
};

// GET /post/media/video-signature — hand the client a signed Cloudinary upload
// request so it can upload the video DIRECTLY (keeping big payloads off our
// API). Returns 503 when Cloudinary isn't configured.
const videoUploadSignature = async (request, response) => {
    if (!isCloudinaryConfigured()) {
        return sendError(response, 503, 'Video uploads are not configured', 'video_not_configured');
    }
    const signature = buildVideoUploadSignature();
    if (!signature) {
        return sendError(response, 503, 'Video uploads are not configured', 'video_not_configured');
    }
    return sendSuccess(response, 200, signature);
};

// Read the video descriptor the client sends after a direct Cloudinary upload.
// Expected fields (any shape absent => no change):
//   video_url            Cloudinary secure_url (required to attach a video)
//   video_public_id      Cloudinary public_id (for later deletion / thumbnails)
//   video_thumbnail_url  cover frame the user chose; falls back to a generated
//                        thumbnail from the public_id when omitted
//   video_thumbnail_offset  seconds, used only for the fallback thumbnail
//   video_duration       seconds (optional)
//   remove_video         'true' to detach/delete the existing video (on update)
const parseVideoDescriptor = (fields) => {
    if (typeof fields.remove_video === 'string' && ['true', '1', 'yes'].includes(fields.remove_video.toLowerCase())) {
        return { remove: true };
    }
    const url = toNullableString(fields.video_url);
    if (!url) {
        return null;
    }
    const publicId = toNullableString(fields.video_public_id);
    const thumbnailUrl = toNullableString(fields.video_thumbnail_url)
        || buildThumbnailUrl(publicId, fields.video_thumbnail_offset)
        || null;
    const duration = Number(fields.video_duration);
    return {
        url,
        provider_public_id: publicId,
        thumbnail_url: thumbnailUrl,
        duration: Number.isFinite(duration) ? duration : null
    };
};

// Attach / replace / remove a post's single video. Best-effort deletes the
// previous Cloudinary asset so we don't leak storage.
const syncPostVideo = async (postId, descriptor) => {
    if (!descriptor) {
        return;
    }
    const existing = await models.post_media.findAll({ where: { post_id: postId, media_type: 'video' } });

    // Replace or remove both start by clearing whatever's there now.
    if (existing.length > 0) {
        for (const row of existing) {
            if (row.provider_public_id) {
                deleteVideo(row.provider_public_id).catch(() => {});
            }
        }
        await models.post_media.destroy({ where: { post_id: postId, media_type: 'video' } });
    }

    if (descriptor.remove) {
        return;
    }

    await models.post_media.create({
        post_id: postId,
        media_type: 'video',
        url: descriptor.url,
        thumbnail_url: descriptor.thumbnail_url,
        provider_public_id: descriptor.provider_public_id,
        duration: descriptor.duration,
        sort_order: 0
    });
};

const loadPostVideo = async (postId) => {
    const row = await models.post_media.findOne({
        where: { post_id: postId, media_type: 'video' },
        order: [['sort_order', 'ASC'], ['id', 'ASC']]
    });
    if (!row) {
        return null;
    }
    return {
        url: row.url,
        thumbnail_url: row.thumbnail_url,
        duration: row.duration
    };
};

const addPost = async (request, response) => {
    try {
        const fields = await parsePostRequest(request);
        const values = parseFieldsToPostValues(fields);
        const menuItemIds = await resolveMenuItemIds(fields);
        const images = collectImageBase64s(fields);

        const post = await models.post.create({
            ...values,
            // Keep the legacy single column in sync with the first ordered item.
            menu_item_id: menuItemIds?.[0] ?? null,
            post_date: new Date(),
            user_id: request.user.id
        });

        if (Array.isArray(menuItemIds) && menuItemIds.length > 0) {
            await syncPostMenuItems(post.id, menuItemIds);
        }

        // Tag collaborators (collab post) and notify them.
        const collaboratorUserIds = await resolveCollaboratorUserIds(fields, request.user.id);
        if (Array.isArray(collaboratorUserIds) && collaboratorUserIds.length > 0) {
            const added = await syncPostCollaborators(post.id, collaboratorUserIds);
            if (added.length > 0) {
                notifyCollaboratorsTagged({
                    authorUserId: request.user.id,
                    collaboratorUserIds: added,
                    place: post.place
                }).catch((error) => {
                    console.warn('collab tag notification failed', error?.message || error);
                });
            }
        }

        if (images.length > 0) {
            await createPostImages(post.id, images, 0);
        }

        // Optional video attached via a prior direct Cloudinary upload.
        await syncPostVideo(post.id, parseVideoDescriptor(fields));

        // Fire-and-forget notification to friends who have also posted at
        // this place. Wrapped so a notification failure can't bubble up and
        // turn a successful post-create into a 500.
        if (post.place_id) {
            notifyFriendsOfPostAtPlace({
                postAuthorUserId: request.user.id,
                placeId: post.place_id,
                place: post.place
            }).catch((error) => {
                console.warn('post-create notification failed', error?.message || error);
            });
        }

        return sendSuccess(response, 201, { id: post.id });
    } catch (error) {
        console.error('addPost failed', error);
        return sendError(response, 500, `Error adding post: ${error.message}`, 'post_create_failed');
    }
};

const findOwnedPost = async (request) => {
    return models.post.findOne({
        where: {
            id: request.params.id,
            user_id: request.user.id
        }
    });
};

const reconcilePostImages = async (postId, keptImageIds, newImages) => {
    const existing = await models.post_image.findAll({
        attributes: ['id', 'sort_order'],
        where: { post_id: postId },
        order: [['sort_order', 'ASC'], ['id', 'ASC']]
    });

    const keptOrder = [];
    keptImageIds.forEach((keptId) => {
        const match = existing.find((row) => row.id === keptId);
        if (match) {
            keptOrder.push(match);
        }
    });

    const keptIdSet = new Set(keptOrder.map((row) => row.id));
    const toDelete = existing.filter((row) => !keptIdSet.has(row.id)).map((row) => row.id);
    if (toDelete.length > 0) {
        await models.post_image.destroy({ where: { id: toDelete } });
    }

    for (let i = 0; i < keptOrder.length; i += 1) {
        if (keptOrder[i].sort_order !== i) {
            await models.post_image.update({ sort_order: i }, { where: { id: keptOrder[i].id } });
        }
    }

    if (newImages.length > 0) {
        await createPostImages(postId, newImages, keptOrder.length);
    }
};

const updatePostWithFields = async (request, response, fields) => {
    const post = await findOwnedPost(request);
    if (!post) {
        return sendError(response, 404, 'Post not found', 'post_not_found');
    }

    const updates = parseFieldsToPostValues(fields, post);
    const menuItemIds = await resolveMenuItemIds(fields, post);
    if (menuItemIds !== undefined) {
        // Keep the legacy single column in sync with the first ordered item.
        updates.menu_item_id = menuItemIds[0] ?? null;
    }

    await post.update(updates);

    if (menuItemIds !== undefined) {
        await syncPostMenuItems(post.id, menuItemIds);
    }

    const collaboratorUserIds = await resolveCollaboratorUserIds(fields, request.user.id, post);
    if (collaboratorUserIds !== undefined) {
        const added = await syncPostCollaborators(post.id, collaboratorUserIds);
        if (added.length > 0) {
            notifyCollaboratorsTagged({
                authorUserId: request.user.id,
                collaboratorUserIds: added,
                place: post.place
            }).catch((error) => {
                console.warn('collab tag notification failed', error?.message || error);
            });
        }
    }

    const keptImageIds = parseKeptImageIds(fields);
    const newImages = collectImageBase64s(fields);

    if (keptImageIds !== null || newImages.length > 0) {
        const totalCount = (keptImageIds?.length || 0) + newImages.length;
        if (totalCount > MAX_IMAGES_PER_POST) {
            return sendError(response, 400, `Posts can have at most ${MAX_IMAGES_PER_POST} photos.`, 'too_many_images');
        }
        await reconcilePostImages(post.id, keptImageIds || [], newImages);
    }

    // Attach / replace / remove the post's video, if the client sent a
    // descriptor (or remove_video).
    await syncPostVideo(post.id, parseVideoDescriptor(fields));

    return sendSuccess(response, 200, { id: post.id, updated: true });
};

const updatePost = async (request, response) => {
    try {
        const fields = await parsePostRequest(request);
        return await updatePostWithFields(request, response, fields);
    } catch (error) {
        console.error('updatePost failed', error);
        return sendError(response, 500, `Error updating post: ${error.message}`, 'post_update_failed');
    }
};

const deletePost = async (request, response) => {
    try {
        const post = await findOwnedPost(request);
        if (!post) {
            return sendError(response, 404, 'Post not found', 'post_not_found');
        }

        // Best-effort remove the Cloudinary asset(s) before dropping the rows.
        const mediaRows = await models.post_media.findAll({ where: { post_id: post.id } });
        for (const row of mediaRows) {
            if (row.provider_public_id) {
                deleteVideo(row.provider_public_id).catch(() => {});
            }
        }

        await models.post_image.destroy({ where: { post_id: post.id } });
        await models.post_media.destroy({ where: { post_id: post.id } });
        await models.post_menu_item.destroy({ where: { post_id: post.id } });
        await models.post_collaborator.destroy({ where: { post_id: post.id } });
        await post.destroy();
        return sendSuccess(response, 200, { deleted: true });
    } catch (error) {
        console.error('deletePost failed', error);
        return sendError(response, 500, 'Error deleting post', 'post_delete_failed');
    }
};

const postMethodOverride = async (request, response) => {
    try {
        const fields = await parsePostRequest(request);
        const method = (fields._method || '').toString().toUpperCase();
        if (method === 'PUT') {
            return await updatePostWithFields(request, response, fields);
        }
        if (method === 'DELETE') {
            return await deletePost(request, response);
        }
        return sendError(response, 400, INVALID_REQUEST_ERROR, 'invalid_request');
    } catch (error) {
        console.error('postMethodOverride failed', error);
        return sendError(response, 500, 'Error processing request', 'post_override_failed');
    }
};

const loadOrderedPostImages = async (postId) => {
    return models.post_image.findAll({
        attributes: ['id', 'sort_order', 'image_type'],
        where: { post_id: postId },
        order: [['sort_order', 'ASC'], ['id', 'ASC']]
    });
};

const respondWithImageBuffer = (response, row) => {
    response.writeHead(200, {
        'Content-Type': row.image_type || 'image/png',
        'Content-Length': row.image_data.length
    });
    return response.end(Buffer.from(row.image_data));
};

const image = async (request, response) => {
    try {
        const post = await models.post.findOne({
            attributes: ['id', 'user_id', 'is_private'],
            where: { id: request.params.id }
        });

        if (!post || !(await canViewPostRecord(request.user.id, post))) {
            return sendError(response, 404, 'Post not found', 'post_not_found');
        }

        const firstImage = await models.post_image.findOne({
            where: { post_id: post.id },
            order: [['sort_order', 'ASC'], ['id', 'ASC']]
        });

        if (firstImage && firstImage.image_data && firstImage.image_data.length > 0) {
            return respondWithImageBuffer(response, firstImage);
        }

        const legacy = await models.post.findOne({
            attributes: ['image_data', 'image_type'],
            where: { id: post.id }
        });

        if (!legacy || !legacy.image_data || legacy.image_data.length === 0) {
            return response.status(204).send();
        }

        response.writeHead(200, {
            'Content-Type': legacy.image_type || 'image/png',
            'Content-Length': legacy.image_data.length
        });
        return response.end(Buffer.from(legacy.image_data));
    } catch (error) {
        console.error('image fetch failed', error);
        return sendError(response, 500, 'Error loading image', 'post_image_failed');
    }
};

const imageAtIndex = async (request, response) => {
    try {
        const post = await models.post.findOne({
            attributes: ['id', 'user_id', 'is_private'],
            where: { id: request.params.id }
        });

        if (!post || !(await canViewPostRecord(request.user.id, post))) {
            return sendError(response, 404, 'Post not found', 'post_not_found');
        }

        const index = parseInt(request.params.index, 10);
        if (!Number.isInteger(index) || index < 0) {
            return sendError(response, 400, INVALID_REQUEST_ERROR, 'invalid_request');
        }

        const images = await loadOrderedPostImages(post.id);
        if (images.length > 0) {
            if (index >= images.length) {
                return sendError(response, 404, 'Image not found', 'image_not_found');
            }
            const row = await models.post_image.findByPk(images[index].id);
            if (!row || !row.image_data || row.image_data.length === 0) {
                return response.status(204).send();
            }
            return respondWithImageBuffer(response, row);
        }

        if (index !== 0) {
            return sendError(response, 404, 'Image not found', 'image_not_found');
        }

        const legacy = await models.post.findOne({
            attributes: ['image_data', 'image_type'],
            where: { id: post.id }
        });

        if (!legacy || !legacy.image_data || legacy.image_data.length === 0) {
            return sendError(response, 404, 'Image not found', 'image_not_found');
        }

        response.writeHead(200, {
            'Content-Type': legacy.image_type || 'image/png',
            'Content-Length': legacy.image_data.length
        });
        return response.end(Buffer.from(legacy.image_data));
    } catch (error) {
        console.error('imageAtIndex fetch failed', error);
        return sendError(response, 500, 'Error loading image', 'post_image_failed');
    }
};

const buildImageUrls = (postId, count) => {
    if (count <= 0) {
        return [];
    }
    return Array.from({ length: count }, (_, idx) => `/post/${postId}/image/${idx}`);
};

const post = async (request, response) => {
    try {
        const postRecord = await models.post.findOne({
            attributes: [
                'id',
                'user_id',
                'post_date',
                'cuisine',
                'cuisine_id',
                'rating',
                'place',
                'place_id',
                'place_secondary_text',
                'place_latitude',
                'place_longitude',
                'comments',
                'is_private',
                'menu_item_id',
                [sequelize.literal('(image_data IS NOT NULL AND octet_length(image_data) > 0)'), 'has_legacy_image']
            ],
            where: { id: request.params.id },
            include: [
                { model: models.user, attributes: ['id', 'email', 'first_name', 'last_name'] },
                { model: models.menu_item, required: false, attributes: ['public_id', 'name', 'price_text', 'cuisine_id', 'section'] }
            ]
        });

        if (!postRecord || !(await canViewPostRecord(request.user.id, postRecord))) {
            return sendError(response, 404, 'Post not found', 'post_not_found');
        }

        const orderedImages = await loadOrderedPostImages(postRecord.id);
        const imageIds = orderedImages.map((row) => row.id);
        let imageUrls = buildImageUrls(postRecord.id, orderedImages.length);
        if (imageUrls.length === 0 && postRecord.get('has_legacy_image')) {
            imageUrls = [`/post/image/${postRecord.id}`];
        }

        const starSummary = await loadStarSummary(postRecord.id, request.user.id);
        const video = await loadPostVideo(postRecord.id);

        // All ordered dishes for this post, via the join table.
        const linkRows = await models.post_menu_item.findAll({
            where: { post_id: postRecord.id },
            attributes: ['sort_order'],
            include: [{ model: models.menu_item, attributes: ['public_id', 'name', 'price_text', 'cuisine_id', 'section'] }],
            order: [['sort_order', 'ASC'], ['id', 'ASC']]
        });
        let menuItems = linkRows
            .filter((row) => row.menu_item)
            .map((row) => ({
                id: row.menu_item.public_id,
                name: row.menu_item.name,
                price_text: row.menu_item.price_text,
                cuisine_id: row.menu_item.cuisine_id,
                section: row.menu_item.section
            }));
        // Fallback for posts not yet backfilled: surface the legacy single link.
        if (menuItems.length === 0 && postRecord.menu_item) {
            menuItems = [{
                id: postRecord.menu_item.public_id,
                name: postRecord.menu_item.name,
                price_text: postRecord.menu_item.price_text,
                cuisine_id: postRecord.menu_item.cuisine_id,
                section: postRecord.menu_item.section
            }];
        }

        // Collaborators (collab post) with their own rating/notes.
        const collabRows = await models.post_collaborator.findAll({
            where: { post_id: postRecord.id, status: 'active' },
            attributes: ['user_id', 'rating', 'comments'],
            include: [{ model: models.user, attributes: ['id', 'email', 'first_name', 'last_name'] }],
            order: [['created_at', 'ASC'], ['id', 'ASC']]
        });
        const collaborators = collabRows
            .filter((row) => row.user)
            .map((row) => ({
                user: mapUserSummary(row.user),
                rating: row.rating,
                comments: row.comments,
                is_me: row.user_id === request.user.id
            }));
        const myCollabRow = collabRows.find((row) => row.user_id === request.user.id) || null;
        const myCollab = myCollabRow
            ? { rating: myCollabRow.rating, comments: myCollabRow.comments }
            : null;

        return sendSuccess(response, 200, {
            id: postRecord.id,
            post_date: postRecord.post_date,
            cuisine: postRecord.cuisine,
            cuisine_id: postRecord.cuisine_id,
            rating: postRecord.rating,
            comments: postRecord.comments,
            place: postRecord.place,
            place_id: postRecord.place_id,
            place_secondary_text: postRecord.place_secondary_text,
            place_latitude: postRecord.place_latitude,
            place_longitude: postRecord.place_longitude,
            image_url: imageUrls[0] || null,
            image_urls: imageUrls,
            image_ids: imageIds,
            // Optional attached video (Cloudinary). null when the post has none.
            video,
            has_video: Boolean(video),
            // New multi-item array; menu_item kept as the first for older app builds.
            menu_items: menuItems,
            menu_item: menuItems[0] || null,
            // Collab post: everyone tagged, plus my own take (if I'm tagged).
            collaborators,
            my_collab: myCollab,
            is_collaborator: Boolean(myCollabRow),
            is_private: postRecord.is_private,
            is_mine: postRecord.user_id === request.user.id,
            owner: mapOwnerSummary(postRecord.user),
            star_count: starSummary.star_count,
            is_starred_by_me: starSummary.is_starred_by_me,
            // Lets the app show moderation controls (delete any post) to admins.
            viewer_is_admin: await isRequestAdmin(request)
        });
    } catch (error) {
        console.error('post fetch failed', error);
        return sendError(response, 500, 'Error loading post', 'post_fetch_failed');
    }
};

// PUT /post/:id/collab — a tagged collaborator sets their OWN rating/notes.
const updateCollaboration = async (request, response) => {
    try {
        const row = await models.post_collaborator.findOne({
            where: { post_id: request.params.id, user_id: request.user.id, status: 'active' }
        });
        if (!row) {
            return sendError(response, 404, 'You are not tagged on this post', 'collab_not_found');
        }
        const body = request.body || {};
        const updates = {};
        if (body.rating !== undefined) {
            updates.rating = toNullableString(body.rating);
        }
        if (body.comments !== undefined) {
            updates.comments = typeof body.comments === 'string' ? body.comments.trim() : null;
        }
        await row.update(updates);
        return sendSuccess(response, 200, { rating: row.rating, comments: row.comments });
    } catch (error) {
        console.error('updateCollaboration failed', error);
        return sendError(response, 500, 'Unable to update your take', 'collab_update_failed');
    }
};

// DELETE /post/:id/collab — a collaborator removes themselves (self un-tag).
const leaveCollaboration = async (request, response) => {
    try {
        const row = await models.post_collaborator.findOne({
            where: { post_id: request.params.id, user_id: request.user.id, status: 'active' }
        });
        if (!row) {
            return sendError(response, 404, 'You are not tagged on this post', 'collab_not_found');
        }
        await row.update({ status: 'removed' });
        return sendSuccess(response, 200, { left: true });
    } catch (error) {
        console.error('leaveCollaboration failed', error);
        return sendError(response, 500, 'Unable to remove yourself', 'collab_leave_failed');
    }
};

export { addPost, image, imageAtIndex, post, updatePost, deletePost, postMethodOverride, updateCollaboration, leaveCollaboration, videoUploadSignature, MAX_IMAGES_PER_POST, resolveMenuItemIds, resolveCollaboratorUserIds };
