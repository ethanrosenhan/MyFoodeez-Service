import Sequelize from 'sequelize';
import sequelize, { models } from '../utils/database.js';

const Op = Sequelize.Op;

// Fully removes a user and every row tied to them, in a single transaction so
// a failure can't leave the account half-deleted. Used by both the admin
// "delete account" action and scripts/delete-user.js.
//
// What it removes:
//   - posts the user authored (+ their images, media, stars, menu links,
//     collaborator rows)
//   - rows the user created on OTHER people's posts (stars they gave,
//     collaborator "takes")
//   - their wishlist entries and device (push) tokens
//   - friendships on either side
//   - finally, the user row itself
//
// What it preserves:
//   - menu items they contributed (community data) — the creator reference is
//     nulled rather than deleted so the menu survives
//   - audit log rows (internal history)
//
// Returns a small summary of what was removed.
export const deleteUserAndAllData = async (userId) => {
    const id = Number(userId);
    if (!Number.isInteger(id) || id <= 0) {
        throw new Error('deleteUserAndAllData: invalid userId');
    }

    return sequelize.transaction(async (transaction) => {
        const authoredPosts = await models.post.findAll({
            attributes: ['id'],
            where: { user_id: id },
            transaction
        });
        const postIds = authoredPosts.map((p) => p.id);

        if (postIds.length > 0) {
            // Children of the user's own posts. Explicit deletes (rather than
            // relying on FK cascade) so this works regardless of how the DB
            // was provisioned.
            await models.post_image.destroy({ where: { post_id: { [Op.in]: postIds } }, transaction });
            await models.post_media.destroy({ where: { post_id: { [Op.in]: postIds } }, transaction });
            await models.post_star.destroy({ where: { post_id: { [Op.in]: postIds } }, transaction });
            await models.post_menu_item.destroy({ where: { post_id: { [Op.in]: postIds } }, transaction });
            await models.post_collaborator.destroy({ where: { post_id: { [Op.in]: postIds } }, transaction });
            // Wishlist entries elsewhere may point at these posts as their source.
            await models.user_place_intent.update(
                { source_post_id: null },
                { where: { source_post_id: { [Op.in]: postIds } }, transaction }
            );
        }

        // Rows the user created on other people's content.
        await models.post_star.destroy({ where: { user_id: id }, transaction });
        await models.post_collaborator.destroy({ where: { user_id: id }, transaction });
        await models.user_place_intent.destroy({ where: { user_id: id }, transaction });
        await models.device_token.destroy({ where: { user_id: id }, transaction });
        await models.friendship.destroy({
            where: { [Op.or]: [{ user_one_id: id }, { user_two_id: id }] },
            transaction
        });

        // Keep community menu contributions; just drop the creator link.
        await models.menu_item.update(
            { created_by_user_id: null },
            { where: { created_by_user_id: id }, transaction }
        );

        // Now the user's posts, then the user.
        await models.post.destroy({ where: { user_id: id }, transaction });
        const deletedUsers = await models.user.destroy({ where: { id }, transaction });

        return { user_id: id, posts_deleted: postIds.length, user_deleted: deletedUsers };
    });
};
