-- Migration: 20260309000001_seed_platform_tenant
-- Hotfix for CRITICAL finding: GLOBAL_TENANT_ID = '__global__' FK violation
--
-- The super-admin plugin lifecycle routes (install/activate/deactivate/uninstall)
-- in plugin-v1.ts pass a sentinel tenantId to PluginLifecycleService methods that
-- write rows to `core.tenant_plugins`, which has a NOT NULL FK to `core.tenants.id`.
-- Using '__global__' as the tenantId causes a FK constraint violation in production.
--
-- Fix: Insert a well-known "platform" tenant row with a fixed UUID
-- (00000000-0000-0000-0000-000000000001). This row represents the platform itself
-- (not a real customer tenant) and is used exclusively for platform-level plugin
-- installations by super-admin routes.
--
-- The PLATFORM_TENANT_ID constant in the application layer is set to this UUID.
--
-- ADDITIVE ONLY — no existing rows are modified.

INSERT INTO "core"."tenants" (
  "id",
  "slug",
  "name",
  "status",
  "settings",
  "theme",
  "translation_overrides",
  "default_locale",
  "created_at",
  "updated_at"
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  '__platform__',
  'Platform (System)',
  'ACTIVE',
  '{}',
  '{}',
  '{}',
  'en',
  NOW(),
  NOW()
) ON CONFLICT ("id") DO NOTHING;
