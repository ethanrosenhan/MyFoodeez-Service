const log = async (request, eventType, data = {}) => {
    if (process.env.NODE_ENV !== 'test') {
        console.info(`[audit] ${eventType}`, data);
    }
};

const getIpAddress = (request) => {
    return request.headers['x-forwarded-for'] || request.connection.remoteAddress;
};

export { log, getIpAddress };
