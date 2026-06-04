import express from 'express';
import sequelize from './utils/database.js';
import router from './routes/routes.js';
import cors from 'cors';
import ConsoleStamp from 'console-stamp';
import { getOptionalEnv, validateEnvironment } from './utils/env.js';
import { sendError } from './lib/response-helper.js';
import { runStartupMigrations } from './lib/migrations.js';
import { runScheduledSweeps } from './lib/notifications.js';

const SCHEDULED_SWEEP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

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

    // Notification sweeps. setInterval is sufficient because (a) we only run
    // one Render instance today, so duplicate sends aren't a concern, and
    // (b) each sweep self-gates via the audit table — so even if a future
    // multi-instance setup fired multiple sweeps for the same window, only
    // one would actually send.
    //
    // First run after 5 minutes — gives the process time to fully warm up
    // and avoids racing the sync()/migrations on a fresh boot.
    setTimeout(() => {
        runScheduledSweeps();
        setInterval(runScheduledSweeps, SCHEDULED_SWEEP_INTERVAL_MS);
    }, 5 * 60 * 1000);
});
