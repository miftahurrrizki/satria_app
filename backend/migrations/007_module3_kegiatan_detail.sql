-- ============================================================
-- Migration 007: Modul 3 — Detail Kegiatan (Lampiran + Hasil Audit)
--
-- Restrukturisasi Modul 3:
--   - 4 tab → 2 tab (Project Management + Repository)
--   - Tab Pengujian & KKA Simpulan dihapus → fungsinya digabung ke
--     halaman Edit Kegiatan (full-page route).
--
-- Konsep:
--   - Setiap kegiatan (fase_item ATAU rincian) bisa punya:
--       a. Banyak Lampiran (file upload / link URL)
--       b. Deskripsi (rich text JSONB) — HANYA fase_item (Perencanaan/Pelaporan)
--   - Kegiatan Pelaksanaan (rincian) bisa punya banyak Hasil Audit:
--       - Konfirmasi Positif (kondisi, kriteria, rekomendasi)
--       - Temuan             (kondisi, kriteria, sebab, akibat, rekomendasi, severity)
--       - OFI                (kondisi, saran, peningkatan)
--
-- Catatan:
--   - Field-field rich text disimpan sebagai JSONB (TipTap document).
--   - kolom `catatan_pengujian` lama di rincian dipertahankan untuk
--     backward-compat (akan di-deprecate setelah data migrated).
--   - Tabel workpaper_evidence & workpaper_prosedur lama dipertahankan
--     untuk backward-compat. Tabel BARU (kegiatan_lampiran) menggantikan
--     fungsi workpaper_evidence pada Modul 3 baru.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. Deskripsi rich text per kegiatan administratif (fase_item)
--    Hanya untuk Perencanaan & Pelaporan. Pelaksanaan (rincian) tidak.
-- ============================================================
ALTER TABLE penugasan.fase_items
    ADD COLUMN IF NOT EXISTS deskripsi JSONB;

COMMENT ON COLUMN penugasan.fase_items.deskripsi IS
    'Rich text deskripsi/catatan kegiatan (TipTap JSON document). Hanya untuk Perencanaan & Pelaporan.';

-- ============================================================
-- 2. LAMPIRAN per kegiatan (file upload OR link URL)
--    Polymorphic: terikat ke fase_item ATAU rincian (salah satu, tidak boleh dua)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit.kegiatan_lampiran (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Polymorphic FK (exactly one must be set)
    fase_item_id    UUID         REFERENCES penugasan.fase_items(id) ON DELETE CASCADE,
    rincian_id      UUID         REFERENCES penugasan.rincian(id)    ON DELETE CASCADE,

    -- Tipe & metadata
    tipe            VARCHAR(10)  NOT NULL CHECK (tipe IN ('file', 'link')),
    nama            TEXT         NOT NULL,            -- judul yang user lihat

    -- Untuk tipe = 'file'
    nama_asli       TEXT,                              -- original filename saat upload
    file_path       TEXT,                              -- path relatif di NAS (Phase 2) / local
    ukuran_byte     BIGINT,
    mime_type       TEXT,

    -- Untuk tipe = 'link'
    url             TEXT,                              -- URL ekstern (Google Drive, OneDrive, dll)
    link_source     VARCHAR(50),                       -- 'google_drive' | 'onedrive' | 'sharepoint' | 'other' (auto-detect)

    -- Audit trail
    uploaded_by     UUID         NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID         REFERENCES auth.users(id) ON DELETE SET NULL,

    -- Constraint: salah satu FK harus diisi, tidak boleh dua-duanya
    CONSTRAINT chk_lampiran_one_parent CHECK (
        (fase_item_id IS NOT NULL)::int + (rincian_id IS NOT NULL)::int = 1
    ),
    -- Constraint: file harus punya path; link harus punya url
    CONSTRAINT chk_lampiran_tipe_fields CHECK (
        (tipe = 'file' AND file_path IS NOT NULL) OR
        (tipe = 'link' AND url IS NOT NULL)
    )
);

COMMENT ON TABLE  audit.kegiatan_lampiran IS
    'Lampiran (file upload / link URL) per kegiatan. Polymorphic ke fase_item atau rincian.';

CREATE TRIGGER trg_klam_updated_at
    BEFORE UPDATE ON audit.kegiatan_lampiran
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

CREATE INDEX idx_klam_fase_item ON audit.kegiatan_lampiran(fase_item_id) WHERE deleted_at IS NULL AND fase_item_id IS NOT NULL;
CREATE INDEX idx_klam_rincian   ON audit.kegiatan_lampiran(rincian_id)   WHERE deleted_at IS NULL AND rincian_id   IS NOT NULL;
CREATE INDEX idx_klam_created   ON audit.kegiatan_lampiran(created_at DESC) WHERE deleted_at IS NULL;

-- ============================================================
-- 3. HASIL AUDIT per langkah Pelaksanaan (rincian)
--    1 langkah bisa punya banyak hasil audit (Konfirmasi/Temuan/OFI).
--    Single table dengan field nullable per kategori.
-- ============================================================
CREATE TABLE IF NOT EXISTS audit.kegiatan_hasil_audit (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    rincian_id      UUID         NOT NULL REFERENCES penugasan.rincian(id) ON DELETE CASCADE,

    -- Klasifikasi
    kategori        VARCHAR(30)  NOT NULL CHECK (kategori IN ('konfirmasi_positif', 'temuan', 'ofi')),
    severity        VARCHAR(10)  CHECK (severity IS NULL OR severity IN ('high', 'medium', 'low')),

    -- Field rich text (TipTap JSONB document) — hanya isi yang relevan dengan kategori
    -- Konfirmasi Positif: kondisi, kriteria, rekomendasi
    -- Temuan:             kondisi, kriteria, sebab, akibat, rekomendasi (+ severity)
    -- OFI:                kondisi, saran, peningkatan
    kondisi         JSONB,
    kriteria        JSONB,
    sebab           JSONB,
    akibat          JSONB,
    rekomendasi     JSONB,
    saran           JSONB,
    peningkatan     JSONB,

    urutan          INT          NOT NULL DEFAULT 0,

    -- Audit trail
    created_by      UUID         NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    updated_by      UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID         REFERENCES auth.users(id) ON DELETE SET NULL,

    -- Severity hanya valid untuk Temuan
    CONSTRAINT chk_hasil_severity_only_temuan CHECK (
        (kategori = 'temuan') OR (severity IS NULL)
    )
);

COMMENT ON TABLE  audit.kegiatan_hasil_audit IS
    'Hasil audit per langkah pelaksanaan (rincian). 1 langkah bisa banyak hasil. Field JSONB = TipTap rich text.';
COMMENT ON COLUMN audit.kegiatan_hasil_audit.severity IS
    'Tingkat risiko temuan (hanya untuk kategori = temuan): high/medium/low';

CREATE TRIGGER trg_kha_updated_at
    BEFORE UPDATE ON audit.kegiatan_hasil_audit
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

CREATE INDEX idx_kha_rincian   ON audit.kegiatan_hasil_audit(rincian_id, urutan) WHERE deleted_at IS NULL;
CREATE INDEX idx_kha_kategori  ON audit.kegiatan_hasil_audit(kategori)           WHERE deleted_at IS NULL;
CREATE INDEX idx_kha_temuan    ON audit.kegiatan_hasil_audit(rincian_id, severity)
    WHERE deleted_at IS NULL AND kategori = 'temuan';

-- ============================================================
-- 4. View ringkasan count per kegiatan (untuk Tab Project Management)
--    Menampilkan jumlah lampiran + hasil audit per kategori.
-- ============================================================
CREATE OR REPLACE VIEW audit.v_kegiatan_summary AS
-- fase_items (Perencanaan/Pelaporan)
SELECT
    fi.id                                                              AS kegiatan_id,
    'fase_item'::TEXT                                                  AS kegiatan_type,
    fi.program_id,
    (SELECT COUNT(*) FROM audit.kegiatan_lampiran l
       WHERE l.fase_item_id = fi.id AND l.deleted_at IS NULL)          AS lampiran_count,
    0::BIGINT                                                          AS konfirmasi_count,
    0::BIGINT                                                          AS temuan_count,
    0::BIGINT                                                          AS ofi_count,
    0::BIGINT                                                          AS temuan_high_count
FROM penugasan.fase_items fi

UNION ALL

-- rincian (Pelaksanaan langkah)
SELECT
    r.id                                                               AS kegiatan_id,
    'rincian'::TEXT                                                    AS kegiatan_type,
    tu.program_id                                                      AS program_id,
    (SELECT COUNT(*) FROM audit.kegiatan_lampiran l
       WHERE l.rincian_id = r.id AND l.deleted_at IS NULL)             AS lampiran_count,
    (SELECT COUNT(*) FROM audit.kegiatan_hasil_audit h
       WHERE h.rincian_id = r.id AND h.deleted_at IS NULL
         AND h.kategori = 'konfirmasi_positif')                        AS konfirmasi_count,
    (SELECT COUNT(*) FROM audit.kegiatan_hasil_audit h
       WHERE h.rincian_id = r.id AND h.deleted_at IS NULL
         AND h.kategori = 'temuan')                                    AS temuan_count,
    (SELECT COUNT(*) FROM audit.kegiatan_hasil_audit h
       WHERE h.rincian_id = r.id AND h.deleted_at IS NULL
         AND h.kategori = 'ofi')                                       AS ofi_count,
    (SELECT COUNT(*) FROM audit.kegiatan_hasil_audit h
       WHERE h.rincian_id = r.id AND h.deleted_at IS NULL
         AND h.kategori = 'temuan' AND h.severity = 'high')            AS temuan_high_count
FROM penugasan.rincian r
JOIN penugasan.prosedur p ON p.id = r.prosedur_id
JOIN penugasan.risiko ri  ON ri.id = p.risiko_id
JOIN penugasan.tujuan tu  ON tu.id = ri.tujuan_id;

COMMENT ON VIEW audit.v_kegiatan_summary IS
    'Ringkasan jumlah lampiran & hasil audit per kegiatan — untuk badge di list Tab Project Management';

COMMIT;

-- ============================================================
-- ROLLBACK SCRIPT (manual):
-- BEGIN;
-- DROP VIEW  IF EXISTS audit.v_kegiatan_summary;
-- DROP TABLE IF EXISTS audit.kegiatan_hasil_audit CASCADE;
-- DROP TABLE IF EXISTS audit.kegiatan_lampiran   CASCADE;
-- ALTER TABLE penugasan.fase_items DROP COLUMN IF EXISTS deskripsi;
-- COMMIT;
-- ============================================================
