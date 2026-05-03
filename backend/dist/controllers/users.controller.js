"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUsers = getUsers;
exports.getUserStats = getUserStats;
exports.getUserById = getUserById;
exports.createUser = createUser;
exports.updateUser = updateUser;
exports.updateModuleAccess = updateModuleAccess;
exports.resetUserPassword = resetUserPassword;
exports.setUserPassword = setUserPassword;
exports.toggleUserActive = toggleUserActive;
exports.deleteUser = deleteUser;
const database_1 = require("../config/database");
const password_1 = require("../utils/password");
const logger_1 = __importDefault(require("../utils/logger"));
const notifications_1 = require("../utils/notifications");
// ── GET /api/users — daftar semua user ────────────────────────
async function getUsers(req, res) {
    try {
        const { search, role, is_active, page = '1', limit = '20' } = req.query;
        const offset = (Number(page) - 1) * Number(limit);
        const params = [];
        const conditions = ['u.deleted_at IS NULL'];
        if (search) {
            params.push(`%${search}%`);
            conditions.push(`(u.nama_lengkap ILIKE $${params.length} OR u.email ILIKE $${params.length} OR u.nik ILIKE $${params.length})`);
        }
        if (role) {
            params.push(role);
            conditions.push(`u.role = $${params.length}`);
        }
        if (is_active !== undefined && is_active !== '') {
            params.push(is_active === 'true');
            conditions.push(`u.is_active = $${params.length}`);
        }
        const where = conditions.join(' AND ');
        const countRes = await (0, database_1.query)(`SELECT COUNT(*) FROM auth.users u WHERE ${where}`, params);
        const total = Number(countRes.rows[0]?.count ?? 0);
        params.push(Number(limit), offset);
        const dataRes = await (0, database_1.query)(`SELECT u.id, u.nik, u.nama_lengkap, u.email, u.role, u.jabatan,
              u.is_active, u.module_access,
              u.direktorat_id, dr.nama AS direktorat_nama,
              u.divisi_id,    dv.nama AS divisi_nama,
              u.departemen_id, dp.nama AS departemen_nama,
              u.created_at, u.updated_at
       FROM auth.users u
       LEFT JOIN master.direktorat dr ON u.direktorat_id = dr.id
       LEFT JOIN master.divisi     dv ON u.divisi_id     = dv.id
       LEFT JOIN master.departemen dp ON u.departemen_id = dp.id
       WHERE ${where}
       ORDER BY
         CASE u.role
           WHEN 'it_admin'            THEN 1
           WHEN 'admin_spi'           THEN 2
           WHEN 'kepala_spi'          THEN 3
           WHEN 'pengendali_teknis'   THEN 4
           WHEN 'anggota_tim'         THEN 5
           WHEN 'auditee'             THEN 6
           ELSE 7
         END,
         u.nama_lengkap
       LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
        logger_1.default.info(`[USERS] Fetched user list`, { total, page, search, role });
        return res.json({
            success: true,
            data: dataRes.rows,
            meta: {
                total,
                page: Number(page),
                limit: Number(limit),
                totalPages: Math.ceil(total / Number(limit)),
            },
        });
    }
    catch (err) {
        logger_1.default.error(`[USERS] Get users failed: ${err.message}`, { error: err });
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
    }
}
// ── GET /api/users/stats — ringkasan jumlah user ──────────────
async function getUserStats(_req, res) {
    try {
        const result = await (0, database_1.query)(`SELECT
         COUNT(*)                                                    AS total,
         COUNT(*) FILTER (WHERE is_active = TRUE)                    AS aktif,
         COUNT(*) FILTER (WHERE is_active = FALSE)                   AS non_aktif,
         COUNT(DISTINCT divisi_id) FILTER (WHERE divisi_id IS NOT NULL)       AS divisi_count,
         COUNT(DISTINCT departemen_id) FILTER (WHERE departemen_id IS NOT NULL) AS departemen_count
       FROM auth.users WHERE deleted_at IS NULL`);
        const row = result.rows[0];
        logger_1.default.info(`[USERS] Fetched user statistics`);
        return res.json({
            success: true,
            data: {
                total: Number(row.total),
                aktif: Number(row.aktif),
                non_aktif: Number(row.non_aktif),
                divisi_count: Number(row.divisi_count),
                departemen_count: Number(row.departemen_count),
            },
        });
    }
    catch (err) {
        logger_1.default.error(`[USERS] Get user stats failed: ${err.message}`, { error: err });
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
    }
}
// ── GET /api/users/:id — detail satu user ─────────────────────
async function getUserById(req, res) {
    try {
        const { id } = req.params;
        const result = await (0, database_1.query)(`SELECT u.id, u.nik, u.nama_lengkap, u.email, u.role, u.jabatan,
              u.is_active, u.module_access,
              u.direktorat_id, dr.nama AS direktorat_nama,
              u.divisi_id,    dv.nama AS divisi_nama,
              u.departemen_id, dp.nama AS departemen_nama,
              u.created_at, u.updated_at
       FROM auth.users u
       LEFT JOIN master.direktorat dr ON u.direktorat_id = dr.id
       LEFT JOIN master.divisi     dv ON u.divisi_id     = dv.id
       LEFT JOIN master.departemen dp ON u.departemen_id = dp.id
       WHERE u.id = $1 AND u.deleted_at IS NULL`, [id]);
        if (!result.rows[0]) {
            return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
        }
        logger_1.default.info(`[USERS] Fetched user detail`, { user_id: id });
        return res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        logger_1.default.error(`[USERS] Get user by id failed: ${err.message}`, { error: err, user_id: req.params.id });
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
    }
}
// ── POST /api/users — buat user baru ─────────────────────────
async function createUser(req, res) {
    try {
        const { nik, nama_lengkap, email, role, jabatan, direktorat_id, divisi_id, departemen_id } = req.body;
        if (!nik || !nama_lengkap || !email || !role) {
            return res.status(400).json({
                success: false,
                message: 'NIK, nama lengkap, email, dan role wajib diisi.',
            });
        }
        if (!/^[0-9]{6}$/.test(nik)) {
            return res.status(400).json({
                success: false,
                message: 'NIK harus tepat 6 digit angka.',
            });
        }
        const dupCheck = await (0, database_1.query)(`SELECT id FROM auth.users WHERE (email = $1 OR nik = $2) AND deleted_at IS NULL`, [email, nik]);
        if (dupCheck.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Email atau NIK sudah terdaftar.',
            });
        }
        const defaultPassword = (0, password_1.generateDefaultPassword)(nik, nama_lengkap);
        const hash = await (0, password_1.hashDefaultPassword)(nik, nama_lengkap);
        let defaultModuleAccess = [];
        if (['admin_spi', 'it_admin'].includes(role)) {
            defaultModuleAccess = ['pkpt', 'pelaksanaan', 'pelaporan', 'sintesis', 'pemantauan', 'ca-cm'];
        }
        else if (['kepala_spi', 'pengendali_teknis', 'anggota_tim'].includes(role)) {
            defaultModuleAccess = ['pkpt'];
        }
        const result = await (0, database_1.query)(`INSERT INTO auth.users (nik, nama_lengkap, email, role, jabatan, password_hash, is_active, module_access, direktorat_id, divisi_id, departemen_id)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $8, $9, $10)
       RETURNING id`, [nik, nama_lengkap, email, role, jabatan ?? null, hash, defaultModuleAccess, direktorat_id ?? null, divisi_id ?? null, departemen_id ?? null]);
        await (0, database_1.query)(`INSERT INTO auth.activity_log (user_id, action, modul, entity_id)
       VALUES ($1, 'CREATE_USER', 'user_management', $2)`, [req.user.id, result.rows[0].id]).catch(() => null);
        // Kirim notifikasi Welcome + Lengkapi Identitas (non-blocking)
        (0, notifications_1.notifyWelcomeUser)(result.rows[0].id, nama_lengkap).catch((err) => logger_1.default.error(`[USERS] notifyWelcomeUser error: ${err.message}`, { new_user_id: result.rows[0].id }));
        logger_1.default.info(`[USERS] User created successfully`, { new_user_id: result.rows[0].id, nik, nama_lengkap, role, created_by: req.user.id });
        return res.status(201).json({
            success: true,
            message: `User berhasil dibuat. Password default telah di-generate.`,
            data: {
                id: result.rows[0].id,
                default_password: defaultPassword,
                hint: `Pola: 3 digit terakhir NIK + '_' + nama belakang lowercase`,
            },
        });
    }
    catch (err) {
        logger_1.default.error(`[USERS] Create user failed: ${err.message}`, { error: err, nik: req.body.nik, created_by: req.user.id });
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
    }
}
// ── PATCH /api/users/:id — update profil user ─────────────────
async function updateUser(req, res) {
    try {
        const { id } = req.params;
        const { nik, nama_lengkap, email, jabatan, role, direktorat_id, divisi_id, departemen_id } = req.body;
        if (id === req.user.id) {
            return res.status(400).json({
                success: false,
                message: 'Gunakan halaman profil untuk mengubah data Anda sendiri.',
            });
        }
        const oldData = await (0, database_1.query)(`SELECT * FROM auth.users WHERE id = $1 AND deleted_at IS NULL`, [id]);
        if (!oldData.rows[0]) {
            return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
        }
        const old = oldData.rows[0];
        // Validasi & cek duplikasi NIK jika diubah
        let new_nik = old.nik;
        if (nik !== undefined && nik !== old.nik) {
            if (!/^[0-9]{6}$/.test(nik)) {
                return res.status(400).json({ success: false, message: 'NIK harus tepat 6 digit angka.' });
            }
            const dup = await (0, database_1.query)(`SELECT id FROM auth.users WHERE nik = $1 AND id <> $2 AND deleted_at IS NULL`, [nik, id]);
            if (dup.rows[0]) {
                return res.status(409).json({ success: false, message: 'NIK sudah digunakan user lain.' });
            }
            new_nik = nik;
        }
        const new_nama = nama_lengkap !== undefined ? nama_lengkap : old.nama_lengkap;
        const new_email = email !== undefined ? email : old.email;
        const new_jabatan = jabatan !== undefined ? jabatan : old.jabatan;
        const new_role = role !== undefined ? role : old.role;
        const new_dir = direktorat_id !== undefined ? direktorat_id : old.direktorat_id;
        const new_div = divisi_id !== undefined ? divisi_id : old.divisi_id;
        const new_dep = departemen_id !== undefined ? departemen_id : old.departemen_id;
        // Jika NIK atau nama_lengkap berubah, password default lama jadi tidak valid
        // (karena derive dari NIK+lastName). Reset hash ke default baru otomatis,
        // lalu kembalikan ke admin supaya bisa diinfokan ke user.
        const nikChanged = new_nik !== old.nik;
        const namaChanged = new_nama !== old.nama_lengkap;
        let newDefaultPassword = null;
        let newHash = null;
        if (nikChanged || namaChanged) {
            newDefaultPassword = (0, password_1.generateDefaultPassword)(String(new_nik), String(new_nama));
            newHash = await (0, password_1.hashDefaultPassword)(String(new_nik), String(new_nama));
        }
        await (0, database_1.query)(`UPDATE auth.users
       SET nik = $1,
           nama_lengkap = $2,
           email = $3,
           jabatan = $4,
           role = $5,
           direktorat_id = $6,
           divisi_id = $7,
           departemen_id = $8,
           password_hash = COALESCE($9, password_hash),
           updated_at = NOW()
       WHERE id = $10 AND deleted_at IS NULL`, [new_nik, new_nama, new_email, new_jabatan, new_role, new_dir, new_div, new_dep, newHash, id]);
        await (0, database_1.query)(`INSERT INTO auth.activity_log (user_id, action, modul, entity_id)
       VALUES ($1, $2, 'user_management', $3)`, [req.user.id, newHash ? 'UPDATE_USER_RESET_PW' : 'UPDATE_USER', id]).catch(() => null);
        logger_1.default.info(`[USERS] User updated successfully`, {
            user_id: id, updated_by: req.user.id, nik_changed: nikChanged, nama_changed: namaChanged,
            password_reset: Boolean(newHash),
        });
        return res.json({
            success: true,
            message: newDefaultPassword
                ? 'Data user berhasil diperbarui. Password di-reset ke default baru karena NIK/Nama berubah.'
                : 'Data user berhasil diperbarui.',
            data: newDefaultPassword
                ? {
                    password_reset: true,
                    default_password: newDefaultPassword,
                    hint: `Pola: 3 digit terakhir NIK + '_' + nama belakang lowercase`,
                }
                : { password_reset: false },
        });
    }
    catch (err) {
        logger_1.default.error(`[USERS] Update user failed: ${err.message}`, { error: err, user_id: req.params.id, updated_by: req.user.id });
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
    }
}
// ── PATCH /api/users/:id/module-access — update module access ──
async function updateModuleAccess(req, res) {
    try {
        const { id } = req.params;
        const { module_access } = req.body;
        if (!Array.isArray(module_access)) {
            return res.status(400).json({
                success: false,
                message: 'module_access harus berupa array.',
            });
        }
        const validModules = ['pkpt', 'pelaksanaan', 'pelaporan', 'sintesis', 'pemantauan', 'ca-cm'];
        const invalidModules = module_access.filter((m) => !validModules.includes(m));
        if (invalidModules.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Module tidak valid: ${invalidModules.join(', ')}`,
            });
        }
        await (0, database_1.query)(`UPDATE auth.users
       SET module_access = $1, updated_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL`, [module_access, id]);
        await (0, database_1.query)(`INSERT INTO auth.activity_log (user_id, action, modul, entity_id)
       VALUES ($1, 'UPDATE_MODULE_ACCESS', 'user_management', $2)`, [req.user.id, id]).catch(() => null);
        logger_1.default.info(`[USERS] Module access updated successfully`, { user_id: id, modules: module_access, updated_by: req.user.id });
        return res.json({ success: true, message: 'Akses modul berhasil diperbarui.' });
    }
    catch (err) {
        logger_1.default.error(`[USERS] Update module access failed: ${err.message}`, { error: err, user_id: req.params.id, updated_by: req.user.id });
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
    }
}
// ── POST /api/users/:id/reset-password — reset ke default ─────
async function resetUserPassword(req, res) {
    try {
        const { id } = req.params;
        const result = await (0, database_1.query)(`SELECT nik, nama_lengkap FROM auth.users WHERE id = $1 AND deleted_at IS NULL`, [id]);
        const target = result.rows[0];
        if (!target) {
            return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
        }
        const defaultPassword = (0, password_1.generateDefaultPassword)(target.nik, target.nama_lengkap);
        const hash = await (0, password_1.hashDefaultPassword)(target.nik, target.nama_lengkap);
        await (0, database_1.query)(`UPDATE auth.users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [hash, id]);
        await (0, database_1.query)(`INSERT INTO auth.activity_log (user_id, action, modul, entity_id)
       VALUES ($1, 'RESET_PASSWORD', 'user_management', $2)`, [req.user.id, id]).catch(() => null);
        logger_1.default.info(`[USERS] User password reset to default`, { user_id: id, target_nik: target.nik, reset_by: req.user.id });
        return res.json({
            success: true,
            message: 'Password berhasil direset ke default.',
            data: {
                default_password: defaultPassword,
                hint: `Pola: 3 digit terakhir NIK + '_' + nama belakang lowercase`,
            },
        });
    }
    catch (err) {
        logger_1.default.error(`[USERS] Reset user password failed: ${err.message}`, { error: err, user_id: req.params.id, reset_by: req.user.id });
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
    }
}
// ── POST /api/users/:id/set-password — set password khusus ───
async function setUserPassword(req, res) {
    try {
        const { id } = req.params;
        const { new_password } = req.body;
        if (!new_password || new_password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password baru minimal 6 karakter.',
            });
        }
        const hash = await (0, password_1.hashPassword)(new_password);
        await (0, database_1.query)(`UPDATE auth.users SET password_hash = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL`, [hash, id]);
        await (0, database_1.query)(`INSERT INTO auth.activity_log (user_id, action, modul, entity_id)
       VALUES ($1, 'SET_PASSWORD', 'user_management', $2)`, [req.user.id, id]).catch(() => null);
        logger_1.default.info(`[USERS] User password set manually`, { user_id: id, set_by: req.user.id });
        return res.json({ success: true, message: 'Password berhasil diubah.' });
    }
    catch (err) {
        logger_1.default.error(`[USERS] Set user password failed: ${err.message}`, { error: err, user_id: req.params.id, set_by: req.user.id });
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
    }
}
// ── PATCH /api/users/:id/toggle-active — aktif/nonaktif ──────
async function toggleUserActive(req, res) {
    try {
        const { id } = req.params;
        if (id === req.user.id) {
            return res.status(400).json({
                success: false,
                message: 'Tidak dapat menonaktifkan akun Anda sendiri.',
            });
        }
        const result = await (0, database_1.query)(`SELECT is_active, nama_lengkap FROM auth.users WHERE id = $1 AND deleted_at IS NULL`, [id]);
        if (!result.rows[0]) {
            return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
        }
        const newStatus = !result.rows[0].is_active;
        await (0, database_1.query)(`UPDATE auth.users SET is_active = $1, updated_at = NOW() WHERE id = $2`, [newStatus, id]);
        await (0, database_1.query)(`INSERT INTO auth.activity_log (user_id, action, modul, entity_id)
       VALUES ($1, $2, 'user_management', $3)`, [req.user.id, newStatus ? 'ACTIVATE_USER' : 'DEACTIVATE_USER', id]).catch(() => null);
        logger_1.default.info(`[USERS] User status toggled`, { user_id: id, new_status: newStatus, toggled_by: req.user.id });
        return res.json({
            success: true,
            message: `User ${result.rows[0].nama_lengkap} berhasil ${newStatus ? 'diaktifkan' : 'dinonaktifkan'}.`,
            data: { is_active: newStatus },
        });
    }
    catch (err) {
        logger_1.default.error(`[USERS] Toggle user active failed: ${err.message}`, { error: err, user_id: req.params.id, toggled_by: req.user.id });
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
    }
}
// ── DELETE /api/users/:id — soft delete ──────────────────────
async function deleteUser(req, res) {
    try {
        const { id } = req.params;
        if (id === req.user.id) {
            return res.status(400).json({
                success: false,
                message: 'Tidak dapat menghapus akun Anda sendiri.',
            });
        }
        await (0, database_1.query)(`UPDATE auth.users SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL`, [id]);
        await (0, database_1.query)(`INSERT INTO auth.activity_log (user_id, action, modul, entity_id)
       VALUES ($1, 'DELETE_USER', 'user_management', $2)`, [req.user.id, id]).catch(() => null);
        logger_1.default.info(`[USERS] User deleted (soft delete)`, { user_id: id, deleted_by: req.user.id });
        return res.json({ success: true, message: 'User berhasil dihapus.' });
    }
    catch (err) {
        logger_1.default.error(`[USERS] Delete user failed: ${err.message}`, { error: err, user_id: req.params.id, deleted_by: req.user.id });
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
    }
}
//# sourceMappingURL=users.controller.js.map