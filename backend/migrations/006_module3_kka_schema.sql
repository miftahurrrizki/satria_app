-- ============================================================
-- Migration 006: Modul 3 — Kertas Kerja Audit (KKA), Auditor's Copy & Pelaksanaan
--
-- Konsep Hybrid:
--   - Evidence (file)            → per LANGKAH (penugasan.rincian)
--   - Simpulan + temuan          → per PROSEDUR (penugasan.prosedur)
--   - Catatan pengujian          → per LANGKAH (kolom inline di penugasan.rincian)
--   - Progress / status / PIC / deadline langkah → SUDAH ADA di penugasan.rincian
--                                  (Modul 3 reuse, tidak duplikasi)
--   - Folder NAS                 → per PROGRAM (kolom inline di penugasan.audit_programs)
--
-- NAS root: Z:\SATRIA\<nama_folder_program>\...
-- ============================================================

BEGIN;

-- ── Drop tabel KKA lama (audit_workpapers) yang tidak terpakai ──
DROP TRIGGER IF EXISTS trg_aw_updated_at ON audit.audit_workpapers;
DROP TABLE  IF EXISTS audit.audit_workpapers CASCADE;
DROP TYPE   IF EXISTS audit.status_kka_enum  CASCADE;

-- ── Reset tabel Modul 3 (idempotent) ─────────────────────────
DROP TRIGGER IF EXISTS trg_wp_pros_updated_at ON audit.workpaper_prosedur;
DROP TRIGGER IF EXISTS trg_wp_ev_updated_at   ON audit.workpaper_evidence;
DROP TABLE  IF EXISTS audit.workpaper_evidence CASCADE;
DROP TABLE  IF EXISTS audit.workpaper_prosedur CASCADE;

-- ============================================================
-- 1. Folder NAS per program kerja
-- ============================================================
ALTER TABLE penugasan.audit_programs
    ADD COLUMN IF NOT EXISTS nas_folder_name TEXT,
    ADD COLUMN IF NOT EXISTS nas_initialized_at TIMESTAMPTZ;

COMMENT ON COLUMN penugasan.audit_programs.nas_folder_name IS
    'Nama folder di NAS (di bawah Z:\SATRIA\). Disimpan agar perubahan judul program tidak memutus referensi folder lama.';
COMMENT ON COLUMN penugasan.audit_programs.nas_initialized_at IS
    'Timestamp saat folder NAS pertama kali dibuat oleh sistem.';

-- ============================================================
-- 2. Catatan pengujian per LANGKAH (Tab "Pelaksanaan Pengujian")
-- ============================================================
ALTER TABLE penugasan.rincian
    ADD COLUMN IF NOT EXISTS catatan_pengujian TEXT,
    ADD COLUMN IF NOT EXISTS pengujian_updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS pengujian_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN penugasan.rincian.catatan_pengujian IS
    'Catatan auditor saat pelaksanaan pengujian langkah (Modul 3 Tab 2)';

-- ============================================================
-- 3. SIMPULAN per PROSEDUR (Tab "KKA & Simpulan")
-- ============================================================
CREATE TABLE audit.workpaper_prosedur (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    prosedur_id     UUID         NOT NULL UNIQUE
                        REFERENCES penugasan.prosedur(id) ON DELETE CASCADE,
    program_id      UUID         NOT NULL
                        REFERENCES penugasan.audit_programs(id) ON DELETE CASCADE,
    simpulan        TEXT,                       -- Kesimpulan auditor (rich text / markdown)
    has_temuan      BOOLEAN      NOT NULL DEFAULT FALSE,
    temuan_catatan  TEXT,                       -- Deskripsi temuan jika has_temuan = true
    finalized_at    TIMESTAMPTZ,                -- Auditor menandai simpulan selesai
    finalized_by    UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by      UUID         NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    updated_by      UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    CONSTRAINT chk_wp_pros_temuan CHECK (
        has_temuan = FALSE OR temuan_catatan IS NOT NULL
    )
);

COMMENT ON TABLE  audit.workpaper_prosedur     IS 'Simpulan + flag temuan per prosedur audit (Modul 3)';
COMMENT ON COLUMN audit.workpaper_prosedur.has_temuan IS 'Flag dipropagasi ke Modul 4 Pelaporan';

CREATE TRIGGER trg_wp_pros_updated_at
    BEFORE UPDATE ON audit.workpaper_prosedur
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

CREATE INDEX idx_wp_pros_program  ON audit.workpaper_prosedur(program_id)  WHERE deleted_at IS NULL;
CREATE INDEX idx_wp_pros_prosedur ON audit.workpaper_prosedur(prosedur_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_wp_pros_temuan   ON audit.workpaper_prosedur(has_temuan)  WHERE deleted_at IS NULL AND has_temuan = TRUE;

-- ============================================================
-- 4. EVIDENCE FILE per LANGKAH (Tab "Auditor's Copy")
-- ============================================================
CREATE TABLE audit.workpaper_evidence (
    id                UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    rincian_id        UUID         NOT NULL
                          REFERENCES penugasan.rincian(id) ON DELETE CASCADE,
    program_id        UUID         NOT NULL
                          REFERENCES penugasan.audit_programs(id) ON DELETE CASCADE,
    -- Metadata file
    nama_file         TEXT         NOT NULL,         -- nama file yang user lihat (boleh sama dengan nama_asli)
    nama_asli         TEXT         NOT NULL,         -- nama file saat diupload
    nas_relative_path TEXT         NOT NULL,         -- path relatif dari Z:\SATRIA\<folder_program>\
    nas_subfolder     TEXT,                          -- subfolder di dalam program (opsional, untuk grouping)
    ukuran_byte       BIGINT       NOT NULL,
    mime_type         TEXT,
    deskripsi         TEXT,                          -- catatan singkat dari uploader
    -- Audit trail
    uploaded_by       UUID         NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    uploaded_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at        TIMESTAMPTZ,
    deleted_by        UUID         REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE  audit.workpaper_evidence IS
    'File evidence/kertas kerja per langkah (rincian). File fisik di NAS, baris ini sebagai index/metadata.';
COMMENT ON COLUMN audit.workpaper_evidence.nas_relative_path IS
    'Path relatif dari Z:\SATRIA\<folder_program>\ — disimpan agar tidak break jika base path berubah';

CREATE TRIGGER trg_wp_ev_updated_at
    BEFORE UPDATE ON audit.workpaper_evidence
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

CREATE INDEX idx_wp_ev_rincian  ON audit.workpaper_evidence(rincian_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_wp_ev_program  ON audit.workpaper_evidence(program_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_wp_ev_uploaded ON audit.workpaper_evidence(uploaded_at DESC) WHERE deleted_at IS NULL;

-- ============================================================
-- 5. View ringkasan progress per program (untuk Project Management)
-- ============================================================
CREATE OR REPLACE VIEW audit.v_program_progress AS
SELECT
    ap.id                                                      AS program_id,
    ap.annual_plan_id,
    aap.judul_program,
    ap.nas_folder_name,
    -- jumlah langkah & yang selesai
    COUNT(r.id)                                                AS total_langkah,
    COUNT(r.id) FILTER (WHERE r.status = 'selesai')            AS langkah_selesai,
    COUNT(r.id) FILTER (WHERE r.status = 'dalam_proses')       AS langkah_dalam_proses,
    COUNT(r.id) FILTER (WHERE r.status = 'tidak_dimulai')      AS langkah_belum,
    -- progress %
    CASE WHEN COUNT(r.id) = 0 THEN 0
         ELSE ROUND(100.0 * COUNT(r.id) FILTER (WHERE r.status = 'selesai') / COUNT(r.id), 1)
    END                                                        AS progress_persen,
    -- evidence
    (SELECT COUNT(*) FROM audit.workpaper_evidence ev
       WHERE ev.program_id = ap.id AND ev.deleted_at IS NULL)  AS total_evidence,
    -- prosedur dengan simpulan
    (SELECT COUNT(*) FROM audit.workpaper_prosedur wp
       JOIN penugasan.prosedur pr ON pr.id = wp.prosedur_id
       JOIN penugasan.risiko ri   ON ri.id = pr.risiko_id
       JOIN penugasan.tujuan tu   ON tu.id = ri.tujuan_id
       WHERE tu.program_id = ap.id AND wp.deleted_at IS NULL
         AND wp.simpulan IS NOT NULL AND length(trim(wp.simpulan)) > 0) AS prosedur_dengan_simpulan
FROM penugasan.audit_programs ap
JOIN pkpt.annual_audit_plans aap ON aap.id = ap.annual_plan_id
LEFT JOIN penugasan.tujuan tu    ON tu.program_id = ap.id
LEFT JOIN penugasan.risiko ri    ON ri.tujuan_id = tu.id
LEFT JOIN penugasan.prosedur pr  ON pr.risiko_id = ri.id
LEFT JOIN penugasan.rincian r    ON r.prosedur_id = pr.id
WHERE ap.deleted_at IS NULL
GROUP BY ap.id, ap.annual_plan_id, aap.judul_program, ap.nas_folder_name;

COMMENT ON VIEW audit.v_program_progress IS
    'Agregasi progress per program — dipakai dashboard & header Modul 3';

COMMIT;

-- ============================================================
-- ROLLBACK SCRIPT (manual):
-- BEGIN;
-- DROP VIEW  IF EXISTS audit.v_program_progress;
-- DROP TABLE IF EXISTS audit.workpaper_evidence CASCADE;
-- DROP TABLE IF EXISTS audit.workpaper_prosedur CASCADE;
-- ALTER TABLE penugasan.rincian
--     DROP COLUMN IF EXISTS pengujian_updated_at,
--     DROP COLUMN IF EXISTS pengujian_updated_by,
--     DROP COLUMN IF EXISTS catatan_pengujian;
-- ALTER TABLE penugasan.audit_programs
--     DROP COLUMN IF EXISTS nas_initialized_at,
--     DROP COLUMN IF EXISTS nas_folder_name;
-- COMMIT;
-- ============================================================
