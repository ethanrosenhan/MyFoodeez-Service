const applyExtraSetup =  (sequelize)=> {

	const { user, journal_post,audit } = sequelize.models;
	journal_post.belongsTo(user, {foreignKey: 'user_id'});
	audit.belongsTo(user, {foreignKey: 'user_id'});
}
 
export { applyExtraSetup }