-- Migration: 20260309000003_tenant_plugin_plugin_id_index
-- Spec 013 forge-review fix: add missing index on tenant_plugins.plugin_id
--
-- TenantPlugin has a composite PK (tenantId, pluginId). Queries that filter by
-- pluginId alone (e.g. "find all tenants that have plugin X installed") perform
-- a sequential scan without this index. Adding it enables efficient reverse-
-- lookup from plugin → tenants.
--
-- Safe: purely additive, no data changes, no locks on existing rows
-- (PostgreSQL CREATE INDEX CONCURRENTLY is not used here because the migration
-- runner applies migrations in a transaction; CONCURRENTLY is incompatible with
-- transactions, so a standard CREATE INDEX is used instead — acceptable for the
-- current data volume).

CREATE INDEX IF NOT EXISTS "tenant_plugins_plugin_id_idx"
  ON "core"."tenant_plugins" ("plugin_id");
