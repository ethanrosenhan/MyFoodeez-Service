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
    // Phase 2 — Claude Vision menu parser. ANTHROPIC_API_KEY is intentionally
    // optional: the parse endpoint returns 503 (not a boot failure) when it's
    // unset, so the rest of the service runs fine without a key configured.
    ANTHROPIC_API_KEY: '',
    ANTHROPIC_MODEL: 'claude-opus-4-8',
    // Used only when the primary model returns a retryable upstream error
    // (e.g. a 529 overload). Keeps menu scanning working through Opus capacity
    // crunches. Set equal to ANTHROPIC_MODEL to disable the fallback.
    ANTHROPIC_FALLBACK_MODEL: 'claude-sonnet-4-6',
    SERVICE_NAME: 'myfoodeez-service',
    CORS_ORIGIN: '*',
    TOKEN_EXPIRES_IN: '30d',
    REFRESH_TOKEN_EXPIRES_IN: '365d'
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
