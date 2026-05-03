import { Request, Response, NextFunction } from 'express';
import { JwtPayload, UserRole } from '../types';
/** Nama cookie yang digunakan untuk sesi autentikasi. */
export declare const SESSION_COOKIE = "satria_session";
/**
 * Middleware autentikasi.
 * Mendukung dua mekanisme:
 *  1. httpOnly Cookie `satria_session` (preferred — lebih aman dari XSS)
 *  2. Authorization: Bearer <token>   (backward-compat untuk API client non-browser)
 */
export declare function authenticate(req: Request, res: Response, next: NextFunction): Response<any, Record<string, any>> | undefined;
/**
 * Middleware otorisasi berbasis role.
 * Gunakan setelah `authenticate`.
 */
export declare function requireRole(...roles: UserRole[]): (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
/** Generate JWT dan set sebagai httpOnly cookie pada response. */
export declare function generateToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string;
/** Set session cookie httpOnly pada response. */
export declare function setSessionCookie(res: Response, token: string): void;
/** Hapus session cookie (logout). */
export declare function clearSessionCookie(res: Response): void;
//# sourceMappingURL=auth.middleware.d.ts.map