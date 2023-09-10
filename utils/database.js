import { Sequelize } from 'sequelize';
import journal_entry from '../models/journal_entry.js'
import user from '../models/user.js'
import audit from '../models/audit.js'
import signup from '../models/signup.js'
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
	journal_entry,
    user,
    audit,
    signup
];

for (const modelDefiner of modelDefiners) {
	modelDefiner(sequelize);
}

// Extra setup for associations or other setup
applyExtraSetup(sequelize);

export const {models} = sequelize;
export default sequelize;