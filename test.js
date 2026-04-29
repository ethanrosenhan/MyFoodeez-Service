process.env.TOKEN_SECRET = process.env.TOKEN_SECRET || 'test-token-secret';
process.env.REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'test-refresh-token-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:password@localhost:5432/myfoodeez_test';
process.env.DATABASE_USE_SSL = process.env.DATABASE_USE_SSL || 'false';

const test = (await import('tape')).default;
const Sequelize = (await import('sequelize')).default;
const { models } = await import('./utils/database.js');
const {
    FRIENDSHIP_ACCEPTED,
    FRIENDSHIP_DECLINED,
    canViewPostRecord,
    getAcceptedFriendIds,
    getPostAccessWhere,
    normalizeFriendPair
} = await import('./lib/social-helper.js');

test('friend pair normalization is stable regardless of requester order', (t) => {
    t.deepEqual(normalizeFriendPair(10, 4), { user_one_id: 4, user_two_id: 10 });
    t.deepEqual(normalizeFriendPair(4, 10), { user_one_id: 4, user_two_id: 10 });
    t.end();
});

test('accepted friend ids include both sides of accepted friendships', async (t) => {
    const originalFindAll = models.friendship.findAll;
    models.friendship.findAll = async () => ([
        { user_one_id: 1, user_two_id: 2 },
        { user_one_id: 3, user_two_id: 1 }
    ]);

    t.deepEqual(await getAcceptedFriendIds(1), [2, 3]);

    models.friendship.findAll = originalFindAll;
    t.end();
});

test('post access allows owner and accepted friends but blocks private friend posts', async (t) => {
    const originalFindOne = models.friendship.findOne;
    models.friendship.findOne = async ({ where }) => (
        where.user_one_id === 1 && where.user_two_id === 2 && where.status === FRIENDSHIP_ACCEPTED
            ? { id: 1, status: FRIENDSHIP_ACCEPTED }
            : null
    );

    t.equal(await canViewPostRecord(1, { user_id: 1, is_private: true }), true, 'owner can view private post');
    t.equal(await canViewPostRecord(1, { user_id: 2, is_private: false }), true, 'accepted friend can view shared post');
    t.equal(await canViewPostRecord(1, { user_id: 2, is_private: true }), false, 'accepted friend cannot view private post');
    t.equal(await canViewPostRecord(1, { user_id: 4, is_private: false }), false, 'non-friend cannot view shared post');

    models.friendship.findOne = originalFindOne;
    t.end();
});

test('post search scopes default to mine and restrict friends to shared posts', async (t) => {
    const originalFindAll = models.friendship.findAll;
    models.friendship.findAll = async () => ([{ user_one_id: 1, user_two_id: 2 }]);

    t.deepEqual(await getPostAccessWhere(1), { user_id: 1 }, 'default scope stays personal');
    t.deepEqual(await getPostAccessWhere(1, 'friends'), {
        user_id: { [Sequelize.Op.in]: [2] },
        is_private: false
    }, 'friends scope only includes shared friend posts');

    const allScope = await getPostAccessWhere(1, 'all');
    t.equal(Array.isArray(allScope[Sequelize.Op.or]), true, 'all scope combines mine and shared friend posts');

    models.friendship.findAll = originalFindAll;
    t.end();
});

test('declined status constant is available for duplicate request reset policy', (t) => {
    t.equal(FRIENDSHIP_DECLINED, 'declined');
    t.end();
});
