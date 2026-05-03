"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RiskService = void 0;
class RiskService {
    constructor(pool) {
        this.pool = pool;
    }
    /**
     * Get all risks dengan filter, search, dan pagination
     */
    async getRisks(filters) {
        const { tahun = new Date().getFullYear(), search = '', direktorat_id = null, divisi_id = null, level_inherent = null, page = 1, limit = 20, } = filters;
        const offset = (page - 1) * limit;
        const params = [tahun];
        let paramIndex = 2;
        let whereClause = `WHERE r.tahun = $1 AND r.deleted_at IS NULL`;
        if (search) {
            whereClause += ` AND (r.id_risiko ILIKE $${paramIndex} OR r.nama_risiko ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }
        if (direktorat_id) {
            whereClause += ` AND r.direktorat_id = $${paramIndex}`;
            params.push(direktorat_id);
            paramIndex++;
        }
        if (divisi_id) {
            whereClause += ` AND r.divisi_id = $${paramIndex}`;
            params.push(divisi_id);
            paramIndex++;
        }
        if (level_inherent) {
            whereClause += ` AND r.level_inherent = $${paramIndex}`;
            params.push(level_inherent);
            paramIndex++;
        }
        params.push(limit, offset);
        const countQuery = `
      SELECT COUNT(*) as total FROM pkpt.risk_data r
      ${whereClause}
    `;
        const dataQuery = `
      SELECT
        r.id,
        r.id_risiko,
        r.tahun,
        r.direktorat_id,
        r.divisi_id,
        r.departemen_id,
        r.direktorat_nama as direktorat,
        r.divisi_nama as divisi,
        r.departemen_nama as departemen,
        d.nama as direktorat_resolved,
        dv.nama as divisi_resolved,
        dp.nama as departemen_resolved,
        r.sasaran_korporat_id,
        r.sasaran_korporat_nama as sasaran_korporat,
        r.sasaran_bidang,
        r.nama_risiko,
        r.parameter_kemungkinan,
        r.tingkat_risiko_inherent,
        r.skor_inherent,
        r.level_inherent,
        rl_i.label as label_inherent,
        rl_i.warna_bg as bg_inherent,
        rl_i.warna_text as text_inherent,
        r.tingkat_risiko_target,
        r.skor_target,
        r.level_target,
        rl_t.label as label_target,
        rl_t.warna_bg as bg_target,
        rl_t.warna_text as text_target,
        r.pelaksanaan_mitigasi,
        r.realisasi_tingkat_risiko,
        r.skor_realisasi,
        r.level_realisasi,
        rl_r.label as label_realisasi,
        rl_r.warna_bg as bg_realisasi,
        rl_r.warna_text as text_realisasi,
        r.penyebab_internal,
        r.penyebab_eksternal,
        r.source,
        r.imported_by as imported_by_id,
        u.nama_lengkap as imported_by_nama,
        r.created_at,
        r.updated_at
      FROM pkpt.risk_data r
      LEFT JOIN master.direktorat d ON d.id = r.direktorat_id
      LEFT JOIN master.divisi dv ON dv.id = r.divisi_id
      LEFT JOIN master.departemen dp ON dp.id = r.departemen_id
      LEFT JOIN master.risk_level_ref rl_i ON rl_i.kode = r.level_inherent
      LEFT JOIN master.risk_level_ref rl_t ON rl_t.kode = r.level_target
      LEFT JOIN master.risk_level_ref rl_r ON rl_r.kode = r.level_realisasi
      LEFT JOIN auth.users u ON u.id = r.imported_by
      ${whereClause}
      ORDER BY r.skor_inherent DESC NULLS LAST, r.id_risiko
      LIMIT $${paramIndex - 1} OFFSET $${paramIndex}
    `;
        const [countResult, dataResult] = await Promise.all([
            this.pool.query(countQuery, params.slice(0, params.length - 2)),
            this.pool.query(dataQuery, params),
        ]);
        const total = parseInt(countResult.rows[0].total, 10);
        const totalPages = Math.ceil(total / limit);
        const data = dataResult.rows.map((row) => this._enrichRiskData(row));
        return {
            data,
            meta: {
                total,
                page,
                limit,
                totalPages,
            },
        };
    }
    /**
     * Get Top 15 risks according to risk appetite/tolerance:
     * only Ekstrim, Tinggi, and Menengah Tinggi.
     */
    async getTopRisks(tahun, n = 15) {
        const limit = Math.min(15, Math.max(1, n || 15));
        const query = `
      SELECT
        r.id,
        r.id_risiko,
        r.tahun,
        r.direktorat_id,
        r.divisi_id,
        r.departemen_id,
        r.direktorat_nama as direktorat,
        r.divisi_nama as divisi,
        r.departemen_nama as departemen,
        d.nama as direktorat_resolved,
        dv.nama as divisi_resolved,
        dp.nama as departemen_resolved,
        r.sasaran_korporat_id,
        r.sasaran_korporat_nama as sasaran_korporat,
        r.sasaran_bidang,
        r.nama_risiko,
        r.parameter_kemungkinan,
        r.tingkat_risiko_inherent,
        r.skor_inherent,
        r.level_inherent,
        rl_i.label as label_inherent,
        rl_i.warna_bg as bg_inherent,
        rl_i.warna_text as text_inherent,
        r.tingkat_risiko_target,
        r.skor_target,
        r.level_target,
        rl_t.label as label_target,
        rl_t.warna_bg as bg_target,
        rl_t.warna_text as text_target,
        r.pelaksanaan_mitigasi,
        r.realisasi_tingkat_risiko,
        r.skor_realisasi,
        r.level_realisasi,
        rl_r.label as label_realisasi,
        rl_r.warna_bg as bg_realisasi,
        rl_r.warna_text as text_realisasi,
        r.penyebab_internal,
        r.penyebab_eksternal,
        r.source,
        r.imported_by as imported_by_id,
        u.nama_lengkap as imported_by_nama,
        r.created_at,
        r.updated_at
      FROM pkpt.risk_data r
      LEFT JOIN master.direktorat d ON d.id = r.direktorat_id
      LEFT JOIN master.divisi dv ON dv.id = r.divisi_id
      LEFT JOIN master.departemen dp ON dp.id = r.departemen_id
      LEFT JOIN master.risk_level_ref rl_i ON rl_i.kode = r.level_inherent
      LEFT JOIN master.risk_level_ref rl_t ON rl_t.kode = r.level_target
      LEFT JOIN master.risk_level_ref rl_r ON rl_r.kode = r.level_realisasi
      LEFT JOIN auth.users u ON u.id = r.imported_by
      WHERE r.tahun = $1
        AND r.deleted_at IS NULL
        AND r.level_inherent IN ('E', 'T', 'MT')
      ORDER BY
        CASE r.level_inherent WHEN 'E' THEN 1 WHEN 'T' THEN 2 WHEN 'MT' THEN 3 ELSE 9 END,
        r.skor_inherent DESC NULLS LAST,
        r.id_risiko
      LIMIT $2
    `;
        const result = await this.pool.query(query, [tahun, limit]);
        return result.rows.map((row) => this._enrichRiskData(row));
    }
    /**
     * Get single risk by ID
     */
    async getRiskById(id) {
        const query = `
      SELECT
        r.id,
        r.id_risiko,
        r.tahun,
        r.direktorat_id,
        r.divisi_id,
        r.departemen_id,
        r.direktorat_nama as direktorat,
        r.divisi_nama as divisi,
        r.departemen_nama as departemen,
        d.nama as direktorat_resolved,
        dv.nama as divisi_resolved,
        dp.nama as departemen_resolved,
        r.sasaran_korporat_id,
        r.sasaran_korporat_nama as sasaran_korporat,
        r.sasaran_bidang,
        r.nama_risiko,
        r.parameter_kemungkinan,
        r.tingkat_risiko_inherent,
        r.skor_inherent,
        r.level_inherent,
        rl_i.label as label_inherent,
        rl_i.warna_bg as bg_inherent,
        rl_i.warna_text as text_inherent,
        r.tingkat_risiko_target,
        r.skor_target,
        r.level_target,
        rl_t.label as label_target,
        rl_t.warna_bg as bg_target,
        rl_t.warna_text as text_target,
        r.pelaksanaan_mitigasi,
        r.realisasi_tingkat_risiko,
        r.skor_realisasi,
        r.level_realisasi,
        rl_r.label as label_realisasi,
        rl_r.warna_bg as bg_realisasi,
        rl_r.warna_text as text_realisasi,
        r.penyebab_internal,
        r.penyebab_eksternal,
        r.source,
        r.imported_by as imported_by_id,
        u.nama_lengkap as imported_by_nama,
        r.created_at,
        r.updated_at
      FROM pkpt.risk_data r
      LEFT JOIN master.direktorat d ON d.id = r.direktorat_id
      LEFT JOIN master.divisi dv ON dv.id = r.divisi_id
      LEFT JOIN master.departemen dp ON dp.id = r.departemen_id
      LEFT JOIN master.risk_level_ref rl_i ON rl_i.kode = r.level_inherent
      LEFT JOIN master.risk_level_ref rl_t ON rl_t.kode = r.level_target
      LEFT JOIN master.risk_level_ref rl_r ON rl_r.kode = r.level_realisasi
      LEFT JOIN auth.users u ON u.id = r.imported_by
      WHERE r.id = $1 AND r.deleted_at IS NULL
    `;
        const result = await this.pool.query(query, [id]);
        if (result.rows.length === 0)
            return null;
        return this._enrichRiskData(result.rows[0]);
    }
    /**
     * Create new risk
     */
    async createRisk(data, userId) {
        const { id_risiko, tahun, direktorat_id, divisi_id, departemen_id, sasaran_korporat_id, sasaran_bidang, nama_risiko, parameter_kemungkinan, tingkat_risiko_inherent, skor_inherent, level_inherent, tingkat_risiko_target, skor_target, level_target, pelaksanaan_mitigasi, realisasi_tingkat_risiko, skor_realisasi, level_realisasi, penyebab_internal, penyebab_eksternal, } = data;
        const query = `
      INSERT INTO pkpt.risk_data (
        id_risiko, tahun, direktorat_id, divisi_id, departemen_id,
        sasaran_korporat_id, sasaran_bidang, nama_risiko, parameter_kemungkinan,
        tingkat_risiko_inherent, skor_inherent, level_inherent,
        tingkat_risiko_target, skor_target, level_target,
        pelaksanaan_mitigasi,
        realisasi_tingkat_risiko, skor_realisasi, level_realisasi,
        penyebab_internal, penyebab_eksternal,
        source, imported_by
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12,
        $13, $14, $15,
        $16,
        $17, $18, $19,
        $20, $21,
        'Manual', $22
      )
      RETURNING id
    `;
        const result = await this.pool.query(query, [
            id_risiko,
            tahun,
            direktorat_id,
            divisi_id,
            departemen_id,
            sasaran_korporat_id,
            sasaran_bidang,
            nama_risiko,
            parameter_kemungkinan,
            tingkat_risiko_inherent,
            skor_inherent,
            level_inherent,
            tingkat_risiko_target,
            skor_target,
            level_target,
            pelaksanaan_mitigasi,
            realisasi_tingkat_risiko,
            skor_realisasi,
            level_realisasi,
            penyebab_internal,
            penyebab_eksternal,
            userId,
        ]);
        const riskId = result.rows[0].id;
        const risk = await this.getRiskById(riskId);
        if (!risk)
            throw new Error('Failed to create risk');
        return risk;
    }
    /**
     * Update risk
     */
    async updateRisk(id, data) {
        const fields = [];
        const values = [];
        let paramIndex = 1;
        const updateableFields = [
            'direktorat_id',
            'divisi_id',
            'departemen_id',
            'sasaran_korporat_id',
            'sasaran_bidang',
            'nama_risiko',
            'parameter_kemungkinan',
            'tingkat_risiko_inherent',
            'skor_inherent',
            'level_inherent',
            'tingkat_risiko_target',
            'skor_target',
            'level_target',
            'pelaksanaan_mitigasi',
            'realisasi_tingkat_risiko',
            'skor_realisasi',
            'level_realisasi',
            'penyebab_internal',
            'penyebab_eksternal',
        ];
        updateableFields.forEach((field) => {
            if (data[field] !== undefined) {
                fields.push(`${field} = $${paramIndex}`);
                values.push(data[field]);
                paramIndex++;
            }
        });
        if (fields.length === 0) {
            // No fields to update, just return existing risk
            const risk = await this.getRiskById(id);
            if (!risk)
                throw new Error('Risk not found');
            return risk;
        }
        values.push(id);
        const query = `
      UPDATE pkpt.risk_data
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id
    `;
        const result = await this.pool.query(query, values);
        if (result.rows.length === 0)
            throw new Error('Risk not found');
        const risk = await this.getRiskById(result.rows[0].id);
        if (!risk)
            throw new Error('Failed to update risk');
        return risk;
    }
    /**
     * Delete risk (soft delete)
     */
    async deleteRisk(id) {
        const query = `
      UPDATE pkpt.risk_data
      SET deleted_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
    `;
        const result = await this.pool.query(query, [id]);
        if (result.rowCount === 0)
            throw new Error('Risk not found or already deleted');
    }
    /**
     * Get risk level reference
     */
    async getRiskLevelRef() {
        const query = `
      SELECT kode, label, warna_hex, warna_bg, warna_text, skor_min, skor_max, urutan
      FROM master.risk_level_ref
      ORDER BY urutan
    `;
        const result = await this.pool.query(query);
        return result.rows;
    }
    /**
     * Get risk statistics for a given year
     */
    async getRiskStats(tahun) {
        const [totalResult, byLevelResult, topDirResult] = await Promise.all([
            this.pool.query(`SELECT COUNT(*) as total FROM pkpt.risk_data WHERE tahun = $1 AND deleted_at IS NULL`, [tahun]),
            this.pool.query(`SELECT level_inherent, COUNT(*) as count FROM pkpt.risk_data
         WHERE tahun = $1 AND deleted_at IS NULL
         GROUP BY level_inherent ORDER BY level_inherent`, [tahun]),
            this.pool.query(`SELECT r.direktorat_nama as direktorat, COUNT(*) as count FROM pkpt.risk_data r
         WHERE r.tahun = $1 AND r.deleted_at IS NULL
         GROUP BY r.direktorat_nama ORDER BY count DESC LIMIT 5`, [tahun]),
        ]);
        const byLevel = {};
        byLevelResult.rows.forEach((row) => {
            byLevel[row.level_inherent] = parseInt(row.count, 10);
        });
        return {
            total: parseInt(totalResult.rows[0].total, 10),
            byLevel,
            topDirektorat: topDirResult.rows.map((row) => ({
                direktorat: row.direktorat,
                count: parseInt(row.count, 10),
            })),
        };
    }
    /**
     * Private helper: enrich risk data dengan fallback dari resolved fields
     */
    _enrichRiskData(row) {
        return {
            ...row,
            // Use resolved names if available, fallback to text fields
            direktorat: row.direktorat_resolved || row.direktorat,
            divisi: row.divisi_resolved || row.divisi,
            departemen: row.departemen_resolved || row.departemen,
        };
    }
}
exports.RiskService = RiskService;
//# sourceMappingURL=risk.service.js.map