/**
 * API Router — menggabungkan semua domain route.
 * Setiap file route mengelola satu domain/modul secara independen.
 */
import { Router } from 'express';
import authRoutes          from './auth.routes';
import notificationRoutes  from './notifications.routes';
import adminRoutes         from './admin.routes';
import module1Routes       from './module1.routes';
import organisasiRoutes    from './organisasi.routes';
import settingsRoutes      from './settings.routes';
import penugasanRoutes     from './penugasan.routes';
import module3Routes       from './module3.routes';

const router = Router();

// ── Auth ──────────────────────────────────────────────────────
router.use('/auth', authRoutes);

// ── Notifications ─────────────────────────────────────────────
router.use('/', notificationRoutes);

// ── Admin (User Management + Activity Log) ────────────────────
router.use('/', adminRoutes);

// ── Modul 1: Perencanaan Pengawasan Tahunan ───────────────────
router.use('/', module1Routes);

// ── Organisasi (Direktorat, Divisi, Departemen) ───────────────
router.use('/', organisasiRoutes);

// ── Pengaturan Sistem (HoS, Sasaran, Bobot, Tipe Penugasan) ───
router.use('/', settingsRoutes);

// ── Modul 2: Perencanaan Pengawasan Individual ────────────────
router.use('/penugasan', penugasanRoutes);

// ── Modul 3: Pelaksanaan, KKA, Auditor's Copy ─────────────────
router.use('/module3', module3Routes);

export default router;
