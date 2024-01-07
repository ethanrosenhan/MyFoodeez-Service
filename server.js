import express from 'express';
import sequelize from './utils/database.js';
import router from './routes/routes.js';
import cors from 'cors';
import ConsoleStamp from 'console-stamp';
ConsoleStamp(console);
const PORT = process.env.PORT || 5000

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: true }));
//app.use(express.json());
app.use((req, res, next) => {
    next();
});

app.use(router);

//sequelize.sync({ logging: console.log });
sequelize.sync({ logging: false });

app.listen(PORT, async () => {
    console.log(`Listening on ${ PORT }`)
    console.log ("yo");

});