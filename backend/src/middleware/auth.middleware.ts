import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JwtPayload, UserRole } from '../types';
import { parseCookieHeader } from '../utils/validation';

// Fail-fast: JWT_SECRET WAJIB di-set (sudah divalidasi di app.ts startup)
const JWT_SECRET = process.env.JWT_SECRET ?? 'satria_secret_key_change_in_production';

/** Nama cookie yang digunakan untuk sesi autentikasi. */
export const SESSION_COOKIE = 'satria_session';

/**
 * Middleware autentikasi.
 * Mendukung dua mekanisme:
 *  1. httpOnly Cookie `satria_session` (preferred — lebih aman dari XSS)
 *  2. Authorization: Bearer <token>   (backward-compat untuk API client non-browser)
 */
export function authenticate(req: Request, res: Response, next: NextFunction) {
  // 1. Coba baca dari cookie (httpOnly, tidak bisa diakses JS)
  const cookies    = parseCookieHeader(req.headers.cookie);
  const cookieToken = cookies[SESSION_COOKIE];

  // 2. Fallback ke Authorization header (untuk API client / mobile)
  const bearerToken = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.split(' ')[1]
    : undefined;

  const token = cookieToken ?? bearerToken;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Sesi tidak ditemukan. Silakan login kembali.' });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET) as JwtPayload;
    next();
  } catch (err) {
    const isExpired = (err as Error).name === 'TokenExpiredError';
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
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
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
export function generateToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jwt.sign(payload, JWT_SECRET, { expiresIn: (process.env.JWT_EXPIRES_IN || '24h') } as any);
}

/** Set session cookie httpOnly pada response. */
export function setSessionCookie(res: Response, token: string): void {
  const maxAgeMs = parseJwtExpiresIn(process.env.JWT_EXPIRES_IN ?? '24h');
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   maxAgeMs,
    path:     '/',
  });
}

/** Hapus session cookie (logout). */
export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, path: '/' });
}

/** Parse JWT expiresIn string ke milliseconds. */
function parseJwtExpiresIn(expiresIn: string): number {
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) return 24 * 60 * 60 * 1000;
  const val  = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000,
  };
  return val * (multipliers[unit] ?? 3_600_000);
}
