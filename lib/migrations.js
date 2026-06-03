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

const runStartupMigrations = async () => {
    try {
        await runOnce('migration:backfill_shared_with_friends_v1', backfillSharedWithFriends);
        await runOnce('migration:backfill_post_images_v1', backfillPostImages);
        await runOnce('migration:add_profile_image_columns_v1', addProfileImageColumns);
        await runOnce('migration:add_cuisine_id_column_v1', addCuisineIdColumn);
        await runOnce('migration:backfill_cuisine_id_v1', backfillCuisineId);
    } catch (error) {
        console.error('startup migrations failed', error);
    }
};

export { runStartupMigrations };
