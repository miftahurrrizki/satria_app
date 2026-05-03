"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRisks = getRisks;
exports.getTopRisks = getTopRisks;
exports.getRiskById = getRiskById;
exports.createRisk = createRisk;
exports.updateRisk = updateRisk;
exports.deleteRisk = deleteRisk;
exports.importRisks = importRisks;
exports.getRiskLevelRef = getRiskLevelRef;
exports.getSasaranKorporat = getSasaranKorporat;
exports.getRiskStats = getRiskStats;
exports.resetRisks = resetRisks;
exports.downloadRiskTemplate = downloadRiskTemplate;
const XLSX = __importStar(require("xlsx"));
const database_1 = require("../../config/database");
const logger_1 = __importDefault(require("../../utils/logger"));
const notifications_1 = require("../../utils/notifications");
// ── Column list & joins reused across queries ─────────────────
const RISK_LIST_COLS = `
  r.id, r.id_risiko, r.tahun,
  COALESCE(d.nama,  r.direktorat_nama)  AS direktorat,
  COALESCE(dv.nama, r.divisi_nama)      AS divisi,
  COALESCE(dp.nama, r.departemen_nama)  AS departemen,
  r.direktorat_id, r.divisi_id, r.departemen_id,
  r.nama_risiko, r.parameter_kemungkinan,
  r.tingkat_risiko_inherent, r.skor_inherent, r.level_inherent,
  r.tingkat_risiko_target,   r.skor_target,   r.level_target,
  r.pelaksanaan_mitigasi,
  r.realisasi_tingkat_risiko, r.skor_realisasi, r.level_realisasi,
  r.penyebab_internal, r.penyebab_eksternal,
  r.sasaran_bidang, r.sasaran_korporat_id,
  COALESCE(sk.nama, r.sasaran_korporat_nama) AS sasaran_korporat_nama,
  -- House of Strategy
  r.hos_kategori_id,      hk.kode AS hos_kategori_kode, hk.nama_perspektif AS hos_kategori_nama,
  r.sasaran_strategis_id, ss.kode AS sasaran_strategis_kode, ss.nama AS sasaran_strategis_nama,
  ss_parent.nama AS sasaran_strategis_parent_nama,
  l.label       AS label_inherent,
  l.warna_bg    AS bg_inherent,
  l.warna_text  AS text_inherent,
  r.source, r.created_at, r.updated_at`;
const RISK_JOINS = `
  FROM pkpt.risk_data r
  LEFT JOIN master.direktorat       d  ON d.id  = r.direktorat_id
  LEFT JOIN master.divisi           dv ON dv.id = r.divisi_id
  LEFT JOIN master.departemen       dp ON dp.id = r.departemen_id
  LEFT JOIN master.sasaran_korporat sk ON sk.id = r.sasaran_korporat_id
  LEFT JOIN master.house_of_strategy_kategori hk ON hk.id = r.hos_kategori_id
  LEFT JOIN master.sasaran_strategis          ss ON ss.id = r.sasaran_strategis_id
  LEFT JOIN master.sasaran_strategis          ss_parent
         ON ss.kode IS NOT NULL
        AND ss.kode ~ '^[A-Za-z]+\\.[0-9]+\\.'
        AND ss_parent.kode = REGEXP_REPLACE(ss.kode, '^([A-Za-z]+)\\.([0-9]+)\\..+$', '\\1\\2')
        AND ss_parent.tahun = ss.tahun
  LEFT JOIN master.risk_level_ref   l  ON l.kode = r.level_inherent`;
// ── GET /api/risks ────────────────────────────────────────────
async function getRisks(req, res) {
    try {
        const { search, tahun = new Date().getFullYear(), direktorat_id, divisi_id, level_inherent, hos_kategori_id, sasaran_strategis_id, page = '1', limit = '20', } = req.query;
        const params = [Number(tahun)];
        const conds = ['r.deleted_at IS NULL', 'r.tahun = $1'];
        if (search) {
            params.push(`%${search}%`);
            conds.push(`(r.id_risiko ILIKE $${params.length} OR r.nama_risiko ILIKE $${params.length})`);
        }
        if (direktorat_id) {
            params.push(direktorat_id);
            conds.push(`r.direktorat_id = $${params.length}`);
        }
        if (divisi_id) {
            params.push(divisi_id);
            conds.push(`r.divisi_id = $${params.length}`);
        }
        if (level_inherent) {
            params.push(level_inherent);
            conds.push(`r.level_inherent = $${params.length}`);
        }
        if (hos_kategori_id) {
            params.push(hos_kategori_id);
            conds.push(`r.hos_kategori_id = $${params.length}`);
        }
        if (sasaran_strategis_id) {
            params.push(sasaran_strategis_id);
            conds.push(`r.sasaran_strategis_id = $${params.length}`);
        }
        const where = conds.join(' AND ');
        const pg = Math.max(1, Number(page));
        const lim = Math.min(100, Math.max(1, Number(limit)));
        const offset = (pg - 1) * lim;
        const [dataRes, countRes] = await Promise.all([
            (0, database_1.query)(`SELECT ${RISK_LIST_COLS},
          (SELECT COUNT(*)::INT FROM pkpt.annual_plan_risks apr
            JOIN pkpt.annual_audit_plans aap ON aap.id = apr.annual_plan_id
           WHERE apr.risk_id = r.id AND aap.deleted_at IS NULL) AS programs_count,
          (SELECT COALESCE(JSON_AGG(aap2.judul_program ORDER BY aap2.created_at), '[]')
            FROM pkpt.annual_plan_risks apr2
            JOIN pkpt.annual_audit_plans aap2 ON aap2.id = apr2.annual_plan_id
           WHERE apr2.risk_id = r.id AND aap2.deleted_at IS NULL) AS programs
         ${RISK_JOINS}
         WHERE ${where}
         ORDER BY r.skor_inherent DESC NULLS LAST, r.id_risiko
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, lim, offset]),
            (0, database_1.query)(`SELECT COUNT(*)::INT AS total ${RISK_JOINS} WHERE ${where}`, params),
        ]);
        const total = Number(countRes.rows[0]?.total ?? 0);
        logger_1.default.info('[RISK] getRisks executed successfully', { total, page: pg, limit: lim });
        return res.json({
            success: true,
            data: {
                data: dataRes.rows,
                meta: {
                    total,
                    page: pg,
                    limit: lim,
                    totalPages: Math.ceil(total / lim),
                },
            },
        });
    }
    catch (err) {
        logger_1.default.error(`[RISK] getRisks failed: ${err.message}`, { error: err });
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
    }
}
// ── GET /api/risks/top ─────────────────────────────────────────
async function getTopRisks(req, res) {
    try {
        const { tahun = new Date().getFullYear(), n = '20' } = req.query;
        const limit = Math.min(20, Math.max(1, Number(n) || 20));
        const result = await (0, database_1.query)(`SELECT ${RISK_LIST_COLS} ${RISK_JOINS}
       WHERE r.deleted_at IS NULL
         AND r.tahun = $1
         AND r.level_inherent IN ('E', 'T', 'MT')
       ORDER BY
         CASE r.level_inherent WHEN 'E' THEN 1 WHEN 'T' THEN 2 WHEN 'MT' THEN 3 ELSE 9 END,
         r.skor_inherent DESC NULLS LAST,
         r.id_risiko
       LIMIT $2`, [Number(tahun), limit]);
        logger_1.default.info('[RISK] getTopRisks executed successfully', { count: result.rows.length, tahun, limit });
        return res.json({ success: true, data: result.rows, count: result.rows.length });
    }
    catch (err) {
        logger_1.default.error(`[RISK] getTopRisks failed: ${err.message}`, { error: err });
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
    }
}
// ── GET /api/risks/:id ────────────────────────────────────────
async function getRiskById(req, res) {
    try {
        const { id } = req.params;
        const result = await (0, database_1.query)(`SELECT ${RISK_LIST_COLS},
         (SELECT COUNT(*)::INT FROM pkpt.annual_plan_risks apr
           JOIN pkpt.annual_audit_plans aap ON aap.id = apr.annual_plan_id
          WHERE apr.risk_id = r.id AND aap.deleted_at IS NULL) AS programs_count,
         (SELECT COALESCE(JSON_AGG(JSON_BUILD_OBJECT(
             'id', aap2.id,
             'judul_program', aap2.judul_program,
             'status_pkpt', aap2.status_pkpt
           ) ORDER BY aap2.created_at), '[]')
           FROM pkpt.annual_plan_risks apr2
           JOIN pkpt.annual_audit_plans aap2 ON aap2.id = apr2.annual_plan_id
          WHERE apr2.risk_id = r.id AND aap2.deleted_at IS NULL) AS programs
       ${RISK_JOINS}
       WHERE r.id = $1 AND r.deleted_at IS NULL`, [id]);
        if (!result.rows[0]) {
            return res.status(404).json({ success: false, message: 'Risiko tidak ditemukan.' });
        }
        logger_1.default.info('[RISK] getRiskById executed successfully', { riskId: id });
        return res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        logger_1.default.error(`[RISK] getRiskById failed: ${err.message}`, { error: err, risk_id: req.params.id });
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
    }
}
// ── POST /api/risks ───────────────────────────────────────────
async function createRisk(req, res) {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const { id_risiko, tahun, direktorat_id, divisi_id, departemen_id, sasaran_korporat_id, sasaran_bidang, hos_kategori_id, sasaran_strategis_id, nama_risiko, parameter_kemungkinan, tingkat_risiko_inherent, tingkat_risiko_target, pelaksanaan_mitigasi, realisasi_tingkat_risiko, penyebab_internal, penyebab_eksternal, } = req.body;
        if (!nama_risiko || !tahun) {
            return res.status(400).json({
                success: false,
                message: 'Field wajib: nama_risiko, tahun.',
            });
        }
        const finalIdRisiko = (id_risiko || '').trim() ||
            `RR-MNL-${tahun}-${String(Date.now()).slice(-4)}`;
        const [skor_i, level_i] = parseScore(tingkat_risiko_inherent);
        const [skor_t, level_t] = parseScore(tingkat_risiko_target);
        const [skor_r, level_r] = parseScore(realisasi_tingkat_risiko);
        const orgNames = await resolveOrgNames(direktorat_id, divisi_id, departemen_id);
        const skName = await resolveSasaranName(sasaran_korporat_id);
        const result = await (0, database_1.query)(`INSERT INTO pkpt.risk_data (
         id_risiko, tahun,
         direktorat_id, divisi_id, departemen_id,
         direktorat_nama, divisi_nama, departemen_nama,
         sasaran_korporat_id, sasaran_korporat_nama, sasaran_bidang,
         hos_kategori_id, sasaran_strategis_id,
         nama_risiko, parameter_kemungkinan,
         tingkat_risiko_inherent, skor_inherent, level_inherent,
         tingkat_risiko_target,   skor_target,   level_target,
         pelaksanaan_mitigasi,
         realisasi_tingkat_risiko, skor_realisasi, level_realisasi,
         penyebab_internal, penyebab_eksternal,
         source, imported_by
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
         $14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,
         'Manual',$28
       )
       ON CONFLICT (id_risiko, tahun) DO UPDATE SET
         direktorat_id           = EXCLUDED.direktorat_id,
         divisi_id               = EXCLUDED.divisi_id,
         departemen_id           = EXCLUDED.departemen_id,
         direktorat_nama         = EXCLUDED.direktorat_nama,
         divisi_nama             = EXCLUDED.divisi_nama,
         departemen_nama         = EXCLUDED.departemen_nama,
         sasaran_korporat_id     = EXCLUDED.sasaran_korporat_id,
         sasaran_korporat_nama   = EXCLUDED.sasaran_korporat_nama,
         sasaran_bidang          = EXCLUDED.sasaran_bidang,
         hos_kategori_id         = EXCLUDED.hos_kategori_id,
         sasaran_strategis_id    = EXCLUDED.sasaran_strategis_id,
         nama_risiko             = EXCLUDED.nama_risiko,
         parameter_kemungkinan   = EXCLUDED.parameter_kemungkinan,
         tingkat_risiko_inherent = EXCLUDED.tingkat_risiko_inherent,
         skor_inherent           = EXCLUDED.skor_inherent,
         level_inherent          = EXCLUDED.level_inherent,
         tingkat_risiko_target   = EXCLUDED.tingkat_risiko_target,
         skor_target             = EXCLUDED.skor_target,
         level_target            = EXCLUDED.level_target,
         pelaksanaan_mitigasi    = EXCLUDED.pelaksanaan_mitigasi,
         realisasi_tingkat_risiko= EXCLUDED.realisasi_tingkat_risiko,
         skor_realisasi          = EXCLUDED.skor_realisasi,
         level_realisasi         = EXCLUDED.level_realisasi,
         penyebab_internal       = EXCLUDED.penyebab_internal,
         penyebab_eksternal      = EXCLUDED.penyebab_eksternal,
         updated_at              = NOW()
       RETURNING id`, [
            finalIdRisiko, Number(tahun),
            direktorat_id || null, divisi_id || null, departemen_id || null,
            orgNames.dir, orgNames.div, orgNames.dep,
            sasaran_korporat_id || null, skName, sasaran_bidang || null,
            hos_kategori_id || null, sasaran_strategis_id || null,
            nama_risiko, parameter_kemungkinan || null,
            tingkat_risiko_inherent || null, skor_i, level_i,
            tingkat_risiko_target || null, skor_t, level_t,
            pelaksanaan_mitigasi || null,
            realisasi_tingkat_risiko || null, skor_r, level_r,
            penyebab_internal || null, penyebab_eksternal || null,
            userId,
        ]);
        // Notifikasi ke Kepala SPI jika risiko high/critical
        const lvl = (level_i ?? '').toString().toUpperCase();
        if (['HIGH', 'CRITICAL', 'VERY HIGH', 'TINGGI', 'SANGAT TINGGI'].some((k) => lvl.includes(k))) {
            (0, notifications_1.notifyHighRiskAdded)(result.rows[0].id, req.body.nama_risiko ?? '(tanpa nama)', level_i ?? lvl)
                .catch((err) => logger_1.default.error(`[RISK] notifyHighRiskAdded error: ${err.message}`));
        }
        logger_1.default.info('[RISK] createRisk executed successfully', { riskId: finalIdRisiko, tahun, id: result.rows[0].id });
        return res.status(201).json({
            success: true,
            message: 'Risiko berhasil ditambahkan.',
            data: { id: result.rows[0].id },
        });
    }
    catch (err) {
        logger_1.default.error(`[RISK] createRisk failed: ${err.message}`, { error: err, risk_id_risiko: req.body.id_risiko });
        if (err.message?.includes('unique') || err.code === '23505') {
            return res.status(400).json({
                success: false,
                message: 'ID Risiko sudah terdaftar untuk tahun ini.',
            });
        }
        return res.status(500).json({ success: false, message: 'Gagal menyimpan data risiko.' });
    }
}
// ── PATCH /api/risks/:id ──────────────────────────────────────
async function updateRisk(req, res) {
    try {
        const { id } = req.params;
        const existing = await (0, database_1.query)(`SELECT id FROM pkpt.risk_data WHERE id = $1 AND deleted_at IS NULL`, [id]);
        if (!existing.rows[0]) {
            return res.status(404).json({ success: false, message: 'Risiko tidak ditemukan.' });
        }
        const { direktorat_id, divisi_id, departemen_id, sasaran_korporat_id, sasaran_bidang, hos_kategori_id, sasaran_strategis_id, nama_risiko, parameter_kemungkinan, tingkat_risiko_inherent, tingkat_risiko_target, pelaksanaan_mitigasi, realisasi_tingkat_risiko, penyebab_internal, penyebab_eksternal, } = req.body;
        const [skor_i, level_i] = parseScore(tingkat_risiko_inherent);
        const [skor_t, level_t] = parseScore(tingkat_risiko_target);
        const [skor_r, level_r] = parseScore(realisasi_tingkat_risiko);
        const orgNames = await resolveOrgNames(direktorat_id, divisi_id, departemen_id);
        const skName = await resolveSasaranName(sasaran_korporat_id);
        await (0, database_1.query)(`UPDATE pkpt.risk_data SET
         direktorat_id           = COALESCE($1,  direktorat_id),
         divisi_id               = COALESCE($2,  divisi_id),
         departemen_id           = COALESCE($3,  departemen_id),
         direktorat_nama         = COALESCE($4,  direktorat_nama),
         divisi_nama             = COALESCE($5,  divisi_nama),
         departemen_nama         = COALESCE($6,  departemen_nama),
         sasaran_korporat_id     = COALESCE($7,  sasaran_korporat_id),
         sasaran_korporat_nama   = COALESCE($8,  sasaran_korporat_nama),
         sasaran_bidang          = COALESCE($9,  sasaran_bidang),
         hos_kategori_id         = COALESCE($10, hos_kategori_id),
         sasaran_strategis_id    = COALESCE($11, sasaran_strategis_id),
         nama_risiko             = COALESCE($12, nama_risiko),
         parameter_kemungkinan   = COALESCE($13, parameter_kemungkinan),
         tingkat_risiko_inherent = COALESCE($14, tingkat_risiko_inherent),
         skor_inherent           = COALESCE($15, skor_inherent),
         level_inherent          = COALESCE($16, level_inherent),
         tingkat_risiko_target   = COALESCE($17, tingkat_risiko_target),
         skor_target             = COALESCE($18, skor_target),
         level_target            = COALESCE($19, level_target),
         pelaksanaan_mitigasi    = COALESCE($20, pelaksanaan_mitigasi),
         realisasi_tingkat_risiko= COALESCE($21, realisasi_tingkat_risiko),
         skor_realisasi          = COALESCE($22, skor_realisasi),
         level_realisasi         = COALESCE($23, level_realisasi),
         penyebab_internal       = COALESCE($24, penyebab_internal),
         penyebab_eksternal      = COALESCE($25, penyebab_eksternal),
         updated_at              = NOW()
       WHERE id = $26 AND deleted_at IS NULL`, [
            direktorat_id || null, divisi_id || null, departemen_id || null,
            orgNames.dir, orgNames.div, orgNames.dep,
            sasaran_korporat_id || null, skName, sasaran_bidang || null,
            hos_kategori_id || null, sasaran_strategis_id || null,
            nama_risiko || null, parameter_kemungkinan || null,
            tingkat_risiko_inherent || null, skor_i, level_i,
            tingkat_risiko_target || null, skor_t, level_t,
            pelaksanaan_mitigasi || null,
            realisasi_tingkat_risiko || null, skor_r, level_r,
            penyebab_internal || null, penyebab_eksternal || null,
            id,
        ]);
        logger_1.default.info('[RISK] updateRisk executed successfully', { riskId: id });
        return res.json({ success: true, message: 'Risiko berhasil diperbarui.' });
    }
    catch (err) {
        logger_1.default.error(`[RISK] updateRisk failed: ${err.message}`, { error: err, risk_id: req.params.id });
        return res.status(500).json({ success: false, message: 'Gagal memperbarui data risiko.' });
    }
}
// ── DELETE /api/risks/:id (soft delete) ──────────────────────
async function deleteRisk(req, res) {
    try {
        const { id } = req.params;
        const usageCheck = await (0, database_1.query)(`SELECT COUNT(*)::INT AS cnt FROM pkpt.annual_plan_risks WHERE risk_id = $1`, [id]);
        if (Number(usageCheck.rows[0]?.cnt ?? 0) > 0) {
            return res.status(409).json({
                success: false,
                message: 'Risiko ini sudah digunakan dalam Program PKPT dan tidak dapat dihapus.',
            });
        }
        const result = await (0, database_1.query)(`UPDATE pkpt.risk_data SET deleted_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id`, [id]);
        if (!result.rows[0]) {
            return res.status(404).json({ success: false, message: 'Risiko tidak ditemukan.' });
        }
        logger_1.default.info('[RISK] deleteRisk executed successfully', { riskId: id });
        return res.json({ success: true, message: 'Risiko berhasil dihapus.' });
    }
    catch (err) {
        logger_1.default.error(`[RISK] deleteRisk failed: ${err.message}`, { error: err, risk_id: req.params.id });
        return res.status(500).json({ success: false, message: 'Gagal menghapus data risiko.' });
    }
}
// ── POST /api/risks/import — import dari Excel (TRUST atau template) ──
/**
 * Pemetaan fleksibel: normalisasi header → field internal.
 * Mendukung header TRUST (human-readable) dan header template (snake_case).
 * Normalisasi: lowercase + replace non-alphanumeric → "_" + collapse multiple "_".
 */
const HEADER_FIELD_MAP = {
    // Skip
    no: '_skip',
    // Org
    direktorat: 'direktorat_nama',
    direktorat_nama: 'direktorat_nama',
    divisi: 'divisi_nama',
    divisi_nama: 'divisi_nama',
    departemen: 'departemen_nama',
    departemen_nama: 'departemen_nama',
    // Identifikasi
    id_risiko: 'id_risiko',
    tahun: 'tahun',
    // Sasaran
    sasaran_korporat: 'sasaran_korporat_nama',
    sasaran_korporat_nama: 'sasaran_korporat_nama',
    sasaran_bidang: 'sasaran_bidang',
    // Risiko
    nama_risiko_peluang: 'nama_risiko', // "Nama Risiko / Peluang"
    nama_risiko: 'nama_risiko',
    parameter_kemungkinan: 'parameter_kemungkinan',
    // Tingkat risiko (format "43 (MT)" → di-parse otomatis)
    tingkat_risiko_inherent: 'tingkat_risiko_inherent',
    tingkat_risiko_target: 'tingkat_risiko_target',
    pelaksanaan_mitigasi_risiko: 'pelaksanaan_mitigasi', // TRUST label
    pelaksanaan_mitigasi: 'pelaksanaan_mitigasi',
    realisasi_tingkat_risiko_eksisting: 'realisasi_tingkat_risiko', // TRUST label
    realisasi_tingkat_risiko: 'realisasi_tingkat_risiko',
    penyebab_internal: 'penyebab_internal',
    penyebab_eksternal: 'penyebab_eksternal',
    // Kolom terpisah dari template
    skor_inherent: 'skor_inherent',
    level_inherent: 'level_inherent',
    skor_target: 'skor_target',
    level_target: 'level_target',
    skor_realisasi: 'skor_realisasi',
    level_realisasi: 'level_realisasi',
};
function normalizeHeader(h) {
    return h.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}
function levelFromRiskProduct(product) {
    if (product == null || Number.isNaN(product))
        return undefined;
    if (product >= 20 && product <= 25)
        return 'E';
    if (product >= 15 && product <= 19)
        return 'T';
    if (product >= 10 && product <= 14)
        return 'MT';
    if (product >= 5 && product <= 9)
        return 'M';
    if (product === 4)
        return 'RM';
    if (product >= 1 && product <= 3)
        return 'R';
    return undefined;
}
function scoreProductFromRiskCode(scoreCode) {
    const dampak = Math.floor(scoreCode / 10);
    const kemungkinan = scoreCode % 10;
    if (dampak >= 1 && dampak <= 5 && kemungkinan >= 1 && kemungkinan <= 5) {
        return dampak * kemungkinan;
    }
    if (scoreCode >= 1 && scoreCode <= 25)
        return scoreCode;
    return undefined;
}
function parseTingkatRisiko(val) {
    const s = String(val ?? '').trim();
    const m = s.match(/^(\d+)/);
    if (m) {
        const skor = scoreProductFromRiskCode(Number(m[1]));
        return { skor, level: levelFromRiskProduct(skor) };
    }
    return {};
}
async function buildOrgMap(table) {
    const res = await (0, database_1.query)(`SELECT id, LOWER(TRIM(nama)) AS nama FROM ${table} WHERE deleted_at IS NULL`, []);
    return new Map(res.rows.map((r) => [r.nama, r.id]));
}
async function importRisks(req, res) {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'File Excel tidak ditemukan dalam request.' });
        }
        const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (raw.length < 2) {
            return res.status(400).json({ success: false, message: 'File kosong atau hanya berisi header.' });
        }
        // Bangun peta: indeks kolom → field internal
        const headerRow = raw[0];
        const colMap = {};
        for (let i = 0; i < headerRow.length; i++) {
            const norm = normalizeHeader(String(headerRow[i] ?? ''));
            const field = HEADER_FIELD_MAP[norm];
            if (field && field !== '_skip')
                colMap[i] = field;
        }
        const mappedFields = Object.values(colMap);
        if (!mappedFields.includes('nama_risiko')) {
            return res.status(400).json({
                success: false,
                message: 'Kolom "Nama Risiko" tidak ditemukan. Pastikan file menggunakan format template atau ekspor TRUST.',
            });
        }
        // Muat peta nama organisasi → id (satu kali untuk semua baris)
        const [dirMap, divMap, depMap] = await Promise.all([
            buildOrgMap('master.direktorat'),
            buildOrgMap('master.divisi'),
            buildOrgMap('master.departemen'),
        ]);
        const defaultTahun = Number(req.body?.tahun || req.query?.tahun) || new Date().getFullYear();
        let imported = 0;
        let skipped = 0;
        const errors = [];
        const candidates = [];
        for (let rowIdx = 1; rowIdx < raw.length; rowIdx++) {
            const row = raw[rowIdx];
            // Ekstrak nilai ke record berdasarkan peta kolom
            const rec = {};
            for (const [colStr, field] of Object.entries(colMap)) {
                rec[field] = row[Number(colStr)] ?? '';
            }
            const namaRisiko = String(rec.nama_risiko ?? '').trim();
            if (!namaRisiko) {
                skipped++;
                continue;
            }
            // Parse tingkat risiko pedoman: kode "54" = dampak 5 x kemungkinan 4 = skor 20 = E.
            const inherent = parseTingkatRisiko(rec.tingkat_risiko_inherent);
            const target = parseTingkatRisiko(rec.tingkat_risiko_target);
            const real = parseTingkatRisiko(rec.realisasi_tingkat_risiko);
            const skorI = scoreProductFromRiskCode(Number(rec.skor_inherent)) || inherent.skor;
            const levI = levelFromRiskProduct(skorI) || String(rec.level_inherent || '').trim() || inherent.level;
            const skorT = scoreProductFromRiskCode(Number(rec.skor_target)) || target.skor;
            const levT = levelFromRiskProduct(skorT) || String(rec.level_target || '').trim() || target.level;
            const skorR = scoreProductFromRiskCode(Number(rec.skor_realisasi)) || real.skor;
            const levR = levelFromRiskProduct(skorR) || String(rec.level_realisasi || '').trim() || real.level;
            const dirNama = String(rec.direktorat_nama ?? '').trim();
            const divNama = String(rec.divisi_nama ?? '').trim();
            const depNama = String(rec.departemen_nama ?? '').trim();
            const dirId = dirNama ? (dirMap.get(dirNama.toLowerCase()) ?? null) : null;
            const divId = divNama ? (divMap.get(divNama.toLowerCase()) ?? null) : null;
            const depId = depNama ? (depMap.get(depNama.toLowerCase()) ?? null) : null;
            const tahun = Number(rec.tahun) || defaultTahun;
            const idRisiko = String(rec.id_risiko ?? '').trim()
                || `RR-IMP-${tahun}-${String(rowIdx).padStart(4, '0')}-${String(Date.now()).slice(-6)}`;
            if (!['E', 'T', 'MT'].includes(levI ?? '')) {
                skipped++;
                continue;
            }
            candidates.push({
                row: rowIdx + 1,
                level: levI ?? '',
                score: skorI ?? 0,
                values: [
                    idRisiko, tahun,
                    dirId, dirNama || null, divId, divNama || null, depId, depNama || null,
                    String(rec.sasaran_korporat_nama ?? '').trim() || null,
                    String(rec.sasaran_bidang ?? '').trim() || null,
                    namaRisiko,
                    String(rec.parameter_kemungkinan ?? '').trim() || null,
                    String(rec.tingkat_risiko_inherent ?? '').trim() || null, skorI || null, levI || null,
                    String(rec.tingkat_risiko_target ?? '').trim() || null, skorT || null, levT || null,
                    String(rec.pelaksanaan_mitigasi ?? '').trim() || null,
                    String(rec.realisasi_tingkat_risiko ?? '').trim() || null, skorR || null, levR || null,
                    String(rec.penyebab_internal ?? '').trim() || null,
                    String(rec.penyebab_eksternal ?? '').trim() || null,
                ],
            });
        }
        const levelRank = { E: 1, T: 2, MT: 3 };
        const selected = candidates
            .sort((a, b) => (levelRank[a.level] - levelRank[b.level])
            || (b.score - a.score)
            || (a.row - b.row))
            .slice(0, 20);
        skipped += Math.max(0, candidates.length - selected.length);
        for (const candidate of selected) {
            try {
                await (0, database_1.query)(`INSERT INTO pkpt.risk_data
             (id_risiko, tahun,
              direktorat_id, direktorat_nama, divisi_id, divisi_nama, departemen_id, departemen_nama,
              sasaran_korporat_nama, sasaran_bidang,
              nama_risiko, parameter_kemungkinan,
              tingkat_risiko_inherent, skor_inherent, level_inherent,
              tingkat_risiko_target,   skor_target,   level_target,
              pelaksanaan_mitigasi,
              realisasi_tingkat_risiko, skor_realisasi, level_realisasi,
              penyebab_internal, penyebab_eksternal,
              source)
           VALUES
             ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,'Import')
           ON CONFLICT (id_risiko, tahun) DO UPDATE SET
             tahun                    = EXCLUDED.tahun,
             direktorat_id            = EXCLUDED.direktorat_id,
             direktorat_nama          = EXCLUDED.direktorat_nama,
             divisi_id                = EXCLUDED.divisi_id,
             divisi_nama              = EXCLUDED.divisi_nama,
             departemen_id            = EXCLUDED.departemen_id,
             departemen_nama          = EXCLUDED.departemen_nama,
             sasaran_korporat_nama    = EXCLUDED.sasaran_korporat_nama,
             sasaran_bidang           = EXCLUDED.sasaran_bidang,
             nama_risiko              = EXCLUDED.nama_risiko,
             parameter_kemungkinan    = EXCLUDED.parameter_kemungkinan,
             tingkat_risiko_inherent  = EXCLUDED.tingkat_risiko_inherent,
             skor_inherent            = EXCLUDED.skor_inherent,
             level_inherent           = EXCLUDED.level_inherent,
             tingkat_risiko_target    = EXCLUDED.tingkat_risiko_target,
             skor_target              = EXCLUDED.skor_target,
             level_target             = EXCLUDED.level_target,
             pelaksanaan_mitigasi     = EXCLUDED.pelaksanaan_mitigasi,
             realisasi_tingkat_risiko = EXCLUDED.realisasi_tingkat_risiko,
             skor_realisasi           = EXCLUDED.skor_realisasi,
             level_realisasi          = EXCLUDED.level_realisasi,
             penyebab_internal        = EXCLUDED.penyebab_internal,
             penyebab_eksternal       = EXCLUDED.penyebab_eksternal,
             source                   = 'Import',
             updated_at               = NOW()`, candidate.values);
                imported++;
            }
            catch (rowErr) {
                errors.push({ row: candidate.row, message: rowErr.message });
            }
        }
        logger_1.default.info(`[RISK] importRisks: imported=${imported} skipped=${skipped} errors=${errors.length}`);
        if (imported === 0 && errors.length > 0) {
            return res.status(400).json({
                success: false,
                data: { imported, skipped, errors },
                message: `Import gagal: tidak ada data yang berhasil masuk. Error pertama: ${errors[0].message}`,
            });
        }
        return res.json({
            success: true,
            data: { imported, skipped, errors },
            message: `Import selesai: ${imported} data Top Risk diimport, ${skipped} baris dilewati karena kosong, level di bawah MT, atau di luar Top 20${errors.length ? `, ${errors.length} error` : ''}.`,
        });
    }
    catch (err) {
        logger_1.default.error(`[RISK] importRisks failed: ${err.message}`, { error: err });
        return res.status(500).json({ success: false, message: 'Gagal memproses file Excel.' });
    }
}
// ── GET /api/risks/level-ref ──────────────────────────────────
async function getRiskLevelRef(_req, res) {
    try {
        const result = await (0, database_1.query)(`SELECT kode, label, warna_hex, warna_bg, warna_text, skor_min, skor_max, urutan
       FROM master.risk_level_ref
       ORDER BY urutan`);
        logger_1.default.info('[RISK] getRiskLevelRef executed successfully', { count: result.rows.length });
        return res.json({ success: true, data: result.rows });
    }
    catch (err) {
        logger_1.default.error(`[RISK] getRiskLevelRef failed: ${err.message}`, { error: err });
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
    }
}
// ── GET /api/risks/sasaran-korporat ──────────────────────────
async function getSasaranKorporat(_req, res) {
    try {
        const result = await (0, database_1.query)(`SELECT id, kode, nama
       FROM master.sasaran_korporat
       WHERE is_active = TRUE
       ORDER BY kode`);
        logger_1.default.info('[RISK] getSasaranKorporat executed successfully', { count: result.rows.length });
        return res.json({ success: true, data: result.rows });
    }
    catch (err) {
        logger_1.default.error(`[RISK] getSasaranKorporat failed: ${err.message}`, { error: err });
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
    }
}
// ── GET /api/risks/stats ──────────────────────────────────────
async function getRiskStats(req, res) {
    try {
        const { tahun } = req.query;
        const params = [];
        const cond = ['r.deleted_at IS NULL'];
        if (tahun) {
            params.push(Number(tahun));
            cond.push(`r.tahun = $${params.length}`);
        }
        const where = cond.join(' AND ');
        const params2 = [];
        const cond2 = ['deleted_at IS NULL'];
        if (tahun) {
            params2.push(Number(tahun));
            cond2.push(`tahun = $${params2.length}`);
        }
        const where2 = cond2.join(' AND ');
        const [byLevel, byDir, total] = await Promise.all([
            (0, database_1.query)(`SELECT r.level_inherent AS kode, l.label, l.warna_hex, COUNT(*)::INT AS jumlah
         FROM pkpt.risk_data r
         LEFT JOIN master.risk_level_ref l ON l.kode = r.level_inherent
         WHERE ${where}
         GROUP BY r.level_inherent, l.label, l.warna_hex, l.urutan
         ORDER BY l.urutan NULLS LAST`, params),
            (0, database_1.query)(`SELECT COALESCE(d.nama, r.direktorat_nama) AS direktorat, COUNT(*)::INT AS jumlah
         FROM pkpt.risk_data r
         LEFT JOIN master.direktorat d ON d.id = r.direktorat_id
         WHERE ${where}
         GROUP BY COALESCE(d.nama, r.direktorat_nama)
         ORDER BY jumlah DESC`, params),
            (0, database_1.query)(`SELECT COUNT(*)::INT AS total FROM pkpt.risk_data WHERE ${where2}`, params2),
        ]);
        logger_1.default.info('[RISK] getRiskStats executed successfully', { total: total.rows[0]?.total ?? 0, tahun });
        return res.json({
            success: true,
            data: {
                total: total.rows[0]?.total ?? 0,
                by_level: byLevel.rows,
                by_direktorat: byDir.rows,
            },
        });
    }
    catch (err) {
        logger_1.default.error(`[RISK] getRiskStats failed: ${err.message}`, { error: err, tahun: Number(req.query.tahun) });
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
    }
}
// ── Helpers ───────────────────────────────────────────────────
function parseScore(raw) {
    if (!raw)
        return [null, null];
    const parsed = parseTingkatRisiko(raw);
    return [parsed.skor ?? null, parsed.level ?? null];
}
async function resolveOrgNames(dirId, divId, depId) {
    const [dir, div, dep] = await Promise.all([
        dirId ? (0, database_1.query)(`SELECT nama FROM master.direktorat  WHERE id = $1`, [dirId]) : null,
        divId ? (0, database_1.query)(`SELECT nama FROM master.divisi      WHERE id = $1`, [divId]) : null,
        depId ? (0, database_1.query)(`SELECT nama FROM master.departemen  WHERE id = $1`, [depId]) : null,
    ]);
    return {
        dir: dir?.rows[0]?.nama ?? null,
        div: div?.rows[0]?.nama ?? null,
        dep: dep?.rows[0]?.nama ?? null,
    };
}
async function resolveSasaranName(skId) {
    if (!skId)
        return null;
    const r = await (0, database_1.query)(`SELECT nama FROM master.sasaran_korporat WHERE id = $1`, [skId]);
    return r.rows[0]?.nama ?? null;
}
// ── DELETE /api/risks/reset — hapus semua risk_data untuk tahun tertentu ────
async function resetRisks(req, res) {
    try {
        const { tahun } = req.query;
        if (!tahun) {
            return res.status(400).json({ success: false, message: 'Parameter tahun diperlukan.' });
        }
        const yr = Number(tahun);
        // Lepas dulu referensi dari annual_plan_risks
        const refDel = await (0, database_1.query)(`DELETE FROM pkpt.annual_plan_risks
       WHERE risk_id IN (SELECT id FROM pkpt.risk_data WHERE tahun = $1)`, [yr]);
        // Hard delete semua risk_data tahun ini
        const riskDel = await (0, database_1.query)(`DELETE FROM pkpt.risk_data WHERE tahun = $1 RETURNING id`, [yr]);
        const deleted = riskDel.rowCount ?? 0;
        const refs = refDel.rowCount ?? 0;
        logger_1.default.info(`[RISK] resetRisks: tahun=${yr} deleted=${deleted} refsCleared=${refs}`);
        return res.json({
            success: true,
            data: { deleted, refsCleared: refs },
            message: `${deleted} data risiko tahun ${yr} berhasil dihapus${refs ? `, ${refs} referensi program dibersihkan` : ''}.`,
        });
    }
    catch (err) {
        logger_1.default.error(`[RISK] resetRisks failed: ${err.message}`, { error: err });
        return res.status(500).json({ success: false, message: 'Gagal mereset data risiko.' });
    }
}
// ── GET /api/risks/template — download Excel template untuk import ───
async function downloadRiskTemplate(_req, res) {
    try {
        // Kolom mengikuti format ekspor TRUST agar bisa langsung diimport tanpa modifikasi
        const headers = [
            'No',
            'Direktorat',
            'Divisi',
            'Departemen',
            'ID Risiko',
            'Tahun',
            'Sasaran Korporat',
            'Sasaran Bidang',
            'Nama Risiko / Peluang',
            'Parameter Kemungkinan',
            'Tingkat Risiko Inherent',
            'Tingkat Risiko Target',
            'Pelaksanaan Mitigasi Risiko',
            'Realisasi Tingkat Risiko Eksisting',
            'Penyebab Internal',
            'Penyebab Eksternal',
        ];
        const exampleRow = [
            1,
            'Direktorat Operasional dan Keselamatan',
            'Operasional Bus',
            'Operasional Bus Rapid Transit (BRT)',
            'RR-OOB-2026-001',
            new Date().getFullYear(),
            'Indeks Keselamatan Transportasi',
            'Meningkatkan keselamatan penumpang',
            'Keselamatan Penumpang: Kecelakaan Kendaraan',
            'Frekuensi',
            '54 (E)',
            '22 (RM)',
            'Pelatihan driver berkala + audit kendaraan',
            '25 (MT)',
            'Kelelahan driver, pemeliharaan kurang',
            'Kondisi jalan, cuaca ekstrem',
        ];
        const notes = [
            ['PETUNJUK PENGISIAN — Template Import Risiko RCSA SATRIA'],
            [''],
            ['Format kolom sama dengan ekspor TRUST — file TRUST dapat langsung diimport tanpa modifikasi.'],
            [''],
            ['Kolom wajib: "Nama Risiko / Peluang"'],
            ['Kolom "Tahun" opsional — jika kosong akan diisi tahun yang sedang dipilih di aplikasi.'],
            [''],
            ['Format Tingkat Risiko: "SKOR (LEVEL)", contoh: 43 (MT), 22 (RM), 54 (E)'],
            ['SKOR adalah kode Dampak+Kemungkinan. Contoh: 54 = Dampak 5 x Kemungkinan 4 = skor 20 = E.'],
            ['Level yang berlaku:'],
            ['  E  = Ekstrim           Dampak x Kemungkinan 20–25'],
            ['  T  = Tinggi            Dampak x Kemungkinan 15–19'],
            ['  MT = Menengah Tinggi   Dampak x Kemungkinan 10–14'],
            ['  M  = Menengah          Dampak x Kemungkinan 5–9'],
            ['  RM = Rendah Menengah   Dampak x Kemungkinan 4'],
            ['  R  = Rendah            Dampak x Kemungkinan 1–3'],
            [''],
            ['Kolom Direktorat/Divisi/Departemen akan dipetakan otomatis ke master organisasi.'],
            ['Jika nama tidak ditemukan di master, data tetap tersimpan sebagai teks fallback.'],
            [''],
            ['Jika ID Risiko sudah ada di sistem, data akan diperbarui (upsert).'],
            ['Hapus baris contoh sebelum import sesungguhnya.'],
        ];
        const wb = XLSX.utils.book_new();
        const wsData = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
        wsData['!cols'] = headers.map(() => ({ wch: 28 }));
        XLSX.utils.book_append_sheet(wb, wsData, 'Data');
        const wsNotes = XLSX.utils.aoa_to_sheet(notes);
        wsNotes['!cols'] = [{ wch: 90 }];
        XLSX.utils.book_append_sheet(wb, wsNotes, 'Petunjuk');
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="template_import_risiko.xlsx"');
        logger_1.default.info('[RISKS] Template risiko diunduh');
        return res.send(buf);
    }
    catch (err) {
        logger_1.default.error(`[RISKS] Download template gagal: ${err.message}`, { error: err });
        return res.status(500).json({ success: false, message: 'Gagal membuat template Excel.' });
    }
}
//# sourceMappingURL=risk.controller.js.map