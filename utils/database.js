import { Sequelize } from 'sequelize';
import journal_post from '../models/journal_post.js'
import user from '../models/user.js'
import audit from '../models/audit.js'
import signup from '../models/signup.js'
import refresh_token from '../models/refresh_token.js'
import password_reset from '../models/password_reset.js'
import {applyExtraSetup} from './extra-setup.js';

let dboptions = {
    //logging: console.log,
    logging: false,     
    dialectOptions: {
        ssl: {
            require: true,
            rejectUnauthorized: false
        }
    }
};

//Able to disable ssl for localhost postgres instance
if (process.env.DATABASE_USE_SSL && process.env.DATABASE_USE_SSL === 'false') {
    dboptions.dialectOptions = null;
}
const sequelize = new Sequelize(process.env.DATABASE_URL, dboptions);
const modelDefiners = [
	journal_post,
    user,
    audit,
    signup,
    refresh_token,
    password_reset
];

for (const modelDefiner of modelDefiners) {
	modelDefiner(sequelize);
}

// Extra setup for associations or other setup
applyExtraSetup(sequelize);

export const {models} = sequelize;
export default sequelize;