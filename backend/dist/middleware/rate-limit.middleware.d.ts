/**
 * In-memory rate limiting middleware.
 * Tidak memerlukan package tambahan — cocok untuk single-instance deployment.
 * Untuk multi-instance, ganti dengan Redis-backed rate limiter.
 */
import { Request, Response, NextFunction } from 'express';
export declare function createRateLimiter(opts: {
    windowMs: number;
    max: number;
    message: string;
    skipOnSuccess?: boolean;
}): (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
/** Rate limiter khusus endpoint login: 5 percobaan / 15 menit per IP. */
export declare const loginRateLimiter: (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
/** Rate limiter umum untuk API: 200 request / menit per IP. */
export declare const apiRateLimiter: (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
//# sourceMappingURL=rate-limit.middleware.d.ts.map