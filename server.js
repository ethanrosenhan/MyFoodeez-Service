import express from 'express';
// import sequelize from './utils/database.js';
import router from './routes/routes.js';
import cors from 'cors';

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
// sequelize.sync({ logging: false });

app.listen(PORT, async () => {
    console.log(`Listening on ${ PORT }`)
    //Local development setup a localtunnel
    // if (process.env.NODE_ENV === "development") {
    //     console.log("configuring local tunnel for sub-domain", process.env.LOCALTUNNEL_SUBDOMAIN);
    //     setTimeout(async function() {
    //         const tunnel = await localtunnel({ port: PORT, subdomain: process.env.LOCALTUNNEL_SUBDOMAIN });
    //         console.log('your url is:', tunnel.url);
    //     }, 2000);
    // };
});


