/**
 * Module 2 — Perencanaan Pengawasan Individual
 * Controller for audit programs, fase items, tujuan, risiko, prosedur, rincian.
 *
 * Access control:
 *   kepala_spi | admin_spi → all programs
 *   others                 → only programs where req.user.id ∈ annual_plan_team
 */
import { Request, Response } from 'express';
import { query, withTransaction } from '../../config/database';
import logger from '../../utils/logger';

// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────

const FULL_ACCESS_ROLES = ['kepala_spi', 'admin_spi'];

function hasFullAccess(req: Request): boolean {
  return FULL_ACCESS_ROLES.includes(req.user!.role);
}

/** Returns a WHERE clause fragment + params for access-controlled program queries. */
function accessFilter(
  req: Request,
  programAlias = 'ap',
  startIdx = 1,
): { clause: string; params: unknown[] } {
  if (hasFullAccess(req)) {
    return { clause: '', params: [] };
  }
  return {
    clause: `AND EXISTS (
      SELECT 1 FROM pkpt.annual_plan_team apt2
      WHERE apt2.annual_plan_id = ${programAlias}.annual_plan_id
        AND apt2.user_id = $${startIdx}
    )`,
    params: [req.user!.id],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Programs
// ─────────────────────────────────────────────────────────────────────────────

export async function listPrograms(req: Request, res: Response): Promise<void> {
  try {
    const tahun = req.query.tahun ? Number(req.query.tahun) : new Date().getFullYear();

    // Access filter: check membership in pkpt.annual_plan_team (keyed on aap.id)
    const aclClause = hasFullAccess(req)
      ? ''
      : `AND EXISTS (
          SELECT 1 FROM pkpt.annual_plan_team apt2
          WHERE apt2.annual_plan_id = aap.id
            AND apt2.user_id = $2
        )`;
    const aclParams = hasFullAccess(req) ? [] : [req.user!.id];

    // Primary source: pkpt.annual_audit_plans (semua program dari Modul 1)
    // LEFT JOIN penugasan.audit_programs → null jika belum ada program Modul 2
    const sql = `
      SELECT
        ap.id,                                        -- NULL jika belum ada program Modul 2
        aap.id                    AS annual_plan_id,
        aap.judul_program         AS annual_plan_judul,
        aap.jenis_program,
        aap.tanggal_mulai,
        aap.tanggal_selesai,
        aap.man_days_estimasi,
        EXTRACT(YEAR FROM aap.tahun_perencanaan)::integer AS tahun,
        COALESCE(ap.auditee, aap.auditee) AS auditee,
        ap.status,
        ap.created_by,
        ap.created_at,
        ap.updated_at,
        -- Aggregates hanya jika program Modul 2 sudah ada
        CASE WHEN ap.id IS NULL THEN 0 ELSE
          COALESCE((
            SELECT SUM(fi.est_hari) FROM penugasan.fase_items fi
            WHERE fi.program_id = ap.id
          ), 0) +
          COALESCE((
            SELECT SUM(r.est_hari)
            FROM penugasan.rincian r
            JOIN penugasan.prosedur p  ON p.id = r.prosedur_id
            JOIN penugasan.risiko  ri  ON ri.id = p.risiko_id
            JOIN penugasan.tujuan  t   ON t.id  = ri.tujuan_id
            WHERE t.program_id = ap.id
          ), 0)
        END AS total_est_hari,
        CASE WHEN ap.id IS NULL THEN 0 ELSE
          COALESCE((
            SELECT SUM(fi.man_days) FROM penugasan.fase_items fi
            WHERE fi.program_id = ap.id
          ), 0) +
          COALESCE((
            SELECT SUM(r.man_days)
            FROM penugasan.rincian r
            JOIN penugasan.prosedur p  ON p.id = r.prosedur_id
            JOIN penugasan.risiko  ri  ON ri.id = p.risiko_id
            JOIN penugasan.tujuan  t   ON t.id  = ri.tujuan_id
            WHERE t.program_id = ap.id
          ), 0)
        END AS total_man_days,
        CASE WHEN ap.id IS NULL THEN 0 ELSE
          (SELECT COUNT(DISTINCT uid) FROM (
            SELECT fip.user_id AS uid
            FROM penugasan.fase_item_pics fip
            JOIN penugasan.fase_items fi ON fi.id = fip.item_id
            WHERE fi.program_id = ap.id
            UNION
            SELECT rp.user_id AS uid
            FROM penugasan.rincian_pics rp
            JOIN penugasan.rincian r     ON r.id = rp.rincian_id
            JOIN penugasan.prosedur p    ON p.id = r.prosedur_id
            JOIN penugasan.risiko  ri    ON ri.id = p.risiko_id
            JOIN penugasan.tujuan  t     ON t.id  = ri.tujuan_id
            WHERE t.program_id = ap.id
          ) pics)
        END AS unique_pics
      FROM pkpt.annual_audit_plans aap
      LEFT JOIN penugasan.audit_programs ap
        ON ap.annual_plan_id = aap.id
        AND ap.deleted_at IS NULL
      WHERE aap.deleted_at IS NULL
        AND EXTRACT(YEAR FROM aap.tahun_perencanaan)::integer = $1
        ${aclClause}
      ORDER BY aap.created_at DESC
    `;

    const result = await query(sql, [tahun, ...aclParams]);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error(`[penugasan] listPrograms error: ${(err as Error).message}`);
    res.status(500).json({ success: false, message: 'Gagal mengambil daftar program.' });
  }
}

export async function createProgram(req: Request, res: Response): Promise<void> {
  try {
    const { annual_plan_id, auditee } = req.body;

    if (!annual_plan_id) {
      res.status(400).json({ success: false, message: 'annual_plan_id wajib diisi.' });
      return;
    }

    // Validate annual plan exists
    const planRes = await query(
      'SELECT id, tahun_perencanaan, auditee FROM pkpt.annual_audit_plans WHERE id = $1 AND deleted_at IS NULL',
      [annual_plan_id],
    );
    if (planRes.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Program PKPT tidak ditemukan.' });
      return;
    }

    const plan = planRes.rows[0] as { id: string; tahun_perencanaan: string; auditee: string | null };

    // Access check for non-full-access roles
    if (!hasFullAccess(req)) {
      const teamRes = await query(
        'SELECT 1 FROM pkpt.annual_plan_team WHERE annual_plan_id = $1 AND user_id = $2',
        [annual_plan_id, req.user!.id],
      );
      if (teamRes.rowCount === 0) {
        res.status(403).json({ success: false, message: 'Anda tidak memiliki akses ke program PKPT ini.' });
        return;
      }
    }

    const tahun = parseInt(String(plan.tahun_perencanaan), 10) || new Date().getFullYear();
    const resolvedAuditee = auditee ?? plan.auditee ?? null;

    const insertRes = await query<{ id: string }>(
      `INSERT INTO penugasan.audit_programs (annual_plan_id, tahun, auditee, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [annual_plan_id, tahun, resolvedAuditee, req.user!.id],
    );

    res.status(201).json({ success: true, data: { id: insertRes.rows[0].id } });
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException & { code?: string };
    if (e.code === '23505') {
      res.status(409).json({
        success: false,
        message: 'Program perencanaan untuk PKPT ini sudah ada. Gunakan program yang sudah dibuat.',
      });
      return;
    }
    logger.error(`[penugasan] createProgram error: ${(err as Error).message}`);
    res.status(500).json({ success: false, message: 'Gagal membuat program.' });
  }
}

export async function getProgram(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { clause: aclClause, params: aclParams } = accessFilter(req, 'ap', 2);

    // Fetch program header
    const progRes = await query(
      `SELECT ap.*, aap.judul_program AS annual_plan_judul, aap.man_days_estimasi
       FROM penugasan.audit_programs ap
       JOIN pkpt.annual_audit_plans aap ON aap.id = ap.annual_plan_id
       WHERE ap.id = $1 AND ap.deleted_at IS NULL ${aclClause}`,
      [id, ...aclParams],
    );

    if (progRes.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Program tidak ditemukan.' });
      return;
    }

    const program = progRes.rows[0];

    // Fetch fase items (both perencanaan and pelaporan)
    const faseRes = await query(
      `SELECT fi.*, COALESCE(
        json_agg(json_build_object('user_id', u.id, 'nama_lengkap', u.nama_lengkap, 'nik', u.nik))
        FILTER (WHERE u.id IS NOT NULL), '[]'
      ) AS pics
       FROM penugasan.fase_items fi
       LEFT JOIN penugasan.fase_item_pics fip ON fip.item_id = fi.id
       LEFT JOIN auth.users u ON u.id = fip.user_id
       WHERE fi.program_id = $1
       GROUP BY fi.id
       ORDER BY fi.fase, fi.order_index`,
      [id],
    );

    // Fetch all tujuan for this program
    const tujuanRes = await query(
      `SELECT * FROM penugasan.tujuan WHERE program_id = $1 ORDER BY order_index`,
      [id],
    );

    // Fetch all risiko for these tujuan
    const tujuanIds = (tujuanRes.rows as Array<{ id: string }>).map((t) => t.id);
    let risikoRows: unknown[] = [];
    if (tujuanIds.length > 0) {
      const risikoRes = await query(
        `SELECT ri.*, rd.nama_risiko AS risk_ref_nama
         FROM penugasan.risiko ri
         LEFT JOIN pkpt.risk_data rd ON rd.id = ri.risk_ref_id
         WHERE ri.tujuan_id = ANY($1::uuid[])
         ORDER BY ri.order_index`,
        [tujuanIds],
      );
      risikoRows = risikoRes.rows;
    }

    // Fetch all prosedur for these risiko
    const risikoIds = (risikoRows as Array<{ id: string }>).map((r) => r.id);
    let prosedurRows: unknown[] = [];
    if (risikoIds.length > 0) {
      const prosRes = await query(
        `SELECT * FROM penugasan.prosedur WHERE risiko_id = ANY($1::uuid[]) ORDER BY order_index`,
        [risikoIds],
      );
      prosedurRows = prosRes.rows;
    }

    // Fetch all rincian for these prosedur (with PICs)
    const prosedurIds = (prosedurRows as Array<{ id: string }>).map((p) => p.id);
    let rincianRows: unknown[] = [];
    if (prosedurIds.length > 0) {
      const rincRes = await query(
        `SELECT r.*, COALESCE(
          json_agg(json_build_object('user_id', u.id, 'nama_lengkap', u.nama_lengkap, 'nik', u.nik))
          FILTER (WHERE u.id IS NOT NULL), '[]'
        ) AS pics
         FROM penugasan.rincian r
         LEFT JOIN penugasan.rincian_pics rp ON rp.rincian_id = r.id
         LEFT JOIN auth.users u ON u.id = rp.user_id
         WHERE r.prosedur_id = ANY($1::uuid[])
         GROUP BY r.id
         ORDER BY r.order_index`,
        [prosedurIds],
      );
      rincianRows = rincRes.rows;
    }

    // Assemble nested tree in JS
    type RincianRow = { id: string; prosedur_id: string; [k: string]: unknown };
    type ProsedurRow = { id: string; risiko_id: string; [k: string]: unknown };
    type RisikoRow = { id: string; tujuan_id: string; risk_ref_id: string | null; risk_ref_nama: string | null; [k: string]: unknown };
    type TujuanRow = { id: string; program_id: string; [k: string]: unknown };

    const rincianByProsedur = new Map<string, RincianRow[]>();
    for (const r of rincianRows as RincianRow[]) {
      const arr = rincianByProsedur.get(r.prosedur_id) ?? [];
      arr.push(r);
      rincianByProsedur.set(r.prosedur_id, arr);
    }

    const prosedurByRisiko = new Map<string, (ProsedurRow & { rincian: RincianRow[] })[]>();
    for (const p of prosedurRows as ProsedurRow[]) {
      const arr = prosedurByRisiko.get(p.risiko_id) ?? [];
      arr.push({ ...p, rincian: rincianByProsedur.get(p.id) ?? [] });
      prosedurByRisiko.set(p.risiko_id, arr);
    }

    const risikoByTujuan = new Map<string, unknown[]>();
    for (const ri of risikoRows as RisikoRow[]) {
      const arr = risikoByTujuan.get(ri.tujuan_id) ?? [];
      arr.push({
        ...ri,
        risk_ref: ri.risk_ref_id ? { id: ri.risk_ref_id, nama_risiko: ri.risk_ref_nama } : null,
        prosedur: prosedurByRisiko.get(ri.id) ?? [],
      });
      risikoByTujuan.set(ri.tujuan_id, arr);
    }

    const pelaksanaan = (tujuanRes.rows as TujuanRow[]).map((t) => ({
      ...t,
      risiko: risikoByTujuan.get(t.id) ?? [],
    }));

    const faseItems = faseRes.rows as Array<{ fase: string; [k: string]: unknown }>;
    const perencanaan = faseItems.filter((f) => f.fase === 'perencanaan');
    const pelaporan   = faseItems.filter((f) => f.fase === 'pelaporan');

    res.json({
      success: true,
      data: { program, perencanaan, pelaksanaan, pelaporan },
    });
  } catch (err) {
    logger.error(`[penugasan] getProgram error: ${(err as Error).message}`);
    res.status(500).json({ success: false, message: 'Gagal mengambil detail program.' });
  }
}

export async function updateProgram(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { auditee, status } = req.body;

    const fields: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;

    if (auditee !== undefined) { fields.push(`auditee = $${idx++}`); vals.push(auditee); }
    if (status  !== undefined) { fields.push(`status = $${idx++}`);  vals.push(status); }

    if (fields.length === 0) {
      res.status(400).json({ success: false, message: 'Tidak ada field yang diubah.' });
      return;
    }

    fields.push(`updated_at = NOW()`);
    vals.push(id);

    const result = await query(
      `UPDATE penugasan.audit_programs SET ${fields.join(', ')} WHERE id = $${idx} AND deleted_at IS NULL RETURNING id`,
      vals,
    );

    if (result.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Program tidak ditemukan.' });
      return;
    }

    res.json({ success: true, message: 'Program berhasil diperbarui.' });
  } catch (err) {
    logger.error(`[penugasan] updateProgram error: ${(err as Error).message}`);
    res.status(500).json({ success: false, message: 'Gagal memperbarui program.' });
  }
}

export async function deleteProgram(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const result = await query(
      `UPDATE penugasan.audit_programs SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id],
    );
    if (result.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Program tidak ditemukan.' });
      return;
    }
    res.json({ success: true, message: 'Program berhasil dihapus.' });
  } catch (err) {
    logger.error(`[penugasan] deleteProgram error: ${(err as Error).message}`);
    res.status(500).json({ success: false, message: 'Gagal menghapus program.' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fase Items
// ─────────────────────────────────────────────────────────────────────────────

export async function createFaseItem(req: Request, res: Response): Promise<void> {
  try {
    const programId = req.params.id;
    const { fase, title, status, est_hari, man_days, tanggal_jatuh_tempo, pic_ids } = req.body;

    if (!fase || !title) {
      res.status(400).json({ success: false, message: 'fase dan title wajib diisi.' });
      return;
    }

    const orderRes = await query<{ max: number }>(
      'SELECT COALESCE(MAX(order_index), -1) AS max FROM penugasan.fase_items WHERE program_id = $1 AND fase = $2',
      [programId, fase],
    );
    const orderIndex = (orderRes.rows[0].max ?? -1) + 1;

    const newItem = await withTransaction(async (client) => {
      const itemRes = await client.query<{ id: string }>(
        `INSERT INTO penugasan.fase_items
           (program_id, fase, title, order_index, status, est_hari, man_days, tanggal_jatuh_tempo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [programId, fase, title, orderIndex, status ?? 'tidak_dimulai', est_hari ?? null, man_days ?? null, tanggal_jatuh_tempo ?? null],
      );
      const itemId = itemRes.rows[0].id;

      if (Array.isArray(pic_ids) && pic_ids.length > 0) {
        for (const uid of pic_ids) {
          await client.query(
            'INSERT INTO penugasan.fase_item_pics (item_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [itemId, uid],
          );
        }
      }

      const fullItem = await client.query(
        `SELECT fi.*, COALESCE(
          json_agg(json_build_object('user_id', u.id, 'nama_lengkap', u.nama_lengkap, 'nik', u.nik))
          FILTER (WHERE u.id IS NOT NULL), '[]'
        ) AS pics
         FROM penugasan.fase_items fi
         LEFT JOIN penugasan.fase_item_pics fip ON fip.item_id = fi.id
         LEFT JOIN auth.users u ON u.id = fip.user_id
         WHERE fi.id = $1
         GROUP BY fi.id`,
        [itemId],
      );
      return fullItem.rows[0];
    });

    res.status(201).json({ success: true, data: newItem });
  } catch (err) {
    logger.error(`[penugasan] createFaseItem error: ${(err as Error).message}`);
    res.status(500).json({ success: false, message: 'Gagal membuat fase item.' });
  }
}

export async function updateFaseItem(req: Request, res: Response): Promise<void> {
  try {
    const { itemId } = req.params;
    const { title, status, est_hari, man_days, tanggal_jatuh_tempo, pic_ids } = req.body;

    const fields: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;

    if (title               !== undefined) { fields.push(`title = $${idx++}`);                vals.push(title); }
    if (status              !== undefined) { fields.push(`status = $${idx++}`);               vals.push(status); }
    if (est_hari            !== undefined) { fields.push(`est_hari = $${idx++}`);             vals.push(est_hari); }
    if (man_days            !== undefined) { fields.push(`man_days = $${idx++}`);             vals.push(man_days); }
    if (tanggal_jatuh_tempo !== undefined) { fields.push(`tanggal_jatuh_tempo = $${idx++}`); vals.push(tanggal_jatuh_tempo); }

    const updatedItem = await withTransaction(async (client) => {
      if (fields.length > 0) {
        fields.push('updated_at = NOW()');
        vals.push(itemId);
        await client.query(
          `UPDATE penugasan.fase_items SET ${fields.join(', ')} WHERE id = $${idx}`,
          vals,
        );
      }

      if (Array.isArray(pic_ids)) {
        await client.query('DELETE FROM penugasan.fase_item_pics WHERE item_id = $1', [itemId]);
        for (const uid of pic_ids) {
          await client.query(
            'INSERT INTO penugasan.fase_item_pics (item_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [itemId, uid],
          );
        }
      }

      const result = await client.query(
        `SELECT fi.*, COALESCE(
          json_agg(json_build_object('user_id', u.id, 'nama_lengkap', u.nama_lengkap, 'nik', u.nik))
          FILTER (WHERE u.id IS NOT NULL), '[]'
        ) AS pics
         FROM penugasan.fase_items fi
         LEFT JOIN penugasan.fase_item_pics fip ON fip.item_id = fi.id
         LEFT JOIN auth.users u ON u.id = fip.user_id
         WHERE fi.id = $1
         GROUP BY fi.id`,
        [itemId],
      );
      return result.rows[0];
    });

    if (!updatedItem) {
      res.status(404).json({ success: false, message: 'Fase item tidak ditemukan.' });
      return;
    }

    res.json({ success: true, data: updatedItem });
  } catch (err) {
    logger.error(`[penugasan] updateFaseItem error: ${(err as Error).message}`);
    res.status(500).json({ success: false, message: 'Gagal memperbarui fase item.' });
  }
}

export async function deleteFaseItem(req: Request, res: Response): Promise<void> {
  try {
    const { itemId } = req.params;
    const result = await query('DELETE FROM penugasan.fase_items WHERE id = $1 RETURNING id', [itemId]);
    if (result.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Fase item tidak ditemukan.' });
      return;
    }
    res.json({ success: true, message: 'Fase item berhasil dihapus.' });
  } catch (err) {
    logger.error(`[penugasan] deleteFaseItem error: ${(err as Error).message}`);
    res.status(500).json({ success: false, message: 'Gagal menghapus fase item.' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tujuan
// ─────────────────────────────────────────────────────────────────────────────

export async function createTujuan(req: Request, res: Response): Promise<void> {
  try {
    const programId = req.params.id;
    const { title } = req.body;

    if (!title) {
      res.status(400).json({ success: false, message: 'title wajib diisi.' });
      return;
    }

    const countRes = await query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM penugasan.tujuan WHERE program_id = $1',
      [programId],
    );
    const count = parseInt(countRes.rows[0].count, 10);
    const label = `T${count + 1}`;
    const orderIndex = count;

    const insertRes = await query<{ id: string }>(
      `INSERT INTO penugasan.tujuan (program_id, label, title, order_index)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [programId, label, title, orderIndex],
    );

    res.status(201).json({ success: true, data: { ...insertRes.rows[0], risiko: [] } });
  } catch (err) {
    logger.error(`[penugasan] createTujuan error: ${(err as Error).message}`);
    res.status(500).json({ success: false, message: 'Gagal membuat tujuan.' });
  }
}

export async function updateTujuan(req: Request, res: Response): Promise<void> {
  try {
    const { tujuanId } = req.params;
    const { title, label } = req.body;

    const fields: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;

    if (title !== undefined) { fields.push(`title = $${idx++}`); vals.push(title); }
    if (label !== undefined) { fields.push(`label = $${idx++}`); vals.push(label); }

    if (fields.length === 0) {
      res.status(400).json({ success: false, message: 'Tidak ada field yang diubah.' });
      return;
    }

    fields.push('updated_at = NOW()');
    vals.push(tujuanId);

    const result = await query(
      `UPDATE penugasan.tujuan SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      vals,
    );

    if (result.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Tujuan tidak ditemukan.' });
      return;
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error(`[penugasan] updateTujuan error: ${(err as Error).message}`);
    res.status(500).json({ success: false, message: 'Gagal memperbarui tujuan.' });
  }
}

export async function deleteTujuan(req: Request, res: Response): Promise<void> {
  try {
    const { tujuanId } = req.params;
    const result = await query('DELETE FROM penugasan.tujuan WHERE id = $1 RETURNING id', [tujuanId]);
    if (result.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Tujuan tidak ditemukan.' });
      return;
    }
    res.json({ success: true, message: 'Tujuan berhasil dihapus.' });
  } catch (err) {
    logger.error(`[penugasan] deleteTujuan error: ${(err as Error).message}`);
    res.status(500).json({ success: false, message: 'Gagal menghapus tujuan.' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Risiko
// ─────────────────────────────────────────────────────────────────────────────

export async function createRisiko(req: Request, res: Response): Promise<void> {
  try {
    const { tujuanId } = req.params;
    const { title, risk_ref_id, tanggal_jatuh_tempo } = req.body;

    if (!title) {
      res.status(400).json({ success: false, message: 'title wajib diisi.' });
      return;
    }

    // Get program_id from tujuan
    const tujuanRes = await query<{ program_id: string }>(
      'SELECT program_id FROM penugasan.tujuan WHERE id = $1',
      [tujuanId],
    );
    if (tujuanRes.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Tujuan tidak ditemukan.' });
      return;
    }
    const programId = tujuanRes.rows[0].program_id;

    // Count all risiko across whole program for label
    const countRes = await query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM penugasan.risiko ri
       JOIN penugasan.tujuan t ON t.id = ri.tujuan_id
       WHERE t.program_id = $1`,
      [programId],
    );
    const totalCount = parseInt(countRes.rows[0].count, 10);
    const label = `R${totalCount + 1}`;

    // Count per-tujuan for order_index
    const localCountRes = await query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM penugasan.risiko WHERE tujuan_id = $1',
      [tujuanId],
    );
    const localCount = parseInt(localCountRes.rows[0].count, 10);

    const insertRes = await query(
      `INSERT INTO penugasan.risiko (tujuan_id, label, title, risk_ref_id, tanggal_jatuh_tempo, order_index)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [tujuanId, label, title, risk_ref_id ?? null, tanggal_jatuh_tempo ?? null, localCount],
    );

    res.status(201).json({ success: true, data: { ...insertRes.rows[0], prosedur: [] } });
  } catch (err) {
    logger.error(`[penugasan] createRisiko error: ${(err as Error).message}`);
    res.status(500).json({ success: false, message: 'Gagal membuat risiko.' });
  }
}

export async function updateRisiko(req: Request, res: Response): Promise<void> {
  try {
    const { risikoId } = req.params;
    const { title, label, risk_ref_id, tanggal_jatuh_tempo } = req.body;

    const fields: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;

    if (title               !== undefined) { fields.push(`title = $${idx++}`);               vals.push(title); }
    if (label               !== undefined) { fields.push(`label = $${idx++}`);               vals.push(label); }
    if (risk_ref_id         !== undefined) { fields.push(`risk_ref_id = $${idx++}`);         vals.push(risk_ref_id); }
    if (tanggal_jatuh_tempo !== undefined) { fields.push(`tanggal_jatuh_tempo = $${idx++}`); vals.push(tanggal_jatuh_tempo); }

    if (fields.length === 0) {
      res.status(400).json({ success: false, message: 'Tidak ada field yang diubah.' });
      return;
    }

    fields.push('updated_at = NOW()');
    vals.push(risikoId);

    const result = await query(
      `UPDATE penugasan.risiko SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      vals,
    );

    if (result.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Risiko tidak ditemukan.' });
      return;
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error(`[penugasan] updateRisiko error: ${(err as Error).message}`);
    res.status(500).json({ success: false, message: 'Gagal memperbarui risiko.' });
  }
}

export async function deleteRisiko(req: Request, res: Response): Promise<void> {
  try {
    const { risikoId } = req.params;
    const result = await query('DELETE FROM penugasan.risiko WHERE id = $1 RETURNING id', [risikoId]);
    if (result.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Risiko tidak ditemukan.' });
      return;
    }
    res.json({ success: true, message: 'Risiko berhasil dihapus.' });
  } catch (err) {
    logger.error(`[penugasan] deleteRisiko error: ${(err as Error).message}`);
    res.status(500).json({ success: false, message: 'Gagal menghapus risiko.' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Prosedur
// ─────────────────────────────────────────────────────────────────────────────

export async function createProsedur(req: Request, res: Response): Promise<void> {
  try {
    const { risikoId } = req.params;
    const { title, tanggal_jatuh_tempo } = req.body;

    if (!title) {
      res.status(400).json({ success: false, message: 'title wajib diisi.' });
      return;
    }

    // Get program_id via risiko → tujuan
    const risikoRes = await query<{ tujuan_id: string }>(
      'SELECT tujuan_id FROM penugasan.risiko WHERE id = $1',
      [risikoId],
    );
    if (risikoRes.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Risiko tidak ditemukan.' });
      return;
    }
    const tujuanId = risikoRes.rows[0].tujuan_id;

    const tujuanRes = await query<{ program_id: string }>(
      'SELECT program_id FROM penugasan.tujuan WHERE id = $1',
      [tujuanId],
    );
    const programId = tujuanRes.rows[0].program_id;

    // Count all prosedur across whole program for label
    const countRes = await query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM penugasan.prosedur p
       JOIN penugasan.risiko ri  ON ri.id = p.risiko_id
       JOIN penugasan.tujuan t   ON t.id  = ri.tujuan_id
       WHERE t.program_id = $1`,
      [programId],
    );
    const totalCount = parseInt(countRes.rows[0].count, 10);
    const label = `P${totalCount + 1}`;

    // Count per-risiko for order_index
    const localCountRes = await query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM penugasan.prosedur WHERE risiko_id = $1',
      [risikoId],
    );
    const localCount = parseInt(localCountRes.rows[0].count, 10);

    const insertRes = await query(
      `INSERT INTO penugasan.prosedur (risiko_id, label, title, tanggal_jatuh_tempo, order_index)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [risikoId, label, title, tanggal_jatuh_tempo ?? null, localCount],
    );

    res.status(201).json({ success: true, data: { ...insertRes.rows[0], rincian: [] } });
  } catch (err) {
    logger.error(`[penugasan] createProsedur error: ${(err as Error).message}`);
    res.status(500).json({ success: false, message: 'Gagal membuat prosedur.' });
  }
}

export async function updateProsedur(req: Request, res: Response): Promise<void> {
  try {
    const { prosedurId } = req.params;
    const { title, label, tanggal_jatuh_tempo } = req.body;

    const fields: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;

    if (title               !== undefined) { fields.push(`title = $${idx++}`);               vals.push(title); }
    if (label               !== undefined) { fields.push(`label = $${idx++}`);               vals.push(label); }
    if (tanggal_jatuh_tempo !== undefined) { fields.push(`tanggal_jatuh_tempo = $${idx++}`); vals.push(tanggal_jatuh_tempo); }

    if (fields.length === 0) {
      res.status(400).json({ success: false, message: 'Tidak ada field yang diubah.' });
      return;
    }

    fields.push('updated_at = NOW()');
    vals.push(prosedurId);

    const result = await query(
      `UPDATE penugasan.prosedur SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      vals,
    );

    if (result.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Prosedur tidak ditemukan.' });
      return;
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error(`[penugasan] updateProsedur error: ${(err as Error).message}`);
    res.status(500).json({ success: false, message: 'Gagal memperbarui prosedur.' });
  }
}

export async function deleteProsedur(req: Request, res: Response): Promise<void> {
  try {
    const { prosedurId } = req.params;
    const result = await query('DELETE FROM penugasan.prosedur WHERE id = $1 RETURNING id', [prosedurId]);
    if (result.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Prosedur tidak ditemukan.' });
      return;
    }
    res.json({ success: true, message: 'Prosedur berhasil dihapus.' });
  } catch (err) {
    logger.error(`[penugasan] deleteProsedur error: ${(err as Error).message}`);
    res.status(500).json({ success: false, message: 'Gagal menghapus prosedur.' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Rincian
// ─────────────────────────────────────────────────────────────────────────────

export async function createRincian(req: Request, res: Response): Promise<void> {
  try {
    const { prosedurId } = req.params;
    const { title, status, est_hari, man_days, tanggal_jatuh_tempo, pic_ids } = req.body;

    if (!title) {
      res.status(400).json({ success: false, message: 'title wajib diisi.' });
      return;
    }

    const orderRes = await query<{ max: number }>(
      'SELECT COALESCE(MAX(order_index), -1) AS max FROM penugasan.rincian WHERE prosedur_id = $1',
      [prosedurId],
    );
    const orderIndex = (orderRes.rows[0].max ?? -1) + 1;

    const newRincian = await withTransaction(async (client) => {
      const rincRes = await client.query<{ id: string }>(
        `INSERT INTO penugasan.rincian
           (prosedur_id, title, order_index, status, est_hari, man_days, tanggal_jatuh_tempo)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [prosedurId, title, orderIndex, status ?? 'tidak_dimulai', est_hari ?? null, man_days ?? null, tanggal_jatuh_tempo ?? null],
      );
      const rincianId = rincRes.rows[0].id;

      if (Array.isArray(pic_ids) && pic_ids.length > 0) {
        for (const uid of pic_ids) {
          await client.query(
            'INSERT INTO penugasan.rincian_pics (rincian_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [rincianId, uid],
          );
        }
      }

      const fullRincian = await client.query(
        `SELECT r.*, COALESCE(
          json_agg(json_build_object('user_id', u.id, 'nama_lengkap', u.nama_lengkap, 'nik', u.nik))
          FILTER (WHERE u.id IS NOT NULL), '[]'
        ) AS pics
         FROM penugasan.rincian r
         LEFT JOIN penugasan.rincian_pics rp ON rp.rincian_id = r.id
         LEFT JOIN auth.users u ON u.id = rp.user_id
         WHERE r.id = $1
         GROUP BY r.id`,
        [rincianId],
      );
      return fullRincian.rows[0];
    });

    res.status(201).json({ success: true, data: newRincian });
  } catch (err) {
    logger.error(`[penugasan] createRincian error: ${(err as Error).message}`);
    res.status(500).json({ success: false, message: 'Gagal membuat rincian.' });
  }
}

export async function updateRincian(req: Request, res: Response): Promise<void> {
  try {
    const { rincianId } = req.params;
    const { title, status, est_hari, man_days, tanggal_jatuh_tempo, pic_ids } = req.body;

    const fields: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;

    if (title               !== undefined) { fields.push(`title = $${idx++}`);               vals.push(title); }
    if (status              !== undefined) { fields.push(`status = $${idx++}`);              vals.push(status); }
    if (est_hari            !== undefined) { fields.push(`est_hari = $${idx++}`);            vals.push(est_hari); }
    if (man_days            !== undefined) { fields.push(`man_days = $${idx++}`);            vals.push(man_days); }
    if (tanggal_jatuh_tempo !== undefined) { fields.push(`tanggal_jatuh_tempo = $${idx++}`); vals.push(tanggal_jatuh_tempo); }

    const updatedRincian = await withTransaction(async (client) => {
      if (fields.length > 0) {
        fields.push('updated_at = NOW()');
        vals.push(rincianId);
        await client.query(
          `UPDATE penugasan.rincian SET ${fields.join(', ')} WHERE id = $${idx}`,
          vals,
        );
      }

      if (Array.isArray(pic_ids)) {
        await client.query('DELETE FROM penugasan.rincian_pics WHERE rincian_id = $1', [rincianId]);
        for (const uid of pic_ids) {
          await client.query(
            'INSERT INTO penugasan.rincian_pics (rincian_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [rincianId, uid],
          );
        }
      }

      const result = await client.query(
        `SELECT r.*, COALESCE(
          json_agg(json_build_object('user_id', u.id, 'nama_lengkap', u.nama_lengkap, 'nik', u.nik))
          FILTER (WHERE u.id IS NOT NULL), '[]'
        ) AS pics
         FROM penugasan.rincian r
         LEFT JOIN penugasan.rincian_pics rp ON rp.rincian_id = r.id
         LEFT JOIN auth.users u ON u.id = rp.user_id
         WHERE r.id = $1
         GROUP BY r.id`,
        [rincianId],
      );
      return result.rows[0] ?? null;
    });

    if (!updatedRincian) {
      res.status(404).json({ success: false, message: 'Rincian tidak ditemukan.' });
      return;
    }

    res.json({ success: true, data: updatedRincian });
  } catch (err) {
    logger.error(`[penugasan] updateRincian error: ${(err as Error).message}`);
    res.status(500).json({ success: false, message: 'Gagal memperbarui rincian.' });
  }
}

export async function deleteRincian(req: Request, res: Response): Promise<void> {
  try {
    const { rincianId } = req.params;
    const result = await query('DELETE FROM penugasan.rincian WHERE id = $1 RETURNING id', [rincianId]);
    if (result.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Rincian tidak ditemukan.' });
      return;
    }
    res.json({ success: true, message: 'Rincian berhasil dihapus.' });
  } catch (err) {
    logger.error(`[penugasan] deleteRincian error: ${(err as Error).message}`);
    res.status(500).json({ success: false, message: 'Gagal menghapus rincian.' });
  }
}
