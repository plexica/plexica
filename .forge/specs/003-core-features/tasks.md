# Tasks: 003 - Core Features

> Ordered task breakdown with parallelism markers and requirement traceability.
> Created by the `forge-scrum` agent via `/forge-tasks`.

| Field  | Value                                    |
| ------ | ---------------------------------------- |
| Status | Pending                                  |
| Author | forge-scrum                              |
| Date   | 2026-04-07                               |
| Spec   | `.forge/specs/003-core-features/spec.md` |
| Plan   | `.forge/specs/003-core-features/plan.md` |

---

## Legend

- `[FR-NNN]` — Requirement being implemented (traceability)
- `[NFR-NNN]` — Non-functional requirement being addressed
- `[P]` — Parallelizable with other `[P]` tasks in the same phase
- Status: `[ ]` pending, `[x]` done, `[-]` skipped

> **Build sequence** (from plan §11.1): shared libs → migration → ABAC engine
> → audit log writer → workspace → workspace-member → invitation →
> user-management → user-profile → tenant-settings → audit log query routes →
> UI shared components → UI pages/hooks → seed data.

---

## Phase 1: Foundation — Shared Libraries & Configuration

> These files have zero inter-module dependencies; all can be built in parallel.

- [ ] **1.1** `[FR-002]` `[FR-011]` `[P]` Create email library
  - **File**: `services/core-api/src/lib/email.ts`
  - **Type**: Create new file
  - **Description**: SMTP client using nodemailer. Exports `sendInvitationEmail(to, inviteUrl, tenantName)`. Reads `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` from config. Must complete in < 5s (NFR-04).
  - **Spec Reference**: Plan §5.1.3, §7.1
  - **Dependencies**: None
  - **Estimated**: `[S]` ~20 min

- [ ] **1.2** `[FR-020]` `[FR-017]` `[P]` Create file-upload library
  - **File**: `services/core-api/src/lib/file-upload.ts`
  - **Type**: Create new file
  - **Description**: Multipart upload validation helpers. Exports `validateFileSize(maxBytes)` and `validateMimeType(allowed[])`. Used by avatar (< 1MB, JPEG/PNG/WebP) and logo (< 2MB, JPEG/PNG/WebP/SVG) uploads. Integrates with `@fastify/multipart`.
  - **Spec Reference**: Plan §3.4, NFR-07, NFR-09
  - **Dependencies**: None
  - **Estimated**: `[S]` ~25 min

- [ ] **1.3** `[FR-001]` `[FR-010]` `[P]` Create pagination library
  - **File**: `services/core-api/src/lib/pagination.ts`
  - **Type**: Create new file
  - **Description**: Shared pagination types (`PaginatedResult<T>`, `PaginationParams`) and query helpers (`buildPaginationClause(page, limit)`). Used by all list endpoints.
  - **Spec Reference**: Plan §4.1, §5.1.1
  - **Dependencies**: None
  - **Estimated**: `[S]` ~15 min

- [ ] **1.4** `[FR-002]` `[FR-004]` `[P]` Create slug library
  - **File**: `services/core-api/src/lib/slug.ts`
  - **Type**: Create new file
  - **Description**: Slug generation from workspace names. Exports `generateSlug(name): string`. Validates against `/^[a-z][a-z0-9-]{1,62}$/`. Handles collisions by appending a numeric suffix.
  - **Spec Reference**: Plan §3.4, spec §4.4 DR-02
  - **Dependencies**: None
  - **Estimated**: `[S]` ~20 min

- [ ] **1.5** `[FR-011]` `[P]` Create crypto library
  - **File**: `services/core-api/src/lib/crypto.ts`
  - **Type**: Create new file
  - **Description**: Secure random token generation. Exports `generateInviteToken(): string` (URL-safe base64, 32 bytes entropy). Used by invitation service.
  - **Spec Reference**: Plan §5.1.3, spec §4.4 DR-05
  - **Dependencies**: None
  - **Estimated**: `[S]` ~10 min

- [ ] **1.6** `[FR-016]` `[FR-011]` `[FR-017]` `[P]` Extend Keycloak admin library
  - **File**: `services/core-api/src/lib/keycloak-admin.ts`
  - **Type**: Modify existing
  - **Description**: Add functions: `createRealmUser(realm, email, displayName)`, `disableRealmUser(realm, userId)`, `terminateUserSessions(realm, userId)`, `syncDisplayName(realm, userId, name)`, `getRealmConfig(realm)`, `updateRealmConfig(realm, config)`. Each must handle KC downtime with `502 KEYCLOAK_ERROR`.
  - **Spec Reference**: Plan §5.1.4, §5.1.6, §11.3
  - **Dependencies**: None
  - **Estimated**: `[M]` ~90 min

- [ ] **1.7** `[FR-020]` `[FR-017]` `[P]` Extend MinIO client library
  - **File**: `services/core-api/src/lib/minio-client.ts`
  - **Type**: Modify existing
  - **Description**: Add helper functions: `uploadAvatar(tenantSlug, userId, stream, mimeType)`, `uploadLogo(tenantSlug, stream, mimeType)`, `getPresignedReadUrl(bucket, key)`. Enforce tenant bucket isolation (`tenant-{slug}`).
  - **Spec Reference**: Plan §5.1.5, §11.3
  - **Dependencies**: None
  - **Estimated**: `[M]` ~45 min

- [ ] **1.8** `[FR-013]` `[FR-014]` `[FR-015]` `[P]` Extend app config
  - **File**: `services/core-api/src/lib/config.ts`
  - **Type**: Modify existing
  - **Description**: Add env vars: `ABAC_CACHE_TTL_SECONDS` (default 300), `INVITATION_EXPIRY_DAYS` (default 7), `AVATAR_MAX_BYTES` (default 1MB), `LOGO_MAX_BYTES` (default 2MB), `ABAC_DECISION_LOG_SAMPLE_RATE` (default 1.0).
  - **Spec Reference**: Plan §7.4, NFR-07, NFR-09, NFR-13
  - **Dependencies**: None
  - **Estimated**: `[S]` ~20 min

- [ ] **1.9** `[FR-013]` `[FR-014]` `[P]` Extend rate-limit configuration
  - **File**: `services/core-api/src/lib/rate-limit-config.ts`
  - **Type**: Modify existing
  - **Description**: Add per-route rate limit configs for all new endpoints per plan §4.6: invitation endpoints (10/min), avatar/logo upload (5/min), auth config (5/min), general settings (30/min).
  - **Spec Reference**: Plan §4.6, ADR-012
  - **Dependencies**: None
  - **Estimated**: `[S]` ~25 min

- [ ] **1.10** `[FR-013]` `[FR-014]` `[FR-015]` `[P]` Extend error classes
  - **File**: `services/core-api/src/lib/app-error.ts`
  - **Type**: Modify existing
  - **Description**: Add the 14 new error classes defined in plan §4.7: `WORKSPACE_NOT_FOUND`, `WORKSPACE_ARCHIVED`, `CIRCULAR_REPARENT`, `MAX_HIERARCHY_DEPTH`, `WORKSPACE_SLUG_CONFLICT`, `MEMBER_ALREADY_EXISTS`, `MEMBER_NOT_FOUND`, `INVITATION_NOT_FOUND`, `INVITATION_EXPIRED`, `INVITATION_ALREADY_ACCEPTED`, `USER_NOT_FOUND`, `FILE_TOO_LARGE`, `INVALID_FILE_TYPE`, `KEYCLOAK_ERROR`.
  - **Spec Reference**: Plan §4.7
  - **Dependencies**: None
  - **Estimated**: `[S]` ~30 min

- [ ] **1.11** `[FR-011]` `[P]` Install new npm packages
  - **File**: `services/core-api/package.json`, `apps/web/package.json`, `packages/ui/package.json`
  - **Type**: Modify existing
  - **Description**: Install `nodemailer@^6.9`, `@types/nodemailer@^6.4`, `@fastify/multipart@^9` in `services/core-api`. Install `@radix-ui/react-popover`, `@radix-ui/react-switch`, `@radix-ui/react-tabs`, `@radix-ui/react-select`, `react-hook-form`, `@hookform/resolvers`, `zod`, `react-colorful` in `apps/web`. Add Radix primitives to `packages/ui`.
  - **Spec Reference**: Plan §7.1
  - **Dependencies**: None
  - **Estimated**: `[S]` ~15 min

---

## Phase 2: Database Migration & Prisma Schema

- [ ] **2.1** `[FR-001]` `[FR-002]` `[FR-004]` `[FR-008]` `[FR-010]` `[FR-011]` `[FR-013]` `[FR-015]` `[FR-017]` `[FR-019]` `[FR-020]` `[FR-021]` `[FR-023]` Write Prisma schema models
  - **File**: `services/core-api/prisma/schema.prisma`
  - **Type**: Modify existing
  - **Description**: Add 10 new tenant-schema models in order: `user_profile`, `workspace_template`, `tenant_branding`, `workspace` (with materialized path, FK to template + user_profile), `workspace_member` (role CHECK: admin/member/viewer), `invitation`, `audit_log`, `abac_decision_log`, `action_registry` (plugin_id as UUID without FK — Spec 004 adds FK), `workspace_role_action`. Follow migration order from plan §3.3.
  - **Spec Reference**: Plan §3.1, §3.3
  - **Dependencies**: Phase 1 complete
  - **Estimated**: `[L]` ~3 hrs

- [ ] **2.2** `[FR-001]` `[FR-004]` `[FR-008]` `[FR-010]` `[FR-013]` `[FR-015]` `[FR-017]` `[FR-019]` `[FR-020]` `[FR-021]` `[FR-023]` Write SQL migration file
  - **File**: `services/core-api/prisma/migrations/003_core_features/migration.sql`
  - **Type**: Create new file
  - **Description**: Raw SQL migration creating all 10 tenant-schema tables, indexes, and CHECK constraints. Must run inside `tenant_<slug>` schema. Include: GIN index on `audit_log.metadata`, B-tree index on `workspace.materialized_path`, unique index on `workspace.slug`. FK from `workspace_role_action` to `workspace`.
  - **Spec Reference**: Plan §3.1, §3.3
  - **Dependencies**: Task 2.1
  - **Estimated**: `[M]` ~90 min

- [ ] **2.3** `[FR-008]` `[NFR-11]` Write seed: built-in workspace templates
  - **File**: `services/core-api/prisma/seed/003-built-in-templates.ts`
  - **Type**: Create new file
  - **Description**: Seeds 3 built-in templates per tenant (`is_builtin = true`): "Team", "Department", "Project". Each defines name, description, default member roles, and child workspace structure per spec DR-03.
  - **Spec Reference**: Plan §6.1 (Migrations), spec §4.4 DR-03
  - **Dependencies**: Task 2.2
  - **Estimated**: `[S]` ~30 min

- [ ] **2.4** `[FR-020]` Write seed: default tenant branding
  - **File**: `services/core-api/prisma/seed/003-default-branding.ts`
  - **Type**: Create new file
  - **Description**: Seeds 1 `tenant_branding` row per tenant with defaults: no logo, `primary_color = '#6366F1'`, `dark_mode = false`.
  - **Spec Reference**: Plan §6.1 (Migrations), spec FR-020
  - **Dependencies**: Task 2.2
  - **Estimated**: `[S]` ~15 min

- [ ] **2.5** `[FR-008]` `[FR-020]` Extend tenant provisioning
  - **File**: `services/core-api/src/modules/tenant/tenant-provisioning.ts`
  - **Type**: Modify existing
  - **Description**: Extend `provisionTenant()` to seed built-in templates and default branding for newly created tenants. Call `003-built-in-templates.ts` and `003-default-branding.ts` after `prisma migrate deploy`.
  - **Spec Reference**: Plan §3.3, §6.2
  - **Dependencies**: Tasks 2.3, 2.4
  - **Estimated**: `[S]` ~25 min

---

## Phase 3: ABAC Engine & Audit Log Writer

> These cross-cutting services must exist before any business module.

- [ ] **3.1** `[FR-013]` `[FR-014]` `[FR-018]` `[FR-023]` `[FR-024]` Define ABAC types
  - **File**: `services/core-api/src/modules/abac/types.ts`
  - **Type**: Create new file
  - **Description**: TypeScript interfaces: `AbacContext { userId, workspaceId, tenantSlug, action, pluginActionKey? }`, `AbacDecision { allowed, reason, matchedRule? }`, `PolicyRule { action, requiredRole }`. Matches plan §5.1.8.
  - **Spec Reference**: Plan §5.1.8, spec §4.4 DR-04
  - **Dependencies**: Phase 2 complete
  - **Estimated**: `[S]` ~20 min

- [ ] **3.2** `[FR-013]` `[FR-014]` `[FR-018]` `[FR-023]` `[FR-024]` Define ABAC policies (action matrix)
  - **File**: `services/core-api/src/modules/abac/policies.ts`
  - **Type**: Create new file
  - **Description**: Static registry of all 22 core actions from spec DR-04 action matrix (e.g., `workspace:read`, `workspace:create`, `member:invite`, `branding:update`, etc.) with their minimum required role per action. Includes plugin action resolution via `workspace_role_action` table lookup.
  - **Spec Reference**: Plan §5.1.8, spec §4.4 DR-04
  - **Dependencies**: Task 3.1
  - **Estimated**: `[M]` ~45 min

- [ ] **3.3** `[FR-013]` `[FR-014]` `[FR-015]` `[FR-018]` `[NFR-01]` `[NFR-06]` Implement ABAC engine
  - **File**: `services/core-api/src/modules/abac/engine.ts`
  - **Type**: Create new file
  - **Description**: Core ABAC evaluation engine. Exports `evaluate(ctx: AbacContext, tenantDb: PrismaClient, redis: Redis): Promise<AbacDecision>`. Checks: (1) tenant admin implicit bypass, (2) workspace membership lookup, (3) role ≥ required, (4) plugin action override from `workspace_role_action`. Redis cache key: `abac:{tenantSlug}:{userId}:{workspaceId}` with TTL from config. Must evaluate in < 50ms P95 (NFR-01).
  - **Spec Reference**: Plan §5.1.8, ADR-003
  - **Dependencies**: Tasks 3.1, 3.2
  - **Estimated**: `[L]` ~3 hrs

- [ ] **3.4** `[FR-015]` `[NFR-08]` Implement ABAC decision logger
  - **File**: `services/core-api/src/modules/abac/decision-logger.ts`
  - **Type**: Create new file
  - **Description**: Writes ABAC decisions to `abac_decision_log` table. Fire-and-forget: never blocks request. Respects `ABAC_DECISION_LOG_SAMPLE_RATE` config. Exports `logDecision(tenantDb, ctx, decision)`. Failures logged to Pino only.
  - **Spec Reference**: Plan §5.1.8, spec §4.4 DR-09, AC-07
  - **Dependencies**: Task 3.3
  - **Estimated**: `[S]` ~25 min

- [ ] **3.5** `[FR-013]` `[FR-014]` `[FR-018]` Implement ABAC middleware
  - **File**: `services/core-api/src/middleware/abac.ts`
  - **Type**: Create new file
  - **Description**: Fastify `preHandler` hook for workspace-scoped routes. Extracts `workspaceId` from route params, calls `evaluate()`, throws `403 FORBIDDEN` if denied, calls `logDecision()`. Exports `requireAbac(action: string)` factory. Invalidates Redis cache on member add/remove/role-change events.
  - **Spec Reference**: Plan §5.1.9, §11.3
  - **Dependencies**: Tasks 3.3, 3.4
  - **Estimated**: `[M]` ~60 min

- [ ] **3.6** `[FR-021]` `[NFR-03]` `[NFR-08]` Implement audit log writer
  - **File**: `services/core-api/src/modules/audit-log/writer.ts`
  - **Type**: Create new file
  - **Description**: Fire-and-forget audit log writer. Exports `writeAuditLog(tenantDb, entry: AuditLogEntry)`. Must never block the primary operation — uses `Promise.catch()` to swallow errors (logged to Pino). All business modules call this.
  - **Spec Reference**: Plan §5.1.7, §11.3, spec §4.4 DR-08
  - **Dependencies**: Phase 2 complete
  - **Estimated**: `[S]` ~20 min

- [ ] **3.7** `[FR-021]` Define audit log action types
  - **File**: `services/core-api/src/modules/audit-log/action-types.ts`
  - **Type**: Create new file
  - **Description**: Static registry of all audit action type strings with human-readable labels. E.g., `workspace.create`, `workspace.delete`, `user.invite`, `member.add`, `settings.update`, `branding.update`, `auth.configure`. Used by query routes and UI filter.
  - **Spec Reference**: Plan §5.1.7, spec §4.4 DR-08
  - **Dependencies**: None
  - **Estimated**: `[S]` ~20 min

- [ ] **3.8** `[FR-013]` `[FR-014]` `[FR-015]` `[FR-021]` Define shared domain types
  - **File**: `services/core-api/src/modules/audit-log/types.ts`
  - **Type**: Create new file
  - **Description**: `AuditLogEntry`, `AuditLogDto`, `AuditLogFilters` interfaces. Also create `services/core-api/src/modules/abac/types.ts` already in task 3.1.
  - **Spec Reference**: Plan §5.1.7, §5.1.8
  - **Dependencies**: None
  - **Estimated**: `[S]` ~15 min

---

## Phase 4: Workspace Module (Backend)

- [ ] **4.1** `[FR-001]` `[FR-002]` `[FR-003]` `[FR-004]` `[FR-006]` `[FR-007]` `[FR-008]` `[FR-009]` Define workspace types & Zod schemas
  - **File**: `services/core-api/src/modules/workspace/types.ts`, `services/core-api/src/modules/workspace/schema.ts`
  - **Type**: Create new files
  - **Description**: Types: `WorkspaceDto`, `WorkspaceDetailDto`, `WorkspaceTreeNode`, `WorkspaceMemberDto`, `WorkspaceTemplateDto`, `CreateWorkspaceInput`, `UpdateWorkspaceInput`, `ReparentInput`, `ArchiveResult`, `RestoreResult`. Zod schemas for all request bodies. Validate `name` (1-255), `slug` pattern, `parentId` (UUID optional).
  - **Spec Reference**: Plan §5.1.1, §3.4
  - **Dependencies**: Phase 3 complete
  - **Estimated**: `[M]` ~45 min

- [ ] **4.2** `[FR-001]` `[FR-002]` `[FR-003]` `[FR-004]` `[FR-007]` `[FR-008]` `[FR-009]` Implement workspace repository
  - **File**: `services/core-api/src/modules/workspace/repository.ts`
  - **Type**: Create new file
  - **Description**: Prisma queries: `findWorkspacesByUser()`, `findWorkspaceById()`, `findDescendants(materializedPath)`, `updateMaterializedPaths()`, `findTemplates()`, `findTemplateById()`, `createTemplate()`. All scoped to tenant schema via `tenantDb` client. Include GIN/B-tree index-aware queries.
  - **Spec Reference**: Plan §5.1.1
  - **Dependencies**: Task 4.1
  - **Estimated**: `[M]` ~90 min

- [ ] **4.3** `[FR-001]` `[FR-002]` `[FR-003]` `[FR-004]` `[FR-007]` `[FR-008]` `[FR-009]` `[NFR-02]` `[NFR-05]` `[NFR-10]` `[NFR-11]` Implement workspace service
  - **File**: `services/core-api/src/modules/workspace/service.ts`
  - **Type**: Create new file
  - **Description**: Business logic: `listWorkspaces()`, `createWorkspace()` (template instantiation), `getWorkspace()`, `updateWorkspace()` (optimistic locking via version), `archiveWorkspace()` (cascades to children, sets archived_at), `restoreWorkspace()` (within 30-day window), `reparentWorkspace()` (cycle detection, depth ≤ 10, path recalculation in transaction), `getWorkspaceHierarchy()`. Calls audit log writer and ABAC cache invalidation.
  - **Spec Reference**: Plan §5.1.1, spec §4.4 DR-01, DR-02, DR-03, NFR-10
  - **Dependencies**: Tasks 4.2, 3.6
  - **Estimated**: `[L]` ~4 hrs

- [ ] **4.4** `[FR-001]` `[FR-002]` `[FR-003]` `[FR-004]` `[FR-006]` `[FR-007]` `[FR-008]` `[FR-009]` Implement workspace routes
  - **File**: `services/core-api/src/modules/workspace/routes.ts`
  - **Type**: Create new file
  - **Description**: Register 11 Fastify routes: `GET /api/v1/workspaces`, `POST /api/v1/workspaces`, `GET /api/v1/workspaces/:id`, `PATCH /api/v1/workspaces/:id`, `DELETE /api/v1/workspaces/:id`, `POST /api/v1/workspaces/:id/restore`, `POST /api/v1/workspaces/:id/reparent`, `GET /api/v1/workspaces/:id/hierarchy`, plus template routes. Apply auth + ABAC middleware per plan §4.1.
  - **Spec Reference**: Plan §4.1
  - **Dependencies**: Task 4.3, Task 3.5
  - **Estimated**: `[M]` ~90 min

---

## Phase 5: Workspace Member Module (Backend)

- [ ] **5.1** `[FR-005]` `[FR-012]` Define workspace-member types & schemas
  - **File**: `services/core-api/src/modules/workspace-member/types.ts`, `services/core-api/src/modules/workspace-member/schema.ts`
  - **Type**: Create new files
  - **Description**: Types: `WorkspaceMemberDto`. Zod schemas: `AddMemberSchema` (userId UUID, role enum: admin/member/viewer), `ChangeMemberRoleSchema`. Enforce role CHECK constraint values.
  - **Spec Reference**: Plan §5.1.2, spec §4.4 DR-04, ID-009
  - **Dependencies**: Phase 3 complete
  - **Estimated**: `[S]` ~25 min

- [ ] **5.2** `[FR-005]` `[FR-012]` Implement workspace-member repository
  - **File**: `services/core-api/src/modules/workspace-member/repository.ts`
  - **Type**: Create new file
  - **Description**: Prisma queries: `findMembers(workspaceId, filters)`, `findMember(workspaceId, userId)`, `addMember()`, `removeMember()`, `changeMemberRole()`. All scoped to tenant schema.
  - **Spec Reference**: Plan §5.1.2
  - **Dependencies**: Task 5.1
  - **Estimated**: `[S]` ~30 min

- [ ] **5.3** `[FR-005]` `[FR-012]` `[FR-013]` Implement workspace-member service
  - **File**: `services/core-api/src/modules/workspace-member/service.ts`
  - **Type**: Create new file
  - **Description**: `listMembers()`, `addMember()` (duplicate check, ABAC cache invalidation), `removeMember()` (ABAC cache invalidation), `changeMemberRole()` (ABAC cache invalidation). All call audit log writer. Exported `addMember()` is also called by invitation accept flow.
  - **Spec Reference**: Plan §5.1.2, §11.3
  - **Dependencies**: Tasks 5.2, 3.6, 3.5
  - **Estimated**: `[M]` ~60 min

- [ ] **5.4** `[FR-005]` `[FR-012]` Implement workspace-member routes
  - **File**: `services/core-api/src/modules/workspace-member/routes.ts`
  - **Type**: Create new file
  - **Description**: 4 routes: `GET /api/v1/workspaces/:id/members`, `POST /api/v1/workspaces/:id/members`, `DELETE /api/v1/workspaces/:id/members/:userId`, `PATCH /api/v1/workspaces/:id/members/:userId`. Apply ABAC middleware (`member:list`, `member:invite`, `member:remove`, `member:role-change`).
  - **Spec Reference**: Plan §4.1
  - **Dependencies**: Task 5.3
  - **Estimated**: `[M]` ~45 min

---

## Phase 6: Invitation Module (Backend)

- [ ] **6.1** `[FR-011]` `[NFR-04]` `[NFR-13]` Define invitation types & schemas
  - **File**: `services/core-api/src/modules/invitation/types.ts`, `services/core-api/src/modules/invitation/schema.ts`
  - **Type**: Create new files
  - **Description**: Types: `InvitationDto`. Zod schemas: `CreateInvitationSchema` (email, workspaceId, role), `AcceptInvitationSchema` (token). Email must be valid format. Expiry: `created_at + 7 days`.
  - **Spec Reference**: Plan §5.1.3, spec §4.4 DR-05, NFR-13
  - **Dependencies**: Phase 3 complete
  - **Estimated**: `[S]` ~20 min

- [ ] **6.2** `[FR-011]` Implement invitation repository
  - **File**: `services/core-api/src/modules/invitation/repository.ts`
  - **Type**: Create new file
  - **Description**: Prisma queries: `createInvitation()`, `findInvitationByToken()`, `findInvitationsByWorkspace()`, `markAccepted()`, `markExpired()`. Scoped to tenant schema.
  - **Spec Reference**: Plan §5.1.3
  - **Dependencies**: Task 6.1
  - **Estimated**: `[S]` ~25 min

- [ ] **6.3** `[FR-011]` `[FR-012]` `[NFR-04]` `[NFR-13]` Implement invitation service
  - **File**: `services/core-api/src/modules/invitation/service.ts`
  - **Type**: Create new file
  - **Description**: `createInvitation()` (check existing user → add as member OR generate token + send email), `resendInvitation()`, `acceptInvitation()` (orchestration: create KC user → create user_profile → `workspace-member.addMember()` → mark accepted; KC creation is non-transactional — compensating delete on DB failure), `listInvitations()`. Uses `email.ts`, `keycloak-admin.ts`, `crypto.ts`.
  - **Spec Reference**: Plan §5.1.3, §11.2, spec §4.4 DR-05
  - **Dependencies**: Tasks 6.2, 5.3, 1.1, 1.5, 1.6
  - **Estimated**: `[L]` ~3 hrs

- [ ] **6.4** `[FR-011]` `[FR-012]` Implement invitation routes
  - **File**: `services/core-api/src/modules/invitation/routes.ts`
  - **Type**: Create new file
  - **Description**: 4 routes: `GET /api/v1/workspaces/:id/invitations`, `POST /api/v1/users/invite`, `POST /api/v1/invitations/:id/resend`, `POST /api/v1/invitations/:token/accept` (public endpoint, no auth). Apply ABAC for list/resend (`invitation:list`, `invitation:resend`).
  - **Spec Reference**: Plan §4.2
  - **Dependencies**: Task 6.3
  - **Estimated**: `[M]` ~45 min

---

## Phase 7: User Management Module (Backend)

- [ ] **7.1** `[FR-010]` `[FR-016]` `[FR-025]` `[FR-026]` `[NFR-12]` Define user-management types & schemas
  - **File**: `services/core-api/src/modules/user-management/types.ts`, `services/core-api/src/modules/user-management/schema.ts`
  - **Type**: Create new files
  - **Description**: Types: `TenantUserDto`, `UserWorkspacesDto`, `RoleDto`, `ActionMatrixRow`. Zod schemas: `RemoveUserSchema` (reassignToUserId? UUID), `UserListFiltersSchema`.
  - **Spec Reference**: Plan §5.1.4, spec §4.4 DR-04, DR-06
  - **Dependencies**: Phase 3 complete
  - **Estimated**: `[S]` ~25 min

- [ ] **7.2** `[FR-010]` `[FR-016]` `[FR-025]` Implement user-management repository
  - **File**: `services/core-api/src/modules/user-management/repository.ts`
  - **Type**: Create new file
  - **Description**: Prisma queries: `findTenantUsers(filters)`, `findUserById()`, `findUserWorkspaces(userId)`, `findUserMemberships(userId)`, `reassignWorkspaceContent(fromUserId, toUserId, workspaceIds)`.
  - **Spec Reference**: Plan §5.1.4
  - **Dependencies**: Task 7.1
  - **Estimated**: `[M]` ~45 min

- [ ] **7.3** `[FR-010]` `[FR-016]` `[FR-018]` `[NFR-12]` Implement user-management service
  - **File**: `services/core-api/src/modules/user-management/service.ts`
  - **Type**: Create new file
  - **Description**: `listTenantUsers()`, `getUserWorkspaces()`, `removeUser()` (per-workspace reassignment, remove all memberships, disable in KC, terminate sessions, soft-delete profile with 90-day retention; DB ops in transaction, KC ops after commit — log KC failures for manual remediation), `listRoles()`, `getActionMatrix()`.
  - **Spec Reference**: Plan §5.1.4, §11.2, spec §4.4 DR-06
  - **Dependencies**: Tasks 7.2, 1.6, 3.6
  - **Estimated**: `[L]` ~3 hrs

- [ ] **7.4** `[FR-010]` `[FR-016]` `[FR-025]` `[FR-026]` Implement user-management routes
  - **File**: `services/core-api/src/modules/user-management/routes.ts`
  - **Type**: Create new file
  - **Description**: 4 routes: `GET /api/v1/users`, `DELETE /api/v1/users/:id`, `GET /api/v1/users/:id/workspaces`, `GET /api/v1/roles`, `GET /api/v1/roles/action-matrix`. Apply ABAC checks for admin-only operations.
  - **Spec Reference**: Plan §4.2
  - **Dependencies**: Task 7.3
  - **Estimated**: `[M]` ~45 min

---

## Phase 8: User Profile Module (Backend)

- [ ] **8.1** `[FR-017]` `[NFR-09]` `[NFR-12]` Define user-profile types & schemas
  - **File**: `services/core-api/src/modules/user-profile/types.ts`, `services/core-api/src/modules/user-profile/schema.ts`
  - **Type**: Create new files
  - **Description**: Types: `UserProfileDto`. Zod schemas: `UpdateProfileSchema` (displayName 1-100, timezone IANA, language ISO 639-1, notificationPreferences), avatar file validation (< 1MB, JPEG/PNG/WebP).
  - **Spec Reference**: Plan §5.1.5, spec §4.4 DR-10, NFR-09
  - **Dependencies**: Phase 3 complete
  - **Estimated**: `[S]` ~20 min

- [ ] **8.2** `[FR-017]` Implement user-profile repository
  - **File**: `services/core-api/src/modules/user-profile/repository.ts`
  - **Type**: Create new file
  - **Description**: Prisma queries: `findProfileByUserId()`, `upsertProfile()`, `updateAvatarUrl()`.
  - **Spec Reference**: Plan §5.1.5
  - **Dependencies**: Task 8.1
  - **Estimated**: `[S]` ~20 min

- [ ] **8.3** `[FR-017]` `[NFR-09]` Implement user-profile service
  - **File**: `services/core-api/src/modules/user-profile/service.ts`
  - **Type**: Create new file
  - **Description**: `getProfile()`, `updateProfile()` (sync displayName to Keycloak via `keycloak-admin.syncDisplayName()`), `uploadAvatar()` (validate size/MIME via `file-upload.ts`, upload to MinIO via `minio-client.ts`, update `avatar_url`, return presigned read URL). Calls audit log writer.
  - **Spec Reference**: Plan §5.1.5, §11.3
  - **Dependencies**: Tasks 8.2, 1.2, 1.6, 1.7, 3.6
  - **Estimated**: `[M]` ~90 min

- [ ] **8.4** `[FR-017]` Implement user-profile routes
  - **File**: `services/core-api/src/modules/user-profile/routes.ts`
  - **Type**: Create new file
  - **Description**: 3 routes: `GET /api/v1/profile`, `PATCH /api/v1/profile`, `POST /api/v1/profile/avatar` (multipart, uses `@fastify/multipart`). Auth middleware only (no ABAC — users manage own profile).
  - **Spec Reference**: Plan §4.4
  - **Dependencies**: Task 8.3
  - **Estimated**: `[S]` ~30 min

---

## Phase 9: Tenant Settings Module (Backend)

- [ ] **9.1** `[FR-019]` `[FR-020]` `[FR-022]` `[NFR-07]` Define tenant-settings types & schemas
  - **File**: `services/core-api/src/modules/tenant-settings/types.ts`, `services/core-api/src/modules/tenant-settings/schema.ts`
  - **Type**: Create new files
  - **Description**: Types: `TenantSettingsDto`, `TenantBrandingDto`, `AuthConfigDto`. Zod schemas: `UpdateSettingsSchema` (displayName; slug is read-only, DR-07), `UpdateBrandingSchema` (primaryColor hex regex `/^#[0-9A-Fa-f]{6}$/`, darkMode bool), logo file validation (< 2MB, JPEG/PNG/WebP/SVG), `UpdateAuthConfigSchema` (mfa required bool, idps list, session config).
  - **Spec Reference**: Plan §5.1.6, spec §4.4 DR-07, DR-11, NFR-07
  - **Dependencies**: Phase 3 complete
  - **Estimated**: `[S]` ~30 min

- [ ] **9.2** `[FR-019]` `[FR-020]` Implement tenant-settings repository
  - **File**: `services/core-api/src/modules/tenant-settings/repository.ts`
  - **Type**: Create new file
  - **Description**: Prisma queries against `core.tenants`, `core.tenant_configs`, and `tenant_branding` tables: `findTenantSettings()`, `updateTenantSettings()`, `findBranding()`, `upsertBranding()`, `updateLogoUrl()`.
  - **Spec Reference**: Plan §5.1.6, §3.2
  - **Dependencies**: Task 9.1
  - **Estimated**: `[S]` ~30 min

- [ ] **9.3** `[FR-019]` `[FR-020]` `[FR-022]` `[NFR-07]` Implement tenant-settings service
  - **File**: `services/core-api/src/modules/tenant-settings/service.ts`
  - **Type**: Create new file
  - **Description**: `getSettings()`, `updateSettings()`, `getBranding()`, `updateBranding()` (logo upload via MinIO if file present), `getAuthConfig()` (reads KC realm config via `keycloak-admin.getRealmConfig()`), `updateAuthConfig()` (validate before applying, lockout prevention check, KC `updateRealmConfig()`). Calls audit log writer.
  - **Spec Reference**: Plan §5.1.6, §11.2, ADR-011
  - **Dependencies**: Tasks 9.2, 1.2, 1.6, 1.7, 3.6
  - **Estimated**: `[L]` ~3 hrs

- [ ] **9.4** `[FR-019]` `[FR-020]` `[FR-022]` Implement tenant-settings routes
  - **File**: `services/core-api/src/modules/tenant-settings/routes.ts`
  - **Type**: Create new file
  - **Description**: 6 routes: `GET/PATCH /api/v1/tenant/settings`, `GET/PATCH /api/v1/tenant/branding`, `GET/PATCH /api/v1/tenant/auth-config`. PATCH branding uses multipart for logo upload. Apply ABAC (`settings:read`, `settings:update`, `branding:update`, `auth:configure`).
  - **Spec Reference**: Plan §4.3
  - **Dependencies**: Task 9.3
  - **Estimated**: `[M]` ~60 min

---

## Phase 10: Audit Log Query Module (Backend)

- [ ] **10.1** `[FR-021]` `[NFR-03]` Implement audit-log service & repository
  - **File**: `services/core-api/src/modules/audit-log/service.ts`, `services/core-api/src/modules/audit-log/repository.ts`, `services/core-api/src/modules/audit-log/schema.ts`
  - **Type**: Create new files
  - **Description**: Repository: `queryAuditLog(filters: AuditLogFilters)` — paginated query with filters (actorId, actionType, dateRange, workspaceId). Uses GIN index on metadata. Service: `getAuditLog()`, `getActionTypes()`. Must return within 500ms P95 (NFR-03). Schema: Zod for filter params.
  - **Spec Reference**: Plan §5.1.7, §4.5, spec §4.4 DR-08
  - **Dependencies**: Task 3.6, Task 3.7
  - **Estimated**: `[M]` ~60 min

- [ ] **10.2** `[FR-021]` `[NFR-03]` Implement audit-log routes
  - **File**: `services/core-api/src/modules/audit-log/routes.ts`
  - **Type**: Create new file
  - **Description**: 2 routes: `GET /api/v1/tenant/audit-log` (paginated, filterable by actor, action, date range, workspace), `GET /api/v1/tenant/audit-log/action-types`. Apply ABAC (`audit:read`).
  - **Spec Reference**: Plan §4.5
  - **Dependencies**: Task 10.1
  - **Estimated**: `[S]` ~25 min

---

## Phase 11: Route Registration & API Integration

- [ ] **11.1** `[FR-001]` `[FR-010]` `[FR-017]` `[FR-019]` `[FR-021]` Register all new module routes
  - **File**: `services/core-api/src/index.ts`
  - **Type**: Modify existing
  - **Description**: Register all 8 new module route plugins within the tenant-scoped Fastify plugin scope (after auth + tenant-context middleware). Order: workspace → workspace-member → invitation → user-management → user-profile → tenant-settings → audit-log. Register `POST /api/v1/invitations/:token/accept` as public (no auth).
  - **Spec Reference**: Plan §6.2
  - **Dependencies**: Phases 4–10 complete
  - **Estimated**: `[M]` ~45 min

---

## Phase 12: Shared UI Components (`@plexica/ui`)

> All UI component tasks can be done in parallel with each other.

- [ ] **12.1** `[FR-011]` `[FR-007]` `[FR-016]` `[NFR-14]` `[P]` Create ConfirmDialog component
  - **File**: `packages/ui/src/components/confirm-dialog.tsx`, `packages/ui/src/stories/confirm-dialog.stories.tsx`
  - **Type**: Create new files
  - **Description**: Reusable confirm dialog (warning/destructive variants) built on Radix UI Dialog. Replaces `window.confirm()` per Constitution. Props: `title`, `description`, `onConfirm`, `onCancel`, `variant`. WCAG 2.1 AA: focus trap, ESC to close, aria-labelledby.
  - **Spec Reference**: Plan §5.3.1, spec §9 UX/UI Notes
  - **Dependencies**: Phase 11 complete (parallel with other Phase 12 tasks)
  - **Estimated**: `[M]` ~60 min

- [ ] **12.2** `[FR-020]` `[FR-017]` `[NFR-07]` `[NFR-09]` `[P]` Create FileUpload component
  - **File**: `packages/ui/src/components/file-upload.tsx`, `packages/ui/src/stories/file-upload.stories.tsx`
  - **Type**: Create new files
  - **Description**: Drag-drop file upload with preview. Props: `accept` (MIME types), `maxSize` (bytes), `onFile`. Shows preview for images, error for invalid files. Accessible: keyboard drag-drop alternative, aria-live for errors. WCAG 2.1 AA.
  - **Spec Reference**: Plan §5.3.1, NFR-07, NFR-09
  - **Dependencies**: Phase 11 complete (parallel)
  - **Estimated**: `[M]` ~60 min

- [ ] **12.3** `[FR-019]` `[FR-022]` `[P]` Create ToggleSwitch component
  - **File**: `packages/ui/src/components/toggle-switch.tsx`, `packages/ui/src/stories/toggle-switch.stories.tsx`
  - **Type**: Create new files
  - **Description**: Toggle switch built on Radix UI Switch. Props: `checked`, `onCheckedChange`, `label`, `disabled`. WCAG 2.1 AA: visible focus ring, aria-checked.
  - **Spec Reference**: Plan §5.3.1
  - **Dependencies**: Phase 11 complete (parallel)
  - **Estimated**: `[S]` ~30 min

- [ ] **12.4** `[FR-021]` `[P]` Create DateRangePicker component
  - **File**: `packages/ui/src/components/date-range-picker.tsx`, `packages/ui/src/stories/date-range-picker.stories.tsx`
  - **Type**: Create new files
  - **Description**: Date range picker with calendar popover. Props: `from`, `to`, `onChange`, `maxRange` (days). Used by audit log filter. WCAG 2.1 AA: keyboard navigation, aria-label.
  - **Spec Reference**: Plan §5.3.1
  - **Dependencies**: Phase 11 complete (parallel)
  - **Estimated**: `[M]` ~60 min

- [ ] **12.5** `[FR-001]` `[FR-010]` `[FR-021]` `[P]` Create InlineFilter component
  - **File**: `packages/ui/src/components/inline-filter.tsx`, `packages/ui/src/stories/inline-filter.stories.tsx`
  - **Type**: Create new files
  - **Description**: Horizontal filter bar. Props: `filters: FilterDef[]`, `onChange`. Renders select/text/date-range sub-filters. Used by workspace list and audit log.
  - **Spec Reference**: Plan §5.3.1
  - **Dependencies**: Phase 11 complete (parallel)
  - **Estimated**: `[M]` ~45 min

- [ ] **12.6** `[FR-001]` `[FR-010]` `[FR-021]` `[P]` Create Pagination component
  - **File**: `packages/ui/src/components/pagination.tsx`, `packages/ui/src/stories/pagination.stories.tsx`
  - **Type**: Create new files
  - **Description**: Pagination controls. Props: `page`, `totalPages`, `onPageChange`. Keyboard accessible, ARIA page navigation.
  - **Spec Reference**: Plan §5.3.1
  - **Dependencies**: Phase 11 complete (parallel)
  - **Estimated**: `[S]` ~25 min

- [ ] **12.7** `[FR-012]` `[FR-025]` `[P]` Create Select component
  - **File**: `packages/ui/src/components/select.tsx`, `packages/ui/src/stories/select.stories.tsx`
  - **Type**: Create new files
  - **Description**: Select dropdown built on Radix UI Select. Props: `options`, `value`, `onChange`, `placeholder`. WCAG 2.1 AA.
  - **Spec Reference**: Plan §5.3.1
  - **Dependencies**: Phase 11 complete (parallel)
  - **Estimated**: `[S]` ~25 min

- [ ] **12.8** `[FR-012]` `[FR-010]` `[P]` Create Badge component
  - **File**: `packages/ui/src/components/badge.tsx`, `packages/ui/src/stories/badge.stories.tsx`
  - **Type**: Create new files
  - **Description**: Status/role badge. Props: `variant` (admin/member/viewer/pending/success/error), `label`. Used in member lists and invitation status.
  - **Spec Reference**: Plan §5.3.1
  - **Dependencies**: Phase 11 complete (parallel)
  - **Estimated**: `[S]` ~20 min

- [ ] **12.9** `[FR-017]` `[FR-019]` `[P]` Create Tabs component
  - **File**: `packages/ui/src/components/tabs.tsx`, `packages/ui/src/stories/tabs.stories.tsx`
  - **Type**: Create new files
  - **Description**: Tab navigation built on Radix UI Tabs. Props: `tabs: TabDef[]`, `defaultTab`. WCAG 2.1 AA: keyboard navigation, aria-tablist.
  - **Spec Reference**: Plan §5.3.1
  - **Dependencies**: Phase 11 complete (parallel)
  - **Estimated**: `[S]` ~25 min

- [ ] **12.10** `[FR-002]` `[FR-008]` `[P]` Create Textarea component
  - **File**: `packages/ui/src/components/textarea.tsx`, `packages/ui/src/stories/textarea.stories.tsx`
  - **Type**: Create new files
  - **Description**: Textarea input with label and error state. Used in workspace create/edit forms.
  - **Spec Reference**: Plan §5.3.1
  - **Dependencies**: Phase 11 complete (parallel)
  - **Estimated**: `[S]` ~15 min

- [ ] **12.11** `[FR-002]` `[FR-004]` `[P]` Create Popover component
  - **File**: `packages/ui/src/components/popover.tsx`, `packages/ui/src/stories/popover.stories.tsx`
  - **Type**: Create new files
  - **Description**: Popover built on Radix UI Popover. Used by WorkspaceSelectorDropdown.
  - **Spec Reference**: Plan §5.3.1
  - **Dependencies**: Phase 11 complete (parallel)
  - **Estimated**: `[S]` ~20 min

- [ ] **12.12** `[FR-001]` `[FR-010]` Re-export all new UI components
  - **File**: `packages/ui/src/index.ts`
  - **Type**: Modify existing
  - **Description**: Add re-exports for all 11 new components from tasks 12.1–12.11.
  - **Spec Reference**: Plan §6.2
  - **Dependencies**: Tasks 12.1–12.11
  - **Estimated**: `[S]` ~10 min

---

## Phase 13: Frontend Types, Store & API Client

> These can be built in parallel with each other and with Phase 12.

- [ ] **13.1** `[FR-001]` `[FR-002]` `[FR-004]` `[FR-008]` `[P]` Create workspace TypeScript types
  - **File**: `apps/web/src/types/workspace.ts`
  - **Type**: Create new file
  - **Description**: TypeScript interfaces matching API DTOs: `Workspace`, `WorkspaceDetail`, `WorkspaceTreeNode`, `WorkspaceMember`, `WorkspaceTemplate`, `CreateWorkspacePayload`, `UpdateWorkspacePayload`.
  - **Spec Reference**: Plan §6.1 (Frontend)
  - **Dependencies**: Phase 11 complete
  - **Estimated**: `[S]` ~20 min

- [ ] **13.2** `[FR-010]` `[FR-011]` `[FR-012]` `[FR-025]` `[FR-026]` `[P]` Create user-management TypeScript types
  - **File**: `apps/web/src/types/user-management.ts`
  - **Type**: Create new file
  - **Description**: TypeScript interfaces: `TenantUser`, `Invitation`, `Role`, `ActionMatrixRow`, `WorkspaceMembership`.
  - **Spec Reference**: Plan §6.1 (Frontend)
  - **Dependencies**: Phase 11 complete
  - **Estimated**: `[S]` ~15 min

- [ ] **13.3** `[FR-019]` `[FR-020]` `[FR-022]` `[P]` Create settings TypeScript types
  - **File**: `apps/web/src/types/settings.ts`
  - **Type**: Create new file
  - **Description**: TypeScript interfaces: `TenantSettings`, `TenantBranding`, `AuthConfig`, `IdpConfig`.
  - **Spec Reference**: Plan §6.1 (Frontend)
  - **Dependencies**: Phase 11 complete
  - **Estimated**: `[S]` ~15 min

- [ ] **13.4** `[FR-021]` `[P]` Create audit log TypeScript types
  - **File**: `apps/web/src/types/audit.ts`
  - **Type**: Create new file
  - **Description**: TypeScript interfaces: `AuditLogEntry`, `AuditLogFilters`, `AuditActionType`.
  - **Spec Reference**: Plan §6.1 (Frontend)
  - **Dependencies**: Phase 11 complete
  - **Estimated**: `[S]` ~10 min

- [ ] **13.5** `[FR-001]` `[FR-003]` `[P]` Create workspace Zustand store
  - **File**: `apps/web/src/stores/workspace-store.ts`
  - **Type**: Create new file
  - **Description**: Zustand store for workspace navigation context. State: `currentWorkspaceId: string | null`, `setCurrentWorkspace(id)`, `clearWorkspace()`. Per plan §11.4 / ID-009: orthogonal to `auth-store`. Does NOT store auth state.
  - **Spec Reference**: Plan §6.1 (Frontend), §11.4 (decision ID-009)
  - **Dependencies**: Phase 11 complete
  - **Estimated**: `[S]` ~15 min

- [ ] **13.6** `[FR-017]` `[P]` Extend auth store
  - **File**: `apps/web/src/stores/auth-store.ts`
  - **Type**: Modify existing
  - **Description**: Extend `AuthUser` type with `tenantRole: 'tenant_admin' | 'member'`. Update `auth-store.ts` to populate this field from the decoded KC token claims.
  - **Spec Reference**: Plan §6.2
  - **Dependencies**: Phase 11 complete
  - **Estimated**: `[S]` ~20 min

- [ ] **13.7** `[FR-017]` `[P]` Extend auth types
  - **File**: `apps/web/src/types/auth.ts`
  - **Type**: Modify existing
  - **Description**: Add `tenantRole` field to `AuthUser` interface to match task 13.6.
  - **Spec Reference**: Plan §6.2
  - **Dependencies**: Phase 11 complete
  - **Estimated**: `[S]` ~10 min

- [ ] **13.8** `[FR-001]` `[FR-010]` `[FR-017]` `[FR-019]` `[FR-021]` Add API client functions
  - **File**: `apps/web/src/services/api-client.ts`
  - **Type**: Modify existing
  - **Description**: Add typed API functions for all 32 new endpoints. Group by module: workspace (`listWorkspaces`, `createWorkspace`, `getWorkspace`, `updateWorkspace`, `deleteWorkspace`, `restoreWorkspace`, `reparentWorkspace`, `getHierarchy`, `listTemplates`), members (`listMembers`, `addMember`, `removeMember`, `changeMemberRole`), invitations (`listInvitations`, `sendInvite`, `resendInvite`, `acceptInvite`), users (`listUsers`, `removeUser`, `getUserWorkspaces`, `listRoles`, `getActionMatrix`), profile (`getProfile`, `updateProfile`, `uploadAvatar`), settings (`getSettings`, `updateSettings`, `getBranding`, `updateBranding`, `getAuthConfig`, `updateAuthConfig`), audit log (`getAuditLog`, `getActionTypes`).
  - **Spec Reference**: Plan §4.1–§4.6
  - **Dependencies**: Tasks 13.1–13.4
  - **Estimated**: `[L]` ~3 hrs

- [ ] **13.9** `[FR-001]` `[FR-010]` `[FR-017]` `[FR-019]` `[FR-021]` `[NFR-14]` Add i18n translation keys
  - **File**: `apps/web/src/i18n/messages.en.ts`
  - **Type**: Modify existing
  - **Description**: Add ~180 new translation keys for all new screens. Groups: workspace (create, edit, delete, restore, reparent, template, hierarchy), members (add, remove, role change), invitations (send, resend, accept), users (list, remove), roles (matrix, management), settings (general, branding, auth), profile (edit, avatar), audit log (filters, table headers, action labels).
  - **Spec Reference**: Plan §6.2, spec §9 UX/UI Notes
  - **Dependencies**: None (can start early)
  - **Estimated**: `[M]` ~90 min

---

## Phase 14: Frontend TanStack Query Hooks

> All hooks can be written in parallel once Phase 13 is complete.

- [ ] **14.1** `[FR-001]` `[FR-002]` `[FR-003]` `[FR-004]` `[FR-006]` `[FR-007]` `[FR-008]` `[FR-009]` `[P]` Create workspace hooks
  - **File**: `apps/web/src/hooks/use-workspaces.ts`, `apps/web/src/hooks/use-workspace-templates.ts`
  - **Type**: Create new files
  - **Description**: TanStack Query hooks: `useWorkspaces(filters)`, `useWorkspace(id)`, `useWorkspaceHierarchy(id)`, `useCreateWorkspace()`, `useUpdateWorkspace()`, `useDeleteWorkspace()`, `useRestoreWorkspace()`, `useReparentWorkspace()`. Template hooks: `useWorkspaceTemplates()`, `useCreateTemplate()`.
  - **Spec Reference**: Plan §5.2.1
  - **Dependencies**: Task 13.8
  - **Estimated**: `[M]` ~60 min

- [ ] **14.2** `[FR-010]` `[FR-011]` `[FR-012]` `[FR-016]` `[FR-025]` `[P]` Create user & invitation hooks
  - **File**: `apps/web/src/hooks/use-users.ts`, `apps/web/src/hooks/use-invitations.ts`, `apps/web/src/hooks/use-roles.ts`
  - **Type**: Create new files
  - **Description**: `useUsers(filters)`, `useRemoveUser()`, `useUserWorkspaces(userId)`, `useInvitations(workspaceId)`, `useSendInvite()`, `useResendInvite()`, `useRoles()`, `useActionMatrix()`.
  - **Spec Reference**: Plan §5.2.2
  - **Dependencies**: Task 13.8
  - **Estimated**: `[M]` ~60 min

- [ ] **14.3** `[FR-019]` `[FR-020]` `[FR-022]` `[P]` Create tenant settings hooks
  - **File**: `apps/web/src/hooks/use-tenant-settings.ts`, `apps/web/src/hooks/use-branding.ts`
  - **Type**: Create new files
  - **Description**: `useTenantSettings()`, `useUpdateTenantSettings()`, `useBranding()`, `useUpdateBranding()` (with live preview: applies CSS variables optimistically), `useAuthConfig()`, `useUpdateAuthConfig()`.
  - **Spec Reference**: Plan §5.2.3
  - **Dependencies**: Task 13.8
  - **Estimated**: `[M]` ~60 min

- [ ] **14.4** `[FR-017]` `[P]` Create user profile hooks
  - **File**: `apps/web/src/hooks/use-profile.ts`
  - **Type**: Create new file
  - **Description**: `useProfile()`, `useUpdateProfile()`, `useUploadAvatar()`.
  - **Spec Reference**: Plan §5.2.4
  - **Dependencies**: Task 13.8
  - **Estimated**: `[S]` ~25 min

- [ ] **14.5** `[FR-021]` `[P]` Create audit log hooks
  - **File**: `apps/web/src/hooks/use-audit-log.ts`
  - **Type**: Create new file
  - **Description**: `useAuditLog(filters)`, `useAuditActionTypes()`. Supports pagination and filter state.
  - **Spec Reference**: Plan §5.2.5
  - **Dependencies**: Task 13.8
  - **Estimated**: `[S]` ~25 min

- [ ] **14.6** `[FR-013]` `[FR-018]` `[P]` Create ABAC UI hook
  - **File**: `apps/web/src/hooks/use-abac.ts`
  - **Type**: Create new file
  - **Description**: `useAbac(workspaceId, action): boolean` — derives permission from user's role in the current workspace (from TanStack Query cache). Used for UI-level gating (hide/disable buttons). Does not replace server-side ABAC enforcement.
  - **Spec Reference**: Plan §5.2.1, spec FR-018
  - **Dependencies**: Tasks 13.5, 14.1
  - **Estimated**: `[S]` ~30 min

---

## Phase 15: Frontend Pages & Layout Components

- [ ] **15.1** `[FR-001]` `[FR-002]` `[FR-007]` `[FR-008]` `[P]` Build WorkspaceListPage
  - **File**: `apps/web/src/pages/workspace-list-page.tsx`
  - **Type**: Create new file
  - **Description**: Workspace list with hierarchical tree, search, status filter (active/archived). Calls `useWorkspaces()`. Shows "Create Workspace" button (tenant admin only via `useAbac`). Uses `WorkspaceTree` component, `InlineFilter`, `Pagination`. All strings via react-intl.
  - **Spec Reference**: Plan §5.2.1, spec FR-001, FR-002, FR-007
  - **Dependencies**: Tasks 14.1, 12.5, 12.6
  - **Estimated**: `[M]` ~90 min

- [ ] **15.2** `[FR-003]` `[FR-004]` `[FR-005]` `[P]` Build WorkspaceDetailPage
  - **File**: `apps/web/src/pages/workspace-detail-page.tsx`
  - **Type**: Create new file
  - **Description**: Workspace detail: info panel, child workspace list, members preview. Calls `useWorkspace(id)`. Shows breadcrumb path, quick actions (edit, delete with ConfirmDialog). Uses `Badge` for member roles.
  - **Spec Reference**: Plan §5.2.1, spec FR-003, FR-004, FR-005
  - **Dependencies**: Tasks 14.1, 12.1, 12.8
  - **Estimated**: `[M]` ~90 min

- [ ] **15.3** `[FR-006]` `[FR-007]` `[FR-009]` `[P]` Build WorkspaceSettingsPage
  - **File**: `apps/web/src/pages/workspace-settings-page.tsx`
  - **Type**: Create new file
  - **Description**: Workspace settings: edit name/description (react-hook-form + Zod), danger zone (delete with ConfirmDialog listing children, restore if archived). Reparent: parent selector dropdown. All actions call mutation hooks.
  - **Spec Reference**: Plan §5.2.1, spec FR-006, FR-007, FR-009, DR-01, DR-02
  - **Dependencies**: Tasks 14.1, 12.1
  - **Estimated**: `[M]` ~90 min

- [ ] **15.4** `[FR-005]` `[FR-011]` `[FR-012]` `[P]` Build WorkspaceMembersPage
  - **File**: `apps/web/src/pages/workspace-members-page.tsx`
  - **Type**: Create new file
  - **Description**: Member management: member list with role badges, add member (AddMemberDialog), remove member (ConfirmDialog), role change (Select inline). Shows pending invitations with resend option. Uses `useAbac` for action gating.
  - **Spec Reference**: Plan §5.2.2, spec FR-005, FR-011, FR-012, AC-04
  - **Dependencies**: Tasks 14.2, 12.1, 12.7, 12.8
  - **Estimated**: `[M]` ~90 min

- [ ] **15.5** `[FR-008]` `[P]` Build WorkspaceTemplatesPage
  - **File**: `apps/web/src/pages/workspace-templates-page.tsx`
  - **Type**: Create new file
  - **Description**: Template list (built-in + custom). Shows TemplateCard for each. "Create Template" button opens CreateTemplateDialog (define name, description, child structure via ChildWorkspaceEditor). Built-in templates shown as read-only.
  - **Spec Reference**: Plan §5.2.1, spec FR-008, DR-03
  - **Dependencies**: Tasks 14.1, 12.1
  - **Estimated**: `[M]` ~90 min

- [ ] **15.6** `[FR-010]` `[FR-016]` `[P]` Build UserListPage
  - **File**: `apps/web/src/pages/user-list-page.tsx`
  - **Type**: Create new file
  - **Description**: Tenant user directory: paginated user list, search, filter by role/status. RemoveUserDialog (with workspace reassignment selector). Calls `useUsers()`, `useRemoveUser()`. Admin only (check tenantRole from auth store).
  - **Spec Reference**: Plan §5.2.2, spec FR-010, FR-016, DR-06
  - **Dependencies**: Tasks 14.2, 12.1, 12.6
  - **Estimated**: `[M]` ~90 min

- [ ] **15.7** `[FR-025]` `[P]` Build RoleManagementPage
  - **File**: `apps/web/src/pages/role-management-page.tsx`
  - **Type**: Create new file
  - **Description**: Role cards for 4 roles (Tenant Admin, WS Admin, WS Member, WS Viewer) using RoleCard component. Full action matrix table (ActionMatrixTable) with ✓/✗/— icons. CSV export button. Read-only in Spec 003 (custom role creation deferred). Calls `useRoles()`, `useActionMatrix()`.
  - **Spec Reference**: Plan §5.2.2, spec FR-025, DR-04, AC-15
  - **Dependencies**: Tasks 14.2
  - **Estimated**: `[M]` ~90 min

- [ ] **15.8** `[FR-026]` `[P]` Build PermissionAssociationPage
  - **File**: `apps/web/src/pages/permission-association-page.tsx`
  - **Type**: Create new file
  - **Description**: Workspace permission association: shows PermissionAssociationPanel for a workspace. Displays member list with inline role selector. Changes applied immediately via `changeMemberRole()`. Calls `useAbac` to gate role-change controls for non-admins.
  - **Spec Reference**: Plan §5.2.2, spec FR-026, AC-16
  - **Dependencies**: Tasks 14.2, 12.7
  - **Estimated**: `[M]` ~60 min

- [ ] **15.9** `[FR-019]` `[P]` Build TenantSettingsPage
  - **File**: `apps/web/src/pages/tenant-settings-page.tsx`
  - **Type**: Create new file
  - **Description**: General settings: edit tenant display name (react-hook-form + Zod). Slug shown read-only with tooltip (DR-07). Calls `useTenantSettings()`. Admin only.
  - **Spec Reference**: Plan §5.2.3, spec FR-019, DR-07
  - **Dependencies**: Tasks 14.3
  - **Estimated**: `[M]` ~45 min

- [ ] **15.10** `[FR-020]` `[NFR-07]` `[P]` Build TenantBrandingPage
  - **File**: `apps/web/src/pages/tenant-branding-page.tsx`
  - **Type**: Create new file
  - **Description**: Logo upload (FileUpload component, < 2MB), ColorPicker for primary color, ToggleSwitch for dark mode. Live preview of color changes. Save via `useUpdateBranding()`. Calls `useBranding()`.
  - **Spec Reference**: Plan §5.2.3, spec FR-020, NFR-07
  - **Dependencies**: Tasks 14.3, 12.2, 12.3
  - **Estimated**: `[M]` ~90 min

- [ ] **15.11** `[FR-022]` `[P]` Build TenantAuthConfigPage
  - **File**: `apps/web/src/pages/tenant-auth-config-page.tsx`
  - **Type**: Create new file
  - **Description**: Auth realm configuration: MFA toggle (ToggleSwitch), IdP list (add/remove), session settings. Warns on lockout-risky changes. Calls `useAuthConfig()`, `useUpdateAuthConfig()`. Admin only.
  - **Spec Reference**: Plan §5.2.3, spec FR-022, DR-11
  - **Dependencies**: Tasks 14.3, 12.3
  - **Estimated**: `[M]` ~90 min

- [ ] **15.12** `[FR-017]` `[NFR-09]` `[P]` Build ProfilePage
  - **File**: `apps/web/src/pages/profile-page.tsx`
  - **Type**: Create new file
  - **Description**: User profile: avatar upload (FileUpload < 1MB), display name, timezone (Select), language (Select), notification preferences (ToggleSwitch per type). react-hook-form + Zod. Calls `useProfile()`, `useUpdateProfile()`, `useUploadAvatar()`.
  - **Spec Reference**: Plan §5.2.4, spec FR-017, DR-10
  - **Dependencies**: Tasks 14.4, 12.2, 12.3, 12.7
  - **Estimated**: `[M]` ~90 min

- [ ] **15.13** `[FR-021]` `[NFR-03]` `[P]` Build AuditLogPage
  - **File**: `apps/web/src/pages/audit-log-page.tsx`
  - **Type**: Create new file
  - **Description**: Audit log: paginated table with expandable rows (ExpandableRow). Filters: actor (text), action type (Select), date range (DateRangePicker), workspace (Select). Calls `useAuditLog(filters)`, `useAuditActionTypes()`. Admin only.
  - **Spec Reference**: Plan §5.2.5, spec FR-021, DR-08, AC-11
  - **Dependencies**: Tasks 14.5, 12.4, 12.5, 12.6, 12.7
  - **Estimated**: `[M]` ~90 min

---

## Phase 16: Frontend Feature Components

> Workspace and user components can be built in parallel.

- [ ] **16.1** `[FR-001]` `[FR-003]` `[FR-004]` `[P]` Create WorkspaceTree component
  - **File**: `apps/web/src/components/workspace/workspace-tree.tsx`
  - **Type**: Create new file
  - **Description**: Hierarchical tree navigation component. Renders `WorkspaceTreeNode` recursively. Supports expand/collapse, active node highlighting. Props: `nodes: WorkspaceTreeNode[]`, `activeId`, `onSelect`. WCAG 2.1 AA: tree role, keyboard navigation (arrow keys).
  - **Spec Reference**: Plan §5.2.1
  - **Dependencies**: Task 13.1
  - **Estimated**: `[M]` ~90 min

- [ ] **16.2** `[FR-003]` `[P]` Create WorkspaceSelectorDropdown component
  - **File**: `apps/web/src/components/workspace/workspace-selector-dropdown.tsx`
  - **Type**: Create new file
  - **Description**: Header workspace switcher. Uses Popover component. Shows current workspace name, dropdown with searchable workspace list. Calls `setCurrentWorkspace()` from workspace-store.
  - **Spec Reference**: Plan §5.2.1
  - **Dependencies**: Tasks 13.5, 12.11
  - **Estimated**: `[M]` ~60 min

- [ ] **16.3** `[FR-002]` `[FR-008]` `[P]` Create CreateWorkspaceDialog component
  - **File**: `apps/web/src/components/workspace/create-workspace-dialog.tsx`
  - **Type**: Create new file
  - **Description**: Dialog form: name, description (Textarea), parent workspace selector, template selector. react-hook-form + Zod. Calls `useCreateWorkspace()`. Confirms success with toast.
  - **Spec Reference**: Plan §5.2.1
  - **Dependencies**: Tasks 14.1, 12.10
  - **Estimated**: `[M]` ~60 min

- [ ] **16.4** `[FR-008]` `[P]` Create TemplateCard & template sub-components
  - **File**: `apps/web/src/components/workspace/template-card.tsx`, `apps/web/src/components/workspace/child-workspace-editor.tsx`, `apps/web/src/components/workspace/create-template-dialog.tsx`
  - **Type**: Create new files
  - **Description**: TemplateCard: displays template name, description, child count, built-in badge. ChildWorkspaceEditor: add/remove/edit child workspaces in template structure. CreateTemplateDialog: form to create/edit custom template.
  - **Spec Reference**: Plan §5.2.1, spec DR-03
  - **Dependencies**: Tasks 14.1, 12.1, 12.10
  - **Estimated**: `[M]` ~90 min

- [ ] **16.5** `[FR-011]` `[FR-012]` `[P]` Create AddMemberDialog component
  - **File**: `apps/web/src/components/user/add-member-dialog.tsx`
  - **Type**: Create new file
  - **Description**: Add member with search/invite. Step 1: autocomplete search of existing tenant users. If found → add directly. Step 2: email input for new users → sends invite. Role selector (Select). Calls `useUsers()` for search, `useSendInvite()` for new users.
  - **Spec Reference**: Plan §5.2.2, spec DR-05
  - **Dependencies**: Tasks 14.2, 12.7
  - **Estimated**: `[M]` ~90 min

- [ ] **16.6** `[FR-016]` `[P]` Create RemoveUserDialog component
  - **File**: `apps/web/src/components/user/remove-user-dialog.tsx`
  - **Type**: Create new file
  - **Description**: User removal dialog. Shows list of workspaces where user has content. For each workspace, reassignment target selector. Confirms with ConfirmDialog (destructive). Calls `useRemoveUser()`.
  - **Spec Reference**: Plan §5.2.2, spec DR-06
  - **Dependencies**: Tasks 14.2, 12.1
  - **Estimated**: `[M]` ~60 min

- [ ] **16.7** `[FR-025]` `[P]` Create RoleCard & ActionMatrixTable components
  - **File**: `apps/web/src/components/user/role-card.tsx`, `apps/web/src/components/user/action-matrix-table.tsx`
  - **Type**: Create new files
  - **Description**: RoleCard: displays role name, scope, description, action count. ActionMatrixTable: renders full 22-action × 4-role matrix with ✓/✗/— icons, sticky header, CSV export. WCAG 2.1 AA: table headers, scope attributes.
  - **Spec Reference**: Plan §5.2.2, spec FR-025, DR-04, AC-15
  - **Dependencies**: Tasks 14.2
  - **Estimated**: `[M]` ~90 min

- [ ] **16.8** `[FR-026]` `[P]` Create PermissionAssociationPanel component
  - **File**: `apps/web/src/components/user/permission-association-panel.tsx`
  - **Type**: Create new file
  - **Description**: Composite panel: header with workspace name, member list with inline role selector (Select), pending invitations section. Changes call `changeMemberRole()` mutation directly.
  - **Spec Reference**: Plan §5.2.2, spec FR-026, AC-16
  - **Dependencies**: Tasks 14.2, 12.7
  - **Estimated**: `[M]` ~60 min

- [ ] **16.9** `[FR-020]` `[P]` Create ColorPicker component
  - **File**: `apps/web/src/components/settings/color-picker.tsx`
  - **Type**: Create new file
  - **Description**: Color picker wrapping `react-colorful`. Props: `value` (hex), `onChange`. Includes hex text input for manual entry. Validates hex format via Zod.
  - **Spec Reference**: Plan §5.2.3
  - **Dependencies**: None
  - **Estimated**: `[S]` ~30 min

- [ ] **16.10** `[FR-021]` `[P]` Create ExpandableRow component
  - **File**: `apps/web/src/components/audit/expandable-row.tsx`
  - **Type**: Create new file
  - **Description**: Expandable audit log table row. Collapsed: actor, action, timestamp. Expanded: full `metadata` JSON, workspace, IP. Keyboard accessible toggle.
  - **Spec Reference**: Plan §5.2.5
  - **Dependencies**: Task 13.4
  - **Estimated**: `[S]` ~30 min

---

## Phase 17: Frontend Routing & Layout Integration

- [ ] **17.1** `[FR-001]` `[FR-010]` `[FR-017]` `[FR-019]` `[FR-021]` Add new TanStack Router routes
  - **File**: `apps/web/src/router.tsx`
  - **Type**: Modify existing
  - **Description**: Add 13 new route definitions under `shellRoute` (requires auth + tenant context): `/workspaces` (WorkspaceListPage), `/workspaces/:id` (WorkspaceDetailPage), `/workspaces/:id/settings` (WorkspaceSettingsPage), `/workspaces/:id/members` (WorkspaceMembersPage), `/workspaces/templates` (WorkspaceTemplatesPage), `/users` (UserListPage), `/users/roles` (RoleManagementPage), `/workspaces/:id/permissions` (PermissionAssociationPage), `/settings` (TenantSettingsPage), `/settings/branding` (TenantBrandingPage), `/settings/auth` (TenantAuthConfigPage), `/profile` (ProfilePage), `/audit-log` (AuditLogPage).
  - **Spec Reference**: Plan §5.2.7
  - **Dependencies**: Phase 15 complete, Phase 16 complete
  - **Estimated**: `[M]` ~60 min

- [ ] **17.2** `[FR-003]` Update header layout
  - **File**: `apps/web/src/components/layout/header.tsx`
  - **Type**: Modify existing
  - **Description**: Add `WorkspaceSelectorDropdown` to header (left of user menu). Shows current workspace or "Select Workspace" placeholder.
  - **Spec Reference**: Plan §6.2, spec §9 UX/UI Notes
  - **Dependencies**: Task 16.2, Task 17.1
  - **Estimated**: `[S]` ~20 min

- [ ] **17.3** `[FR-001]` `[FR-010]` `[FR-019]` `[FR-021]` Update sidebar layout
  - **File**: `apps/web/src/components/layout/sidebar.tsx`
  - **Type**: Modify existing
  - **Description**: Add nav items: Workspaces, Users, Roles & Permissions, Settings (with sub-items: General, Branding, Auth), Audit Log, Profile. Respect role-based visibility (admin-only items hidden for members via auth store).
  - **Spec Reference**: Plan §6.2, spec §9 UX/UI Notes
  - **Dependencies**: Task 17.1
  - **Estimated**: `[M]` ~45 min

---

## Phase 18: Integration Tests (Vitest)

> All integration test files can be written in parallel.

- [ ] **18.1** `[FR-001]` `[FR-002]` `[FR-004]` `[FR-007]` `[FR-008]` `[FR-009]` `[NFR-02]` `[NFR-05]` `[NFR-10]` `[NFR-11]` `[P]` Write workspace integration tests
  - **File**: `services/core-api/src/__tests__/workspace.test.ts`
  - **Type**: Create new file
  - **Description**: Cover INT-01: CRUD operations, hierarchy creation, soft-delete cascades to children, restore within 30 days, restore rejection after 30 days, reparent with cycle detection, reparent depth limit enforcement, template instantiation. Real Keycloak + DB. Tests from plan §8.2 INT-01.
  - **Spec Reference**: Plan §8.2 INT-01, AC-01, AC-02, AC-03
  - **Dependencies**: Phase 17 complete
  - **Estimated**: `[L]` ~3 hrs

- [ ] **18.2** `[FR-005]` `[FR-012]` `[FR-013]` `[P]` Write workspace-member integration tests
  - **File**: `services/core-api/src/__tests__/workspace-members.test.ts`
  - **Type**: Create new file
  - **Description**: Cover INT-02: member add/remove/role-change, duplicate member rejection, ABAC cache invalidation on role change. Plan §8.2 INT-02.
  - **Spec Reference**: Plan §8.2 INT-02, AC-05
  - **Dependencies**: Phase 17 complete
  - **Estimated**: `[M]` ~90 min

- [ ] **18.3** `[FR-011]` `[NFR-04]` `[NFR-13]` `[P]` Write invitation integration tests
  - **File**: `services/core-api/src/__tests__/invitation.test.ts`
  - **Type**: Create new file
  - **Description**: Cover INT-03: invite new user (email sent), invite existing user (direct add), accept invitation (creates KC user, profile, member), expired token rejection, resend. Uses Mailpit for email assertion. Plan §8.2 INT-03.
  - **Spec Reference**: Plan §8.2 INT-03, AC-04
  - **Dependencies**: Phase 17 complete
  - **Estimated**: `[M]` ~90 min

- [ ] **18.4** `[FR-010]` `[FR-016]` `[NFR-12]` `[P]` Write user-management integration tests
  - **File**: `services/core-api/src/__tests__/user-management.test.ts`
  - **Type**: Create new file
  - **Description**: Cover INT-04: user list (pagination, filter), remove user with reassignment, KC user disabled after removal, 90-day profile soft-delete. Plan §8.2 INT-04.
  - **Spec Reference**: Plan §8.2 INT-04, AC-08
  - **Dependencies**: Phase 17 complete
  - **Estimated**: `[M]` ~90 min

- [ ] **18.5** `[FR-017]` `[NFR-09]` `[P]` Write user-profile integration tests
  - **File**: `services/core-api/src/__tests__/user-profile.test.ts`
  - **Type**: Create new file
  - **Description**: Cover INT-05: profile GET/PATCH, avatar upload (< 1MB accepted, > 1MB rejected, invalid MIME rejected), KC displayName sync. Plan §8.2 INT-05.
  - **Spec Reference**: Plan §8.2 INT-05, AC-13
  - **Dependencies**: Phase 17 complete
  - **Estimated**: `[M]` ~60 min

- [ ] **18.6** `[FR-019]` `[FR-020]` `[FR-022]` `[NFR-07]` `[P]` Write tenant-settings integration tests
  - **File**: `services/core-api/src/__tests__/tenant-settings.test.ts`
  - **Type**: Create new file
  - **Description**: Cover INT-06: settings update, slug immutability check (PATCH slug → rejected), branding update (logo upload, color validation), auth config update (KC realm updated). Plan §8.2 INT-06.
  - **Spec Reference**: Plan §8.2 INT-06, AC-09, AC-10, AC-12
  - **Dependencies**: Phase 17 complete
  - **Estimated**: `[M]` ~90 min

- [ ] **18.7** `[FR-021]` `[NFR-03]` `[P]` Write audit-log integration tests
  - **File**: `services/core-api/src/__tests__/audit-log.test.ts`
  - **Type**: Create new file
  - **Description**: Cover INT-07: query with various filters (actor, action, date range, workspace), pagination, action types endpoint. Verify entries are written by other modules. Plan §8.2 INT-07.
  - **Spec Reference**: Plan §8.2 INT-07, AC-11
  - **Dependencies**: Phase 17 complete
  - **Estimated**: `[M]` ~60 min

- [ ] **18.8** `[FR-013]` `[FR-014]` `[FR-015]` `[FR-023]` `[FR-024]` `[NFR-01]` `[NFR-06]` `[P]` Write ABAC engine integration tests
  - **File**: `services/core-api/src/__tests__/abac.test.ts`
  - **Type**: Create new file
  - **Description**: Cover INT-08: tenant admin bypass, workspace member role evaluation for all 22 actions, plugin action override via `workspace_role_action`, Redis cache hit (< 50ms), cache invalidation on role change, decision log written for sampled evaluations. Plan §8.2 INT-08.
  - **Spec Reference**: Plan §8.2 INT-08, AC-05, AC-07, NFR-01
  - **Dependencies**: Phase 17 complete
  - **Estimated**: `[L]` ~3 hrs

- [ ] **18.9** `[FR-013]` `[FR-018]` `[P]` Write ABAC workspace isolation integration tests
  - **File**: `services/core-api/src/__tests__/abac-workspace-isolation.test.ts`
  - **Type**: Create new file
  - **Description**: Cover INT-09: user A in workspace 1 cannot access workspace 2 (403), viewer cannot create (403), member cannot manage users (403), admin succeeds all. Plan §8.2 INT-09.
  - **Spec Reference**: Plan §8.2 INT-09, AC-05, AC-06
  - **Dependencies**: Phase 17 complete
  - **Estimated**: `[M]` ~90 min

---

## Phase 19: Unit Tests (Vitest)

> All unit test files can be written in parallel.

- [ ] **19.1** `[FR-004]` `[FR-009]` `[NFR-05]` `[P]` Write workspace service unit tests
  - **File**: `services/core-api/src/__tests__/unit/workspace-service.test.ts`
  - **Type**: Create new file
  - **Description**: Pure logic tests: materialized path calculation, cycle detection algorithm, depth limit enforcement, slug generation from various name inputs, template instantiation logic.
  - **Spec Reference**: Plan §8.3, spec DR-02
  - **Dependencies**: Phase 4 complete
  - **Estimated**: `[M]` ~60 min

- [ ] **19.2** `[FR-013]` `[FR-014]` `[FR-018]` `[NFR-01]` `[P]` Write ABAC engine unit tests
  - **File**: `services/core-api/src/__tests__/unit/abac-engine.test.ts`
  - **Type**: Create new file
  - **Description**: Pure logic: policy evaluation for each action × role combination (all 22 × 4 = 88 cases), tenant admin bypass, plugin action override resolution, sample rate logic.
  - **Spec Reference**: Plan §8.3, spec DR-04
  - **Dependencies**: Phase 3 complete
  - **Estimated**: `[M]` ~90 min

- [ ] **19.3** `[FR-011]` `[NFR-13]` `[P]` Write invitation service unit tests
  - **File**: `services/core-api/src/__tests__/unit/invitation-service.test.ts`
  - **Type**: Create new file
  - **Description**: Token generation entropy check, expiry calculation (7 days), email template rendering.
  - **Spec Reference**: Plan §8.3, spec DR-05
  - **Dependencies**: Phase 6 complete
  - **Estimated**: `[S]` ~30 min

- [ ] **19.4** `[FR-020]` `[FR-017]` `[NFR-07]` `[NFR-09]` `[P]` Write file-upload validation unit tests
  - **File**: `services/core-api/src/__tests__/unit/file-upload.test.ts`
  - **Type**: Create new file
  - **Description**: Size limit enforcement (boundary: exactly 1MB accepted, 1MB+1byte rejected), MIME type allowlist/blocklist.
  - **Spec Reference**: Plan §8.3, spec NFR-07, NFR-09
  - **Dependencies**: Task 1.2
  - **Estimated**: `[S]` ~25 min

- [ ] **19.5** `[FR-019]` `[P]` Write Zod schema validation unit tests
  - **File**: `services/core-api/src/__tests__/unit/validation-schemas.test.ts`
  - **Type**: Create new file
  - **Description**: Test all Zod schema edge cases: slug regex (valid/invalid), hex color validation, IANA timezone strings, ISO 639-1 codes, workspace name length bounds.
  - **Spec Reference**: Plan §8.3, §3.4
  - **Dependencies**: Phases 4–9 complete
  - **Estimated**: `[M]` ~45 min

---

## Phase 20: E2E Tests (Playwright)

> E2E tests run against full stack. All can be written in parallel after Phase 17.

- [ ] **20.1** `[FR-001]` `[FR-002]` `[FR-003]` `[FR-006]` `[FR-007]` `[P]` Write workspace CRUD E2E tests
  - **File**: `apps/web/e2e/workspace-crud.spec.ts`
  - **Type**: Create new file
  - **Description**: E2E-01: create workspace (appears in list), open detail, update name, soft-delete (no longer in list, children archived), restore within 30 days. Full browser → API → DB flow. Spec §8.1 E2E-01.
  - **Spec Reference**: Plan §8.1 E2E-01, AC-01
  - **Dependencies**: Phase 17 complete
  - **Estimated**: `[L]` ~2.5 hrs

- [ ] **20.2** `[FR-004]` `[FR-009]` `[NFR-05]` `[P]` Write workspace hierarchy E2E tests
  - **File**: `apps/web/e2e/workspace-hierarchy.spec.ts`
  - **Type**: Create new file
  - **Description**: E2E-02: create parent → child → grandchild, verify tree navigation, reparent (move child to root), depth limit rejection at level 11. Spec §8.1 E2E-02.
  - **Spec Reference**: Plan §8.1 E2E-02, AC-02
  - **Dependencies**: Phase 17 complete
  - **Estimated**: `[M]` ~90 min

- [ ] **20.3** `[FR-005]` `[FR-012]` `[P]` Write workspace members E2E tests
  - **File**: `apps/web/e2e/workspace-members.spec.ts`
  - **Type**: Create new file
  - **Description**: E2E-03: add member (existing user), change role, remove member (member loses access). Spec §8.1 E2E-03.
  - **Spec Reference**: Plan §8.1 E2E-03, AC-05
  - **Dependencies**: Phase 17 complete
  - **Estimated**: `[M]` ~90 min

- [ ] **20.4** `[FR-011]` `[NFR-04]` `[P]` Write invitation flow E2E tests
  - **File**: `apps/web/e2e/invitation-flow.spec.ts`
  - **Type**: Create new file
  - **Description**: E2E-04: admin invites new email → Mailpit receives email → user clicks link → accept flow → user can log in with workspace access. Expired invite rejection. Resend flow. Spec §8.1 E2E-04.
  - **Spec Reference**: Plan §8.1 E2E-04, AC-04
  - **Dependencies**: Phase 17 complete
  - **Estimated**: `[L]` ~2.5 hrs

- [ ] **20.5** `[FR-010]` `[FR-016]` `[P]` Write user management E2E tests
  - **File**: `apps/web/e2e/user-management.spec.ts`
  - **Type**: Create new file
  - **Description**: E2E-05: user list search/filter, remove user (content reassigned to second user, removed user cannot login). Spec §8.1 E2E-05.
  - **Spec Reference**: Plan §8.1 E2E-05, AC-08
  - **Dependencies**: Phase 17 complete
  - **Estimated**: `[M]` ~90 min

- [ ] **20.6** `[FR-012]` `[FR-013]` `[FR-018]` `[P]` Write RBAC permissions E2E tests
  - **File**: `apps/web/e2e/rbac-permissions.spec.ts`
  - **Type**: Create new file
  - **Description**: E2E-06: viewer cannot create workspace (button hidden, API returns 403), member cannot manage users (nav item hidden), workspace admin can manage their workspace but not others. Spec §8.1 E2E-06.
  - **Spec Reference**: Plan §8.1 E2E-06, AC-05, AC-06
  - **Dependencies**: Phase 17 complete
  - **Estimated**: `[M]` ~90 min

- [ ] **20.7** `[FR-019]` `[FR-020]` `[FR-022]` `[NFR-07]` `[P]` Write tenant settings E2E tests
  - **File**: `apps/web/e2e/tenant-settings.spec.ts`
  - **Type**: Create new file
  - **Description**: E2E-07: update tenant display name, upload logo (appears in header), change primary color (UI updates), toggle dark mode, update auth config (MFA required toggle). Spec §8.1 E2E-07.
  - **Spec Reference**: Plan §8.1 E2E-07, AC-09, AC-10, AC-12
  - **Dependencies**: Phase 17 complete
  - **Estimated**: `[L]` ~2.5 hrs

- [ ] **20.8** `[FR-017]` `[NFR-09]` `[P]` Write user profile E2E tests
  - **File**: `apps/web/e2e/user-profile.spec.ts`
  - **Type**: Create new file
  - **Description**: E2E-08: update display name (reflects in header), upload avatar (preview updates), timezone/language change. Spec §8.1 E2E-08.
  - **Spec Reference**: Plan §8.1 E2E-08, AC-13
  - **Dependencies**: Phase 17 complete
  - **Estimated**: `[M]` ~90 min

- [ ] **20.9** `[FR-021]` `[NFR-03]` `[P]` Write audit log E2E tests
  - **File**: `apps/web/e2e/audit-log.spec.ts`
  - **Type**: Create new file
  - **Description**: E2E-09: perform actions (create workspace, invite user), open audit log, verify entries appear, apply filters (by action type, date range), expand row to see metadata. Spec §8.1 E2E-09.
  - **Spec Reference**: Plan §8.1 E2E-09, AC-11
  - **Dependencies**: Phase 17 complete
  - **Estimated**: `[M]` ~90 min

- [ ] **20.10** `[FR-008]` `[P]` Write workspace templates E2E tests
  - **File**: `apps/web/e2e/workspace-templates.spec.ts`
  - **Type**: Create new file
  - **Description**: E2E-10: view built-in templates (read-only), create custom template (name + 2 child workspaces), create workspace using template (child workspaces instantiated). Spec §8.1 E2E-10.
  - **Spec Reference**: Plan §8.1 E2E-10, AC-03
  - **Dependencies**: Phase 17 complete
  - **Estimated**: `[M]` ~90 min

- [ ] **20.11** `[FR-025]` `[P]` Write role management E2E tests
  - **File**: `apps/web/e2e/role-management.spec.ts`
  - **Type**: Create new file
  - **Description**: E2E-11: open role management page, see 4 role cards with descriptions, action matrix renders with correct ✓/✗/— values, CSV export downloads valid file. Spec §8.1 E2E-11.
  - **Spec Reference**: Plan §8.1 E2E-11, AC-15
  - **Dependencies**: Phase 17 complete
  - **Estimated**: `[M]` ~60 min

- [ ] **20.12** `[FR-026]` `[P]` Write permission association E2E tests
  - **File**: `apps/web/e2e/permission-association.spec.ts`
  - **Type**: Create new file
  - **Description**: E2E-12: workspace admin opens permission panel, changes member role inline, change takes effect (member's access updated). Non-admin cannot access panel. Spec §8.1 E2E-12.
  - **Spec Reference**: Plan §8.1 E2E-12, AC-16
  - **Dependencies**: Phase 17 complete
  - **Estimated**: `[M]` ~60 min

---

## Phase 21: Polish & Quality

- [ ] **21.1** `[NFR-14]` WCAG 2.1 AA accessibility audit
  - **Description**: Run automated a11y checks (axe-core via Playwright) on all 13 new pages. Fix: missing aria labels, insufficient color contrast, focus traps in dialogs, keyboard navigation in tree and matrix. Target: 0 violations.
  - **Spec Reference**: Plan §8.5, AC-14, Constitution §Quality
  - **Dependencies**: Phase 20 complete
  - **Estimated**: `[M]` ~90 min

- [ ] **21.2** `[NFR-01]` `[NFR-02]` `[NFR-03]` Performance baseline measurement
  - **Description**: Measure P95 latencies under load: ABAC evaluation (target < 50ms), workspace list (< 200ms), audit log query (< 500ms). Document results. Add performance assertions to integration tests if thresholds not met.
  - **Spec Reference**: Plan §8.5, NFR-01, NFR-02, NFR-03
  - **Dependencies**: Phase 18 complete
  - **Estimated**: `[M]` ~60 min

- [ ] **21.3** `[ALL]` Run `/forge-review` adversarial review
  - **Command**: `/forge-review .forge/specs/003-core-features/`
  - **Expected**: Address all HIGH severity findings before merge
  - **Dependencies**: All phases complete
  - **Estimated**: `[M]` ~60 min

- [ ] **21.4** Update decision log with implementation decisions
  - **File**: `.forge/knowledge/decision-log.md`
  - **Type**: Modify existing
  - **Description**: Record any new implementation decisions made during development (e.g., KC API error handling patterns, Redis cache key format changes).
  - **Spec Reference**: AGENTS.md §Governance
  - **Dependencies**: Phases 1–20 complete
  - **Estimated**: `[S]` ~20 min

---

## Summary

| Metric                     | Value                                       |
| -------------------------- | ------------------------------------------- |
| Total tasks                | 134                                         |
| Total phases               | 21                                          |
| Parallelizable tasks `[P]` | 84                                          |
| FRs covered                | 26/26 (FR-001 – FR-026)                     |
| NFRs covered               | 14/14 (NFR-01 – NFR-14)                     |
| Estimated total effort     | 95–130 hours (backend-heavy, test-complete) |

**Task count by phase**:

| Phase | Name                                 | Tasks |
| ----- | ------------------------------------ | ----- |
| 1     | Foundation — Shared Libraries        | 11    |
| 2     | Database Migration & Prisma          | 5     |
| 3     | ABAC Engine & Audit Log Writer       | 8     |
| 4     | Workspace Module (Backend)           | 4     |
| 5     | Workspace Member Module (Backend)    | 4     |
| 6     | Invitation Module (Backend)          | 4     |
| 7     | User Management Module (Backend)     | 4     |
| 8     | User Profile Module (Backend)        | 4     |
| 9     | Tenant Settings Module (Backend)     | 4     |
| 10    | Audit Log Query Module (Backend)     | 2     |
| 11    | Route Registration                   | 1     |
| 12    | Shared UI Components (`@plexica/ui`) | 12    |
| 13    | Frontend Types, Store & API Client   | 9     |
| 14    | Frontend TanStack Query Hooks        | 6     |
| 15    | Frontend Pages                       | 13    |
| 16    | Frontend Feature Components          | 10    |
| 17    | Routing & Layout Integration         | 3     |
| 18    | Integration Tests (Vitest)           | 9     |
| 19    | Unit Tests (Vitest)                  | 5     |
| 20    | E2E Tests (Playwright)               | 12    |
| 21    | Polish & Quality                     | 4     |

**Effort breakdown by phase group**:

| Group                    | Phases | Estimated Hours |
| ------------------------ | ------ | --------------- |
| Foundation               | 1–2    | 8–12 h          |
| ABAC + Audit (cross-cut) | 3      | 5–7 h           |
| Backend modules          | 4–10   | 35–50 h         |
| API integration          | 11     | 1 h             |
| UI components (shared)   | 12     | 8–10 h          |
| Frontend types/hooks     | 13–14  | 10–14 h         |
| Frontend pages/layout    | 15–17  | 18–24 h         |
| Tests (int + unit + E2E) | 18–20  | 30–42 h         |
| Polish & review          | 21     | 4–5 h           |

---

## Cross-References

| Document             | Path                                     |
| -------------------- | ---------------------------------------- |
| Spec                 | `.forge/specs/003-core-features/spec.md` |
| Plan                 | `.forge/specs/003-core-features/plan.md` |
| Constitution         | `.forge/constitution.md`                 |
| Decision Log         | `.forge/knowledge/decision-log.md`       |
| ADR-003 (ABAC)       | `.forge/knowledge/adr/ADR-003.md`        |
| ADR-011 (KC Admin)   | `.forge/knowledge/adr/ADR-011.md`        |
| ADR-012 (Rate Limit) | `.forge/knowledge/adr/ADR-012.md`        |
