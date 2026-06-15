import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import fetch from 'node-fetch';

// Verify a "Sign in with Apple" identity token without pulling in a new
// dependency. Apple publishes its signing keys as a JWKS; Node 18's crypto can
// turn a JWK straight into a public key (format: 'jwk'), so we fetch the keys,
// match on the token header's `kid`, and let jsonwebtoken verify the RS256
// signature + standard claims.
//
// The keys rotate rarely; we cache them for an hour so we're not hitting Apple
// on every login.

const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';
const APPLE_ISSUER = 'https://appleid.apple.com';
const KEYS_CACHE_TTL_MS = 60 * 60 * 1000;

let cachedKeys = null;
let cachedAt = 0;

const fetchAppleKeys = async () => {
    const now = Date.now();
    if (cachedKeys && now - cachedAt < KEYS_CACHE_TTL_MS) {
        return cachedKeys;
    }
    const response = await fetch(APPLE_KEYS_URL);
    if (!response.ok) {
        throw new Error(`Unable to fetch Apple public keys (${response.status})`);
    }
    const payload = await response.json();
    cachedKeys = Array.isArray(payload?.keys) ? payload.keys : [];
    cachedAt = now;
    return cachedKeys;
};

const getSigningKeyPem = async (kid) => {
    let keys = await fetchAppleKeys();
    let jwk = keys.find((key) => key.kid === kid);
    if (!jwk) {
        // Force a refresh in case Apple rotated keys mid-cache-window.
        cachedAt = 0;
        keys = await fetchAppleKeys();
        jwk = keys.find((key) => key.kid === kid);
    }
    if (!jwk) {
        throw new Error('No matching Apple signing key for token');
    }
    return crypto.createPublicKey({ key: jwk, format: 'jwk' });
};

// Returns the verified token payload (incl. `sub` and `email`) or throws.
// `audience` is your app's bundle id / Services ID (APPLE_CLIENT_ID).
const verifyAppleIdToken = async (identityToken, audience) => {
    if (!identityToken) {
        throw new Error('Missing Apple identity token');
    }
    const decoded = jwt.decode(identityToken, { complete: true });
    const kid = decoded?.header?.kid;
    if (!kid) {
        throw new Error('Malformed Apple identity token');
    }
    const publicKey = await getSigningKeyPem(kid);
    const verifyOptions = {
        algorithms: ['RS256'],
        issuer: APPLE_ISSUER
    };
    // Apple may issue tokens for either the app bundle id or a Services ID;
    // accept whichever audience(s) the deployment configured.
    if (audience) {
        verifyOptions.audience = audience;
    }
    return jwt.verify(identityToken, publicKey, verifyOptions);
};

export { verifyAppleIdToken };
