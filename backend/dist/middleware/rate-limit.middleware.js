"use strict";
/**
 * In-memory rate limiting middleware.
 * Tidak memerlukan package tambahan — cocok untuk single-instance deployment.
 * Untuk multi-instance, ganti dengan Redis-backed rate limiter.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiRateLimiter = exports.loginRateLimiter = void 0;
exports.createRateLimiter = createRateLimiter;
function createRateLimiter(opts) {
    const store = new Map();
    // Bersihkan entry lama setiap 5 menit agar tidak memory leak
    setInterval(() => {
        const now = Date.now();
        for (const [key, record] of store.entries()) {
            if (now > record.resetAt)
                store.delete(key);
        }
    }, 5 * 60000);
    return function rateLimitMiddleware(req, res, next) {
        const key = req.ip ?? 'unknown';
        const now = Date.now();
        const record = store.get(key);
        if (record && now < record.resetAt) {
            if (record.count >= opts.max) {
                const retryAfterSec = Math.ceil((record.resetAt - now) / 1000);
                res.setHeader('Retry-After', String(retryAfterSec));
                res.setHeader('X-RateLimit-Limit', String(opts.max));
                res.setHeader('X-RateLimit-Remaining', '0');
                res.setHeader('X-RateLimit-Reset', String(Math.ceil(record.resetAt / 1000)));
                return res.status(429).json({ success: false, message: opts.message });
            }
            record.count += 1;
            res.setHeader('X-RateLimit-Remaining', String(opts.max - record.count));
        }
        else {
            store.set(key, { count: 1, resetAt: now + opts.windowMs });
            res.setHeader('X-RateLimit-Remaining', String(opts.max - 1));
        }
        res.setHeader('X-RateLimit-Limit', String(opts.max));
        next();
    };
}
/** Rate limiter khusus endpoint login: 5 percobaan / 15 menit per IP. */
exports.loginRateLimiter = createRateLimiter({
    windowMs: 15 * 60000,
    max: 5,
    message: 'Terlalu banyak percobaan login. Silakan coba lagi dalam 15 menit.',
});
/** Rate limiter umum untuk API: 200 request / menit per IP. */
exports.apiRateLimiter = createRateLimiter({
    windowMs: 60000,
    max: 200,
    message: 'Terlalu banyak permintaan. Silakan coba lagi dalam 1 menit.',
});
//# sourceMappingURL=rate-limit.middleware.js.map