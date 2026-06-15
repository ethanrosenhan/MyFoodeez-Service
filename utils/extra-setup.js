const applyExtraSetup =  (sequelize)=> {

	const { user, post, post_image, post_star, audit, friendship, user_place_intent, device_token, menu_item, post_menu_item, post_collaborator, post_media } = sequelize.models;
	post.belongsTo(user, {foreignKey: 'user_id'});
	post.hasMany(post_image, { foreignKey: 'post_id', onDelete: 'CASCADE' });
	// Video (and future large media) stored in object storage; rows hold URLs.
	post.hasMany(post_media, { foreignKey: 'post_id', onDelete: 'CASCADE' });
	post_media.belongsTo(post, { foreignKey: 'post_id' });
	post.hasMany(post_star, { foreignKey: 'post_id', onDelete: 'CASCADE' });
	post_image.belongsTo(post, { foreignKey: 'post_id' });
	post_star.belongsTo(post, { foreignKey: 'post_id' });
	post_star.belongsTo(user, { foreignKey: 'user_id' });
	user_place_intent.belongsTo(user, { foreignKey: 'user_id' });
	user_place_intent.belongsTo(post, { foreignKey: 'source_post_id', as: 'source_post' });
	device_token.belongsTo(user, { foreignKey: 'user_id' });
	// Menus key off Google Places place_id (no restaurant table). A post may
	// optionally link to a structured menu_item; menu_item tracks who seeded it.
	menu_item.belongsTo(user, { foreignKey: 'created_by_user_id', as: 'creator' });
	post.belongsTo(menu_item, { foreignKey: 'menu_item_id' });
	// A post can reference multiple ordered dishes via the join table. The
	// legacy post.menu_item_id (above) stays in sync with the first item.
	post.hasMany(post_menu_item, { foreignKey: 'post_id', onDelete: 'CASCADE' });
	post_menu_item.belongsTo(post, { foreignKey: 'post_id' });
	post_menu_item.belongsTo(menu_item, { foreignKey: 'menu_item_id' });
	// Collab posts: a post can tag several collaborators, each with their own
	// rating/notes. Each collaborator row points at the tagged user.
	post.hasMany(post_collaborator, { foreignKey: 'post_id', onDelete: 'CASCADE' });
	post_collaborator.belongsTo(post, { foreignKey: 'post_id' });
	post_collaborator.belongsTo(user, { foreignKey: 'user_id' });
	audit.belongsTo(user, {foreignKey: 'user_id'});
	friendship.belongsTo(user, { foreignKey: 'requester_user_id', as: 'requester' });
	friendship.belongsTo(user, { foreignKey: 'addressee_user_id', as: 'addressee' });
}
 
export { applyExtraSetup }
