/**
 * Modul 3 — Kertas Kerja Audit (KKA), Pelaksanaan, Auditor's Copy
 *
 * Endpoint groups:
 *   1. Program overview & init folder NAS
 *   2. Hierarki + progress (read), update progress per langkah
 *   3. Pengujian notes per langkah
 *   4. Simpulan + temuan per prosedur
 *   5. Evidence upload / list / delete / download
 *   6. NAS health
 *
 * Akses sudah dijaga oleh middleware module3.access — controller cukup fokus pada logic.
 */
import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { query, withTransaction } from '../../config/database';
import * as nas from '../../services/nas.service';
import logger from '../../utils/logger';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Program overview & init folder NAS
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/module3/programs/:programId/overview */
export async function getProgramOverview(req: Request, res: Response, next: NextFunction) {
  try {
    const programId = req.programId!;
    // total_anggota_tim = jumlah DISTINCT user yang menjadi PIC pada kegiatan
    // di program ini (gabungan dari fase_item_pics ∪ rincian_pics).
    // Berbeda dari "tim Modul 1" yang dialokasikan di annual_plan_team.
    const sql = `
      SELECT
        ap.id, ap.annual_plan_id, ap.tahun, ap.auditee, ap.status,
        ap.nas_folder_name, ap.nas_initialized_at,
        aap.judul_program, aap.tanggal_mulai, aap.tanggal_selesai,
        aap.jenis_program, aap.kategori_program, aap.status_program,
        (
          SELECT COUNT(DISTINCT user_id) FROM (
            SELECT fip.user_id
            FROM penugasan.fase_items fi
            JOIN penugasan.fase_item_pics fip ON fip.item_id = fi.id
            WHERE fi.program_id = ap.id
            UNION
            SELECT rp.user_id
            FROM penugasan.rincian r
            JOIN penugasan.prosedur pr ON pr.id = r.prosedur_id
            JOIN penugasan.risiko ri   ON ri.id = pr.risiko_id
            JOIN penugasan.tujuan tu   ON tu.id = ri.tujuan_id
            JOIN penugasan.rincian_pics rp ON rp.rincian_id = r.id
            WHERE tu.program_id = ap.id
          ) AS pic_union
        ) AS total_anggota_tim,
        v.total_langkah, v.langkah_selesai, v.langkah_dalam_proses, v.langkah_belum,
        v.progress_persen, v.total_evidence, v.prosedur_dengan_simpulan
      FROM penugasan.audit_programs ap
      JOIN pkpt.annual_audit_plans aap ON aap.id = ap.annual_plan_id
      LEFT JOIN audit.v_program_progress v ON v.program_id = ap.id
      WHERE ap.id = $1`;
    const r = await query(sql, [programId]);
    if (!r.rowCount) return res.status(404).json({ success: false, message: 'Program tidak ditemukan.' });
    res.json({ success: true, data: r.rows[0] });
  } catch (err) { next(err); }
}

/** POST /api/module3/programs/:programId/init-folder
 *  Buat folder NAS untuk program (idempotent). */
export async function initProgramFolder(req: Request, res: Response, next: NextFunction) {
  try {
    const programId = req.programId!;
    const r = await query<{ judul_program: string; nas_folder_name: string | null }>(
      `SELECT aap.judul_program, ap.nas_folder_name
       FROM penugasan.audit_programs ap
       JOIN pkpt.annual_audit_plans aap ON aap.id = ap.annual_plan_id
       WHERE ap.id = $1`,
      [programId],
    );
    if (!r.rowCount) return res.status(404).json({ success: false, message: 'Program tidak ditemukan.' });

    const { judul_program, nas_folder_name } = r.rows[0];
    const folderName = nas_folder_name ?? nas.sanitizeName(judul_program);
    const fullPath = await nas.ensureProgramFolder(folderName);

    if (!nas_folder_name) {
      await query(
        `UPDATE penugasan.audit_programs
         SET nas_folder_name = $1, nas_initialized_at = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [folderName, programId],
      );
    }

    res.json({
      success: true,
      data: { folderName, fullPath, alreadyExisted: Boolean(nas_folder_name) },
    });
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Hierarki program (tujuan→risiko→prosedur→rincian) lengkap dengan progress
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/module3/programs/:programId/hierarki
 *  Mengembalikan 3 fase: perencanaan (fase_items), pelaksanaan (tree), pelaporan (fase_items). */
export async function getHierarki(req: Request, res: Response, next: NextFunction) {
  try {
    const programId = req.programId!;

    // Fase items (perencanaan + pelaporan) dengan PIC
    const faseRes = await query(
      `SELECT fi.id, fi.fase, fi.title, fi.order_index, fi.status,
              fi.est_hari, fi.man_days, fi.tanggal_jatuh_tempo,
              COALESCE(json_agg(
                json_build_object('user_id', u.id, 'nama', u.nama_lengkap)
                ORDER BY u.nama_lengkap
              ) FILTER (WHERE u.id IS NOT NULL), '[]') AS pics
       FROM penugasan.fase_items fi
       LEFT JOIN penugasan.fase_item_pics fip ON fip.item_id = fi.id
       LEFT JOIN auth.users u ON u.id = fip.user_id
       WHERE fi.program_id = $1
       GROUP BY fi.id
       ORDER BY fi.fase, fi.order_index`,
      [programId],
    );
    const perencanaan = (faseRes.rows as any[]).filter((f) => f.fase === 'perencanaan');
    const pelaporan   = (faseRes.rows as any[]).filter((f) => f.fase === 'pelaporan');

    // Pelaksanaan (tujuan → risiko → prosedur → rincian)
    const tujuanRes = await query(
      `SELECT id, label, title, order_index
       FROM penugasan.tujuan WHERE program_id = $1 ORDER BY order_index`,
      [programId],
    );
    const tujuanIds = tujuanRes.rows.map((t: any) => t.id);

    const risikoRes = tujuanIds.length
      ? await query(
          `SELECT ri.id, ri.tujuan_id, ri.label, ri.title, ri.order_index, ri.tanggal_jatuh_tempo,
                  ri.risk_ref_id, rd.nama_risiko AS risk_ref_nama
           FROM penugasan.risiko ri
           LEFT JOIN pkpt.risk_data rd ON rd.id = ri.risk_ref_id
           WHERE ri.tujuan_id = ANY($1::uuid[])
           ORDER BY ri.order_index`,
          [tujuanIds],
        )
      : { rows: [] };
    const risikoIds = risikoRes.rows.map((r: any) => r.id);

    const prosedurRes = risikoIds.length
      ? await query(
          `SELECT pr.id, pr.risiko_id, pr.label, pr.title, pr.order_index, pr.tanggal_jatuh_tempo,
                  wp.id AS workpaper_id, wp.simpulan, wp.has_temuan, wp.temuan_catatan,
                  wp.finalized_at, wp.finalized_by
           FROM penugasan.prosedur pr
           LEFT JOIN audit.workpaper_prosedur wp
             ON wp.prosedur_id = pr.id AND wp.deleted_at IS NULL
           WHERE pr.risiko_id = ANY($1::uuid[])
           ORDER BY pr.order_index`,
          [risikoIds],
        )
      : { rows: [] };
    const prosedurIds = prosedurRes.rows.map((p: any) => p.id);

    const rincianRes = prosedurIds.length
      ? await query(
          `SELECT
              r.id, r.prosedur_id, r.title, r.order_index, r.status, r.est_hari, r.man_days,
              r.tanggal_jatuh_tempo, r.catatan_pengujian, r.pengujian_updated_at, r.pengujian_updated_by,
              COALESCE(json_agg(
                json_build_object('user_id', u.id, 'nama', u.nama_lengkap)
                ORDER BY u.nama_lengkap
              ) FILTER (WHERE u.id IS NOT NULL), '[]') AS pics,
              (SELECT COUNT(*) FROM audit.workpaper_evidence ev
                WHERE ev.rincian_id = r.id AND ev.deleted_at IS NULL) AS evidence_count
           FROM penugasan.rincian r
           LEFT JOIN penugasan.rincian_pics rp ON rp.rincian_id = r.id
           LEFT JOIN auth.users u ON u.id = rp.user_id
           WHERE r.prosedur_id = ANY($1::uuid[])
           GROUP BY r.id
           ORDER BY r.order_index`,
          [prosedurIds],
        )
      : { rows: [] };

    // Build tree
    const rincianByPros = new Map<string, any[]>();
    for (const r of rincianRes.rows as any[]) {
      const arr = rincianByPros.get(r.prosedur_id) ?? [];
      arr.push(r);
      rincianByPros.set(r.prosedur_id, arr);
    }
    const prosByRis = new Map<string, any[]>();
    for (const p of prosedurRes.rows as any[]) {
      const arr = prosByRis.get(p.risiko_id) ?? [];
      arr.push({ ...p, rincian: rincianByPros.get(p.id) ?? [] });
      prosByRis.set(p.risiko_id, arr);
    }
    const risByTuj = new Map<string, any[]>();
    for (const ri of risikoRes.rows as any[]) {
      const arr = risByTuj.get(ri.tujuan_id) ?? [];
      arr.push({ ...ri, prosedur: prosByRis.get(ri.id) ?? [] });
      risByTuj.set(ri.tujuan_id, arr);
    }
    const pelaksanaan = (tujuanRes.rows as any[]).map((t) => ({
      ...t,
      risiko: risByTuj.get(t.id) ?? [],
    }));

    res.json({ success: true, data: { perencanaan, pelaksanaan, pelaporan } });
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Update progress / deadline / status / PIC per langkah (rincian)
// ─────────────────────────────────────────────────────────────────────────────

/** PATCH /api/module3/rincian/:rincianId/progress */
export async function updateRincianProgress(req: Request, res: Response, next: NextFunction) {
  try {
    const { rincianId } = req.params;
    const { status, tanggal_jatuh_tempo, est_hari, man_days, pic_user_ids } = req.body as {
      status?: 'tidak_dimulai' | 'dalam_proses' | 'selesai';
      tanggal_jatuh_tempo?: string | null;
      est_hari?: number | null;
      man_days?: number | null;
      pic_user_ids?: string[];
    };

    await withTransaction(async (client) => {
      const fields: string[] = [];
      const params: unknown[] = [];
      let i = 1;
      if (status !== undefined) { fields.push(`status = $${i++}`); params.push(status); }
      if (tanggal_jatuh_tempo !== undefined) { fields.push(`tanggal_jatuh_tempo = $${i++}`); params.push(tanggal_jatuh_tempo); }
      if (est_hari !== undefined) { fields.push(`est_hari = $${i++}`); params.push(est_hari); }
      if (man_days !== undefined) { fields.push(`man_days = $${i++}`); params.push(man_days); }
      if (fields.length) {
        fields.push(`updated_at = NOW()`);
        params.push(rincianId);
        await client.query(
          `UPDATE penugasan.rincian SET ${fields.join(', ')} WHERE id = $${i}`,
          params,
        );
      }

      if (Array.isArray(pic_user_ids)) {
        await client.query(`DELETE FROM penugasan.rincian_pics WHERE rincian_id = $1`, [rincianId]);
        for (const uid of pic_user_ids) {
          await client.query(
            `INSERT INTO penugasan.rincian_pics (rincian_id, user_id) VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [rincianId, uid],
          );
        }
      }
    });

    res.json({ success: true });
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Catatan pengujian per langkah (Tab "Pelaksanaan Pengujian")
// ─────────────────────────────────────────────────────────────────────────────

/** PUT /api/module3/rincian/:rincianId/pengujian */
export async function updateCatatanPengujian(req: Request, res: Response, next: NextFunction) {
  try {
    const { rincianId } = req.params;
    const { catatan_pengujian } = req.body as { catatan_pengujian: string | null };
    await query(
      `UPDATE penugasan.rincian
       SET catatan_pengujian = $1, pengujian_updated_by = $2, pengujian_updated_at = NOW(), updated_at = NOW()
       WHERE id = $3`,
      [catatan_pengujian, req.user!.id, rincianId],
    );
    res.json({ success: true });
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Simpulan + temuan per PROSEDUR (Tab "KKA & Simpulan")
// ─────────────────────────────────────────────────────────────────────────────

/** PUT /api/module3/prosedur/:prosedurId/simpulan
 *  Upsert simpulan untuk prosedur. */
export async function upsertSimpulan(req: Request, res: Response, next: NextFunction) {
  try {
    const { prosedurId } = req.params;
    const { simpulan, has_temuan, temuan_catatan, finalized } = req.body as {
      simpulan?: string | null;
      has_temuan?: boolean;
      temuan_catatan?: string | null;
      finalized?: boolean;
    };
    if (has_temuan && !temuan_catatan) {
      return res.status(400).json({ success: false, message: 'temuan_catatan wajib jika has_temuan = true.' });
    }
    const programId = req.programId!;
    const userId = req.user!.id;

    const r = await query(
      `INSERT INTO audit.workpaper_prosedur
         (prosedur_id, program_id, simpulan, has_temuan, temuan_catatan, finalized_at, finalized_by, created_by)
       VALUES ($1,$2,$3,COALESCE($4,FALSE),$5,
               CASE WHEN $6 = TRUE THEN NOW() ELSE NULL END,
               CASE WHEN $6 = TRUE THEN $7 ELSE NULL END,
               $7)
       ON CONFLICT (prosedur_id) DO UPDATE SET
         simpulan       = EXCLUDED.simpulan,
         has_temuan     = EXCLUDED.has_temuan,
         temuan_catatan = EXCLUDED.temuan_catatan,
         finalized_at   = CASE WHEN $6 = TRUE THEN NOW()         ELSE audit.workpaper_prosedur.finalized_at END,
         finalized_by   = CASE WHEN $6 = TRUE THEN $7            ELSE audit.workpaper_prosedur.finalized_by END,
         updated_by     = $7,
         updated_at     = NOW()
       RETURNING *`,
      [prosedurId, programId, simpulan ?? null, has_temuan ?? false, temuan_catatan ?? null, finalized ?? false, userId],
    );
    res.json({ success: true, data: r.rows[0] });
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Evidence file per langkah (Tab "Auditor's Copy")
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/module3/rincian/:rincianId/evidence
 *  Upload satu file evidence (multipart/form-data, field: file).
 *  Multer-disk-storage menulis langsung ke NAS path saat memproses request body — streaming. */
export async function uploadEvidence(req: Request, res: Response, next: NextFunction) {
  try {
    const { rincianId } = req.params;
    const programId = req.programId!;
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, message: 'File tidak ditemukan di body request.' });
    }
    // multer sudah tulis file ke NAS via storage di routes. Kita tinggal record DB.
    const relativePath = (req as any).nasRelativePath as string;
    const subfolder    = (req as any).nasSubfolder    as string | undefined;

    const r = await query(
      `INSERT INTO audit.workpaper_evidence
         (rincian_id, program_id, nama_file, nama_asli, nas_relative_path, nas_subfolder,
          ukuran_byte, mime_type, deskripsi, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        rincianId, programId,
        path.basename(file.path),
        file.originalname,
        relativePath,
        subfolder ?? null,
        file.size, file.mimetype,
        req.body?.deskripsi ?? null,
        req.user!.id,
      ],
    );
    // Tambahkan absolute path NAS untuk display di FE
    const progRes = await query<{ nas_folder_name: string }>(
      `SELECT nas_folder_name FROM penugasan.audit_programs WHERE id = $1`, [programId],
    );
    const nasAbsolutePath = nas.buildAbsoluteDisplay(progRes.rows[0].nas_folder_name, relativePath);
    res.status(201).json({ success: true, data: { ...r.rows[0], nas_absolute_path: nasAbsolutePath } });
  } catch (err) {
    // Kalau insert DB gagal tapi file sudah masuk NAS → bersihkan
    if (req.file?.path) {
      fs.promises.unlink(req.file.path).catch(() => {});
    }
    next(err);
  }
}

/** GET /api/module3/rincian/:rincianId/evidence */
export async function listEvidenceForRincian(req: Request, res: Response, next: NextFunction) {
  try {
    const { rincianId } = req.params;
    const r = await query(
      `SELECT ev.id, ev.nama_file, ev.nama_asli, ev.nas_relative_path, ev.nas_subfolder,
              ev.ukuran_byte, ev.mime_type, ev.deskripsi, ev.uploaded_at,
              u.id AS uploaded_by_id, u.nama_lengkap AS uploaded_by_nama
       FROM audit.workpaper_evidence ev
       JOIN auth.users u ON u.id = ev.uploaded_by
       WHERE ev.rincian_id = $1 AND ev.deleted_at IS NULL
       ORDER BY ev.uploaded_at DESC`,
      [rincianId],
    );
    res.json({ success: true, data: r.rows });
  } catch (err) { next(err); }
}

/** GET /api/module3/programs/:programId/evidence  (semua evidence di program — untuk Repository view) */
export async function listEvidenceForProgram(req: Request, res: Response, next: NextFunction) {
  try {
    const programId = req.programId!;
    const r = await query(
      `SELECT ev.id, ev.rincian_id, ev.nama_file, ev.nama_asli, ev.nas_relative_path, ev.nas_subfolder,
              ev.ukuran_byte, ev.mime_type, ev.deskripsi, ev.uploaded_at,
              u.nama_lengkap AS uploaded_by_nama,
              ri.title AS rincian_title,
              pr.title AS prosedur_title
       FROM audit.workpaper_evidence ev
       JOIN auth.users u           ON u.id = ev.uploaded_by
       JOIN penugasan.rincian ri   ON ri.id = ev.rincian_id
       JOIN penugasan.prosedur pr  ON pr.id = ri.prosedur_id
       WHERE ev.program_id = $1 AND ev.deleted_at IS NULL
       ORDER BY ev.uploaded_at DESC`,
      [programId],
    );
    res.json({ success: true, data: r.rows });
  } catch (err) { next(err); }
}

/** GET /api/module3/evidence/:evidenceId/download */
export async function downloadEvidence(req: Request, res: Response, next: NextFunction) {
  try {
    const { evidenceId } = req.params;
    const r = await query<{
      nama_asli: string; mime_type: string | null; nas_relative_path: string;
      nas_folder_name: string;
    }>(
      `SELECT ev.nama_asli, ev.mime_type, ev.nas_relative_path, ap.nas_folder_name
       FROM audit.workpaper_evidence ev
       JOIN penugasan.audit_programs ap ON ap.id = ev.program_id
       WHERE ev.id = $1 AND ev.deleted_at IS NULL`,
      [evidenceId],
    );
    if (!r.rowCount) return res.status(404).json({ success: false, message: 'File tidak ditemukan.' });
    const { nama_asli, mime_type, nas_relative_path, nas_folder_name } = r.rows[0];

    const exists = await nas.fileExists(nas_folder_name, nas_relative_path);
    if (!exists) {
      return res.status(410).json({
        success: false,
        message: 'File fisik di NAS tidak ditemukan. Pastikan koneksi NAS aktif.',
      });
    }
    const stream = nas.createReadStream(nas_folder_name, nas_relative_path);
    if (mime_type) res.setHeader('Content-Type', mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(nama_asli)}"`);
    stream.on('error', (err) => {
      logger.error(`[NAS] download stream error: ${err.message}`);
      if (!res.headersSent) res.status(500).end();
    });
    stream.pipe(res);
  } catch (err) { next(err); }
}

/** DELETE /api/module3/evidence/:evidenceId */
export async function deleteEvidence(req: Request, res: Response, next: NextFunction) {
  try {
    const { evidenceId } = req.params;
    const r = await query<{ nas_relative_path: string; nas_folder_name: string }>(
      `SELECT ev.nas_relative_path, ap.nas_folder_name
       FROM audit.workpaper_evidence ev
       JOIN penugasan.audit_programs ap ON ap.id = ev.program_id
       WHERE ev.id = $1 AND ev.deleted_at IS NULL`,
      [evidenceId],
    );
    if (!r.rowCount) return res.status(404).json({ success: false, message: 'Evidence tidak ditemukan.' });
    const { nas_relative_path, nas_folder_name } = r.rows[0];

    await query(
      `UPDATE audit.workpaper_evidence SET deleted_at = NOW(), deleted_by = $1 WHERE id = $2`,
      [req.user!.id, evidenceId],
    );
    // Best-effort hapus file fisik
    try {
      await nas.deleteFile(nas_folder_name, nas_relative_path);
    } catch (err) {
      logger.warn(`[NAS] gagal hapus file fisik: ${(err as Error).message}`);
    }
    res.json({ success: true });
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. NAS browser (Tab "Auditor's Copy" repository view)
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/module3/programs/:programId/nas/list?subPath=... */
export async function listProgramNas(req: Request, res: Response, next: NextFunction) {
  try {
    const programId = req.programId!;
    const subPath = String(req.query.subPath ?? '');
    const r = await query<{ nas_folder_name: string | null }>(
      `SELECT nas_folder_name FROM penugasan.audit_programs WHERE id = $1`,
      [programId],
    );
    const folder = r.rows[0]?.nas_folder_name;
    if (!folder) {
      return res.json({ success: true, data: [], folderInitialized: false });
    }
    const entries = await nas.listFolder(folder, subPath);
    res.json({ success: true, data: entries, folderInitialized: true });
  } catch (err) { next(err); }
}

/** GET /api/module3/programs/:programId/nas/folders
 *  Return tree semua folder di program — untuk folder picker di UI upload. */
export async function listProgramFolders(req: Request, res: Response, next: NextFunction) {
  try {
    const programId = req.programId!;
    const r = await query<{ nas_folder_name: string | null }>(
      `SELECT nas_folder_name FROM penugasan.audit_programs WHERE id = $1`,
      [programId],
    );
    const folder = r.rows[0]?.nas_folder_name;
    if (!folder) {
      return res.json({ success: true, data: { tree: [], folderInitialized: false } });
    }
    const tree = await nas.listFoldersTree(folder);
    res.json({
      success: true,
      data: { tree, folderInitialized: true, basePath: nas.getBasePath(), programFolder: folder },
    });
  } catch (err) { next(err); }
}

/** POST /api/module3/programs/:programId/nas/folders
 *  Body: { parentRelativePath?: string, name: string }
 *  Buat folder custom di dalam folder program. */
export async function createProgramFolder(req: Request, res: Response, next: NextFunction) {
  try {
    const programId = req.programId!;
    const { parentRelativePath = '', name } = req.body as { parentRelativePath?: string; name?: string };
    if (!name?.trim()) {
      return res.status(400).json({ success: false, message: 'Nama folder wajib diisi.' });
    }
    const r = await query<{ nas_folder_name: string | null; judul_program: string }>(
      `SELECT ap.nas_folder_name, aap.judul_program
       FROM penugasan.audit_programs ap
       JOIN pkpt.annual_audit_plans aap ON aap.id = ap.annual_plan_id
       WHERE ap.id = $1`,
      [programId],
    );
    if (!r.rowCount) return res.status(404).json({ success: false, message: 'Program tidak ditemukan.' });

    let folderName = r.rows[0].nas_folder_name;
    if (!folderName) {
      folderName = nas.sanitizeName(r.rows[0].judul_program);
      await nas.ensureProgramFolder(folderName);
      await query(
        `UPDATE penugasan.audit_programs
         SET nas_folder_name = $1, nas_initialized_at = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [folderName, programId],
      );
    }
    const created = await nas.createCustomFolder(folderName, parentRelativePath, name.trim());
    res.status(201).json({ success: true, data: created });
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. NAS health check
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/module3/nas/health */
export async function nasHealth(_req: Request, res: Response, next: NextFunction) {
  try {
    const status = await nas.healthCheck();
    res.json({ success: true, data: status });
  } catch (err) { next(err); }
}
