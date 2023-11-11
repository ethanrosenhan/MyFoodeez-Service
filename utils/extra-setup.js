const applyExtraSetup =  (sequelize)=> {

	const { user, post,audit } = sequelize.models;
	post.belongsTo(user, {foreignKey: 'user_id'});
	audit.belongsTo(user, {foreignKey: 'user_id'});
}
 
export { applyExtraSetup }