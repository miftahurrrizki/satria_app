/**
 * Input validation helpers — digunakan di controller untuk sanitasi & validasi query params.
 */

export const PASSWORD_MIN_LENGTH = 12;

/**
 * Validasi kekuatan password.
 * Syarat: min 12 karakter, huruf besar, huruf kecil, angka, karakter spesial.
 */
export function validatePasswordStrength(password: string): { valid: boolean; message: string } {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { valid: false, message: `Password minimal ${PASSWORD_MIN_LENGTH} karakter.` };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password harus mengandung minimal 1 huruf kapital.' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password harus mengandung minimal 1 huruf kecil.' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password harus mengandung minimal 1 angka.' };
  }
  if (!/[!@#$%^&*()\-_=+\[\]{};':",.<>/?\\|`~]/.test(password)) {
    return { valid: false, message: 'Password harus mengandung minimal 1 karakter spesial (!@#$%...).' };
  }
  return { valid: true, message: '' };
}

/** Clamp number ke range [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Sanitasi angka pagination: page >= 1, limit dalam [1, 100]. */
export function parsePagination(
  pageStr: unknown,
  limitStr: unknown,
  maxLimit = 100,
): { page: number; limit: number; offset: number } {
  const page  = Math.max(1, parseInt(String(pageStr ?? '1'),  10) || 1);
  const limit = clamp(parseInt(String(limitStr ?? '20'), 10) || 20, 1, maxLimit);
  return { page, limit, offset: (page - 1) * limit };
}

/** Validate nilai query string terhadap daftar nilai yang diizinkan. */
export function parseEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | undefined {
  if (!value) return undefined;
  const str = String(value);
  return (allowed as readonly string[]).includes(str) ? (str as T) : undefined;
}

/** Cek magic bytes Excel (xlsx: PK zip header). */
export function isValidExcelBuffer(buffer: Buffer): boolean {
  // XLSX adalah ZIP file, dimulai dengan PK (0x50 0x4B)
  if (buffer.length < 4) return false;
  return buffer[0] === 0x50 && buffer[1] === 0x4B;
}

/**
 * Parse cookie string (dari req.headers.cookie) tanpa cookie-parser.
 */
export function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const pair of cookieHeader.split(';')) {
    const idx = pair.indexOf('=');
    if (idx < 1) continue;
    const name  = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (name) result[name] = decodeURIComponent(value);
  }
  return result;
}
