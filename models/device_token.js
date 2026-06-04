import { Sequelize } from 'sequelize';

// Expo push tokens for a user's devices. A user can have multiple tokens (one
// per device they sign in on). Tokens are deduped by the unique `token` index
// because Expo tokens are globally unique; the user_id column tracks the
// current owner so revoking on logout / re-login points the token at the
// right user.
//
// Trigger jobs (weekly digest, "friend posted at a place you've been") are
// intentionally NOT built yet — see the strategy plan. This file just lays
// the storage so we can ship the real triggers in a follow-up.
export default (sequelize) => {
    sequelize.define('device_token', {
        id: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            allowNull: false,
            primaryKey: true
        },
        user_id: {
            type: Sequelize.INTEGER,
            allowNull: false
        },
        token: {
            type: Sequelize.STRING,
            allowNull: false
        },
        platform: {
            type: Sequelize.STRING,
            allowNull: true // 'ios' | 'android' | 'web' — informational only
        }
    }, {
        updatedAt: 'updated_at',
        createdAt: 'created_at',
        indexes: [
            { unique: true, fields: ['token'] },
            { fields: ['user_id'] }
        ]
    });
};
