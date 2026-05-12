import sequelize, { models } from '../utils/database.js';
import { IncomingForm } from 'formidable';
import { sendError, sendSuccess } from '../lib/response-helper.js';
import { INVALID_REQUEST_ERROR } from '../constants/global.js';
import { canViewPostRecord, mapOwnerSummary } from '../lib/social-helper.js';

const MAX_IMAGES_PER_POST = 5;

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
    const form = new IncomingForm();
    form.keepExtensions = true;
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

const parseFieldsToPostValues = (fields, existingPost = null) => {
    const place = toNullableString(fields.place) || existingPost?.place || 'Unknown';
    const cuisine = toNullableString(fields.cuisine) || existingPost?.cuisine || 'Unknown';
    const rating = toNullableString(fields.rating);
    const comments = typeof fields.comments === 'string' ? fields.comments.trim() : existingPost?.comments || '';

    return {
        place,
        place_id: toNullableString(fields.place_id),
        place_secondary_text: toNullableString(fields.place_secondary_text),
        place_latitude: toNullableString(fields.place_latitude),
        place_longitude: toNullableString(fields.place_longitude),
        cuisine,
        rating,
        comments,
        is_private: parsePrivateFlag(fields.is_private, existingPost?.is_private ?? false)
    };
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

const createPostImages = async (postId, base64Images, startingOrder = 0) => {
    const rows = base64Images.map((base64, idx) => ({
        post_id: postId,
        image_data: Buffer.from(base64, 'base64'),
        image_type: 'image/png',
        image_name: 'meal.png',
        sort_order: startingOrder + idx
    }));
    if (rows.length === 0) {
        return;
    }
    await models.post_image.bulkCreate(rows);
};

const addPost = async (request, response) => {
    try {
        const fields = await parsePostRequest(request);
        const values = parseFieldsToPostValues(fields);
        const images = collectImageBase64s(fields);

        const post = await models.post.create({
            ...values,
            post_date: new Date(),
            user_id: request.user.id
        });

        if (images.length > 0) {
            await createPostImages(post.id, images, 0);
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

    await post.update(updates);

    const keptImageIds = parseKeptImageIds(fields);
    const newImages = collectImageBase64s(fields);

    if (keptImageIds !== null || newImages.length > 0) {
        const totalCount = (keptImageIds?.length || 0) + newImages.length;
        if (totalCount > MAX_IMAGES_PER_POST) {
            return sendError(response, 400, `Posts can have at most ${MAX_IMAGES_PER_POST} photos.`, 'too_many_images');
        }
        await reconcilePostImages(post.id, keptImageIds || [], newImages);
    }

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

        await models.post_image.destroy({ where: { post_id: post.id } });
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
                'rating',
                'place',
                'place_id',
                'place_secondary_text',
                'place_latitude',
                'place_longitude',
                'comments',
                'is_private',
                [sequelize.literal('(image_data IS NOT NULL AND octet_length(image_data) > 0)'), 'has_legacy_image']
            ],
            where: { id: request.params.id },
            include: [{ model: models.user, attributes: ['id', 'email', 'first_name', 'last_name'] }]
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

        return sendSuccess(response, 200, {
            id: postRecord.id,
            post_date: postRecord.post_date,
            cuisine: postRecord.cuisine,
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
            is_private: postRecord.is_private,
            is_mine: postRecord.user_id === request.user.id,
            owner: mapOwnerSummary(postRecord.user)
        });
    } catch (error) {
        console.error('post fetch failed', error);
        return sendError(response, 500, 'Error loading post', 'post_fetch_failed');
    }
};

export { addPost, image, imageAtIndex, post, updatePost, deletePost, postMethodOverride, MAX_IMAGES_PER_POST };
