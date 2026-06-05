import { models } from '../utils/database.js';
import { sendError, sendSuccess } from '../lib/response-helper.js';
import { findById as findCuisineById, findByFreeText } from '../constants/cuisines.js';
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

export {
    listMenu,
    addMenuItem,
    updateMenuItem,
    flagMenuItem,
    verifyMenuItem,
    // exported for unit tests
    groupBySection,
    normalizeName,
    parsePriceToCents,
    mapMenuItem,
    FLAG_THRESHOLD
};
