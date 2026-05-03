"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SESSION_COOKIE = void 0;
exports.authenticate = authenticate;
exports.requireRole = requireRole;
exports.generateToken = generateToken;
exports.setSessionCookie = setSessionCookie;
exports.clearSessionCookie = clearSessionCookie;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const validation_1 = require("../utils/validation");
// Fail-fast: JWT_SECRET WAJIB di-set (sudah divalidasi di app.ts startup)
const JWT_SECRET = process.env.JWT_SECRET ?? 'satria_secret_key_change_in_production';
/** Nama cookie yang digunakan untuk sesi autentikasi. */
exports.SESSION_COOKIE = 'satria_session';
/**
 * Middleware autentikasi.
 * Mendukung dua mekanisme:
 *  1. httpOnly Cookie `satria_session` (preferred — lebih aman dari XSS)
 *  2. Authorization: Bearer <token>   (backward-compat untuk API client non-browser)
 */
function authenticate(req, res, next) {
    // 1. Coba baca dari cookie (httpOnly, tidak bisa diakses JS)
    const cookies = (0, validation_1.parseCookieHeader)(req.headers.cookie);
    const cookieToken = cookies[exports.SESSION_COOKIE];
    // 2. Fallback ke Authorization header (untuk API client / mobile)
    const bearerToken = req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.split(' ')[1]
        : undefined;
    const token = cookieToken ?? bearerToken;
    if (!token) {
        return res.status(401).json({ success: false, message: 'Sesi tidak ditemukan. Silakan login kembali.' });
    }
    try {
        req.user = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        next();
    }
    catch (err) {
        const isExpired = err.name === 'TokenExpiredError';
        return res.status(401).json({
            success: false,
            code: isExpired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
            message: isExpired
                ? 'Sesi telah kedaluwarsa. Silakan login kembali.'
                : 'Token tidak valid. Silakan login kembali.',
        });
    }
}
/**
 * Middleware otorisasi berbasis role.
 * Gunakan setelah `authenticate`.
 */
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Tidak terautentikasi.' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'Akses ditolak. Anda tidak memiliki izin untuk melakukan tindakan ini.',
            });
        }
        next();
    };
}
/** Generate JWT dan set sebagai httpOnly cookie pada response. */
function generateToken(payload) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return jsonwebtoken_1.default.sign(payload, JWT_SECRET, { expiresIn: (process.env.JWT_EXPIRES_IN || '24h') });
}
/** Set session cookie httpOnly pada response. */
function setSessionCookie(res, token) {
    const maxAgeMs = parseJwtExpiresIn(process.env.JWT_EXPIRES_IN ?? '24h');
    res.cookie(exports.SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: maxAgeMs,
        path: '/',
    });
}
/** Hapus session cookie (logout). */
function clearSessionCookie(res) {
    res.clearCookie(exports.SESSION_COOKIE, { httpOnly: true, path: '/' });
}
/** Parse JWT expiresIn string ke milliseconds. */
function parseJwtExpiresIn(expiresIn) {
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match)
        return 24 * 60 * 60 * 1000;
    const val = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers = {
        s: 1000, m: 60000, h: 3600000, d: 86400000,
    };
    return val * (multipliers[unit] ?? 3600000);
}
//# sourceMappingURL=auth.middleware.js.map