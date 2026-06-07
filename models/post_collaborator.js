import { Sequelize } from 'sequelize';

// Collaborators on a post ("collab post" — like Instagram's). The author tags
// friends they ate with; the post then surfaces on each collaborator's profile
// and feed (auto-show model). Each collaborator keeps their OWN rating + notes
// since people disagree, and can remove themselves (status 'removed').
export default (sequelize) => {
    sequelize.define('post_collaborator', {
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
        // The tagged collaborator (a user.id).
        user_id: {
            type: Sequelize.INTEGER,
            allowNull: false
        },
        // 'active' (shown on their profile) | 'removed' (untagged by author or
        // self-removed). Soft so a personal rating isn't lost on a re-tag race.
        status: {
            type: Sequelize.STRING,
            allowNull: false,
            defaultValue: 'active'
        },
        // The collaborator's OWN rating (1-5). Stored as STRING to mirror
        // post.rating. Null until they add their take.
        rating: {
            type: Sequelize.STRING,
            allowNull: true
        },
        // The collaborator's OWN notes / opinion. Null until they add their take.
        comments: {
            type: Sequelize.TEXT,
            allowNull: true
        }
    }, {
        updatedAt: 'updated_at',
        createdAt: 'created_at',
        indexes: [
            { fields: ['post_id', 'user_id'], unique: true },
            { fields: ['post_id'] },
            { fields: ['user_id'] }
        ]
    });
};
