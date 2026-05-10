/**
 * Modul 3 — Kertas Kerja Audit (KKA), Pelaksanaan, Auditor's Copy
 *
 * Catatan upload:
 *   - Tidak ada batas ukuran (sesuai requirement: file evidence bisa sangat besar).
 *   - Multer diskStorage menulis langsung ke folder NAS (streaming, tidak via memory).
 *   - Folder tujuan otomatis dibuat berdasarkan `programId` & opsional sub-folder.
 */
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import { authenticate } from '../middleware/auth.middleware';
import {
  requireProgramAccess,
  requireProsedurAccess,
  requireRincianAccess,
  requireEvidenceAccess,
} from '../middleware/module3.access';
import * as C from '../controllers/module3/kka.controller';
import * as nas from '../services/nas.service';
import { query } from '../config/database';
import logger from '../utils/logger';

const router = Router();
router.use(authenticate);

// ─────────────────────────────────────────────────────────────────────────────
// Multer storage → tulis langsung ke NAS, streaming, tanpa size limit
// ─────────────────────────────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: async (req, _file, cb) => {
    try {
      const programId = req.programId!;
      const r = await query<{ nas_folder_name: string | null; judul_program: string }>(
        `SELECT ap.nas_folder_name, aap.judul_program
         FROM penugasan.audit_programs ap
         JOIN pkpt.annual_audit_plans aap ON aap.id = ap.annual_plan_id
         WHERE ap.id = $1`,
        [programId],
      );
      if (!r.rowCount) return cb(new Error('Program tidak ditemukan'), '');

      // Auto-create folder program kalau belum
      let folderName = r.rows[0].nas_folder_name;
      if (!folderName) {
        folderName = nas.sanitizeName(r.rows[0].judul_program);
        await query(
          `UPDATE penugasan.audit_programs
           SET nas_folder_name = $1, nas_initialized_at = NOW(), updated_at = NOW()
           WHERE id = $2`,
          [folderName, programId],
        );
      }
      await nas.ensureProgramFolder(folderName);

      // Optional sub-folder dari body (mis. "Bukti Wawancara") atau default per-rincian
      const rawSub = (req.body?.subfolder as string | undefined)?.trim();
      const rincianId = req.params.rincianId as string;
      const subPath = rawSub && rawSub.length
        ? rawSub
        : `Langkah_${rincianId.slice(0, 8)}`;

      const dest = await nas.ensureSubPath(folderName, subPath);
      // Stash for controller
      (req as any).__nasFolderName = folderName;
      (req as any).__nasSubPath = subPath;
      cb(null, dest);
    } catch (err) {
      cb(err as Error, '');
    }
  },
  filename: async (req, file, cb) => {
    try {
      const folderName = (req as any).__nasFolderName as string;
      const subPath = (req as any).__nasSubPath as string;
      const dest = path.join(nas.getBasePath(), folderName, subPath);
      const { finalName } = await nas.uniqueFilePath(dest, file.originalname);
      // Stash relative path for controller (POSIX-style biar konsisten di DB)
      (req as any).nasRelativePath = path.posix.join(
        ...subPath.split(/[\\/]/).filter(Boolean),
        finalName,
      );
      (req as any).nasSubfolder = subPath;
      cb(null, finalName);
    } catch (err) {
      cb(err as Error, '');
    }
  },
});

const upload = multer({
  storage,
  // ⚠️ TIDAK ada limits — sesuai requirement file besar
});

/** Kalau koneksi NAS putus saat upload, kasih pesan jelas. */
function uploadErrorHandler(err: any, _req: Request, res: Response, next: NextFunction) {
  if (!err) return next();
  const code = err?.code as string | undefined;
  if (code === 'ENOENT' || code === 'EPERM' || code === 'ENETUNREACH' || code === 'EACCES') {
    return res.status(503).json({
      success: false,
      code: 'NAS_UNAVAILABLE',
      message: 'Koneksi ke NAS terputus saat upload. Pastikan drive Z: termount, lalu coba lagi.',
    });
  }
  logger.error(`[Module3 Upload] ${err.message}`, { stack: err.stack });
  next(err);
}

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

// NAS health (tanpa scope program — global)
router.get('/nas/health', C.nasHealth);

// Program-level
router.get('/programs/:programId/overview',     requireProgramAccess(), C.getProgramOverview);
router.get('/programs/:programId/hierarki',     requireProgramAccess(), C.getHierarki);
router.post('/programs/:programId/init-folder', requireProgramAccess(), C.initProgramFolder);
router.get('/programs/:programId/nas/list',     requireProgramAccess(), C.listProgramNas);
router.get('/programs/:programId/evidence',     requireProgramAccess(), C.listEvidenceForProgram);

// Langkah (rincian)
router.patch('/rincian/:rincianId/progress',  requireRincianAccess(), C.updateRincianProgress);
router.put  ('/rincian/:rincianId/pengujian', requireRincianAccess(), C.updateCatatanPengujian);
router.get  ('/rincian/:rincianId/evidence',  requireRincianAccess(), C.listEvidenceForRincian);
router.post (
  '/rincian/:rincianId/evidence',
  requireRincianAccess(),
  upload.single('file'),
  uploadErrorHandler,
  C.uploadEvidence,
);

// Prosedur (simpulan)
router.put('/prosedur/:prosedurId/simpulan', requireProsedurAccess(), C.upsertSimpulan);

// Evidence
router.get   ('/evidence/:evidenceId/download', requireEvidenceAccess(), C.downloadEvidence);
router.delete('/evidence/:evidenceId',          requireEvidenceAccess(), C.deleteEvidence);

export default router;
