import { Sequelize } from 'sequelize';

export default (sequelize) => {
    sequelize.define('user', {
        id: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            allowNull: false,
            primaryKey: true,
        },
        email: {
            type: Sequelize.STRING,
            allowNull: false,
            unique: true
        },
        first_name: {
            type: Sequelize.STRING,
        },
        last_name: {
            type: Sequelize.STRING,
        },
        password: {
            type: Sequelize.STRING,
            allowNull: true,
        },
        image: {
            type: Sequelize.STRING,
            allowNull: true,
        },
        profile_image_data: {
            type: Sequelize.BLOB('long'),
            allowNull: true,
        },
        profile_image_type: {
            type: Sequelize.STRING,
            allowNull: true,
        },
        // Social sign-in. A user may have a password (email/password signup),
        // an OAuth provider id, or both (a password user who later links
        // Google/Apple via the same verified email). auth_provider records the
        // method used to CREATE the account ('password' | 'google' | 'apple')
        // — purely informational; linking is keyed off google_id / apple_id.
        auth_provider: {
            type: Sequelize.STRING,
            allowNull: true,
        },
        // Google's stable user id ('sub' claim from the verified ID token).
        google_id: {
            type: Sequelize.STRING,
            allowNull: true,
            unique: true,
        },
        // Apple's stable user id ('sub' claim from the verified identity token).
        apple_id: {
            type: Sequelize.STRING,
            allowNull: true,
            unique: true,
        },
        // Profile visibility. Public profiles (and their non-private posts) are
        // viewable by anyone in-app; private profiles are viewable by accepted
        // friends only. Defaults to public so the browse-profiles feature works
        // out of the box; users can switch to private from Profile settings.
        is_public: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
        // Admin/moderator flag. Admins can delete any post and remove accounts
        // (e.g. spam or leftover test data). Defaults to false — granted
        // explicitly (see migrations + scripts/grant-admin.js).
        is_admin: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        }
    }, {
        updatedAt: 'updated_at',
        createdAt: 'created_at'
    });
}