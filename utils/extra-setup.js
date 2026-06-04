const applyExtraSetup =  (sequelize)=> {

	const { user, post, post_image, post_star, audit, friendship, user_place_intent, device_token } = sequelize.models;
	post.belongsTo(user, {foreignKey: 'user_id'});
	post.hasMany(post_image, { foreignKey: 'post_id', onDelete: 'CASCADE' });
	post.hasMany(post_star, { foreignKey: 'post_id', onDelete: 'CASCADE' });
	post_image.belongsTo(post, { foreignKey: 'post_id' });
	post_star.belongsTo(post, { foreignKey: 'post_id' });
	post_star.belongsTo(user, { foreignKey: 'user_id' });
	user_place_intent.belongsTo(user, { foreignKey: 'user_id' });
	device_token.belongsTo(user, { foreignKey: 'user_id' });
	audit.belongsTo(user, {foreignKey: 'user_id'});
	friendship.belongsTo(user, { foreignKey: 'requester_user_id', as: 'requester' });
	friendship.belongsTo(user, { foreignKey: 'addressee_user_id', as: 'addressee' });
}
 
export { applyExtraSetup }
