-- Migration: 20260304000000_create_audit_logs_and_system_config
-- Spec 008 Admin Interfaces: audit_logs and system_config tables
-- ADR-025: audit_logs placed in core shared schema (not per-tenant)
--   because Super Admin cross-tenant visibility requires a single table.
-- system_config: platform-wide key-value configuration store.

-- ============================================================================
-- audit_logs (core schema — ADR-025)
-- Append-only audit trail for all platform actions.
-- ============================================================================
CREATE TABLE "core"."audit_logs" (
  "id"            UUID         NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"     TEXT,
  "user_id"       TEXT,
  "action"        VARCHAR(100) NOT NULL,
  "resource_type" TEXT,
  "resource_id"   TEXT,
  "details"       JSONB        NOT NULL DEFAULT '{}',
  "ip_address"    TEXT,
  "user_agent"    TEXT,
  "created_at"    TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- Index: tenant-scoped queries (most common access pattern)
CREATE INDEX "idx_audit_logs_tenant_id"      ON "core"."audit_logs" ("tenant_id");
-- Index: time-range queries
CREATE INDEX "idx_audit_logs_created_at"     ON "core"."audit_logs" ("created_at");
-- Index: action-filter queries
CREATE INDEX "idx_audit_logs_action"         ON "core"."audit_logs" ("action");
-- Index: composite for tenant + time range (NFR-002 < 500ms)
CREATE INDEX "idx_audit_logs_tenant_created" ON "core"."audit_logs" ("tenant_id", "created_at");
-- Index: user-scoped queries
CREATE INDEX "idx_audit_logs_user_id"        ON "core"."audit_logs" ("user_id");

-- ============================================================================
-- system_config (core schema)
-- Platform-wide configuration key-value store.
-- ============================================================================
CREATE TABLE "core"."system_config" (
  "key"         TEXT         NOT NULL,
  "value"       JSONB        NOT NULL,
  "category"    VARCHAR(50)  NOT NULL,
  "description" TEXT,
  "updated_by"  TEXT,
  "updated_at"  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "system_config_pkey" PRIMARY KEY ("key")
);

-- Index: category-filter queries
CREATE INDEX "idx_system_config_category" ON "core"."system_config" ("category");
