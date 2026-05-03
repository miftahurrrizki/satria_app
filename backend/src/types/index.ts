// ============================================================
//  SATRIA — Shared TypeScript Types (Backend)
// ============================================================

export type UserRole =
  | 'admin_spi'
  | 'kepala_spi'
  | 'pengendali_teknis'
  | 'anggota_tim'
  | 'auditee'
  | 'it_admin';

// Module IDs that can be assigned to users
export type ModuleId = 'pkpt' | 'individual' | 'pelaksanaan' | 'pelaporan' | 'sintesis' | 'pemantauan' | 'ca-cm';

export interface JwtPayload {
  id:           string;
  nik:          string;
  nama:         string;
  email:        string;
  role:         UserRole;
  module_access: ModuleId[];
  direktorat_id?: string;
  divisi_id?: string;
  departemen_id?: string;
  iat?:         number;
  exp?:         number;
}
// Dimensi Organisasi
export interface Direktorat {
  id: string;
  nama: string;
}

export interface Divisi {
  id: string;
  nama: string;
  direktorat_id: string;
}

export interface Departemen {
  id: string;
  nama: string;
  divisi_id: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?:    T;
  meta?:    PaginationMeta;
}

export interface PaginationMeta {
  total:    number;
  page:     number;
  limit:    number;
  totalPages: number;
}

export interface PaginationQuery {
  page?:  string;
  limit?: string;
}

// ── Risk Data (RCSA) ─────────────────────────────────────────
export type RiskLevelKode = 'E' | 'T' | 'MT' | 'M' | 'RM' | 'R';
export type RiskSource    = 'TRUST' | 'Manual' | 'Import';

export interface RiskData {
  id: string;
  id_risiko: string;
  tahun: number;
  direktorat: string;
  divisi: string;
  departemen: string;
  direktorat_id?: string;
  divisi_id?: string;
  departemen_id?: string;
  sasaran_korporat?: string;
  sasaran_korporat_id?: string;
  sasaran_bidang?: string;
  nama_risiko: string;
  parameter_kemungkinan?: string;
  tingkat_risiko_inherent?: string;
  skor_inherent?: number;
  level_inherent?: RiskLevelKode;
  tingkat_risiko_target?: string;
  skor_target?: number;
  level_target?: RiskLevelKode;
  pelaksanaan_mitigasi?: string;
  realisasi_tingkat_risiko?: string;
  skor_realisasi?: number;
  level_realisasi?: RiskLevelKode;
  penyebab_internal?: string;
  penyebab_eksternal?: string;
  source: RiskSource;
  imported_by_id?: string;
  imported_by_nama?: string;
  created_at: string;
  updated_at?: string;
}

// ── Notifications ────────────────────────────────────────────
export type NotificationType = 'Risk' | 'Program' | 'System';

export interface Notification {
  id:           string;
  user_id:      string;
  title:        string;
  message:      string;
  type:         NotificationType;
  is_read:      boolean;
  entity_id?:   string;
  entity_type?: string;
  created_at:   string;
}

// ── Annual Audit Plans ───────────────────────────────────────
export type StatusPKPT     = 'Open' | 'On Progress' | 'Closed';
export type JenisProgram   = 'PKPT' | 'Non PKPT';
// Free text — daftar nilai dikelola di master.kelompok_penugasan.
export type KategoriProgram = string;
export type StatusProgram   = string;

export interface AnnualAuditPlan {
  id:                string;
  tahun_perencanaan: string;
  jenis_program:     JenisProgram;
  kategori_program:  KategoriProgram;
  judul_program:     string;
  status_program:    StatusProgram;
  koordinator_id:    string;
  nama_tim?:         string;
  estimasi_hari:     number;
  tanggal_mulai:     string;
  tanggal_selesai:   string;
  deskripsi:         string;
  status_pkpt:       StatusPKPT;
  created_by:        string;
  created_at:        string;
  updated_at:        string;
}

// User type (backend)
export interface User {
  id: string;
  nik: string;
  nama: string;
  email: string;
  role: UserRole;
  jabatan?: string;
  direktorat_id?: string;
  divisi_id?: string;
  departemen_id?: string;
  module_access?: ModuleId[];
}

// Express augmentation
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
