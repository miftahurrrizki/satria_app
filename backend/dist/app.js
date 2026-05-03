"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const database_1 = require("./config/database");
const routes_1 = __importDefault(require("./routes"));
const logger_1 = __importDefault(require("./utils/logger"));
const morgan_middleware_1 = __importDefault(require("./middleware/morgan.middleware"));
const notifications_1 = require("./utils/notifications");
const rate_limit_middleware_1 = require("./middleware/rate-limit.middleware");
dotenv_1.default.config();
// ── Validate required env vars ────────────────────────────────
const REQUIRED_ENV = ['JWT_SECRET'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
    console.error(`[STARTUP] Missing required env vars: ${missing.join(', ')}`);
    process.exit(1);
}
if (process.env.JWT_SECRET === 'satria_secret_key_change_in_production') {
    console.error('[STARTUP] JWT_SECRET menggunakan nilai default! Ganti sebelum deploy production.');
    if (process.env.NODE_ENV === 'production')
        process.exit(1);
}
if (process.env.NODE_ENV === 'production') {
    const PROD_REQUIRED = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'CORS_ORIGIN'];
    const prodMissing = PROD_REQUIRED.filter((k) => !process.env[k]);
    if (prodMissing.length > 0) {
        console.error(`[STARTUP] Missing production env vars: ${prodMissing.join(', ')}`);
        process.exit(1);
    }
}
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
// ── Global error handlers (prevent process crash) ─────────────
process.on('uncaughtException', (err) => {
    logger_1.default.error('[PROCESS] Uncaught exception:', { message: err.message, stack: err.stack });
    // Beri waktu logger flush sebelum exit
    setTimeout(() => process.exit(1), 1000);
});
process.on('unhandledRejection', (reason) => {
    logger_1.default.error('[PROCESS] Unhandled rejection:', { reason });
});
// ── CORS ─────────────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',').map((o) => o.trim());
app.use((0, cors_1.default)({
    origin: (origin, cb) => {
        // Null origin = request dari server-to-server (Vite proxy, curl, Postman, dll).
        // Di production tetap ditolak untuk mencegah cross-site attack.
        // Di development diizinkan agar Vite dev proxy bisa meneruskan request.
        if (!origin) {
            if (process.env.NODE_ENV === 'production') {
                return cb(new Error('CORS: null origin ditolak.'));
            }
            return cb(null, true);
        }
        if (allowedOrigins.includes(origin))
            return cb(null, true);
        cb(new Error(`CORS: origin ${origin} tidak diizinkan.`));
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));
// ── Body parsers (limit ketat untuk cegah DoS) ───────────────
app.use(express_1.default.json({ limit: '1mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '1mb' }));
// ── HTTP Request Logging ──────────────────────────────────────
app.use(morgan_middleware_1.default);
// ── General API rate limiter ──────────────────────────────────
app.use('/api', rate_limit_middleware_1.apiRateLimiter);
// ── Static uploads (PDF CEO Letter, dll) ─────────────────────
app.use('/uploads', express_1.default.static(path_1.default.resolve(process.cwd(), 'uploads')));
// ── Routes ───────────────────────────────────────────────────
app.use('/api', routes_1.default);
// ── Health check ─────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', app: 'SATRIA API', time: new Date() }));
// ── 404 handler ───────────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan.' });
});
// ── Centralized error handler ─────────────────────────────────
app.use((err, _req, res, _next) => {
    // CORS error: kembalikan 403, bukan 500 (bukan server error)
    if (err.message?.startsWith('CORS:')) {
        return res.status(403).json({ success: false, message: err.message });
    }
    logger_1.default.error(`[Unhandled Error] ${err.message}`, { stack: err.stack });
    // Jangan ekspos detail error ke client di production
    const message = process.env.NODE_ENV === 'production'
        ? 'Terjadi kesalahan server.'
        : err.message;
    return res.status(500).json({ success: false, message });
});
// ── Start ─────────────────────────────────────────────────────
database_1.pool.connect()
    .then(client => {
    client.release();
    logger_1.default.info('✅ Database connected successfully');
    app.listen(PORT, () => {
        logger_1.default.info(`🚀 SATRIA API running on http://localhost:${PORT}`);
        logger_1.default.debug(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
    // ── Scheduler: scan deadline notifications ───────────────────
    // Jalankan segera 10 detik setelah startup, lalu ulangi setiap 6 jam.
    const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
    setTimeout(() => {
        (0, notifications_1.scanDeadlineNotifications)()
            .then((s) => logger_1.default.info('[SCHEDULER] initial deadline scan done', s))
            .catch((e) => logger_1.default.error(`[SCHEDULER] initial scan failed: ${e.message}`));
    }, 10000);
    setInterval(() => {
        (0, notifications_1.scanDeadlineNotifications)()
            .then((s) => logger_1.default.info('[SCHEDULER] periodic deadline scan done', s))
            .catch((e) => logger_1.default.error(`[SCHEDULER] periodic scan failed: ${e.message}`));
    }, SIX_HOURS_MS);
})
    .catch(err => {
    logger_1.default.error(`❌ Database connection failed: ${err.message}`, { stack: err.stack });
    process.exit(1);
});
exports.default = app;
//# sourceMappingURL=app.js.map