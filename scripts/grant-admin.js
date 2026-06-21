// Grant (or revoke) admin/moderator rights on an account.
//
// Usage (run from the MyFoodeez-Service folder):
//   Grant:   node -r dotenv/config scripts/grant-admin.js "someone@example.com"
//   Revoke:  node -r dotenv/config scripts/grant-admin.js "someone@example.com" --revoke
//
// The owner account is already granted admin automatically by the startup
// migration; this is for adding more moderators later without a code change.
import Sequelize from 'sequelize';
import sequelize, { models } from '../utils/database.js';

const args = process.argv.slice(2);
const revoke = args.includes('--revoke');
const email = args.find((a) => a !== '--revoke');

const run = async () => {
    if (!email || !email.includes('@')) {
        console.error('Provide an email. e.g. node -r dotenv/config scripts/grant-admin.js "someone@example.com"');
        process.exitCode = 1;
        return;
    }

    const user = await models.user.findOne({
        attributes: ['id', 'first_name', 'last_name', 'email', 'is_admin'],
        where: Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('email')), email.toLowerCase())
    });
    if (!user) {
        console.log(`No account found for ${email}.`);
        return;
    }

    await models.user.update({ is_admin: !revoke }, { where: { id: user.id } });
    const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || '(no name)';
    console.log(`${revoke ? 'Revoked admin from' : 'Granted admin to'} #${user.id} ${name} <${user.email}>.`);
};

run()
    .catch((error) => {
        console.error('grant-admin failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await sequelize.close();
    });
