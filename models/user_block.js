import { Sequelize } from 'sequelize';

export default (sequelize) => {
    sequelize.define('user_block', {
        id: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            allowNull: false,
            primaryKey: true
        },
        blocker_user_id: {
            type: Sequelize.INTEGER,
            allowNull: false
        },
        blocked_user_id: {
            type: Sequelize.INTEGER,
            allowNull: false
        }
    }, {
        updatedAt: 'updated_at',
        createdAt: 'created_at',
        indexes: [
            {
                unique: true,
                fields: ['blocker_user_id', 'blocked_user_id']
            },
            { fields: ['blocked_user_id'] }
        ]
    });
};
