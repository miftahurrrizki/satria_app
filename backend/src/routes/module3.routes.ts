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
  requireFaseItemAccess,
  requireLampiranAccess,
  requireHasilAuditAccess,
} from '../middleware/module3.access';
import * as C from '../controllers/module3/kka.controller';
import * as K from '../controllers/module3/kegiatan.controller';
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

      // Subfolder dari body (user pilih lewat folder picker di FE).
      // Kalau tidak ada → default ke '2. Pelaksanaan/2. Kertas Kerja Audit'.
      const rawSub = (req.body?.subfolder as string | undefined)?.trim();
      const subPath = rawSub && rawSub.length ? rawSub : nas.DEFAULT_UPLOAD_SUBFOLDER;

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

// ─────────────────────────────────────────────────────────────────────────────
// Multer storage untuk LAMPIRAN baru (Modul 3 v2 — kegiatan_lampiran)
// Sub-folder: Lampiran/<Kegiatan_xxxx | Langkah_xxxx>/
// ─────────────────────────────────────────────────────────────────────────────

const lampiranStorage = multer.diskStorage({
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

      // Subfolder dari body (user pilih lewat folder picker di FE).
      // Kalau tidak ada → default ke '2. Pelaksanaan/2. Kertas Kerja Audit'.
      const rawSub = (req.body?.subfolder as string | undefined)?.trim();
      const subPath = rawSub && rawSub.length ? rawSub : nas.DEFAULT_UPLOAD_SUBFOLDER;

      const dest = await nas.ensureSubPath(folderName, subPath);
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
      (req as any).nasRelativePath = path.posix.join(
        ...subPath.split(/[\\/]/).filter(Boolean),
        finalName,
      );
      cb(null, finalName);
    } catch (err) {
      cb(err as Error, '');
    }
  },
});

const lampiranUpload = multer({ storage: lampiranStorage });

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
router.get('/programs/:programId/nas/folders',  requireProgramAccess(), C.listProgramFolders);
router.post('/programs/:programId/nas/folders', requireProgramAccess(), C.createProgramFolder);
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

// ─────────────────────────────────────────────────────────────────────────────
// MODUL 3 V2 — Detail kegiatan (lampiran + hasil audit + auto-save)
// ─────────────────────────────────────────────────────────────────────────────

// Summary count semua kegiatan dalam 1 program (untuk badge di list)
router.get('/programs/:programId/kegiatan-summary',
  requireProgramAccess(), K.getProgramKegiatanSummary);

// FASE ITEM (Perencanaan / Pelaporan kegiatan administratif)
router.get(  '/fase-items/:faseItemId/detail',     requireFaseItemAccess(), K.getFaseItemDetail);
router.patch('/fase-items/:faseItemId/deskripsi',  requireFaseItemAccess(), K.patchFaseItemDeskripsi);
router.patch('/fase-items/:faseItemId/status',     requireFaseItemAccess(), K.patchFaseItemStatus);
router.post( '/fase-items/:faseItemId/lampiran/file',
  requireFaseItemAccess(),
  lampiranUpload.single('file'),
  uploadErrorHandler,
  K.uploadFaseItemFile,
);
router.post( '/fase-items/:faseItemId/lampiran/link',
  requireFaseItemAccess(), K.createFaseItemLink);

// RINCIAN (Pelaksanaan langkah) — detail + lampiran + hasil audit
router.get(  '/rincian/:rincianId/detail',           requireRincianAccess(), K.getRincianDetail);
router.post( '/rincian/:rincianId/lampiran/file',
  requireRincianAccess(),
  lampiranUpload.single('file'),
  uploadErrorHandler,
  K.uploadRincianFile,
);
router.post( '/rincian/:rincianId/lampiran/link',    requireRincianAccess(), K.createRincianLink);
router.post( '/rincian/:rincianId/hasil-audit',      requireRincianAccess(), K.createHasilAudit);

// LAMPIRAN — operations on existing lampiran
router.get(   '/lampiran/:lampiranId/download', requireLampiranAccess(), K.downloadLampiran);
router.delete('/lampiran/:lampiranId',          requireLampiranAccess(), K.deleteLampiran);

// HASIL AUDIT — operations on existing hasil audit
router.patch( '/hasil-audit/:hasilAuditId',     requireHasilAuditAccess(), K.patchHasilAudit);
router.delete('/hasil-audit/:hasilAuditId',     requireHasilAuditAccess(), K.deleteHasilAudit);

export default router;
