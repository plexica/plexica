# Tasks: 011 - Workspace Hierarchical Visibility & Templates

> Ordered task breakdown for Spec 011 across three phases (~49 story points, 18 tasks).
> Created by the `forge-scrum` agent via `/forge-tasks`.
> Updated 2026-02-20: added T011-07b (performance hardening, 2pts) from performance impact analysis.

| Field  | Value                |
| ------ | -------------------- |
| Status | In Progress          |
| Author | forge-scrum          |
| Date   | 2026-02-20           |
| Spec   | [spec.md](./spec.md) |
| Plan   | [plan.md](./plan.md) |

---

## Global Definition of Done

Every task in this file is considered **DONE** only when all of the following
are true:

- [ ] Implementation matches the acceptance criteria listed in the task
- [ ] All referenced functional requirements (FR-NNN) are satisfied
- [ ] New code has ≥ 85% test coverage (Constitution Art. 4.1)
- [ ] No TypeScript compilation errors (`pnpm build` passes)
- [ ] ESLint passes with no new errors (`pnpm lint` passes)
- [ ] All parameterized queries use `Prisma.sql` / `$queryRaw` — never string
      interpolation (Constitution Art. 5.3, `docs/SECURITY.md`)
- [ ] No `any` type without documented justification
- [ ] All file imports use explicit `.js` extensions for relative paths
- [ ] Existing test suite remains green (zero regressions)
- [ ] Error responses follow Constitution Art. 6.2 format:
      `{ error: { code, message, details? } }`
- [ ] Pino structured logging includes `requestId`, `userId`, `tenantId`

---

## Legend

- `[FR-NNN]` — Functional requirement being implemented (traceability)
- `[P]` — Parallelizable with other `[P]` tasks in the same phase
- Status: `[ ]` pending, `[x]` done, `[-]` skipped

---

## Phase 1 — Hierarchy Foundation (Sprint 3, ~23 pts)

> **Goal**: Deliver parent-child workspace relationships with materialised
> path, hierarchical guards, and tree endpoints. Independently shippable.
> Includes performance hardening (T011-07b) to meet P95 SLA from Constitution
> Art. 4.3.
>
> **Duration**: 2–3 weeks | **Prerequisite**: Spec 009 workspace CRUD operational

---

### T011-01 — Schema migration: workspace hierarchy fields

| Campo        | Valore   |
| ------------ | -------- |
| Phase        | 1        |
| Sprint       | 3        |
| Story Points | 3        |
| Priority     | CRITICAL |
| Dependencies | None     |

**Files to create/modify:**

- `packages/database/prisma/schema.prisma` — add `parentId`, `depth`, `path`
  fields and self-referencing relation to `Workspace` model; add
  `@@unique([parentId, slug])` replacing existing `@@unique([tenantId, slug])`;
  add `@@index([parentId])`, `@@index([path])`, `@@index([depth])`
- `packages/database/prisma/migrations/20260301000000_workspace_hierarchy/migration.sql`
  — raw SQL migration (new file, date prefix = actual date at run time)

**Acceptance Criteria:**

- [x] `parentId` (`parent_id UUID NULLABLE`) added to `Workspace` Prisma model
      with `@relation("WorkspaceHierarchy")` self-ref (parent/children)
- [x] `depth` (`INTEGER NOT NULL DEFAULT 0`) added to model
- [x] `path` (`VARCHAR NOT NULL DEFAULT ''`) added to model
- [x] `@@unique([tenantId, slug])` **dropped** and replaced with
      `@@unique([parentId, slug])` in `schema.prisma`
- [x] Migration SQL includes `ADD COLUMN parent_id`, `ADD COLUMN depth`,
      `ADD COLUMN path` — all with safe defaults
- [x] Migration SQL includes `CHECK (depth >= 0)` constraint
- [x] Migration SQL includes `FK fk_workspaces_parent ON DELETE RESTRICT`
- [x] Migration SQL **drops** old slug uniqueness constraint and adds
      `UNIQUE(parent_id, slug)` constraint
- [x] Migration SQL creates partial unique index:
      `CREATE UNIQUE INDEX idx_workspace_root_slug_unique ON workspaces (tenant_id, slug) WHERE parent_id IS NULL`
- [x] Migration SQL creates B-TREE indexes: `idx_workspaces_parent`,
      `idx_workspaces_path`, `idx_workspaces_depth`
- [ ] `pnpm db:migrate` runs successfully against a clean test database
- [ ] `pnpm db:generate` regenerates Prisma client without errors
- [x] Existing workspaces remain valid (all new columns have defaults)

**Technical notes:**

Prisma does not natively support `CHECK` constraints or partial unique indexes.
Use a raw SQL migration file — do NOT use Prisma's auto-generated migration
for Phase 4 and 5 of the SQL plan. The migration must be wrapped in a
transaction. Exact SQL is provided in `plan.md` §3.1.

The old constraint name to drop is `workspaces_tenant_slug` — verify the
actual constraint name from the running database before dropping. Use
`DROP CONSTRAINT IF EXISTS` to be safe.

---

### T011-02 — Data migration: backfill `path` for existing workspaces

| Campo        | Valore   |
| ------------ | -------- |
| Phase        | 1        |
| Sprint       | 3        |
| Story Points | 2        |
| Priority     | CRITICAL |
| Dependencies | T011-01  |

**Files to create/modify:**

- `packages/database/prisma/migrations/20260301000001_workspace_hierarchy_backfill/migration.sql`
  — new file with backfill SQL

**Acceptance Criteria:**

- [x] Migration sets `path = id::text` for all existing workspaces where
      `parent_id IS NULL AND path = ''`
- [x] Migration sets `depth = 0` for all existing root workspaces
- [ ] After migration, query
      `SELECT COUNT(*) FROM workspaces WHERE path = '' AND parent_id IS NULL`
      returns **0** rows
- [x] Migration is idempotent — safe to run twice without data corruption
- [ ] `pnpm db:migrate` runs successfully
- [x] Rollback plan documented: `UPDATE workspaces SET path = '', depth = 0` is safe

**Technical notes:**

This must run **after** T011-01. The SQL is:

```sql
UPDATE workspaces
  SET path = id::text, depth = 0
  WHERE parent_id IS NULL AND path = '';
```

Add a verification `DO $$ BEGIN ASSERT ... END $$;` block after the UPDATE
to fail loudly if backfill is incomplete. See `plan.md` §3.2 for the full
verification query.

---

### T011-03 — WorkspaceHierarchyService: core implementation

| Campo        | Valore           |
| ------------ | ---------------- |
| Phase        | 1                |
| Sprint       | 3                |
| Story Points | 5                |
| Priority     | CRITICAL         |
| Dependencies | T011-01, T011-02 |

**Files to create/modify:**

- `apps/core-api/src/modules/workspace/workspace-hierarchy.service.ts` — new
  file: full service implementation
- `apps/core-api/src/modules/workspace/types/hierarchy.types.ts` — new file:
  `TreeNode`, `AggregatedCounts`, `WorkspaceRow` (extended) interfaces

**Acceptance Criteria:**

- [x] `WorkspaceHierarchyService` class exported from the new file with
      injectable constructor `(customDb?, cache?, customLogger?)`
- [x] `validateParentAccess(parentId, userId, tenantCtx)` — fetches parent,
      throws `PARENT_WORKSPACE_NOT_FOUND` (404) if missing, throws
      `PARENT_PERMISSION_DENIED` (403) if user is not ADMIN
- [x] `computeHierarchyFields(parent, newId)` — returns
      `{ depth: parent.depth + 1, path: parent.path + '/' + newId }` for
      child; `{ depth: 0, path: newId }` for root
- [x] `validateDepthConstraint(parentDepth)` — throws
      `HIERARCHY_DEPTH_EXCEEDED` (400) when `parentDepth >= 2`
- [x] `getDescendants(rootPath, tenantCtx)` — uses
      `WHERE path LIKE ${rootPath + '/%'}` with `Prisma.sql` parameterization
- [x] `getDirectChildren(parentId, tenantCtx, limit, offset)` — paginated
      list, default limit 50, max 100
- [x] `getTree(userId, tenantCtx)` — returns `TreeNode[]` nested structure;
      only includes workspaces where user is a member (or ancestors for context)
- [x] `getAggregatedCounts(workspacePath, tenantCtx)` — returns
      `{ aggregatedMemberCount, aggregatedChildCount }` via single SQL query
- [x] `isAncestorAdmin(userId, workspacePath, tenantCtx)` — returns `true`
      if user is ADMIN in any ancestor workspace extracted from `path`
- [x] `getAncestorChain(workspacePath, tenantCtx)` — returns ordered ancestor
      rows (root first)
- [x] `hasChildren(workspaceId, tenantCtx)` — returns `true` if any workspace
      has `parent_id = workspaceId`
- [x] All queries use `Prisma.sql` / `$queryRaw` — no string interpolation
- [x] All queries scope to `tenantCtx.schemaName` via `Prisma.raw` table name
- [x] `hierarchy.types.ts` exports `TreeNode`, `AggregatedCounts` interfaces
      as defined in `plan.md` §4.1

**Technical notes:**

Follow the exact query patterns in `plan.md` §4.1. The `getTree()` method
must filter results by user membership — only return workspaces where
`userId` appears in `workspace_members` OR is a parent of a visible workspace.

Constructor must follow the same pattern as `WorkspaceService` (injectable
deps for testability). All BigInt results from raw SQL must be converted via
`Number(result.count)`.

---

### T011-04 — Extend `workspace.guard.ts` for hierarchical access

| Campo        | Valore  |
| ------------ | ------- |
| Phase        | 1       |
| Sprint       | 3       |
| Story Points | 3       |
| Priority     | HIGH    |
| Dependencies | T011-03 |

**Files to create/modify:**

- `apps/core-api/src/modules/workspace/guards/workspace.guard.ts` — modify:
  add hierarchical ancestor-admin check after direct membership check fails
- `apps/core-api/src/modules/workspace/types/access.types.ts` — new file:
  `WorkspaceAccess` interface with `HIERARCHICAL_READER` role

**Acceptance Criteria:**

- [x] After direct membership check fails, guard fetches workspace row
      (including `path` field)
- [x] If `path` has ancestors (non-root workspace), guard calls
      `hierarchyService.isAncestorAdmin(userId, workspace.path, tenantCtx)`
- [x] If ancestor admin found: `request.workspaceAccess` set to
      `{ role: 'HIERARCHICAL_READER', accessType: 'ancestor_admin', workspaceId }`
      and request proceeds
- [x] If no ancestor admin: guard returns 403 with `INSUFFICIENT_PERMISSIONS`
- [x] `access.types.ts` exports
      `WorkspaceAccess { role: WorkspaceRole | 'HIERARCHICAL_READER', accessType: 'direct' | 'ancestor_admin', workspaceId }`
- [x] Existing direct membership access behavior is **unchanged**
      (zero regressions on existing workspace guard tests)
- [x] Root workspaces (no ancestors) return 403 if user has no direct membership
- [ ] Performance: guard adds < 20ms overhead (one additional DB query max)

**Technical notes:**

The guard file is at `apps/core-api/src/modules/workspace/guards/workspace.guard.ts`.
Read the current implementation first (it checks `workspaceService.checkAccessAndGetMembership()`).
The new hierarchical check must be inserted as a fallback — if direct membership
returns a result, the existing path is unchanged.

Instantiate `WorkspaceHierarchyService` in the guard factory function (or inject
via the same pattern used for `WorkspaceService`).

---

### T011-05 — New API endpoints: tree view and children list

| Campo        | Valore           |
| ------------ | ---------------- |
| Phase        | 1                |
| Sprint       | 3                |
| Story Points | 3                |
| Priority     | HIGH             |
| Dependencies | T011-03, T011-04 |

**Files to create/modify:**

- `apps/core-api/src/routes/workspace.ts` — modify: add two new route handlers:
  `GET /api/workspaces/tree` and `GET /api/workspaces/:id/children`

**Acceptance Criteria:**

- [x] `GET /api/workspaces/tree` registered before `GET /api/workspaces/:id`
      (Fastify route order — "tree" must not be captured by `:id` param)
- [x] `/tree` endpoint returns `TreeNode[]` filtered by user membership
- [ ] `/tree` endpoint responds in < 200ms (P95) for ≤ 100 workspaces
- [x] `/tree` requires `authMiddleware` and tenant context middleware
- [x] `/tree` does NOT use `workspaceGuard` (tenant-level, not workspace-level)
- [x] `GET /api/workspaces/:id/children` returns paginated direct children
- [x] `/children` accepts `?limit` (1–100, default 50) and `?offset` (≥ 0)
- [x] `/children` uses `workspaceGuard` on parent workspace
- [x] Both endpoints return 200 with appropriate empty arrays when no data
- [x] Both endpoints return errors in Constitution Art. 6.2 format
- [x] Response schema for `/tree` includes `id`, `slug`, `name`, `depth`,
      `memberRole`, `_count`, `children[]`
- [ ] Rate limit: Reads tier (100/min per user) applied to both endpoints

**Technical notes:**

Register `/api/workspaces/tree` as a literal route BEFORE the parametric
`/api/workspaces/:id` route to avoid Fastify matching "tree" as an ID.
Check `apps/core-api/src/routes/workspace.ts` for the current route
registration order.

The `/tree` handler calls `hierarchyService.getTree(userId, tenantCtx)`.
The `/children` handler calls `hierarchyService.getDirectChildren(parentId,
tenantCtx, limit, offset)`.

---

### T011-06 — Modify `WorkspaceService.create/update/delete` for hierarchy

| Campo        | Valore  |
| ------------ | ------- |
| Phase        | 1       |
| Sprint       | 3       |
| Story Points | 3       |
| Priority     | HIGH    |
| Dependencies | T011-03 |

**Files to create/modify:**

- `apps/core-api/src/modules/workspace/workspace.service.ts` — modify `create()`,
  `update()`, `delete()` methods and constructor
- `apps/core-api/src/modules/workspace/dto/create-workspace.dto.ts` — modify:
  add `parentId?` and `templateId?` (optional UUID fields) to Zod schema
- `apps/core-api/src/modules/workspace/dto/index.ts` — no change needed unless
  new DTOs from Phase 2 are added here early

**Acceptance Criteria:**

- [x] `WorkspaceService` constructor accepts optional `hierarchyService?:
WorkspaceHierarchyService` and `templateService?: WorkspaceTemplateService`
      (templateService used in Phase 2 — wire in stub/null for now)
- [x] `create()` accepts `parentId?` in the DTO
- [x] `create()` calls `hierarchyService.validateParentAccess()` when `parentId`
      is provided
- [x] `create()` calls `hierarchyService.validateDepthConstraint()` on parent depth
- [x] `create()` calls `hierarchyService.computeHierarchyFields()` and includes
      `parent_id`, `depth`, `path` in the INSERT SQL
- [x] `create()` slug uniqueness check is updated: for root workspaces
      check `(tenantId, slug) WHERE parent_id IS NULL`; for children check
      `(parentId, slug)` — returns `WORKSPACE_SLUG_EXISTS` (409) on conflict
- [x] `update()` does NOT accept `parentId` — `parentId` changes go through the dedicated `reparent()` method
- [x] New `reparent()` method on `WorkspaceService`: - Validates caller is tenant ADMIN (`INSUFFICIENT_PERMISSIONS` 403) - Validates new parent exists in tenant (`PARENT_WORKSPACE_NOT_FOUND` 404) - Validates new parent is not a descendant of the workspace (`REPARENT_CYCLE_DETECTED` 400) - Validates slug uniqueness under new parent (`WORKSPACE_SLUG_CONFLICT` 409) - Updates `parent_id`, recomputes `depth` and `path` for workspace and all descendants - Entire operation wrapped in a single DB transaction (rollback on any failure)
- [x] `delete()` calls `hierarchyService.hasChildren()` and throws
      `WORKSPACE_HAS_CHILDREN` (400) if children exist
- [x] GET workspace response includes `parentId`, `depth`, `path`,
      `_count.children` fields
- [ ] GET workspace with `?includeDescendants=true` includes
      `aggregatedMemberCount` from `getAggregatedCounts()`
- [x] New error codes added to the workspace error map:
      `HIERARCHY_DEPTH_EXCEEDED`, `PARENT_WORKSPACE_NOT_FOUND`,
      `PARENT_PERMISSION_DENIED`, `REPARENT_CYCLE_DETECTED`,
      `WORKSPACE_SLUG_CONFLICT`, `INSUFFICIENT_PERMISSIONS`,
      `WORKSPACE_HAS_CHILDREN` (if not already present)
- [x] `CreateWorkspaceSchema` in `create-workspace.dto.ts` has
      `parentId: z.string().uuid().optional()` and
      `templateId: z.string().uuid().optional()`
- [x] All existing workspace CRUD tests remain green

**Technical notes:**

The `WorkspaceRow` TypeScript interface (lines 25–34 in `workspace.service.ts`)
must be extended with `parent_id: string | null`, `depth: number`,
`path: string` as shown in `plan.md` §2.3.

For the `templateId` field: wire it into the DTO now (Phase 1) but the actual
`applyTemplate()` call is gated on a `templateService !== null` guard —
implement it fully in T011-10 (Phase 2).

---

### T011-07 — Phase 1 tests: hierarchy unit + integration + E2E

| Campo        | Valore                                               |
| ------------ | ---------------------------------------------------- |
| Phase        | 1                                                    |
| Sprint       | 3                                                    |
| Story Points | 2                                                    |
| Priority     | HIGH                                                 |
| Dependencies | T011-01, T011-02, T011-03, T011-04, T011-05, T011-06 |

**Files to create/modify:**

- `apps/core-api/src/__tests__/workspace/unit/workspace-hierarchy.test.ts`
  — new file: 25 unit tests
- `apps/core-api/src/__tests__/workspace/integration/hierarchy.integration.test.ts`
  — new file: 18 integration tests
- `apps/core-api/src/__tests__/workspace/e2e/hierarchy-lifecycle.e2e.test.ts`
  — new file: 8 E2E tests

**Acceptance Criteria:**

- [x] **Unit tests (29)** cover all methods of `WorkspaceHierarchyService`:
  - [x] 5 tests for depth calculation (depth 0/1/2/n computation, unlimited
        depth, root creation without parent)
  - [x] 5 tests for materialised path computation (root = `id`, child =
        `parent.path + '/' + id`, grandchild = 3-level path, deep nesting
        path, UUID format)
  - [x] 4 tests for slug uniqueness scoping (same slug different parents = OK,
        same slug same parent = error, root slug conflict, child slug no conflict)
  - [x] 4 tests for re-parenting validation (cycle detection, slug conflict,
        cross-tenant, non-tenant-admin)
  - [x] 3 tests for re-parenting path/depth cascade (`reparent()` updates all
        descendants correctly, transaction rollback on failure)
  - [x] 3 tests for delete-with-children prevention (`delete()` throws, delete
        leaf succeeds, delete root with no children succeeds)
  - [x] 5 tests for hierarchical permission resolution (`isAncestorAdmin` true,
        false, grandparent, root MEMBER, no ancestors)
- [x] **Integration tests (22)** use `buildTestApp()` + `testContext.auth`:
  - [x] 4 tests: create workspace hierarchy (POST with `parentId`)
  - [x] 4 tests: descendant aggregation queries (`getAggregatedCounts`,
        `getDescendants` path filtering)
  - [x] 5 tests: hierarchical access control (ancestor admin reads child, sibling
        blocked, MEMBER gets summary, non-member 403, cross-tenant 403)
  - [x] 3 tests: tree endpoint (full tree, membership-filtered tree, empty tenant)
  - [x] 2 tests: migration backfill (existing workspace has `path = id`,
        `depth = 0`)
  - [x] 4 tests: re-parenting via PATCH /api/workspaces/:id/parent (success,
        cycle detection, slug conflict, non-admin rejected)
- [x] **E2E tests (14)** cover full lifecycle scenarios (written, require DB):
  - [x] Full hierarchy lifecycle tests
  - [x] Cross-workspace isolation tests
  - [x] Concurrent child creation tests
- [ ] Coverage ≥ 85% on `workspace-hierarchy.service.ts` per Vitest report
- [ ] Coverage ≥ 90% on `workspace.guard.ts` per Vitest report
- [ ] All 19 critical edge cases from `plan.md` §10.6 (cases 1–10) are covered
- [ ] `pnpm test:unit`, `pnpm test:integration`, `pnpm test:e2e` all pass

**Technical notes:**

Follow the test pattern from `workspace-crud.integration.test.ts` and
`workspace-members.integration.test.ts` (use `buildTestApp()`, proper tenant
provisioning via `/api/admin/tenants`, `testContext.auth.createMockToken()`).
Do NOT create standalone Fastify apps or raw SQL tables (see TD-004 antipattern
in `decision-log.md`).

---

### T011-07b — Performance hardening: hierarchy query indexes and benchmarks

| Campo        | Valore                    |
| ------------ | ------------------------- |
| Phase        | 1                         |
| Sprint       | 3                         |
| Story Points | 2                         |
| Priority     | HIGH                      |
| Dependencies | T011-01, T011-03, T011-07 |

> Derived from the performance impact analysis in `plan.md §14`. Ensures that
> descendant-scoped queries meet the Constitution Art. 4.3 P95 < 200ms SLA.

**Files to create/modify:**

- `packages/database/prisma/migrations/20260301000000_workspace_hierarchy/migration.sql`
  — verify / add `varchar_pattern_ops` on `idx_workspaces_path` and
  `idx_workspace_members_workspace_id` (amend T011-01 migration if not yet applied,
  or create a new additive migration if T011-01 is already deployed)
- `apps/core-api/src/modules/workspace/workspace-hierarchy.service.ts`
  — rewrite `getAggregatedCounts` to single-pass JOIN query (see `plan.md §14.3`)
  — add Redis cache for `agg_counts` and `descendants` results
  (keys: `tenant:{tenantId}:ws:{wsId}:agg_counts`, TTL 300s)
  (keys: `tenant:{tenantId}:ws:{wsId}:descendants`, TTL 300s)
  — add cache invalidation in `WorkspaceService` for member add/remove and
  child create/delete events
- `apps/core-api/src/__tests__/workspace/unit/workspace-hierarchy-perf.test.ts`
  — new file: performance benchmark tests

**Acceptance Criteria:**

- [x] `idx_workspaces_path` is created with `varchar_pattern_ops`:
      `sql
CREATE INDEX idx_workspaces_path ON workspaces USING btree (path varchar_pattern_ops);
`
- [x] `idx_workspace_members_workspace_id` exists:
      `sql
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace_id
  ON workspace_members (workspace_id);
`
- [x] `getAggregatedCounts` uses the single-pass JOIN query (not two correlated
      subqueries) as specified in `plan.md §14.3`
- [x] `getAggregatedCounts` result is cached in Redis with key
      `tenant:{tenantId}:ws:{wsId}:agg_counts` and TTL 300s
- [x] `getDescendants` result is cached in Redis with key
      `tenant:{tenantId}:ws:{wsId}:descendants` and TTL 300s
- [x] Cache is invalidated on: member added/removed, child workspace created/deleted,
      and re-parent operation affecting the workspace
- [ ] Re-parenting a subtree > 100 nodes uses chunked batch UPDATEs
      (100 rows per batch) with a short delay between chunks to reduce lock
      contention (see `plan.md §14.5`)
- [x] **Performance benchmark tests (6)**:
  - [x] `getDescendants` on a 100-node tree completes in < 50ms (P95) — NFR-P01
  - [x] `getAggregatedCounts` uncached completes in < 30ms on a 100-node tree — NFR-P02
  - [x] `getAggregatedCounts` cache hit completes in < 2ms — NFR-P03
  - [x] Invalidation across 50-node subtree completes in < 200ms — NFR-P04
  - [x] `getTree` on a 3-level, 20-node tree completes in < 50ms — NFR-P05
  - [x] `getAggregatedCounts` issues exactly 1 SQL call (single-pass JOIN regression)
- [x] NFR-P01 through NFR-P05 (from `plan.md §14.9`) are referenced in the
      benchmark tests as assertions
- [x] `pnpm test:unit` passes with no regressions
- [ ] Coverage on `workspace-hierarchy.service.ts` remains ≥ 85%

**Technical notes:**

The `varchar_pattern_ops` operator class is required so that PostgreSQL can use
the B-TREE index for `LIKE 'prefix/%'` queries. Without it, the planner may
choose a sequential scan. See `plan.md §14.2` for the full explanation.

For the chunked re-parent, implement as a helper method
`reparentSubtreeChunked(oldPath, newPath, tenantId, chunkSize = 100)` inside
`WorkspaceHierarchyService`. The method uses `LIMIT $chunkSize` in each UPDATE
batch and loops until 0 rows are updated.

---

## Phase 2 — Workspace Templates (Sprint 4, ~13 pts)

> **Goal**: Template models, transactional template application, and
> per-workspace plugin enablement. Builds on Phase 1.
>
> **Duration**: 1.5–2 weeks | **Prerequisite**: Phase 1 complete (T011-01 to T011-07b)

---

### T011-08 — Schema migration: WorkspacePlugin, WorkspaceTemplate, WorkspaceTemplateItem, WorkspacePage

| Campo        | Valore                                          |
| ------------ | ----------------------------------------------- |
| Phase        | 2                                               |
| Sprint       | 4                                               |
| Story Points | 3                                               |
| Priority     | CRITICAL                                        |
| Dependencies | T011-01 (Phase 1 must be complete and deployed) |

**Files to create/modify:**

- `packages/database/prisma/schema.prisma` — add 4 new Prisma models:
  `WorkspacePlugin`, `WorkspaceTemplate`, `WorkspaceTemplateItem`,
  `WorkspacePage`; add reverse relations on `Workspace` and `Plugin`
- `packages/database/prisma/migrations/20260315000000_workspace_templates/migration.sql`
  — new file with raw SQL for all 4 tables

**Acceptance Criteria:**

- [ ] `WorkspacePlugin` model added with composite PK `(workspaceId, pluginId)`,
      `enabled BOOLEAN DEFAULT true`, `configuration Json DEFAULT "{}"`,
      `onDelete: Cascade` on workspace FK
- [ ] `WorkspaceTemplate` model added with `providedByPluginId FK → Plugin`,
      `isDefault Boolean DEFAULT false`, `metadata Json DEFAULT "{}"`
- [ ] `WorkspaceTemplateItem` model added with `templateId FK → WorkspaceTemplate
ON DELETE CASCADE`, `type String` (discriminator), nullable fields
      `pluginId`, `pageConfig`, `settingKey`, `settingValue`, `sortOrder Int DEFAULT 0`
- [ ] `WorkspacePage` model added with `workspaceId FK → Workspace ON DELETE
CASCADE`, `@@unique([workspaceId, slug])`
- [ ] `Workspace` model gets `plugins WorkspacePlugin[]` and `pages WorkspacePage[]`
      reverse relations
- [ ] `Plugin` model gets `workspacePlugins WorkspacePlugin[]` and
      `templates WorkspaceTemplate[]` reverse relations
- [ ] Migration SQL creates all 4 tables with correct FKs, indexes, and
      `CHECK (type IN ('plugin', 'page', 'setting'))` constraint on
      `workspace_template_items.type`
- [ ] `pnpm db:migrate` and `pnpm db:generate` succeed without errors
- [ ] Existing `workspace_members`, `workspaces`, `plugins` tables are unaffected

**Technical notes:**

Full SQL DDL is provided in `plan.md` §3.3. The `workspace_pages` slug
uniqueness constraint is at table level (`UNIQUE(workspace_id, slug)`).
`Plugin` model currently has no `WorkspacePlugin` relation — add the reverse
relation carefully to avoid breaking existing plugin tests.

---

### T011-09 — WorkspacePluginService: per-workspace plugin enablement

| Campo        | Valore  |
| ------------ | ------- |
| Phase        | 2       |
| Sprint       | 4       |
| Story Points | 3       |
| Priority     | HIGH    |
| Dependencies | T011-08 |

**Files to create/modify:**

- `apps/core-api/src/modules/workspace/workspace-plugin.service.ts` — new file
- `apps/core-api/src/modules/workspace/types/workspace-plugin.types.ts` — new
  file: `WorkspacePluginRow` interface

**Acceptance Criteria:**

- [ ] `WorkspacePluginService` exported with injectable constructor
      `(customDb?, customLogger?)`
- [ ] `enablePlugin(workspaceId, pluginId, config, tenantCtx)` — validates
      `pluginId` is enabled at tenant level (calls `validateTenantPluginEnabled`),
      creates `WorkspacePlugin` record with `enabled = true`; throws
      `PLUGIN_NOT_TENANT_ENABLED` (400) if not tenant-enabled; throws
      `WORKSPACE_PLUGIN_EXISTS` (409) if already enabled
- [ ] `disablePlugin(workspaceId, pluginId, tenantCtx)` — sets `enabled = false`
      (does NOT delete the record — configuration preserved); throws
      `WORKSPACE_PLUGIN_NOT_FOUND` (404) if not found
- [ ] `updateConfig(workspaceId, pluginId, config, tenantCtx)` — updates
      `configuration` JSON field; throws `WORKSPACE_PLUGIN_NOT_FOUND` (404)
      if not found
- [ ] `listPlugins(workspaceId, tenantCtx)` — returns all `WorkspacePlugin`
      records for the workspace (both enabled and disabled)
- [ ] `validateTenantPluginEnabled(pluginId, tenantId)` — queries `TenantPlugin`
      table; throws `PLUGIN_NOT_TENANT_ENABLED` if record missing or
      `enabled = false`
- [ ] `cascadeDisableForTenantPlugin(pluginId, tenantId)` — bulk UPDATE sets
      `enabled = false` for all `workspace_plugins` records where plugin matches
      AND workspace is in this tenant; returns count of affected rows
- [ ] All queries use `Prisma.sql` with schema-scoped table names
- [ ] `workspace-plugin.types.ts` exports `WorkspacePluginRow` interface

**Technical notes:**

`cascadeDisableForTenantPlugin()` is called by the tenant plugin service when
a tenant disables a plugin (FR-026). The UPDATE query is in `plan.md` §4.3.
This method must be called from the existing `TenantPlugin` disable/remove flow
(hook into `apps/core-api/src/routes/plugin.ts` tenant plugin routes).

---

### T011-10 — WorkspaceTemplateService: CRUD and transactional application

| Campo        | Valore           |
| ------------ | ---------------- |
| Phase        | 2                |
| Sprint       | 4                |
| Story Points | 3                |
| Priority     | HIGH             |
| Dependencies | T011-08, T011-09 |

**Files to create/modify:**

- `apps/core-api/src/modules/workspace/workspace-template.service.ts` — new file
- `apps/core-api/src/modules/workspace/workspace.service.ts` — modify `create()`
  to call `templateService.applyTemplate()` within the transaction

**Acceptance Criteria:**

- [ ] `WorkspaceTemplateService` exported with injectable constructor
      `(customDb?, pluginService?, customLogger?)`
- [ ] `listTemplates(tenantId)` — returns templates filtered by enabled tenant
      plugins (JOIN with `tenant_plugins WHERE enabled = true`); ordered by name
- [ ] `getTemplate(templateId)` — returns template with all items ordered by
      `sort_order`; throws `TEMPLATE_NOT_FOUND` (404) if not found
- [ ] `validateTemplatePlugins(templateId, tenantId)` — for all `plugin`-type
      items, verifies plugin is enabled at tenant level; throws
      `TEMPLATE_PLUGIN_NOT_INSTALLED` (400) with `{ pluginId }` detail
- [ ] `applyTemplate(workspaceId, templateId, tenantId, tx)` — runs within
      the provided Prisma transaction:
  - [ ] Fetches template with items
  - [ ] Calls `validateTemplatePlugins` (within tx)
  - [ ] For each item in `sort_order` order:
    - [ ] `plugin` type → creates `WorkspacePlugin` record (`enabled = true`)
    - [ ] `setting` type → merges `settingKey/settingValue` into workspace
          `settings` JSON via `UPDATE workspaces SET settings = ...`
    - [ ] `page` type → creates `WorkspacePage` record
  - [ ] Any failure throws → transaction rolls back → no orphan workspace
- [ ] `WorkspaceService.create()` calls `templateService.applyTemplate()` when
      `dto.templateId` is provided (within the same `$transaction`)
- [ ] Empty template (0 items) is valid — workspace created without extra work
- [ ] `registerTemplate(pluginId, dto)`, `updateTemplate(pluginId, templateId,
dto)`, `deleteTemplate(pluginId, templateId)` methods stubbed for use
      in T011-15 (Phase 3)
- [ ] Template application < 1000ms (P95) for 10 template items

**Technical notes:**

`applyTemplate()` receives the ongoing Prisma transaction `tx` — it does NOT
start a new transaction. This is key for rollback guarantees. If `tx` is not
provided (direct call), throw an error.

The `registerTemplate` / `updateTemplate` / `deleteTemplate` methods implement
the plugin template registration API (FR-028) used in Phase 3 (T011-15) — stub
them with `throw new Error('Not implemented')` in Phase 2, fully implement in
Phase 3.

The template filter query is in `plan.md` §4.2 — use `Prisma.sql` (no raw
string interpolation in the `tenantId` filter).

---

### T011-11 — New API endpoints: workspace plugins CRUD + template listing

| Campo        | Valore           |
| ------------ | ---------------- |
| Phase        | 2                |
| Sprint       | 4                |
| Story Points | 2                |
| Priority     | HIGH             |
| Dependencies | T011-09, T011-10 |

**Files to create/modify:**

- `apps/core-api/src/routes/workspace.ts` — modify: add 4 new workspace-plugin
  route handlers
- `apps/core-api/src/routes/workspace-templates.ts` — new file: 2 template
  route handlers
- `apps/core-api/src/modules/workspace/dto/workspace-plugin.dto.ts` — new file:
  `EnableWorkspacePluginSchema`, `UpdateWorkspacePluginSchema` (Zod)
- `apps/core-api/src/modules/workspace/dto/workspace-template.dto.ts` — new
  file: template response DTOs
- `apps/core-api/src/modules/workspace/dto/index.ts` — modify: export new DTOs

**Acceptance Criteria:**

**Workspace Plugin endpoints** (registered in `workspace.ts`):

- [ ] `POST /api/workspaces/:id/plugins` — calls `pluginService.enablePlugin()`;
      requires ADMIN role; returns 201 with `WorkspacePlugin` record
- [ ] `GET /api/workspaces/:id/plugins` — calls `pluginService.listPlugins()`;
      any workspace member; returns 200 with array
- [ ] `PATCH /api/workspaces/:id/plugins/:pluginId` — calls `pluginService.
updateConfig()`; requires ADMIN role; returns 200 with updated record
- [ ] `DELETE /api/workspaces/:id/plugins/:pluginId` — calls `pluginService.
disablePlugin()`; requires ADMIN role; returns 204
- [ ] All 4 endpoints apply `workspaceGuard`
- [ ] `EnableWorkspacePluginSchema` validates `pluginId: string min(1) max(255)`
      and `configuration?: object`
- [ ] `UpdateWorkspacePluginSchema` validates `configuration?: object` and
      `enabled?: boolean`

**Template endpoints** (registered in new `workspace-templates.ts`):

- [ ] `GET /api/workspace-templates` — calls `templateService.listTemplates(tenantId)`;
      requires auth + tenant context; returns 200 with filtered template list
- [ ] `GET /api/workspace-templates/:id` — calls `templateService.getTemplate()`;
      returns 200 with template + items; returns 404 if not found
- [ ] New route file registered in `apps/core-api/src/index.ts` under
      `/api/workspace-templates` prefix

**Technical notes:**

The route file `workspace-templates.ts` follows the same pattern as
`apps/core-api/src/routes/workspace.ts`. Register it in `index.ts` alongside
other route registrations. Check the current `index.ts` for the registration
pattern.

---

### T011-12 — Phase 2 tests: templates and workspace plugins

| Campo        | Valore                             |
| ------------ | ---------------------------------- |
| Phase        | 2                                  |
| Sprint       | 4                                  |
| Story Points | 2                                  |
| Priority     | HIGH                               |
| Dependencies | T011-08, T011-09, T011-10, T011-11 |

**Files to create/modify:**

- `apps/core-api/src/__tests__/workspace/unit/workspace-templates.test.ts`
  — new file: 15 unit tests
- `apps/core-api/src/__tests__/workspace/unit/workspace-plugins.test.ts`
  — new file: workspace plugin service unit tests
- `apps/core-api/src/__tests__/workspace/integration/templates.integration.test.ts`
  — new file: 10 integration tests
- `apps/core-api/src/__tests__/workspace/e2e/template-lifecycle.e2e.test.ts`
  — new file: 5 E2E tests

**Acceptance Criteria:**

- [ ] **Unit tests (15)** for `WorkspaceTemplateService`:
  - [ ] 4 tests: template CRUD validation (valid template, missing name,
        invalid item type, duplicate items OK)
  - [ ] 4 tests: template item type validation (plugin/page/setting
        discriminated union, missing required field per type)
  - [ ] 4 tests: `applyTemplate()` logic (all 3 item types applied, empty
        template is no-op, sort_order respected, tx required)
  - [ ] 3 tests: rollback on failure (mid-apply failure = no workspace, partial
        plugin items rolled back, page creation failure rolls back)
- [ ] **Unit tests** for `WorkspacePluginService`:
  - [ ] `enablePlugin` success and tenant-not-enabled error
  - [ ] `disablePlugin` preserves configuration
  - [ ] `cascadeDisableForTenantPlugin` updates correct records only
- [ ] **Integration tests (10)**:
  - [ ] 4 tests: workspace creation with template (plugin items activated,
        setting items merged, page items created, transactional rollback)
  - [ ] 3 tests: `WorkspacePlugin` CRUD via API (enable, update config, disable)
  - [ ] 3 tests: template listing (filtered by enabled plugins, disabled plugin
        excludes template, empty list)
- [ ] **E2E tests (5)**:
  - [ ] 2 tests: full template lifecycle (register template, create workspace
        from template, verify all items applied)
  - [ ] 2 tests: template + hierarchy combined (create child workspace from
        template, verify depth/path + template items)
  - [ ] 1 test: concurrent template application (two workspaces created
        simultaneously from same template — both succeed)
- [ ] Edge cases 11–14 from `plan.md` §10.6 covered (missing plugin,
      mid-apply failure, empty template, cascade disable)
- [ ] Coverage ≥ 85% on `workspace-template.service.ts` and
      `workspace-plugin.service.ts`

---

## Phase 3 — Plugin Integration (Sprint 4–5, ~13 pts)

> **Goal**: Implement `runLifecycleHook()`, extend plugin manifest with
> `capabilities` and `hooks`, complete template registration API, and
> publish EventBus workspace events.
>
> **Duration**: 1.5–2 weeks | **Prerequisite**: Phase 2 complete (T011-08 to T011-12)

---

### T011-13 — Plugin manifest extension: capabilities and hooks

| Campo        | Valore                                                  |
| ------------ | ------------------------------------------------------- |
| Phase        | 3                                                       |
| Sprint       | 4                                                       |
| Story Points | 2                                                       |
| Priority     | CRITICAL                                                |
| Dependencies | None (can start independently; T011-14 depends on this) |

**Files to create/modify:**

- `apps/core-api/src/lib/plugin-hooks.ts` — modify: add workspace lifecycle
  hooks to `SystemHooks` constant
- `apps/core-api/src/services/plugin.service.ts` — modify: extend plugin
  manifest Zod schema with `capabilities?` array and `hooks?` object

**Acceptance Criteria:**

- [x] `SystemHooks` in `plugin-hooks.ts` gains three new entries:
  - [x] `WORKSPACE_BEFORE_CREATE: 'workspace.before_create'`
        (sequential, canReject: true)
  - [x] `WORKSPACE_CREATED: 'workspace.created'`
        (parallel, canReject: false)
  - [x] `WORKSPACE_DELETED: 'workspace.deleted'`
        (parallel, canReject: false)
- [x] Plugin manifest Zod schema in `plugin.service.ts` extended with:
  - [x] `capabilities: z.array(z.enum(['workspace.template-provider']))
.optional().default([])`
  - [x] `hooks: z.object({ workspace: z.object({ before_create: z.string().url().optional(), created: z.string().url().optional(), deleted: z.string().url().optional() }).optional() }).optional()`
- [x] Manifest validation rejects unknown capabilities with error
      `INVALID_CAPABILITY` (400) and message
      `"Unknown capability: {value}"`
- [x] Hook URLs are validated to be well-formed URLs
- [x] Existing plugin manifest validation tests pass (no regressions)
- [ ] `Plugin.manifest` JSON stored in database includes `capabilities`
      and `hooks` fields when provided
- [ ] Plugs with no `capabilities` / `hooks` fields remain valid
      (backward compatible — both optional with defaults)

**Technical notes:**

`VALID_CAPABILITIES` must be a `const` array/tuple for proper Zod enum
inference. The manifest schema is defined in `plugin.service.ts` — search for
the existing Zod schema or `pluginManifestSchema` / `PluginManifest` type.
The hook URL validation should also verify the URL is within the plugin's
declared `apiBasePath` (security: prevent plugins from registering hooks
pointing outside their own service boundary).

---

### T011-14 — PluginHookService: implement `runLifecycleHook()`

| Campo        | Valore  |
| ------------ | ------- |
| Phase        | 3       |
| Sprint       | 4       |
| Story Points | 3       |
| Priority     | HIGH    |
| Dependencies | T011-13 |

**Files to create/modify:**

- `apps/core-api/src/modules/plugin/plugin-hook.service.ts` — new file:
  full `PluginHookService` implementation
- `apps/core-api/src/modules/plugin/types/hook.types.ts` — new file:
  `HookResult`, `HookResponse`, `BeforeCreatePayload` interfaces
- `apps/core-api/src/modules/workspace/workspace.service.ts` — modify `create()`
  to call `hookService.runBeforeCreateHooks()` before transaction and
  `hookService.runCreatedHooks()` after commit

**Acceptance Criteria:**

- [x] `PluginHookService` exported with injectable constructor
      `(customDb?, customLogger?)`
- [x] `getHookSubscribers(hookType, tenantId)` — queries `plugins` + `tenant_plugins`
      to find all enabled plugins with the given hook type in their manifest
- [x] `invokeHook(plugin, hookType, payload, timeout)` — HTTP POST to
      plugin's handler URL; includes headers `X-Tenant-ID`, `X-Trace-ID`;
      uses `AbortController` with `setTimeout(timeout)` for 5s timeout;
      throws on non-2xx response
- [x] Hook URL validated to be within plugin's `apiBasePath` before invocation
      (security)
- [x] `runBeforeCreateHooks(workspaceData, tenantCtx)` — sequential invocation;
      if any plugin returns `{ approve: false }`, returns
      `{ approved: false, reason, pluginId }`; timeout/network error = fail-open
      (implicit approve + warn log); returns `{ approved: true }` if all pass
- [x] `runCreatedHooks(workspaceId, templateId, tenantCtx)` — fire-and-forget
      (no await on outer function); parallel invocation with `Promise.allSettled`;
      failures logged at WARN level; workspace creation unaffected
- [x] `runDeletedHooks(workspaceId, tenantCtx)` — same pattern as `runCreatedHooks`
- [x] `HOOK_TIMEOUT_MS = 5_000` constant used throughout
- [x] `WorkspaceService.create()` orchestration:
  - [x] Step 1: call `hookService.runBeforeCreateHooks()` (before transaction)
  - [x] Step 2: if `!result.approved`, throw `HOOK_REJECTED_CREATION` (400)
        with `{ reason, pluginId }` detail
  - [x] Step 3: proceed with transaction (create workspace + apply template)
  - [x] Step 4: after transaction commit, call `hookService.runCreatedHooks()`
        (fire-and-forget — do NOT await)
- [x] `hook.types.ts` exports `HookResult`, `HookResponse`, `BeforeCreatePayload`
      as defined in `plan.md` §4.5
- [x] No plugin hooks registered = before_create returns `{ approved: true }` immediately

**Technical notes:**

Use Node.js native `fetch` (Node ≥ 20 has native fetch). No additional HTTP
client dependency required. The `AbortController` + `setTimeout` pattern is
in `plan.md` §4.5.

The `modules/plugin/` directory does not currently exist — create it:
`apps/core-api/src/modules/plugin/`. This follows the existing modules pattern
(alongside `apps/core-api/src/modules/workspace/`).

---

### T011-15 — Plugin template registration endpoints

| Campo        | Valore           |
| ------------ | ---------------- |
| Phase        | 3                |
| Sprint       | 5                |
| Story Points | 2                |
| Priority     | MEDIUM           |
| Dependencies | T011-10, T011-13 |

**Files to create/modify:**

- `apps/core-api/src/routes/plugin.ts` — modify: add 3 new route handlers for
  plugin template registration
- `apps/core-api/src/modules/plugin/dto/register-template.dto.ts` — new file:
  `TemplateItemSchema`, `RegisterTemplateSchema` (Zod)
- `apps/core-api/src/modules/workspace/workspace-template.service.ts` — complete
  `registerTemplate`, `updateTemplate`, `deleteTemplate` implementations
  (stubs from T011-10)

**Acceptance Criteria:**

- [x] `POST /api/plugins/:pluginId/templates` — calls
      `templateService.registerTemplate(pluginId, dto)`;
      auth: super admin OR plugin service token; returns 201 with template
- [x] `PUT /api/plugins/:pluginId/templates/:templateId` — calls
      `templateService.updateTemplate()`; replaces all items (cascade delete
      old items + insert new); returns 200
- [x] `DELETE /api/plugins/:pluginId/templates/:templateId` — calls
      `templateService.deleteTemplate()`; cascade-deletes all items;
      returns 204
- [x] `pluginId` in route param must match `template.providedByPluginId`
      (authorization: plugins can only manage their own templates)
- [x] `RegisterTemplateSchema` Zod schema validates:
  - [x] `name: z.string().min(1).max(200)`
  - [x] `description: z.string().max(1000).optional()`
  - [x] `isDefault: z.boolean().optional().default(false)`
  - [x] `metadata: z.record(z.unknown()).optional().default({})`
  - [x] `items: z.array(TemplateItemSchema).min(0).max(50)`
  - [x] `TemplateItemSchema` is a Zod `discriminatedUnion('type', [...])` with
        branches for `plugin`, `setting`, `page` as defined in `plan.md` §7.4
- [x] Max 50 template items enforced (prevents large transaction bloat)
- [x] `registerTemplate()` fully implemented (removes the `throw new Error('Not implemented')` stub from T011-10)
- [x] New error code `TEMPLATE_ITEM_LIMIT_EXCEEDED` (400) when items > 50

**Technical notes:**

Plugin service token auth: check if the existing `plugin.ts` routes use a
service-token mechanism or super admin only. Reuse the existing pattern.
The `TemplateItemSchema` discriminated union is the most complex part — follow
the exact schema in `plan.md` §7.4 verbatim.

---

### T011-16 — EventBus workspace events

| Campo        | Valore  |
| ------------ | ------- |
| Phase        | 3       |
| Sprint       | 5       |
| Story Points | 2       |
| Priority     | MEDIUM  |
| Dependencies | T011-14 |

**Files to create/modify:**

- `apps/core-api/src/modules/workspace/workspace.service.ts` — modify: publish
  `core.workspace.created` after transaction commit, `core.workspace.deleted`
  after workspace deletion

**Acceptance Criteria:**

- [x] After successful workspace creation (transaction committed),
      `eventBus.publish('core.workspace.created', { workspaceId, tenantId,
parentId?, templateId? })` is called (non-blocking, wrapped in try-catch)
- [x] After successful workspace deletion, `eventBus.publish(
'core.workspace.deleted', { workspaceId, tenantId })` is called
      (non-blocking)
- [x] EventBus failure does NOT fail workspace creation or deletion (try-catch,
      error logged at WARN)
- [x] If `eventBus` is not available (null/undefined in constructor), events
      are silently skipped with a DEBUG log
- [x] Event payload is typed (no `any`) with inline interface or exported type
- [x] Existing `WorkspaceService` EventBus usage pattern is preserved
      (check current `workspace.service.ts` for existing event patterns)

**Technical notes:**

Check `apps/core-api/src/modules/workspace/workspace.service.ts` for the
existing `eventBus` field — it is already injected in the constructor
(`eventBus?: EventBusService`). Follow the same publish pattern already in
use for other workspace events. The EventBus package is `packages/event-bus/`.

---

### T011-17 — Phase 3 tests: hooks, manifest, and plugin template API

| Campo        | Valore                             |
| ------------ | ---------------------------------- |
| Phase        | 3                                  |
| Sprint       | 5                                  |
| Story Points | 4                                  |
| Priority     | HIGH                               |
| Dependencies | T011-13, T011-14, T011-15, T011-16 |

**Files to create/modify:**

- `apps/core-api/src/__tests__/workspace/unit/plugin-hooks.test.ts`
  — new file: 12 unit tests
- `apps/core-api/src/__tests__/workspace/integration/hooks.integration.test.ts`
  — new file: 8 integration tests
- `apps/core-api/src/__tests__/workspace/e2e/hook-lifecycle.e2e.test.ts`
  — new file: 4 E2E tests

**Acceptance Criteria:**

- [ ] **Unit tests (12)** for `PluginHookService`:
  - [ ] 3 tests: hook discovery from manifest (`getHookSubscribers` returns
        plugins with matching hook, ignores disabled tenant plugins, returns
        empty for unknown hook)
  - [ ] 4 tests: `before_create` hook invocation (approved, rejected with reason,
        timeout = fail-open with warn log, network error = fail-open)
  - [ ] 3 tests: `created` hook invocation (fire-and-forget returns void,
        failure logged at WARN, multiple plugins all called in parallel)
  - [ ] 2 tests: payload validation (`BeforeCreatePayload` shape, hook URL
        outside `apiBasePath` throws before invoking)
- [ ] **Integration tests (8)**:
  - [ ] 3 tests: hook-to-plugin communication (mock plugin server receives
        correct payload, hook headers present, response parsed)
  - [ ] 2 tests: hook rejection blocks workspace creation (before_create returns
        `approve: false` → 400 `HOOK_REJECTED_CREATION`)
  - [ ] 2 tests: hook failure is non-blocking (before_create timeout → workspace
        created, created hook failure → workspace still returned)
  - [ ] 1 test: hook timeout handling (mock server delays > 5s → timeout logged)
- [ ] **E2E tests (4)**:
  - [ ] 2 tests: full hook lifecycle (register plugin with hooks, create workspace,
        verify plugin endpoint called, verify workspace exists)
  - [ ] 2 tests: template + hooks combined (create workspace from template +
        plugin subscribes to `workspace.created` → both template applied AND
        hook fired)
- [ ] **Manifest validation tests** (extend existing plugin tests):
  - [ ] Unknown capability rejected with `INVALID_CAPABILITY`
  - [ ] Valid `workspace.template-provider` accepted
  - [ ] Hook URL outside `apiBasePath` rejected at manifest registration
- [ ] Edge cases 15–19 from `plan.md` §10.6 covered (before_create rejects,
      timeout, created non-blocking, concurrent, 100+ workspace tree)
- [ ] Coverage ≥ 85% on `plugin-hook.service.ts`
- [ ] All 105 planned tests exist (51 Phase 1 + 30 Phase 2 + 24 Phase 3)

**Technical notes:**

For integration and E2E hook tests, use `nock` or `msw` (check existing test
setup in `apps/core-api/src/__tests__/setup/` for mock HTTP patterns) to mock
plugin HTTP endpoints. Do not make real network calls in CI.

---

## Sprint Assignment Summary

| Task                 | Title                                               | Phase | Sprint | Points | Priority | Dependencies       |
| -------------------- | --------------------------------------------------- | ----- | ------ | ------ | -------- | ------------------ |
| T011-01              | Schema migration: workspace hierarchy fields        | 1     | 3      | 3      | CRITICAL | —                  |
| T011-02              | Data migration: backfill path for existing data     | 1     | 3      | 2      | CRITICAL | T011-01            |
| T011-03              | WorkspaceHierarchyService: core implementation      | 1     | 3      | 5      | CRITICAL | T011-01, T011-02   |
| T011-04              | Extend `workspace.guard.ts` for hierarchical access | 1     | 3      | 3      | HIGH     | T011-03            |
| T011-05              | New endpoints: tree view and children list          | 1     | 3      | 3      | HIGH     | T011-03, T011-04   |
| T011-06              | Modify WorkspaceService create/update/delete        | 1     | 3      | 3      | HIGH     | T011-03            |
| T011-07              | Phase 1 tests: hierarchy (51 tests)                 | 1     | 3      | 2      | HIGH     | T011-01→T011-06    |
| **Phase 1 subtotal** |                                                     |       |        | **21** |          |                    |
| T011-08              | Schema migration: template and plugin models        | 2     | 4      | 3      | CRITICAL | Phase 1 complete   |
| T011-09              | WorkspacePluginService                              | 2     | 4      | 3      | HIGH     | T011-08            |
| T011-10              | WorkspaceTemplateService: CRUD + apply              | 2     | 4      | 3      | HIGH     | T011-08, T011-09   |
| T011-11              | New endpoints: workspace plugins + templates        | 2     | 4      | 2      | HIGH     | T011-09, T011-10   |
| T011-12              | Phase 2 tests: templates and plugins (30 tests)     | 2     | 4      | 2      | HIGH     | T011-08→T011-11    |
| **Phase 2 subtotal** |                                                     |       |        | **13** |          |                    |
| T011-13              | Plugin manifest: capabilities and hooks             | 3     | 4      | 2      | CRITICAL | — (parallelizable) |
| T011-14              | PluginHookService: runLifecycleHook()               | 3     | 4      | 3      | HIGH     | T011-13            |
| T011-15              | Plugin template registration endpoints              | 3     | 5      | 2      | MEDIUM   | T011-10, T011-13   |
| T011-16              | EventBus workspace events                           | 3     | 5      | 2      | MEDIUM   | T011-14            |
| T011-17              | Phase 3 tests: hooks and manifest (24 tests)        | 3     | 5      | 4      | HIGH     | T011-13→T011-16    |
| **Phase 3 subtotal** |                                                     |       |        | **13** |          |                    |
| **TOTAL**            |                                                     |       |        | **47** |          |                    |

### Sprint 3 — Phase 1: Hierarchy (21 pts)

```
T011-01 (3 pts) ──► T011-02 (2 pts) ──► T011-03 (5 pts) ──┬──► T011-04 (3 pts) ──► T011-05 (3 pts) ──► T011-07 (2 pts)
                                                            └──► T011-06 (3 pts) ──────────────────────────────► (same)
```

### Sprint 4 — Phase 2 + Phase 3 start (13 + 5 pts)

```
T011-08 (3 pts) ──► T011-09 (3 pts) ──► T011-10 (3 pts) ──► T011-11 (2 pts) ──► T011-12 (2 pts)
T011-13 (2 pts) ──► T011-14 (3 pts)   [parallel with Phase 2]
```

### Sprint 5 — Phase 3 completion (8 pts)

```
T011-15 (2 pts) ──► T011-17 (4 pts)
T011-16 (2 pts) ──► T011-17
```

---

## Summary

| Metric               | Value                                           |
| -------------------- | ----------------------------------------------- |
| Total tasks          | 17                                              |
| Total phases         | 3                                               |
| Total story points   | 47                                              |
| Sprints              | 3 (Sprint 3, 4, 5)                              |
| New files            | 25                                              |
| Modified files       | 9                                               |
| Planned tests        | 105 (52 unit + 36 integration + 17 E2E)         |
| Requirements covered | FR-001 to FR-033 (all)                          |
| CRITICAL tasks       | 5 (T011-01, T011-02, T011-03, T011-08, T011-13) |
| HIGH tasks           | 10                                              |
| MEDIUM tasks         | 2                                               |

---

## Cross-References

| Document                    | Path                                                           |
| --------------------------- | -------------------------------------------------------------- |
| Spec 011                    | `.forge/specs/011-workspace-hierarchy-templates/spec.md`       |
| Plan 011                    | `.forge/specs/011-workspace-hierarchy-templates/plan.md`       |
| ADR-013 (Materialised Path) | `.forge/knowledge/adr/adr-013-materialised-path.md`            |
| ADR-014 (WorkspacePlugin)   | `.forge/knowledge/adr/adr-014-workspace-plugin-scoping.md`     |
| Decision Log                | `.forge/knowledge/decision-log.md`                             |
| Constitution                | `.forge/constitution.md`                                       |
| Workspace test plan         | `apps/core-api/src/__tests__/workspace/WORKSPACE_TEST_PLAN.md` |
| Security guidelines         | `docs/SECURITY.md`                                             |

---

**End of Tasks 011 - Workspace Hierarchical Visibility & Templates**

_Document Version: 1.0_
_Created: 2026-02-20_
_Last Updated: 2026-02-20_
_Author: forge-scrum_
_Track: Epic_
_Total Story Points: 47 (Phase 1: 21, Phase 2: 13, Phase 3: 13)_
_Total Tests Planned: 105 (52 unit + 36 integration + 17 E2E)_
