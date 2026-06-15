const requiredEnvironmentVariables = [
    'DATABASE_URL',
    'TOKEN_SECRET',
    'REFRESH_TOKEN_SECRET'
];

const optionalEnvironmentVariables = {
    MAILGUN_API_KEY: '',
    MAILGUN_DOMAIN: 'myfoodeez.com',
    // Transactional sender. Defaults to the support mailbox so a misconfigured
    // env can never fall back to a personal Gmail address. Override in Render
    // only if you want a different verified sender.
    SIGNUP_FROM_EMAIL: 'MyFoodeez Support <support@myfoodeez.com>',
    PASSWORD_CHANGE_FROM_EMAIL: 'MyFoodeez Support <support@myfoodeez.com>',
    SUPPORT_RECEIVED_TO_EMAIL: 'support@myfoodeez.com',
    GOOGLE_MAPS_SERVER_API_KEY: '',
    // Social sign-in. Google issues platform-specific client ids; we accept a
    // token minted for any configured platform. APPLE_CLIENT_ID is the app's
    // bundle id (or a Services ID for web). All optional — the matching
    // endpoint returns 503 until configured, so the service still boots.
    GOOGLE_OAUTH_IOS_CLIENT_ID: '',
    GOOGLE_OAUTH_ANDROID_CLIENT_ID: '',
    GOOGLE_OAUTH_WEB_CLIENT_ID: '',
    APPLE_CLIENT_ID: '',
    // Cloudinary — video (and optionally image) object storage. When unset the
    // video upload path returns 503 and posting photos still works.
    CLOUDINARY_CLOUD_NAME: '',
    CLOUDINARY_API_KEY: '',
    CLOUDINARY_API_SECRET: '',
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
