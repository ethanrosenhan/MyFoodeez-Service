const applyExtraSetup =  (sequelize)=> {

	const { user, post, audit, friendship, follow } = sequelize.models;
	post.belongsTo(user, {foreignKey: 'user_id'});
	audit.belongsTo(user, {foreignKey: 'user_id'});
	friendship.belongsTo(user, { foreignKey: 'requester_user_id', as: 'requester' });
	friendship.belongsTo(user, { foreignKey: 'addressee_user_id', as: 'addressee' });
	follow.belongsTo(user, { foreignKey: 'follower_user_id', as: 'follower' });
	follow.belongsTo(user, { foreignKey: 'followed_user_id', as: 'followed' });
}
 
export { applyExtraSetup }
