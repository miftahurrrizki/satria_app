import { Request, Response } from 'express';
import { query, withTransaction } from '../../config/database';
import logger from '../../utils/logger';
import {
  notifyProgramCompleted, scanDeadlineNotifications,
  notifyProgramCreated, notifyProgramClosed, notifyProgramOnProgress,
} from '../../utils/notifications';
import { parsePagination } from '../../utils/validation';

// Enum values yang valid untuk filter query
const VALID_STATUS_PKPT     = ['Open', 'On Progress', 'Closed'] as const;
const VALID_JENIS_PROGRAM   = ['PKPT', 'Non PKPT'] as const;
const VALID_KATEGORI_ANGGARAN = ['DIPA', 'Non DIPA'] as const;

// ── Helper: hitung estimasi hari kerja (inklusif) ─────────────
function calcEstimasiHari(mulai: string, selesai: string): number {
  const d1 = new Date(mulai);
  const d2 = new Date(selesai);
  const diff = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(1, diff + 1);
}

// ── GET /api/annual-plans ─────────────────────────────────────
export async function getAnnualPlans(req: Request, res: Response) {
  try {
    const {
      status_pkpt, jenis_program, kategori_program, status_program,
      kategori_anggaran, tahun, bulan, search,
    } = req.query;

    // Pagination dengan batas max 100 per halaman — cegah memory spike
    const { page, limit, offset } = parsePagination(req.query.page, req.query.limit, 100);

    const params: unknown[] = [];
    const conditions = ['a.deleted_at IS NULL'];

    // Validasi enum values sebelum masuk ke query
    if (tahun) {
      const tahunNum = Number(tahun);
      if (!Number.isInteger(tahunNum) || tahunNum < 2000 || tahunNum > 2100) {
        return res.status(400).json({ success: false, message: 'Parameter tahun tidak valid.' });
      }
      params.push(tahunNum);
      conditions.push(`EXTRACT(YEAR FROM a.tahun_perencanaan) = $${params.length}`);
    }
    if (status_pkpt) {
      if (!(VALID_STATUS_PKPT as readonly string[]).includes(String(status_pkpt))) {
        return res.status(400).json({ success: false, message: 'Parameter status_pkpt tidak valid.' });
      }
      params.push(status_pkpt);
      conditions.push(`a.status_pkpt = $${params.length}`);
    }
    if (jenis_program) {
      if (!(VALID_JENIS_PROGRAM as readonly string[]).includes(String(jenis_program))) {
        return res.status(400).json({ success: false, message: 'Parameter jenis_program tidak valid.' });
      }
      params.push(jenis_program);
      conditions.push(`a.jenis_program = $${params.length}`);
    }
    if (kategori_program) {
      params.push(kategori_program);
      conditions.push(`a.kategori_program = $${params.length}`);
    }
    if (status_program) {
      params.push(status_program);
      conditions.push(`a.status_program = $${params.length}`);
    }
    if (kategori_anggaran) {
      if (!(VALID_KATEGORI_ANGGARAN as readonly string[]).includes(String(kategori_anggaran))) {
        return res.status(400).json({ success: false, message: 'Parameter kategori_anggaran tidak valid.' });
      }
      params.push(kategori_anggaran);
      conditions.push(`a.kategori_anggaran = $${params.length}`);
    }
    if (bulan) {
      const bulanNum = Number(bulan);
      if (!Number.isInteger(bulanNum) || bulanNum < 1 || bulanNum > 12) {
        return res.status(400).json({ success: false, message: 'Parameter bulan harus antara 1-12.' });
      }
      params.push(bulanNum);
      conditions.push(`$${params.length}::INT BETWEEN EXTRACT(MONTH FROM a.tanggal_mulai)::INT AND EXTRACT(MONTH FROM a.tanggal_selesai)::INT`);
    }
    if (search) {
      // Escape special LIKE characters untuk mencegah ReDoS-like behavior
      const escaped = String(search).replace(/[%_\\]/g, '\\$&');
      params.push(`%${escaped}%`);
      conditions.push(`(a.judul_program ILIKE $${params.length} OR a.auditee ILIKE $${params.length})`);
    }

    // Scope access: SPI leaders lihat semua; auditor lain hanya program yg terlibat
    const role = req.user?.role;
    const isSpiLeader = role === 'kepala_spi' || role === 'admin_spi';
    if (!isSpiLeader && req.user?.id) {
      params.push(req.user.id);
      conditions.push(
        `EXISTS (SELECT 1 FROM pkpt.annual_plan_team t
                 WHERE t.annual_plan_id = a.id AND t.user_id = $${params.length})`,
      );
    }

    const where = conditions.join(' AND ');

    // Count query (tanpa pagination params)
    const countRes = await query<{ count: string }>(
      `SELECT COUNT(*) FROM pkpt.annual_audit_plans a WHERE ${where}`,
      params,
    );

    // Data query — gunakan subquery JOIN (menggantikan 8+ correlated subquery per baris)
    params.push(limit, offset);
    const dataRes = await query(
      `SELECT
          a.id,
          EXTRACT(YEAR FROM a.tahun_perencanaan)::INT AS tahun,
          TO_CHAR(a.tahun_perencanaan, 'YYYY-MM-DD') AS tahun_perencanaan,
          a.jenis_program,
          a.kategori_program,
          a.judul_program,
          a.status_program,
          a.status_pkpt,
          a.auditee,
          a.estimasi_hari,
          TO_CHAR(a.tanggal_mulai,   'YYYY-MM-DD') AS tanggal_mulai,
          TO_CHAR(a.tanggal_selesai, 'YYYY-MM-DD') AS tanggal_selesai,
          a.completed_at,
          a.deskripsi,
          a.created_at,
          a.anggaran,
          a.realisasi_anggaran,
          a.kategori_anggaran,
          a.man_days_estimasi,
          vf.man_days_terpakai,
          vf.persen_pagu_terpakai,
          -- Aggregasi tim dari JOIN (bukan correlated subquery per baris)
          COALESCE(ta.jumlah_personil, 0)  AS jumlah_personil,
          ta.nama_auditor,
          ta.pengendali_teknis_nama,
          ta.pengendali_teknis_id,
          ta.ketua_nama,
          ta.ketua_id,
          ta.anggota_names,
          COALESCE(ra.jumlah_risiko, 0)    AS jumlah_risiko
       FROM pkpt.annual_audit_plans a
       LEFT JOIN pkpt.v_program_finansial vf ON vf.plan_id = a.id
       LEFT JOIN (
         SELECT
           t.annual_plan_id,
           COUNT(*)::INT                                                                      AS jumlah_personil,
           STRING_AGG(u.nama_lengkap, ', ' ORDER BY u.nama_lengkap)                          AS nama_auditor,
           MAX(u.nama_lengkap)  FILTER (WHERE t.role_tim = 'Pengendali Teknis')              AS pengendali_teknis_nama,
           MAX(u.id::text)      FILTER (WHERE t.role_tim = 'Pengendali Teknis')              AS pengendali_teknis_id,
           STRING_AGG(u.nama_lengkap, ', ' ORDER BY u.nama_lengkap)
                                FILTER (WHERE t.role_tim = 'Ketua Tim')                      AS ketua_nama,
           MIN(u.id::text)      FILTER (WHERE t.role_tim = 'Ketua Tim')                      AS ketua_id,
           STRING_AGG(u.nama_lengkap, ', ' ORDER BY u.nama_lengkap)
                                FILTER (WHERE t.role_tim = 'Anggota Tim')                    AS anggota_names
         FROM pkpt.annual_plan_team t
         JOIN auth.users u ON u.id = t.user_id
         GROUP BY t.annual_plan_id
       ) ta ON ta.annual_plan_id = a.id
       LEFT JOIN (
         SELECT annual_plan_id, COUNT(*)::INT AS jumlah_risiko
         FROM pkpt.annual_plan_risks
         GROUP BY annual_plan_id
       ) ra ON ra.annual_plan_id = a.id
       WHERE ${where}
       ORDER BY a.tahun_perencanaan DESC, a.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    const total = Number(countRes.rows[0]?.count ?? 0);
    logger.info('[PLAN] getAnnualPlans executed', { total, page, limit });
    return res.json({
      success: true,
      data: dataRes.rows,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    logger.error(`[PLAN] getAnnualPlans failed: ${(err as Error).message}`, { error: err });
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
}

// ── GET /api/annual-plans/:id ─────────────────────────────────
export async function getAnnualPlanById(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT a.*,
              EXTRACT(YEAR FROM a.tahun_perencanaan)::INT AS tahun,
              -- Override kolom DATE jadi string ISO supaya tidak terkena timezone shift di pg-driver
              TO_CHAR(a.tahun_perencanaan, 'YYYY-MM-DD') AS tahun_perencanaan,
              TO_CHAR(a.tanggal_mulai,     'YYYY-MM-DD') AS tanggal_mulai,
              TO_CHAR(a.tanggal_selesai,   'YYYY-MM-DD') AS tanggal_selesai,
              vf.man_days_terpakai,
              vf.persen_pagu_terpakai
       FROM pkpt.annual_audit_plans a
       LEFT JOIN pkpt.v_program_finansial vf ON vf.plan_id = a.id
       WHERE a.id = $1 AND a.deleted_at IS NULL`,
      [id],
    );
    if (!result.rows[0]) {
      return res.status(404).json({ success: false, message: 'Program tidak ditemukan.' });
    }

    // Scope access check
    const role = req.user?.role;
    const isSpiLeader = role === 'kepala_spi' || role === 'admin_spi';
    if (!isSpiLeader && req.user?.id) {
      const mem = await query(
        `SELECT 1 FROM pkpt.annual_plan_team WHERE annual_plan_id = $1 AND user_id = $2 LIMIT 1`,
        [id, req.user.id],
      );
      if (!mem.rows[0]) {
        return res.status(403).json({ success: false, message: 'Akses ditolak. Anda tidak terlibat dalam program ini.' });
      }
    }

    // Risiko terkait
    const risks = await query(
      `SELECT
         rd.id,
         rd.id_risiko,
         rd.tahun,
         COALESCE(d.nama,  rd.direktorat_nama) AS direktorat,
         COALESCE(dv.nama, rd.divisi_nama)     AS divisi,
         COALESCE(dp.nama, rd.departemen_nama) AS departemen,
         rd.direktorat_id,
         rd.divisi_id,
         rd.departemen_id,
         rd.nama_risiko,
         rd.parameter_kemungkinan,
         rd.tingkat_risiko_inherent,
         rd.skor_inherent,
         rd.level_inherent,
         rd.tingkat_risiko_target,
         rd.skor_target,
         rd.level_target,
         rd.pelaksanaan_mitigasi,
         rd.realisasi_tingkat_risiko,
         rd.skor_realisasi,
         rd.level_realisasi,
         rd.penyebab_internal,
         rd.penyebab_eksternal,
         rd.sasaran_bidang,
         rd.sasaran_korporat_id,
         COALESCE(sk.nama, rd.sasaran_korporat_nama) AS sasaran_korporat,
         rd.source,
         rd.created_at,
         rd.updated_at,
         apr.prioritas
       FROM pkpt.annual_plan_risks apr
       JOIN pkpt.risk_data rd ON rd.id = apr.risk_id
       LEFT JOIN master.direktorat       d  ON d.id  = rd.direktorat_id
       LEFT JOIN master.divisi           dv ON dv.id = rd.divisi_id
       LEFT JOIN master.departemen       dp ON dp.id = rd.departemen_id
       LEFT JOIN master.sasaran_korporat sk ON sk.id = rd.sasaran_korporat_id
       WHERE apr.annual_plan_id = $1
         AND rd.deleted_at IS NULL
       ORDER BY apr.prioritas NULLS LAST`,
      [id],
    );

    // Tim
    const team = await query(
      `SELECT t.id, t.role_tim, t.hari_alokasi,
              u.id AS user_id, u.nama_lengkap, u.role, u.jabatan
       FROM pkpt.annual_plan_team t
       JOIN auth.users u ON u.id = t.user_id
       WHERE t.annual_plan_id = $1
       ORDER BY
         CASE t.role_tim
           WHEN 'Penanggung Jawab'  THEN 1
           WHEN 'Pengendali Teknis' THEN 2
           WHEN 'Ketua Tim'         THEN 3
           WHEN 'Anggota Tim'       THEN 4
         END`,
      [id],
    );

    // CEO Letter areas terkait
    const ceoAreas = await query(
      `SELECT
         apca.ceo_area_id AS id,
         ca.parameter,
         ca.deskripsi,
         ca.prioritas,
         COALESCE(ca.target_tipe, 'Direksi') AS target_tipe,
         COALESCE(ca.target_unit, 'Utama')   AS target_unit,
         cl.judul    AS judul_surat,
         cl.nomor_surat
       FROM pkpt.annual_plan_ceo_areas apca
       JOIN pkpt.ceo_letter_area ca ON ca.id = apca.ceo_area_id
       JOIN pkpt.ceo_letter cl      ON cl.id = ca.ceo_letter_id
      WHERE apca.annual_plan_id = $1
        AND ca.deleted_at IS NULL
        AND cl.deleted_at IS NULL
      ORDER BY ca.target_tipe ASC, ca.urutan ASC`,
      [id],
    );

    logger.info('[PLAN] getAnnualPlanById executed successfully', { planId: id, teamSize: team.rows.length, riskCount: risks.rows.length });
    return res.json({
      success: true,
      data: {
        ...result.rows[0],
        risks: risks.rows,
        team: team.rows,
        ceo_areas: ceoAreas.rows,
        jumlah_personil: team.rows.length,
      },
    });
  } catch (err) {
    logger.error(`[PLAN] getAnnualPlanById failed: ${(err as Error).message}`, { error: err, plan_id: req.params.id });
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
}

// ── POST /api/annual-plans ────────────────────────────────────
export async function createAnnualPlan(req: Request, res: Response) {
  try {
    const {
      tahun_perencanaan, jenis_program, kategori_program, judul_program,
      status_program, auditee, deskripsi, tanggal_mulai, tanggal_selesai,
      anggaran, realisasi_anggaran, kategori_anggaran, man_days_estimasi,
      pengendali_teknis_id, pengendali_teknis_ids,
      ketua_tim_id, ketua_tim_ids, anggota_ids, team_alokasi,
      risk_ids, ceo_area_ids,
    } = req.body;

    if (!judul_program || !jenis_program || !tanggal_mulai || !tanggal_selesai) {
      return res.status(400).json({
        success: false,
        message: 'Field wajib: judul_program, jenis_program, tanggal_mulai, tanggal_selesai.',
      });
    }

    const estimasi_hari = calcEstimasiHari(tanggal_mulai, tanggal_selesai);
    const tahunStr = tahun_perencanaan || `${new Date(tanggal_mulai).getFullYear()}-01-01`;

    const ketuaIds: string[] = Array.isArray(ketua_tim_ids) ? ketua_tim_ids : (ketua_tim_id ? [ketua_tim_id] : []);
    const ptIds: string[]    = Array.isArray(pengendali_teknis_ids) ? pengendali_teknis_ids : (pengendali_teknis_id ? [pengendali_teknis_id] : []);

    const alokasiOf = (uid: string): number | null => {
      const v = team_alokasi?.[uid];
      if (v === null || v === undefined || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? n : null;
    };

    // ── Semua operasi dalam satu transaction ─────────────────
    // Jika salah satu gagal, ROLLBACK otomatis → tidak ada partial insert
    const planId = await withTransaction(async (client) => {
      const result = await client.query<{ id: string }>(
        `INSERT INTO pkpt.annual_audit_plans
           (tahun_perencanaan, jenis_program, kategori_program, judul_program,
            status_program, auditee, deskripsi, estimasi_hari,
            tanggal_mulai, tanggal_selesai, status_pkpt,
            anggaran, realisasi_anggaran, kategori_anggaran, man_days_estimasi,
            created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Open',$11,$12,$13,$14,$15)
         RETURNING id`,
        [
          tahunStr, jenis_program, kategori_program || 'Assurance', judul_program,
          status_program || 'Mandatory', auditee || null, deskripsi || '', estimasi_hari,
          tanggal_mulai, tanggal_selesai,
          anggaran ?? null, realisasi_anggaran ?? null, kategori_anggaran || null,
          man_days_estimasi ?? null, req.user!.id,
        ],
      );
      const id = result.rows[0].id;

      for (const uid of ptIds) {
        await client.query(
          `INSERT INTO pkpt.annual_plan_team (annual_plan_id, user_id, role_tim, hari_alokasi)
           VALUES ($1,$2,'Pengendali Teknis',$3) ON CONFLICT (annual_plan_id, user_id) DO NOTHING`,
          [id, uid, alokasiOf(uid)],
        );
      }
      for (const uid of ketuaIds) {
        await client.query(
          `INSERT INTO pkpt.annual_plan_team (annual_plan_id, user_id, role_tim, hari_alokasi)
           VALUES ($1,$2,'Ketua Tim',$3) ON CONFLICT (annual_plan_id, user_id) DO NOTHING`,
          [id, uid, alokasiOf(uid)],
        );
      }
      if (Array.isArray(anggota_ids)) {
        for (const uid of anggota_ids) {
          await client.query(
            `INSERT INTO pkpt.annual_plan_team (annual_plan_id, user_id, role_tim, hari_alokasi)
             VALUES ($1,$2,'Anggota Tim',$3) ON CONFLICT (annual_plan_id, user_id) DO NOTHING`,
            [id, uid, alokasiOf(uid)],
          );
        }
      }
      if (Array.isArray(risk_ids) && risk_ids.length > 0) {
        for (const [idx, riskId] of risk_ids.entries()) {
          await client.query(
            `INSERT INTO pkpt.annual_plan_risks (annual_plan_id, risk_id, prioritas)
             VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
            [id, riskId, idx + 1],
          );
        }
      }
      if (Array.isArray(ceo_area_ids) && ceo_area_ids.length > 0) {
        for (const areaId of ceo_area_ids) {
          await client.query(
            `INSERT INTO pkpt.annual_plan_ceo_areas (annual_plan_id, ceo_area_id)
             VALUES ($1,$2) ON CONFLICT DO NOTHING`,
            [id, areaId],
          );
        }
      }

      // Audit log — catat siapa yang membuat program ini
      await client.query(
        `INSERT INTO auth.activity_log (user_id, action, modul, entity_id, ip_address)
         VALUES ($1,'CREATE_PLAN','pkpt',$2,$3)`,
        [req.user!.id, id, req.ip],
      );

      return id;
    });

    // Fire-and-forget notification (di luar transaction)
    notifyProgramCreated(planId).catch((err) =>
      logger.error(`[PLAN] notifyProgramCreated error: ${(err as Error).message}`, { planId }),
    );

    logger.info('[PLAN] createAnnualPlan success', { planId, estimasi_hari, user_id: req.user!.id });
    return res.status(201).json({
      success: true,
      message: 'Program kerja berhasil dibuat dengan status Open.',
      data: { id: planId, estimasi_hari },
    });
  } catch (err) {
    logger.error(`[PLAN] createAnnualPlan failed: ${(err as Error).message}`, { error: err });
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
}

// ── PATCH /api/annual-plans/:id ───────────────────────────────
export async function updateAnnualPlan(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const {
      jenis_program, kategori_program, judul_program,
      status_program, auditee, deskripsi,
      tanggal_mulai, tanggal_selesai,
      anggaran, realisasi_anggaran, kategori_anggaran, man_days_estimasi,
      pengendali_teknis_id, pengendali_teknis_ids, ketua_tim_id, ketua_tim_ids, anggota_ids,
      team_alokasi, risk_ids, ceo_area_ids,
    } = req.body;

    // Baca existing di luar transaction (read-only, tidak perlu lock)
    const existing = await query(
      `SELECT id, status_pkpt, tanggal_mulai, tanggal_selesai
       FROM pkpt.annual_audit_plans WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (!existing.rows[0]) {
      return res.status(404).json({ success: false, message: 'Program tidak ditemukan.' });
    }
    if (existing.rows[0].status_pkpt === 'Closed') {
      return res.status(409).json({ success: false, message: 'Program yang sudah Closed tidak dapat diedit.' });
    }

    const newMulai   = tanggal_mulai   || existing.rows[0].tanggal_mulai;
    const newSelesai = tanggal_selesai || existing.rows[0].tanggal_selesai;
    const estimasi_hari = calcEstimasiHari(newMulai, newSelesai);

    const ketuaIdsUpd: string[] = Array.isArray(ketua_tim_ids) ? ketua_tim_ids : (ketua_tim_id ? [ketua_tim_id] : []);
    const ptIdsUpd: string[]    = Array.isArray(pengendali_teknis_ids) ? pengendali_teknis_ids : (pengendali_teknis_id ? [pengendali_teknis_id] : []);

    const alokasiOfUpd = (uid: string): number | null => {
      const v = team_alokasi?.[uid];
      if (v === null || v === undefined || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? n : null;
    };

    const teamChanged = (
      pengendali_teknis_id !== undefined || pengendali_teknis_ids !== undefined ||
      ketua_tim_id !== undefined         || ketua_tim_ids !== undefined         ||
      anggota_ids !== undefined
    );

    // ── Semua write dalam satu transaction ───────────────────
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE pkpt.annual_audit_plans SET
           jenis_program      = COALESCE($1,  jenis_program),
           kategori_program   = COALESCE($2,  kategori_program),
           judul_program      = COALESCE($3,  judul_program),
           status_program     = COALESCE($4,  status_program),
           auditee            = $5,
           deskripsi          = COALESCE($6,  deskripsi),
           tanggal_mulai      = COALESCE($7,  tanggal_mulai),
           tanggal_selesai    = COALESCE($8,  tanggal_selesai),
           estimasi_hari      = $9,
           anggaran           = COALESCE($10, anggaran),
           realisasi_anggaran = COALESCE($11, realisasi_anggaran),
           kategori_anggaran  = COALESCE($12, kategori_anggaran),
           man_days_estimasi  = COALESCE($13, man_days_estimasi),
           updated_by         = $14,
           updated_at         = NOW()
         WHERE id = $15 AND deleted_at IS NULL`,
        [
          jenis_program, kategori_program, judul_program,
          status_program, auditee ?? null, deskripsi,
          tanggal_mulai, tanggal_selesai, estimasi_hari,
          anggaran ?? null, realisasi_anggaran ?? null,
          kategori_anggaran ?? null, man_days_estimasi ?? null,
          req.user!.id, id,
        ],
      );

      if (teamChanged) {
        await client.query(`DELETE FROM pkpt.annual_plan_team WHERE annual_plan_id = $1`, [id]);
        for (const uid of ptIdsUpd) {
          await client.query(
            `INSERT INTO pkpt.annual_plan_team (annual_plan_id, user_id, role_tim, hari_alokasi)
             VALUES ($1,$2,'Pengendali Teknis',$3)`,
            [id, uid, alokasiOfUpd(uid)],
          );
        }
        for (const uid of ketuaIdsUpd) {
          await client.query(
            `INSERT INTO pkpt.annual_plan_team (annual_plan_id, user_id, role_tim, hari_alokasi)
             VALUES ($1,$2,'Ketua Tim',$3)`,
            [id, uid, alokasiOfUpd(uid)],
          );
        }
        if (Array.isArray(anggota_ids)) {
          for (const uid of anggota_ids) {
            await client.query(
              `INSERT INTO pkpt.annual_plan_team (annual_plan_id, user_id, role_tim, hari_alokasi)
               VALUES ($1,$2,'Anggota Tim',$3)`,
              [id, uid, alokasiOfUpd(uid)],
            );
          }
        }
      }

      if (Array.isArray(risk_ids)) {
        await client.query(`DELETE FROM pkpt.annual_plan_risks WHERE annual_plan_id = $1`, [id]);
        for (const [idx, riskId] of risk_ids.entries()) {
          await client.query(
            `INSERT INTO pkpt.annual_plan_risks (annual_plan_id, risk_id, prioritas) VALUES ($1,$2,$3)`,
            [id, riskId, idx + 1],
          );
        }
      }

      if (Array.isArray(ceo_area_ids)) {
        await client.query(`DELETE FROM pkpt.annual_plan_ceo_areas WHERE annual_plan_id = $1`, [id]);
        for (const areaId of ceo_area_ids) {
          await client.query(
            `INSERT INTO pkpt.annual_plan_ceo_areas (annual_plan_id, ceo_area_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
            [id, areaId],
          );
        }
      }

      // Audit log
      await client.query(
        `INSERT INTO auth.activity_log (user_id, action, modul, entity_id, ip_address)
         VALUES ($1,'UPDATE_PLAN','pkpt',$2,$3)`,
        [req.user!.id, id, req.ip],
      );
    });

    logger.info('[PLAN] updateAnnualPlan success', { planId: id, estimasi_hari, user_id: req.user!.id });
    return res.json({ success: true, message: 'Program berhasil diperbarui.', data: { estimasi_hari } });
  } catch (err) {
    logger.error(`[PLAN] updateAnnualPlan failed: ${(err as Error).message}`, { error: err, plan_id: req.params.id });
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
}

// ── DELETE /api/annual-plans/:id (soft delete) ───────────────
export async function deleteAnnualPlan(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const existing = await query(
      `SELECT status_pkpt FROM pkpt.annual_audit_plans WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (!existing.rows[0]) {
      return res.status(404).json({ success: false, message: 'Program tidak ditemukan.' });
    }
    if (existing.rows[0].status_pkpt === 'Closed') {
      return res.status(409).json({ success: false, message: 'Program yang sudah Closed tidak dapat dihapus.' });
    }

    await query(`UPDATE pkpt.annual_audit_plans SET deleted_at = NOW() WHERE id = $1`, [id]);

    // Audit log
    await query(
      `INSERT INTO auth.activity_log (user_id, action, modul, entity_id, ip_address)
       VALUES ($1,'DELETE_PLAN','pkpt',$2,$3)`,
      [req.user!.id, id, req.ip],
    ).catch(() => null);

    logger.info('[PLAN] deleteAnnualPlan success', { planId: id, user_id: req.user!.id });
    return res.json({ success: true, message: 'Program berhasil dihapus.' });
  } catch (err) {
    logger.error(`[PLAN] deleteAnnualPlan failed: ${(err as Error).message}`, { error: err, plan_id: req.params.id });
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
}

// ── GET /api/annual-plans/trash — daftar program yang di-soft-delete ─
export async function getDeletedPlans(req: Request, res: Response) {
  try {
    const tahun = req.query.tahun ? Number(req.query.tahun) : null;
    const params: unknown[] = [];
    let yearCond = '';
    if (tahun) { params.push(tahun); yearCond = `AND EXTRACT(YEAR FROM tahun_perencanaan) = $1`; }

    const result = await query(
      `SELECT id, judul_program, jenis_program, kategori_program, status_pkpt,
              tahun_perencanaan, deleted_at
       FROM pkpt.annual_audit_plans
       WHERE deleted_at IS NOT NULL ${yearCond}
       ORDER BY deleted_at DESC`,
      params,
    );
    return res.json({ success: true, data: result.rows, total: result.rowCount });
  } catch (err) {
    logger.error(`[PLAN] getDeletedPlans failed: ${(err as Error).message}`);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
}

// ── PATCH /api/annual-plans/:id/restore — kembalikan program yang dihapus ─
export async function restoreAnnualPlan(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const result = await query(
      `UPDATE pkpt.annual_audit_plans SET deleted_at = NULL, updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NOT NULL RETURNING id, judul_program`,
      [id],
    );
    if (!result.rows[0]) {
      return res.status(404).json({ success: false, message: 'Program tidak ditemukan di sampah.' });
    }
    logger.info(`[PLAN] restoreAnnualPlan: id=${id}`);
    return res.json({ success: true, message: `Program "${result.rows[0].judul_program}" berhasil dipulihkan.` });
  } catch (err) {
    logger.error(`[PLAN] restoreAnnualPlan failed: ${(err as Error).message}`);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
}

// ── DELETE /api/annual-plans/:id/purge — hapus permanen dari database ─
export async function purgeAnnualPlan(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const existing = await query(
      `SELECT id, judul_program FROM pkpt.annual_audit_plans WHERE id = $1 AND deleted_at IS NOT NULL`,
      [id],
    );
    if (!existing.rows[0]) {
      return res.status(404).json({ success: false, message: 'Program tidak ada di sampah.' });
    }
    // Hapus relasi dulu (team, risks, dll)
    await query(`DELETE FROM pkpt.annual_plan_team  WHERE annual_plan_id = $1`, [id]);
    await query(`DELETE FROM pkpt.annual_plan_risks WHERE annual_plan_id = $1`, [id]);
    await query(`DELETE FROM pkpt.annual_audit_plans WHERE id = $1`, [id]);
    logger.info(`[PLAN] purgeAnnualPlan: id=${id}`);
    return res.json({ success: true, message: `Program dihapus permanen dari database.` });
  } catch (err) {
    logger.error(`[PLAN] purgeAnnualPlan failed: ${(err as Error).message}`);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
}

// ── DELETE /api/annual-plans/trash/purge-all — hapus semua sampah sekaligus ─
export async function purgeAllDeletedPlans(req: Request, res: Response) {
  try {
    const tahun = req.query.tahun ? Number(req.query.tahun) : null;
    const params: unknown[] = [];
    let yearCond = '';
    if (tahun) { params.push(tahun); yearCond = `AND EXTRACT(YEAR FROM tahun_perencanaan) = $1`; }

    const ids = await query(
      `SELECT id FROM pkpt.annual_audit_plans WHERE deleted_at IS NOT NULL ${yearCond}`,
      params,
    );
    for (const row of ids.rows) {
      await query(`DELETE FROM pkpt.annual_plan_team  WHERE annual_plan_id = $1`, [row.id]);
      await query(`DELETE FROM pkpt.annual_plan_risks WHERE annual_plan_id = $1`, [row.id]);
    }
    const del = await query(
      `DELETE FROM pkpt.annual_audit_plans WHERE deleted_at IS NOT NULL ${yearCond} RETURNING id`,
      params,
    );
    logger.info(`[PLAN] purgeAllDeletedPlans: count=${del.rowCount}`);
    return res.json({ success: true, message: `${del.rowCount} program dihapus permanen.`, count: del.rowCount });
  } catch (err) {
    logger.error(`[PLAN] purgeAllDeletedPlans failed: ${(err as Error).message}`);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
}

// ── PATCH /api/annual-plans/:id/finalize ─────────────────────
export async function finalizeAnnualPlan(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await query(
      `UPDATE pkpt.annual_audit_plans
       SET status_pkpt = 'Closed', finalized_by = $1, finalized_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL`,
      [req.user!.id, id],
    );
    notifyProgramClosed(id).catch((err) =>
      logger.error(`[PLAN] notifyProgramClosed error: ${(err as Error).message}`, { planId: id }),
    );

    logger.info('[PLAN] finalizeAnnualPlan executed successfully', { planId: id });
    return res.json({ success: true, message: 'Program PKPT berhasil ditutup (Closed).' });
  } catch (err) {
    logger.error(`[PLAN] finalizeAnnualPlan failed: ${(err as Error).message}`, { error: err, plan_id: req.params.id });
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
}

// ── PATCH /api/annual-plans/:id/mark-completed ────────────────
// Tandai program selesai + trigger notifikasi ke PT & Kepala SPI
export async function markPlanCompleted(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const existing = await query<{ id: string; completed_at: string | null }>(
      `SELECT id, completed_at FROM pkpt.annual_audit_plans
        WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (!existing.rows[0]) {
      return res.status(404).json({ success: false, message: 'Program tidak ditemukan.' });
    }
    if (existing.rows[0].completed_at) {
      return res.status(409).json({ success: false, message: 'Program sudah ditandai selesai.' });
    }

    await query(
      `UPDATE pkpt.annual_audit_plans
          SET completed_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );

    // Fire-and-forget notification — jangan blok response jika gagal
    notifyProgramCompleted(id).catch((err) =>
      logger.error(`[PLAN] notifyProgramCompleted error: ${(err as Error).message}`, { planId: id }),
    );

    logger.info('[PLAN] markPlanCompleted executed successfully', { planId: id });
    return res.json({ success: true, message: 'Program ditandai selesai. Notifikasi penilaian dikirim.' });
  } catch (err) {
    logger.error(`[PLAN] markPlanCompleted failed: ${(err as Error).message}`, { error: err, plan_id: req.params.id });
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
}

// ── PATCH /api/annual-plans/:id/mark-on-progress ──────────────
// Transisi otomatis 'Open' → 'On Progress' saat auditor mulai setup
// pelaksanaan di Modul 2. Idempotent: jika sudah 'On Progress'/'Closed' → no-op.
export async function markPlanOnProgress(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const existing = await query<{ status_pkpt: string }>(
      `SELECT status_pkpt FROM pkpt.annual_audit_plans
        WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (!existing.rows[0]) {
      return res.status(404).json({ success: false, message: 'Program tidak ditemukan.' });
    }
    const current = existing.rows[0].status_pkpt;
    if (current === 'Closed') {
      return res.status(409).json({ success: false, message: 'Program sudah Closed, tidak dapat diubah.' });
    }
    if (current === 'On Progress') {
      return res.json({ success: true, message: 'Program sudah berstatus On Progress.', data: { status_pkpt: 'On Progress' } });
    }

    await query(
      `UPDATE pkpt.annual_audit_plans
          SET status_pkpt = 'On Progress', updated_at = NOW(), updated_by = $1
        WHERE id = $2 AND deleted_at IS NULL`,
      [req.user!.id, id],
    );
    notifyProgramOnProgress(id).catch((err) =>
      logger.error(`[PLAN] notifyProgramOnProgress error: ${(err as Error).message}`, { planId: id }),
    );

    logger.info('[PLAN] markPlanOnProgress executed successfully', { planId: id });
    return res.json({ success: true, message: 'Status program diubah ke On Progress.', data: { status_pkpt: 'On Progress' } });
  } catch (err) {
    logger.error(`[PLAN] markPlanOnProgress failed: ${(err as Error).message}`, { error: err, plan_id: req.params.id });
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
}

// ── POST /api/annual-plans/scan-deadlines ─────────────────────
// Trigger scan notifikasi deadline manual (Kepala SPI / Admin SPI only)
export async function runDeadlineScan(req: Request, res: Response) {
  try {
    const role = req.user?.role;
    if (role !== 'kepala_spi' && role !== 'admin_spi') {
      return res.status(403).json({ success: false, message: 'Hanya Kepala/Admin SPI yang dapat menjalankan scan.' });
    }
    const stats = await scanDeadlineNotifications();
    return res.json({ success: true, data: stats, message: 'Scan deadline selesai.' });
  } catch (err) {
    logger.error(`[PLAN] runDeadlineScan failed: ${(err as Error).message}`, { error: err });
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
}

// ── GET /api/dashboard/stats ──────────────────────────────────
export async function getDashboardStats(req: Request, res: Response) {
  try {
    const tahun = new Date().getFullYear();
    const [pkptCount, finishedCount, unfinishedCount, riskCount, auditorCount] = await Promise.all([
      query<{ count: string }>(
        `SELECT COUNT(*) FROM pkpt.annual_audit_plans
         WHERE EXTRACT(YEAR FROM tahun_perencanaan) = $1 AND deleted_at IS NULL`,
        [tahun],
      ),
      query<{ count: string }>(
        `SELECT COUNT(*) FROM pkpt.annual_audit_plans
         WHERE EXTRACT(YEAR FROM tahun_perencanaan) = $1
           AND status_pkpt = 'Closed' AND deleted_at IS NULL`,
        [tahun],
      ),
      query<{ count: string }>(
        `SELECT COUNT(*) FROM pkpt.annual_audit_plans
         WHERE EXTRACT(YEAR FROM tahun_perencanaan) = $1
           AND status_pkpt != 'Closed' AND deleted_at IS NULL`,
        [tahun],
      ),
      query<{ count: string }>(
        `SELECT COUNT(*) FROM pkpt.risk_data WHERE tahun = $1 AND deleted_at IS NULL`,
        [tahun],
      ),
      query<{ count: string }>(
        `SELECT COUNT(*) FROM auth.users
         WHERE role IN ('kepala_spi','pengendali_teknis','anggota_tim')
           AND is_active = TRUE AND deleted_at IS NULL`,
      ),
    ]);

    logger.info('[PLAN] getDashboardStats executed successfully', { tahun, pkpt_programs: Number(pkptCount.rows[0]?.count ?? 0) });
    return res.json({
      success: true,
      data: {
        pkpt_programs:          Number(pkptCount.rows[0]?.count ?? 0),
        program_selesai:        Number(finishedCount.rows[0]?.count ?? 0),
        program_belum_selesai:  Number(unfinishedCount.rows[0]?.count ?? 0),
        total_risks:            Number(riskCount.rows[0]?.count ?? 0),
        total_auditors:         Number(auditorCount.rows[0]?.count ?? 0),
        tahun,
      },
    });
  } catch (err) {
    logger.error(`[PLAN] getDashboardStats failed: ${(err as Error).message}`, { error: err, tahun: new Date().getFullYear() });
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
}
