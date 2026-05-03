"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPendingEvaluations = getPendingEvaluations;
exports.submitEvaluation = submitEvaluation;
exports.getEvaluationSummary = getEvaluationSummary;
exports.getAuditorEvaluationDetail = getAuditorEvaluationDetail;
const database_1 = require("../../config/database");
const logger_1 = __importDefault(require("../../utils/logger"));
// ── GET /api/evaluations/pending ──────────────────────────────
// Daftar yang perlu dinilai oleh user login (PT / Kepala SPI).
async function getPendingEvaluations(req, res) {
    try {
        const role = req.user?.role;
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ success: false, message: 'Tidak terautentikasi.' });
        let stage = null;
        if (role === 'pengendali_teknis')
            stage = 'pengendali_teknis';
        else if (role === 'kepala_spi' || role === 'admin_spi')
            stage = 'kepala_spi';
        else {
            return res.json({ success: true, data: [] });
        }
        // Cari program selesai yang perlu dinilai oleh user
        // - Untuk PT: program di mana user adalah Pengendali Teknis
        // - Untuk Kepala SPI: semua program selesai
        const planQuery = stage === 'pengendali_teknis'
            ? `SELECT a.id, a.judul_program, a.completed_at
         FROM pkpt.annual_audit_plans a
         JOIN pkpt.annual_plan_team t ON t.annual_plan_id = a.id
         WHERE a.deleted_at IS NULL
           AND a.completed_at IS NOT NULL
           AND t.user_id = $1
           AND t.role_tim = 'Pengendali Teknis'
         ORDER BY a.completed_at DESC`
            : `SELECT a.id, a.judul_program, a.completed_at
         FROM pkpt.annual_audit_plans a
         WHERE a.deleted_at IS NULL
           AND a.completed_at IS NOT NULL
         ORDER BY a.completed_at DESC`;
        // Query pengendali_teknis butuh [userId] sebagai $1.
        // Query kepala_spi tidak punya parameter — jangan kirim [userId].
        const plans = await (0, database_1.query)(planQuery, stage === 'pengendali_teknis' ? [userId] : []);
        if (plans.rows.length === 0) {
            return res.json({ success: true, data: [] });
        }
        const planIds = plans.rows.map((p) => p.id);
        // Evaluatees: Ketua Tim + Anggota Tim dari program tsb
        const evaluatees = await (0, database_1.query)(`SELECT t.annual_plan_id, u.id AS user_id, u.nama_lengkap, t.role_tim
       FROM pkpt.annual_plan_team t
       JOIN auth.users u ON u.id = t.user_id
       WHERE t.annual_plan_id = ANY($1::uuid[])
         AND t.role_tim IN ('Ketua Tim','Anggota Tim')`, [planIds]);
        // Existing evaluations di stage ini
        const done = await (0, database_1.query)(`SELECT annual_plan_id, evaluatee_id FROM penilaian.auditor_evaluations
       WHERE annual_plan_id = ANY($1::uuid[]) AND stage = $2`, [planIds, stage]);
        const doneSet = new Set(done.rows.map((r) => `${r.annual_plan_id}|${r.evaluatee_id}`));
        // Untuk stage kepala_spi, hanya munculkan jika PT sudah selesai menilai
        let ptDoneSet = null;
        if (stage === 'kepala_spi') {
            const ptDone = await (0, database_1.query)(`SELECT annual_plan_id, evaluatee_id FROM penilaian.auditor_evaluations
         WHERE annual_plan_id = ANY($1::uuid[]) AND stage = 'pengendali_teknis'`, [planIds]);
            ptDoneSet = new Set(ptDone.rows.map((r) => `${r.annual_plan_id}|${r.evaluatee_id}`));
        }
        const result = plans.rows.map((p) => ({
            plan_id: p.id,
            judul_program: p.judul_program,
            completed_at: p.completed_at,
            evaluatees: evaluatees.rows
                .filter((e) => e.annual_plan_id === p.id)
                .map((e) => {
                const key = `${p.id}|${e.user_id}`;
                return {
                    user_id: e.user_id,
                    nama_lengkap: e.nama_lengkap,
                    role_tim: e.role_tim,
                    already_evaluated: doneSet.has(key),
                    blocked: ptDoneSet ? !ptDoneSet.has(key) : false,
                };
            }),
        }));
        return res.json({ success: true, data: result, stage });
    }
    catch (err) {
        logger_1.default.error(`[EVAL] getPendingEvaluations failed: ${err.message}`);
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
    }
}
// ── POST /api/evaluations ─────────────────────────────────────
async function submitEvaluation(req, res) {
    try {
        const role = req.user?.role;
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ success: false, message: 'Tidak terautentikasi.' });
        const stage = role === 'pengendali_teknis' ? 'pengendali_teknis'
            : (role === 'kepala_spi' || role === 'admin_spi') ? 'kepala_spi'
                : null;
        if (!stage) {
            return res.status(403).json({ success: false, message: 'Role tidak berhak menilai.' });
        }
        const { annual_plan_id, evaluatee_id, role_tim_evaluatee, kompetensi_teknis, komunikasi, hasil_kerja, catatan, } = req.body;
        if (!annual_plan_id || !evaluatee_id || !role_tim_evaluatee) {
            return res.status(400).json({ success: false, message: 'Field wajib tidak lengkap.' });
        }
        for (const v of [kompetensi_teknis, komunikasi, hasil_kerja]) {
            if (!Number.isInteger(v) || v < 1 || v > 5) {
                return res.status(400).json({ success: false, message: 'Skor harus integer 1-5.' });
            }
        }
        // Validasi: program selesai & user berhak
        const plan = await (0, database_1.query)(`SELECT id, completed_at FROM pkpt.annual_audit_plans WHERE id = $1 AND deleted_at IS NULL`, [annual_plan_id]);
        if (!plan.rows[0])
            return res.status(404).json({ success: false, message: 'Program tidak ditemukan.' });
        if (!plan.rows[0].completed_at) {
            return res.status(400).json({ success: false, message: 'Program belum selesai — penilaian belum tersedia.' });
        }
        if (stage === 'pengendali_teknis') {
            // Pastikan user adalah PT di program ini
            const pt = await (0, database_1.query)(`SELECT 1 FROM pkpt.annual_plan_team
         WHERE annual_plan_id = $1 AND user_id = $2 AND role_tim = 'Pengendali Teknis'`, [annual_plan_id, userId]);
            if (!pt.rows[0]) {
                return res.status(403).json({ success: false, message: 'Anda bukan Pengendali Teknis program ini.' });
            }
        }
        else {
            // kepala_spi — harus nunggu PT selesai dulu
            const ptDone = await (0, database_1.query)(`SELECT 1 FROM penilaian.auditor_evaluations
         WHERE annual_plan_id = $1 AND evaluatee_id = $2 AND stage = 'pengendali_teknis'`, [annual_plan_id, evaluatee_id]);
            if (!ptDone.rows[0]) {
                return res.status(400).json({ success: false, message: 'Pengendali Teknis belum menilai — Kepala SPI menunggu.' });
            }
        }
        // Upsert
        await (0, database_1.query)(`INSERT INTO penilaian.auditor_evaluations
         (annual_plan_id, evaluator_id, evaluatee_id, role_tim_evaluatee, stage,
          kompetensi_teknis, komunikasi, hasil_kerja, catatan)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (annual_plan_id, evaluatee_id, stage) DO UPDATE SET
         evaluator_id      = EXCLUDED.evaluator_id,
         role_tim_evaluatee = EXCLUDED.role_tim_evaluatee,
         kompetensi_teknis = EXCLUDED.kompetensi_teknis,
         komunikasi        = EXCLUDED.komunikasi,
         hasil_kerja       = EXCLUDED.hasil_kerja,
         catatan           = EXCLUDED.catatan`, [annual_plan_id, userId, evaluatee_id, role_tim_evaluatee, stage,
            kompetensi_teknis, komunikasi, hasil_kerja, catatan ?? null]);
        logger_1.default.info(`[EVAL] submitted by ${userId} stage=${stage} plan=${annual_plan_id} evaluatee=${evaluatee_id}`);
        return res.json({ success: true });
    }
    catch (err) {
        logger_1.default.error(`[EVAL] submitEvaluation failed: ${err.message}`);
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
    }
}
// ── GET /api/evaluations/summary?tahun=2026 ───────────────────
// Ringkasan performa tahunan per auditor (Ketua/Anggota).
async function getEvaluationSummary(req, res) {
    try {
        const tahun = Number(req.query.tahun);
        if (!Number.isFinite(tahun)) {
            return res.status(400).json({ success: false, message: 'Parameter tahun wajib diisi (angka).' });
        }
        // Rata-rata per aspek, digabung dari 2 stage.
        const result = await (0, database_1.query)(`SELECT
          u.id         AS user_id,
          u.nik, u.nama_lengkap, u.role, u.jabatan,
          COUNT(DISTINCT e.annual_plan_id)::INT AS total_program,
          ROUND(AVG(e.kompetensi_teknis)::NUMERIC, 2) AS avg_kompetensi,
          ROUND(AVG(e.komunikasi)::NUMERIC, 2)        AS avg_komunikasi,
          ROUND(AVG(e.hasil_kerja)::NUMERIC, 2)       AS avg_hasil_kerja,
          ROUND(AVG((e.kompetensi_teknis + e.komunikasi + e.hasil_kerja)::NUMERIC / 3), 2) AS avg_overall
        FROM penilaian.auditor_evaluations e
        JOIN pkpt.annual_audit_plans a ON a.id = e.annual_plan_id
        JOIN auth.users u              ON u.id = e.evaluatee_id
        WHERE a.deleted_at IS NULL
          AND EXTRACT(YEAR FROM a.tahun_perencanaan) = $1
        GROUP BY u.id, u.nik, u.nama_lengkap, u.role, u.jabatan
        ORDER BY avg_overall DESC, u.nama_lengkap`, [tahun]);
        // Tambahkan rekomendasi area improvement (aspek dengan skor terendah)
        const withRec = result.rows.map((r) => {
            const aspects = [
                { key: 'kompetensi_teknis', label: 'Kompetensi Teknis', score: Number(r.avg_kompetensi) },
                { key: 'komunikasi', label: 'Komunikasi', score: Number(r.avg_komunikasi) },
                { key: 'hasil_kerja', label: 'Hasil Kerja', score: Number(r.avg_hasil_kerja) },
            ].sort((a, b) => a.score - b.score);
            const weak = aspects.filter((a) => a.score < 4.0);
            return {
                ...r,
                improvement_areas: weak.length > 0 ? weak.map((a) => a.label) : ['Performa merata, pertahankan'],
            };
        });
        return res.json({ success: true, data: withRec, tahun });
    }
    catch (err) {
        logger_1.default.error(`[EVAL] getEvaluationSummary failed: ${err.message}`);
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
    }
}
// ── GET /api/evaluations/auditor/:userId?tahun=X ──────────────
// Detail per auditor: daftar program + skor per stage.
async function getAuditorEvaluationDetail(req, res) {
    try {
        const { userId } = req.params;
        const tahun = Number(req.query.tahun);
        if (!Number.isFinite(tahun)) {
            return res.status(400).json({ success: false, message: 'Parameter tahun wajib diisi.' });
        }
        const rows = await (0, database_1.query)(`SELECT
          a.id AS plan_id, a.judul_program, a.completed_at,
          e.stage, e.kompetensi_teknis, e.komunikasi, e.hasil_kerja, e.catatan,
          e.role_tim_evaluatee, e.created_at,
          ev.nama_lengkap AS evaluator_nama, ev.role AS evaluator_role
       FROM penilaian.auditor_evaluations e
       JOIN pkpt.annual_audit_plans a ON a.id = e.annual_plan_id
       JOIN auth.users ev              ON ev.id = e.evaluator_id
       WHERE e.evaluatee_id = $1
         AND EXTRACT(YEAR FROM a.tahun_perencanaan) = $2
       ORDER BY a.completed_at DESC, e.stage`, [userId, tahun]);
        return res.json({ success: true, data: rows.rows });
    }
    catch (err) {
        logger_1.default.error(`[EVAL] getAuditorEvaluationDetail failed: ${err.message}`);
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
    }
}
//# sourceMappingURL=evaluation.controller.js.map