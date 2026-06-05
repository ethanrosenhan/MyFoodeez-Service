import Sequelize from 'sequelize';
import sequelize, { models } from '../utils/database.js';
import { findByFreeText } from '../constants/cuisines.js';

const Op = Sequelize.Op;

const runOnce = async (eventType, action) => {
    const existing = await models.audit.findOne({ where: { event_type: eventType } });
    if (existing) {
        return;
    }

    const result = await action();

    await models.audit.create({
        event_type: eventType,
        audit_timestamp: new Date(),
        data: result ?? {}
    });
};

const backfillSharedWithFriends = async () => {
    const [affected] = await models.post.update(
        { is_private: false },
        { where: { is_private: true } }
    );
    console.log(`backfillSharedWithFriends: set is_private=false on ${affected} posts`);
    return { affected };
};

const backfillPostImages = async () => {
    const idRows = await models.post.findAll({
        attributes: ['id'],
        where: {
            image_data: { [Op.ne]: null }
        },
        raw: true
    });

    let created = 0;
    for (const { id } of idRows) {
        const existing = await models.post_image.findOne({ where: { post_id: id } });
        if (existing) {
            continue;
        }
        const post = await models.post.findOne({
            attributes: ['id', 'image_data', 'image_type', 'image_name'],
            where: { id }
        });
        if (!post || !post.image_data || post.image_data.length === 0) {
            continue;
        }
        await models.post_image.create({
            post_id: post.id,
            image_data: post.image_data,
            image_type: post.image_type || 'image/png',
            image_name: post.image_name || 'meal.png',
            sort_order: 0
        });
        created += 1;
    }
    console.log(`backfillPostImages: created ${created} post_image rows from legacy posts`);
    return { created };
};

const addProfileImageColumns = async () => {
    await sequelize.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image_data BYTEA');
    await sequelize.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image_type VARCHAR(255)');
    return { ok: true };
};

const addCuisineIdColumn = async () => {
    await sequelize.query('ALTER TABLE posts ADD COLUMN IF NOT EXISTS cuisine_id VARCHAR(255)');
    await sequelize.query('CREATE INDEX IF NOT EXISTS posts_cuisine_id_idx ON posts (cuisine_id)');
    return { ok: true };
};

const backfillCuisineId = async () => {
    // Pull every post that hasn't been categorized yet. We do this in one pass
    // because posts is small enough today and findByFreeText is in-memory.
    const rows = await models.post.findAll({
        attributes: ['id', 'cuisine'],
        where: { cuisine_id: { [Op.is]: null } },
        raw: true
    });

    let matched = 0;
    let unknown = 0;
    for (const row of rows) {
        const entry = findByFreeText(row.cuisine);
        if (entry) {
            await models.post.update({ cuisine_id: entry.id }, { where: { id: row.id } });
            matched += 1;
        } else {
            unknown += 1;
            // Leave cuisine_id NULL — treated as "Other (free text)" by the UI.
        }
    }
    console.log(`backfillCuisineId: matched=${matched} unmatched=${unknown} of ${rows.length}`);
    return { matched, unknown, total: rows.length };
};

// post_star, user_place_intent, and device_token are all newly-defined models
// that sync() will create on fresh installs. These ALTER statements are a
// belt-and-suspenders for existing dev/prod DBs where sync() won't add
// indexes that didn't exist before. CREATE INDEX IF NOT EXISTS handles the
// re-run case.
const addPostStarIndexes = async () => {
    await sequelize.query('CREATE UNIQUE INDEX IF NOT EXISTS post_stars_user_post_unique ON post_stars (user_id, post_id)');
    await sequelize.query('CREATE INDEX IF NOT EXISTS post_stars_post_id_idx ON post_stars (post_id)');
    return { ok: true };
};

const addUserPlaceIntentIndexes = async () => {
    await sequelize.query('CREATE UNIQUE INDEX IF NOT EXISTS user_place_intents_user_place_unique ON user_place_intents (user_id, place_id)');
    await sequelize.query('CREATE INDEX IF NOT EXISTS user_place_intents_user_id_idx ON user_place_intents (user_id)');
    return { ok: true };
};

const addSourcePostIdToWishlist = async () => {
    await sequelize.query('ALTER TABLE user_place_intents ADD COLUMN IF NOT EXISTS source_post_id INTEGER');
    return { ok: true };
};

const addDeviceTokenIndexes = async () => {
    await sequelize.query('CREATE UNIQUE INDEX IF NOT EXISTS device_tokens_token_unique ON device_tokens (token)');
    await sequelize.query('CREATE INDEX IF NOT EXISTS device_tokens_user_id_idx ON device_tokens (user_id)');
    return { ok: true };
};

// menu_items is a newly-defined model that sync() creates on fresh installs.
// The ALTER on posts and these CREATE INDEX statements are belt-and-suspenders
// for existing dev/prod DBs where sync() won't add the column/indexes.
const addMenuItemIdColumn = async () => {
    await sequelize.query('ALTER TABLE posts ADD COLUMN IF NOT EXISTS menu_item_id INTEGER');
    await sequelize.query('CREATE INDEX IF NOT EXISTS posts_menu_item_id_idx ON posts (menu_item_id)');
    return { ok: true };
};

const addMenuItemIndexes = async () => {
    await sequelize.query('CREATE INDEX IF NOT EXISTS menu_items_place_id_idx ON menu_items (place_id)');
    await sequelize.query('CREATE INDEX IF NOT EXISTS menu_items_place_status_idx ON menu_items (place_id, status)');
    await sequelize.query('CREATE INDEX IF NOT EXISTS menu_items_place_section_sort_idx ON menu_items (place_id, section, sort_order)');
    await sequelize.query('CREATE UNIQUE INDEX IF NOT EXISTS menu_items_public_id_unique ON menu_items (public_id)');
    await sequelize.query('CREATE INDEX IF NOT EXISTS menu_items_place_normalized_name_idx ON menu_items (place_id, normalized_name)');
    return { ok: true };
};

const runStartupMigrations = async () => {
    try {
        await runOnce('migration:backfill_shared_with_friends_v1', backfillSharedWithFriends);
        await runOnce('migration:backfill_post_images_v1', backfillPostImages);
        await runOnce('migration:add_profile_image_columns_v1', addProfileImageColumns);
        await runOnce('migration:add_cuisine_id_column_v1', addCuisineIdColumn);
        await runOnce('migration:backfill_cuisine_id_v1', backfillCuisineId);
        await runOnce('migration:add_post_star_indexes_v1', addPostStarIndexes);
        await runOnce('migration:add_user_place_intent_indexes_v1', addUserPlaceIntentIndexes);
        await runOnce('migration:add_device_token_indexes_v1', addDeviceTokenIndexes);
        await runOnce('migration:add_source_post_id_to_wishlist_v1', addSourcePostIdToWishlist);
        await runOnce('migration:add_menu_item_id_column_v1', addMenuItemIdColumn);
        await runOnce('migration:add_menu_item_indexes_v1', addMenuItemIndexes);
    } catch (error) {
        console.error('startup migrations failed', error);
    }
};

export { runStartupMigrations };
