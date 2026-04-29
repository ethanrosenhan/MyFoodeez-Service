const applyExtraSetup =  (sequelize)=> {

	const { user, post, audit, friendship } = sequelize.models;
	post.belongsTo(user, {foreignKey: 'user_id'});
	audit.belongsTo(user, {foreignKey: 'user_id'});
	friendship.belongsTo(user, { foreignKey: 'requester_user_id', as: 'requester' });
	friendship.belongsTo(user, { foreignKey: 'addressee_user_id', as: 'addressee' });
}
 
export { applyExtraSetup }
