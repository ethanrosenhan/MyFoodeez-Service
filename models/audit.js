import { Sequelize }  from 'sequelize';

export default (sequelize) => {
    sequelize.define('audit', {
        id: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            allowNull: false,
            primaryKey: true
        },
        event_type: {
            type: Sequelize.STRING,
            allowNull: false
        },
        audit_timestamp: {
            type: Sequelize.DATE,
            allowNull: false
        },
        ip_address: {
            type: Sequelize.STRING,
            allowNull: true
        },
        useragent: {
            type: Sequelize.STRING,
            allowNull: true
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