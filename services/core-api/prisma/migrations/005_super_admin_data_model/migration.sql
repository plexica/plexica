-- Migration: 005_super_admin_data_model
-- ADR-022: Super Admin Infrastructure and Data Model
-- Decisions 1, 2, 4, 5 — data model changes for Spec 005 (Super Admin Panel)

-- ── Decision 1: tenant_deletion_steps table ──────────────────────────────
CREATE TABLE IF NOT EXISTS core.tenant_deletion_steps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES core.tenants(id), -- ADR-022: RESTRICT (no cascade) — saga records are compliance artifacts
  step        VARCHAR(32) NOT NULL
                CHECK (step IN ('schema_drop', 'realm_delete', 'bucket_delete')),
  status      VARCHAR(16) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'in_progress', 'done', 'failed')),
  attempts    INTEGER NOT NULL DEFAULT 0,
  last_error  TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, step)
);

CREATE INDEX IF NOT EXISTS idx_tenant_deletion_steps_status
  ON core.tenant_deletion_steps(status, updated_at);

-- ── Decision 2: platform_audit_log table ─────────────────────────────────
CREATE TABLE IF NOT EXISTS core.platform_audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id      VARCHAR(255) NOT NULL,
  action        VARCHAR(64) NOT NULL,
  resource_type VARCHAR(64) NOT NULL,
  resource_id   UUID,
  tenant_id     UUID,
  metadata      JSONB NOT NULL DEFAULT '{}',
  ip_address    INET,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_log_actor
  ON core.platform_audit_log(actor_id, created_at);
CREATE INDEX IF NOT EXISTS idx_platform_audit_log_action
  ON core.platform_audit_log(action, created_at);
CREATE INDEX IF NOT EXISTS idx_platform_audit_log_tenant
  ON core.platform_audit_log(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_platform_audit_log_created_at
  ON core.platform_audit_log(created_at DESC);

-- ── Decision 4: optimistic locking version column on tenants ─────────────
ALTER TABLE core.tenants
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- ── Decision 1: pending_deletion enum value on tenants ───────────────────
-- Adds 'pending_deletion' to the TenantStatus native enum.
-- PostgreSQL 12+ supports ALTER TYPE ... ADD VALUE IF NOT EXISTS inside
-- a transaction (the value becomes usable after commit).
ALTER TYPE core."TenantStatus" ADD VALUE IF NOT EXISTS 'pending_deletion';

-- ── Decision 5: plugin review queue columns ──────────────────────────────
ALTER TABLE core.plugins
  ADD COLUMN IF NOT EXISTS review_status VARCHAR(16) NOT NULL DEFAULT 'none'
    CHECK (review_status IN ('none', 'pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS review_notes  TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by   VARCHAR(255);

-- ── Decision 5: backfill review_status for existing published plugins ────
-- Plugins already published before the review queue feature are considered
-- approved — they can be re-published without going through review again.
UPDATE core.plugins
  SET review_status = 'approved'
  WHERE status = 'published' AND review_status = 'none';

-- ── Decision 5: deprecated status on plugins ─────────────────────────────
-- Add CHECK constraint to enforce valid status values including 'deprecated'.
-- Uses NOT VALID + VALIDATE to avoid a full table scan during migration
-- (NOT VALID skips existing rows; VALIDATE checks them without blocking writes).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'plugins_status_check' AND conrelid = 'core.plugins'::regclass
  ) THEN
    ALTER TABLE core.plugins
      ADD CONSTRAINT plugins_status_check
      CHECK (status IN ('draft', 'published', 'unpublished', 'deprecated')) NOT VALID;
    ALTER TABLE core.plugins VALIDATE CONSTRAINT plugins_status_check;
  END IF;
END $$;
