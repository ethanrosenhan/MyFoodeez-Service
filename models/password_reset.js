import { Sequelize } from 'sequelize';

export default (sequelize) => {
    sequelize.define('password_reset', {
        id: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            allowNull: false,
            primaryKey: true,
        },
        code: {
            type: Sequelize.STRING,
            allowNull: false,
            unique: true
        },
        code_expires_at: {
            type: Sequelize.DATE,
            allowNull: false
        },
        email: {
            type: Sequelize.STRING,
            allowNull: false,
        }
    }, {
        updatedAt: 'updated_at',
        createdAt: 'created_at'
    });
}