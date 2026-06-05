import { Sequelize }  from 'sequelize';

export default (sequelize) => {
    sequelize.define('post', {
        id: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            allowNull: false,
            primaryKey: true
        },
        place: {
            type: Sequelize.STRING,
            allowNull: true
        },
        place_id: {
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
        post_date: {
            type: Sequelize.DATE,
            allowNull: false
        },
        rating: {
            type: Sequelize.STRING,
            allowNull: true
        },
        cuisine: {
            type: Sequelize.STRING,
            allowNull: false
        },
        cuisine_id: {
            type: Sequelize.STRING,
            allowNull: true
        },
        image_type: {
            type: Sequelize.STRING,
            allowNull: true
        },
        image_name: {
            type: Sequelize.STRING,
            allowNull: true
        },
        comments: {
            type: Sequelize.TEXT,
            allowNull: true
        }, 
        image_data: {
            type: Sequelize.BLOB('long'),
            allowNull: true
        },
        image_thumbnail: {
            type: Sequelize.BLOB('long'),
            allowNull: true
        },
        is_private: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        // Optional link to a structured menu_item ("what did you order?").
        // Nullable by design — posting never requires touching the menu.
        menu_item_id: {
            type: Sequelize.INTEGER,
            allowNull: true
        }
    }, {
        updatedAt: 'updated_at',
        createdAt: 'created_at'
    });
}
