import { Sequelize } from 'sequelize';

export default (sequelize) => {
    sequelize.define('follow', {
        id: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            allowNull: false,
            primaryKey: true
        },
        follower_user_id: {
            type: Sequelize.INTEGER,
            allowNull: false
        },
        followed_user_id: {
            type: Sequelize.INTEGER,
            allowNull: false
        }
    }, {
        updatedAt: 'updated_at',
        createdAt: 'created_at',
        indexes: [
            {
                unique: true,
                fields: ['follower_user_id', 'followed_user_id']
            }
        ]
    });
};
