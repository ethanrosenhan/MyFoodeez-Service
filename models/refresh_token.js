import { Sequelize }  from 'sequelize';
 
export default (sequelize) => {
    sequelize.define('refresh_token', {
        id: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            allowNull: false,
            primaryKey: true
        },
        token: {
            type: Sequelize.STRING(3000),
            allowNull: false,
            unique: true
        },
        data: {
            type: Sequelize.JSONB,
            allowNull: false
        }
    }, {
        updatedAt: 'updated_at',
        createdAt: 'created_at'
    });
}