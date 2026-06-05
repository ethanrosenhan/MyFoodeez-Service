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
const {
    listMenu,
    flagMenuItem,
    groupBySection,
    normalizeName,
    parsePriceToCents,
    FLAG_THRESHOLD
} = await import('./controllers/menu.js');

// Minimal Express response double that records status + json payload.
const makeRes = () => {
    const res = {};
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (payload) => { res.body = payload; return res; };
    return res;
};

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

test('menu normalizeName lowercases, trims and collapses whitespace', (t) => {
    t.equal(normalizeName('  Margherita   Pizza '), 'margherita pizza');
    t.equal(normalizeName('SAME dish'), 'same dish', 'matches across casing for dedup');
    t.equal(normalizeName('   '), null, 'blank names normalize to null');
    t.equal(normalizeName(undefined), null);
    t.end();
});

test('menu parsePriceToCents extracts a normalized price, preserving raw text elsewhere', (t) => {
    t.equal(parsePriceToCents('$12'), 1200);
    t.equal(parsePriceToCents('12.50'), 1250);
    t.equal(parsePriceToCents('$12 / $18'), 1200, 'first price wins for sorting');
    t.equal(parsePriceToCents('market price'), null, 'unparseable price is null, price_text keeps the original');
    t.end();
});

test('menu groupBySection groups items by section, exposes public_id, and falls back to Other', (t) => {
    const sections = groupBySection([
        { public_id: 'p1', place_id: 'X', section: 'Mains', name: 'Burger' },
        { public_id: 'p2', place_id: 'X', section: 'Mains', name: 'Steak' },
        { public_id: 'p3', place_id: 'X', section: null, name: 'Mystery' }
    ]);
    t.deepEqual(sections.map((s) => s.section), ['Mains', 'Other'], 'sectionless items group under Other');
    t.equal(sections[0].items.length, 2);
    t.equal(sections[0].items[0].id, 'p1', 'DTO exposes public_id as id, never the serial id');
    t.equal(sections[0].items[0].name, 'Burger');
    t.end();
});

test('menu listMenu only queries active items for the place', async (t) => {
    const original = models.menu_item.findAll;
    let capturedWhere = null;
    models.menu_item.findAll = async ({ where }) => {
        capturedWhere = where;
        return [{ public_id: 'p1', place_id: 'abc', section: 'Mains', name: 'Burger' }];
    };

    const res = makeRes();
    await listMenu({ params: { placeId: 'abc' } }, res);

    t.deepEqual(capturedWhere, { place_id: 'abc', status: 'active' }, 'flagged/removed items are excluded by the query');
    t.equal(res.statusCode, 200);
    t.equal(res.body.item_count, 1);
    t.equal(res.body.sections[0].items[0].id, 'p1');

    models.menu_item.findAll = original;
    t.end();
});

test('menu flagMenuItem hides an item once it reaches the flag threshold', async (t) => {
    const original = models.menu_item.findOne;
    const makeRow = (flag_count) => {
        const row = { public_id: 'p1', flag_count, status: 'active' };
        row.update = async (changes) => { Object.assign(row, changes); return row; };
        return row;
    };

    // One flag below threshold leaves the item active.
    let row = makeRow(0);
    models.menu_item.findOne = async () => row;
    let res = makeRes();
    await flagMenuItem({ params: { id: 'p1' } }, res);
    t.equal(res.body.flag_count, 1);
    t.equal(res.body.status, 'active', 'still visible below threshold');

    // The flag that reaches the threshold flips status to flagged.
    row = makeRow(FLAG_THRESHOLD - 1);
    models.menu_item.findOne = async () => row;
    res = makeRes();
    await flagMenuItem({ params: { id: 'p1' } }, res);
    t.equal(res.body.flag_count, FLAG_THRESHOLD);
    t.equal(res.body.status, 'flagged', 'dropped from default list at threshold');

    models.menu_item.findOne = original;
    t.end();
});
