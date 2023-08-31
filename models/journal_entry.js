import { Sequelize }  from 'sequelize';

export default (sequelize) => {
    sequelize.define('journal_entry', {
        id: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            allowNull: false,
            primaryKey: true
        },
        place: {
            type: Sequelize.STRING,
            allowNull: false
        },
        entry_date: {
            type: Sequelize.DATE,
            allowNull: false
        },
        cuisine: {
            type: Sequelize.STRING,
            allowNull: false
        },
        is_private: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false
        }
    }, {
        updatedAt: 'updated_at',
        createdAt: 'created_at'
    });
}
