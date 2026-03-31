-- migration.sql
-- 001_init_core_schema
-- Creates the core schema, tenant_status enum, tenants table, and tenant_configs table.

-- Create the core schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS core;

-- Create tenant status enum
DO $$ BEGIN
  CREATE TYPE core.tenant_status AS ENUM ('active', 'suspended', 'deleted');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create tenants table
CREATE TABLE IF NOT EXISTS core.tenants (
  id          UUID          NOT NULL DEFAULT gen_random_uuid(),
  -- Max 51 chars: "tenant_" (7) + 51 = 58, safely under PostgreSQL's 63-char identifier limit
  slug        VARCHAR(51)   NOT NULL,
  name        VARCHAR(255)  NOT NULL,
  status      core.tenant_status NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT tenants_pkey PRIMARY KEY (id),
  CONSTRAINT tenants_slug_key UNIQUE (slug),
  CONSTRAINT tenants_slug_format CHECK (
    slug ~ '^[a-z][a-z0-9-]{1,49}[a-z0-9]$'
  )
);

-- Create tenant_configs table
CREATE TABLE IF NOT EXISTS core.tenant_configs (
  id               UUID          NOT NULL DEFAULT gen_random_uuid(),
  tenant_id        UUID          NOT NULL,
  keycloak_realm   VARCHAR(255)  NOT NULL,
  settings         JSONB         NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT tenant_configs_pkey       PRIMARY KEY (id),
  CONSTRAINT tenant_configs_tenant_id_key UNIQUE (tenant_id),
  CONSTRAINT tenant_configs_keycloak_realm_key UNIQUE (keycloak_realm),
  CONSTRAINT tenant_configs_tenant_fk  FOREIGN KEY (tenant_id)
    REFERENCES core.tenants(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS tenants_status_idx ON core.tenants (status);

-- Prisma migration tracking table (must exist in core schema)
CREATE TABLE IF NOT EXISTS core._prisma_migrations (
  id                  VARCHAR(36)   NOT NULL,
  checksum            VARCHAR(64)   NOT NULL,
  finished_at         TIMESTAMPTZ,
  migration_name      VARCHAR(255)  NOT NULL,
  logs                TEXT,
  rolled_back_at      TIMESTAMPTZ,
  started_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  applied_steps_count INTEGER       NOT NULL DEFAULT 0,

  CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id)
);
