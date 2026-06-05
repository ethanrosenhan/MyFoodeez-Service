import { Sequelize } from 'sequelize';
import post from '../models/post.js'
import post_image from '../models/post_image.js'
import post_star from '../models/post_star.js'
import user from '../models/user.js'
import audit from '../models/audit.js'
import signup from '../models/signup.js'
import refresh_token from '../models/refresh_token.js'
import password_reset from '../models/password_reset.js'
import friendship from '../models/friendship.js'
import user_place_intent from '../models/user_place_intent.js'
import device_token from '../models/device_token.js'
import menu_item from '../models/menu_item.js'
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
	post,
    post_image,
    post_star,
    user,
    audit,
    signup,
    refresh_token,
    password_reset,
    friendship,
    user_place_intent,
    device_token,
    menu_item
];

for (const modelDefiner of modelDefiners) {
	modelDefiner(sequelize);
}

// Extra setup for associations or other setup
applyExtraSetup(sequelize);

export const {models} = sequelize;
export default sequelize;
