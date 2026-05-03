"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = login;
exports.me = me;
exports.logout = logout;
exports.changePassword = changePassword;
exports.resetToDefault = resetToDefault;
const database_1 = require("../config/database");
const auth_middleware_1 = require("../middleware/auth.middleware");
const password_1 = require("../utils/password");
const logger_1 = __importDefault(require("../utils/logger"));
const validation_1 = require("../utils/validation");
// ── POST /api/auth/login ──────────────────────────────────────
async function login(req, res) {
    try {
        // Menerima input "nik" atau "username" dari req.body untuk fleksibilitas frontend
        const loginId = req.body.nik || req.body.username;
        const password = req.body.password;
        if (!loginId || !password) {
            return res.status(400).json({ success: false, message: 'NIK dan password wajib diisi.' });
        }
        const result = await (0, database_1.query)(`SELECT id, nik, nama_lengkap, email, password_hash, role, jabatan, is_active, module_access, direktorat_id, divisi_id, departemen_id
       FROM auth.users WHERE nik = $1 AND deleted_at IS NULL`, [loginId]);
        const user = result.rows[0];
        if (!user) {
            return res.status(401).json({
                success: false,
                code: 'NIK_NOT_FOUND',
                message: 'NIK belum terdaftar pada sistem. Silakan hubungi Admin SPI.',
            });
        }
        if (!user.is_active) {
            return res.status(403).json({
                success: false,
                code: 'ACCOUNT_INACTIVE',
                message: 'Akun Anda tidak aktif. Silakan hubungi Admin SPI.',
            });
        }
        const valid = await (0, password_1.verifyPassword)(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({
                success: false,
                code: 'INVALID_PASSWORD',
                message: 'Password yang Anda masukkan salah.',
            });
        }
        // Parse module_access from JSON column
        let moduleAccess = [];
        try {
            moduleAccess = typeof user.module_access === 'string'
                ? JSON.parse(user.module_access)
                : (user.module_access || []);
        }
        catch {
            moduleAccess = [];
        }
        const token = (0, auth_middleware_1.generateToken)({
            id: user.id,
            nik: user.nik,
            nama: user.nama_lengkap,
            email: user.email,
            role: user.role,
            module_access: moduleAccess,
            direktorat_id: user.direktorat_id,
            divisi_id: user.divisi_id,
            departemen_id: user.departemen_id,
        });
        // Set session sebagai httpOnly cookie (tidak bisa diakses oleh JS — aman dari XSS)
        (0, auth_middleware_1.setSessionCookie)(res, token);
        // Catat activity log (jangan log NIK di message — hanya user_id)
        await (0, database_1.query)(`INSERT INTO auth.activity_log (user_id, action, modul, ip_address)
       VALUES ($1, 'LOGIN', 'auth', $2)`, [user.id, req.ip]).catch(() => null);
        logger_1.default.info('[AUTH] User login successful', { user_id: user.id });
        return res.json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    nik: user.nik,
                    nama: user.nama_lengkap,
                    email: user.email,
                    role: user.role,
                    jabatan: user.jabatan,
                    module_access: moduleAccess,
                    direktorat_id: user.direktorat_id,
                    divisi_id: user.divisi_id,
                    departemen_id: user.departemen_id,
                },
            },
        });
    }
    catch (err) {
        // Jangan log input user di production (privasi)
        logger_1.default.error(`[AUTH] Login error: ${err.message}`, { error: err });
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
    }
}
// ── GET /api/auth/me ──────────────────────────────────────────
async function me(req, res) {
    try {
        const result = await (0, database_1.query)(`SELECT id, nik, nama_lengkap, email, role, jabatan, module_access, direktorat_id, divisi_id, departemen_id
       FROM auth.users WHERE id = $1 AND deleted_at IS NULL`, [req.user.id]);
        if (!result.rows[0]) {
            return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
        }
        const user = result.rows[0];
        let moduleAccess = [];
        try {
            moduleAccess = typeof user.module_access === 'string'
                ? JSON.parse(user.module_access)
                : (user.module_access || []);
        }
        catch {
            moduleAccess = [];
        }
        logger_1.default.info(`[AUTH] Get user profile: ${user.nik} (${user.id})`, { user_id: user.id });
        return res.json({
            success: true,
            data: {
                ...user,
                module_access: moduleAccess,
            }
        });
    }
    catch (err) {
        logger_1.default.error(`[AUTH] Get user profile failed: ${err.message}`, { error: err, user_id: req.user?.id });
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
    }
}
// ── POST /api/auth/logout ─────────────────────────────────────
function logout(_req, res) {
    (0, auth_middleware_1.clearSessionCookie)(res);
    return res.json({ success: true, message: 'Berhasil keluar.' });
}
// ── PUT /api/auth/change-password ─────────────────────────────
async function changePassword(req, res) {
    try {
        const { old_password, new_password } = req.body;
        if (!old_password || !new_password) {
            return res.status(400).json({ success: false, message: 'Password lama dan baru wajib diisi.' });
        }
        // Validasi kekuatan password baru
        const strength = (0, validation_1.validatePasswordStrength)(new_password);
        if (!strength.valid) {
            return res.status(400).json({ success: false, message: strength.message });
        }
        const result = await (0, database_1.query)('SELECT password_hash FROM auth.users WHERE id = $1 AND deleted_at IS NULL', [req.user.id]);
        const user = result.rows[0];
        if (!user) {
            return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
        }
        const valid = await (0, password_1.verifyPassword)(old_password, user.password_hash);
        if (!valid) {
            return res.status(400).json({ success: false, message: 'Password lama tidak sesuai.' });
        }
        const hash = await (0, password_1.hashPassword)(new_password);
        await (0, database_1.query)('UPDATE auth.users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, req.user.id]);
        await (0, database_1.query)(`INSERT INTO auth.activity_log (user_id, action, modul)
       VALUES ($1, 'CHANGE_PASSWORD', 'auth')`, [req.user.id]).catch(() => null);
        logger_1.default.info(`[AUTH] Password changed successfully for user: ${req.user.id}`, { user_id: req.user.id });
        return res.json({ success: true, message: 'Password berhasil diubah.' });
    }
    catch (err) {
        logger_1.default.error(`[AUTH] Change password failed: ${err.message}`, { error: err, user_id: req.user.id });
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
    }
}
// ── POST /api/auth/reset-password (IT Admin atau Admin SPI only)
async function resetToDefault(req, res) {
    try {
        const { user_id } = req.body;
        if (!user_id) {
            return res.status(400).json({ success: false, message: 'user_id wajib diisi.' });
        }
        const callerRole = req.user.role;
        if (!['it_admin', 'admin_spi'].includes(callerRole)) {
            return res.status(403).json({ success: false, message: 'Tidak memiliki akses reset password.' });
        }
        const result = await (0, database_1.query)('SELECT nik, nama_lengkap FROM auth.users WHERE id = $1 AND deleted_at IS NULL', [user_id]);
        const target = result.rows[0];
        if (!target) {
            return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
        }
        const defaultPw = (0, password_1.generateDefaultPassword)(target.nik, target.nama_lengkap);
        const hash = await (0, password_1.hashDefaultPassword)(target.nik, target.nama_lengkap);
        await (0, database_1.query)('UPDATE auth.users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, user_id]);
        await (0, database_1.query)(`INSERT INTO auth.activity_log (user_id, action, modul, entity_id)
       VALUES ($1, 'RESET_PASSWORD', 'auth', $2)`, [req.user.id, user_id]).catch(() => null);
        logger_1.default.info('[AUTH] Password reset executed', { target_user_id: user_id, admin_id: req.user.id });
        // TIDAK mengembalikan default_password di response — admin perlu memberi tahu user secara langsung.
        // Pattern password default sudah publik (hint cukup), jadi exposure tidak diperlukan.
        return res.json({
            success: true,
            message: 'Password berhasil direset ke default.',
            data: {
                hint: `Pola password default: 3 digit terakhir NIK + '_' + nama belakang (huruf kecil). Contoh: NIK ...199, nama belakang "Hakim" → 199_hakim`,
            },
        });
    }
    catch (err) {
        logger_1.default.error(`[AUTH] Reset password failed: ${err.message}`, { error: err, user_id: req.user.id, target_user_id: req.body.user_id });
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
    }
}
//# sourceMappingURL=auth.controller.js.map