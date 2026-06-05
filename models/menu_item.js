import { Sequelize } from 'sequelize';

export default (sequelize) => {
    sequelize.define('menu_item', {
        // Internal serial id — never exposed externally; use public_id for that.
        id: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            allowNull: false,
            primaryKey: true
        },
        // Opaque external identifier for a future public Menu API. Avoids
        // leaking row counts / allowing enumeration the way a serial id would.
        public_id: {
            type: Sequelize.UUID,
            allowNull: false,
            defaultValue: Sequelize.UUIDV4,
            unique: true
        },
        // Google Places id — the same virtual-restaurant key used by post and
        // user_place_intent. A menu hangs off this, not a restaurant FK.
        place_id: {
            type: Sequelize.STRING,
            allowNull: false
        },
        // Denormalized restaurant name for convenient display without a join.
        place: {
            type: Sequelize.STRING,
            allowNull: true
        },
        // e.g. "Appetizers", "Mains". Null groups under an "Other" section.
        section: {
            type: Sequelize.STRING,
            allowNull: true
        },
        name: {
            type: Sequelize.STRING,
            allowNull: false
        },
        // Lowercased/trimmed name for dedup, "what did you order?" matching
        // across users, and cross-restaurant aggregation.
        normalized_name: {
            type: Sequelize.STRING,
            allowNull: true
        },
        // Ingredients / details.
        description: {
            type: Sequelize.TEXT,
            allowNull: true
        },
        // Normalized price for sorting/filtering; price_text preserves the raw
        // label (e.g. "$12 / $18") since real menus rarely have one clean price.
        price_cents: {
            type: Sequelize.INTEGER,
            allowNull: true
        },
        price_text: {
            type: Sequelize.STRING,
            allowNull: true
        },
        currency: {
            type: Sequelize.STRING,
            allowNull: false,
            defaultValue: 'USD'
        },
        // Ties into the existing cuisine taxonomy (constants/cuisines.js).
        cuisine_id: {
            type: Sequelize.STRING,
            allowNull: true
        },
        // Dietary/allergen/tags (vegetarian, gluten_free, spicy, ...). JSONB so
        // new tags never need a migration; high-value B2B + filtering data.
        attributes: {
            type: Sequelize.JSONB,
            allowNull: true
        },
        created_by_user_id: {
            type: Sequelize.INTEGER,
            allowNull: true
        },
        // 'manual' (seeded by a user) | 'parsed' (Phase 2 Claude vision).
        source: {
            type: Sequelize.STRING,
            allowNull: false,
            defaultValue: 'manual'
        },
        // Populated by the Phase 2 parser; null for manual entries.
        confidence: {
            type: Sequelize.FLOAT,
            allowNull: true
        },
        // 'active' | 'flagged' | 'removed'. Only 'active' is shown by default.
        // Soft-delete only ('removed') so price/trend history is preserved.
        status: {
            type: Sequelize.STRING,
            allowNull: false,
            defaultValue: 'active'
        },
        flag_count: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        // Last time a user confirmed the item/price still exists. Freshness is
        // what makes the dataset sellable; positive sibling to flagging.
        last_verified_at: {
            type: Sequelize.DATE,
            allowNull: true
        },
        sort_order: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0
        }
    }, {
        updatedAt: 'updated_at',
        createdAt: 'created_at',
        indexes: [
            { fields: ['place_id'] },
            { fields: ['place_id', 'status'] },
            { fields: ['place_id', 'section', 'sort_order'] },
            { fields: ['public_id'], unique: true },
            { fields: ['place_id', 'normalized_name'] }
        ]
    });
};
