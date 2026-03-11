const DEFAULT_ERROR_CODE = 'internal_error';

const sendSuccess = (response, status, payload = {}) => {
    return response.status(status).json(payload);
};

const sendError = (response, status, message, code = DEFAULT_ERROR_CODE, details = undefined) => {
    const payload = {
        error: {
            code,
            message
        }
    };

    if (details !== undefined) {
        payload.error.details = details;
    }

    return response.status(status).json(payload);
};

const getErrorMessage = (payload, fallback = 'Request failed') => {
    if (!payload) {
        return fallback;
    }
    if (typeof payload.message === 'string' && payload.message.length > 0) {
        return payload.message;
    }
    if (payload.error && typeof payload.error.message === 'string' && payload.error.message.length > 0) {
        return payload.error.message;
    }
    return fallback;
};

export { getErrorMessage, sendError, sendSuccess };
