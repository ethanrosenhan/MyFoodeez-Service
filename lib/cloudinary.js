import crypto from 'crypto';
import fetch from 'node-fetch';
import { getOptionalEnv } from '../utils/env.js';

// Thin Cloudinary integration with no SDK dependency. Two responsibilities:
//   1. Mint a SIGNED upload request the app sends DIRECTLY to Cloudinary, so
//      the (large) video bytes never transit our API server.
//   2. Delete an asset when its post is removed.
//
// Signing rule (Cloudinary): sort the params you're signing alphabetically,
// join as `k=v` with `&`, append the API secret, and SHA-1 the result.

const UPLOAD_FOLDER = 'foodeez/videos';

const getConfig = () => ({
    cloudName: getOptionalEnv('CLOUDINARY_CLOUD_NAME'),
    apiKey: getOptionalEnv('CLOUDINARY_API_KEY'),
    apiSecret: getOptionalEnv('CLOUDINARY_API_SECRET')
});

const isConfigured = () => {
    const { cloudName, apiKey, apiSecret } = getConfig();
    return Boolean(cloudName && apiKey && apiSecret);
};

const signParams = (params, apiSecret) => {
    const toSign = Object.keys(params)
        .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
        .sort()
        .map((key) => `${key}=${params[key]}`)
        .join('&');
    return crypto.createHash('sha1').update(`${toSign}${apiSecret}`).digest('hex');
};

// Returns everything the client needs to perform a signed direct upload to
// Cloudinary's video endpoint. The client POSTs the file plus these fields as
// multipart/form-data to https://api.cloudinary.com/v1_1/<cloud>/video/upload.
const buildVideoUploadSignature = () => {
    const { cloudName, apiKey, apiSecret } = getConfig();
    if (!cloudName || !apiKey || !apiSecret) {
        return null;
    }
    const timestamp = Math.floor(Date.now() / 1000);
    const signedParams = { folder: UPLOAD_FOLDER, timestamp };
    const signature = signParams(signedParams, apiSecret);

    return {
        cloud_name: cloudName,
        api_key: apiKey,
        timestamp,
        folder: UPLOAD_FOLDER,
        signature,
        upload_url: `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`
    };
};

// Build a Cloudinary thumbnail (JPEG) URL for a given video public_id at a
// specific second offset. Used as a server-side fallback if the client didn't
// send its own chosen cover frame.
const buildThumbnailUrl = (publicId, atSecond = 0) => {
    const { cloudName } = getConfig();
    if (!cloudName || !publicId) {
        return null;
    }
    const offset = Number.isFinite(Number(atSecond)) ? Math.max(0, Number(atSecond)) : 0;
    return `https://res.cloudinary.com/${cloudName}/video/upload/so_${offset},w_640,h_640,c_fill,q_auto/${publicId}.jpg`;
};

const deleteVideo = async (publicId) => {
    const { cloudName, apiKey, apiSecret } = getConfig();
    if (!cloudName || !apiKey || !apiSecret || !publicId) {
        return false;
    }
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = signParams({ public_id: publicId, timestamp }, apiSecret);
    const body = new URLSearchParams({
        public_id: publicId,
        timestamp: String(timestamp),
        api_key: apiKey,
        signature
    });
    try {
        const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/video/destroy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body
        });
        return response.ok;
    } catch (error) {
        console.warn('cloudinary delete failed', error?.message || error);
        return false;
    }
};

export { isConfigured, buildVideoUploadSignature, buildThumbnailUrl, deleteVideo };
