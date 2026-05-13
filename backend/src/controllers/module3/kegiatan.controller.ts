/**
 * Modul 3 — Detail Kegiatan (Lampiran + Hasil Audit + Deskripsi)
 *
 * Endpoint groups:
 *   1. Kegiatan detail (fase_item / rincian) — get full data untuk halaman edit
 *   2. Deskripsi (rich text) — auto-save patch (HANYA fase_item)
 *   3. Lampiran — list / create file / create link / delete
 *   4. Hasil Audit — list / create / patch (auto-save) / delete (HANYA rincian)
 *
 * Akses dijaga di middleware module3.access — controller fokus ke logic.
 */
import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { query, withTransaction } from '../../config/database';
import * as nas from '../../services/nas.service';
import logger from '../../utils/logger';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const HASIL_FIELDS_BY_KATEGORI: Record<string, string[]> = {
  konfirmasi_positif: ['kondisi', 'kriteria', 'rekomendasi'],
  temuan:             ['kondisi', 'kriteria', 'sebab', 'akibat', 'rekomendasi'],
  ofi:                ['kondisi', 'saran', 'peningkatan'],
};

const ALL_HASIL_FIELDS = ['kondisi', 'kriteria', 'sebab', 'akibat', 'rekomendasi', 'saran', 'peningkatan'];

/** Auto-detect link source from URL (Google Drive, OneDrive, dll) */
function detectLinkSource(url: string): string {
  const u = url.toLowerCase();
  if (u.includes('drive.google.com') || u.includes('docs.google.com')) return 'google_drive';
  if (u.includes('onedrive.live.com') || u.includes('1drv.ms'))         return 'onedrive';
  if (u.includes('sharepoint.com'))                                      return 'sharepoint';
  if (u.includes('dropbox.com'))                                         return 'dropbox';
  return 'other';
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Kegiatan Detail — fetch full data untuk halaman edit
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/module3/fase-items/:faseItemId/detail
 *  Ambil detail kegiatan administratif (Perencanaan/Pelaporan) lengkap dengan lampiran. */
export async function getFaseItemDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const { faseItemId } = req.params;
    const itemRes = await query(
      `SELECT fi.id, fi.program_id, fi.fase, fi.title, fi.order_index, fi.status,
              fi.est_hari, fi.man_days, fi.tanggal_jatuh_tempo, fi.deskripsi,
              ap.nas_folder_name,
              COALESCE(json_agg(
                json_build_object('user_id', u.id, 'nama', u.nama_lengkap)
                ORDER BY u.nama_lengkap
              ) FILTER (WHERE u.id IS NOT NULL), '[]') AS pics
       FROM penugasan.fase_items fi
       LEFT JOIN penugasan.audit_programs ap ON ap.id = fi.program_id
       LEFT JOIN penugasan.fase_item_pics fip ON fip.item_id = fi.id
       LEFT JOIN auth.users u ON u.id = fip.user_id
       WHERE fi.id = $1
       GROUP BY fi.id, ap.nas_folder_name`,
      [faseItemId],
    );
    if (!itemRes.rowCount) return res.status(404).json({ success: false, message: 'Kegiatan tidak ditemukan.' });

    const lampiranRes = await query(
      `SELECT l.id, l.tipe, l.nama, l.nama_asli, l.file_path, l.ukuran_byte, l.mime_type,
              l.url, l.link_source, l.uploaded_by, l.created_at,
              u.nama_lengkap AS uploaded_by_nama
       FROM audit.kegiatan_lampiran l
       LEFT JOIN auth.users u ON u.id = l.uploaded_by
       WHERE l.fase_item_id = $1 AND l.deleted_at IS NULL
       ORDER BY l.created_at DESC`,
      [faseItemId],
    );

    res.json({
      success: true,
      data: { ...itemRes.rows[0], lampiran: lampiranRes.rows },
    });
  } catch (err) { next(err); }
}

/** GET /api/module3/rincian/:rincianId/detail
 *  Ambil detail kegiatan langkah Pelaksanaan lengkap dengan lampiran + hasil audit. */
export async function getRincianDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const { rincianId } = req.params;
    const rincianRes = await query(
      `SELECT r.id, r.prosedur_id, r.title, r.order_index, r.status,
              r.est_hari, r.man_days, r.tanggal_jatuh_tempo, r.catatan_pengujian,
              tu.program_id, tu.title AS tujuan_title,
              ri.title AS risiko_title,
              pr.title AS prosedur_title,
              ap.nas_folder_name,
              COALESCE(json_agg(
                json_build_object('user_id', u.id, 'nama', u.nama_lengkap)
                ORDER BY u.nama_lengkap
              ) FILTER (WHERE u.id IS NOT NULL), '[]') AS pics
       FROM penugasan.rincian r
       JOIN penugasan.prosedur pr ON pr.id = r.prosedur_id
       JOIN penugasan.risiko ri   ON ri.id = pr.risiko_id
       JOIN penugasan.tujuan tu   ON tu.id = ri.tujuan_id
       LEFT JOIN penugasan.audit_programs ap ON ap.id = tu.program_id
       LEFT JOIN penugasan.rincian_pics rp ON rp.rincian_id = r.id
       LEFT JOIN auth.users u ON u.id = rp.user_id
       WHERE r.id = $1
       GROUP BY r.id, tu.program_id, tu.title, ri.title, pr.title, ap.nas_folder_name`,
      [rincianId],
    );
    if (!rincianRes.rowCount) return res.status(404).json({ success: false, message: 'Langkah tidak ditemukan.' });

    const lampiranRes = await query(
      `SELECT l.id, l.tipe, l.nama, l.nama_asli, l.file_path, l.ukuran_byte, l.mime_type,
              l.url, l.link_source, l.uploaded_by, l.created_at,
              u.nama_lengkap AS uploaded_by_nama
       FROM audit.kegiatan_lampiran l
       LEFT JOIN auth.users u ON u.id = l.uploaded_by
       WHERE l.rincian_id = $1 AND l.deleted_at IS NULL
       ORDER BY l.created_at DESC`,
      [rincianId],
    );

    const hasilRes = await query(
      `SELECT h.id, h.kategori, h.severity, h.urutan, h.judul,
              h.kondisi, h.kriteria, h.sebab, h.akibat, h.rekomendasi, h.saran, h.peningkatan,
              h.created_by, h.created_at, h.updated_at,
              u.nama_lengkap AS created_by_nama
       FROM audit.kegiatan_hasil_audit h
       LEFT JOIN auth.users u ON u.id = h.created_by
       WHERE h.rincian_id = $1 AND h.deleted_at IS NULL
       ORDER BY h.urutan, h.created_at`,
      [rincianId],
    );

    res.json({
      success: true,
      data: { ...rincianRes.rows[0], lampiran: lampiranRes.rows, hasil_audit: hasilRes.rows },
    });
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Deskripsi rich text — auto-save (HANYA fase_item)
// ─────────────────────────────────────────────────────────────────────────────

/** PATCH /api/module3/fase-items/:faseItemId/deskripsi
 *  Body: { deskripsi: <TipTap JSON | null> } */
export async function patchFaseItemDeskripsi(req: Request, res: Response, next: NextFunction) {
  try {
    const { faseItemId } = req.params;
    const { deskripsi } = req.body as { deskripsi: unknown };
    await query(
      `UPDATE penugasan.fase_items
       SET deskripsi = $1, updated_at = NOW()
       WHERE id = $2`,
      [deskripsi == null ? null : JSON.stringify(deskripsi), faseItemId],
    );
    res.json({ success: true, data: { saved_at: new Date().toISOString() } });
  } catch (err) { next(err); }
}

/** PATCH /api/module3/fase-items/:faseItemId/status
 *  Body: { status: 'tidak_dimulai' | 'dalam_proses' | 'selesai' } */
export async function patchFaseItemStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { faseItemId } = req.params;
    const { status } = req.body as { status: 'tidak_dimulai' | 'dalam_proses' | 'selesai' };
    if (!['tidak_dimulai', 'dalam_proses', 'selesai'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status tidak valid.' });
    }
    await query(
      `UPDATE penugasan.fase_items
       SET status = $1, updated_at = NOW()
       WHERE id = $2`,
      [status, faseItemId],
    );
    res.json({ success: true });
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. LAMPIRAN — CRUD
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/module3/fase-items/:faseItemId/lampiran/file (multer single 'file')
 *  Body multipart: file, nama (optional override) */
export async function uploadFaseItemFile(req: Request, res: Response, next: NextFunction) {
  try {
    const { faseItemId } = req.params;
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, message: 'File wajib dilampirkan.' });

    const nama = (req.body?.nama as string | undefined)?.trim() || file.originalname;
    const relativePath = (req as any).nasRelativePath as string;

    const r = await query(
      `INSERT INTO audit.kegiatan_lampiran
         (fase_item_id, tipe, nama, nama_asli, file_path, ukuran_byte, mime_type, uploaded_by)
       VALUES ($1, 'file', $2, $3, $4, $5, $6, $7)
       RETURNING id, tipe, nama, nama_asli, file_path, ukuran_byte, mime_type, created_at`,
      [faseItemId, nama, file.originalname, relativePath, file.size, file.mimetype, req.user!.id],
    );
    const nasAbsolutePath = await resolveNasAbsolutePath(req.programId!, relativePath);
    res.status(201).json({ success: true, data: { ...r.rows[0], nas_absolute_path: nasAbsolutePath } });
  } catch (err) { next(err); }
}

/** POST /api/module3/rincian/:rincianId/lampiran/file (multer single 'file') */
export async function uploadRincianFile(req: Request, res: Response, next: NextFunction) {
  try {
    const { rincianId } = req.params;
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, message: 'File wajib dilampirkan.' });

    const nama = (req.body?.nama as string | undefined)?.trim() || file.originalname;
    const relativePath = (req as any).nasRelativePath as string;

    const r = await query(
      `INSERT INTO audit.kegiatan_lampiran
         (rincian_id, tipe, nama, nama_asli, file_path, ukuran_byte, mime_type, uploaded_by)
       VALUES ($1, 'file', $2, $3, $4, $5, $6, $7)
       RETURNING id, tipe, nama, nama_asli, file_path, ukuran_byte, mime_type, created_at`,
      [rincianId, nama, file.originalname, relativePath, file.size, file.mimetype, req.user!.id],
    );
    const nasAbsolutePath = await resolveNasAbsolutePath(req.programId!, relativePath);
    res.status(201).json({ success: true, data: { ...r.rows[0], nas_absolute_path: nasAbsolutePath } });
  } catch (err) { next(err); }
}

/** Helper: ambil nas_folder_name dari programId lalu compose absolute path. */
async function resolveNasAbsolutePath(programId: string, relativePath: string): Promise<string | null> {
  const r = await query<{ nas_folder_name: string | null }>(
    `SELECT nas_folder_name FROM penugasan.audit_programs WHERE id = $1`, [programId],
  );
  const folder = r.rows[0]?.nas_folder_name;
  if (!folder) return null;
  return nas.buildAbsoluteDisplay(folder, relativePath);
}

/** POST /api/module3/fase-items/:faseItemId/lampiran/link
 *  Body: { nama: string, url: string } */
export async function createFaseItemLink(req: Request, res: Response, next: NextFunction) {
  try {
    const { faseItemId } = req.params;
    const { nama, url } = req.body as { nama?: string; url?: string };
    if (!nama?.trim() || !url?.trim()) {
      return res.status(400).json({ success: false, message: 'Nama dan URL wajib diisi.' });
    }
    const linkSource = detectLinkSource(url);
    const r = await query(
      `INSERT INTO audit.kegiatan_lampiran
         (fase_item_id, tipe, nama, url, link_source, uploaded_by)
       VALUES ($1, 'link', $2, $3, $4, $5)
       RETURNING id, tipe, nama, url, link_source, created_at`,
      [faseItemId, nama.trim(), url.trim(), linkSource, req.user!.id],
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (err) { next(err); }
}

/** POST /api/module3/rincian/:rincianId/lampiran/link
 *  Body: { nama: string, url: string } */
export async function createRincianLink(req: Request, res: Response, next: NextFunction) {
  try {
    const { rincianId } = req.params;
    const { nama, url } = req.body as { nama?: string; url?: string };
    if (!nama?.trim() || !url?.trim()) {
      return res.status(400).json({ success: false, message: 'Nama dan URL wajib diisi.' });
    }
    const linkSource = detectLinkSource(url);
    const r = await query(
      `INSERT INTO audit.kegiatan_lampiran
         (rincian_id, tipe, nama, url, link_source, uploaded_by)
       VALUES ($1, 'link', $2, $3, $4, $5)
       RETURNING id, tipe, nama, url, link_source, created_at`,
      [rincianId, nama.trim(), url.trim(), linkSource, req.user!.id],
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (err) { next(err); }
}

/** DELETE /api/module3/lampiran/:lampiranId
 *  Soft delete + hapus file fisik kalau tipe = file. */
export async function deleteLampiran(req: Request, res: Response, next: NextFunction) {
  try {
    const { lampiranId } = req.params;
    await withTransaction(async (client) => {
      const r = await client.query<{
        tipe: string;
        file_path: string | null;
        fase_item_id: string | null;
        rincian_id: string | null;
      }>(
        `SELECT tipe, file_path, fase_item_id, rincian_id
         FROM audit.kegiatan_lampiran
         WHERE id = $1 AND deleted_at IS NULL
         FOR UPDATE`,
        [lampiranId],
      );
      if (!r.rowCount) {
        return res.status(404).json({ success: false, message: 'Lampiran tidak ditemukan.' });
      }
      await client.query(
        `UPDATE audit.kegiatan_lampiran
         SET deleted_at = NOW(), deleted_by = $1
         WHERE id = $2`,
        [req.user!.id, lampiranId],
      );

      // Hapus file fisik jika tipe = file
      const lamp = r.rows[0];
      if (lamp.tipe === 'file' && lamp.file_path) {
        try {
          // Resolve absolute path: butuh program folder name
          const programId = req.programId!;
          const programRes = await client.query<{ nas_folder_name: string | null }>(
            `SELECT nas_folder_name FROM penugasan.audit_programs WHERE id = $1`,
            [programId],
          );
          const folderName = programRes.rows[0]?.nas_folder_name;
          if (folderName) {
            const fullPath = path.join(nas.getBasePath(), folderName, lamp.file_path);
            await fs.promises.unlink(fullPath).catch((e) => {
              logger.warn(`[deleteLampiran] failed unlink ${fullPath}: ${e.message}`);
            });
          }
        } catch (e: any) {
          logger.warn(`[deleteLampiran] cleanup error: ${e.message}`);
        }
      }
      res.json({ success: true });
    });
  } catch (err) { next(err); }
}

/** GET /api/module3/lampiran/:lampiranId/download
 *  Streaming download untuk lampiran tipe 'file'. */
export async function downloadLampiran(req: Request, res: Response, next: NextFunction) {
  try {
    const { lampiranId } = req.params;
    const r = await query<{
      tipe: string;
      nama: string;
      nama_asli: string | null;
      file_path: string | null;
      mime_type: string | null;
      url: string | null;
    }>(
      `SELECT tipe, nama, nama_asli, file_path, mime_type, url
       FROM audit.kegiatan_lampiran
       WHERE id = $1 AND deleted_at IS NULL`,
      [lampiranId],
    );
    if (!r.rowCount) return res.status(404).json({ success: false, message: 'Lampiran tidak ditemukan.' });
    const lamp = r.rows[0];

    // Untuk tipe 'link' kita redirect saja (atau respond dengan url)
    if (lamp.tipe === 'link') {
      return res.json({ success: true, data: { url: lamp.url } });
    }

    // Resolve absolute path lewat program folder
    const programId = req.programId!;
    const progRes = await query<{ nas_folder_name: string | null }>(
      `SELECT nas_folder_name FROM penugasan.audit_programs WHERE id = $1`,
      [programId],
    );
    const folderName = progRes.rows[0]?.nas_folder_name;
    if (!folderName || !lamp.file_path) {
      return res.status(410).json({ success: false, message: 'File path tidak tersedia.' });
    }
    const fullPath = path.join(nas.getBasePath(), folderName, lamp.file_path);
    res.setHeader('Content-Type', lamp.mime_type ?? 'application/octet-stream');
    const inline = req.query.inline === '1';
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(lamp.nama_asli ?? lamp.nama)}"`,
    );
    fs.createReadStream(fullPath)
      .on('error', (e) => {
        logger.error(`[downloadLampiran] stream error: ${e.message}`);
        if (!res.headersSent) {
          res.status(503).json({ success: false, message: 'Gagal membaca file dari NAS.' });
        }
      })
      .pipe(res);
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. HASIL AUDIT — CRUD (HANYA rincian)
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/module3/rincian/:rincianId/hasil-audit
 *  Body: { kategori: 'konfirmasi_positif'|'temuan'|'ofi', severity?: 'high'|'medium'|'low' }
 *  Membuat hasil audit kosong (untuk diisi dengan auto-save setelahnya). */
export async function createHasilAudit(req: Request, res: Response, next: NextFunction) {
  try {
    const { rincianId } = req.params;
    const { kategori, severity, judul } = req.body as {
      kategori?: 'konfirmasi_positif' | 'temuan' | 'ofi';
      severity?: 'high' | 'medium' | 'low' | null;
      judul?: string | null;
    };
    if (!kategori || !HASIL_FIELDS_BY_KATEGORI[kategori]) {
      return res.status(400).json({ success: false, message: 'Kategori tidak valid.' });
    }
    if (severity && kategori !== 'temuan') {
      return res.status(400).json({ success: false, message: 'Severity hanya boleh untuk kategori temuan.' });
    }
    // Auto-urutan: max + 1 untuk rincian ini
    const r = await query<{ next_urutan: number }>(
      `SELECT COALESCE(MAX(urutan), 0) + 1 AS next_urutan
       FROM audit.kegiatan_hasil_audit
       WHERE rincian_id = $1 AND deleted_at IS NULL`,
      [rincianId],
    );
    const urutan = r.rows[0]?.next_urutan ?? 1;

    const inserted = await query(
      `INSERT INTO audit.kegiatan_hasil_audit
         (rincian_id, kategori, severity, urutan, judul, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, kategori, severity, urutan, judul,
                 kondisi, kriteria, sebab, akibat, rekomendasi, saran, peningkatan,
                 created_at, updated_at`,
      [rincianId, kategori, severity ?? null, urutan, judul ?? null, req.user!.id],
    );
    res.status(201).json({ success: true, data: inserted.rows[0] });
  } catch (err) { next(err); }
}

/** PATCH /api/module3/hasil-audit/:hasilAuditId
 *  Body: partial — { kondisi?, kriteria?, sebab?, akibat?, rekomendasi?, saran?, peningkatan?, severity? }
 *  Auto-save delta-update untuk rich text JSONB fields. */
export async function patchHasilAudit(req: Request, res: Response, next: NextFunction) {
  try {
    const { hasilAuditId } = req.params;
    const body = req.body as Record<string, unknown>;

    const fields: string[] = [];
    const params: unknown[] = [];
    let i = 1;

    // Field rich text JSONB
    for (const f of ALL_HASIL_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, f)) {
        fields.push(`${f} = $${i++}`);
        params.push(body[f] == null ? null : JSON.stringify(body[f]));
      }
    }
    // Severity (hanya untuk temuan — DB CHECK akan validate)
    if (Object.prototype.hasOwnProperty.call(body, 'severity')) {
      const sev = body.severity;
      if (sev !== null && sev !== 'high' && sev !== 'medium' && sev !== 'low') {
        return res.status(400).json({ success: false, message: 'Severity tidak valid.' });
      }
      fields.push(`severity = $${i++}`);
      params.push(sev ?? null);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'urutan')) {
      fields.push(`urutan = $${i++}`);
      params.push(Number(body.urutan));
    }
    // Judul (plain text)
    if (Object.prototype.hasOwnProperty.call(body, 'judul')) {
      const jdl = body.judul;
      fields.push(`judul = $${i++}`);
      params.push(typeof jdl === 'string' ? jdl.trim() || null : null);
    }
    if (!fields.length) {
      return res.status(400).json({ success: false, message: 'Tidak ada field untuk diupdate.' });
    }
    fields.push(`updated_by = $${i++}`); params.push(req.user!.id);
    fields.push(`updated_at = NOW()`);
    params.push(hasilAuditId);

    await query(
      `UPDATE audit.kegiatan_hasil_audit
       SET ${fields.join(', ')}
       WHERE id = $${i} AND deleted_at IS NULL`,
      params,
    );
    res.json({ success: true, data: { saved_at: new Date().toISOString() } });
  } catch (err) { next(err); }
}

/** DELETE /api/module3/hasil-audit/:hasilAuditId — soft delete */
export async function deleteHasilAudit(req: Request, res: Response, next: NextFunction) {
  try {
    const { hasilAuditId } = req.params;
    const r = await query(
      `UPDATE audit.kegiatan_hasil_audit
       SET deleted_at = NOW(), deleted_by = $1
       WHERE id = $2 AND deleted_at IS NULL`,
      [req.user!.id, hasilAuditId],
    );
    if (!r.rowCount) {
      return res.status(404).json({ success: false, message: 'Hasil audit tidak ditemukan.' });
    }
    res.json({ success: true });
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Summary count per kegiatan (untuk badge di list Tab Project Management)
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/module3/programs/:programId/kegiatan-summary
 *  Mengembalikan count lampiran + hasil audit per kegiatan dalam program. */
export async function getProgramKegiatanSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const programId = req.programId!;
    const r = await query(
      `SELECT kegiatan_id, kegiatan_type, lampiran_count,
              konfirmasi_count, temuan_count, ofi_count, temuan_high_count
       FROM audit.v_kegiatan_summary
       WHERE program_id = $1`,
      [programId],
    );
    res.json({ success: true, data: r.rows });
  } catch (err) { next(err); }
}
