-- Add i18n-related columns to the tenants table for internationalization support
-- This migration adds:
-- 1. translation_overrides (JSONB): Stores tenant-specific translation key overrides
-- 2. default_locale (VARCHAR): Tenant's default locale (used in locale resolution chain)
-- Both columns have safe defaults for backward compatibility (Art. 9.1)

-- Add translation_overrides column (JSONB for nested locale/namespace/key structure)
ALTER TABLE "core"."tenants" ADD COLUMN "translation_overrides" JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Add default_locale column (VARCHAR with en default per FR-009)
ALTER TABLE "core"."tenants" ADD COLUMN "default_locale" VARCHAR(10) NOT NULL DEFAULT 'en';

-- Create index on default_locale for efficient locale-based filtering
CREATE INDEX "idx_tenants_default_locale" ON "core"."tenants"("default_locale");

-- Verify: Existing tenants now have default values (no data loss, backward compatible)
-- SELECT id, slug, translation_overrides, default_locale FROM "core"."tenants" LIMIT 5;
