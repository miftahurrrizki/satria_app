/**
 * CEO Letter — Surat arahan Direksi (1 dokumen per tahun) + area pengawasan.
 *
 * Endpoints:
 *   GET    /ceo-letter?tahun=YYYY      → ambil header + areas (atau null kalau belum ada)
 *   PUT    /ceo-letter                 → upsert header + replace areas (multipart bisa attach PDF)
 *   POST   /ceo-letter/:id/file        → upload/replace PDF saja
 *   DELETE /ceo-letter/:id/file        → hapus file PDF
 *   DELETE /ceo-letter/:id             → soft-delete CEO letter
 */
import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { query, pool } from '../../config/database';
import logger from '../../utils/logger';
import { publicUploadUrl, UPLOADS_DIR } from '../../middleware/upload.middleware';

const currentYear = (): number => new Date().getFullYear();

function fileMetaFromUpload(file?: Express.Multer.File) {
  if (!file) return null;
  return {
    file_url:  publicUploadUrl('ceo-letters', file.filename),
    file_name: file.originalname,
    file_size: file.size,
  };
}

function deletePhysicalFile(file_url?: string | null) {
  if (!file_url) return;
  // file_url shaped: /uploads/ceo-letters/<name>
  const parts = file_url.replace(/^\//, '').split('/');
  if (parts[0] !== 'uploads') return;
  const abs = path.resolve(UPLOADS_DIR, ...parts.slice(1));
  if (abs.startsWith(UPLOADS_DIR) && fs.existsSync(abs)) {
    try { fs.unlinkSync(abs); } catch (e) { logger.warn(`[CEO_LETTER] gagal hapus file ${abs}: ${(e as Error).message}`); }
  }
}

/** Parse JSON string aman — fallback ke default */
function safeParseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string') return (raw as T) ?? fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

// ── GET /ceo-letter/areas?tahun= ─────────────────────────────
export async function getCeoLetterAreas(req: Request, res: Response) {
  try {
    const tahun = req.query.tahun ? Number(req.query.tahun) : currentYear();
    const result = await query(
      `SELECT
         ca.id, ca.ceo_letter_id, ca.parameter, ca.deskripsi,
         ca.prioritas, ca.urutan,
         COALESCE(ca.target_tipe, 'Direksi') AS target_tipe,
         COALESCE(ca.target_unit, 'Utama')   AS target_unit,
         cl.judul    AS judul_surat,
         cl.nomor_surat,
         cl.tahun,
         (SELECT COUNT(*)::INT FROM pkpt.annual_plan_ceo_areas apca
            JOIN pkpt.annual_audit_plans aap ON aap.id = apca.annual_plan_id
           WHERE apca.ceo_area_id = ca.id AND aap.deleted_at IS NULL) AS programs_count,
         (SELECT COALESCE(JSON_AGG(aap2.judul_program ORDER BY aap2.created_at), '[]')
            FROM pkpt.annual_plan_ceo_areas apca2
            JOIN pkpt.annual_audit_plans aap2 ON aap2.id = apca2.annual_plan_id
           WHERE apca2.ceo_area_id = ca.id AND aap2.deleted_at IS NULL) AS programs
       FROM pkpt.ceo_letter_area ca
       JOIN pkpt.ceo_letter cl ON cl.id = ca.ceo_letter_id
      WHERE cl.tahun = $1
        AND cl.deleted_at IS NULL
        AND ca.deleted_at IS NULL
      ORDER BY ca.target_tipe ASC, ca.urutan ASC, ca.created_at ASC`,
      [tahun],
    );
    return res.json({ success: true, data: result.rows, meta: { tahun } });
  } catch (err) {
    logger.error(`[CEO_LETTER] getAreas failed: ${(err as Error).message}`, { error: err });
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

// ── GET ──────────────────────────────────────────────────────
export async function getCeoLetter(req: Request, res: Response) {
  try {
    const tahun = req.query.tahun ? Number(req.query.tahun) : currentYear();

    const head = await query<{ id: string } & Record<string, unknown>>(
      `SELECT cl.*, u.nama_lengkap AS uploaded_by_nama
         FROM pkpt.ceo_letter cl
         LEFT JOIN auth.users u ON u.id = cl.uploaded_by
        WHERE cl.tahun = $1 AND cl.deleted_at IS NULL
        ORDER BY cl.created_at DESC`,
      [tahun],
    );

    if (head.rows.length === 0) {
      return res.json({
        success: true,
        data: { header: null, areas: [], letters: [] },
        meta: { tahun, exists: false },
      });
    }

    const ids = head.rows.map((r) => r.id);
    const areas = await query<{ ceo_letter_id: string } & Record<string, unknown>>(
      `SELECT ca.id, ca.ceo_letter_id, ca.parameter, ca.deskripsi, ca.prioritas,
              COALESCE(ca.target_tipe, 'Direksi') AS target_tipe,
              COALESCE(ca.target_unit, 'Utama') AS target_unit,
              ca.urutan,
              (SELECT COUNT(*)::INT FROM pkpt.annual_plan_ceo_areas apca
                 JOIN pkpt.annual_audit_plans aap ON aap.id = apca.annual_plan_id
                WHERE apca.ceo_area_id = ca.id AND aap.deleted_at IS NULL) AS programs_count,
              (SELECT COALESCE(JSON_AGG(aap2.judul_program ORDER BY aap2.created_at), '[]')
                 FROM pkpt.annual_plan_ceo_areas apca2
                 JOIN pkpt.annual_audit_plans aap2 ON aap2.id = apca2.annual_plan_id
                WHERE apca2.ceo_area_id = ca.id AND aap2.deleted_at IS NULL) AS programs
         FROM pkpt.ceo_letter_area ca
        WHERE ca.ceo_letter_id = ANY($1::uuid[]) AND ca.deleted_at IS NULL
        ORDER BY ca.urutan ASC, ca.created_at ASC`,
      [ids],
    );
    const areasByLetter = new Map<string, typeof areas.rows>();
    for (const area of areas.rows) {
      const list = areasByLetter.get(area.ceo_letter_id) ?? [];
      list.push(area);
      areasByLetter.set(area.ceo_letter_id, list);
    }
    const letters = head.rows.map((h) => ({
      ...h,
      areas: areasByLetter.get(h.id) ?? [],
    }));

    return res.json({
      success: true,
      data: { header: letters[0], areas: letters[0].areas, letters },
      meta: { tahun, exists: true },
    });
  } catch (err) {
    logger.error(`[CEO_LETTER] get failed: ${(err as Error).message}`, { error: err });
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

// ── PUT (upsert + replace areas, optional PDF via multipart) ─
export async function upsertCeoLetter(req: Request, res: Response) {
  const client = await pool.connect();
  try {
    const tahun         = Number(req.body.tahun ?? currentYear());
    const id            = req.body.id || null;
    const createNew     = req.body.create_new === 'true';
    const nomor_surat   = req.body.nomor_surat ?? null;
    const judul         = (req.body.judul ?? '').trim();
    const tanggal_terbit = req.body.tanggal_terbit || null;
    const isi_ringkasan = req.body.isi_ringkasan ?? null;

    if (!judul) {
      return res.status(400).json({ success: false, message: 'Judul wajib diisi.' });
    }

    type AreaInput = {
      parameter: string;
      deskripsi?: string | null;
      prioritas?: 'Tinggi' | 'Sedang' | 'Rendah';
      target_tipe?: 'Direksi' | 'Komisaris';
      target_unit?: 'Utama' | 'Keuangan' | 'Bisnis' | 'Operasional' | 'Teknologi Informasi' | 'Komisaris';
      urutan?: number;
    };
    const areas = safeParseJson<AreaInput[]>(req.body.areas, []);
    if (!Array.isArray(areas)) {
      return res.status(400).json({ success: false, message: 'Field areas harus array.' });
    }

    const fileMeta = fileMetaFromUpload(req.file);

    await client.query('BEGIN');

    const existing = createNew
      ? { rows: [] }
      : await client.query(
        `SELECT id, file_url FROM pkpt.ceo_letter
          WHERE ${id ? 'id = $1' : 'tahun = $1 AND deleted_at IS NULL'}
          ORDER BY created_at DESC
          LIMIT 1`,
        [id || tahun],
      );

    let letterId: string;
    if (existing.rows.length > 0) {
      letterId = existing.rows[0].id;
      // Kalau upload file baru → hapus file lama di disk
      if (fileMeta && existing.rows[0].file_url) {
        deletePhysicalFile(existing.rows[0].file_url);
      }
      await client.query(
        `UPDATE pkpt.ceo_letter
            SET nomor_surat    = $2,
                judul          = $3,
                tanggal_terbit = $4,
                isi_ringkasan  = $5,
                file_url       = COALESCE($6, file_url),
                file_name      = COALESCE($7, file_name),
                file_size      = COALESCE($8, file_size),
                updated_at     = NOW()
          WHERE id = $1`,
        [
          letterId, nomor_surat, judul, tanggal_terbit, isi_ringkasan,
          fileMeta?.file_url ?? null, fileMeta?.file_name ?? null, fileMeta?.file_size ?? null,
        ],
      );
    } else {
      const ins = await client.query<{ id: string }>(
        `INSERT INTO pkpt.ceo_letter
           (tahun, nomor_surat, judul, tanggal_terbit, isi_ringkasan,
            file_url, file_name, file_size, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id`,
        [
          tahun, nomor_surat, judul, tanggal_terbit, isi_ringkasan,
          fileMeta?.file_url ?? null, fileMeta?.file_name ?? null, fileMeta?.file_size ?? null,
          req.user!.id,
        ],
      );
      letterId = ins.rows[0].id;
    }

    // Replace areas: hard-delete dulu, lalu insert ulang
    await client.query('DELETE FROM pkpt.ceo_letter_area WHERE ceo_letter_id = $1', [letterId]);
    for (let i = 0; i < areas.length; i++) {
      const a = areas[i];
      if (!a?.parameter || !a.parameter.trim()) continue;
      const prio = a.prioritas ?? 'Sedang';
      const targetTipe = a.target_tipe ?? 'Direksi';
      const targetUnit = targetTipe === 'Komisaris' ? 'Komisaris' : (a.target_unit ?? 'Utama');
      await client.query(
        `INSERT INTO pkpt.ceo_letter_area
           (ceo_letter_id, parameter, deskripsi, prioritas, target_tipe, target_unit, urutan)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [letterId, a.parameter.trim(), a.deskripsi ?? null, prio, targetTipe, targetUnit, a.urutan ?? i],
      );
    }

    await client.query('COMMIT');
    logger.info('[CEO_LETTER] upserted', { tahun, letterId, by: req.user!.id, areaCount: areas.length, fileChanged: !!fileMeta });

    const head = await query(
      `SELECT cl.*, u.nama_lengkap AS uploaded_by_nama
         FROM pkpt.ceo_letter cl
         LEFT JOIN auth.users u ON u.id = cl.uploaded_by
        WHERE cl.id = $1`,
      [letterId],
    );
    const areasRes = await query(
      `SELECT id, ceo_letter_id, parameter, deskripsi, prioritas,
              COALESCE(target_tipe, 'Direksi') AS target_tipe,
              COALESCE(target_unit, 'Utama') AS target_unit,
              urutan
         FROM pkpt.ceo_letter_area
        WHERE ceo_letter_id = $1 AND deleted_at IS NULL
        ORDER BY urutan ASC, created_at ASC`,
      [letterId],
    );

    return res.json({
      success: true,
      data: { header: head.rows[0], areas: areasRes.rows },
      message: 'CEO Letter tersimpan.',
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    // Kalau upload masuk tapi tx gagal → hapus file orphan
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch { /* noop */ }
    }
    logger.error(`[CEO_LETTER] upsert failed: ${(err as Error).message}`, { error: err });
    return res.status(500).json({ success: false, message: 'Server error' });
  } finally {
    client.release();
  }
}

// ── POST /:id/file (upload / replace PDF saja) ───────────────
export async function uploadCeoLetterFile(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'File PDF tidak ditemukan di request.' });
    }
    const fileMeta = fileMetaFromUpload(req.file)!;

    const existing = await query<{ file_url: string | null }>(
      `SELECT file_url FROM pkpt.ceo_letter WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (existing.rows.length === 0) {
      try { fs.unlinkSync(req.file.path); } catch { /* noop */ }
      return res.status(404).json({ success: false, message: 'CEO Letter tidak ditemukan.' });
    }
    if (existing.rows[0].file_url) deletePhysicalFile(existing.rows[0].file_url);

    const result = await query<{ id: string; file_url: string | null }>(
      `UPDATE pkpt.ceo_letter
          SET file_url = $2, file_name = $3, file_size = $4,
              uploaded_by = $5, updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [id, fileMeta.file_url, fileMeta.file_name, fileMeta.file_size, req.user!.id],
    );

    logger.info('[CEO_LETTER] file uploaded', { id, by: req.user!.id, file: fileMeta.file_name });
    return res.json({ success: true, data: result.rows[0], message: 'PDF terunggah.' });
  } catch (err) {
    logger.error(`[CEO_LETTER] upload file failed: ${(err as Error).message}`, { error: err });
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

// ── DELETE /:id/file ─────────────────────────────────────────
export async function deleteCeoLetterFile(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const existing = await query<{ file_url: string | null }>(
      `SELECT file_url FROM pkpt.ceo_letter WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'CEO Letter tidak ditemukan.' });
    }
    deletePhysicalFile(existing.rows[0].file_url);

    const result = await query<{ id: string; file_url: string | null }>(
      `UPDATE pkpt.ceo_letter
          SET file_url = NULL, file_name = NULL, file_size = NULL, updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [id],
    );
    logger.info('[CEO_LETTER] file deleted', { id, by: req.user!.id });
    return res.json({ success: true, data: result.rows[0], message: 'PDF dihapus.' });
  } catch (err) {
    logger.error(`[CEO_LETTER] delete file failed: ${(err as Error).message}`, { error: err });
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

// ── DELETE /:id (soft delete) ────────────────────────────────
export async function deleteCeoLetter(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const result = await query<{ id: string; file_url: string | null }>(
      `UPDATE pkpt.ceo_letter
          SET deleted_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id, file_url`,
      [id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'CEO Letter tidak ditemukan.' });
    }
    deletePhysicalFile(result.rows[0].file_url);
    logger.info('[CEO_LETTER] deleted', { id, by: req.user!.id });
    return res.json({ success: true, message: 'CEO Letter dihapus.' });
  } catch (err) {
    logger.error(`[CEO_LETTER] delete failed: ${(err as Error).message}`, { error: err });
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}
