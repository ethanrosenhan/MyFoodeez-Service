import { Sequelize } from 'sequelize';

// Join table linking a post to the menu items the user ordered. A post can
// reference multiple dishes (multi-select "What did you order?"); the legacy
// post.menu_item_id column is kept in sync with the first item for backward
// compatibility with older app builds.
export default (sequelize) => {
    sequelize.define('post_menu_item', {
        id: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            allowNull: false,
            primaryKey: true
        },
        post_id: {
            type: Sequelize.INTEGER,
            allowNull: false
        },
        // Internal menu_item.id (never the public_id) — this is a server-side FK.
        menu_item_id: {
            type: Sequelize.INTEGER,
            allowNull: false
        },
        // Preserves the order the user selected the dishes in.
        sort_order: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0
        }
    }, {
        updatedAt: 'updated_at',
        createdAt: 'created_at',
        indexes: [
            { fields: ['post_id', 'menu_item_id'], unique: true },
            { fields: ['post_id'] },
            { fields: ['menu_item_id'] }
        ]
    });
};
