// One-off account deletion (e.g. leftover test accounts like Jon Pace's).
//
// Usage (run from the MyFoodeez-Service folder):
//   Dry run by email:   node -r dotenv/config scripts/delete-user.js "jon@example.com"
//   Dry run by name:    node -r dotenv/config scripts/delete-user.js "Jon Pace"
//   Actually delete:    node -r dotenv/config scripts/delete-user.js "jon@example.com" --confirm
//
// Without --confirm it only PRINTS what it would remove (a dry run). It will
// refuse to delete when a name matches more than one account — re-run with the
// exact email of the one you mean.
import Sequelize from 'sequelize';
import sequelize, { models } from '../utils/database.js';
import { deleteUserAndAllData } from '../lib/user-cleanup.js';

const Op = Sequelize.Op;

const args = process.argv.slice(2);
const confirm = args.includes('--confirm');
const term = args.find((a) => a !== '--confirm');

const describe = (u) => `#${u.id}  ${[u.first_name, u.last_name].filter(Boolean).join(' ') || '(no name)'}  <${u.email}>`;

const run = async () => {
    if (!term) {
        console.error('Provide an email or name. e.g. node -r dotenv/config scripts/delete-user.js "Jon Pace"');
        process.exitCode = 1;
        return;
    }

    let matches;
    if (term.includes('@')) {
        matches = await models.user.findAll({
            attributes: ['id', 'first_name', 'last_name', 'email'],
            where: Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('email')), term.toLowerCase())
        });
    } else {
        matches = await models.user.findAll({
            attributes: ['id', 'first_name', 'last_name', 'email'],
            where: {
                [Op.or]: [
                    { first_name: { [Op.iLike]: `%${term}%` } },
                    { last_name: { [Op.iLike]: `%${term}%` } },
                    Sequelize.where(
                        Sequelize.fn('concat', Sequelize.col('first_name'), ' ', Sequelize.col('last_name')),
                        { [Op.iLike]: `%${term}%` }
                    )
                ]
            }
        });
    }

    if (matches.length === 0) {
        console.log(`No accounts matched "${term}".`);
        return;
    }

    console.log(`Matched ${matches.length} account(s):`);
    for (const u of matches) {
        const postCount = await models.post.count({ where: { user_id: u.id } });
        console.log(`  ${describe(u)}  — ${postCount} post(s)`);
    }

    if (!confirm) {
        console.log('\nDry run only. Re-run with --confirm to delete. (If multiple matched, use the exact email.)');
        return;
    }

    if (matches.length > 1) {
        console.error('\nRefusing to delete: more than one account matched. Re-run with the exact email.');
        process.exitCode = 1;
        return;
    }

    const target = matches[0];
    console.log(`\nDeleting ${describe(target)} ...`);
    const summary = await deleteUserAndAllData(target.id);
    console.log('Done:', summary);
};

run()
    .catch((error) => {
        console.error('delete-user failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await sequelize.close();
    });
