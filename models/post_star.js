import { Sequelize } from 'sequelize';

// Community upvotes ("stars") on posts. Distinct from the existing `rating`
// column, which is the post author's own 1-5 score. Anyone with view access
// to a post can star it once. Idempotency is enforced by the unique
// (user_id, post_id) index — a second POST is a no-op, not a duplicate row.
export default (sequelize) => {
    sequelize.define('post_star', {
        id: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            allowNull: false,
            primaryKey: true
        },
        user_id: {
            type: Sequelize.INTEGER,
            allowNull: false
        },
        post_id: {
            type: Sequelize.INTEGER,
            allowNull: false
        }
    }, {
        updatedAt: 'updated_at',
        createdAt: 'created_at',
        indexes: [
            { unique: true, fields: ['user_id', 'post_id'] },
            { fields: ['post_id'] }
        ]
    });
};
