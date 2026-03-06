# Spec 011 — Task Breakdown

**Spec**: Workspace Hierarchy & Templates
**Status**: Complete
**Total Tasks**: 27
**Total Points**: ~64
**Phases**: 4
**Last Updated**: 2026-03-02

---

## Summary Table

| Task     | Title                                                         | Phase | Sprint  | Points | Depends On                | Status |
| -------- | ------------------------------------------------------------- | ----- | ------- | ------ | ------------------------- | ------ |
| T011-01  | DB Migration — Workspace Hierarchy Columns                    | 1     | 3, Wk 1 | 3      | —                         | [x]    |
| T011-02  | WorkspaceHierarchyService — Core Path Operations              | 1     | 3, Wk 1 | 5      | T011-01                   | [x]    |
| T011-02b | FR-004b — Configurable Max Depth (`WORKSPACE_MAX_DEPTH`)      | 1     | 3, Wk 1 | 1      | T011-02                   | [x]    |
| T011-03  | Ancestor Permission Checks                                    | 1     | 3, Wk 2 | 2      | T011-02                   | [x]    |
| T011-04  | `workspace.guard.ts` — Hierarchical Access                    | 1     | 3, Wk 2 | 2      | T011-03                   | [x]    |
| T011-05  | API Routes — Tree View & Children                             | 1     | 3, Wk 2 | 2      | T011-04                   | [x]    |
| T011-06  | `WorkspaceService` — Create/Update/Delete hierarchy wiring    | 1     | 3, Wk 2 | 3      | T011-02b                  | [x]    |
| T011-07  | Phase 1 Tests                                                 | 1     | 3, Wk 3 | 2      | T011-01–T011-06           | [x]    |
| T011-07b | Performance Hardening — Indexes, Cache, Benchmarks            | 1     | 3, Wk 3 | 2      | T011-01, T011-02, T011-07 | [x]    |
| T011-08  | DB Migration — Template & WorkspacePlugin Models              | 2     | 4, Wk 4 | 3      | T011-01                   | [x]    |
| T011-09  | `WorkspacePluginService`                                      | 2     | 4, Wk 4 | 3      | T011-08                   | [x]    |
| T011-10  | `WorkspaceTemplateService` — CRUD                             | 2     | 4, Wk 4 | 3      | T011-08                   | [x]    |
| T011-11  | `WorkspaceTemplateService` — Transactional Application        | 2     | 4, Wk 4 | 2      | T011-09, T011-10          | [x]    |
| T011-12  | API Routes — Templates & Workspace Plugins                    | 2     | 4, Wk 5 | 2      | T011-11                   | [x]    |
| T011-13  | Phase 2 Tests                                                 | 2     | 4, Wk 5 | 2      | T011-08–T011-12           | [x]    |
| T011-14  | Plugin Hooks — `before_create` (Sequential)                   | 3     | 4, Wk 5 | 3      | T011-06                   | [x]    |
| T011-15  | Plugin Hooks — `created`/`deleted` (Parallel Fire-and-Forget) | 3     | 5, Wk 5 | 2      | T011-14                   | [x]    |
| T011-16  | EventBus Integration — `core.workspace.*` Events              | 3     | 5, Wk 6 | 2      | T011-15                   | [x]    |
| T011-17  | Plugin Template Registration API                              | 3     | 5, Wk 6 | 2      | T011-10, T011-14          | [x]    |
| T011-18  | Phase 3 Tests                                                 | 3     | 5, Wk 7 | 3      | T011-14–T011-17           | [x]    |
| T011-19  | Design Tokens — Hierarchy & Template UI                       | 4     | 5, Wk 8 | 1      | —                         | [x]    |
| T011-20  | `WorkspaceTreeNode` Component                                 | 4     | 5, Wk 8 | 2      | T011-19                   | [x]    |
| T011-21  | `WorkspaceTreeView` Component                                 | 4     | 5, Wk 8 | 3      | T011-20                   | [x]    |
| T011-22  | `TemplateCard` Component                                      | 4     | 5, Wk 8 | 2      | T011-19                   | [x]    |
| T011-23  | `TemplatePickerGrid` Component                                | 4     | 5, Wk 8 | 2      | T011-22                   | [x]    |
| T011-24  | `PluginToggleCard` Component                                  | 4     | 5, Wk 9 | 2      | T011-19                   | [x]    |
| T011-25  | `MoveWorkspaceDialog` Component                               | 4     | 5, Wk 9 | 3      | T011-21                   | [x]    |
| T011-26  | Frontend Tests & Accessibility Verification                   | 4     | 5, Wk 9 | 4      | T011-20–T011-25           | [x]    |

---

## Critical Path

```
T011-01 → T011-02 → T011-02b → T011-06 → T011-14 → T011-15 → T011-16 → T011-18
                            ↓
                         T011-03 → T011-04 → T011-05
```

Secondary path through templates:

```
T011-08 → T011-09 → T011-11 → T011-12 → T011-17 → T011-18
               ↓
           T011-10
```

Frontend critical path:

```
T011-19 → T011-20 → T011-21 → T011-25 → T011-26
               ↓
           T011-22 → T011-23
```

**Estimated critical path duration**: 7 weeks (Sprints 3–5)

---

## Phase 1: Workspace Hierarchy (Sprint 3, Weeks 1–3)

### T011-01: DB Migration — Workspace Hierarchy Columns

- **Phase**: 1
- **Sprint**: Sprint 3, Week 1
- **Points**: 3
- **Depends on**: none
- **FRs**: FR-001, FR-002, FR-003, FR-004
- **Files**:
  - `packages/database/prisma/schema.prisma` (modify)
  - `packages/database/prisma/migrations/20260301000000_workspace_hierarchy/migration.sql` (create)
- **Tests required**:
  - Unit: migration is idempotent; existing workspaces retain valid defaults
- **Acceptance criteria**:
  - [ ] `parent_id UUID NULLABLE` column added with self-referencing FK `ON DELETE RESTRICT`
  - [ ] `depth INTEGER NOT NULL DEFAULT 0` with `CHECK (depth >= 0)` constraint
  - [ ] `path VARCHAR NOT NULL DEFAULT ''` column added
  - [ ] `@@unique([parentId, slug])` replaces `@@unique([tenantId, slug])` in schema
  - [ ] Partial unique index created: `CREATE UNIQUE INDEX idx_workspace_root_slug_unique ON workspaces (tenant_id, slug) WHERE parent_id IS NULL`
  - [ ] B-TREE indexes added: `idx_workspaces_parent`, `idx_workspaces_path`, `idx_workspaces_depth`
  - [ ] `pnpm db:migrate` and `pnpm db:generate` succeed on a clean test database
  - [ ] Existing workspace rows unaffected (all new columns have safe defaults)
- **Definition of Done**:
  - [ ] Code written and compiles with `tsc --noEmit`
  - [ ] All tests pass
  - [ ] PR reviewed and approved

---

### T011-02: WorkspaceHierarchyService — Core Path Operations

- **Phase**: 1
- **Sprint**: Sprint 3, Week 1
- **Points**: 5
- **Depends on**: T011-01
- **FRs**: FR-001, FR-002, FR-003, FR-008, FR-009
- **Files**:
  - `apps/core-api/src/modules/workspace/workspace-hierarchy.service.ts` (create)
  - `apps/core-api/src/modules/workspace/types/hierarchy.types.ts` (create)
- **Tests required**:
  - Unit: `computeHierarchyFields` (root and child), `getDescendants` LIKE query, `getDirectChildren` pagination, `getTree` membership filter, `getAggregatedCounts` single-pass JOIN, `getAncestorChain` ordering, `hasChildren` boolean
- **Acceptance criteria**:
  - [ ] `computeHierarchyFields(parent, newId)` returns `{ depth: 0, path: newId }` for root and `{ depth: parent.depth + 1, path: parent.path + '/' + newId }` for child
  - [ ] `getDescendants(rootPath, tenantCtx)` uses `WHERE path LIKE ${rootPath + '/%'}` with `Prisma.sql` — no string interpolation
  - [ ] `getDirectChildren(parentId, tenantCtx, limit, offset)` supports pagination; default limit 50, max 100
  - [ ] `getTree(userId, tenantCtx)` returns `TreeNode[]` filtered to workspaces where user is a member (or ancestor for context)
  - [ ] `getAggregatedCounts(workspacePath, tenantCtx)` returns `{ aggregatedMemberCount, aggregatedChildCount }` via single SQL JOIN (not correlated subqueries)
  - [ ] `getAncestorChain(workspacePath, tenantCtx)` returns ancestors ordered root-first
  - [ ] `hasChildren(workspaceId, tenantCtx)` returns boolean
  - [ ] All BigInt results from raw SQL converted via `Number(result.count)`
  - [ ] `hierarchy.types.ts` exports `TreeNode`, `AggregatedCounts`, `WorkspaceRow` interfaces
  - [ ] Tests pass with ≥80% coverage
- **Definition of Done**:
  - [ ] Code written and compiles with `tsc --noEmit`
  - [ ] All tests pass
  - [ ] PR reviewed and approved

---

### T011-02b: FR-004b — Configurable Max Depth (`WORKSPACE_MAX_DEPTH`)

- **Phase**: 1
- **Sprint**: Sprint 3, Week 1
- **Points**: 1
- **Depends on**: T011-02
- **FRs**: FR-004b
- **Files**:
  - `apps/core-api/src/modules/workspace/workspace-hierarchy.service.ts` (modify)
- **Tests required**:
  - Unit: depth at limit returns 400; depth below limit passes; env var overrides default
- **Acceptance criteria**:
  - [ ] `validateDepthConstraint(parentDepth)` reads `WORKSPACE_MAX_DEPTH` env var (default: `10`)
  - [ ] Throws HTTP 400 `WORKSPACE_DEPTH_EXCEEDED` when `parentDepth >= maxDepth`
  - [ ] Error response includes `{ currentDepth, configuredMax, parentWorkspaceId }`
  - [ ] Default max depth of 10 is used when env var is not set
  - [ ] Tests pass with ≥80% coverage
- **Definition of Done**:
  - [ ] Code written and compiles with `tsc --noEmit`
  - [ ] All tests pass
  - [ ] PR reviewed and approved

---

### T011-03: Ancestor Permission Checks

- **Phase**: 1
- **Sprint**: Sprint 3, Week 2
- **Points**: 2
- **Depends on**: T011-02
- **FRs**: FR-011, FR-012
- **Files**:
  - `apps/core-api/src/modules/workspace/workspace-hierarchy.service.ts` (modify)
- **Tests required**:
  - Unit: `isAncestorAdmin` true/false cases; grandparent admin; root MEMBER; no ancestors
- **Acceptance criteria**:
  - [ ] `isAncestorAdmin(userId, workspacePath, tenantCtx)` returns `true` if user is ADMIN in any ancestor workspace extracted from `path`
  - [ ] Returns `false` for root workspaces (no ancestors)
  - [ ] `validateParentAccess(parentId, userId, tenantCtx)` throws `PARENT_WORKSPACE_NOT_FOUND` (404) if parent missing
  - [ ] `validateParentAccess` throws `PARENT_PERMISSION_DENIED` (403) if user is not ADMIN of parent
  - [ ] Tests pass with ≥80% coverage
- **Definition of Done**:
  - [ ] Code written and compiles with `tsc --noEmit`
  - [ ] All tests pass
  - [ ] PR reviewed and approved

---

### T011-04: `workspace.guard.ts` — Hierarchical Access

- **Phase**: 1
- **Sprint**: Sprint 3, Week 2
- **Points**: 2
- **Depends on**: T011-03
- **FRs**: FR-011, FR-012
- **Files**:
  - `apps/core-api/src/modules/workspace/guards/workspace.guard.ts` (modify)
  - `apps/core-api/src/modules/workspace/types/access.types.ts` (create)
- **Tests required**:
  - Unit: ancestor admin granted `HIERARCHICAL_READER`; sibling blocked 403; direct member unchanged; root with no ancestors 403
- **Acceptance criteria**:
  - [ ] After direct membership check fails, guard fetches workspace row including `path`
  - [ ] Calls `hierarchyService.isAncestorAdmin(userId, workspace.path, tenantCtx)` as fallback
  - [ ] If ancestor admin found: sets `request.workspaceAccess = { role: 'HIERARCHICAL_READER', accessType: 'ancestor_admin', workspaceId }` and proceeds
  - [ ] If no ancestor admin: returns 403 `INSUFFICIENT_PERMISSIONS`
  - [ ] Existing direct-membership access path is **unchanged** (zero regressions)
  - [ ] `access.types.ts` exports `WorkspaceAccess` interface with `HIERARCHICAL_READER` role
  - [ ] Guard adds < 20ms overhead (one additional DB query max)
  - [ ] Tests pass with ≥80% coverage
- **Definition of Done**:
  - [ ] Code written and compiles with `tsc --noEmit`
  - [ ] All tests pass
  - [ ] PR reviewed and approved

---

### T011-05: API Routes — Tree View & Children

- **Phase**: 1
- **Sprint**: Sprint 3, Week 2
- **Points**: 2
- **Depends on**: T011-04
- **FRs**: FR-013, FR-014
- **Files**:
  - `apps/core-api/src/routes/workspace.ts` (modify)
- **Tests required**:
  - Integration: `/tree` returns membership-filtered tree; `/children` paginates correctly; empty results return `[]`
- **Acceptance criteria**:
  - [ ] `GET /api/workspaces/tree` registered **before** `GET /api/workspaces/:id` to avoid Fastify param capture
  - [ ] `/tree` returns `TreeNode[]` filtered by user membership
  - [ ] `/tree` responds in < 200ms (P95) for ≤ 100 workspaces
  - [ ] `/tree` requires auth middleware and tenant context; does NOT use `workspaceGuard`
  - [ ] `GET /api/workspaces/:id/children` returns paginated direct children
  - [ ] `/children` accepts `?limit` (1–100, default 50) and `?offset` (≥ 0)
  - [ ] Both endpoints return errors in `{ error: { code, message, details? } }` format
  - [ ] Tests pass with ≥80% coverage
- **Definition of Done**:
  - [ ] Code written and compiles with `tsc --noEmit`
  - [ ] All tests pass
  - [ ] PR reviewed and approved

---

### T011-06: `WorkspaceService` — Create/Update/Delete Hierarchy Wiring

- **Phase**: 1
- **Sprint**: Sprint 3, Week 2
- **Points**: 3
- **Depends on**: T011-02b
- **FRs**: FR-001, FR-004, FR-005, FR-006, FR-007
- **Files**:
  - `apps/core-api/src/modules/workspace/workspace.service.ts` (modify)
  - `apps/core-api/src/modules/workspace/dto/create-workspace.dto.ts` (modify)
- **Tests required**:
  - Unit: `create` with `parentId` sets depth/path; cycle detection in `reparent`; delete with children throws; slug conflict returns 409
  - Integration: POST with `parentId` returns correct depth; PATCH `/parent` updates all descendants atomically
- **Acceptance criteria**:
  - [ ] `create()` accepts `parentId?` and `templateId?` in DTO
  - [ ] `create()` calls `validateParentAccess`, `validateDepthConstraint`, `computeHierarchyFields` when `parentId` provided
  - [ ] Slug uniqueness: root checks `(tenantId, slug) WHERE parent_id IS NULL`; children check `(parentId, slug)`; conflict returns 409 `WORKSPACE_SLUG_EXISTS`
  - [ ] `update()` does NOT accept `parentId` (re-parenting is via dedicated `reparent()`)
  - [ ] `reparent(id, newParentId, tenantCtx)` validates caller is tenant ADMIN, checks no cycle, checks no slug conflict, updates `parent_id`/`depth`/`path` for workspace and all descendants in a single transaction
  - [ ] `delete()` calls `hasChildren()` and throws 400 `WORKSPACE_HAS_CHILDREN` if children exist
  - [ ] GET workspace response includes `parentId`, `depth`, `path`, `_count.children`
  - [ ] `CreateWorkspaceSchema` adds `parentId: z.string().uuid().optional()` and `templateId: z.string().uuid().optional()`
  - [ ] All existing workspace CRUD tests remain green
  - [ ] Tests pass with ≥80% coverage
- **Definition of Done**:
  - [ ] Code written and compiles with `tsc --noEmit`
  - [ ] All tests pass
  - [ ] PR reviewed and approved

---

### T011-07: Phase 1 Tests

- **Phase**: 1
- **Sprint**: Sprint 3, Week 3
- **Points**: 2
- **Depends on**: T011-01, T011-02, T011-02b, T011-03, T011-04, T011-05, T011-06
- **FRs**: FR-001 through FR-014
- **Files**:
  - `apps/core-api/src/__tests__/workspace/unit/workspace-hierarchy.test.ts` (create)
  - `apps/core-api/src/__tests__/workspace/integration/hierarchy.integration.test.ts` (create)
  - `apps/core-api/src/__tests__/workspace/e2e/hierarchy-lifecycle.e2e.test.ts` (create)
- **Tests required**:
  - Unit: 29 tests — depth calc, path computation, slug scoping, re-parenting validation, delete-with-children, hierarchical permission resolution
  - Integration: 22 tests — create hierarchy, descendant aggregation, hierarchical access control, tree endpoint, migration backfill, re-parenting via PATCH
  - E2E: 14 tests — full lifecycle, cross-workspace isolation, concurrent child creation
- **Acceptance criteria**:
  - [ ] Coverage ≥ 85% on `workspace-hierarchy.service.ts`
  - [ ] Coverage ≥ 90% on `workspace.guard.ts`
  - [ ] `pnpm test:unit`, `pnpm test:integration`, `pnpm test:e2e` all pass
  - [ ] All 19 critical edge cases from `plan.md §10.6` (cases 1–10) covered
  - [ ] Uses `buildTestApp()` and `testContext.auth.createMockToken()` — no standalone Fastify apps
- **Definition of Done**:
  - [ ] Code written and compiles with `tsc --noEmit`
  - [ ] All tests pass
  - [ ] PR reviewed and approved

---

### T011-07b: Performance Hardening — Indexes, Cache, Benchmarks

- **Phase**: 1
- **Sprint**: Sprint 3, Week 3
- **Points**: 2
- **Depends on**: T011-01, T011-02, T011-07
- **FRs**: FR-008, FR-009 (NFR-P01–P05)
- **Files**:
  - `packages/database/prisma/migrations/20260301000000_workspace_hierarchy/migration.sql` (modify)
  - `apps/core-api/src/modules/workspace/workspace-hierarchy.service.ts` (modify)
  - `apps/core-api/src/__tests__/workspace/unit/workspace-hierarchy-perf.test.ts` (create)
- **Tests required**:
  - Unit/Benchmark: 6 tests — `getDescendants` < 50ms P95 on 100-node tree; `getAggregatedCounts` uncached < 30ms; cache hit < 2ms; invalidation < 200ms; `getTree` < 50ms; single SQL call assertion
- **Acceptance criteria**:
  - [ ] `idx_workspaces_path` created with `varchar_pattern_ops`: `CREATE INDEX idx_workspaces_path ON workspaces USING btree (path varchar_pattern_ops)`
  - [ ] `idx_workspace_members_workspace_id` exists: `CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace_id ON workspace_members (workspace_id)`
  - [ ] `getAggregatedCounts` uses single-pass JOIN (not two correlated subqueries)
  - [ ] Results cached in Redis: key `tenant:{tenantId}:ws:{wsId}:agg_counts`, TTL 300s
  - [ ] `getDescendants` results cached: key `tenant:{tenantId}:ws:{wsId}:descendants`, TTL 300s
  - [ ] Cache invalidated on: member added/removed, child workspace created/deleted, re-parent operation
  - [ ] Re-parenting subtrees > 100 nodes uses chunked batch UPDATEs (100 rows/batch)
  - [ ] NFR-P01 through NFR-P05 assertions present in benchmark tests
  - [ ] Tests pass with ≥80% coverage
- **Definition of Done**:
  - [ ] Code written and compiles with `tsc --noEmit`
  - [ ] All tests pass
  - [ ] PR reviewed and approved

---

## Phase 2: Workspace Templates (Sprint 4, Weeks 4–5)

### T011-08: DB Migration — Template & WorkspacePlugin Models

- **Phase**: 2
- **Sprint**: Sprint 4, Week 4
- **Points**: 3
- **Depends on**: T011-01
- **FRs**: FR-015, FR-017, FR-018, FR-019, FR-023
- **Files**:
  - `packages/database/prisma/schema.prisma` (modify)
  - `packages/database/prisma/migrations/20260315000000_workspace_templates/migration.sql` (create)
- **Tests required**:
  - Unit: migration idempotency; existing `workspaces`, `plugins` tables unaffected
- **Acceptance criteria**:
  - [ ] `WorkspacePlugin` model added with composite PK `(workspaceId, pluginId)`, `enabled BOOLEAN DEFAULT true`, `configuration Json DEFAULT "{}"`, `onDelete: Cascade`
  - [ ] `WorkspaceTemplate` model added with `providedByPluginId FK → Plugin`, `isDefault Boolean DEFAULT false`, `metadata Json DEFAULT "{}"`
  - [ ] `WorkspaceTemplateItem` model added with `templateId FK ON DELETE CASCADE`, discriminator `type` with `CHECK (type IN ('plugin', 'page', 'setting'))`
  - [ ] `WorkspacePage` model added with `@@unique([workspaceId, slug])`
  - [ ] `Workspace` model gains `plugins WorkspacePlugin[]` and `pages WorkspacePage[]` reverse relations
  - [ ] `Plugin` model gains `workspacePlugins WorkspacePlugin[]` and `templates WorkspaceTemplate[]` reverse relations
  - [ ] `pnpm db:migrate` and `pnpm db:generate` succeed without errors
  - [ ] Tests pass with ≥80% coverage
- **Definition of Done**:
  - [ ] Code written and compiles with `tsc --noEmit`
  - [ ] All tests pass
  - [ ] PR reviewed and approved

---

### T011-09: `WorkspacePluginService`

- **Phase**: 2
- **Sprint**: Sprint 4, Week 4
- **Points**: 3
- **Depends on**: T011-08
- **FRs**: FR-023, FR-024, FR-025, FR-026
- **Files**:
  - `apps/core-api/src/modules/workspace/workspace-plugin.service.ts` (create)
  - `apps/core-api/src/modules/workspace/types/workspace-plugin.types.ts` (create)
- **Tests required**:
  - Unit: `enablePlugin` success and `PLUGIN_NOT_TENANT_ENABLED` error; `disablePlugin` preserves config; `cascadeDisableForTenantPlugin` updates correct records only
- **Acceptance criteria**:
  - [ ] `enablePlugin(workspaceId, pluginId, config, tenantCtx)` validates tenant-level enablement; throws 400 `PLUGIN_NOT_TENANT_ENABLED` if not; throws 409 `WORKSPACE_PLUGIN_EXISTS` if duplicate
  - [ ] `disablePlugin(workspaceId, pluginId, tenantCtx)` sets `enabled = false` without deleting record; throws 404 if not found
  - [ ] `updateConfig(workspaceId, pluginId, config, tenantCtx)` updates `configuration` JSON; throws 404 if not found
  - [ ] `listPlugins(workspaceId, tenantCtx)` returns all records (enabled and disabled)
  - [ ] `cascadeDisableForTenantPlugin(pluginId, tenantId)` bulk-sets `enabled = false` for all matching workspace plugins; returns affected row count
  - [ ] All queries use `Prisma.sql` with schema-scoped table names
  - [ ] Tests pass with ≥80% coverage
- **Definition of Done**:
  - [ ] Code written and compiles with `tsc --noEmit`
  - [ ] All tests pass
  - [ ] PR reviewed and approved

---

### T011-10: `WorkspaceTemplateService` — CRUD

- **Phase**: 2
- **Sprint**: Sprint 4, Week 4
- **Points**: 3
- **Depends on**: T011-08
- **FRs**: FR-021, FR-022, FR-029
- **Files**:
  - `apps/core-api/src/modules/workspace/workspace-template.service.ts` (create)
- **Tests required**:
  - Unit: `listTemplates` excludes disabled-plugin templates; `getTemplate` throws 404; `validateTemplatePlugins` catches missing plugin
- **Acceptance criteria**:
  - [ ] `listTemplates(tenantId)` returns templates filtered by enabled tenant plugins (JOIN with `tenant_plugins WHERE enabled = true`), ordered by name
  - [ ] `getTemplate(templateId)` returns template with all items ordered by `sort_order`; throws 404 `TEMPLATE_NOT_FOUND` if missing
  - [ ] `validateTemplatePlugins(templateId, tenantId)` verifies all `plugin`-type items have tenant-enabled plugins; throws 400 `TEMPLATE_PLUGIN_NOT_INSTALLED` with `{ pluginId }`
  - [ ] `registerTemplate`, `updateTemplate`, `deleteTemplate` stubbed with `throw new Error('Not implemented')` (fully implemented in T011-17)
  - [ ] Tests pass with ≥80% coverage
- **Definition of Done**:
  - [ ] Code written and compiles with `tsc --noEmit`
  - [ ] All tests pass
  - [ ] PR reviewed and approved

---

### T011-11: `WorkspaceTemplateService` — Transactional Application

- **Phase**: 2
- **Sprint**: Sprint 4, Week 4
- **Points**: 2
- **Depends on**: T011-09, T011-10
- **FRs**: FR-015, FR-016, FR-017, FR-018, FR-019, FR-020
- **Files**:
  - `apps/core-api/src/modules/workspace/workspace-template.service.ts` (modify)
  - `apps/core-api/src/modules/workspace/workspace.service.ts` (modify)
- **Tests required**:
  - Unit: all 3 item types applied; empty template is no-op; `sort_order` respected; transaction required; mid-apply failure rolls back
  - Integration: workspace creation with template activates plugins, merges settings, creates pages; rollback on failure leaves no orphan workspace
- **Acceptance criteria**:
  - [ ] `applyTemplate(workspaceId, templateId, tenantId, tx)` runs within caller-provided Prisma transaction (does NOT start its own)
  - [ ] `plugin` items create `WorkspacePlugin` records with `enabled = true`
  - [ ] `setting` items merge `settingKey/settingValue` into workspace `settings` JSON
  - [ ] `page` items create `WorkspacePage` records
  - [ ] Items applied in `sort_order` order
  - [ ] Any failure causes the transaction to roll back — no orphan workspace exists
  - [ ] `WorkspaceService.create()` calls `templateService.applyTemplate()` within the same `$transaction` when `dto.templateId` is provided
  - [ ] Template application completes < 1000ms (P95) for 10 items
  - [ ] Tests pass with ≥80% coverage
- **Definition of Done**:
  - [ ] Code written and compiles with `tsc --noEmit`
  - [ ] All tests pass
  - [ ] PR reviewed and approved

---

### T011-12: API Routes — Templates & Workspace Plugins

- **Phase**: 2
- **Sprint**: Sprint 4, Week 5
- **Points**: 2
- **Depends on**: T011-11
- **FRs**: FR-021, FR-022, FR-025
- **Files**:
  - `apps/core-api/src/routes/workspace.ts` (modify)
  - `apps/core-api/src/routes/workspace-templates.ts` (create)
  - `apps/core-api/src/modules/workspace/dto/workspace-plugin.dto.ts` (create)
  - `apps/core-api/src/modules/workspace/dto/workspace-template.dto.ts` (create)
  - `apps/core-api/src/index.ts` (modify — register new route file)
- **Tests required**:
  - Integration: enable/update/disable plugin via API; list templates filtered by enabled plugins
- **Acceptance criteria**:
  - [ ] `POST /api/workspaces/:id/plugins` — requires ADMIN; returns 201
  - [ ] `GET /api/workspaces/:id/plugins` — any workspace member; returns 200
  - [ ] `PATCH /api/workspaces/:id/plugins/:pluginId` — requires ADMIN; returns 200
  - [ ] `DELETE /api/workspaces/:id/plugins/:pluginId` — requires ADMIN; returns 204
  - [ ] `GET /api/workspace-templates` — returns filtered template list; requires auth + tenant context
  - [ ] `GET /api/workspace-templates/:id` — returns template with items; 404 if not found
  - [ ] `EnableWorkspacePluginSchema` validates `pluginId: string min(1) max(255)` and `configuration?: object`
  - [ ] New route file registered in `index.ts` under `/api/workspace-templates` prefix
  - [ ] Tests pass with ≥80% coverage
- **Definition of Done**:
  - [ ] Code written and compiles with `tsc --noEmit`
  - [ ] All tests pass
  - [ ] PR reviewed and approved

---

### T011-13: Phase 2 Tests

- **Phase**: 2
- **Sprint**: Sprint 4, Week 5
- **Points**: 2
- **Depends on**: T011-08, T011-09, T011-10, T011-11, T011-12
- **FRs**: FR-015 through FR-026
- **Files**:
  - `apps/core-api/src/__tests__/workspace/unit/workspace-templates.test.ts` (create)
  - `apps/core-api/src/__tests__/workspace/unit/workspace-plugins.test.ts` (create)
  - `apps/core-api/src/__tests__/workspace/integration/templates.integration.test.ts` (create)
  - `apps/core-api/src/__tests__/workspace/e2e/template-lifecycle.e2e.test.ts` (create)
- **Tests required**:
  - Unit: 15 template + workspace-plugin service tests
  - Integration: 10 tests — workspace creation with template, plugin CRUD, template listing
  - E2E: 5 tests — full template lifecycle, template + hierarchy combined, concurrent template application
- **Acceptance criteria**:
  - [ ] Coverage ≥ 85% on `workspace-template.service.ts` and `workspace-plugin.service.ts`
  - [ ] Edge cases 11–14 from `plan.md §10.6` covered (missing plugin, mid-apply failure, empty template, cascade disable)
  - [ ] All tests use `buildTestApp()` pattern
  - [ ] Tests pass with ≥80% coverage
- **Definition of Done**:
  - [ ] Code written and compiles with `tsc --noEmit`
  - [ ] All tests pass
  - [ ] PR reviewed and approved

---

## Phase 3: Plugin Hook Integration (Sprint 4–5, Weeks 5–7)

### T011-14: Plugin Hooks — `before_create` (Sequential)

- **Phase**: 3
- **Sprint**: Sprint 4, Week 5
- **Points**: 3
- **Depends on**: T011-06
- **FRs**: FR-030, FR-032, FR-033
- **Files**:
  - `apps/core-api/src/modules/plugin/plugin-hook.service.ts` (create)
  - `apps/core-api/src/modules/plugin/types/hook.types.ts` (create)
  - `apps/core-api/src/modules/workspace/workspace.service.ts` (modify)
  - `apps/core-api/src/lib/plugin-hooks.ts` (modify)
- **Tests required**:
  - Unit: approved, rejected-with-reason, timeout = fail-open (warn log), network error = fail-open; no subscribers = approved immediately
- **Acceptance criteria**:
  - [ ] `PluginHookService` exported with injectable constructor
  - [ ] `getHookSubscribers(hookType, tenantId)` queries `plugins` + `tenant_plugins` for enabled plugins with matching hook in manifest
  - [ ] `invokeHook(plugin, hookType, payload, timeout)` POSTs to plugin handler URL; includes `X-Tenant-ID` and `X-Trace-ID` headers; uses `AbortController` with 5s timeout
  - [ ] Hook URL validated against plugin's `apiBasePath` before invocation (SSRF prevention)
  - [ ] `runBeforeCreateHooks(workspaceData, tenantCtx)` invokes sequentially; any `{ approve: false }` returns `{ approved: false, reason, pluginId }`
  - [ ] Timeout or network error = fail-open: implicit approve + WARN log
  - [ ] `WorkspaceService.create()` calls `runBeforeCreateHooks()` before transaction; throws 400 `HOOK_REJECTED_CREATION` with `{ reason, pluginId }` if rejected
  - [ ] `SystemHooks` gains `WORKSPACE_BEFORE_CREATE: 'workspace.before_create'` (sequential, canReject: true)
  - [ ] `hook.types.ts` exports `HookResult`, `HookResponse`, `BeforeCreatePayload`
  - [ ] Tests pass with ≥80% coverage
- **Definition of Done**:
  - [ ] Code written and compiles with `tsc --noEmit`
  - [ ] All tests pass
  - [ ] PR reviewed and approved

---

### T011-15: Plugin Hooks — `created`/`deleted` (Parallel Fire-and-Forget)

- **Phase**: 3
- **Sprint**: Sprint 5, Week 5
- **Points**: 2
- **Depends on**: T011-14
- **FRs**: FR-031, FR-032
- **Files**:
  - `apps/core-api/src/modules/plugin/plugin-hook.service.ts` (modify)
  - `apps/core-api/src/modules/workspace/workspace.service.ts` (modify)
  - `apps/core-api/src/lib/plugin-hooks.ts` (modify)
- **Tests required**:
  - Unit: fire-and-forget returns void; failure logged at WARN; multiple plugins called in parallel via `Promise.allSettled`
- **Acceptance criteria**:
  - [ ] `runCreatedHooks(workspaceId, templateId, tenantCtx)` — fire-and-forget; parallel via `Promise.allSettled`; failures logged at WARN; workspace creation unaffected
  - [ ] `runDeletedHooks(workspaceId, tenantCtx)` — same pattern as `runCreatedHooks`
  - [ ] `WorkspaceService.create()` calls `runCreatedHooks()` after transaction commit (no await on outer function)
  - [ ] `SystemHooks` gains `WORKSPACE_CREATED: 'workspace.created'` (parallel, canReject: false) and `WORKSPACE_DELETED: 'workspace.deleted'` (parallel, canReject: false)
  - [ ] `HOOK_TIMEOUT_MS = 5_000` constant used throughout
  - [ ] Tests pass with ≥80% coverage
- **Definition of Done**:
  - [ ] Code written and compiles with `tsc --noEmit`
  - [ ] All tests pass
  - [ ] PR reviewed and approved

---

### T011-16: EventBus Integration — `core.workspace.*` Events

- **Phase**: 3
- **Sprint**: Sprint 5, Week 6
- **Points**: 2
- **Depends on**: T011-15
- **FRs**: FR-034
- **Files**:
  - `apps/core-api/src/modules/workspace/workspace.service.ts` (modify)
- **Tests required**:
  - Unit: event published after commit; event failure does not fail workspace operation; null eventBus silently skipped
- **Acceptance criteria**:
  - [ ] After successful workspace creation, `eventBus.publish('core.workspace.created', { workspaceId, tenantId, parentId?, templateId? })` called (non-blocking, wrapped in try-catch)
  - [ ] After successful workspace deletion, `eventBus.publish('core.workspace.deleted', { workspaceId, tenantId })` called (non-blocking)
  - [ ] EventBus failure does NOT fail workspace operations (WARN log)
  - [ ] If `eventBus` is null/undefined, events silently skipped with DEBUG log
  - [ ] Event payloads are typed (no `any`)
  - [ ] Tests pass with ≥80% coverage
- **Definition of Done**:
  - [ ] Code written and compiles with `tsc --noEmit`
  - [ ] All tests pass
  - [ ] PR reviewed and approved

---

### T011-17: Plugin Template Registration API

- **Phase**: 3
- **Sprint**: Sprint 5, Week 6
- **Points**: 2
- **Depends on**: T011-10, T011-14
- **FRs**: FR-027, FR-028, FR-029
- **Files**:
  - `apps/core-api/src/routes/plugin.ts` (modify)
  - `apps/core-api/src/modules/plugin/dto/register-template.dto.ts` (create)
  - `apps/core-api/src/modules/workspace/workspace-template.service.ts` (modify — complete stubs)
  - `apps/core-api/src/services/plugin.service.ts` (modify — extend manifest schema)
- **Tests required**:
  - Integration: register template, update template (replaces items), delete template; plugin can only manage its own templates
- **Acceptance criteria**:
  - [ ] `POST /api/plugins/:pluginId/templates` — auth: super admin or plugin service token; returns 201
  - [ ] `PUT /api/plugins/:pluginId/templates/:templateId` — replaces all items (cascade delete + insert); returns 200
  - [ ] `DELETE /api/plugins/:pluginId/templates/:templateId` — cascade-deletes items; returns 204
  - [ ] `pluginId` in route param must match `template.providedByPluginId` (plugins manage only their own templates)
  - [ ] `RegisterTemplateSchema` validates name, description, isDefault, metadata, items (max 50)
  - [ ] `TemplateItemSchema` is a Zod `discriminatedUnion('type', [...])` for `plugin`, `setting`, `page` branches
  - [ ] 400 `TEMPLATE_ITEM_LIMIT_EXCEEDED` when items > 50
  - [ ] Plugin manifest schema extended with `capabilities?: ['workspace.template-provider']` and `hooks?: { workspace: { before_create?, created?, deleted? } }`
  - [ ] `registerTemplate`, `updateTemplate`, `deleteTemplate` fully implemented (stubs removed)
  - [ ] Tests pass with ≥80% coverage
- **Definition of Done**:
  - [ ] Code written and compiles with `tsc --noEmit`
  - [ ] All tests pass
  - [ ] PR reviewed and approved

---

### T011-18: Phase 3 Tests

- **Phase**: 3
- **Sprint**: Sprint 5, Week 7
- **Points**: 3
- **Depends on**: T011-14, T011-15, T011-16, T011-17
- **FRs**: FR-027 through FR-034
- **Files**:
  - `apps/core-api/src/__tests__/workspace/unit/plugin-hooks.test.ts` (create)
  - `apps/core-api/src/__tests__/workspace/integration/hooks.integration.test.ts` (create)
  - `apps/core-api/src/__tests__/workspace/e2e/hook-lifecycle.e2e.test.ts` (create)
- **Tests required**:
  - Unit: 12 tests — hook discovery, before_create (approved/rejected/timeout/network-error), created fire-and-forget, payload validation
  - Integration: 8 tests — hook-to-plugin communication, rejection blocks creation, failure is non-blocking, timeout handling
  - E2E: 4 tests — full hook lifecycle, template + hooks combined
- **Acceptance criteria**:
  - [ ] Coverage ≥ 85% on `plugin-hook.service.ts`
  - [ ] Edge cases 15–19 from `plan.md §10.6` covered
  - [ ] Mock HTTP endpoints used (nock or msw) — no real network calls in CI
  - [ ] All 105 planned tests across Phases 1–3 exist
  - [ ] Tests pass with ≥80% coverage
- **Definition of Done**:
  - [ ] Code written and compiles with `tsc --noEmit`
  - [ ] All tests pass
  - [ ] PR reviewed and approved

---

## Phase 4: Frontend Components (Sprint 5, Weeks 8–9)

### T011-19: Design Tokens — Hierarchy & Template UI

- **Phase**: 4
- **Sprint**: Sprint 5, Week 8
- **Points**: 1
- **Depends on**: none
- **FRs**: FR-013 (UI requirement)
- **Files**:
  - `packages/ui/src/tokens/hierarchy.tokens.ts` (create)
  - `packages/ui/src/styles/hierarchy.css` (create)
- **Tests required**:
  - Unit: token values exported correctly; CSS variables resolve
- **Acceptance criteria**:
  - [ ] Tokens defined for tree indentation (`--ws-tree-indent: 24px`), connector lines, depth-level colors (depth 0–3+)
  - [ ] Template card tokens: `--template-card-bg`, `--template-card-border`, `--template-card-hover`
  - [ ] Tokens follow existing `@plexica/ui` naming convention
  - [ ] All tokens accessible via CSS custom properties
  - [ ] Tests pass with ≥80% coverage
- **Definition of Done**:
  - [ ] Code written and compiles with `tsc --noEmit`
  - [ ] All tests pass
  - [ ] PR reviewed and approved

---

### T011-20: `WorkspaceTreeNode` Component

- **Phase**: 4
- **Sprint**: Sprint 5, Week 8
- **Points**: 2
- **Depends on**: T011-19
- **FRs**: FR-013, FR-014
- **Files**:
  - `apps/web/src/components/workspace/WorkspaceTreeNode.tsx` (create)
  - `apps/web/src/components/workspace/WorkspaceTreeNode.test.tsx` (create)
- **Tests required**:
  - Unit: renders name and slug; shows depth indentation; collapse/expand toggle; HIERARCHICAL_READER badge shown
- **Acceptance criteria**:
  - [ ] Renders workspace name, slug, and role badge
  - [ ] Indentation applied based on `depth` prop (multiples of `--ws-tree-indent`)
  - [ ] Expand/collapse toggle for nodes with children
  - [ ] Displays `HIERARCHICAL_READER` badge when access is via ancestor
  - [ ] Keyboard navigable (Enter/Space to expand; arrow keys for siblings)
  - [ ] WCAG 2.1 AA: `aria-expanded`, `aria-level`, `role="treeitem"`
  - [ ] Tests pass with ≥80% coverage
- **Definition of Done**:
  - [ ] Code written and compiles with `tsc --noEmit`
  - [ ] All tests pass
  - [ ] PR reviewed and approved

---

### T011-21: `WorkspaceTreeView` Component

- **Phase**: 4
- **Sprint**: Sprint 5, Week 8
- **Points**: 3
- **Depends on**: T011-20
- **FRs**: FR-013, FR-014
- **Files**:
  - `apps/web/src/components/workspace/WorkspaceTreeView.tsx` (create)
  - `apps/web/src/components/workspace/WorkspaceTreeView.test.tsx` (create)
- **Tests required**:
  - Unit: renders full tree from `TreeNode[]`; empty state shown; loading skeleton; handles > 3 depth levels
- **Acceptance criteria**:
  - [ ] Fetches data from `GET /api/workspaces/tree` via TanStack Query
  - [ ] Renders nested `WorkspaceTreeNode` components recursively
  - [ ] Loading skeleton shown during fetch
  - [ ] Empty state shown when no workspaces
  - [ ] `role="tree"` on root element; `aria-label="Workspace hierarchy"`
  - [ ] Handles up to 10 depth levels without layout overflow
  - [ ] Tests pass with ≥80% coverage
- **Definition of Done**:
  - [ ] Code written and compiles with `tsc --noEmit`
  - [ ] All tests pass
  - [ ] PR reviewed and approved

---

### T011-22: `TemplateCard` Component

- **Phase**: 4
- **Sprint**: Sprint 5, Week 8
- **Points**: 2
- **Depends on**: T011-19
- **FRs**: FR-021, FR-022
- **Files**:
  - `apps/web/src/components/workspace/TemplateCard.tsx` (create)
  - `apps/web/src/components/workspace/TemplateCard.test.tsx` (create)
- **Tests required**:
  - Unit: renders template name, description, item count; selected state; disabled state for unavailable templates
- **Acceptance criteria**:
  - [ ] Displays template name, description, source plugin name, and item count breakdown (N plugins, N pages, N settings)
  - [ ] Selected state shown with visual highlight and checkmark
  - [ ] `isDefault` badge displayed when `template.isDefault = true`
  - [ ] Accessible: `role="radio"`, `aria-checked`, keyboard selectable
  - [ ] Tests pass with ≥80% coverage
- **Definition of Done**:
  - [ ] Code written and compiles with `tsc --noEmit`
  - [ ] All tests pass
  - [ ] PR reviewed and approved

---

### T011-23: `TemplatePickerGrid` Component

- **Phase**: 4
- **Sprint**: Sprint 5, Week 8
- **Points**: 2
- **Depends on**: T011-22
- **FRs**: FR-015, FR-021, FR-022
- **Files**:
  - `apps/web/src/components/workspace/TemplatePickerGrid.tsx` (create)
  - `apps/web/src/components/workspace/TemplatePickerGrid.test.tsx` (create)
- **Tests required**:
  - Unit: fetches and renders template list; selection callback fires; "no template" option always present; loading state
- **Acceptance criteria**:
  - [ ] Fetches templates from `GET /api/workspace-templates` via TanStack Query
  - [ ] Renders `TemplateCard` for each template in a responsive grid
  - [ ] "No template" option always first in the list and selectable
  - [ ] `onSelect(templateId | null)` callback fires on selection
  - [ ] Loading skeleton shown during fetch; empty state if no templates
  - [ ] `role="radiogroup"`, `aria-label="Select workspace template"`
  - [ ] Tests pass with ≥80% coverage
- **Definition of Done**:
  - [ ] Code written and compiles with `tsc --noEmit`
  - [ ] All tests pass
  - [ ] PR reviewed and approved

---

### T011-24: `PluginToggleCard` Component

- **Phase**: 4
- **Sprint**: Sprint 5, Week 9
- **Points**: 2
- **Depends on**: T011-19
- **FRs**: FR-023, FR-025
- **Files**:
  - `apps/web/src/components/workspace/PluginToggleCard.tsx` (create)
  - `apps/web/src/components/workspace/PluginToggleCard.test.tsx` (create)
- **Tests required**:
  - Unit: renders plugin name and toggle; optimistic update on toggle; disabled when not tenant-enabled; config JSON editor shown for ADMIN
- **Acceptance criteria**:
  - [ ] Displays plugin name, version, description, and enabled/disabled toggle
  - [ ] Toggle calls `PATCH /api/workspaces/:id/plugins/:pluginId` with `{ enabled: boolean }`
  - [ ] Optimistic UI update with rollback on API error
  - [ ] Toggle disabled when plugin is not enabled at tenant level (tooltip explains why)
  - [ ] Configuration JSON editor visible to ADMIN role users
  - [ ] `aria-label` on toggle includes plugin name
  - [ ] Tests pass with ≥80% coverage
- **Definition of Done**:
  - [ ] Code written and compiles with `tsc --noEmit`
  - [ ] All tests pass
  - [ ] PR reviewed and approved

---

### T011-25: `MoveWorkspaceDialog` Component

- **Phase**: 4
- **Sprint**: Sprint 5, Week 9
- **Points**: 3
- **Depends on**: T011-21
- **FRs**: FR-005, FR-006
- **Files**:
  - `apps/web/src/components/workspace/MoveWorkspaceDialog.tsx` (create)
  - `apps/web/src/components/workspace/MoveWorkspaceDialog.test.tsx` (create)
- **Tests required**:
  - Unit: renders tree picker; disables invalid targets (descendants and self); confirm calls API; error states (cycle, slug conflict) shown
- **Acceptance criteria**:
  - [ ] Modal dialog with workspace tree picker showing valid re-parent targets
  - [ ] Current workspace and all its descendants are disabled in the tree (cannot create cycle)
  - [ ] Confirm button calls `PATCH /api/workspaces/:id/parent` with selected `parentId`
  - [ ] Loading state shown during API call
  - [ ] Error messages displayed for `REPARENT_CYCLE_DETECTED`, `WORKSPACE_SLUG_CONFLICT`, `INSUFFICIENT_PERMISSIONS`
  - [ ] `role="dialog"`, `aria-modal="true"`, focus trapped inside modal
  - [ ] Tests pass with ≥80% coverage
- **Definition of Done**:
  - [ ] Code written and compiles with `tsc --noEmit`
  - [ ] All tests pass
  - [ ] PR reviewed and approved

---

### T011-26: Frontend Tests & Accessibility Verification

- **Phase**: 4
- **Sprint**: Sprint 5, Week 9
- **Points**: 4
- **Depends on**: T011-20, T011-21, T011-22, T011-23, T011-24, T011-25
- **FRs**: All Phase 4 FRs (NFR: WCAG 2.1 AA)
- **Files**:
  - `apps/web/src/components/workspace/*.test.tsx` (all component tests — verify completeness)
  - `apps/web/src/tests/a11y/workspace-hierarchy.a11y.test.tsx` (create)
- **Tests required**:
  - Unit: ensure all 6 components have ≥80% coverage
  - A11y: 6 axe-core scans — one per component — zero violations at WCAG 2.1 AA level
- **Acceptance criteria**:
  - [ ] All 6 Phase 4 components have dedicated test files
  - [ ] Coverage ≥ 80% on all Phase 4 component files
  - [ ] `axe-core` accessibility scan passes with zero violations on: `WorkspaceTreeNode`, `WorkspaceTreeView`, `TemplateCard`, `TemplatePickerGrid`, `PluginToggleCard`, `MoveWorkspaceDialog`
  - [ ] Keyboard navigation verified for tree view (arrow keys, Enter, Space, Escape)
  - [ ] Colour contrast meets WCAG 2.1 AA (4.5:1 for normal text, 3:1 for large text)
  - [ ] All interactive elements have visible focus indicators
  - [ ] `pnpm test` passes with no regressions across entire test suite
- **Definition of Done**:
  - [ ] Code written and compiles with `tsc --noEmit`
  - [ ] All tests pass
  - [ ] PR reviewed and approved

---

## Dependency Graph

```
Phase 1 (Sprint 3)
──────────────────
T011-01 ──► T011-02 ──► T011-02b ──► T011-06 ──►┐
                │                                  │
                └──► T011-03 ──► T011-04 ──► T011-05
                │
                T011-07 (depends on T011-01 through T011-06)
                T011-07b (depends on T011-01, T011-02, T011-07)

Phase 2 (Sprint 4)
──────────────────
T011-01 ──► T011-08 ──► T011-09 ──►┐
                │                   ├──► T011-11 ──► T011-12 ──► T011-13
                └──► T011-10 ──────►┘

Phase 3 (Sprint 4–5)
────────────────────
T011-06 ──► T011-14 ──► T011-15 ──► T011-16 ──►┐
T011-10 ──► T011-17 ──────────────────────────────┤
                                                    └──► T011-18

Phase 4 (Sprint 5)
──────────────────
T011-19 ──► T011-20 ──► T011-21 ──► T011-25 ──►┐
       │                                          │
       └──► T011-22 ──► T011-23                  ├──► T011-26
       │                                          │
       └──► T011-24 ───────────────────────────►┘
```

---

## Test Coverage Summary

| Phase     | Unit   | Integration | E2E    | A11y  | Total   |
| --------- | ------ | ----------- | ------ | ----- | ------- |
| Phase 1   | 35     | 22          | 14     | —     | 71      |
| Phase 2   | 18     | 10          | 5      | —     | 33      |
| Phase 3   | 12     | 8           | 4      | —     | 24      |
| Phase 4   | 25     | —           | —      | 6     | 31      |
| **Total** | **90** | **40**      | **23** | **6** | **159** |

---

## Cross-References

| Document                          | Path                                                            |
| --------------------------------- | --------------------------------------------------------------- |
| Spec 011                          | `.forge/specs/011-workspace-hierarchy-templates/spec.md`        |
| Plan 011                          | `.forge/specs/011-workspace-hierarchy-templates/plan.md`        |
| Design Spec                       | `.forge/specs/011-workspace-hierarchy-templates/design-spec.md` |
| ADR-013 (Materialised Path)       | `.forge/knowledge/adr/adr-013-materialised-path.md`             |
| ADR-014 (WorkspacePlugin Scoping) | `.forge/knowledge/adr/adr-014-workspace-plugin-scoping.md`      |
| Decision Log                      | `.forge/knowledge/decision-log.md`                              |
| Constitution                      | `.forge/constitution.md`                                        |
| Security Guidelines               | `docs/SECURITY.md`                                              |

---

_Document Version: 2.0_
_Created: 2026-03-02_
_Author: forge-scrum_
_Track: Epic_
_Total Story Points: ~64 (Phase 1: 22, Phase 2: 15, Phase 3: 12, Phase 4: 19)_
_Total Tests Planned: 159 (90 unit + 40 integration + 23 E2E + 6 a11y)_
