const applyExtraSetup =  (sequelize)=> {

	const { user, post, post_image, post_star, audit, friendship, user_place_intent, device_token, menu_item } = sequelize.models;
	post.belongsTo(user, {foreignKey: 'user_id'});
	post.hasMany(post_image, { foreignKey: 'post_id', onDelete: 'CASCADE' });
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
	audit.belongsTo(user, {foreignKey: 'user_id'});
	friendship.belongsTo(user, { foreignKey: 'requester_user_id', as: 'requester' });
	friendship.belongsTo(user, { foreignKey: 'addressee_user_id', as: 'addressee' });
}
 
export { applyExtraSetup }
