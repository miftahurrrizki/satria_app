-- Migration 008: Tambah kolom judul pada kegiatan_hasil_audit
-- Setiap hasil audit (Konfirmasi Positif / Temuan / OFI) kini memiliki judul singkat
-- sebagai identifikasi utama pada tampilan collapsible card.

ALTER TABLE audit.kegiatan_hasil_audit
  ADD COLUMN IF NOT EXISTS judul TEXT;

COMMENT ON COLUMN audit.kegiatan_hasil_audit.judul IS
  'Judul singkat hasil audit (plain text) — digunakan sebagai label pada collapsed card view';
