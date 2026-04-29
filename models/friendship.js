import { Sequelize } from 'sequelize';

export default (sequelize) => {
    sequelize.define('friendship', {
        id: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            allowNull: false,
            primaryKey: true
        },
        user_one_id: {
            type: Sequelize.INTEGER,
            allowNull: false
        },
        user_two_id: {
            type: Sequelize.INTEGER,
            allowNull: false
        },
        requester_user_id: {
            type: Sequelize.INTEGER,
            allowNull: false
        },
        addressee_user_id: {
            type: Sequelize.INTEGER,
            allowNull: false
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
                fields: ['user_one_id', 'user_two_id']
            }
        ]
    });
};
