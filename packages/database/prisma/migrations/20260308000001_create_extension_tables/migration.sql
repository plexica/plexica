-- Migration: 20260308000001_create_extension_tables
-- Spec 013 Extension Points — T013-02 (ADR-031)
--
-- Creates 5 extension registry tables in the core schema.
-- ADR-031: Bounded exception to ADR-002 (schema-per-tenant).
-- All 5 tables placed in core shared schema because cross-plugin slot
-- resolution requires core visibility. Tenant isolation is enforced via
-- tenant_id columns + RLS (second migration) + single repository access path.
--
-- IMPORTANT: This migration is ADDITIVE ONLY (Art. 9.1.3).
-- No existing tables are modified.
--
-- NOTE: All id/FK columns use TEXT (not UUID) to match the existing Prisma
-- schema convention where all primary keys are TEXT (String @id @default(uuid())).
-- Timestamps use timestamp(3) without time zone to match Prisma @updatedAt/@default(now()).

-- ==========================================================================
-- 1. extension_slots
--    Declared by slot-owner plugins. One row per (plugin_id, slot_id) pair.
-- ==========================================================================

CREATE TABLE core.extension_slots (
  id              TEXT        NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  tenant_id       TEXT        NOT NULL,
  plugin_id       TEXT        NOT NULL,
  slot_id         VARCHAR(255) NOT NULL,
  label           VARCHAR(255) NOT NULL,
  type            VARCHAR(50)  NOT NULL CHECK (type IN ('action', 'panel', 'form', 'toolbar')),
  max_contributions INT        NOT NULL DEFAULT 0,
  context_schema  JSONB,
  description     TEXT,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_extension_slots_tenant
    FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_extension_slots_plugin
    FOREIGN KEY (plugin_id) REFERENCES core.plugins(id) ON DELETE CASCADE,
  CONSTRAINT uq_extension_slots_plugin_slot
    UNIQUE (plugin_id, slot_id)
);

CREATE INDEX idx_extension_slots_tenant_id    ON core.extension_slots(tenant_id);
CREATE INDEX idx_extension_slots_plugin_id    ON core.extension_slots(plugin_id);
CREATE INDEX idx_extension_slots_tenant_type  ON core.extension_slots(tenant_id, type);
CREATE INDEX idx_extension_slots_active       ON core.extension_slots(tenant_id, is_active);

-- ==========================================================================
-- 2. extension_contributions
--    Declared by contributing plugins. Each row is one plugin contributing
--    a component to another plugin's slot.
-- ==========================================================================

CREATE TABLE core.extension_contributions (
  id                       TEXT        NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  tenant_id                TEXT        NOT NULL,
  contributing_plugin_id   TEXT        NOT NULL,
  target_plugin_id         TEXT        NOT NULL,
  target_slot_id           VARCHAR(255) NOT NULL,
  component_name           VARCHAR(255) NOT NULL,
  priority                 INT          NOT NULL DEFAULT 100 CHECK (priority >= 0 AND priority <= 999),
  output_schema            JSONB,
  preview_url              TEXT,
  description              TEXT,
  validation_status        VARCHAR(50)  NOT NULL DEFAULT 'pending'
                             CHECK (validation_status IN
                               ('pending', 'valid', 'target_not_found', 'type_mismatch', 'schema_changed')),
  is_active                BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_extension_contributions_tenant
    FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_extension_contributions_contributing_plugin
    FOREIGN KEY (contributing_plugin_id) REFERENCES core.plugins(id) ON DELETE CASCADE,
  CONSTRAINT fk_extension_contributions_target_plugin
    FOREIGN KEY (target_plugin_id) REFERENCES core.plugins(id) ON DELETE CASCADE,
  CONSTRAINT uq_extension_contributions_unique
    UNIQUE (contributing_plugin_id, target_plugin_id, target_slot_id)
);

CREATE INDEX idx_extension_contributions_tenant_id          ON core.extension_contributions(tenant_id);
CREATE INDEX idx_extension_contributions_contributing        ON core.extension_contributions(tenant_id, contributing_plugin_id);
CREATE INDEX idx_extension_contributions_target             ON core.extension_contributions(tenant_id, target_plugin_id, target_slot_id);
CREATE INDEX idx_extension_contributions_active             ON core.extension_contributions(tenant_id, is_active);
CREATE INDEX idx_extension_contributions_validation         ON core.extension_contributions(tenant_id, validation_status);

-- ==========================================================================
-- 3. workspace_extension_visibility
--    Per-workspace override for showing/hiding a contribution.
--    Default behaviour (no row) = visible.
-- ==========================================================================

CREATE TABLE core.workspace_extension_visibility (
  workspace_id      TEXT    NOT NULL,
  contribution_id   TEXT    NOT NULL,
  is_visible        BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at        TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT pk_workspace_extension_visibility
    PRIMARY KEY (workspace_id, contribution_id),
  CONSTRAINT fk_wev_workspace
    FOREIGN KEY (workspace_id) REFERENCES core.workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_wev_contribution
    FOREIGN KEY (contribution_id) REFERENCES core.extension_contributions(id) ON DELETE CASCADE
);

CREATE INDEX idx_workspace_ext_visibility_workspace
  ON core.workspace_extension_visibility(workspace_id);
CREATE INDEX idx_workspace_ext_visibility_contribution
  ON core.workspace_extension_visibility(contribution_id);

-- ==========================================================================
-- 4. extensible_entities
--    Entity types a plugin exposes for sidecar data extension.
-- ==========================================================================

CREATE TABLE core.extensible_entities (
  id           TEXT        NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  tenant_id    TEXT        NOT NULL,
  plugin_id    TEXT        NOT NULL,
  entity_type  VARCHAR(255) NOT NULL,
  label        VARCHAR(255) NOT NULL,
  field_schema JSONB        NOT NULL DEFAULT '{}',
  description  TEXT,
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_extensible_entities_tenant
    FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_extensible_entities_plugin
    FOREIGN KEY (plugin_id) REFERENCES core.plugins(id) ON DELETE CASCADE,
  CONSTRAINT uq_extensible_entities_plugin_type
    UNIQUE (plugin_id, entity_type)
);

CREATE INDEX idx_extensible_entities_tenant_id    ON core.extensible_entities(tenant_id);
CREATE INDEX idx_extensible_entities_plugin_id    ON core.extensible_entities(plugin_id);
CREATE INDEX idx_extensible_entities_entity_type  ON core.extensible_entities(tenant_id, entity_type);

-- ==========================================================================
-- 5. data_extensions
--    Sidecar data extension registrations — plugin B extends plugin A's entity.
-- ==========================================================================

CREATE TABLE core.data_extensions (
  id                    TEXT        NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  tenant_id             TEXT        NOT NULL,
  contributing_plugin_id TEXT       NOT NULL,
  target_plugin_id      TEXT        NOT NULL,
  target_entity_type    VARCHAR(255) NOT NULL,
  sidecar_url           TEXT         NOT NULL,
  field_schema          JSONB        NOT NULL DEFAULT '{}',
  description           TEXT,
  is_active             BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_data_extensions_tenant
    FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_data_extensions_contributing_plugin
    FOREIGN KEY (contributing_plugin_id) REFERENCES core.plugins(id) ON DELETE CASCADE,
  CONSTRAINT fk_data_extensions_target_plugin
    FOREIGN KEY (target_plugin_id) REFERENCES core.plugins(id) ON DELETE CASCADE,
  CONSTRAINT uq_data_extensions_unique
    UNIQUE (contributing_plugin_id, target_plugin_id, target_entity_type)
);

CREATE INDEX idx_data_extensions_tenant_id        ON core.data_extensions(tenant_id);
CREATE INDEX idx_data_extensions_contributing      ON core.data_extensions(tenant_id, contributing_plugin_id);
CREATE INDEX idx_data_extensions_target            ON core.data_extensions(tenant_id, target_plugin_id, target_entity_type);

-- ==========================================================================
-- updated_at auto-update triggers (pattern from existing migrations)
-- ==========================================================================

CREATE OR REPLACE FUNCTION core.update_extension_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_extension_slots_updated_at
  BEFORE UPDATE ON core.extension_slots
  FOR EACH ROW EXECUTE FUNCTION core.update_extension_updated_at();

CREATE TRIGGER trg_extension_contributions_updated_at
  BEFORE UPDATE ON core.extension_contributions
  FOR EACH ROW EXECUTE FUNCTION core.update_extension_updated_at();

CREATE TRIGGER trg_workspace_ext_visibility_updated_at
  BEFORE UPDATE ON core.workspace_extension_visibility
  FOR EACH ROW EXECUTE FUNCTION core.update_extension_updated_at();

CREATE TRIGGER trg_extensible_entities_updated_at
  BEFORE UPDATE ON core.extensible_entities
  FOR EACH ROW EXECUTE FUNCTION core.update_extension_updated_at();

CREATE TRIGGER trg_data_extensions_updated_at
  BEFORE UPDATE ON core.data_extensions
  FOR EACH ROW EXECUTE FUNCTION core.update_extension_updated_at();
