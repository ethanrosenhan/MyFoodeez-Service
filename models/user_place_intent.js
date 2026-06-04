import { Sequelize } from 'sequelize';

// Wishlist / "Want to try" — a saved restaurant the user has not yet reviewed.
// Restaurants are virtual (keyed by Google Places place_id), so we duplicate
// the place fields here. If the user later posts a review for the same
// place_id, both records coexist — there's no auto-cleanup. The UI can
// decide whether to hide wishlist entries once a review exists.
export default (sequelize) => {
    sequelize.define('user_place_intent', {
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
        place_id: {
            type: Sequelize.STRING,
            allowNull: false
        },
        place: {
            type: Sequelize.STRING,
            allowNull: true
        },
        place_secondary_text: {
            type: Sequelize.STRING,
            allowNull: true
        },
        place_latitude: {
            type: Sequelize.STRING,
            allowNull: true
        },
        place_longitude: {
            type: Sequelize.STRING,
            allowNull: true
        },
        cuisine_id: {
            type: Sequelize.STRING,
            allowNull: true
        },
        note: {
            type: Sequelize.TEXT,
            allowNull: true
        }
    }, {
        updatedAt: 'updated_at',
        createdAt: 'created_at',
        indexes: [
            { unique: true, fields: ['user_id', 'place_id'] },
            { fields: ['user_id'] }
        ]
    });
};
