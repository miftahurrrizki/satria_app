"use strict";
/**
 * Input validation helpers — digunakan di controller untuk sanitasi & validasi query params.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PASSWORD_MIN_LENGTH = void 0;
exports.validatePasswordStrength = validatePasswordStrength;
exports.clamp = clamp;
exports.parsePagination = parsePagination;
exports.parseEnum = parseEnum;
exports.isValidExcelBuffer = isValidExcelBuffer;
exports.parseCookieHeader = parseCookieHeader;
exports.PASSWORD_MIN_LENGTH = 12;
/**
 * Validasi kekuatan password.
 * Syarat: min 12 karakter, huruf besar, huruf kecil, angka, karakter spesial.
 */
function validatePasswordStrength(password) {
    if (password.length < exports.PASSWORD_MIN_LENGTH) {
        return { valid: false, message: `Password minimal ${exports.PASSWORD_MIN_LENGTH} karakter.` };
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
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
/** Sanitasi angka pagination: page >= 1, limit dalam [1, 100]. */
function parsePagination(pageStr, limitStr, maxLimit = 100) {
    const page = Math.max(1, parseInt(String(pageStr ?? '1'), 10) || 1);
    const limit = clamp(parseInt(String(limitStr ?? '20'), 10) || 20, 1, maxLimit);
    return { page, limit, offset: (page - 1) * limit };
}
/** Validate nilai query string terhadap daftar nilai yang diizinkan. */
function parseEnum(value, allowed) {
    if (!value)
        return undefined;
    const str = String(value);
    return allowed.includes(str) ? str : undefined;
}
/** Cek magic bytes Excel (xlsx: PK zip header). */
function isValidExcelBuffer(buffer) {
    // XLSX adalah ZIP file, dimulai dengan PK (0x50 0x4B)
    if (buffer.length < 4)
        return false;
    return buffer[0] === 0x50 && buffer[1] === 0x4B;
}
/**
 * Parse cookie string (dari req.headers.cookie) tanpa cookie-parser.
 */
function parseCookieHeader(cookieHeader) {
    const result = {};
    if (!cookieHeader)
        return result;
    for (const pair of cookieHeader.split(';')) {
        const idx = pair.indexOf('=');
        if (idx < 1)
            continue;
        const name = pair.slice(0, idx).trim();
        const value = pair.slice(idx + 1).trim();
        if (name)
            result[name] = decodeURIComponent(value);
    }
    return result;
}
//# sourceMappingURL=validation.js.map