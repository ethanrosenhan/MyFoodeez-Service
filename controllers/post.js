import sequelize, { models } from '../utils/database.js';
import * as formidable from 'formidable';
import { sendError, sendSuccess } from '../lib/response-helper.js';
import { INVALID_REQUEST_ERROR } from '../constants/global.js';

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
    const form = formidable.default ? new formidable.default.IncomingForm() : new formidable.IncomingForm();
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
        comments
    };
};

const attachImageIfProvided = (fields, values) => {
    if (fields.file && fields.file !== 'null') {
        values.image_data = Buffer.from(fields.file, 'base64');
        values.image_type = 'image/png';
        values.image_name = 'meal.png';
    }
};

const addPost = async (request, response) => {
    try {
        const fields = await parsePostRequest(request);
        const values = parseFieldsToPostValues(fields);
        attachImageIfProvided(fields, values);

        const post = await models.post.create({
            ...values,
            post_date: new Date(),
            is_private: true,
            user_id: request.user.id
        });

        return sendSuccess(response, 201, { id: post.id });
    } catch (error) {
        console.error('addPost failed', error);
        return sendError(response, 500, 'Error adding post', 'post_create_failed');
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

const updatePostWithFields = async (request, response, fields) => {
    const post = await findOwnedPost(request);
    if (!post) {
        return sendError(response, 404, 'Post not found', 'post_not_found');
    }

    const updates = parseFieldsToPostValues(fields, post);
    attachImageIfProvided(fields, updates);

    await post.update(updates);
    return sendSuccess(response, 200, { id: post.id, updated: true });
};

const updatePost = async (request, response) => {
    try {
        const fields = await parsePostRequest(request);
        return await updatePostWithFields(request, response, fields);
    } catch (error) {
        console.error('updatePost failed', error);
        return sendError(response, 500, 'Error updating post', 'post_update_failed');
    }
};

const deletePost = async (request, response) => {
    try {
        const post = await findOwnedPost(request);
        if (!post) {
            return sendError(response, 404, 'Post not found', 'post_not_found');
        }

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

const image = async (request, response) => {
    try {
        const post = await models.post.findOne({
            attributes: ['id', 'image_data'],
            where: {
                id: request.params.id,
                user_id: request.user.id
            }
        });

        if (!post) {
            return sendError(response, 404, 'Post not found', 'post_not_found');
        }

        if (!post.image_data || post.image_data.length === 0) {
            return response.status(204).send();
        }

        response.writeHead(200, {
            'Content-Type': 'image/png',
            'Content-Length': post.image_data.length
        });

        return response.end(Buffer.from(post.image_data));
    } catch (error) {
        console.error('image fetch failed', error);
        return sendError(response, 500, 'Error loading image', 'post_image_failed');
    }
};

const post = async (request, response) => {
    try {
        const postRecord = await models.post.findOne({
            attributes: [
                'id',
                'post_date',
                'cuisine',
                'rating',
                'place',
                'place_id',
                'place_secondary_text',
                'place_latitude',
                'place_longitude',
                'comments'
            ],
            where: {
                id: request.params.id,
                user_id: request.user.id
            }
        });

        if (!postRecord) {
            return sendError(response, 404, 'Post not found', 'post_not_found');
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
            image_url: `/post/image/${postRecord.id}`
        });
    } catch (error) {
        console.error('post fetch failed', error);
        return sendError(response, 500, 'Error loading post', 'post_fetch_failed');
    }
};

export { addPost, image, post, updatePost, deletePost, postMethodOverride };
