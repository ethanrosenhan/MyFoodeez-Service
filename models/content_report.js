import { Sequelize } from 'sequelize';

export default (sequelize) => {
    sequelize.define('content_report', {
        id: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            allowNull: false,
            primaryKey: true
        },
        reporter_user_id: {
            type: Sequelize.INTEGER,
            allowNull: false
        },
        post_id: {
            type: Sequelize.INTEGER,
            allowNull: false
        },
        reason: {
            type: Sequelize.STRING,
            allowNull: false
        },
        details: {
            type: Sequelize.TEXT,
            allowNull: true
        },
        status: {
            type: Sequelize.STRING,
            allowNull: false,
            defaultValue: 'pending'
        }
    }, {
        updatedAt: 'updated_at',
        createdAt: 'created_at',
        indexes: [
            {
                unique: true,
                fields: ['reporter_user_id', 'post_id']
            },
            { fields: ['status', 'created_at'] }
        ]
    });
};
