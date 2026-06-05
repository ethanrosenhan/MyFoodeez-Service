import Anthropic from '@anthropic-ai/sdk';
import { IncomingForm } from 'formidable';
import { models } from '../utils/database.js';
import { sendError, sendSuccess } from '../lib/response-helper.js';
import { findById as findCuisineById, findByFreeText } from '../constants/cuisines.js';
import { getOptionalEnv } from '../utils/env.js';
import { log } from '../lib/log-helper.js';

// Flagging is community moderation: once enough distinct reports accumulate the
// item drops out of the default ('active') list without a human in the loop.
const FLAG_THRESHOLD = 3;

const toNullableString = (value) => {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};

const toNullableInt = (value) => {
    const parsed = parseInt(value, 10);
    return Number.isInteger(parsed) ? parsed : null;
};

// Lowercased/trimmed/whitespace-collapsed key used for dedup and matching the
// same dish across users. Stored alongside the display name, never shown.
const normalizeName = (name) => {
    if (typeof name !== 'string') {
        return null;
    }
    const normalized = name.trim().toLowerCase().replace(/\s+/g, ' ');
    return normalized.length > 0 ? normalized : null;
};

// Best-effort cents from a raw price label ("$12", "12.50", "$12 / $18" -> 1200).
// price_text always preserves the original; this is only for sorting/analytics.
const parsePriceToCents = (priceText) => {
    if (typeof priceText !== 'string') {
        return null;
    }
    const match = priceText.match(/\d+(?:[.,]\d{1,2})?/);
    if (!match) {
        return null;
    }
    const amount = parseFloat(match[0].replace(',', '.'));
    return Number.isFinite(amount) ? Math.round(amount * 100) : null;
};

// Public DTO — the ONLY shape returned to clients. Exposes public_id (never the
// serial id) so a future /v1 public Menu API can wrap this without leaking the
// schema. Keep this decoupled from the model on purpose.
const mapMenuItem = (row) => ({
    id: row.public_id,
    place_id: row.place_id,
    section: row.section,
    name: row.name,
    description: row.description,
    price_cents: row.price_cents,
    price_text: row.price_text,
    currency: row.currency,
    cuisine_id: row.cuisine_id,
    cuisine_label: row.cuisine_id ? (findCuisineById(row.cuisine_id)?.label || null) : null,
    attributes: row.attributes || null,
    source: row.source,
    confidence: row.confidence,
    last_verified_at: row.last_verified_at,
    created_at: row.created_at
});

const SECTION_FALLBACK = 'Other';

// Group active items into ordered sections for the picker UI. Section order
// follows first-appearance (already sorted by section, sort_order in the query).
const groupBySection = (rows) => {
    const sections = [];
    const index = new Map();
    for (const row of rows) {
        const label = row.section || SECTION_FALLBACK;
        if (!index.has(label)) {
            index.set(label, { section: label, items: [] });
            sections.push(index.get(label));
        }
        index.get(label).items.push(mapMenuItem(row));
    }
    return sections;
};

const findByPublicId = (publicId) => models.menu_item.findOne({ where: { public_id: publicId } });

// GET /menu/:placeId — active menu for a restaurant, grouped by section.
const listMenu = async (request, response) => {
    try {
        const place_id = toNullableString(request.params.placeId);
        if (!place_id) {
            return sendError(response, 400, 'place_id is required', 'menu_missing_place_id');
        }
        const rows = await models.menu_item.findAll({
            where: { place_id, status: 'active' },
            order: [
                ['section', 'ASC'],
                ['sort_order', 'ASC'],
                ['name', 'ASC']
            ]
        });
        return sendSuccess(response, 200, {
            place_id,
            sections: groupBySection(rows),
            item_count: rows.length
        });
    } catch (error) {
        console.error('listMenu failed', error);
        return sendError(response, 500, 'Unable to load menu', 'menu_fetch_failed');
    }
};

// POST /menu/:placeId/item — user seeds one menu item (source 'manual').
const addMenuItem = async (request, response) => {
    try {
        const place_id = toNullableString(request.params.placeId);
        if (!place_id) {
            return sendError(response, 400, 'place_id is required', 'menu_missing_place_id');
        }
        const body = request.body || {};
        const name = toNullableString(body.name);
        if (!name) {
            return sendError(response, 400, 'name is required', 'menu_missing_name');
        }

        const price_text = toNullableString(body.price_text);
        // Accept an explicit cuisine_id, else try to resolve free text to the taxonomy.
        let cuisine_id = toNullableString(body.cuisine_id);
        if (!cuisine_id) {
            const cuisineText = toNullableString(body.cuisine);
            if (cuisineText) {
                cuisine_id = findByFreeText(cuisineText)?.id || null;
            }
        }

        const row = await models.menu_item.create({
            place_id,
            place: toNullableString(body.place),
            section: toNullableString(body.section),
            name,
            normalized_name: normalizeName(name),
            description: toNullableString(body.description),
            price_text,
            price_cents: toNullableInt(body.price_cents) ?? parsePriceToCents(price_text),
            currency: toNullableString(body.currency) || 'USD',
            cuisine_id,
            attributes: body.attributes && typeof body.attributes === 'object' ? body.attributes : null,
            created_by_user_id: request.user.id,
            source: 'manual',
            status: 'active',
            sort_order: toNullableInt(body.sort_order) ?? 0
        });

        await log(request, '/menu/item', { action: 'add', place_id, public_id: row.public_id });
        return sendSuccess(response, 201, mapMenuItem(row));
    } catch (error) {
        console.error('addMenuItem failed', error);
        return sendError(response, 500, 'Unable to add menu item', 'menu_add_failed');
    }
};

// PUT /menu/item/:id — any authed user can correct an item (auto-publish + edit
// trust model). Only provided fields are changed.
const updateMenuItem = async (request, response) => {
    try {
        const row = await findByPublicId(request.params.id);
        if (!row || row.status === 'removed') {
            return sendError(response, 404, 'Menu item not found', 'menu_item_not_found');
        }
        const body = request.body || {};
        const updates = {};

        const name = toNullableString(body.name);
        if (name) {
            updates.name = name;
            updates.normalized_name = normalizeName(name);
        }
        if (body.section !== undefined) updates.section = toNullableString(body.section);
        if (body.description !== undefined) updates.description = toNullableString(body.description);
        if (body.price_text !== undefined) {
            updates.price_text = toNullableString(body.price_text);
            updates.price_cents = toNullableInt(body.price_cents) ?? parsePriceToCents(updates.price_text);
        } else if (body.price_cents !== undefined) {
            updates.price_cents = toNullableInt(body.price_cents);
        }
        if (body.currency !== undefined) updates.currency = toNullableString(body.currency) || 'USD';
        if (body.cuisine_id !== undefined) updates.cuisine_id = toNullableString(body.cuisine_id);
        if (body.attributes !== undefined) {
            updates.attributes = body.attributes && typeof body.attributes === 'object' ? body.attributes : null;
        }
        if (body.sort_order !== undefined) updates.sort_order = toNullableInt(body.sort_order) ?? row.sort_order;

        await row.update(updates);
        await log(request, '/menu/item', { action: 'edit', public_id: row.public_id });
        return sendSuccess(response, 200, mapMenuItem(row));
    } catch (error) {
        console.error('updateMenuItem failed', error);
        return sendError(response, 500, 'Unable to update menu item', 'menu_update_failed');
    }
};

// POST /menu/item/:id/flag — community report. At threshold the item is hidden
// from the default list (soft, reversible via edit/verify).
const flagMenuItem = async (request, response) => {
    try {
        const row = await findByPublicId(request.params.id);
        if (!row || row.status === 'removed') {
            return sendError(response, 404, 'Menu item not found', 'menu_item_not_found');
        }
        const flag_count = row.flag_count + 1;
        const status = flag_count >= FLAG_THRESHOLD ? 'flagged' : row.status;
        await row.update({ flag_count, status });
        await log(request, '/menu/item', { action: 'flag', public_id: row.public_id, flag_count, status });
        return sendSuccess(response, 200, { id: row.public_id, flag_count, status });
    } catch (error) {
        console.error('flagMenuItem failed', error);
        return sendError(response, 500, 'Unable to flag menu item', 'menu_flag_failed');
    }
};

// POST /menu/item/:id/verify — positive freshness signal ("still on the menu /
// still this price"). Keeps the dataset current, which is what makes it valuable.
const verifyMenuItem = async (request, response) => {
    try {
        const row = await findByPublicId(request.params.id);
        if (!row || row.status === 'removed') {
            return sendError(response, 404, 'Menu item not found', 'menu_item_not_found');
        }
        await row.update({ last_verified_at: new Date() });
        await log(request, '/menu/item', { action: 'verify', public_id: row.public_id });
        return sendSuccess(response, 200, mapMenuItem(row));
    } catch (error) {
        console.error('verifyMenuItem failed', error);
        return sendError(response, 500, 'Unable to verify menu item', 'menu_verify_failed');
    }
};

// ── Phase 2 — Claude Vision menu parser ─────────────────────────────────────
//
// A user photographs (or uploads a PDF of) a physical menu; we send it to the
// Claude API, which returns a structured JSON array of items. Parsed items are
// bulk-inserted as source:'parsed' and returned for a confirm/edit pass in the
// app. This is the "magic" that seeds the crowdsourced menu database at scale.

const MAX_PARSE_IMAGES = 5;

// Large, static system prompt — attach cache_control so repeated parses reuse
// it (prefix caching). Kept terse and example-light so the model returns ONLY
// the JSON array we then JSON.parse below.
const MENU_PARSER_SYSTEM_PROMPT = `You are a menu parser. Given one or more images or a PDF of a restaurant menu, extract every menu item you can identify and return ONLY a valid JSON array. No explanation, no markdown, just the raw JSON array.

Each element must have:
- "section": string or null — the menu section heading (e.g. "Appetizers", "Mains", "Desserts")
- "name": string — the item name, required
- "description": string or null — ingredients or description if present
- "price_text": string or null — the price exactly as written (e.g. "$14", "$12 / $18", "Market price")
- "price_cents": integer or null — the primary price converted to cents (e.g. 1400 for "$14"); null if unparseable
- "currency": "USD" unless clearly otherwise
- "confidence": float 0.0-1.0 — your confidence this is a real menu item (use <0.7 for unclear/partial text)

Rules:
- Include ALL items you can read, even if partially visible
- Do NOT include section headings as items
- Do NOT hallucinate items not visible in the image
- Preserve the original section groupings
- If the same item appears multiple times (e.g. repeated header), include it only once`;

// Lazily-constructed Anthropic client. Cached across requests so we don't
// rebuild it (and re-read env) on every parse. Tests inject a fake via
// __setAnthropicClientForTests so they never touch the network or need a key.
let anthropicClient = null;
let testAnthropicClient = null;

const getAnthropicClient = () => {
    if (testAnthropicClient) {
        return testAnthropicClient;
    }
    if (anthropicClient) {
        return anthropicClient;
    }
    const apiKey = getOptionalEnv('ANTHROPIC_API_KEY');
    if (!apiKey) {
        return null;
    }
    anthropicClient = new Anthropic({ apiKey });
    return anthropicClient;
};

// Test seam: pass a stub exposing messages.create; pass null to reset.
const __setAnthropicClientForTests = (client) => {
    testAnthropicClient = client;
};

// Parse multipart (or JSON) into a flat fields object, mirroring post.js. The
// app posts multipart with base64 file_0..file_N; tests post JSON directly.
const parseMenuRequest = async (request) => {
    const contentType = request.headers?.['content-type'] || '';
    const flatten = (fields) => {
        const out = {};
        Object.entries(fields || {}).forEach(([key, value]) => {
            out[key] = Array.isArray(value) ? value[0] : value;
        });
        return out;
    };
    if (contentType.includes('application/json')) {
        return flatten(request.body);
    }
    const form = new IncomingForm();
    form.keepExtensions = true;
    const [fields] = await form.parse(request);
    return flatten(fields);
};

const collectParseImages = (fields) => {
    const images = [];
    if (fields.file && fields.file !== 'null') {
        images.push(fields.file);
    }
    for (let i = 0; i < MAX_PARSE_IMAGES; i += 1) {
        const value = fields[`file_${i}`];
        if (value && value !== 'null') {
            images.push(value);
        }
    }
    return images.slice(0, MAX_PARSE_IMAGES);
};

// Claude is asked for raw JSON, but a stray preamble can sneak in. Try a clean
// parse first, then fall back to slicing out the outermost [...] array.
const extractJsonArray = (text) => {
    if (typeof text !== 'string') {
        return null;
    }
    const tryParse = (candidate) => {
        try {
            const parsed = JSON.parse(candidate);
            return Array.isArray(parsed) ? parsed : null;
        } catch (_) {
            return null;
        }
    };
    const direct = tryParse(text.trim());
    if (direct) {
        return direct;
    }
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start !== -1 && end > start) {
        return tryParse(text.slice(start, end + 1));
    }
    return null;
};

// Pull the concatenated text out of an Anthropic Messages response.
const responseText = (message) => {
    if (!message || !Array.isArray(message.content)) {
        return '';
    }
    return message.content
        .filter((block) => block?.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text)
        .join('\n');
};

// POST /menu/:placeId/parse — Claude Vision seed of a restaurant's menu.
const parseMenu = async (request, response) => {
    const place_id = toNullableString(request.params.placeId);
    if (!place_id) {
        return sendError(response, 400, 'place_id is required', 'menu_missing_place_id');
    }

    // Cost/safety guard: with no key configured the feature is simply off.
    const client = getAnthropicClient();
    if (!client) {
        return sendError(response, 503, 'Menu scanning is not configured', 'menu_parse_not_configured');
    }

    let fields;
    try {
        fields = await parseMenuRequest(request);
    } catch (error) {
        console.error('parseMenu request parsing failed', error);
        return sendError(response, 400, 'Could not read the uploaded menu', 'menu_parse_bad_request');
    }

    const images = collectParseImages(fields);
    const pdf = toNullableString(fields.pdf);
    if (images.length === 0 && !pdf) {
        return sendError(response, 400, 'At least one menu photo or PDF is required', 'menu_parse_no_input');
    }

    const place = toNullableString(fields.place);

    // Build the user turn: image(s) first, then an optional PDF, then a short
    // text nudge with the restaurant name for context.
    const userContent = images.map((data) => ({
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data }
    }));
    if (pdf) {
        userContent.push({
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: pdf }
        });
    }
    userContent.push({
        type: 'text',
        text: place
            ? `Parse the full menu for "${place}". Return only the JSON array.`
            : 'Parse the full menu. Return only the JSON array.'
    });

    const requestBody = {
        max_tokens: 8000,
        // cache_control on the static system prompt → prefix caching across
        // parses. (Opus has a 4096-token cache minimum; this primarily pays
        // off once the prompt or a shared prefix grows.)
        system: [
            { type: 'text', text: MENU_PARSER_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }
        ],
        messages: [{ role: 'user', content: userContent }]
    };

    // Primary model first (best vision quality), then an automatic fallback
    // when the primary is overloaded/erroring — Opus capacity crunches return
    // 529s, and a menu scan shouldn't hard-fail when Sonnet can do the job.
    // The fallback only triggers on retryable upstream errors (529 / 5xx), so
    // a real config/auth problem still surfaces immediately.
    const candidateModels = [getOptionalEnv('ANTHROPIC_MODEL'), getOptionalEnv('ANTHROPIC_FALLBACK_MODEL')]
        .filter((model, index, all) => model && all.indexOf(model) === index);

    let message = null;
    let usedModel = null;
    for (const model of candidateModels) {
        try {
            message = await client.messages.create({ model, ...requestBody });
            usedModel = model;
            break;
        } catch (error) {
            const status = error?.status;
            const retryable = status === 529 || (typeof status === 'number' && status >= 500);
            console.error(`parseMenu Claude request failed (model=${model}, status=${status})`, error?.message || error);
            if (!retryable) {
                break; // config/auth/bad-request error — another model won't help
            }
        }
    }

    if (!message) {
        return sendError(response, 502, 'Menu scanning service is unavailable', 'menu_parse_upstream_failed');
    }

    if (message.usage) {
        // Cheap cost visibility — which model ran + input/output (+ cache) tokens.
        await log(request, '/menu/parse', {
            action: 'parse_tokens',
            place_id,
            model: usedModel,
            input_tokens: message.usage.input_tokens,
            output_tokens: message.usage.output_tokens,
            cache_read_input_tokens: message.usage.cache_read_input_tokens
        });
    }

    const parsed = extractJsonArray(responseText(message));
    if (!parsed) {
        return sendError(response, 422, 'No menu items could be read from that image', 'menu_parse_no_items');
    }

    // Keep only well-formed items (non-empty name). Everything else is dropped.
    const rows = parsed
        .filter((item) => item && typeof item.name === 'string' && item.name.trim().length > 0)
        .map((item) => {
            const price_text = toNullableString(item.price_text);
            return {
                place_id,
                place,
                section: toNullableString(item.section),
                name: item.name.trim(),
                normalized_name: normalizeName(item.name),
                description: toNullableString(item.description),
                price_text,
                price_cents: toNullableInt(item.price_cents) ?? parsePriceToCents(price_text),
                currency: toNullableString(item.currency) || 'USD',
                created_by_user_id: request.user.id,
                source: 'parsed',
                confidence: typeof item.confidence === 'number' ? item.confidence : null,
                status: 'active'
            };
        });

    if (rows.length === 0) {
        return sendError(response, 422, 'No menu items could be read from that image', 'menu_parse_no_items');
    }

    let inserted;
    try {
        inserted = await models.menu_item.bulkCreate(rows, { returning: true });
    } catch (error) {
        console.error('parseMenu bulkCreate failed', error);
        return sendError(response, 500, 'Unable to save parsed menu', 'menu_parse_save_failed');
    }

    await log(request, '/menu/parse', { action: 'parse', place_id, parsed_count: inserted.length });
    return sendSuccess(response, 201, {
        parsed_count: inserted.length,
        items: inserted.map(mapMenuItem)
    });
};

export {
    listMenu,
    addMenuItem,
    updateMenuItem,
    flagMenuItem,
    verifyMenuItem,
    parseMenu,
    // exported for unit tests
    groupBySection,
    normalizeName,
    parsePriceToCents,
    mapMenuItem,
    extractJsonArray,
    __setAnthropicClientForTests,
    FLAG_THRESHOLD
};
