const applyExtraSetup =  (sequelize)=> {

	const { user, post, post_image, audit, friendship } = sequelize.models;
	post.belongsTo(user, {foreignKey: 'user_id'});
	post.hasMany(post_image, { foreignKey: 'post_id', onDelete: 'CASCADE' });
	post_image.belongsTo(post, { foreignKey: 'post_id' });
	audit.belongsTo(user, {foreignKey: 'user_id'});
	friendship.belongsTo(user, { foreignKey: 'requester_user_id', as: 'requester' });
	friendship.belongsTo(user, { foreignKey: 'addressee_user_id', as: 'addressee' });
}
 
export { applyExtraSetup }
