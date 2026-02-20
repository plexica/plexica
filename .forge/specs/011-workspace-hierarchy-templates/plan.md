# Plan: 011 - Workspace Hierarchical Visibility & Templates

> Technical implementation plan for workspace hierarchy (parent-child
> relationships with materialised path), workspace templates, and template
> provider plugin integration with lifecycle hooks. This is a **GREENFIELD**
> plan — none of the 3 pillars exist today. The plan covers 17 tasks across
> 3 phases (~47 story points, 90–125 hours).
>
> Created by the `forge-architect` agent via `/forge-plan`.

| Field  | Value                                                               |
| ------ | ------------------------------------------------------------------- |
| Status | Draft                                                               |
| Author | forge-architect                                                     |
| Date   | 2026-02-20                                                          |
| Track  | Epic                                                                |
| Spec   | [Spec 011](spec.md) — Workspace Hierarchical Visibility & Templates |
| ADRs   | ADR-013 (Materialised Path), ADR-014 (WorkspacePlugin Scoping)      |

---

## 1. Overview

This plan implements three interconnected pillars of workspace evolution:

1. **Pillar 1: Hierarchical Visibility** — parent-child workspace relationships
   with materialised path, top-down aggregation, and hierarchical guard extension
2. **Pillar 2: Workspace Templates** — template models, transactional template
   application, and per-workspace plugin enablement (WorkspacePlugin)
3. **Pillar 3: Template Provider Plugin** — plugin manifest extension for
   `workspace.template-provider` capability, lifecycle hooks
   (`workspace.before_create`, `workspace.created`), and hook invocation service

### Task Summary

| Task | Description                                 | Priority | Effort    | Phase | Spec Refs                              |
| ---- | ------------------------------------------- | -------- | --------- | ----- | -------------------------------------- |
| T1   | Schema migration (hierarchy fields)         | CRITICAL | 4-6 hrs   | 1     | FR-001, FR-002, FR-003, FR-005         |
| T2   | Data migration (backfill existing)          | CRITICAL | 2-3 hrs   | 1     | FR-003                                 |
| T3   | WorkspaceHierarchyService                   | CRITICAL | 10-14 hrs | 1     | FR-004, FR-006, FR-007, FR-008, FR-009 |
| T4   | Hierarchy guard extension                   | HIGH     | 6-8 hrs   | 1     | FR-011, FR-012, FR-014                 |
| T5   | Tree & children endpoints                   | HIGH     | 6-8 hrs   | 1     | FR-013, FR-014                         |
| T6   | Modify workspace create/update/delete flow  | HIGH     | 6-8 hrs   | 1     | FR-001, FR-004, FR-006, FR-007, FR-010 |
| T7   | Pillar 1 tests (hierarchy)                  | HIGH     | 8-10 hrs  | 1     | NFR-011                                |
| T8   | Schema migration (template + plugin models) | CRITICAL | 4-6 hrs   | 2     | FR-015, FR-023                         |
| T9   | WorkspacePluginService                      | HIGH     | 6-8 hrs   | 2     | FR-023, FR-024, FR-025, FR-026         |
| T10  | WorkspaceTemplateService                    | HIGH     | 8-10 hrs  | 2     | FR-015, FR-016, FR-017, FR-018, FR-019 |
| T11  | Template & plugin endpoints                 | HIGH     | 6-8 hrs   | 2     | FR-020, FR-021, FR-022, FR-025         |
| T12  | Pillar 2 tests (templates)                  | HIGH     | 6-8 hrs   | 2     | NFR-012                                |
| T13  | Plugin manifest extension                   | CRITICAL | 4-6 hrs   | 3     | FR-026 (P3), FR-027                    |
| T14  | PluginHookService implementation            | HIGH     | 8-10 hrs  | 3     | FR-029, FR-030, FR-031, FR-032         |
| T15  | Plugin template registration endpoints      | MEDIUM   | 4-6 hrs   | 3     | FR-028                                 |
| T16  | EventBus workspace events                   | MEDIUM   | 3-4 hrs   | 3     | FR-033                                 |
| T17  | Pillar 3 tests (hooks)                      | HIGH     | 6-8 hrs   | 3     | NFR-011, NFR-012                       |

**Approach**: Phased delivery across 3 phases. Phase 1 (hierarchy) is
self-contained and delivers the highest business value. Phase 2 (templates)
builds on the hierarchy foundation. Phase 3 (hooks) completes the plugin
integration story. Each phase is independently shippable.

**Key architectural decisions**:

- Hierarchy uses **materialised path** pattern (ADR-013) — chosen over
  adjacency list and nested sets for O(log n) descendant queries
- **WorkspacePlugin** is a separate join table scoped to workspace (ADR-014) —
  tenant-level enablement is a prerequisite, cascade disable on tenant plugin
  removal, no cascade re-enable
- Template application is fully **transactional** — single DB transaction with
  workspace creation; failure = complete rollback
- Hook timeout is **fail-open** (5s timeout → workspace creation proceeds,
  failure logged as warning)
- All new queries use `prisma.$queryRaw` with `Prisma.sql` parameterization
  following the existing workspace service pattern

---

## 2. Data Model

### 2.1 Modified Tables

#### workspaces (MODIFIED — 3 new columns)

| Column        | Type         | Constraints                                             | Change       | Notes                                                      |
| ------------- | ------------ | ------------------------------------------------------- | ------------ | ---------------------------------------------------------- |
| id            | UUID         | PK                                                      | Existing     | Auto-generated                                             |
| tenant_id     | UUID         | FK (logical)                                            | Existing     | Schema-per-tenant isolation                                |
| **parent_id** | **UUID**     | **FK → workspaces(id) ON DELETE RESTRICT, NULLABLE**    | **NEW**      | Self-referencing; mutable via PATCH /parent (tenant ADMIN) |
| **depth**     | **INTEGER**  | **NOT NULL, DEFAULT 0, CHECK (depth >= 0)**             | **NEW**      | 0=root, n=depth level n                                    |
| **path**      | **VARCHAR**  | **NOT NULL, DEFAULT ''**                                | **NEW**      | Materialised path, computed at creation                    |
| slug          | VARCHAR      | ~~UNIQUE(tenant_id, slug)~~ → see new constraints below | **MODIFIED** | Slug uniqueness scoping changed                            |
| name          | VARCHAR      | NOT NULL                                                | Existing     | 2–100 chars                                                |
| description   | TEXT         | NULLABLE                                                | Existing     | Max 500 chars (Zod-enforced)                               |
| settings      | JSONB        | DEFAULT `{}`                                            | Existing     | Typed via Zod schema                                       |
| created_at    | TIMESTAMP(3) | DEFAULT NOW()                                           | Existing     | Immutable                                                  |
| updated_at    | TIMESTAMP(3) | DEFAULT NOW()                                           | Existing     | Prisma @updatedAt                                          |

**Slug Uniqueness Strategy** (two complementary constraints):

1. **Child workspaces**: `UNIQUE(parent_id, slug)` — slugs unique among siblings
   sharing the same parent. Two children of different parents may share a slug.
2. **Root workspaces**: PostgreSQL partial unique index:
   ```sql
   CREATE UNIQUE INDEX idx_workspace_root_slug_unique
     ON workspaces (tenant_id, slug)
     WHERE parent_id IS NULL;
   ```
   Required because PostgreSQL treats `NULL ≠ NULL`, so the composite unique
   constraint alone would allow duplicate root slugs within the same tenant.

**New Indexes**:

| Index Name                     | Columns         | Type   | Purpose                                        |
| ------------------------------ | --------------- | ------ | ---------------------------------------------- |
| idx_workspaces_parent          | parent_id       | B-TREE | Direct children lookup                         |
| idx_workspaces_path            | path            | B-TREE | Materialised path descendant queries           |
| idx_workspaces_depth           | depth           | B-TREE | Depth-level filtering                          |
| idx_workspace_root_slug_unique | tenant_id, slug | UNIQUE | Root slug uniqueness (WHERE parent_id IS NULL) |

**Updated Prisma Schema**:

```prisma
model Workspace {
  id          String   @id @default(uuid())
  tenantId    String   @map("tenant_id")
  parentId    String?  @map("parent_id")
  depth       Int      @default(0)
  path        String   @default("")
  slug        String
  name        String
  description String?
  settings    Json     @default("{}")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  parent    Workspace?  @relation("WorkspaceHierarchy", fields: [parentId], references: [id])
  children  Workspace[] @relation("WorkspaceHierarchy")

  members   WorkspaceMember[]
  teams     Team[]
  resources WorkspaceResource[]
  plugins   WorkspacePlugin[]
  pages     WorkspacePage[]

  @@unique([parentId, slug])
  @@index([tenantId])
  @@index([parentId])
  @@index([path])
  @@index([depth])
  @@map("workspaces")
  @@schema("core")
}
```

> **Note**: The old `@@unique([tenantId, slug])` on the `workspaces` table
> must be **dropped** and replaced with `@@unique([parentId, slug])` plus the
> partial index for roots. This is a **breaking uniqueness change** — the
> migration must handle this carefully with a transactional DDL block.

---

### 2.2 New Tables

#### workspace_plugins (NEW — Task 8)

| Column        | SQL Type     | Nullable | Default | Constraints                     | Notes                                   |
| ------------- | ------------ | -------- | ------- | ------------------------------- | --------------------------------------- |
| workspace_id  | UUID         | No       | -       | PK (composite), FK → workspaces | ON DELETE CASCADE                       |
| plugin_id     | VARCHAR      | No       | -       | PK (composite), FK → plugins    | Must be enabled at tenant level first   |
| enabled       | BOOLEAN      | No       | true    | -                               | Can be disabled without removing config |
| configuration | JSONB        | No       | `{}`    | -                               | Workspace-specific plugin settings      |
| created_at    | TIMESTAMP(3) | No       | NOW()   | -                               | Immutable                               |
| updated_at    | TIMESTAMP(3) | No       | NOW()   | -                               | Auto-updated via Prisma @updatedAt      |

```prisma
model WorkspacePlugin {
  workspaceId   String   @map("workspace_id")
  pluginId      String   @map("plugin_id")
  enabled       Boolean  @default(true)
  configuration Json     @default("{}")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  plugin    Plugin    @relation(fields: [pluginId], references: [id])

  @@id([workspaceId, pluginId])
  @@index([workspaceId])
  @@index([pluginId])
  @@map("workspace_plugins")
  @@schema("core")
}
```

---

#### workspace_templates (NEW — Task 8)

| Column                | SQL Type     | Nullable | Default           | Constraints  | Notes                              |
| --------------------- | ------------ | -------- | ----------------- | ------------ | ---------------------------------- |
| id                    | UUID         | No       | gen_random_uuid() | PK           | Auto-generated                     |
| name                  | VARCHAR      | No       | -                 | -            | Template display name              |
| description           | TEXT         | Yes      | NULL              | -            | Template description               |
| provided_by_plugin_id | VARCHAR      | No       | -                 | FK → plugins | Plugin that provides this template |
| is_default            | BOOLEAN      | No       | false             | -            | One default per provider plugin    |
| metadata              | JSONB        | No       | `{}`              | -            | Arbitrary plugin-defined metadata  |
| created_at            | TIMESTAMP(3) | No       | NOW()             | -            | Immutable                          |
| updated_at            | TIMESTAMP(3) | No       | NOW()             | -            | Auto-updated via Prisma @updatedAt |

```prisma
model WorkspaceTemplate {
  id                  String   @id @default(uuid())
  name                String
  description         String?
  providedByPluginId  String   @map("provided_by_plugin_id")
  isDefault           Boolean  @default(false) @map("is_default")
  metadata            Json     @default("{}")
  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @updatedAt @map("updated_at")

  plugin Plugin @relation(fields: [providedByPluginId], references: [id])
  items  WorkspaceTemplateItem[]

  @@index([providedByPluginId])
  @@map("workspace_templates")
  @@schema("core")
}
```

---

#### workspace_template_items (NEW — Task 8)

| Column        | SQL Type     | Nullable | Default           | Constraints                         | Notes                          |
| ------------- | ------------ | -------- | ----------------- | ----------------------------------- | ------------------------------ |
| id            | UUID         | No       | gen_random_uuid() | PK                                  | Auto-generated                 |
| template_id   | UUID         | No       | -                 | FK → workspace_templates            | ON DELETE CASCADE              |
| type          | VARCHAR      | No       | -                 | CHECK ('plugin', 'page', 'setting') | Item type discriminator        |
| plugin_id     | VARCHAR      | Yes      | NULL              | -                                   | Required when type = 'plugin'  |
| page_config   | JSONB        | Yes      | NULL              | -                                   | Required when type = 'page'    |
| setting_key   | VARCHAR      | Yes      | NULL              | -                                   | Required when type = 'setting' |
| setting_value | JSONB        | Yes      | NULL              | -                                   | Required when type = 'setting' |
| sort_order    | INTEGER      | No       | 0                 | -                                   | Application order              |
| created_at    | TIMESTAMP(3) | No       | NOW()             | -                                   | Immutable                      |

```prisma
model WorkspaceTemplateItem {
  id           String   @id @default(uuid())
  templateId   String   @map("template_id")
  type         String   // 'plugin' | 'page' | 'setting'
  pluginId     String?  @map("plugin_id")
  pageConfig   Json?    @map("page_config")
  settingKey   String?  @map("setting_key")
  settingValue Json?    @map("setting_value")
  sortOrder    Int      @default(0) @map("sort_order")
  createdAt    DateTime @default(now()) @map("created_at")

  template WorkspaceTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)

  @@index([templateId])
  @@map("workspace_template_items")
  @@schema("core")
}
```

---

#### workspace_pages (NEW — Task 8)

| Column       | SQL Type     | Nullable | Default           | Constraints                        | Notes                     |
| ------------ | ------------ | -------- | ----------------- | ---------------------------------- | ------------------------- |
| id           | UUID         | No       | gen_random_uuid() | PK                                 | Auto-generated            |
| workspace_id | UUID         | No       | -                 | FK → workspaces, ON DELETE CASCADE | Owning workspace          |
| slug         | VARCHAR      | No       | -                 | UNIQUE(workspace_id, slug)         | Page identifier           |
| title        | VARCHAR      | No       | -                 | -                                  | Display title             |
| config       | JSONB        | No       | `{}`              | -                                  | Page layout/configuration |
| sort_order   | INTEGER      | No       | 0                 | -                                  | Display order             |
| created_at   | TIMESTAMP(3) | No       | NOW()             | -                                  | Immutable                 |
| updated_at   | TIMESTAMP(3) | No       | NOW()             | -                                  | Auto-updated              |

```prisma
model WorkspacePage {
  id          String   @id @default(uuid())
  workspaceId String   @map("workspace_id")
  slug        String
  title       String
  config      Json     @default("{}")
  sortOrder   Int      @default(0) @map("sort_order")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@unique([workspaceId, slug])
  @@index([workspaceId])
  @@map("workspace_pages")
  @@schema("core")
}
```

### 2.3 Updated WorkspaceRow Interface

The existing `WorkspaceRow` TypeScript interface in `workspace.service.ts`
(lines 25-34) must be extended with the new hierarchy fields:

```typescript
// File: apps/core-api/src/modules/workspace/workspace.service.ts
interface WorkspaceRow {
  id: string;
  tenant_id: string;
  parent_id: string | null; // NEW
  depth: number; // NEW
  path: string; // NEW
  slug: string;
  name: string;
  description: string | null;
  settings: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}
```

---

## 3. Migration Strategy

### 3.1 Migration 1: Workspace Hierarchy Fields (Task T1)

**File**: `packages/database/prisma/migrations/YYYYMMDD_workspace_hierarchy/migration.sql`

```sql
-- Phase 1: Add hierarchy columns with safe defaults
ALTER TABLE workspaces
  ADD COLUMN parent_id UUID DEFAULT NULL,
  ADD COLUMN depth INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN path VARCHAR NOT NULL DEFAULT '';

-- Phase 2: Add self-referencing foreign key
ALTER TABLE workspaces
  ADD CONSTRAINT fk_workspaces_parent
  FOREIGN KEY (parent_id) REFERENCES workspaces(id)
  ON DELETE RESTRICT;

-- Phase 3: Add depth check constraint
ALTER TABLE workspaces
  ADD CONSTRAINT chk_workspaces_depth
  CHECK (depth >= 0);

-- Phase 4: Drop old slug uniqueness, add new scoped constraint
-- The old constraint is: UNIQUE(tenant_id, slug)
ALTER TABLE workspaces
  DROP CONSTRAINT IF EXISTS workspaces_tenant_slug;

ALTER TABLE workspaces
  ADD CONSTRAINT uq_workspaces_parent_slug
  UNIQUE (parent_id, slug);

-- Phase 5: Add partial unique index for root workspaces
CREATE UNIQUE INDEX idx_workspace_root_slug_unique
  ON workspaces (tenant_id, slug)
  WHERE parent_id IS NULL;

-- Phase 6: Add B-TREE indexes
CREATE INDEX idx_workspaces_parent ON workspaces (parent_id);
CREATE INDEX idx_workspaces_path ON workspaces (path);
CREATE INDEX idx_workspaces_depth ON workspaces (depth);
```

**Backward Compatibility**: All new columns have defaults (`parent_id = NULL`,
`depth = 0`, `path = ''`). Existing workspaces remain valid root workspaces.
The slug uniqueness change is backward-compatible because all existing
workspaces have `parent_id = NULL`, so the partial index
`(tenant_id, slug) WHERE parent_id IS NULL` enforces the same uniqueness
constraint that previously existed as `UNIQUE(tenant_id, slug)`.

### 3.2 Migration 2: Backfill Existing Workspaces (Task T2)

**File**: `packages/database/prisma/migrations/YYYYMMDD_workspace_hierarchy_backfill/migration.sql`

```sql
-- Backfill path = id for all existing root workspaces
-- This must run AFTER the schema migration
UPDATE workspaces
  SET path = id::text, depth = 0
  WHERE parent_id IS NULL AND path = '';
```

**Verification**: After migration, assert:

```sql
SELECT COUNT(*) FROM workspaces WHERE path = '' AND parent_id IS NULL;
-- Expected: 0
```

### 3.3 Migration 3: Template & Plugin Models (Task T8)

**File**: `packages/database/prisma/migrations/YYYYMMDD_workspace_templates/migration.sql`

```sql
-- Create workspace_plugins join table
CREATE TABLE workspace_plugins (
  workspace_id UUID NOT NULL,
  plugin_id VARCHAR NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  configuration JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, plugin_id),
  CONSTRAINT fk_wp_workspace FOREIGN KEY (workspace_id)
    REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_wp_plugin FOREIGN KEY (plugin_id)
    REFERENCES plugins(id)
);
CREATE INDEX idx_workspace_plugins_ws ON workspace_plugins (workspace_id);
CREATE INDEX idx_workspace_plugins_plugin ON workspace_plugins (plugin_id);

-- Create workspace_templates table
CREATE TABLE workspace_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  description TEXT,
  provided_by_plugin_id VARCHAR NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_wt_plugin FOREIGN KEY (provided_by_plugin_id)
    REFERENCES plugins(id)
);
CREATE INDEX idx_workspace_templates_plugin ON workspace_templates (provided_by_plugin_id);

-- Create workspace_template_items table
CREATE TABLE workspace_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL,
  type VARCHAR NOT NULL,
  plugin_id VARCHAR,
  page_config JSONB,
  setting_key VARCHAR,
  setting_value JSONB,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_wti_template FOREIGN KEY (template_id)
    REFERENCES workspace_templates(id) ON DELETE CASCADE,
  CONSTRAINT chk_wti_type CHECK (type IN ('plugin', 'page', 'setting'))
);
CREATE INDEX idx_workspace_template_items_template ON workspace_template_items (template_id);

-- Create workspace_pages table
CREATE TABLE workspace_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  slug VARCHAR NOT NULL,
  title VARCHAR NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_wpage_workspace FOREIGN KEY (workspace_id)
    REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT uq_workspace_page_slug UNIQUE (workspace_id, slug)
);
CREATE INDEX idx_workspace_pages_ws ON workspace_pages (workspace_id);
```

### 3.4 Migration Order & Dependencies

```
Migration 1 (hierarchy fields) → Migration 2 (backfill) → Migration 3 (templates)
                                                         ↑
                                                    (independent, can run in parallel
                                                     with Migration 2 if needed)
```

All migrations are backward-compatible. No data loss. Existing API responses
gain new fields with defaults (`parentId: null`, `depth: 0`, `path: "<id>"`).

---

## 4. Service Architecture

### 4.1 WorkspaceHierarchyService (NEW — Task T3)

**Purpose**: Encapsulates all hierarchy-specific query and validation logic.
Separated from `WorkspaceService` to maintain single responsibility.

**Location**: `apps/core-api/src/modules/workspace/workspace-hierarchy.service.ts`

**Dependencies**:

- `PrismaClient` from `@plexica/database`
- `Redis` from `apps/core-api/src/lib/redis.ts`
- `Logger` from `apps/core-api/src/lib/logger.ts`

**Constructor Signature**:

```typescript
constructor(
  customDb?: PrismaClient,
  cache?: Redis,
  customLogger?: Logger
)
```

**Methods**:

| Method                    | Signature                                                                                | Returns                  | Spec Refs      |
| ------------------------- | ---------------------------------------------------------------------------------------- | ------------------------ | -------------- |
| `validateParentAccess`    | `(parentId: string, userId: string, tenantCtx: TenantContext) => Promise<WorkspaceRow>`  | Parent workspace row     | FR-001, FR-004 |
| `computeHierarchyFields`  | `(parentWorkspace: WorkspaceRow \| null, workspaceId: string) => { depth, path }`        | Computed depth and path  | FR-002, FR-003 |
| `getDescendants`          | `(rootPath: string, tenantCtx: TenantContext) => Promise<WorkspaceRow[]>`                | All descendant rows      | FR-008, FR-009 |
| `getDirectChildren`       | `(parentId: string, tenantCtx: TenantContext, limit, offset) => Promise<WorkspaceRow[]>` | Direct child rows        | FR-013         |
| `getTree`                 | `(userId: string, tenantCtx: TenantContext) => Promise<TreeNode[]>`                      | Nested tree structure    | FR-013, FR-014 |
| `getAggregatedCounts`     | `(workspacePath: string, tenantCtx: TenantContext) => Promise<AggregatedCounts>`         | Member/team/child counts | FR-008         |
| `isAncestorAdmin`         | `(userId: string, workspacePath: string, tenantCtx: TenantContext) => Promise<boolean>`  | Boolean                  | FR-011         |
| `getAncestorChain`        | `(workspacePath: string, tenantCtx: TenantContext) => Promise<WorkspaceRow[]>`           | Ancestor rows (ordered)  | FR-011         |
| `validateDepthConstraint` | `(parentDepth: number) => void`                                                          | void (throws on > 2)     | FR-004         |
| `hasChildren`             | `(workspaceId: string, tenantCtx: TenantContext) => Promise<boolean>`                    | Boolean                  | FR-007         |

**Key Query Patterns** (all use `Prisma.sql` parameterization):

```typescript
// Get all descendants via materialised path
async getDescendants(rootPath: string, tenantCtx: TenantContext): Promise<WorkspaceRow[]> {
  const schemaName = tenantCtx.schemaName;
  const tableName = Prisma.raw(`"${schemaName}"."workspaces"`);
  return this.db.$queryRaw<WorkspaceRow[]>(
    Prisma.sql`SELECT * FROM ${tableName}
     WHERE path LIKE ${rootPath + '/%'}
     AND tenant_id = ${tenantCtx.tenantId}
     ORDER BY depth ASC, name ASC`
  );
}

// Check if user is admin of any ancestor workspace
async isAncestorAdmin(userId: string, workspacePath: string, tenantCtx: TenantContext): Promise<boolean> {
  const ancestorIds = workspacePath.split('/').slice(0, -1); // exclude self
  if (ancestorIds.length === 0) return false;

  const schemaName = tenantCtx.schemaName;
  const membersTable = Prisma.raw(`"${schemaName}"."workspace_members"`);
  const result = await this.db.$queryRaw<Array<{ count: bigint }>>(
    Prisma.sql`SELECT COUNT(*) as count FROM ${membersTable}
     WHERE user_id = ${userId}
     AND workspace_id = ANY(${ancestorIds}::uuid[])
     AND role = 'ADMIN'`
  );
  return Number(result[0].count) > 0;
}

// Aggregated member count across subtree
async getAggregatedCounts(workspacePath: string, tenantCtx: TenantContext): Promise<AggregatedCounts> {
  const schemaName = tenantCtx.schemaName;
  const wsTable = Prisma.raw(`"${schemaName}"."workspaces"`);
  const membersTable = Prisma.raw(`"${schemaName}"."workspace_members"`);

  const result = await this.db.$queryRaw<Array<{
    member_count: bigint;
    team_count: bigint;
    child_count: bigint;
  }>>(
    Prisma.sql`SELECT
      (SELECT COUNT(DISTINCT wm.user_id) FROM ${membersTable} wm
       JOIN ${wsTable} w ON wm.workspace_id = w.id
       WHERE w.id = ${workspacePath.split('/')[0]}
         OR w.path LIKE ${workspacePath + '/%'}) as member_count,
      (SELECT COUNT(*) FROM ${wsTable}
       WHERE path LIKE ${workspacePath + '/%'}) as child_count`
  );

  return {
    aggregatedMemberCount: Number(result[0].member_count),
    aggregatedChildCount: Number(result[0].child_count),
  };
}
```

**Types**:

```typescript
// File: apps/core-api/src/modules/workspace/types/hierarchy.types.ts

export interface TreeNode {
  id: string;
  slug: string;
  name: string;
  depth: number;
  memberRole: string | null; // user's role in this workspace, null if not member
  _count: { members: number; teams: number; children: number };
  children: TreeNode[];
}

export interface AggregatedCounts {
  aggregatedMemberCount: number;
  aggregatedChildCount: number;
}
```

---

### 4.2 WorkspaceTemplateService (NEW — Task T10)

**Purpose**: Template CRUD and transactional template application during
workspace creation.

**Location**: `apps/core-api/src/modules/workspace/workspace-template.service.ts`

**Dependencies**:

- `PrismaClient` from `@plexica/database`
- `WorkspacePluginService` (for plugin enablement during template application)
- `Logger` from `apps/core-api/src/lib/logger.ts`

**Methods**:

| Method                    | Signature                                                                                             | Returns                        | Spec Refs      |
| ------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------ | -------------- |
| `listTemplates`           | `(tenantId: string) => Promise<TemplateListItem[]>`                                                   | Templates (filtered by tenant) | FR-021, FR-022 |
| `getTemplate`             | `(templateId: string) => Promise<TemplateWithItems>`                                                  | Template with items            | FR-021         |
| `applyTemplate`           | `(workspaceId: string, templateId: string, tenantId: string, tx: PrismaTransaction) => Promise<void>` | void (throws on failure)       | FR-015, FR-016 |
| `validateTemplatePlugins` | `(templateId: string, tenantId: string) => Promise<void>`                                             | void (throws if missing)       | FR-020         |
| `registerTemplate`        | `(pluginId: string, dto: RegisterTemplateDto) => Promise<TemplateWithItems>`                          | Created template               | FR-028         |
| `updateTemplate`          | `(pluginId: string, templateId: string, dto: UpdateTemplateDto) => Promise<TemplateWithItems>`        | Updated template               | FR-028         |
| `deleteTemplate`          | `(pluginId: string, templateId: string) => Promise<void>`                                             | void                           | FR-028         |

**applyTemplate Flow** (within existing transaction):

```typescript
async applyTemplate(
  workspaceId: string,
  templateId: string,
  tenantId: string,
  tx: PrismaTransaction
): Promise<void> {
  // 1. Fetch template with items (ordered by sort_order)
  const template = await this.fetchTemplateWithItems(tx, templateId);
  if (!template) throw new WorkspaceError('TEMPLATE_NOT_FOUND');

  // 2. Validate all referenced plugins are tenant-enabled
  await this.validateTemplatePlugins(template, tenantId, tx);

  // 3. Apply each item in sort_order
  for (const item of template.items) {
    switch (item.type) {
      case 'plugin':
        await this.applyPluginItem(workspaceId, item, tx);
        break;
      case 'setting':
        await this.applySettingItem(workspaceId, item, tx);
        break;
      case 'page':
        await this.applyPageItem(workspaceId, item, tx);
        break;
      default:
        throw new WorkspaceError('VALIDATION_ERROR', `Unknown template item type: ${item.type}`);
    }
  }
}
```

**Template Filtering** (FR-022):

```typescript
// List templates — exclude templates from disabled tenant plugins
async listTemplates(tenantId: string): Promise<TemplateListItem[]> {
  return this.db.$queryRaw<TemplateListItem[]>(
    Prisma.sql`SELECT wt.id, wt.name, wt.description, wt.provided_by_plugin_id,
      wt.is_default, wt.metadata, wt.created_at,
      (SELECT COUNT(*) FROM workspace_template_items wti WHERE wti.template_id = wt.id) as item_count
     FROM workspace_templates wt
     JOIN tenant_plugins tp ON tp.plugin_id = wt.provided_by_plugin_id
     WHERE tp.tenant_id = ${tenantId}
       AND tp.enabled = true
     ORDER BY wt.name ASC`
  );
}
```

---

### 4.3 WorkspacePluginService (NEW — Task T9)

**Purpose**: Per-workspace plugin enablement, configuration, and cascade
management.

**Location**: `apps/core-api/src/modules/workspace/workspace-plugin.service.ts`

**Dependencies**:

- `PrismaClient` from `@plexica/database`
- `Logger` from `apps/core-api/src/lib/logger.ts`

**Methods**:

| Method                          | Signature                                                                                                        | Returns        | Spec Refs      |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------- | -------------- |
| `enablePlugin`                  | `(workspaceId: string, pluginId: string, config: Json, tenantCtx: TenantContext) => Promise<WorkspacePluginRow>` | Plugin row     | FR-023, FR-024 |
| `disablePlugin`                 | `(workspaceId: string, pluginId: string, tenantCtx: TenantContext) => Promise<void>`                             | void           | FR-023         |
| `updateConfig`                  | `(workspaceId: string, pluginId: string, config: Json, tenantCtx: TenantContext) => Promise<WorkspacePluginRow>` | Updated row    | FR-025         |
| `listPlugins`                   | `(workspaceId: string, tenantCtx: TenantContext) => Promise<WorkspacePluginRow[]>`                               | Plugin list    | FR-025         |
| `validateTenantPluginEnabled`   | `(pluginId: string, tenantId: string) => Promise<void>`                                                          | void (throws)  | FR-024         |
| `cascadeDisableForTenantPlugin` | `(pluginId: string, tenantId: string) => Promise<number>`                                                        | Count disabled | FR-026         |

**Cascade Disable Logic** (FR-026):

```typescript
// Called when a tenant-level plugin is disabled
// Sets enabled = false for ALL workspace plugin records of that plugin
async cascadeDisableForTenantPlugin(pluginId: string, tenantId: string): Promise<number> {
  const result = await this.db.$executeRaw(
    Prisma.sql`UPDATE workspace_plugins wp
     SET enabled = false, updated_at = NOW()
     FROM workspaces w
     WHERE wp.workspace_id = w.id
       AND wp.plugin_id = ${pluginId}
       AND w.tenant_id = ${tenantId}
       AND wp.enabled = true`
  );
  return result; // number of rows updated
}
```

**Types**:

```typescript
// File: apps/core-api/src/modules/workspace/types/workspace-plugin.types.ts

export interface WorkspacePluginRow {
  workspace_id: string;
  plugin_id: string;
  enabled: boolean;
  configuration: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}
```

---

### 4.4 WorkspaceService Modifications (Task T6)

**Location**: `apps/core-api/src/modules/workspace/workspace.service.ts`

The existing `WorkspaceService.create()` method (line 135+) must be modified to:

1. Accept new fields: `parentId` and `templateId` in the DTO
2. Validate parent access (if `parentId` provided) via `WorkspaceHierarchyService`
3. Compute `depth` and `path` fields before INSERT
4. Include `parent_id`, `depth`, `path` in the INSERT SQL
5. Call `WorkspaceTemplateService.applyTemplate()` within the same transaction
6. Publish `core.workspace.created` event after transaction commit

**Modified Constructor** (add new service dependencies):

```typescript
constructor(
  customDb?: PrismaClient,
  eventBus?: EventBusService,
  cache?: Redis,
  customLogger?: Logger,
  hierarchyService?: WorkspaceHierarchyService,     // NEW
  templateService?: WorkspaceTemplateService,        // NEW
)
```

**Modified `create()` Method** (pseudocode — key changes highlighted):

```typescript
async create(dto: CreateWorkspaceDto, creatorId: string, tenantCtx?: TenantContext) {
  const tenantContext = tenantCtx || getTenantContext();
  const schemaName = tenantContext.schemaName;

  // [NEW] Validate parent workspace if parentId is provided
  let parentWorkspace: WorkspaceRow | null = null;
  if (dto.parentId) {
    parentWorkspace = await this.hierarchyService.validateParentAccess(
      dto.parentId, creatorId, tenantContext
    );
  }

  // [MODIFIED] Check slug uniqueness — scoped to parent, not tenant
  // For root: check (tenant_id, slug) WHERE parent_id IS NULL
  // For child: check (parent_id, slug)
  await this.checkSlugUniqueness(dto.slug, dto.parentId || null, tenantContext);

  const createdWorkspace = await this.db.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.raw(`SET LOCAL search_path TO "${schemaName}", public`));

    const workspaceIdResult = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT gen_random_uuid()::text as id`;
    const newWorkspaceId = workspaceIdResult[0].id;

    // [NEW] Compute hierarchy fields
    const { depth, path } = this.hierarchyService.computeHierarchyFields(
      parentWorkspace, newWorkspaceId
    );

    // [MODIFIED] INSERT includes parent_id, depth, path
    const tableName = Prisma.raw(`"${schemaName}"."workspaces"`);
    await tx.$executeRaw`
      INSERT INTO ${tableName}
      (id, tenant_id, parent_id, depth, path, slug, name, description, settings, created_at, updated_at)
      VALUES (
        ${newWorkspaceId}, ${tenantContext.tenantId},
        ${dto.parentId || null}, ${depth}, ${path},
        ${dto.slug}, ${dto.name}, ${dto.description}, ${dto.settings || {}},
        NOW(), NOW()
      )`;

    // Create workspace member (creator as admin) — unchanged
    // ...

    // [NEW] Apply template if templateId is provided
    if (dto.templateId) {
      await this.templateService.applyTemplate(
        newWorkspaceId, dto.templateId, tenantContext.tenantId, tx
      );
    }

    return this.fetchWorkspaceWithRelations(tx, newWorkspaceId, schemaName);
  });

  // [NEW] Fire non-blocking created hooks after transaction commit
  // (see Task T14 — PluginHookService)
  return createdWorkspace;
}
```

**Modified `update()` Method**: Reject `parentId` changes (FR-006):

```typescript
// In update() — parentId changes are not allowed here; use reparent() instead
if (dto.parentId !== undefined) {
  throw new WorkspaceError(
    'REPARENT_USE_DEDICATED_ENDPOINT',
    'Use PATCH /api/workspaces/:id/parent to move a workspace'
  );
}
```

**Modified `delete()` Method**: Check for children before deletion (FR-007):

```typescript
// In delete() — before any mutation
const hasChildren = await this.hierarchyService.hasChildren(workspaceId, tenantContext);
if (hasChildren) {
  throw new WorkspaceError(
    'WORKSPACE_HAS_CHILDREN',
    'Cannot delete workspace with child workspaces'
  );
}
```

---

### 4.5 PluginHookService (NEW — Task T14)

**Purpose**: Implements `runLifecycleHook()` — replaces the TODO stub in
`PluginHookSystem`. Handles HTTP callout to external plugin endpoints with
timeout, retries, and fail-open semantics.

**Location**: `apps/core-api/src/modules/plugin/plugin-hook.service.ts`

**Dependencies**:

- `PluginHookSystem` from `apps/core-api/src/lib/plugin-hooks.ts`
- `Logger` from `apps/core-api/src/lib/logger.ts`
- HTTP client (Node.js native `fetch` or `undici`)

**Methods**:

| Method                 | Signature                                                                                           | Returns            | Spec Refs |
| ---------------------- | --------------------------------------------------------------------------------------------------- | ------------------ | --------- |
| `runBeforeCreateHooks` | `(workspaceData: BeforeCreatePayload, tenantCtx: TenantContext) => Promise<HookResult>`             | HookResult         | FR-029    |
| `runCreatedHooks`      | `(workspaceId: string, templateId: string \| null, tenantCtx: TenantContext) => void`               | void (fire-forget) | FR-030    |
| `runDeletedHooks`      | `(workspaceId: string, tenantCtx: TenantContext) => void`                                           | void (fire-forget) | FR-033    |
| `invokeHook`           | `(plugin: PluginInfo, hookType: string, payload: object, timeout: number) => Promise<HookResponse>` | HookResponse       | FR-031    |
| `getHookSubscribers`   | `(hookType: string, tenantId: string) => Promise<PluginInfo[]>`                                     | Plugin list        | FR-027    |

**before_create Hook Pipeline** (sequential, can reject):

```typescript
async runBeforeCreateHooks(
  workspaceData: BeforeCreatePayload,
  tenantCtx: TenantContext
): Promise<HookResult> {
  const subscribers = await this.getHookSubscribers('workspace.before_create', tenantCtx.tenantId);

  for (const plugin of subscribers) {
    try {
      const response = await this.invokeHook(plugin, 'workspace.before_create', {
        workspaceData,
        tenantId: tenantCtx.tenantId,
      }, HOOK_TIMEOUT_MS);

      if (response.approve === false) {
        return { approved: false, reason: response.reason || 'Rejected by plugin', pluginId: plugin.id };
      }
    } catch (error) {
      // Timeout or network error → fail-open (implicit approve)
      this.log.warn({ pluginId: plugin.id, hookType: 'workspace.before_create', error },
        'Hook invocation failed — proceeding (fail-open)');
    }
  }

  return { approved: true };
}
```

**created Hook Pipeline** (parallel, non-blocking):

```typescript
runCreatedHooks(workspaceId: string, templateId: string | null, tenantCtx: TenantContext): void {
  // Fire-and-forget — do not await
  this.getHookSubscribers('workspace.created', tenantCtx.tenantId)
    .then(subscribers => {
      const promises = subscribers.map(plugin =>
        this.invokeHook(plugin, 'workspace.created', {
          workspaceId,
          templateId,
          tenantId: tenantCtx.tenantId,
        }, HOOK_TIMEOUT_MS).catch(error => {
          this.log.warn({ pluginId: plugin.id, hookType: 'workspace.created', error },
            'Hook invocation failed — workspace creation unaffected');
        })
      );
      return Promise.allSettled(promises);
    })
    .catch(error => {
      this.log.error({ error }, 'Failed to discover hook subscribers');
    });
}
```

**Hook Invocation** (with timeout):

```typescript
private async invokeHook(
  plugin: PluginInfo,
  hookType: string,
  payload: object,
  timeout: number
): Promise<HookResponse> {
  const hookUrl = plugin.hooks?.[hookType];
  if (!hookUrl) throw new Error(`Plugin ${plugin.id} has no handler for ${hookType}`);

  // Validate hook URL is within plugin's basePath
  if (!hookUrl.startsWith(plugin.apiBasePath)) {
    throw new Error(`Hook URL ${hookUrl} is outside plugin basePath ${plugin.apiBasePath}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(hookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-ID': payload.tenantId,
        'X-Trace-ID': crypto.randomUUID(),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Hook returned ${response.status}: ${response.statusText}`);
    }

    return await response.json() as HookResponse;
  } finally {
    clearTimeout(timer);
  }
}
```

**Constants**:

```typescript
const HOOK_TIMEOUT_MS = 5_000; // 5 seconds (per NFR-005, edge case #19)
```

**Types**:

```typescript
// File: apps/core-api/src/modules/plugin/types/hook.types.ts

export interface HookResult {
  approved: boolean;
  reason?: string;
  pluginId?: string;
}

export interface HookResponse {
  approve?: boolean;
  reason?: string;
}

export interface BeforeCreatePayload {
  slug: string;
  name: string;
  parentId?: string;
  templateId?: string;
  tenantId: string;
}
```

---

## 5. Guard Updates (Task T4)

### 5.1 WorkspaceGuard Extension

**Location**: `apps/core-api/src/modules/workspace/guards/workspace.guard.ts`

The existing `workspaceGuard` (110 lines) checks direct membership via
`workspaceService.checkAccessAndGetMembership()`. It must be extended with a
hierarchical ancestor-admin check.

**Modified Guard Flow**:

```
1. Extract workspaceId from request params
2. Check direct membership (existing logic)
   → If found: apply role-based access per existing rules
3. [NEW] If no direct membership:
   a. Fetch workspace row (including `path` field)
   b. Parse ancestor IDs from path (e.g., "root/child/self" → ["root", "child"])
   c. Check if user is ADMIN of any ancestor
   d. If yes: grant READ access (hierarchical read-only)
   e. If no: return 403 Forbidden
```

**Implementation**:

```typescript
// In workspace.guard.ts — after direct membership check fails

// NEW: Hierarchical access check
const workspace = await hierarchyService.getWorkspaceById(workspaceId, tenantCtx);
if (!workspace) {
  return reply.code(404).send(mapServiceError('WORKSPACE_NOT_FOUND'));
}

if (workspace.path) {
  const isAncestor = await hierarchyService.isAncestorAdmin(userId, workspace.path, tenantCtx);
  if (isAncestor) {
    // Grant hierarchical read access
    request.workspaceAccess = {
      role: 'HIERARCHICAL_READER',
      accessType: 'ancestor_admin',
      workspaceId,
    };
    return; // proceed to route handler
  }
}

return reply.code(403).send(mapServiceError('INSUFFICIENT_PERMISSIONS'));
```

### 5.2 Hierarchical Access Rules

| Access Type         | Direct Member? | Ancestor Admin? | Access Level             |
| ------------------- | -------------- | --------------- | ------------------------ |
| Direct ADMIN        | Yes (ADMIN)    | N/A             | Full read/write          |
| Direct MEMBER       | Yes (MEMBER)   | N/A             | Read + limited write     |
| Direct VIEWER       | Yes (VIEWER)   | N/A             | Read-only                |
| Hierarchical Read   | No             | Yes (ADMIN)     | Read-only (summary data) |
| Root MEMBER → child | No             | Yes (MEMBER)    | Read-only (summary only) |
| No Access           | No             | No              | 403 Forbidden            |

### 5.3 WorkspaceAccess Type Extension

```typescript
// File: apps/core-api/src/modules/workspace/types/access.types.ts

export interface WorkspaceAccess {
  role: WorkspaceRole | 'HIERARCHICAL_READER';
  accessType: 'direct' | 'ancestor_admin';
  workspaceId: string;
}
```

---

## 6. Hook System Updates (Task T14)

### 6.1 SystemHooks Extension

**Location**: `apps/core-api/src/lib/plugin-hooks.ts`

The existing `SystemHooks` constant (line ~10) has NO workspace hooks. Add:

```typescript
export const SystemHooks = {
  // ... existing hooks ...

  // NEW: Workspace lifecycle hooks
  'workspace.before_create': {
    description: 'Called before workspace creation — can reject',
    invocation: 'sequential', // each plugin called one at a time
    canReject: true,
  },
  'workspace.created': {
    description: 'Called after workspace creation — non-blocking',
    invocation: 'parallel', // all plugins called simultaneously
    canReject: false,
  },
  'workspace.deleted': {
    description: 'Called after workspace deletion — non-blocking',
    invocation: 'parallel',
    canReject: false,
  },
} as const;
```

### 6.2 Plugin Manifest Extension (Task T13)

**Modified manifest schema** (in plugin validation/registration):

```typescript
// File: apps/core-api/src/modules/plugin/plugin.service.ts (modified)

const VALID_CAPABILITIES = [
  'workspace.template-provider',
  // ... future capabilities
] as const;

const pluginManifestSchema = z.object({
  // ... existing fields ...

  // NEW: capabilities array
  capabilities: z.array(z.enum(VALID_CAPABILITIES)).optional().default([]),

  // NEW: hooks object
  hooks: z
    .object({
      workspace: z
        .object({
          before_create: z.string().url().optional(),
          created: z.string().url().optional(),
          deleted: z.string().url().optional(),
        })
        .optional(),
    })
    .optional(),
});
```

### 6.3 Integration with Workspace Creation

The workspace creation flow (in `WorkspaceService.create()` or the route
handler) must orchestrate hooks:

```
1. Validate request (Zod)
2. Validate parent access (if parentId)
3. [NEW] Run before_create hooks (sequential) → can abort with 400
4. Begin transaction
   4a. Create workspace with hierarchy fields
   4b. Create creator as ADMIN member
   4c. Apply template (if templateId)
5. Commit transaction
6. [NEW] Fire created hooks (parallel, non-blocking, fire-and-forget)
7. Return 201 response
```

**Decision**: `before_create` hooks run BEFORE the transaction (they can reject
creation). `created` hooks run AFTER the transaction commits (workspace exists).
This ensures hooks see a consistent state and cannot cause partial commits.

---

## 7. API Routes

### 7.1 Modified Endpoints

#### POST /api/workspaces (MODIFIED — Task T6)

- **Changes**: Accept `parentId` and `templateId` in request body
- **New validation**: `parentId` → validate parent exists, user is ADMIN, depth < 2
- **New validation**: `templateId` → validate template exists, plugins installed
- **Response**: Include `parentId`, `depth`, `path`, `_count.children`, `appliedTemplateId`
- **New error codes**: `HIERARCHY_DEPTH_EXCEEDED`, `PARENT_WORKSPACE_NOT_FOUND`,
  `PARENT_PERMISSION_DENIED`, `TEMPLATE_NOT_FOUND`, `TEMPLATE_PLUGIN_NOT_INSTALLED`,
  `HOOK_REJECTED_CREATION`
- **Spec Refs**: FR-001 through FR-006, FR-015, FR-016

#### GET /api/workspaces/:id (MODIFIED — Task T6)

- **Changes**: Include hierarchy context in response; support `?includeDescendants`
- **New response fields**: `parentId`, `depth`, `path`, `children[]`, `aggregatedMemberCount`
- **Hierarchical access**: Ancestor admins can read descendant workspaces
- **Spec Refs**: FR-008, FR-009, FR-010, FR-011

#### PATCH /api/workspaces/:id/parent (NEW — Task T6b)

- **Description**: Move workspace to a different parent (re-parenting)
- **Auth**: Tenant ADMIN role required
- **Changes**: Updates `parentId`, recalculates `path` and `depth` for workspace and all descendants in a single transaction
- **Validations**: Cycle detection (new parent cannot be a descendant), slug conflict under new parent, cross-tenant check
- **New error codes**: `REPARENT_CYCLE_DETECTED`, `WORKSPACE_SLUG_CONFLICT`, `INSUFFICIENT_PERMISSIONS`
- **Spec Refs**: FR-005, FR-006

#### PATCH /api/workspaces/:id (MODIFIED — Task T6)

- **Changes**: Standard workspace field updates (name, description, settings)
- **Note**: `parentId` changes must use PATCH /parent endpoint above
- **Spec Refs**: existing workspace update spec

#### DELETE /api/workspaces/:id (MODIFIED — Task T6)

- **Changes**: Check for child workspaces before deletion
- **New error code**: `WORKSPACE_HAS_CHILDREN`
- **Spec Refs**: FR-007

### 7.2 New Endpoints

#### GET /api/workspaces/tree (NEW — Task T5)

- **Description**: Get workspace hierarchy as nested tree
- **Auth**: Required — any authenticated tenant user
- **Tenant Context**: Required
- **Workspace Guard**: Not applied (tenant-level, visibility filtered by membership)
- **Rate Limit**: Reads tier (100/min per user)
- **Response**: `TreeNode[]` (nested)
- **Performance**: < 200ms (P95) for up to 100 workspaces (NFR-001)
- **Spec Refs**: FR-013, FR-014

#### GET /api/workspaces/:id/children (NEW — Task T5)

- **Description**: List direct children of a workspace
- **Auth**: Required — any member of parent workspace
- **Workspace Guard**: Applied on parent workspace
- **Query Params**: `limit` (1-100, default 50), `offset` (>= 0, default 0)
- **Rate Limit**: Reads tier (100/min per user)
- **Spec Refs**: FR-013

#### POST /api/workspaces/:id/plugins (NEW — Task T11)

- **Description**: Enable a plugin for a workspace
- **Auth**: Required — ADMIN role on workspace
- **Workspace Guard**: Applied
- **Request Body**: `{ pluginId: string, configuration?: object }`
- **Responses**: 201 (created), 400 (not tenant-enabled), 404 (not found), 409 (already enabled)
- **Spec Refs**: FR-023, FR-024

#### GET /api/workspaces/:id/plugins (NEW — Task T11)

- **Description**: List plugins enabled for workspace
- **Auth**: Required — any workspace member
- **Workspace Guard**: Applied
- **Spec Refs**: FR-025

#### PATCH /api/workspaces/:id/plugins/:pluginId (NEW — Task T11)

- **Description**: Update workspace plugin configuration
- **Auth**: Required — ADMIN role on workspace
- **Workspace Guard**: Applied
- **Request Body**: `{ configuration?: object, enabled?: boolean }`
- **Spec Refs**: FR-025

#### DELETE /api/workspaces/:id/plugins/:pluginId (NEW — Task T11)

- **Description**: Disable plugin for workspace
- **Auth**: Required — ADMIN role on workspace
- **Workspace Guard**: Applied
- **Response**: 204 (disabled — sets `enabled = false`, preserves config)
- **Spec Refs**: FR-023

#### GET /api/workspace-templates (NEW — Task T11)

- **Description**: List available workspace templates
- **Auth**: Required — any authenticated tenant user
- **Tenant Context**: Required
- **Response**: Templates filtered by enabled tenant plugins (FR-022)
- **Spec Refs**: FR-021, FR-022

#### GET /api/workspace-templates/:id (NEW — Task T11)

- **Description**: Get template details with items
- **Auth**: Required — any authenticated tenant user
- **Response**: Template with `items[]` (plugin, setting, page items)
- **Spec Refs**: FR-021

#### POST /api/plugins/:pluginId/templates (NEW — Task T15)

- **Description**: Register a template (plugin API)
- **Auth**: Super admin or plugin service token
- **Tenant Context**: Not required (templates are global to plugin)
- **Request Body**: `{ name, description?, isDefault?, metadata?, items[] }`
- **Spec Refs**: FR-028

#### PUT /api/plugins/:pluginId/templates/:templateId (NEW — Task T15)

- **Description**: Update a template (replaces all items)
- **Auth**: Super admin or plugin service token
- **Spec Refs**: FR-028

#### DELETE /api/plugins/:pluginId/templates/:templateId (NEW — Task T15)

- **Description**: Remove a template (cascade-deletes items)
- **Auth**: Super admin or plugin service token
- **Response**: 204
- **Spec Refs**: FR-028

### 7.3 New Error Codes

| Code                            | HTTP | Route(s)                               | Spec Ref |
| ------------------------------- | ---- | -------------------------------------- | -------- |
| `HIERARCHY_DEPTH_EXCEEDED`      | 400  | POST /api/workspaces                   | FR-004   |
| `PARENT_WORKSPACE_NOT_FOUND`    | 404  | POST /api/workspaces                   | FR-001   |
| `PARENT_PERMISSION_DENIED`      | 403  | POST /api/workspaces                   | FR-001   |
| `WORKSPACE_HAS_CHILDREN`        | 400  | DELETE /api/workspaces/:id             | FR-007   |
| `REPARENT_CYCLE_DETECTED`       | 400  | PATCH /api/workspaces/:id/parent       | FR-005   |
| `WORKSPACE_SLUG_CONFLICT`       | 409  | POST, PATCH /api/workspaces/:id/parent | FR-004   |
| `INSUFFICIENT_PERMISSIONS`      | 403  | PATCH /api/workspaces/:id/parent       | FR-005   |
| `TEMPLATE_NOT_FOUND`            | 404  | POST /api/workspaces                   | FR-015   |
| `TEMPLATE_PLUGIN_NOT_INSTALLED` | 400  | POST /api/workspaces                   | FR-020   |
| `TEMPLATE_APPLICATION_FAILED`   | 500  | POST /api/workspaces                   | FR-016   |
| `PLUGIN_NOT_TENANT_ENABLED`     | 400  | POST /api/workspaces/:id/plugins       | FR-024   |
| `WORKSPACE_PLUGIN_EXISTS`       | 409  | POST /api/workspaces/:id/plugins       | FR-023   |
| `WORKSPACE_PLUGIN_NOT_FOUND`    | 404  | PATCH/DELETE .../plugins/:id           | FR-025   |
| `HOOK_REJECTED_CREATION`        | 400  | POST /api/workspaces                   | FR-029   |
| `INVALID_CAPABILITY`            | 400  | Plugin manifest validation             | FR-026   |

All error responses follow Constitution Art. 6.2 format:
`{ error: { code: string, message: string, details?: object } }`

### 7.4 DTOs

#### New DTOs (Task T6, T11)

| DTO File                    | Location                                            | Purpose                                   |
| --------------------------- | --------------------------------------------------- | ----------------------------------------- |
| `create-workspace.dto.ts`   | `apps/core-api/src/modules/workspace/dto/` (MODIFY) | Add `parentId?`, `templateId?` to schema  |
| `workspace-plugin.dto.ts`   | `apps/core-api/src/modules/workspace/dto/` (NEW)    | Enable/disable/configure workspace plugin |
| `workspace-template.dto.ts` | `apps/core-api/src/modules/workspace/dto/` (NEW)    | Template registration, listing            |
| `register-template.dto.ts`  | `apps/core-api/src/modules/plugin/dto/` (NEW)       | Plugin template registration request      |

**Modified CreateWorkspaceSchema**:

```typescript
// File: apps/core-api/src/modules/workspace/dto/create-workspace.dto.ts (MODIFIED)

export const CreateWorkspaceSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/),
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  settings: z.record(z.unknown()).optional(),
  parentId: z.string().uuid().optional(), // NEW
  templateId: z.string().uuid().optional(), // NEW
});

export type CreateWorkspaceDto = z.infer<typeof CreateWorkspaceSchema>;
```

**New WorkspacePluginSchema**:

```typescript
// File: apps/core-api/src/modules/workspace/dto/workspace-plugin.dto.ts (NEW)

export const EnableWorkspacePluginSchema = z.object({
  pluginId: z.string().min(1).max(255),
  configuration: z.record(z.unknown()).optional().default({}),
});

export const UpdateWorkspacePluginSchema = z.object({
  configuration: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

export type EnableWorkspacePluginDto = z.infer<typeof EnableWorkspacePluginSchema>;
export type UpdateWorkspacePluginDto = z.infer<typeof UpdateWorkspacePluginSchema>;
```

**New RegisterTemplateSchema**:

```typescript
// File: apps/core-api/src/modules/plugin/dto/register-template.dto.ts (NEW)

export const TemplateItemSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('plugin'),
    pluginId: z.string().min(1),
  }),
  z.object({
    type: z.literal('setting'),
    settingKey: z.string().min(1).max(255),
    settingValue: z.unknown(),
  }),
  z.object({
    type: z.literal('page'),
    pageConfig: z.object({
      slug: z
        .string()
        .min(2)
        .max(50)
        .regex(/^[a-z0-9-]+$/),
      title: z.string().min(1).max(200),
      layout: z.string().optional(),
    }),
  }),
]);

export const RegisterTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  isDefault: z.boolean().optional().default(false),
  metadata: z.record(z.unknown()).optional().default({}),
  items: z.array(TemplateItemSchema).min(0).max(50),
});

export type RegisterTemplateDto = z.infer<typeof RegisterTemplateSchema>;
```

---

## 8. Frontend Impact

> **Note**: Frontend implementation is out of scope for the backend plan.
> This section documents the frontend surface area that will need updates
> after the backend is implemented. See Spec 010 (Frontend Production
> Readiness) for the full frontend plan.

### 8.1 Components Requiring Modification

| Component             | File Path (estimated)                               | Change Type | Description                                   |
| --------------------- | --------------------------------------------------- | ----------- | --------------------------------------------- |
| WorkspaceSwitcher     | `apps/web/src/components/WorkspaceSwitcher.tsx`     | MODIFY      | Tree view instead of flat list                |
| CreateWorkspaceDialog | `apps/web/src/components/CreateWorkspaceDialog.tsx` | MODIFY      | Add parent selector, template picker          |
| WorkspaceContext      | `apps/web/src/contexts/WorkspaceContext.tsx`        | MODIFY      | Hierarchy-aware context (parent, depth, path) |

### 8.2 New Components

| Component            | File Path (estimated)                             | Description                                  |
| -------------------- | ------------------------------------------------- | -------------------------------------------- |
| WorkspaceTreeView    | `apps/web/src/components/WorkspaceTreeView.tsx`   | Full hierarchy tree visualization            |
| TemplateSelector     | `apps/web/src/components/TemplateSelector.tsx`    | Template picker cards for workspace creation |
| WorkspacePluginsPage | `apps/web/src/routes/workspace-plugins.tsx`       | Plugin management page per workspace         |
| AggregatedDashboard  | `apps/web/src/components/AggregatedDashboard.tsx` | Parent workspace aggregated view             |

### 8.3 Accessibility Requirements (Constitution Art. 1.3)

- Tree view: `role="tree"`, `role="treeitem"`, `aria-expanded`, `aria-level`
- Keyboard navigation: Arrow keys for tree, Enter to select, Right/Left to expand/collapse
- Screen reader: Depth level and child count announced

---

## 9. Phased Delivery

### Phase 1: Workspace Hierarchy (Sprint 3) — ~21 story points

**Duration**: 2-3 weeks
**Deliverables**: Hierarchical workspace model, guards, tree endpoint

| Task | Description                                | Points | Effort    | Dependencies |
| ---- | ------------------------------------------ | ------ | --------- | ------------ |
| T1   | Schema migration (hierarchy fields)        | 3      | 4-6 hrs   | None         |
| T2   | Data migration (backfill)                  | 2      | 2-3 hrs   | T1           |
| T3   | WorkspaceHierarchyService                  | 5      | 10-14 hrs | T1           |
| T4   | Hierarchy guard extension                  | 3      | 6-8 hrs   | T3           |
| T5   | Tree & children endpoints                  | 3      | 6-8 hrs   | T3, T4       |
| T6   | Modify workspace create/update/delete flow | 3      | 6-8 hrs   | T3           |
| T7   | Pillar 1 tests                             | 2      | 8-10 hrs  | T1-T6        |

**Definition of Done**:

- All hierarchy tests pass (51 tests: 25 unit + 18 integration + 8 E2E)
- Existing workspace tests remain green (no regressions)
- Coverage ≥ 85% on new hierarchy code (NFR-011)
- Backfill migration verified on existing data
- Tree endpoint response < 200ms (P95) for 100 workspaces (NFR-001)

### Phase 2: Workspace Templates (Sprint 4) — ~13 story points

**Duration**: 1.5-2 weeks
**Deliverables**: Template models, template application, workspace plugins

| Task | Description                                 | Points | Effort   | Dependencies |
| ---- | ------------------------------------------- | ------ | -------- | ------------ |
| T8   | Schema migration (template + plugin models) | 3      | 4-6 hrs  | Phase 1      |
| T9   | WorkspacePluginService                      | 3      | 6-8 hrs  | T8           |
| T10  | WorkspaceTemplateService                    | 3      | 8-10 hrs | T8, T9       |
| T11  | Template & plugin endpoints                 | 2      | 6-8 hrs  | T9, T10      |
| T12  | Pillar 2 tests                              | 2      | 6-8 hrs  | T8-T11       |

**Definition of Done**:

- All template tests pass (30 tests: 15 unit + 10 integration + 5 E2E)
- Template application is fully transactional (NFR-009)
- Template application < 1000ms (P95) for 10 items (NFR-003)
- Cascade disable works for tenant plugin removal (FR-026)
- Coverage ≥ 85% on template code (NFR-012)

### Phase 3: Plugin Integration (Sprint 4-5) — ~13 story points

**Duration**: 1.5-2 weeks
**Deliverables**: Hook system, manifest extension, plugin template registration

| Task | Description                            | Points | Effort   | Dependencies |
| ---- | -------------------------------------- | ------ | -------- | ------------ |
| T13  | Plugin manifest extension              | 2      | 4-6 hrs  | None         |
| T14  | PluginHookService implementation       | 3      | 8-10 hrs | T13          |
| T15  | Plugin template registration endpoints | 2      | 4-6 hrs  | T10, T13     |
| T16  | EventBus workspace events              | 2      | 3-4 hrs  | T14          |
| T17  | Pillar 3 tests                         | 4      | 6-8 hrs  | T13-T16      |

**Definition of Done**:

- All hook tests pass (24 tests: 12 unit + 8 integration + 4 E2E)
- `before_create` hooks can reject workspace creation (FR-029)
- `created` hooks are non-blocking — failure doesn't affect workspace (FR-030)
- Hook timeout enforced at 5s (NFR-005)
- Manifest validation rejects unknown capabilities (FR-026)
- Coverage ≥ 85% on hook code

### Phase Summary

```
Sprint 3 (Weeks 1-3):  Phase 1 — Hierarchy          [21 pts]
Sprint 4 (Weeks 4-5):  Phase 2 — Templates           [13 pts]
Sprint 4-5 (Weeks 5-7): Phase 3 — Plugin Integration [13 pts]
                                               Total: ~47 pts
```

Each phase is independently shippable. Phase 1 delivers the highest business
value (enterprise hierarchy feature). Phase 2 builds on Phase 1 but can be
deployed without Phase 3. Phase 3 completes the plugin ecosystem story.

---

## 10. Testing Strategy

### 10.1 Test Plan Summary

| Category    | Phase 1 (Hierarchy) | Phase 2 (Templates) | Phase 3 (Hooks) | Total   |
| ----------- | ------------------- | ------------------- | --------------- | ------- |
| Unit        | 25                  | 15                  | 12              | 52      |
| Integration | 18                  | 10                  | 8               | 36      |
| E2E         | 8                   | 5                   | 4               | 17      |
| **Total**   | **51**              | **30**              | **24**          | **105** |

### 10.2 Phase 1: Hierarchy Tests (51 tests — Task T7)

**Unit Tests (25)**:

| File                                                       | Test Area                                         | Count |
| ---------------------------------------------------------- | ------------------------------------------------- | ----- |
| `src/__tests__/workspace/unit/workspace-hierarchy.test.ts` | Depth calculation & validation                    | 5     |
| `src/__tests__/workspace/unit/workspace-hierarchy.test.ts` | Materialised path computation                     | 5     |
| `src/__tests__/workspace/unit/workspace-hierarchy.test.ts` | Slug uniqueness scoping                           | 4     |
| `src/__tests__/workspace/unit/workspace-hierarchy.test.ts` | Re-parenting validation (cycle, slug, permission) | 4     |
| `src/__tests__/workspace/unit/workspace-hierarchy.test.ts` | Re-parenting path/depth cascade                   | 3     |
| `src/__tests__/workspace/unit/workspace-hierarchy.test.ts` | Delete with children prevention                   | 3     |
| `src/__tests__/workspace/unit/workspace-hierarchy.test.ts` | Hierarchical permission resolution                | 5     |

**Integration Tests (18)**:

| File                                                                | Test Area                      | Count |
| ------------------------------------------------------------------- | ------------------------------ | ----- |
| `src/__tests__/workspace/integration/hierarchy.integration.test.ts` | Create workspace hierarchy     | 4     |
| `src/__tests__/workspace/integration/hierarchy.integration.test.ts` | Descendant aggregation queries | 4     |
| `src/__tests__/workspace/integration/hierarchy.integration.test.ts` | Hierarchical access control    | 5     |
| `src/__tests__/workspace/integration/hierarchy.integration.test.ts` | Tree endpoint                  | 3     |
| `src/__tests__/workspace/integration/hierarchy.integration.test.ts` | Migration backfill             | 2     |

**E2E Tests (8)**:

| File                                                          | Test Area                 | Count |
| ------------------------------------------------------------- | ------------------------- | ----- |
| `src/__tests__/workspace/e2e/hierarchy-lifecycle.e2e.test.ts` | Full hierarchy lifecycle  | 3     |
| `src/__tests__/workspace/e2e/hierarchy-lifecycle.e2e.test.ts` | Cross-workspace isolation | 3     |
| `src/__tests__/workspace/e2e/hierarchy-lifecycle.e2e.test.ts` | Concurrent child creation | 2     |

### 10.3 Phase 2: Template Tests (30 tests — Task T12)

**Unit Tests (15)**:

| File                                                       | Test Area                     | Count |
| ---------------------------------------------------------- | ----------------------------- | ----- |
| `src/__tests__/workspace/unit/workspace-templates.test.ts` | Template CRUD validation      | 4     |
| `src/__tests__/workspace/unit/workspace-templates.test.ts` | Template item type validation | 4     |
| `src/__tests__/workspace/unit/workspace-templates.test.ts` | Template application logic    | 4     |
| `src/__tests__/workspace/unit/workspace-templates.test.ts` | Template rollback on failure  | 3     |

**Integration Tests (10)**:

| File                                                                | Test Area                     | Count |
| ------------------------------------------------------------------- | ----------------------------- | ----- |
| `src/__tests__/workspace/integration/templates.integration.test.ts` | Workspace creation + template | 4     |
| `src/__tests__/workspace/integration/templates.integration.test.ts` | WorkspacePlugin CRUD          | 3     |
| `src/__tests__/workspace/integration/templates.integration.test.ts` | Template listing (filtered)   | 3     |

**E2E Tests (5)**:

| File                                                         | Test Area                       | Count |
| ------------------------------------------------------------ | ------------------------------- | ----- |
| `src/__tests__/workspace/e2e/template-lifecycle.e2e.test.ts` | Full template lifecycle         | 2     |
| `src/__tests__/workspace/e2e/template-lifecycle.e2e.test.ts` | Template + hierarchy combined   | 2     |
| `src/__tests__/workspace/e2e/template-lifecycle.e2e.test.ts` | Concurrent template application | 1     |

### 10.4 Phase 3: Hook Tests (24 tests — Task T17)

**Unit Tests (12)**:

| File                                                | Test Area                     | Count |
| --------------------------------------------------- | ----------------------------- | ----- |
| `src/__tests__/workspace/unit/plugin-hooks.test.ts` | Hook discovery from manifest  | 3     |
| `src/__tests__/workspace/unit/plugin-hooks.test.ts` | before_create hook invocation | 4     |
| `src/__tests__/workspace/unit/plugin-hooks.test.ts` | created hook invocation       | 3     |
| `src/__tests__/workspace/unit/plugin-hooks.test.ts` | Hook payload validation       | 2     |

**Integration Tests (8)**:

| File                                                            | Test Area                      | Count |
| --------------------------------------------------------------- | ------------------------------ | ----- |
| `src/__tests__/workspace/integration/hooks.integration.test.ts` | Hook-to-plugin communication   | 3     |
| `src/__tests__/workspace/integration/hooks.integration.test.ts` | Hook rejection blocks creation | 2     |
| `src/__tests__/workspace/integration/hooks.integration.test.ts` | Hook failure is non-blocking   | 2     |
| `src/__tests__/workspace/integration/hooks.integration.test.ts` | Hook timeout handling          | 1     |

**E2E Tests (4)**:

| File                                                     | Test Area                 | Count |
| -------------------------------------------------------- | ------------------------- | ----- |
| `src/__tests__/workspace/e2e/hook-lifecycle.e2e.test.ts` | Full hook lifecycle       | 2     |
| `src/__tests__/workspace/e2e/hook-lifecycle.e2e.test.ts` | Template + hooks combined | 2     |

### 10.5 Coverage Targets

| Module                    | Target | Measurement Method                                  |
| ------------------------- | ------ | --------------------------------------------------- |
| WorkspaceHierarchyService | ≥ 85%  | Vitest coverage on `workspace-hierarchy.service.ts` |
| WorkspaceTemplateService  | ≥ 85%  | Vitest coverage on `workspace-template.service.ts`  |
| WorkspacePluginService    | ≥ 85%  | Vitest coverage on `workspace-plugin.service.ts`    |
| PluginHookService         | ≥ 85%  | Vitest coverage on `plugin-hook.service.ts`         |
| Hierarchy guard extension | ≥ 90%  | Vitest coverage on `workspace.guard.ts`             |
| New DTOs                  | ≥ 90%  | Vitest coverage on DTO files                        |
| New route handlers        | ≥ 80%  | Vitest coverage on route handler logic              |

### 10.6 Critical Test Scenarios (Edge Cases)

These scenarios from the spec must each have at least one test:

| #   | Edge Case                                | Test Type   | Spec Ref |
| --- | ---------------------------------------- | ----------- | -------- |
| 1   | Create workspace at depth 3              | Unit        | FR-004   |
| 2   | Duplicate slug under same parent         | Integration | FR-005   |
| 3   | Same slug under different parents        | Integration | FR-005   |
| 4   | Delete workspace with children           | Unit        | FR-007   |
| 5   | Change parentId via PATCH                | Unit        | FR-006   |
| 6   | parentId in different tenant             | Integration | FR-001   |
| 7   | Non-admin creates child                  | Integration | FR-001   |
| 8   | Circular reference (depth prevents it)   | Unit        | FR-004   |
| 9   | Child queries sibling                    | Integration | FR-010   |
| 10  | Root VIEWER queries child                | Integration | FR-011   |
| 11  | Template references missing plugin       | Unit        | FR-020   |
| 12  | Template application fails mid-way       | Integration | FR-016   |
| 13  | Empty template (0 items)                 | Unit        | FR-015   |
| 14  | Cascade disable on tenant plugin removal | Integration | FR-026   |
| 15  | before_create hook rejects               | Integration | FR-029   |
| 16  | before_create hook times out (>5s)       | Integration | FR-031   |
| 17  | created hook fails (non-blocking)        | Integration | FR-030   |
| 18  | Concurrent child creation (same slug)    | E2E         | FR-005   |
| 19  | Tree query with 100+ workspaces          | E2E         | NFR-001  |

---

## 11. Risk Assessment

| Risk                                           | Impact | Likelihood | Mitigation                                                                                                |
| ---------------------------------------------- | ------ | ---------- | --------------------------------------------------------------------------------------------------------- |
| Schema migration on live tenants               | HIGH   | MEDIUM     | All new fields have defaults. Migration is backward-compatible. Blue-green deployment with rollback plan. |
| Slug uniqueness change breaks existing data    | HIGH   | LOW        | Partial index `WHERE parent_id IS NULL` exactly preserves existing tenant+slug uniqueness for roots.      |
| Materialised path performance at scale         | MEDIUM | LOW        | B-TREE index on `path` column. `LIKE 'prefix/%'` is sargable. Benchmark with 500+ workspaces.             |
| Hook system adds latency to workspace creation | MEDIUM | MEDIUM     | `before_create` timeout = 5s (fail-open). `created` hooks are non-blocking fire-and-forget.               |
| Template transaction size                      | LOW    | LOW        | Templates limited to 50 items (Zod validation). Single transaction for workspace + template.              |
| EventBus not available for Phase 3             | MEDIUM | MEDIUM     | Events are non-blocking (try-catch). Workspace creation succeeds without EventBus. Logged at warn.        |
| Plugin hook endpoints unreliable               | MEDIUM | MEDIUM     | 5s timeout, fail-open semantics. Hook failures never block workspace creation. Logged for debugging.      |

---

## 12. File Map

### 12.1 New Files

| File Path                                                                                 | Purpose                               | Phase | Task |
| ----------------------------------------------------------------------------------------- | ------------------------------------- | ----- | ---- |
| `packages/database/prisma/migrations/YYYYMMDD_workspace_hierarchy/migration.sql`          | Hierarchy schema migration            | 1     | T1   |
| `packages/database/prisma/migrations/YYYYMMDD_workspace_hierarchy_backfill/migration.sql` | Backfill path for existing workspaces | 1     | T2   |
| `packages/database/prisma/migrations/YYYYMMDD_workspace_templates/migration.sql`          | Template/plugin model migration       | 2     | T8   |
| `apps/core-api/src/modules/workspace/workspace-hierarchy.service.ts`                      | Hierarchy query & validation service  | 1     | T3   |
| `apps/core-api/src/modules/workspace/types/hierarchy.types.ts`                            | TreeNode, AggregatedCounts types      | 1     | T3   |
| `apps/core-api/src/modules/workspace/types/access.types.ts`                               | WorkspaceAccess type extension        | 1     | T4   |
| `apps/core-api/src/modules/workspace/workspace-template.service.ts`                       | Template CRUD & application service   | 2     | T10  |
| `apps/core-api/src/modules/workspace/workspace-plugin.service.ts`                         | Per-workspace plugin management       | 2     | T9   |
| `apps/core-api/src/modules/workspace/types/workspace-plugin.types.ts`                     | WorkspacePluginRow type               | 2     | T9   |
| `apps/core-api/src/modules/workspace/dto/workspace-plugin.dto.ts`                         | Workspace plugin DTOs (Zod)           | 2     | T11  |
| `apps/core-api/src/modules/workspace/dto/workspace-template.dto.ts`                       | Workspace template DTOs (Zod)         | 2     | T11  |
| `apps/core-api/src/modules/plugin/dto/register-template.dto.ts`                           | Plugin template registration DTO      | 3     | T15  |
| `apps/core-api/src/modules/plugin/plugin-hook.service.ts`                                 | Lifecycle hook invocation service     | 3     | T14  |
| `apps/core-api/src/modules/plugin/types/hook.types.ts`                                    | HookResult, HookResponse types        | 3     | T14  |
| `apps/core-api/src/routes/workspace-templates.ts`                                         | Template CRUD routes                  | 2     | T11  |
| `apps/core-api/src/__tests__/workspace/unit/workspace-hierarchy.test.ts`                  | Hierarchy unit tests (25)             | 1     | T7   |
| `apps/core-api/src/__tests__/workspace/unit/workspace-templates.test.ts`                  | Template unit tests (15)              | 2     | T12  |
| `apps/core-api/src/__tests__/workspace/unit/workspace-plugins.test.ts`                    | Plugin service unit tests             | 2     | T12  |
| `apps/core-api/src/__tests__/workspace/unit/plugin-hooks.test.ts`                         | Hook invocation unit tests (12)       | 3     | T17  |
| `apps/core-api/src/__tests__/workspace/integration/hierarchy.integration.test.ts`         | Hierarchy integration tests (18)      | 1     | T7   |
| `apps/core-api/src/__tests__/workspace/integration/templates.integration.test.ts`         | Template integration tests (10)       | 2     | T12  |
| `apps/core-api/src/__tests__/workspace/integration/hooks.integration.test.ts`             | Hook integration tests (8)            | 3     | T17  |
| `apps/core-api/src/__tests__/workspace/e2e/hierarchy-lifecycle.e2e.test.ts`               | Hierarchy E2E tests (8)               | 1     | T7   |
| `apps/core-api/src/__tests__/workspace/e2e/template-lifecycle.e2e.test.ts`                | Template E2E tests (5)                | 2     | T12  |
| `apps/core-api/src/__tests__/workspace/e2e/hook-lifecycle.e2e.test.ts`                    | Hook E2E tests (4)                    | 3     | T17  |

### 12.2 Modified Files

| File Path                                                         | Modification                                           | Phase | Task    |
| ----------------------------------------------------------------- | ------------------------------------------------------ | ----- | ------- |
| `packages/database/prisma/schema.prisma`                          | Add hierarchy fields, 4 new models, relations          | 1, 2  | T1, T8  |
| `apps/core-api/src/modules/workspace/workspace.service.ts`        | Integrate hierarchy + template in create/update/delete | 1, 2  | T6      |
| `apps/core-api/src/modules/workspace/guards/workspace.guard.ts`   | Add hierarchical ancestor-admin access check           | 1     | T4      |
| `apps/core-api/src/modules/workspace/dto/create-workspace.dto.ts` | Add `parentId?`, `templateId?` fields                  | 1     | T6      |
| `apps/core-api/src/modules/workspace/dto/index.ts`                | Export new DTOs                                        | 1, 2  | T6, T11 |
| `apps/core-api/src/routes/workspace.ts`                           | Add tree, children, plugin routes                      | 1, 2  | T5, T11 |
| `apps/core-api/src/routes/plugin.ts`                              | Add template registration routes                       | 3     | T15     |
| `apps/core-api/src/lib/plugin-hooks.ts`                           | Add workspace hooks to SystemHooks                     | 3     | T14     |
| `apps/core-api/src/modules/plugin/plugin.service.ts`              | Manifest validation for capabilities/hooks             | 3     | T13     |

---

## 13. ADRs to Create

### ADR-013: Materialised Path for Workspace Hierarchy

**Context**: Workspace hierarchy requires efficient descendant queries for
aggregation and tree views. Three patterns were evaluated:

1. **Adjacency List** (parentId only) — simple but requires recursive CTEs
2. **Nested Sets** (left/right values) — fast reads but expensive writes
3. **Materialised Path** (path string) — balanced read/write performance

**Decision**: Materialised Path — stores the full path from root to node as a
string (e.g., `"rootId/childId/grandchildId"`). Descendant queries use
`WHERE path LIKE 'rootId/%'` which is O(log n) with a B-TREE index.

**Consequences**:

- (+) O(log n) descendant queries via B-TREE index
- (+) No recursive CTEs needed
- (+) Re-parenting updates only the moved subtree (O(n) subtree size)
- (-) Re-parenting requires transactional path recalculation for entire subtree (O(n))
- (-) Path string grows with depth (unbounded; each UUID level adds ~37 chars)

**Constitution Alignment**: Art. 3.3 (Prisma ORM pattern), Art. 4.3 (< 50ms query target)

### ADR-014: WorkspacePlugin Scoping Separate from TenantPlugin

**Context**: Plugins can be enabled at two levels — tenant (installed for the
organization) and workspace (activated for a specific workspace). The question
is whether to reuse the existing `tenant_plugins` table or create a separate
`workspace_plugins` join table.

**Decision**: Separate `workspace_plugins` table with the following rules:

1. Tenant-level enablement is a **prerequisite** — workspace cannot enable a
   plugin unless it's already enabled at the tenant level
2. Cascade disable: when a tenant plugin is disabled, ALL workspace plugins
   for that plugin are automatically set to `enabled = false`
3. No cascade re-enable: re-enabling a tenant plugin does NOT auto-re-enable
   workspace plugins — each must be explicitly re-enabled

**Consequences**:

- (+) Clear separation of concerns (tenant-level vs workspace-level)
- (+) Workspace-specific configuration without polluting tenant config
- (+) Cascade disable prevents orphan workspace plugins
- (-) Two-level lookup required (tenant enabled + workspace enabled)
- (-) Slightly more complex plugin management UX

**Constitution Alignment**: Art. 1.2 (Plugin System Integrity), Art. 3.2 (DDD bounded contexts)

---

## 14. Performance Impact Analysis — Descendant-Scoped Queries

> This section documents the performance implications of queries that must
> traverse a workspace subtree (self + all descendants) to aggregate data.
> It was produced as a pre-implementation risk analysis for `getDescendants`,
> `getAggregatedCounts`, and re-parenting operations.

---

### 14.1 Query Under Analysis

The primary concern is any operation where a workspace node must **aggregate
data across itself and all descendant workspaces**. The canonical example is
`getAggregatedCounts` (§4.1):

```sql
SELECT
  (SELECT COUNT(DISTINCT wm.user_id)
   FROM workspace_members wm
   JOIN workspaces w ON wm.workspace_id = w.id
   WHERE w.id = $rootId OR w.path LIKE $rootPath || '/%') as member_count,
  (SELECT COUNT(*) FROM workspaces
   WHERE path LIKE $rootPath || '/%') as child_count
```

And `getDescendants`:

```sql
SELECT * FROM workspaces
WHERE path LIKE $rootPath || '/%'
AND tenant_id = $tenantId
ORDER BY depth ASC, name ASC
```

---

### 14.2 Index Sargability

**Pattern**: `WHERE path LIKE 'abc123/%'`

**Assessment: ✅ SARGABLE** — because the wildcard appears only at the
**suffix**, not the prefix, PostgreSQL's B-TREE index on the `path` column can
perform a range scan equivalent to:

```
path >= 'abc123/' AND path < 'abc123/~'
```

This means `idx_workspaces_path` (planned B-TREE in T011-01) will be used
efficiently by the query planner for **prefix LIKE** patterns, regardless of
tree depth.

**Critical requirement**: The column collation must be `C` or `POSIX` (or the
index must use `varchar_pattern_ops`) for LIKE to exploit the B-TREE index.
Without this, PostgreSQL falls back to a sequential scan.

**Action**: Migration T011-01 must create the index explicitly as:

```sql
CREATE INDEX idx_workspaces_path ON workspaces USING btree (path varchar_pattern_ops);
```

This is a concrete change to T011-01's migration SQL.

---

### 14.3 Correlated Subquery Fan-Out (N-table problem)

`getAggregatedCounts` today uses **two correlated subqueries** (one for
`member_count`, one for `child_count`). This pattern has the following
characteristics:

| Factor                    | Impact                                                                |
| ------------------------- | --------------------------------------------------------------------- |
| Two separate subqueries   | Two index scans on `workspace_members` and `workspaces` per call      |
| JOIN inside subquery      | `workspace_members JOIN workspaces` — requires `workspace_id` index   |
| `COUNT(DISTINCT user_id)` | Materialises all matched rows before deduplication — O(subtree size)  |
| No LIMIT/partial rollup   | Full subtree always scanned, even if caller only needs top-level view |

**Current design is acceptable for small-to-medium tenants** (< 200 workspaces
per tenant, < 5000 members total) given the planned Redis cache (TTL 300s,
§14.5). For larger tenants the query may exceed the P95 < 200ms SLA
(Constitution Art. 4.3).

**Recommended query rewrite** (single pass, avoids JOIN inside subquery):

```sql
SELECT
  COUNT(DISTINCT wm.user_id) FILTER (WHERE true) as member_count,
  COUNT(DISTINCT w.id) FILTER (WHERE w.id != $rootId) as child_count
FROM workspaces w
LEFT JOIN workspace_members wm ON wm.workspace_id = w.id
WHERE w.id = $rootId
   OR (w.path LIKE $rootPath || '/%' AND w.tenant_id = $tenantId)
```

This performs a **single index range scan** on `workspaces.path` and one
hash-join against `workspace_members`, instead of two separate correlated
subqueries.

---

### 14.4 Scale Scenario — Root-Level Aggregation

**Scenario**: Tenant with 500 workspaces, tree depth 8 levels, root node queried
for aggregated member count. Assume 20 members per workspace average = 10 000
membership rows in `workspace_members`.

| Step                          | Rows touched | Index used                    | Estimated cost |
| ----------------------------- | ------------ | ----------------------------- | -------------- |
| `path LIKE 'rootId/%'`        | 499          | `idx_workspaces_path` (range) | ~1 ms          |
| JOIN onto `workspace_members` | up to 9 980  | `idx_workspace_members_ws_id` | ~5–15 ms       |
| `COUNT(DISTINCT user_id)`     | 9 980 rows   | Hash aggregate (in-memory)    | ~2–5 ms        |
| **Total (uncached)**          | —            | —                             | **~10–25 ms**  |
| **Total (Redis cache hit)**   | 0 DB rows    | —                             | **< 1 ms**     |

At this scale the query is comfortably **within the 200ms P95 SLA** even
without caching. Caching makes it negligible.

**Degenerate case** (tenant with 2000+ workspaces and millions of member rows):
without denormalisation or materialised view, DB cost could reach 100–200ms.
This is tracked as a future scaling risk (see §14.6).

---

### 14.5 Re-Parenting Performance

Re-parenting a workspace subtree requires a bulk UPDATE of `path` and `depth`
for all descendants (Task T011-06b, §T6b in Plan):

```sql
UPDATE workspaces
SET path = $newParentPath || '/' || id,   -- simplified; must handle multi-level subtree
    depth = $newDepth + (depth - $oldDepth)
WHERE path LIKE $oldPath || '/%'
  AND tenant_id = $tenantId
```

**Risks**:

| Risk                          | Severity | Mitigation                                                      |
| ----------------------------- | -------- | --------------------------------------------------------------- |
| Row-level lock contention     | MEDIUM   | Bulk UPDATE inside a single transaction; keep transaction short |
| Transaction duration          | MEDIUM   | For subtrees > 500 nodes, consider chunked batch UPDATE         |
| Path recalculation complexity | LOW      | Path is `parentPath + '/' + segmentFromOldPath` (string op)     |
| Deadlock with concurrent ops  | LOW      | Workspace write operations serialised at service layer          |

**Practical assessment**: For typical tenants (< 200 workspaces), re-parenting
a subtree of 50 nodes takes < 5ms. For pathological cases (500-node subtree),
a chunked approach (100 rows per batch) with brief unlock between chunks is
recommended. This is noted as an implementation hint in T011-06b.

---

### 14.6 N+1 Risk Assessment

**Risk**: Callers of `getDescendants()` may naively iterate the returned array
and call per-workspace queries (e.g., `getMembers(workspace)` for each node).

**Mitigation already in design**:

- `getAggregatedCounts` is a single query, not a loop
- `getTree()` (§4.1) builds the tree from a single `getDescendants()` call +
  one `workspace_members` batch query — no per-node round trips
- API response for `GET /api/workspaces/:id/tree` returns pre-aggregated counts
  via `_count` fields (no lazy loading)

**Risk remains for plugin code** that calls the hierarchy service. This is
addressed by the plugin hook timeout (5s fail-open) which caps the blast radius.

---

### 14.7 Required Index: `workspace_members.workspace_id`

The aggregation JOIN is:

```sql
workspace_members wm ON wm.workspace_id = w.id
```

The existing `workspace_members` table (Spec 009) must have an index on
`workspace_id`. Verify this index exists in the T011-01 migration or add it:

```sql
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace_id
  ON workspace_members (workspace_id);
```

**Action**: T011-01 acceptance criteria must verify this index exists.

---

### 14.8 Redis Caching Strategy for Aggregated Counts

`getAggregatedCounts` results must be cached in Redis with the following policy:

| Cache key                                 | TTL  | Invalidated when                              |
| ----------------------------------------- | ---- | --------------------------------------------- |
| `tenant:{tenantId}:ws:{wsId}:agg_counts`  | 300s | Member added/removed, child created/deleted   |
| `tenant:{tenantId}:ws:{wsId}:descendants` | 300s | Child created/deleted, re-parent affecting ws |

**Implementation note**: Cache invalidation on member changes is already
partially implemented in `WorkspaceService` (the `membershipCacheKey` pattern
lines 128–130). The aggregated count cache must follow the same
write-through/invalidate-on-write pattern.

---

### 14.9 Performance NFRs Added to Spec

The following NFRs must be added to `spec.md §NFR` as a result of this analysis:

| ID      | Requirement                                                                                    | Measured by              |
| ------- | ---------------------------------------------------------------------------------------------- | ------------------------ |
| NFR-P01 | `getDescendants` P95 < 50ms for tenants with ≤ 500 workspaces (uncached)                       | Vitest benchmark fixture |
| NFR-P02 | `getAggregatedCounts` P95 < 30ms (uncached), < 2ms (Redis cache hit)                           | Vitest benchmark fixture |
| NFR-P03 | Re-parenting a 50-node subtree P95 < 200ms (single transaction)                                | Integration test timing  |
| NFR-P04 | `idx_workspaces_path` must use `varchar_pattern_ops` to ensure LIKE sargability                | Migration review         |
| NFR-P05 | `idx_workspace_members_workspace_id` must exist before any hierarchy query is executed in prod | Migration review         |

---

### 14.10 Summary — Actions Required

| Action                                                       | Where               | Priority |
| ------------------------------------------------------------ | ------------------- | -------- |
| Add `varchar_pattern_ops` to `idx_workspaces_path` creation  | T011-01 migration   | HIGH     |
| Add `idx_workspace_members_workspace_id` if missing          | T011-01 migration   | HIGH     |
| Rewrite `getAggregatedCounts` to single-pass JOIN query      | T011-03 service     | MEDIUM   |
| Add Redis cache for `agg_counts` and `descendants`           | T011-03 service     | MEDIUM   |
| Add NFR-P01 through NFR-P05 to spec.md                       | spec.md             | MEDIUM   |
| Add chunked batch hint for re-parenting subtrees > 100 nodes | T011-06b notes      | LOW      |
| Add performance benchmark tests                              | T011-07b (new task) | MEDIUM   |

---

## 15. Cross-References

| Document                          | Path                                                       |
| --------------------------------- | ---------------------------------------------------------- |
| Spec 011 (this plan's spec)       | `.forge/specs/011-workspace-hierarchy-templates/spec.md`   |
| Constitution                      | `.forge/constitution.md`                                   |
| Plan 009 (workspace gaps)         | `.forge/specs/009-workspace-management/plan.md`            |
| System Architecture               | `.forge/architecture/system-architecture.md`               |
| ADR-002 (Multi-tenancy)           | `.forge/knowledge/adr/adr-002-database-multi-tenancy.md`   |
| ADR-005 (Event System)            | `.forge/knowledge/adr/adr-005-event-system-redpanda.md`    |
| ADR-007 (Prisma ORM)              | `.forge/knowledge/adr/adr-007-prisma-orm.md`               |
| ADR-013 (Materialised Path)       | `.forge/knowledge/adr/adr-013-materialised-path.md`        |
| ADR-014 (WorkspacePlugin Scoping) | `.forge/knowledge/adr/adr-014-workspace-plugin-scoping.md` |
| Decision Log                      | `.forge/knowledge/decision-log.md`                         |
| AGENTS.md                         | `AGENTS.md`                                                |

---

**End of Plan 011 - Workspace Hierarchical Visibility & Templates**

_Document Version: 1.0_
_Created: 2026-02-20_
_Last Updated: 2026-02-20_
_Author: forge-architect_
_Track: Epic_
_Status: Draft_
_Total Story Points: ~47 (Phase 1: ~21, Phase 2: ~13, Phase 3: ~13)_
_Total Tests: 105 (52 unit + 36 integration + 17 E2E)_
