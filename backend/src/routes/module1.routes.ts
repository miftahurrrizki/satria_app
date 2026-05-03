/**
 * Modul 1 — Perencanaan Pengawasan Tahunan (PKPT)
 * Routes: risks, annual-plans, auditors, workload, dashboard stats
 */
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';

// Admin IT tidak boleh akses modul audit — hanya user management + activity log.
function blockItAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role === 'it_admin') {
    return res.status(403).json({
      success: false,
      message: 'Akses ditolak. Admin IT tidak memiliki akses ke modul audit.',
    });
  }
  next();
}

import multer from 'multer';
import {
  getRisks, getRiskById, createRisk, updateRisk, deleteRisk,
  getTopRisks, getRiskLevelRef, getSasaranKorporat, getRiskStats,
  downloadRiskTemplate, importRisks, resetRisks,
} from '../controllers/module1/risk.controller';

const uploadExcel = multer({
  storage: multer.memoryStorage(),
  // Turun dari 20 MB ke 5 MB — cegah DoS via large file upload
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // Cek ekstensi file
    const extOk = /\.(xlsx|xls)$/i.test(file.originalname);
    if (!extOk) {
      return cb(new Error('Hanya file Excel (.xlsx/.xls) yang diizinkan.') as unknown as null, false);
    }
    // Cek MIME type yang dikirim browser
    const mimeOk = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/octet-stream', // beberapa browser/OS kirim ini untuk xlsx
    ].includes(file.mimetype);
    cb(mimeOk ? null : new Error('MIME type tidak valid.') as unknown as null, mimeOk);
  },
});
import {
  getAnnualPlans, getAnnualPlanById, createAnnualPlan,
  updateAnnualPlan, deleteAnnualPlan, finalizeAnnualPlan,
  markPlanCompleted, markPlanOnProgress, runDeadlineScan,
  getDashboardStats,
  getDeletedPlans, restoreAnnualPlan, purgeAnnualPlan, purgeAllDeletedPlans,
} from '../controllers/module1/annual-plans.controller';
import { getAuditors } from '../controllers/module1/auditors.controller';
import { getWorkload, simulateWorkload }  from '../controllers/module1/workload.controller';
import {
  getPendingEvaluations, submitEvaluation,
  getEvaluationSummary, getAuditorEvaluationDetail,
} from '../controllers/module1/evaluation.controller';
import {
  getKalenderKerja, upsertKalenderKerja,
  lockKalenderKerja, unlockKalenderKerja,
} from '../controllers/module1/kalender-kerja.controller';
import {
  getCeoLetter, getCeoLetterAreas, upsertCeoLetter, uploadCeoLetterFile,
  deleteCeoLetterFile, deleteCeoLetter,
} from '../controllers/module1/ceo-letter.controller';
import { uploadCeoLetterPdf } from '../middleware/upload.middleware';
import { requireRole } from '../middleware/auth.middleware';

const router = Router();

// Semua route modul 1 butuh authenticate + bukan it_admin.
router.use(authenticate, blockItAdmin);

// ── Dashboard Stats ───────────────────────────────────────────
router.get('/dashboard/stats', authenticate, getDashboardStats);

// ── Risk Data — static routes HARUS di atas /:id ─────────────
router.get('/risks/top',             authenticate, getTopRisks);
router.get('/risks/level-ref',       authenticate, getRiskLevelRef);
router.get('/risks/sasaran-korporat',authenticate, getSasaranKorporat);
router.get('/risks/stats',           authenticate, getRiskStats);
router.get ('/risks/template',        authenticate, downloadRiskTemplate);
router.post  ('/risks/import',  authenticate, uploadExcel.single('file'), importRisks);
router.delete('/risks/reset',   authenticate, requireRole('kepala_spi', 'admin_spi'), resetRisks);

// CRUD risks — Write operations dibatasi hanya kepala_spi & admin_spi
const riskWriter = requireRole('kepala_spi', 'admin_spi');
router.get   ('/risks',     authenticate, getRisks);
router.post  ('/risks',     authenticate, riskWriter, createRisk);
router.get   ('/risks/:id', authenticate, getRiskById);
router.patch ('/risks/:id', authenticate, riskWriter, updateRisk);
router.delete('/risks/:id', authenticate, riskWriter, deleteRisk);

// ── Auditors (untuk pilih anggota tim) ───────────────────────
router.get('/auditors', authenticate, getAuditors);

// ── Workload (Beban Kerja Auditor) ────────────────────────────
router.get ('/workload',          authenticate, getWorkload);
// Simulasi workload hanya untuk admin — mencegah enumerasi data auditor lain
router.post('/workload/simulate', authenticate, requireRole('kepala_spi', 'admin_spi'), simulateWorkload);

// ── Annual Audit Plans ────────────────────────────────────────
// static routes HARUS di atas /:id
router.get   ('/annual-plans/trash',                   authenticate, requireRole('kepala_spi', 'admin_spi'), getDeletedPlans);
router.delete('/annual-plans/trash/purge-all',         authenticate, requireRole('kepala_spi', 'admin_spi'), purgeAllDeletedPlans);
router.post  ('/annual-plans/scan-deadlines',          authenticate, runDeadlineScan);
router.get   ('/annual-plans',                         authenticate, getAnnualPlans);
// Create & update dibatasi kepala_spi & admin_spi
const planWriter = requireRole('kepala_spi', 'admin_spi');
router.post  ('/annual-plans',                         authenticate, planWriter, createAnnualPlan);
router.get   ('/annual-plans/:id',                     authenticate, getAnnualPlanById);
router.patch ('/annual-plans/:id',                     authenticate, planWriter, updateAnnualPlan);
router.delete('/annual-plans/:id',                     authenticate, planWriter, deleteAnnualPlan);
router.patch ('/annual-plans/:id/restore',             authenticate, requireRole('kepala_spi', 'admin_spi'), restoreAnnualPlan);
router.delete('/annual-plans/:id/purge',               authenticate, requireRole('kepala_spi', 'admin_spi'), purgeAnnualPlan);
router.patch ('/annual-plans/:id/finalize',            authenticate, finalizeAnnualPlan);
router.patch ('/annual-plans/:id/mark-completed',      authenticate, markPlanCompleted);
router.patch ('/annual-plans/:id/mark-on-progress',    authenticate, markPlanOnProgress);

// ── Kalender Kerja / Man-Days ────────────────────────────────
const kalenderAdmin = requireRole('kepala_spi', 'admin_spi');
router.get ('/kalender-kerja',          authenticate, getKalenderKerja);
router.put ('/kalender-kerja',          authenticate, kalenderAdmin, upsertKalenderKerja);
router.post('/kalender-kerja/:id/lock',   authenticate, kalenderAdmin, lockKalenderKerja);
router.post('/kalender-kerja/:id/unlock', authenticate, kalenderAdmin, unlockKalenderKerja);

// ── CEO Letter (Surat Arahan Direksi) ────────────────────────
const ceoLetterAdmin = requireRole('kepala_spi', 'admin_spi');
router.get   ('/ceo-letter/areas',    authenticate, getCeoLetterAreas);
router.get   ('/ceo-letter',          authenticate, getCeoLetter);
router.put   ('/ceo-letter',          authenticate, ceoLetterAdmin, uploadCeoLetterPdf.single('file'), upsertCeoLetter);
router.post  ('/ceo-letter/:id/file', authenticate, ceoLetterAdmin, uploadCeoLetterPdf.single('file'), uploadCeoLetterFile);
router.delete('/ceo-letter/:id/file', authenticate, ceoLetterAdmin, deleteCeoLetterFile);
router.delete('/ceo-letter/:id',      authenticate, ceoLetterAdmin, deleteCeoLetter);

// ── Penilaian Auditor ────────────────────────────────────────
router.get ('/evaluations/pending',             authenticate, getPendingEvaluations);
router.get ('/evaluations/summary',             authenticate, getEvaluationSummary);
router.get ('/evaluations/auditor/:userId',     authenticate, getAuditorEvaluationDetail);
router.post('/evaluations',                     authenticate, submitEvaluation);

export default router;
