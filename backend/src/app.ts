import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { pool } from './config/database';
import routes from './routes';
import logger from './utils/logger';
import morganMiddleware from './middleware/morgan.middleware';
import { scanDeadlineNotifications } from './utils/notifications';
import { apiRateLimiter } from './middleware/rate-limit.middleware';

dotenv.config();

// ── Validate required env vars ────────────────────────────────
const REQUIRED_ENV = ['JWT_SECRET'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`[STARTUP] Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}
if (process.env.JWT_SECRET === 'satria_secret_key_change_in_production') {
  console.error('[STARTUP] JWT_SECRET menggunakan nilai default! Ganti sebelum deploy production.');
  if (process.env.NODE_ENV === 'production') process.exit(1);
}
if (process.env.NODE_ENV === 'production') {
  const PROD_REQUIRED = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'CORS_ORIGIN'];
  const prodMissing = PROD_REQUIRED.filter((k) => !process.env[k]);
  if (prodMissing.length > 0) {
    console.error(`[STARTUP] Missing production env vars: ${prodMissing.join(', ')}`);
    process.exit(1);
  }
}

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Global error handlers (prevent process crash) ─────────────
process.on('uncaughtException', (err) => {
  logger.error('[PROCESS] Uncaught exception:', { message: err.message, stack: err.stack });
  // Beri waktu logger flush sebelum exit
  setTimeout(() => process.exit(1), 1000);
});
process.on('unhandledRejection', (reason) => {
  logger.error('[PROCESS] Unhandled rejection:', { reason });
});

// ── CORS ─────────────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',').map((o) => o.trim());

app.use(cors({
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
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} tidak diizinkan.`));
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

// ── Body parsers (limit ketat untuk cegah DoS) ───────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ── HTTP Request Logging ──────────────────────────────────────
app.use(morganMiddleware);

// ── General API rate limiter ──────────────────────────────────
app.use('/api', apiRateLimiter);

// ── Static uploads (PDF CEO Letter, dll) ─────────────────────
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

// ── Routes ───────────────────────────────────────────────────
app.use('/api', routes);

// ── Health check ─────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', app: 'SATRIA API', time: new Date() }));

// ── 404 handler ───────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan.' });
});

// ── Centralized error handler ─────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // CORS error: kembalikan 403, bukan 500 (bukan server error)
  if (err.message?.startsWith('CORS:')) {
    return res.status(403).json({ success: false, message: err.message });
  }
  logger.error(`[Unhandled Error] ${err.message}`, { stack: err.stack });
  // Jangan ekspos detail error ke client di production
  const message = process.env.NODE_ENV === 'production'
    ? 'Terjadi kesalahan server.'
    : err.message;
  return res.status(500).json({ success: false, message });
});

// ── Start ─────────────────────────────────────────────────────
pool.connect()
  .then(client => {
    client.release();
    logger.info('✅ Database connected successfully');
    app.listen(PORT, () => {
      logger.info(`🚀 SATRIA API running on http://localhost:${PORT}`);
      logger.debug(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    // ── Scheduler: scan deadline notifications ───────────────────
    // Jalankan segera 10 detik setelah startup, lalu ulangi setiap 6 jam.
    const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
    setTimeout(() => {
      scanDeadlineNotifications()
        .then((s) => logger.info('[SCHEDULER] initial deadline scan done', s))
        .catch((e) => logger.error(`[SCHEDULER] initial scan failed: ${e.message}`));
    }, 10_000);
    setInterval(() => {
      scanDeadlineNotifications()
        .then((s) => logger.info('[SCHEDULER] periodic deadline scan done', s))
        .catch((e) => logger.error(`[SCHEDULER] periodic scan failed: ${e.message}`));
    }, SIX_HOURS_MS);
  })
  .catch(err => {
    logger.error(`❌ Database connection failed: ${err.message}`, { stack: err.stack });
    process.exit(1);
  });

export default app;
