-- ============================================================
-- SATRIA — Risk Level Guideline Update
-- Date   : 2026-05-01
-- Scope  : master.risk_level_ref
--
-- Pedoman:
--   Tingkat risiko = Dampak x Kemungkinan.
--   Kode seperti 54 berarti Dampak 5 dan Kemungkinan 4,
--   sehingga skor produk = 20 dan level = Ekstrim.
-- ============================================================

INSERT INTO master.risk_level_ref
  (kode, label, warna_hex, warna_bg, warna_text, skor_min, skor_max, urutan)
VALUES
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
