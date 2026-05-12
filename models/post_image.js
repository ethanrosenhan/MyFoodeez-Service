import { Sequelize } from 'sequelize';

export default (sequelize) => {
    sequelize.define('post_image', {
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
        image_data: {
            type: Sequelize.BLOB('long'),
            allowNull: false
        },
        image_type: {
            type: Sequelize.STRING,
            allowNull: true
        },
        image_name: {
            type: Sequelize.STRING,
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
            { fields: ['post_id'] },
            { fields: ['post_id', 'sort_order'] }
        ]
    });
};
