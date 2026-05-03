/**
 * Input validation helpers — digunakan di controller untuk sanitasi & validasi query params.
 */
export declare const PASSWORD_MIN_LENGTH = 12;
/**
 * Validasi kekuatan password.
 * Syarat: min 12 karakter, huruf besar, huruf kecil, angka, karakter spesial.
 */
export declare function validatePasswordStrength(password: string): {
    valid: boolean;
    message: string;
};
/** Clamp number ke range [min, max]. */
export declare function clamp(value: number, min: number, max: number): number;
/** Sanitasi angka pagination: page >= 1, limit dalam [1, 100]. */
export declare function parsePagination(pageStr: unknown, limitStr: unknown, maxLimit?: number): {
    page: number;
    limit: number;
    offset: number;
};
/** Validate nilai query string terhadap daftar nilai yang diizinkan. */
export declare function parseEnum<T extends string>(value: unknown, allowed: readonly T[]): T | undefined;
/** Cek magic bytes Excel (xlsx: PK zip header). */
export declare function isValidExcelBuffer(buffer: Buffer): boolean;
/**
 * Parse cookie string (dari req.headers.cookie) tanpa cookie-parser.
 */
export declare function parseCookieHeader(cookieHeader: string | undefined): Record<string, string>;
//# sourceMappingURL=validation.d.ts.map