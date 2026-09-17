-- 006_translation_overrides/migration.sql
-- Adds the tenant-scoped translation_overrides table (feature 006-10).
-- All statements run inside tenant_<slug> schema (search_path is pre-set by multi-schema-migrate.ts).
-- Composite PK (key, locale) — exact key lookup on shell boot (plan §4.3).
-- Additive; no backfill.

CREATE TABLE IF NOT EXISTS translation_overrides (
  key        VARCHAR(255)  NOT NULL,
  locale     VARCHAR(8)    NOT NULL,
  value      VARCHAR(1024) NOT NULL,
  updated_by UUID,
  updated_at TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT translation_overrides_pkey PRIMARY KEY (key, locale)
);