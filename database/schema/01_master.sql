-- ============================================================
--  SATRIA — Master & Dimension Tables
--  File   : 01_master.sql
--  Urutan : 2 dari 7 (setelah 00_setup.sql)
--
--  Isi    :
--    DIMENSI ORGANISASI (3 Level):
--      master.direktorat     → Level 1
--      master.divisi         → Level 2
--      master.departemen     → Level 3
--
--    DIMENSI RISIKO (RCSA):
--      master.risk_level_ref → Referensi level risiko (E/T/MT/M/RM/R)
--      master.sasaran_korporat → KPI korporat (15 sasaran)
--
--    DIMENSI AUDIT:
--      master.kategori_risiko → Kategori risiko IIA/COSO
--      master.jenis_temuan    → Jenis temuan audit
--
--    KONFIGURASI:
--      master.trust_connections → Koneksi ke sistem TRUST
--      master.app_config        → Key-value config aplikasi
-- ============================================================

-- ── RESET (child → parent) ────────────────────────────────────
DROP TRIGGER IF EXISTS trg_departemen_updated_at   ON master.departemen;
DROP TRIGGER IF EXISTS trg_divisi_updated_at       ON master.divisi;
DROP TRIGGER IF EXISTS trg_direktorat_updated_at   ON master.direktorat;
DROP TRIGGER IF EXISTS trg_kategori_risiko_updated ON master.kategori_risiko;
DROP TRIGGER IF EXISTS trg_jenis_temuan_updated    ON master.jenis_temuan;
DROP TRIGGER IF EXISTS trg_trust_conn_updated_at   ON master.trust_connections;
DROP TRIGGER IF EXISTS trg_sasaran_korporat_updated ON master.sasaran_korporat;

DROP TABLE IF EXISTS master.app_config             CASCADE;
DROP TABLE IF EXISTS master.trust_connections      CASCADE;
DROP TABLE IF EXISTS master.jenis_temuan           CASCADE;
DROP TABLE IF EXISTS master.kategori_risiko        CASCADE;
DROP TABLE IF EXISTS master.sasaran_korporat       CASCADE;
DROP TABLE IF EXISTS master.risk_level_ref         CASCADE;
DROP TABLE IF EXISTS master.departemen             CASCADE;
DROP TABLE IF EXISTS master.divisi                 CASCADE;
DROP TABLE IF EXISTS master.direktorat             CASCADE;

-- ============================================================
--  DIMENSI ORGANISASI
-- ============================================================

-- ── TABLE: master.direktorat (Level 1) ───────────────────────
CREATE TABLE master.direktorat (
    id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    kode        VARCHAR(30)  NOT NULL,
    nama        VARCHAR(200) NOT NULL,
    deskripsi   TEXT,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ,
    CONSTRAINT uq_direktorat_kode UNIQUE (kode)
);
COMMENT ON TABLE  master.direktorat      IS 'Level 1 organisasi: Direktorat PT Transjakarta';
COMMENT ON COLUMN master.direktorat.kode IS 'Kode unik direktorat';

CREATE TRIGGER trg_direktorat_updated_at
    BEFORE UPDATE ON master.direktorat
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

CREATE INDEX idx_direktorat_kode   ON master.direktorat(kode);
CREATE INDEX idx_direktorat_active ON master.direktorat(is_active) WHERE deleted_at IS NULL;

-- ── TABLE: master.divisi (Level 2) ───────────────────────────
CREATE TABLE master.divisi (
    id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    direktorat_id UUID         NOT NULL REFERENCES master.direktorat(id) ON DELETE CASCADE,
    kode          VARCHAR(30)  NOT NULL,
    nama          VARCHAR(200) NOT NULL,
    deskripsi     TEXT,
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMPTZ,
    CONSTRAINT uq_divisi_kode UNIQUE (direktorat_id, kode)
);

CREATE TRIGGER trg_divisi_updated_at
    BEFORE UPDATE ON master.divisi
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

CREATE INDEX idx_divisi_direktorat ON master.divisi(direktorat_id);
CREATE INDEX idx_divisi_kode       ON master.divisi(kode);
CREATE INDEX idx_divisi_active     ON master.divisi(is_active) WHERE deleted_at IS NULL;

-- ── TABLE: master.departemen (Level 3) ───────────────────────
CREATE TABLE master.departemen (
    id        UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    divisi_id UUID         NOT NULL REFERENCES master.divisi(id) ON DELETE CASCADE,
    kode      VARCHAR(30)  NOT NULL,
    nama      VARCHAR(200) NOT NULL,
    deskripsi TEXT,
    is_active BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT uq_departemen_kode UNIQUE (divisi_id, kode)
);

CREATE TRIGGER trg_departemen_updated_at
    BEFORE UPDATE ON master.departemen
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

CREATE INDEX idx_departemen_divisi ON master.departemen(divisi_id);
CREATE INDEX idx_departemen_kode   ON master.departemen(kode);
CREATE INDEX idx_departemen_active ON master.departemen(is_active) WHERE deleted_at IS NULL;

-- ============================================================
--  DIMENSI RISIKO
-- ============================================================

-- ── TABLE: master.risk_level_ref ─────────────────────────────
-- Level risiko berdasarkan matriks RCSA Transjakarta
-- Format skor: kombinasi kemungkinan × dampak (misal 54 = kemungkinan 5 × dampak 4)
CREATE TABLE master.risk_level_ref (
    kode        VARCHAR(5)   PRIMARY KEY,  -- E, T, MT, M, RM, R
    label       VARCHAR(50)  NOT NULL,     -- Extreme, Tinggi, Medium Tinggi, dst.
    warna_hex   VARCHAR(7)   NOT NULL,     -- Hex color untuk badge UI
    warna_bg    VARCHAR(30)  NOT NULL,     -- Tailwind bg class
    warna_text  VARCHAR(30)  NOT NULL,     -- Tailwind text class
    skor_min    SMALLINT     NOT NULL,     -- Skor minimum (inklusif)
    skor_max    SMALLINT     NOT NULL,     -- Skor maksimum (inklusif)
    urutan      SMALLINT     NOT NULL      -- 1=tertinggi
);
COMMENT ON TABLE master.risk_level_ref IS 'Referensi level risiko RCSA: E(Extreme), T(Tinggi), MT(Medium Tinggi), M(Medium), RM(Rendah Medium), R(Rendah)';

-- ── TABLE: master.sasaran_korporat ───────────────────────────
CREATE TABLE master.sasaran_korporat (
    id         UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    kode       VARCHAR(30)  NOT NULL,
    nama       VARCHAR(300) NOT NULL,
    is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_sasaran_korporat_kode UNIQUE (kode)
);
COMMENT ON TABLE master.sasaran_korporat IS 'KPI / Sasaran Korporat PT Transjakarta (15 indikator strategis)';

CREATE TRIGGER trg_sasaran_korporat_updated
    BEFORE UPDATE ON master.sasaran_korporat
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ============================================================
--  DIMENSI AUDIT
-- ============================================================

-- ── TABLE: master.kategori_risiko ─────────────────────────────
CREATE TABLE master.kategori_risiko (
    id          SERIAL       PRIMARY KEY,
    kode        VARCHAR(20)  NOT NULL,
    nama        VARCHAR(100) NOT NULL,
    deskripsi   TEXT,
    warna       VARCHAR(10)  DEFAULT '#6B7280',
    urutan      SMALLINT     NOT NULL DEFAULT 0,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_kategori_risiko_kode UNIQUE (kode)
);

CREATE TRIGGER trg_kategori_risiko_updated
    BEFORE UPDATE ON master.kategori_risiko
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ── TABLE: master.jenis_temuan ────────────────────────────────
CREATE TABLE master.jenis_temuan (
    id          SERIAL       PRIMARY KEY,
    kode        VARCHAR(20)  NOT NULL,
    nama        VARCHAR(100) NOT NULL,
    deskripsi   TEXT,
    urutan      SMALLINT     NOT NULL DEFAULT 0,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_jenis_temuan_kode UNIQUE (kode)
);

CREATE TRIGGER trg_jenis_temuan_updated
    BEFORE UPDATE ON master.jenis_temuan
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ── TABLE: master.trust_connections ──────────────────────────
CREATE TABLE master.trust_connections (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    nama_koneksi    VARCHAR(100) NOT NULL DEFAULT 'TRUST Integration',
    api_url         TEXT         NOT NULL,
    api_key_hash    TEXT         NOT NULL,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    last_sync_at    TIMESTAMPTZ,
    last_sync_count INTEGER,
    created_by      UUID         NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

CREATE TRIGGER trg_trust_conn_updated_at
    BEFORE UPDATE ON master.trust_connections
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ── TABLE: master.app_config ──────────────────────────────────
CREATE TABLE master.app_config (
    kunci       VARCHAR(100) PRIMARY KEY,
    nilai       TEXT         NOT NULL,
    tipe        VARCHAR(20)  NOT NULL DEFAULT 'string'
                    CHECK (tipe IN ('string', 'integer', 'boolean', 'json')),
    deskripsi   TEXT,
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_by  UUID
);

-- ============================================================
--  SEED DATA
-- ============================================================

-- ── Risk Level Reference ──────────────────────────────────────
INSERT INTO master.risk_level_ref (kode, label, warna_hex, warna_bg, warna_text, skor_min, skor_max, urutan) VALUES
('E',  'Ekstrim',          '#dc2626', 'bg-red-100',    'text-red-700',    20, 25, 1),
('T',  'Tinggi',           '#ea580c', 'bg-orange-100', 'text-orange-700', 15, 19, 2),
('MT', 'Menengah Tinggi',  '#d97706', 'bg-amber-100',  'text-amber-700',  10, 14, 3),
('M',  'Menengah',         '#ca8a04', 'bg-yellow-100', 'text-yellow-800',  5,  9, 4),
('RM', 'Rendah Menengah',  '#65a30d', 'bg-lime-100',   'text-lime-700',    4,  4, 5),
('R',  'Rendah',           '#16a34a', 'bg-green-100',  'text-green-700',   1,  3, 6)
ON CONFLICT (kode) DO UPDATE SET
    label      = EXCLUDED.label,
    warna_hex  = EXCLUDED.warna_hex,
    warna_bg   = EXCLUDED.warna_bg,
    warna_text = EXCLUDED.warna_text,
    skor_min   = EXCLUDED.skor_min,
    skor_max   = EXCLUDED.skor_max,
    urutan     = EXCLUDED.urutan;

-- ── Direktorat ────────────────────────────────────────────────
INSERT INTO master.direktorat (kode, nama) VALUES
('DIR-UTM', 'Direktorat Utama'),
('DIR-KSU', 'Direktorat Keuangan, SDM, dan Umum'),
('DIR-BPA', 'Direktorat Bisnis dan Pemanfaatan Aset'),
('DIR-OOK', 'Direktorat Operasional dan Keselamatan'),
('DIR-TIP', 'Direktorat Sistem Teknologi Informasi dan Pelayanan')
ON CONFLICT (kode) DO UPDATE SET nama = EXCLUDED.nama;

-- ── Divisi ────────────────────────────────────────────────────
INSERT INTO master.divisi (kode, nama, direktorat_id) VALUES
-- Direktorat Utama
('DIV-SPH', 'Sekretaris Perusahaan dan Hubungan Masyarakat',  (SELECT id FROM master.direktorat WHERE kode='DIR-UTM')),
('DIV-PPR', 'Perencanaan Perusahaan dan Manajemen Risiko',     (SELECT id FROM master.direktorat WHERE kode='DIR-UTM')),
('DIV-LEG', 'Legal dan Kepatuhan',                             (SELECT id FROM master.direktorat WHERE kode='DIR-UTM')),
('DIV-SPI', 'Satuan Pengawas Internal',                        (SELECT id FROM master.direktorat WHERE kode='DIR-UTM')),
-- Direktorat Keuangan, SDM, dan Umum
('DIV-UBT', 'Unit Bisnis Transjakarta Akademi',                (SELECT id FROM master.direktorat WHERE kode='DIR-KSU')),
('DIV-UMP', 'Umum dan Pengadaan',                              (SELECT id FROM master.direktorat WHERE kode='DIR-KSU')),
('DIV-KAP', 'Keuangan, Akuntansi, dan Perpajakan',             (SELECT id FROM master.direktorat WHERE kode='DIR-KSU')),
('DIV-SDM', 'Sumber Daya Manusia',                             (SELECT id FROM master.direktorat WHERE kode='DIR-KSU')),
-- Direktorat Bisnis dan Pemanfaatan Aset
('DIV-PNJ', 'Penjualan',                                       (SELECT id FROM master.direktorat WHERE kode='DIR-BPA')),
('DIV-PPP', 'Pengembangan dan Pengelolaan Prasarana',           (SELECT id FROM master.direktorat WHERE kode='DIR-BPA')),
('DIV-PMR', 'Pemasaran',                                       (SELECT id FROM master.direktorat WHERE kode='DIR-BPA')),
-- Direktorat Operasional dan Keselamatan
('DIV-OOB', 'Operasional Bus',                                 (SELECT id FROM master.direktorat WHERE kode='DIR-OOK')),
('DIV-KKK', 'Keselamatan dan Keamanan',                        (SELECT id FROM master.direktorat WHERE kode='DIR-OOK')),
('DIV-SWK', 'Swakelola',                                       (SELECT id FROM master.direktorat WHERE kode='DIR-OOK')),
('DIV-OIA', 'Integrasi Angkutan',                              (SELECT id FROM master.direktorat WHERE kode='DIR-OOK')),
('DIV-TSR', 'Teknik Sarana',                                   (SELECT id FROM master.direktorat WHERE kode='DIR-OOK')),
-- Direktorat Sistem Teknologi Informasi dan Pelayanan
('DIV-PLY', 'Pelayanan',                                       (SELECT id FROM master.direktorat WHERE kode='DIR-TIP')),
('DIV-STI', 'Sistem Teknologi Informasi',                      (SELECT id FROM master.direktorat WHERE kode='DIR-TIP'))
ON CONFLICT (direktorat_id, kode) DO UPDATE SET nama = EXCLUDED.nama;

-- ── Departemen ────────────────────────────────────────────────
INSERT INTO master.departemen (kode, nama, divisi_id) VALUES
-- DIV-UBT
('DEP-UBT-01', 'Pendidikan, Pelatihan, dan Pengembangan',      (SELECT id FROM master.divisi WHERE kode='DIV-UBT')),
('DEP-UBT-02', 'Pengelolaan Usaha',                            (SELECT id FROM master.divisi WHERE kode='DIV-UBT')),
-- DIV-PNJ
('DEP-PNJ-01', 'Bisnis Sarana',                                (SELECT id FROM master.divisi WHERE kode='DIV-PNJ')),
('DEP-PNJ-02', 'Ekosistem Digital dan Kemitraan Bisnis',       (SELECT id FROM master.divisi WHERE kode='DIV-PNJ')),
('DEP-PNJ-03', 'Bisnis Ticketing dan Administrasi',            (SELECT id FROM master.divisi WHERE kode='DIV-PNJ')),
('DEP-PNJ-04', 'Bisnis Prasarana',                             (SELECT id FROM master.divisi WHERE kode='DIV-PNJ')),
-- DIV-OOB
('DEP-OOB-01', 'Operasional Bus Rapid Transit (BRT)',          (SELECT id FROM master.divisi WHERE kode='DIV-OOB')),
('DEP-OOB-02', 'Integrasi Pengumpan dan Layanan Khusus',       (SELECT id FROM master.divisi WHERE kode='DIV-OOB')),
('DEP-OOB-03', 'Operasional Bus Kecil',                        (SELECT id FROM master.divisi WHERE kode='DIV-OOB')),
('DEP-OOB-04', 'Pusat Kendali Operasional',                    (SELECT id FROM master.divisi WHERE kode='DIV-OOB')),
-- DIV-KKK
('DEP-KKK-01', 'Keamanan',                                     (SELECT id FROM master.divisi WHERE kode='DIV-KKK')),
('DEP-KKK-02', 'Keselamatan',                                  (SELECT id FROM master.divisi WHERE kode='DIV-KKK')),
('DEP-KKK-03', 'Sterilisasi Jalur',                            (SELECT id FROM master.divisi WHERE kode='DIV-KKK')),
('DEP-KKK-04', 'Standardisasi K3L',                            (SELECT id FROM master.divisi WHERE kode='DIV-KKK')),
-- DIV-UMP
('DEP-UMP-01', 'Umum',                                         (SELECT id FROM master.divisi WHERE kode='DIV-UMP')),
('DEP-UMP-02', 'Manajemen Aset',                               (SELECT id FROM master.divisi WHERE kode='DIV-UMP')),
('DEP-UMP-03', 'Pengadaan',                                    (SELECT id FROM master.divisi WHERE kode='DIV-UMP')),
-- DIV-SWK
('DEP-SWK-01', 'Bengkel Swakelola',                            (SELECT id FROM master.divisi WHERE kode='DIV-SWK')),
('DEP-SWK-02', 'Manajemen Operasional Swakelola',              (SELECT id FROM master.divisi WHERE kode='DIV-SWK')),
('DEP-SWK-03', 'Administrasi dan Keuangan Swakelola',          (SELECT id FROM master.divisi WHERE kode='DIV-SWK')),
-- DIV-PLY
('DEP-PLY-01', 'Operasional Layanan',                          (SELECT id FROM master.divisi WHERE kode='DIV-PLY')),
('DEP-PLY-02', 'Relasi Pelanggan',                             (SELECT id FROM master.divisi WHERE kode='DIV-PLY')),
('DEP-PLY-03', 'Pengembangan Layanan',                         (SELECT id FROM master.divisi WHERE kode='DIV-PLY')),
-- DIV-SPH
('DEP-SPH-01', 'Hubungan Masyarakat dan CSR',                  (SELECT id FROM master.divisi WHERE kode='DIV-SPH')),
('DEP-SPH-02', 'Kesekretariatan dan Tata Kelola',              (SELECT id FROM master.divisi WHERE kode='DIV-SPH')),
-- DIV-STI
('DEP-STI-01', 'Pengembangan Sistem Teknologi Informasi',      (SELECT id FROM master.divisi WHERE kode='DIV-STI')),
('DEP-STI-02', 'Perencanaan Sistem Teknologi Informasi',       (SELECT id FROM master.divisi WHERE kode='DIV-STI')),
('DEP-STI-03', 'Infrastruktur dan Operasional Sistem Teknologi Informasi', (SELECT id FROM master.divisi WHERE kode='DIV-STI')),
-- DIV-OIA
('DEP-OIA-01', 'Perencanaan Rute dan Operasional',             (SELECT id FROM master.divisi WHERE kode='DIV-OIA')),
('DEP-OIA-02', 'Evaluasi dan Pengawasan Operasional',          (SELECT id FROM master.divisi WHERE kode='DIV-OIA')),
('DEP-OIA-03', 'Integrasi Operator',                           (SELECT id FROM master.divisi WHERE kode='DIV-OIA')),
-- DIV-PPR
('DEP-PPR-01', 'Manajemen Risiko',                             (SELECT id FROM master.divisi WHERE kode='DIV-PPR')),
('DEP-PPR-02', 'Perencanaan Perusahaan',                       (SELECT id FROM master.divisi WHERE kode='DIV-PPR')),
('DEP-PPR-03', 'Proses Bisnis',                                (SELECT id FROM master.divisi WHERE kode='DIV-PPR')),
-- DIV-PPP
('DEP-PPP-01', 'Pengelolaan Prasarana',                        (SELECT id FROM master.divisi WHERE kode='DIV-PPP')),
('DEP-PPP-02', 'Pengembangan Prasarana',                       (SELECT id FROM master.divisi WHERE kode='DIV-PPP')),
-- DIV-KAP
('DEP-KAP-01', 'Akuntansi',                                    (SELECT id FROM master.divisi WHERE kode='DIV-KAP')),
('DEP-KAP-02', 'Keuangan Korporat dan Anak Usaha',             (SELECT id FROM master.divisi WHERE kode='DIV-KAP')),
('DEP-KAP-03', 'Pajak',                                        (SELECT id FROM master.divisi WHERE kode='DIV-KAP')),
('DEP-KAP-04', 'Pengelolaan Piutang Usaha',                    (SELECT id FROM master.divisi WHERE kode='DIV-KAP')),
('DEP-KAP-05', 'Pengelolaan Utang Usaha dan Manajemen Kas',    (SELECT id FROM master.divisi WHERE kode='DIV-KAP')),
-- DIV-TSR
('DEP-TSR-01', 'Standardisasi, Penelitian, dan Pengembangan Sarana', (SELECT id FROM master.divisi WHERE kode='DIV-TSR')),
('DEP-TSR-02', 'Pengawasan Sarana',                            (SELECT id FROM master.divisi WHERE kode='DIV-TSR')),
-- DIV-LEG
('DEP-LEG-01', 'Legal Bisnis',                                 (SELECT id FROM master.divisi WHERE kode='DIV-LEG')),
('DEP-LEG-02', 'Legal Perusahaan dan Kepatuhan',               (SELECT id FROM master.divisi WHERE kode='DIV-LEG')),
-- DIV-SDM
('DEP-SDM-01', 'Hubungan Industrial dan Layanan',              (SELECT id FROM master.divisi WHERE kode='DIV-SDM')),
('DEP-SDM-02', 'Manajemen Talenta',                            (SELECT id FROM master.divisi WHERE kode='DIV-SDM')),
('DEP-SDM-03', 'Pengembangan Organisasi',                      (SELECT id FROM master.divisi WHERE kode='DIV-SDM')),
('DEP-SDM-04', 'Senior Spesialis Remunerasi',                  (SELECT id FROM master.divisi WHERE kode='DIV-SDM')),
('DEP-SDM-05', 'Pusat Pelatihan',                              (SELECT id FROM master.divisi WHERE kode='DIV-SDM')),
-- DIV-PMR
('DEP-PMR-01', 'Pengembangan Bisnis',                          (SELECT id FROM master.divisi WHERE kode='DIV-PMR')),
('DEP-PMR-02', 'Komunikasi Pemasaran',                         (SELECT id FROM master.divisi WHERE kode='DIV-PMR')),
-- DIV-SPI
('DEP-SPI-01', 'Senior Spesialis Auditor',                     (SELECT id FROM master.divisi WHERE kode='DIV-SPI'))
ON CONFLICT (divisi_id, kode) DO UPDATE SET nama = EXCLUDED.nama;

-- ── Sasaran Korporat ──────────────────────────────────────────
INSERT INTO master.sasaran_korporat (kode, nama) VALUES
('SK-01', 'Pendapatan Usaha Non Angkutan'),
('SK-02', '% Komersialisasi Aset'),
('SK-03', 'Indeks Keselamatan Transportasi'),
('SK-04', 'Indeks Kepuasan Pelanggan'),
('SK-05', '% Implementasi GRC'),
('SK-06', 'Rasio Pelanggan per KM'),
('SK-07', 'Rata-Rata Jumlah Pelanggan per Hari'),
('SK-08', 'Skor Maturitas IT'),
('SK-09', 'Skor Tingkat Kesehatan (Aspek Kinerja Keuangan)'),
('SK-10', '% Implementasi Sistem & Aplikasi IT'),
('SK-11', 'Customer Relationship Management (CRM)'),
('SK-12', '% Pencapaian SPM'),
('SK-13', 'Skor Maturitas SDM'),
('SK-14', 'Rasio Pendapatan Tiket per Pelanggan'),
('SK-15', 'Net Promoter Score (NPS)')
ON CONFLICT (kode) DO UPDATE SET nama = EXCLUDED.nama;

-- ── Kategori Risiko (standar IIA/COSO) ───────────────────────
INSERT INTO master.kategori_risiko (kode, nama, deskripsi, warna, urutan) VALUES
('OPERASIONAL',  'Risiko Operasional',      'Risiko terkait proses, sistem, SDM, dan kejadian eksternal', '#F97316', 1),
('KEUANGAN',     'Risiko Keuangan',         'Risiko terkait pelaporan keuangan, likuiditas, dan fraud',   '#EF4444', 2),
('KEPATUHAN',    'Risiko Kepatuhan',        'Risiko ketidakpatuhan terhadap regulasi, hukum, kebijakan',  '#8B5CF6', 3),
('STRATEGIS',    'Risiko Strategis',        'Risiko terkait arah strategis dan keputusan bisnis',         '#3B82F6', 4),
('TEKNOLOGI',    'Risiko Teknologi',        'Risiko terkait sistem TI, keamanan data, dan siber',         '#06B6D4', 5),
('LINGKUNGAN',   'Risiko Lingkungan & K3L', 'Risiko keselamatan kerja dan lingkungan hidup',             '#22C55E', 6),
('REPUTASI',     'Risiko Reputasi',         'Risiko terhadap citra dan kepercayaan publik',               '#EC4899', 7)
ON CONFLICT (kode) DO NOTHING;

-- ── Jenis Temuan Audit ────────────────────────────────────────
INSERT INTO master.jenis_temuan (kode, nama, deskripsi, urutan) VALUES
('KETIDAKPATUHAN', 'Ketidakpatuhan',         'Pelanggaran terhadap aturan, regulasi, atau kebijakan', 1),
('INEFISIENSI',    'Inefisiensi',            'Penggunaan sumber daya yang tidak optimal',              2),
('FRAUD_RISK',     'Risiko Fraud',           'Indikasi potensi kecurangan atau penyalahgunaan',        3),
('KELEMAHAN_KCI',  'Kelemahan Kontrol',      'Kelemahan pada sistem pengendalian intern',              4),
('TEMUAN_POSITIF', 'Praktik Baik (Positif)', 'Area yang sudah berjalan baik — best practice',         5),
('REKOMENDASI',    'Rekomendasi Perbaikan',  'Saran perbaikan tanpa temuan signifikan',               6)
ON CONFLICT (kode) DO NOTHING;

-- ── App Config ────────────────────────────────────────────────
INSERT INTO master.app_config (kunci, nilai, tipe, deskripsi) VALUES
('hari_kerja_ref',    '230',     'integer', 'Referensi hari kerja per tahun untuk perhitungan beban kerja'),
('tahun_aktif',       '2026',    'integer', 'Tahun anggaran / perencanaan yang sedang aktif'),
('max_upload_mb',     '10',      'integer', 'Batas maksimal ukuran file upload (MB)'),
('pkpt_deadline_day', '31',      'integer', 'Tanggal batas pengajuan PKPT (hari di bulan Desember)'),
('app_name',          'SATRIA',  'string',  'Nama aplikasi — Sistem Akuntabilitas Internal Audit'),
('app_version',       '2.0.0',   'string',  'Versi aplikasi saat ini'),
('rcsa_top_risk_n',   '15',      'integer', 'Jumlah risiko teratas yang ditampilkan di dashboard RCSA')
ON CONFLICT (kunci) DO NOTHING;
