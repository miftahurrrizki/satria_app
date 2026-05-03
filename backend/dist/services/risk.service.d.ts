import { Pool } from 'pg';
export interface RiskFilters {
    tahun?: number;
    search?: string;
    direktorat_id?: string;
    divisi_id?: string;
    level_inherent?: string;
    page?: number;
    limit?: number;
}
export interface RiskData {
    id: string;
    id_risiko: string;
    tahun: number;
    direktorat_id?: string;
    divisi_id?: string;
    departemen_id?: string;
    direktorat?: string;
    divisi?: string;
    departemen?: string;
    sasaran_korporat_id?: string;
    sasaran_korporat?: string;
    sasaran_bidang?: string;
    nama_risiko: string;
    parameter_kemungkinan?: string;
    tingkat_risiko_inherent?: string;
    skor_inherent?: number;
    level_inherent?: string;
    label_inherent?: string;
    bg_inherent?: string;
    text_inherent?: string;
    tingkat_risiko_target?: string;
    skor_target?: number;
    level_target?: string;
    label_target?: string;
    bg_target?: string;
    text_target?: string;
    pelaksanaan_mitigasi?: string;
    realisasi_tingkat_risiko?: string;
    skor_realisasi?: number;
    level_realisasi?: string;
    label_realisasi?: string;
    bg_realisasi?: string;
    text_realisasi?: string;
    penyebab_internal?: string;
    penyebab_eksternal?: string;
    source: string;
    imported_by_id?: string;
    imported_by_nama?: string;
    created_at: string;
    updated_at?: string;
}
export interface RiskLevelRef {
    kode: string;
    label: string;
    warna_hex: string;
    warna_bg: string;
    warna_text: string;
    skor_min: number;
    skor_max: number;
    urutan: number;
}
export declare class RiskService {
    private pool;
    constructor(pool: Pool);
    /**
     * Get all risks dengan filter, search, dan pagination
     */
    getRisks(filters: RiskFilters): Promise<{
        data: RiskData[];
        meta: {
            total: number;
            page: number;
            limit: number;
            totalPages: number;
        };
    }>;
    /**
     * Get Top 15 risks according to risk appetite/tolerance:
     * only Ekstrim, Tinggi, and Menengah Tinggi.
     */
    getTopRisks(tahun: number, n?: number): Promise<RiskData[]>;
    /**
     * Get single risk by ID
     */
    getRiskById(id: string): Promise<RiskData | null>;
    /**
     * Create new risk
     */
    createRisk(data: Partial<RiskData>, userId: string): Promise<RiskData>;
    /**
     * Update risk
     */
    updateRisk(id: string, data: Partial<RiskData>): Promise<RiskData>;
    /**
     * Delete risk (soft delete)
     */
    deleteRisk(id: string): Promise<void>;
    /**
     * Get risk level reference
     */
    getRiskLevelRef(): Promise<RiskLevelRef[]>;
    /**
     * Get risk statistics for a given year
     */
    getRiskStats(tahun: number): Promise<{
        total: number;
        byLevel: {
            [key: string]: number;
        };
        topDirektorat: Array<{
            direktorat: string;
            count: number;
        }>;
    }>;
    /**
     * Private helper: enrich risk data dengan fallback dari resolved fields
     */
    private _enrichRiskData;
}
//# sourceMappingURL=risk.service.d.ts.map