-- ============================================================
-- Migration 005: Schema Penugasan (Module 2 – Individual Audit Plan)
-- ============================================================

CREATE SCHEMA IF NOT EXISTS penugasan;

-- Program individual (linked to Module 1 pkpt.annual_audit_plans)
CREATE TABLE penugasan.audit_programs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  annual_plan_id   UUID NOT NULL REFERENCES pkpt.annual_audit_plans(id) ON DELETE RESTRICT,
  tahun            INT NOT NULL,
  auditee          TEXT,
  status           VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','aktif','selesai')),
  created_by       UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ,
  UNIQUE(annual_plan_id)
);

-- Fase items: Perencanaan & Pelaporan (flat list, user-defined)
CREATE TABLE penugasan.fase_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id       UUID NOT NULL REFERENCES penugasan.audit_programs(id) ON DELETE CASCADE,
  fase             VARCHAR(20) NOT NULL CHECK (fase IN ('perencanaan','pelaporan')),
  title            TEXT NOT NULL,
  order_index      INT NOT NULL DEFAULT 0,
  status           VARCHAR(20) NOT NULL DEFAULT 'tidak_dimulai' CHECK (status IN ('tidak_dimulai','dalam_proses','selesai')),
  est_hari         NUMERIC(6,2),
  man_days         NUMERIC(6,2),
  tanggal_jatuh_tempo DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE penugasan.fase_item_pics (
  item_id UUID NOT NULL REFERENCES penugasan.fase_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, user_id)
);

-- Pelaksanaan Level 1: Tujuan
CREATE TABLE penugasan.tujuan (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id  UUID NOT NULL REFERENCES penugasan.audit_programs(id) ON DELETE CASCADE,
  label       VARCHAR(10),
  title       TEXT NOT NULL,
  order_index INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pelaksanaan Level 2: Risiko
CREATE TABLE penugasan.risiko (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tujuan_id           UUID NOT NULL REFERENCES penugasan.tujuan(id) ON DELETE CASCADE,
  label               VARCHAR(10),
  title               TEXT NOT NULL,
  risk_ref_id         UUID REFERENCES pkpt.risk_data(id) ON DELETE SET NULL,
  order_index         INT NOT NULL DEFAULT 0,
  tanggal_jatuh_tempo DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pelaksanaan Level 3: Prosedur
CREATE TABLE penugasan.prosedur (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  risiko_id           UUID NOT NULL REFERENCES penugasan.risiko(id) ON DELETE CASCADE,
  label               VARCHAR(10),
  title               TEXT NOT NULL,
  order_index         INT NOT NULL DEFAULT 0,
  tanggal_jatuh_tempo DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pelaksanaan Level 4: Rincian (leaf node — has status, est_hari, man_days, PICs)
CREATE TABLE penugasan.rincian (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prosedur_id         UUID NOT NULL REFERENCES penugasan.prosedur(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  order_index         INT NOT NULL DEFAULT 0,
  status              VARCHAR(20) NOT NULL DEFAULT 'tidak_dimulai' CHECK (status IN ('tidak_dimulai','dalam_proses','selesai')),
  est_hari            NUMERIC(6,2),
  man_days            NUMERIC(6,2),
  tanggal_jatuh_tempo DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE penugasan.rincian_pics (
  rincian_id UUID NOT NULL REFERENCES penugasan.rincian(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (rincian_id, user_id)
);

-- Indexes
CREATE INDEX idx_ap_annual_plan   ON penugasan.audit_programs(annual_plan_id);
CREATE INDEX idx_fi_program       ON penugasan.fase_items(program_id, fase);
CREATE INDEX idx_tujuan_program   ON penugasan.tujuan(program_id);
CREATE INDEX idx_risiko_tujuan    ON penugasan.risiko(tujuan_id);
CREATE INDEX idx_prosedur_risiko  ON penugasan.prosedur(risiko_id);
CREATE INDEX idx_rincian_prosedur ON penugasan.rincian(prosedur_id);
