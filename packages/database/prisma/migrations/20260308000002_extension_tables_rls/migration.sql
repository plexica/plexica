-- Migration: 20260308000002_extension_tables_rls
-- Spec 013 Extension Points — T013-02 (ADR-031 Safeguard 4)
--
-- Enables Row-Level Security on all 5 extension tables.
-- Tenant isolation: a session can only see rows where tenant_id matches
-- app.current_tenant_id (set by the tenant-context middleware).
-- Super Admin bypass: sessions with app.is_super_admin = 'true' see all rows.
--
-- IMPORTANT: This migration is ADDITIVE ONLY (Art. 9.1.3).
--
-- NOTE: tenant_id columns are TEXT (not UUID) — no ::text cast needed.
-- workspace_id is also TEXT — the workspace join uses TEXT = TEXT directly.

-- ==========================================================================
-- extension_slots RLS
-- ==========================================================================

ALTER TABLE core.extension_slots ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policy
CREATE POLICY ext_slots_tenant_isolation ON core.extension_slots
  USING (
    tenant_id = current_setting('app.current_tenant_id', TRUE)
    OR current_setting('app.is_super_admin', TRUE) = 'true'
  );

-- ==========================================================================
-- extension_contributions RLS
-- ==========================================================================

ALTER TABLE core.extension_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY ext_contributions_tenant_isolation ON core.extension_contributions
  USING (
    tenant_id = current_setting('app.current_tenant_id', TRUE)
    OR current_setting('app.is_super_admin', TRUE) = 'true'
  );

-- ==========================================================================
-- workspace_extension_visibility RLS
-- Visibility rows scoped to workspaces; workspaces belong to tenants.
-- Use a join to resolve the tenant boundary.
--
-- PERFORMANCE NOTE (forge-review F-017):
-- The EXISTS/JOIN subquery runs once per row evaluated by the planner. This
-- is unavoidable because workspace_extension_visibility has no tenant_id
-- column — tenant ownership is resolved indirectly through core.workspaces.
-- Accepted trade-off rationale:
--   1. The table is accessed only on visibility PATCH/GET requests, which are
--      infrequent management operations (not hot-path reads).
--   2. core.workspaces.id is the primary key (btree index); the subquery
--      therefore performs an index scan, not a sequential scan.
--   3. Adding a denormalized tenant_id column would duplicate data and risk
--      drift if a workspace is ever re-parented — a consistency hazard
--      considered worse than the subquery cost.
--   4. Revisit if profiling shows RLS overhead >5 ms at P95 (Constitution
--      Art. 4.3 DB target: <50 ms P95).
-- ==========================================================================

ALTER TABLE core.workspace_extension_visibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY ext_visibility_tenant_isolation ON core.workspace_extension_visibility
  USING (
    EXISTS (
      SELECT 1 FROM core.workspaces w
      WHERE w.id = workspace_id
        AND (
          w.tenant_id = current_setting('app.current_tenant_id', TRUE)
          OR current_setting('app.is_super_admin', TRUE) = 'true'
        )
    )
  );

-- ==========================================================================
-- extensible_entities RLS
-- ==========================================================================

ALTER TABLE core.extensible_entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY ext_entities_tenant_isolation ON core.extensible_entities
  USING (
    tenant_id = current_setting('app.current_tenant_id', TRUE)
    OR current_setting('app.is_super_admin', TRUE) = 'true'
  );

-- ==========================================================================
-- data_extensions RLS
-- ==========================================================================

ALTER TABLE core.data_extensions ENABLE ROW LEVEL SECURITY;

CREATE POLICY ext_data_extensions_tenant_isolation ON core.data_extensions
  USING (
    tenant_id = current_setting('app.current_tenant_id', TRUE)
    OR current_setting('app.is_super_admin', TRUE) = 'true'
  );
