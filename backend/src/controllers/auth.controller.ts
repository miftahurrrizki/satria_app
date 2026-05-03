import { Request, Response } from 'express';
import { query } from '../config/database';
import { generateToken, setSessionCookie, clearSessionCookie } from '../middleware/auth.middleware';
import {
  verifyPassword,
  hashPassword,
  hashDefaultPassword,
  generateDefaultPassword,
} from '../utils/password';
import logger from '../utils/logger';
import { validatePasswordStrength } from '../utils/validation';

// ── POST /api/auth/login ──────────────────────────────────────
export async function login(req: Request, res: Response) {
  try {
    // Menerima input "nik" atau "username" dari req.body untuk fleksibilitas frontend
    const loginId = req.body.nik || req.body.username; 
    const password = req.body.password;

    if (!loginId || !password) {
      return res.status(400).json({ success: false, message: 'NIK dan password wajib diisi.' });
    }

    const result = await query<{
      id: string; nik: string; nama_lengkap: string; email: string;
      password_hash: string; role: string; jabatan: string; is_active: boolean;
      module_access: string; direktorat_id?: string; divisi_id?: string; departemen_id?: string;
    }>(
      `SELECT id, nik, nama_lengkap, email, password_hash, role, jabatan, is_active, module_access, direktorat_id, divisi_id, departemen_id
       FROM auth.users WHERE nik = $1 AND deleted_at IS NULL`,
      [loginId],
    );

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

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_PASSWORD',
        message: 'Password yang Anda masukkan salah.',
      });
    }

    // Parse module_access from JSON column
    let moduleAccess: string[] = [];
    try {
      moduleAccess = typeof user.module_access === 'string' 
        ? JSON.parse(user.module_access) 
        : (user.module_access || []);
    } catch {
      moduleAccess = [];
    }

    const token = generateToken({
      id:           user.id,
      nik:          user.nik,
      nama:         user.nama_lengkap,
      email:        user.email,
      role:         user.role as never,
      module_access: moduleAccess as never,
      direktorat_id: user.direktorat_id,
      divisi_id:    user.divisi_id,
      departemen_id: user.departemen_id,
    });

    // Set session sebagai httpOnly cookie (tidak bisa diakses oleh JS — aman dari XSS)
    setSessionCookie(res, token);

    // Catat activity log (jangan log NIK di message — hanya user_id)
    await query(
      `INSERT INTO auth.activity_log (user_id, action, modul, ip_address)
       VALUES ($1, 'LOGIN', 'auth', $2)`,
      [user.id, req.ip],
    ).catch(() => null);

    logger.info('[AUTH] User login successful', { user_id: user.id });
    return res.json({
      success: true,
      data: {
        user: {
          id:           user.id,
          nik:          user.nik,
          nama:         user.nama_lengkap,
          email:        user.email,
          role:         user.role,
          jabatan:      user.jabatan,
          module_access: moduleAccess,
          direktorat_id: user.direktorat_id,
          divisi_id:    user.divisi_id,
          departemen_id: user.departemen_id,
        },
      },
    });
  } catch (err) {
    // Jangan log input user di production (privasi)
    logger.error(`[AUTH] Login error: ${(err as Error).message}`, { error: err });
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
}

// ── GET /api/auth/me ──────────────────────────────────────────
export async function me(req: Request, res: Response) {
  try {
    const result = await query<{
      id: string; nik: string; nama_lengkap: string; email: string;
      role: string; jabatan: string; module_access: string; direktorat_id?: string;
      divisi_id?: string; departemen_id?: string;
    }>(
      `SELECT id, nik, nama_lengkap, email, role, jabatan, module_access, direktorat_id, divisi_id, departemen_id
       FROM auth.users WHERE id = $1 AND deleted_at IS NULL`,
      [req.user!.id],
    );
    if (!result.rows[0]) {
      return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
    }
    
    const user = result.rows[0];
    let moduleAccess: string[] = [];
    try {
      moduleAccess = typeof user.module_access === 'string' 
        ? JSON.parse(user.module_access) 
        : (user.module_access || []);
    } catch {
      moduleAccess = [];
    }
    
    logger.info(`[AUTH] Get user profile: ${user.nik} (${user.id})`, { user_id: user.id });
    return res.json({ 
      success: true, 
      data: {
        ...user,
        module_access: moduleAccess,
      } 
    });
  } catch (err) {
    logger.error(`[AUTH] Get user profile failed: ${(err as Error).message}`, { error: err, user_id: req.user?.id });
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
}

// ── POST /api/auth/logout ─────────────────────────────────────
export function logout(_req: Request, res: Response) {
  clearSessionCookie(res);
  return res.json({ success: true, message: 'Berhasil keluar.' });
}

// ── PUT /api/auth/change-password ─────────────────────────────
export async function changePassword(req: Request, res: Response) {
  try {
    const { old_password, new_password } = req.body;
    if (!old_password || !new_password) {
      return res.status(400).json({ success: false, message: 'Password lama dan baru wajib diisi.' });
    }

    // Validasi kekuatan password baru
    const strength = validatePasswordStrength(new_password);
    if (!strength.valid) {
      return res.status(400).json({ success: false, message: strength.message });
    }

    const result = await query<{ password_hash: string }>(
      'SELECT password_hash FROM auth.users WHERE id = $1 AND deleted_at IS NULL',
      [req.user!.id],
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
    }

    const valid = await verifyPassword(old_password, user.password_hash);
    if (!valid) {
      return res.status(400).json({ success: false, message: 'Password lama tidak sesuai.' });
    }

    const hash = await hashPassword(new_password);
    await query(
      'UPDATE auth.users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [hash, req.user!.id],
    );

    await query(
      `INSERT INTO auth.activity_log (user_id, action, modul)
       VALUES ($1, 'CHANGE_PASSWORD', 'auth')`,
      [req.user!.id],
    ).catch(() => null);

    logger.info(`[AUTH] Password changed successfully for user: ${req.user!.id}`, { user_id: req.user!.id });
    return res.json({ success: true, message: 'Password berhasil diubah.' });
  } catch (err) {
    logger.error(`[AUTH] Change password failed: ${(err as Error).message}`, { error: err, user_id: req.user!.id });
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
}

// ── POST /api/auth/reset-password (IT Admin atau Admin SPI only)
export async function resetToDefault(req: Request, res: Response) {
  try {
    const { user_id } = req.body;
    if (!user_id) {
      return res.status(400).json({ success: false, message: 'user_id wajib diisi.' });
    }

    const callerRole = req.user!.role;
    if (!['it_admin', 'admin_spi'].includes(callerRole)) {
      return res.status(403).json({ success: false, message: 'Tidak memiliki akses reset password.' });
    }

    const result = await query<{ nik: string; nama_lengkap: string }>(
      'SELECT nik, nama_lengkap FROM auth.users WHERE id = $1 AND deleted_at IS NULL',
      [user_id],
    );
    const target = result.rows[0];
    if (!target) {
      return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
    }

    const defaultPw   = generateDefaultPassword(target.nik, target.nama_lengkap);
    const hash        = await hashDefaultPassword(target.nik, target.nama_lengkap);

    await query(
      'UPDATE auth.users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [hash, user_id],
    );

    await query(
      `INSERT INTO auth.activity_log (user_id, action, modul, entity_id)
       VALUES ($1, 'RESET_PASSWORD', 'auth', $2)`,
      [req.user!.id, user_id],
    ).catch(() => null);

    logger.info('[AUTH] Password reset executed', { target_user_id: user_id, admin_id: req.user!.id });
    // TIDAK mengembalikan default_password di response — admin perlu memberi tahu user secara langsung.
    // Pattern password default sudah publik (hint cukup), jadi exposure tidak diperlukan.
    return res.json({
      success: true,
      message: 'Password berhasil direset ke default.',
      data: {
        hint: `Pola password default: 3 digit terakhir NIK + '_' + nama belakang (huruf kecil). Contoh: NIK ...199, nama belakang "Hakim" → 199_hakim`,
      },
    });
  } catch (err) {
    logger.error(`[AUTH] Reset password failed: ${(err as Error).message}`, { error: err, user_id: req.user!.id, target_user_id: req.body.user_id });
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
}