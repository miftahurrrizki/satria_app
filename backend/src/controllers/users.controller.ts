import { Request, Response } from 'express';
import { query } from '../config/database';
import {
  generateDefaultPassword,
  hashDefaultPassword,
  hashPassword,
} from '../utils/password';
import logger from '../utils/logger';
import { notifyWelcomeUser } from '../utils/notifications';

// ── GET /api/users — daftar semua user ────────────────────────
export async function getUsers(req: Request, res: Response) {
  try {
    const { search, role, is_active, page = '1', limit = '20' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const params: unknown[] = [];
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

    const countRes = await query<{ count: string }>(
      `SELECT COUNT(*) FROM auth.users u WHERE ${where}`, params,
    );
    const total = Number(countRes.rows[0]?.count ?? 0);

    params.push(Number(limit), offset);
    const dataRes = await query(
      `SELECT u.id, u.nik, u.nama_lengkap, u.email, u.role, u.jabatan,
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
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    logger.info(`[USERS] Fetched user list`, { total, page, search, role });
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
  } catch (err) {
    logger.error(`[USERS] Get users failed: ${(err as Error).message}`, { error: err });
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
}

// ── GET /api/users/stats — ringkasan jumlah user ──────────────
export async function getUserStats(_req: Request, res: Response) {
  try {
    const result = await query<{
      total: string; aktif: string; non_aktif: string;
      divisi_count: string; departemen_count: string;
    }>(
      `SELECT
         COUNT(*)                                                    AS total,
         COUNT(*) FILTER (WHERE is_active = TRUE)                    AS aktif,
         COUNT(*) FILTER (WHERE is_active = FALSE)                   AS non_aktif,
         COUNT(DISTINCT divisi_id) FILTER (WHERE divisi_id IS NOT NULL)       AS divisi_count,
         COUNT(DISTINCT departemen_id) FILTER (WHERE departemen_id IS NOT NULL) AS departemen_count
       FROM auth.users WHERE deleted_at IS NULL`,
    );
    const row = result.rows[0];
    logger.info(`[USERS] Fetched user statistics`);
    return res.json({
      success: true,
      data: {
        total:           Number(row.total),
        aktif:           Number(row.aktif),
        non_aktif:       Number(row.non_aktif),
        divisi_count:    Number(row.divisi_count),
        departemen_count: Number(row.departemen_count),
      },
    });
  } catch (err) {
    logger.error(`[USERS] Get user stats failed: ${(err as Error).message}`, { error: err });
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
}

// ── GET /api/users/:id — detail satu user ─────────────────────
export async function getUserById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT u.id, u.nik, u.nama_lengkap, u.email, u.role, u.jabatan,
              u.is_active, u.module_access,
              u.direktorat_id, dr.nama AS direktorat_nama,
              u.divisi_id,    dv.nama AS divisi_nama,
              u.departemen_id, dp.nama AS departemen_nama,
              u.created_at, u.updated_at
       FROM auth.users u
       LEFT JOIN master.direktorat dr ON u.direktorat_id = dr.id
       LEFT JOIN master.divisi     dv ON u.divisi_id     = dv.id
       LEFT JOIN master.departemen dp ON u.departemen_id = dp.id
       WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [id],
    );
    if (!result.rows[0]) {
      return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
    }
    logger.info(`[USERS] Fetched user detail`, { user_id: id });
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error(`[USERS] Get user by id failed: ${(err as Error).message}`, { error: err, user_id: req.params.id });
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
}

// ── POST /api/users — buat user baru ─────────────────────────
export async function createUser(req: Request, res: Response) {
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

    const dupCheck = await query(
      `SELECT id FROM auth.users WHERE (email = $1 OR nik = $2) AND deleted_at IS NULL`,
      [email, nik],
    );
    if (dupCheck.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Email atau NIK sudah terdaftar.',
      });
    }

    const defaultPassword = generateDefaultPassword(nik, nama_lengkap);
    const hash = await hashDefaultPassword(nik, nama_lengkap);

    let defaultModuleAccess: string[] = [];
    if (['admin_spi', 'it_admin'].includes(role)) {
      defaultModuleAccess = ['pkpt', 'pelaksanaan', 'pelaporan', 'sintesis', 'pemantauan', 'ca-cm'];
    } else if (['kepala_spi', 'pengendali_teknis', 'anggota_tim'].includes(role)) {
      defaultModuleAccess = ['pkpt'];
    }

    const result = await query<{ id: string }>(
      `INSERT INTO auth.users (nik, nama_lengkap, email, role, jabatan, password_hash, is_active, module_access, direktorat_id, divisi_id, departemen_id)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $8, $9, $10)
       RETURNING id`,
      [nik, nama_lengkap, email, role, jabatan ?? null, hash, defaultModuleAccess, direktorat_id ?? null, divisi_id ?? null, departemen_id ?? null],
    );

    await query(
      `INSERT INTO auth.activity_log (user_id, action, modul, entity_id)
       VALUES ($1, 'CREATE_USER', 'user_management', $2)`,
      [req.user!.id, result.rows[0].id],
    ).catch(() => null);

    // Kirim notifikasi Welcome + Lengkapi Identitas (non-blocking)
    notifyWelcomeUser(result.rows[0].id, nama_lengkap).catch((err) =>
      logger.error(`[USERS] notifyWelcomeUser error: ${(err as Error).message}`, { new_user_id: result.rows[0].id }),
    );

    logger.info(`[USERS] User created successfully`, { new_user_id: result.rows[0].id, nik, nama_lengkap, role, created_by: req.user!.id });
    return res.status(201).json({
      success: true,
      message: `User berhasil dibuat. Password default telah di-generate.`,
      data: {
        id: result.rows[0].id,
        default_password: defaultPassword,
        hint: `Pola: 3 digit terakhir NIK + '_' + nama belakang lowercase`,
      },
    });
  } catch (err) {
    logger.error(`[USERS] Create user failed: ${(err as Error).message}`, { error: err, nik: req.body.nik, created_by: req.user!.id });
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
}

// ── PATCH /api/users/:id — update profil user ─────────────────
export async function updateUser(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { nik, nama_lengkap, email, jabatan, role, direktorat_id, divisi_id, departemen_id } = req.body;

    if (id === req.user!.id) {
      return res.status(400).json({
        success: false,
        message: 'Gunakan halaman profil untuk mengubah data Anda sendiri.',
      });
    }

    const oldData = await query(`SELECT * FROM auth.users WHERE id = $1 AND deleted_at IS NULL`, [id]);
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
      const dup = await query(
        `SELECT id FROM auth.users WHERE nik = $1 AND id <> $2 AND deleted_at IS NULL`,
        [nik, id],
      );
      if (dup.rows[0]) {
        return res.status(409).json({ success: false, message: 'NIK sudah digunakan user lain.' });
      }
      new_nik = nik;
    }

    const new_nama     = nama_lengkap !== undefined ? nama_lengkap : old.nama_lengkap;
    const new_email    = email !== undefined ? email : old.email;
    const new_jabatan  = jabatan !== undefined ? jabatan : old.jabatan;
    const new_role     = role !== undefined ? role : old.role;
    const new_dir      = direktorat_id !== undefined ? direktorat_id : old.direktorat_id;
    const new_div      = divisi_id !== undefined ? divisi_id : old.divisi_id;
    const new_dep      = departemen_id !== undefined ? departemen_id : old.departemen_id;

    // Jika NIK atau nama_lengkap berubah, password default lama jadi tidak valid
    // (karena derive dari NIK+lastName). Reset hash ke default baru otomatis,
    // lalu kembalikan ke admin supaya bisa diinfokan ke user.
    const nikChanged  = new_nik  !== old.nik;
    const namaChanged = new_nama !== old.nama_lengkap;
    let newDefaultPassword: string | null = null;
    let newHash: string | null = null;
    if (nikChanged || namaChanged) {
      newDefaultPassword = generateDefaultPassword(String(new_nik), String(new_nama));
      newHash            = await hashDefaultPassword(String(new_nik), String(new_nama));
    }

    await query(
      `UPDATE auth.users
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
       WHERE id = $10 AND deleted_at IS NULL`,
      [new_nik, new_nama, new_email, new_jabatan, new_role, new_dir, new_div, new_dep, newHash, id],
    );

    await query(
      `INSERT INTO auth.activity_log (user_id, action, modul, entity_id)
       VALUES ($1, $2, 'user_management', $3)`,
      [req.user!.id, newHash ? 'UPDATE_USER_RESET_PW' : 'UPDATE_USER', id],
    ).catch(() => null);

    logger.info(`[USERS] User updated successfully`, {
      user_id: id, updated_by: req.user!.id, nik_changed: nikChanged, nama_changed: namaChanged,
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
  } catch (err) {
    logger.error(`[USERS] Update user failed: ${(err as Error).message}`, { error: err, user_id: req.params.id, updated_by: req.user!.id });
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
}

// ── PATCH /api/users/:id/module-access — update module access ──
export async function updateModuleAccess(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { module_access } = req.body;

    if (!Array.isArray(module_access)) {
      return res.status(400).json({
        success: false,
        message: 'module_access harus berupa array.',
      });
    }

    const validModules = ['pkpt', 'individual', 'pelaksanaan', 'pelaporan', 'sintesis', 'pemantauan', 'ca-cm'];
    const invalidModules = module_access.filter((m: unknown) => !validModules.includes(m as string));
    if (invalidModules.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Module tidak valid: ${invalidModules.join(', ')}`,
      });
    }

    await query(
      `UPDATE auth.users
       SET module_access = $1, updated_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL`,
      [module_access, id],
    );

    await query(
      `INSERT INTO auth.activity_log (user_id, action, modul, entity_id)
       VALUES ($1, 'UPDATE_MODULE_ACCESS', 'user_management', $2)`,
      [req.user!.id, id],
    ).catch(() => null);

    logger.info(`[USERS] Module access updated successfully`, { user_id: id, modules: module_access, updated_by: req.user!.id });
    return res.json({ success: true, message: 'Akses modul berhasil diperbarui.' });
  } catch (err) {
    logger.error(`[USERS] Update module access failed: ${(err as Error).message}`, { error: err, user_id: req.params.id, updated_by: req.user!.id });
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
}

// ── POST /api/users/:id/reset-password — reset ke default ─────
export async function resetUserPassword(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const result = await query<{ nik: string; nama_lengkap: string }>(
      `SELECT nik, nama_lengkap FROM auth.users WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    const target = result.rows[0];
    if (!target) {
      return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
    }

    const defaultPassword = generateDefaultPassword(target.nik, target.nama_lengkap);
    const hash = await hashDefaultPassword(target.nik, target.nama_lengkap);

    await query(
      `UPDATE auth.users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [hash, id],
    );

    await query(
      `INSERT INTO auth.activity_log (user_id, action, modul, entity_id)
       VALUES ($1, 'RESET_PASSWORD', 'user_management', $2)`,
      [req.user!.id, id],
    ).catch(() => null);

    logger.info(`[USERS] User password reset to default`, { user_id: id, target_nik: target.nik, reset_by: req.user!.id });
    return res.json({
      success: true,
      message: 'Password berhasil direset ke default.',
      data: {
        default_password: defaultPassword,
        hint: `Pola: 3 digit terakhir NIK + '_' + nama belakang lowercase`,
      },
    });
  } catch (err) {
    logger.error(`[USERS] Reset user password failed: ${(err as Error).message}`, { error: err, user_id: req.params.id, reset_by: req.user!.id });
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
}

// ── POST /api/users/:id/set-password — set password khusus ───
export async function setUserPassword(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { new_password } = req.body;

    if (!new_password || new_password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password baru minimal 6 karakter.',
      });
    }

    const hash = await hashPassword(new_password);
    await query(
      `UPDATE auth.users SET password_hash = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL`,
      [hash, id],
    );

    await query(
      `INSERT INTO auth.activity_log (user_id, action, modul, entity_id)
       VALUES ($1, 'SET_PASSWORD', 'user_management', $2)`,
      [req.user!.id, id],
    ).catch(() => null);

    logger.info(`[USERS] User password set manually`, { user_id: id, set_by: req.user!.id });
    return res.json({ success: true, message: 'Password berhasil diubah.' });
  } catch (err) {
    logger.error(`[USERS] Set user password failed: ${(err as Error).message}`, { error: err, user_id: req.params.id, set_by: req.user!.id });
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
}

// ── PATCH /api/users/:id/toggle-active — aktif/nonaktif ──────
export async function toggleUserActive(req: Request, res: Response) {
  try {
    const { id } = req.params;

    if (id === req.user!.id) {
      return res.status(400).json({
        success: false,
        message: 'Tidak dapat menonaktifkan akun Anda sendiri.',
      });
    }

    const result = await query<{ is_active: boolean; nama_lengkap: string }>(
      `SELECT is_active, nama_lengkap FROM auth.users WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (!result.rows[0]) {
      return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
    }

    const newStatus = !result.rows[0].is_active;
    await query(
      `UPDATE auth.users SET is_active = $1, updated_at = NOW() WHERE id = $2`,
      [newStatus, id],
    );

    await query(
      `INSERT INTO auth.activity_log (user_id, action, modul, entity_id)
       VALUES ($1, $2, 'user_management', $3)`,
      [req.user!.id, newStatus ? 'ACTIVATE_USER' : 'DEACTIVATE_USER', id],
    ).catch(() => null);

    logger.info(`[USERS] User status toggled`, { user_id: id, new_status: newStatus, toggled_by: req.user!.id });
    return res.json({
      success: true,
      message: `User ${result.rows[0].nama_lengkap} berhasil ${newStatus ? 'diaktifkan' : 'dinonaktifkan'}.`,
      data: { is_active: newStatus },
    });
  } catch (err) {
    logger.error(`[USERS] Toggle user active failed: ${(err as Error).message}`, { error: err, user_id: req.params.id, toggled_by: req.user!.id });
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
}

// ── DELETE /api/users/:id — soft delete ──────────────────────
export async function deleteUser(req: Request, res: Response) {
  try {
    const { id } = req.params;

    if (id === req.user!.id) {
      return res.status(400).json({
        success: false,
        message: 'Tidak dapat menghapus akun Anda sendiri.',
      });
    }

    await query(
      `UPDATE auth.users SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );

    await query(
      `INSERT INTO auth.activity_log (user_id, action, modul, entity_id)
       VALUES ($1, 'DELETE_USER', 'user_management', $2)`,
      [req.user!.id, id],
    ).catch(() => null);

    logger.info(`[USERS] User deleted (soft delete)`, { user_id: id, deleted_by: req.user!.id });
    return res.json({ success: true, message: 'User berhasil dihapus.' });
  } catch (err) {
    logger.error(`[USERS] Delete user failed: ${(err as Error).message}`, { error: err, user_id: req.params.id, deleted_by: req.user!.id });
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
}