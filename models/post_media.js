import { Sequelize } from 'sequelize';

// Rich media attached to a post that doesn't live in Postgres. Today this is
// video: the bytes are stored in Cloudinary (object storage), and we keep only
// the URLs + provider public_id so we can stream, show a cover thumbnail, and
// delete the asset when the post is removed.
//
// Photos intentionally stay in post_image (BLOBs) — they're small and the
// existing flow works. This table is for assets too large to sit in the DB.
export default (sequelize) => {
    sequelize.define('post_media', {
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
        // 'video' today; column kept generic for future media kinds.
        media_type: {
            type: Sequelize.STRING,
            allowNull: false,
            defaultValue: 'video'
        },
        // Cloudinary secure_url for the asset itself.
        url: {
            type: Sequelize.STRING,
            allowNull: false
        },
        // Cover image — a frame chosen by the user (or auto first frame),
        // served as a Cloudinary-generated JPEG URL.
        thumbnail_url: {
            type: Sequelize.STRING,
            allowNull: true
        },
        // Cloudinary public_id, needed to delete the asset later.
        provider_public_id: {
            type: Sequelize.STRING,
            allowNull: true
        },
        // Seconds — playback duration, when the provider reports it.
        duration: {
            type: Sequelize.FLOAT,
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
            { fields: ['post_id'] }
        ]
    });
};
