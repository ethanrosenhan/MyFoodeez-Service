import express from 'express';
import sequelize from './utils/database.js';
import router from './routes/routes.js';
import cors from 'cors';
import ConsoleStamp from 'console-stamp';
import { getOptionalEnv, validateEnvironment } from './utils/env.js';
import { sendError } from './lib/response-helper.js';
import { runStartupMigrations } from './lib/migrations.js';

validateEnvironment();

ConsoleStamp(console);

const PORT = process.env.PORT || 5000;
const app = express();
const corsOrigin = getOptionalEnv('CORS_ORIGIN');

app.use(cors({ origin: corsOrigin === '*' ? true : corsOrigin.split(',').map((origin) => origin.trim()) }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '12mb' }));

app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
});

app.use(router);

app.use((error, req, res, next) => {
    console.error('Unhandled service error', error);
    return sendError(res, 500, 'Internal server error');
});

app.listen(PORT, async () => {
    await sequelize.sync({ logging: false });
    await runStartupMigrations();
    console.log(`Listening on ${PORT}`);
});
