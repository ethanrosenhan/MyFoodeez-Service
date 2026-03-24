import { URLSearchParams } from 'url';
import { getOptionalEnv } from '../utils/env.js';
import { sendError } from '../lib/response-helper.js';

const GOOGLE_PLACES_BASE_URL = 'https://maps.googleapis.com/maps/api/place';
const SUPPORTED_MAP_PATHS = new Map([
    ['/maps/api/place/autocomplete/json', 'autocomplete'],
    ['/maps/api/place/details/json', 'details']
]);

const pickAllowedParams = (sourceParams, allowedKeys) => {
    const params = new URLSearchParams();

    allowedKeys.forEach((key) => {
        const value = sourceParams[key];
        if (typeof value === 'string' && value.trim().length > 0) {
            params.set(key, value.trim());
        }
    });

    return params;
};

const normalizeDetailsParams = (params) => {
    if (params.get('placeid') && !params.get('place_id')) {
        params.set('place_id', params.get('placeid'));
    }
    params.delete('placeid');
    return params;
};

const proxyGooglePlaces = async (request, response) => {
    const endpoint = SUPPORTED_MAP_PATHS.get(request.path);
    const apiKey = getOptionalEnv('GOOGLE_MAPS_SERVER_API_KEY');

    if (!endpoint) {
        return sendError(response, 404, 'Maps endpoint not found', 'maps_not_found');
    }

    if (!apiKey) {
        return sendError(response, 503, 'Google Maps service is not configured', 'maps_not_configured');
    }

    const allowedParams = endpoint === 'autocomplete'
        ? ['input', 'language', 'location', 'radius', 'sessiontoken', 'components', 'types']
        : ['place_id', 'placeid', 'language', 'fields', 'sessiontoken'];

    const params = endpoint === 'details'
        ? normalizeDetailsParams(pickAllowedParams(request.query, allowedParams))
        : pickAllowedParams(request.query, allowedParams);
    if (endpoint === 'autocomplete' && !params.get('input')) {
        return sendError(response, 400, 'Search input is required', 'invalid_request');
    }
    if (endpoint === 'details' && !params.get('place_id')) {
        return sendError(response, 400, 'place_id is required', 'invalid_request');
    }

    params.set('key', apiKey);

    try {
        const upstreamResponse = await fetch(`${GOOGLE_PLACES_BASE_URL}/${endpoint}/json?${params.toString()}`);
        const payload = await upstreamResponse.json();
        return response.status(upstreamResponse.status).json(payload);
    } catch (error) {
        console.error('Google Maps proxy failed', error);
        return sendError(response, 502, 'Unable to load Google Maps data', 'maps_proxy_failed');
    }
};

export { proxyGooglePlaces };
