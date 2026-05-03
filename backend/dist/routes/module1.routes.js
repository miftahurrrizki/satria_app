"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Modul 1 — Perencanaan Pengawasan Tahunan (PKPT)
 * Routes: risks, annual-plans, auditors, workload, dashboard stats
 */
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
// Admin IT tidak boleh akses modul audit — hanya user management + activity log.
function blockItAdmin(req, res, next) {
    if (req.user?.role === 'it_admin') {
        return res.status(403).json({
            success: false,
            message: 'Akses ditolak. Admin IT tidak memiliki akses ke modul audit.',
        });
    }
    next();
}
const multer_1 = __importDefault(require("multer"));
const risk_controller_1 = require("../controllers/module1/risk.controller");
const uploadExcel = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    // Turun dari 20 MB ke 5 MB — cegah DoS via large file upload
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        // Cek ekstensi file
        const extOk = /\.(xlsx|xls)$/i.test(file.originalname);
        if (!extOk) {
            return cb(new Error('Hanya file Excel (.xlsx/.xls) yang diizinkan.'), false);
        }
        // Cek MIME type yang dikirim browser
        const mimeOk = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'application/octet-stream', // beberapa browser/OS kirim ini untuk xlsx
        ].includes(file.mimetype);
        cb(mimeOk ? null : new Error('MIME type tidak valid.'), mimeOk);
    },
});
const annual_plans_controller_1 = require("../controllers/module1/annual-plans.controller");
const auditors_controller_1 = require("../controllers/module1/auditors.controller");
const workload_controller_1 = require("../controllers/module1/workload.controller");
const evaluation_controller_1 = require("../controllers/module1/evaluation.controller");
const kalender_kerja_controller_1 = require("../controllers/module1/kalender-kerja.controller");
const ceo_letter_controller_1 = require("../controllers/module1/ceo-letter.controller");
const upload_middleware_1 = require("../middleware/upload.middleware");
const auth_middleware_2 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
// Semua route modul 1 butuh authenticate + bukan it_admin.
router.use(auth_middleware_1.authenticate, blockItAdmin);
// ── Dashboard Stats ───────────────────────────────────────────
router.get('/dashboard/stats', auth_middleware_1.authenticate, annual_plans_controller_1.getDashboardStats);
// ── Risk Data — static routes HARUS di atas /:id ─────────────
router.get('/risks/top', auth_middleware_1.authenticate, risk_controller_1.getTopRisks);
router.get('/risks/level-ref', auth_middleware_1.authenticate, risk_controller_1.getRiskLevelRef);
router.get('/risks/sasaran-korporat', auth_middleware_1.authenticate, risk_controller_1.getSasaranKorporat);
router.get('/risks/stats', auth_middleware_1.authenticate, risk_controller_1.getRiskStats);
router.get('/risks/template', auth_middleware_1.authenticate, risk_controller_1.downloadRiskTemplate);
router.post('/risks/import', auth_middleware_1.authenticate, uploadExcel.single('file'), risk_controller_1.importRisks);
router.delete('/risks/reset', auth_middleware_1.authenticate, (0, auth_middleware_2.requireRole)('kepala_spi', 'admin_spi'), risk_controller_1.resetRisks);
// CRUD risks — Write operations dibatasi hanya kepala_spi & admin_spi
const riskWriter = (0, auth_middleware_2.requireRole)('kepala_spi', 'admin_spi');
router.get('/risks', auth_middleware_1.authenticate, risk_controller_1.getRisks);
router.post('/risks', auth_middleware_1.authenticate, riskWriter, risk_controller_1.createRisk);
router.get('/risks/:id', auth_middleware_1.authenticate, risk_controller_1.getRiskById);
router.patch('/risks/:id', auth_middleware_1.authenticate, riskWriter, risk_controller_1.updateRisk);
router.delete('/risks/:id', auth_middleware_1.authenticate, riskWriter, risk_controller_1.deleteRisk);
// ── Auditors (untuk pilih anggota tim) ───────────────────────
router.get('/auditors', auth_middleware_1.authenticate, auditors_controller_1.getAuditors);
// ── Workload (Beban Kerja Auditor) ────────────────────────────
router.get('/workload', auth_middleware_1.authenticate, workload_controller_1.getWorkload);
// Simulasi workload hanya untuk admin — mencegah enumerasi data auditor lain
router.post('/workload/simulate', auth_middleware_1.authenticate, (0, auth_middleware_2.requireRole)('kepala_spi', 'admin_spi'), workload_controller_1.simulateWorkload);
// ── Annual Audit Plans ────────────────────────────────────────
// static routes HARUS di atas /:id
router.get('/annual-plans/trash', auth_middleware_1.authenticate, (0, auth_middleware_2.requireRole)('kepala_spi', 'admin_spi'), annual_plans_controller_1.getDeletedPlans);
router.delete('/annual-plans/trash/purge-all', auth_middleware_1.authenticate, (0, auth_middleware_2.requireRole)('kepala_spi', 'admin_spi'), annual_plans_controller_1.purgeAllDeletedPlans);
router.post('/annual-plans/scan-deadlines', auth_middleware_1.authenticate, annual_plans_controller_1.runDeadlineScan);
router.get('/annual-plans', auth_middleware_1.authenticate, annual_plans_controller_1.getAnnualPlans);
// Create & update dibatasi kepala_spi & admin_spi
const planWriter = (0, auth_middleware_2.requireRole)('kepala_spi', 'admin_spi');
router.post('/annual-plans', auth_middleware_1.authenticate, planWriter, annual_plans_controller_1.createAnnualPlan);
router.get('/annual-plans/:id', auth_middleware_1.authenticate, annual_plans_controller_1.getAnnualPlanById);
router.patch('/annual-plans/:id', auth_middleware_1.authenticate, planWriter, annual_plans_controller_1.updateAnnualPlan);
router.delete('/annual-plans/:id', auth_middleware_1.authenticate, planWriter, annual_plans_controller_1.deleteAnnualPlan);
router.patch('/annual-plans/:id/restore', auth_middleware_1.authenticate, (0, auth_middleware_2.requireRole)('kepala_spi', 'admin_spi'), annual_plans_controller_1.restoreAnnualPlan);
router.delete('/annual-plans/:id/purge', auth_middleware_1.authenticate, (0, auth_middleware_2.requireRole)('kepala_spi', 'admin_spi'), annual_plans_controller_1.purgeAnnualPlan);
router.patch('/annual-plans/:id/finalize', auth_middleware_1.authenticate, annual_plans_controller_1.finalizeAnnualPlan);
router.patch('/annual-plans/:id/mark-completed', auth_middleware_1.authenticate, annual_plans_controller_1.markPlanCompleted);
router.patch('/annual-plans/:id/mark-on-progress', auth_middleware_1.authenticate, annual_plans_controller_1.markPlanOnProgress);
// ── Kalender Kerja / Man-Days ────────────────────────────────
const kalenderAdmin = (0, auth_middleware_2.requireRole)('kepala_spi', 'admin_spi');
router.get('/kalender-kerja', auth_middleware_1.authenticate, kalender_kerja_controller_1.getKalenderKerja);
router.put('/kalender-kerja', auth_middleware_1.authenticate, kalenderAdmin, kalender_kerja_controller_1.upsertKalenderKerja);
router.post('/kalender-kerja/:id/lock', auth_middleware_1.authenticate, kalenderAdmin, kalender_kerja_controller_1.lockKalenderKerja);
router.post('/kalender-kerja/:id/unlock', auth_middleware_1.authenticate, kalenderAdmin, kalender_kerja_controller_1.unlockKalenderKerja);
// ── CEO Letter (Surat Arahan Direksi) ────────────────────────
const ceoLetterAdmin = (0, auth_middleware_2.requireRole)('kepala_spi', 'admin_spi');
router.get('/ceo-letter/areas', auth_middleware_1.authenticate, ceo_letter_controller_1.getCeoLetterAreas);
router.get('/ceo-letter', auth_middleware_1.authenticate, ceo_letter_controller_1.getCeoLetter);
router.put('/ceo-letter', auth_middleware_1.authenticate, ceoLetterAdmin, upload_middleware_1.uploadCeoLetterPdf.single('file'), ceo_letter_controller_1.upsertCeoLetter);
router.post('/ceo-letter/:id/file', auth_middleware_1.authenticate, ceoLetterAdmin, upload_middleware_1.uploadCeoLetterPdf.single('file'), ceo_letter_controller_1.uploadCeoLetterFile);
router.delete('/ceo-letter/:id/file', auth_middleware_1.authenticate, ceoLetterAdmin, ceo_letter_controller_1.deleteCeoLetterFile);
router.delete('/ceo-letter/:id', auth_middleware_1.authenticate, ceoLetterAdmin, ceo_letter_controller_1.deleteCeoLetter);
// ── Penilaian Auditor ────────────────────────────────────────
router.get('/evaluations/pending', auth_middleware_1.authenticate, evaluation_controller_1.getPendingEvaluations);
router.get('/evaluations/summary', auth_middleware_1.authenticate, evaluation_controller_1.getEvaluationSummary);
router.get('/evaluations/auditor/:userId', auth_middleware_1.authenticate, evaluation_controller_1.getAuditorEvaluationDetail);
router.post('/evaluations', auth_middleware_1.authenticate, evaluation_controller_1.submitEvaluation);
exports.default = router;
//# sourceMappingURL=module1.routes.js.map