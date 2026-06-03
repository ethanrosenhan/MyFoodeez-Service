import { CUISINES } from '../constants/cuisines.js';
import { sendError, sendSuccess } from '../lib/response-helper.js';

const list = (request, response) => {
    try {
        // Override the global Cache-Control: no-store middleware. The taxonomy
        // changes rarely and is fine to cache at the client for an hour.
        response.setHeader('Cache-Control', 'public, max-age=3600');
        return sendSuccess(response, 200, { data: CUISINES });
    } catch (error) {
        console.error('cuisines list failed', error);
        return sendError(response, 500, 'Unable to load cuisines', 'cuisines_fetch_failed');
    }
};

export { list };
