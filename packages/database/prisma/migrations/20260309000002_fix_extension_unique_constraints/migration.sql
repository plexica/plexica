-- Migration: 20260309000002_fix_extension_unique_constraints
-- Spec 013 — Extension Points (C-01 forge-review finding)
--
-- Problem: The 4 unique constraints added in migration 20260308000001 were
-- created WITHOUT tenant_id. This means two tenants running the same plugin
-- cannot both register the same (plugin_id, slot_id) pair — the second upsert
-- raises a unique-constraint violation, silently blocking one tenant's
-- extension registry without any error surfaced to the caller.
--
-- Fix: Drop the old tenant-unscoped constraints and replace them with
-- tenant-scoped ones. The new constraint names are preserved where possible
-- so that Prisma-generated client code and index references continue to work.
--
-- ADR-031 Safeguard 4 (PostgreSQL RLS): The RLS policies added in migration
-- 20260308000002 already enforce tenant isolation at the row level.
-- This migration adds the correct uniqueness guarantee at the constraint level.
--
-- IMPORTANT: This migration is ADDITIVE with respect to data. No rows are
-- deleted. The DROP/ADD operations only affect the constraint definitions.

-- ==========================================================================
-- 1. extension_slots: (plugin_id, slot_id) → (tenant_id, plugin_id, slot_id)
-- ==========================================================================

ALTER TABLE core.extension_slots
  DROP CONSTRAINT IF EXISTS uq_extension_slots_plugin_slot;

ALTER TABLE core.extension_slots
  ADD CONSTRAINT uq_extension_slots_plugin_slot
    UNIQUE (tenant_id, plugin_id, slot_id);

-- ==========================================================================
-- 2. extension_contributions: drop old, add tenant_id-prefixed constraint
-- ==========================================================================

ALTER TABLE core.extension_contributions
  DROP CONSTRAINT IF EXISTS uq_extension_contributions_unique;

ALTER TABLE core.extension_contributions
  ADD CONSTRAINT uq_extension_contributions_unique
    UNIQUE (tenant_id, contributing_plugin_id, target_plugin_id, target_slot_id);

-- ==========================================================================
-- 3. extensible_entities: (plugin_id, entity_type) → (tenant_id, plugin_id, entity_type)
-- ==========================================================================

ALTER TABLE core.extensible_entities
  DROP CONSTRAINT IF EXISTS uq_extensible_entities_plugin_type;

ALTER TABLE core.extensible_entities
  ADD CONSTRAINT uq_extensible_entities_plugin_type
    UNIQUE (tenant_id, plugin_id, entity_type);

-- ==========================================================================
-- 4. data_extensions: drop old, add tenant_id-prefixed constraint
-- ==========================================================================

ALTER TABLE core.data_extensions
  DROP CONSTRAINT IF EXISTS uq_data_extensions_unique;

ALTER TABLE core.data_extensions
  ADD CONSTRAINT uq_data_extensions_unique
    UNIQUE (tenant_id, contributing_plugin_id, target_plugin_id, target_entity_type);
