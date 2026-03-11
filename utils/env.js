const requiredEnvironmentVariables = [
    'DATABASE_URL',
    'TOKEN_SECRET',
    'REFRESH_TOKEN_SECRET'
];

const optionalEnvironmentVariables = {
    MAILGUN_API_KEY: '',
    MAILGUN_DOMAIN: '',
    SIGNUP_FROM_EMAIL: '',
    PASSWORD_CHANGE_FROM_EMAIL: '',
    SUPPORT_RECEIVED_TO_EMAIL: '',
    GOOGLE_MAPS_SERVER_API_KEY: '',
    SERVICE_NAME: 'myfoodeez-service',
    CORS_ORIGIN: '*',
    TOKEN_EXPIRES_IN: '1h',
    REFRESH_TOKEN_EXPIRES_IN: '1d'
};

const getEnv = (name, fallback = undefined) => {
    const value = process.env[name];
    if (typeof value === 'string' && value.length > 0) {
        return value;
    }
    return fallback;
};

const getRequiredEnv = (name) => {
    const value = getEnv(name);
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
};

const validateEnvironment = () => {
    requiredEnvironmentVariables.forEach((name) => {
        getRequiredEnv(name);
    });
};

const getOptionalEnv = (name) => {
    return getEnv(name, optionalEnvironmentVariables[name]);
};

export { getOptionalEnv, getRequiredEnv, validateEnvironment };
