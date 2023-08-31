const applyExtraSetup =  (sequelize)=> {

	const { user, journal_entry,audit } = sequelize.models;
	journal_entry.belongsTo(user, {foreignKey: 'user_id'});
	audit.belongsTo(user, {foreignKey: 'user_id'});
}
 
export { applyExtraSetup }