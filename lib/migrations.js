import { models } from '../utils/database.js';

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

const runStartupMigrations = async () => {
    try {
        await runOnce('migration:backfill_shared_with_friends_v1', backfillSharedWithFriends);
    } catch (error) {
        console.error('startup migrations failed', error);
    }
};

export { runStartupMigrations };
