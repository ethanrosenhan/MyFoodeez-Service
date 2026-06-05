// One-off, read-only schema check for the menu feature.
// Run from foodeez-service:  node -r dotenv/config scripts/check-menu-schema.js
// Safe to delete after verifying. Does not modify any data.
import sequelize from '../utils/database.js';

const run = async () => {
    const [menuCols] = await sequelize.query(
        `SELECT column_name, data_type
         FROM information_schema.columns
         WHERE table_name = 'menu_items'
         ORDER BY ordinal_position`
    );
    const [postCol] = await sequelize.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_name = 'posts' AND column_name = 'menu_item_id'`
    );
    const [migrations] = await sequelize.query(
        `SELECT event_type FROM audits
         WHERE event_type LIKE 'migration:add_menu_item%'
         ORDER BY event_type`
    );

    console.log(`\nmenu_items table: ${menuCols.length > 0 ? 'EXISTS' : 'MISSING'} (${menuCols.length} columns)`);
    console.table(menuCols);
    console.log(`posts.menu_item_id column: ${postCol.length > 0 ? 'PRESENT' : 'MISSING'}`);
    console.log('menu migrations recorded:', migrations.map((m) => m.event_type));

    await sequelize.close();
};

run().catch((error) => {
    console.error('schema check failed:', error.message);
    process.exit(1);
});
