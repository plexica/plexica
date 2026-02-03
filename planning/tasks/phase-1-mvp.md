# Phase 1 - MVP Core - Task Breakdown

**Last Updated**: 2025-02-03  
**Status**: Complete  
**Owner**: Engineering Team  
**Document Type**: Developer Guide

Detailed tasks for Milestone 1.1 - 2.4

**Last Updated**: January 14, 2026  
**Status**: Backend Complete ✅ (M1.1-M1.4), Frontend Complete ✅ (M2.1-M2.2), Testing 🟡 (M2.3 50%), Workspaces ⏳ (M2.4 Pending)

---

## Completion Summary

| Milestone                             | Status          | Completion Date | Total Hours       |
| ------------------------------------- | --------------- | --------------- | ----------------- |
| M1.1 - Foundation                     | ✅ Complete     | 2026-01-13      | ~32h              |
| M1.2 - Multi-Tenancy Core             | ✅ Complete     | 2026-01-13      | ~41h              |
| M1.3 - Authentication & Authorization | ✅ Complete     | 2026-01-13      | ~43h              |
| M1.4 - Plugin System Base             | ✅ Complete     | 2026-01-13      | ~40h (estimated)  |
| M2.1 - Frontend Tenant App            | ✅ Complete     | 2026-01-14      | ~56h (estimated)  |
| M2.2 - Super-Admin App                | ✅ Complete     | 2026-01-14      | ~48h (estimated)  |
| M2.3 - Testing & Deployment           | 🟡 50% Complete | In Progress     | ~60h (estimated)  |
| M2.4 - Workspaces                     | ⏳ Pending      | TBD             | ~172h (estimated) |

**Backend Total**: ~156h completed  
**Frontend Total**: ~104h completed  
**Testing**: ~30h completed  
**Phase 1 Progress**: 88% (6.95/8 milestones)  
**Remaining**: M2.3 (50%), M2.4 (0%)

---

## M1.1 - Foundation (Week 1-4) ✅ COMPLETED

**Completion Date**: January 13, 2026  
**Commit**: `b7f71e0`

### Setup Monorepo ✅

```
[x] T1.1.1: Initialize Git repository
    Estimate: 0.5h
    Owner: DevOps
    Status: ✅ Completed

[x] T1.1.2: Setup pnpm workspace
    - Create pnpm-workspace.yaml
    - Configure root package.json
    Estimate: 1h
    Owner: DevOps
    Status: ✅ Completed

[x] T1.1.3: Setup Turborepo
    - Install turborepo
    - Configure turbo.json (pipeline)
    - Test build/dev/lint tasks
    Estimate: 2h
    Owner: DevOps
    Status: ✅ Completed

[x] T1.1.4: Setup ESLint + Prettier
    - packages/config/eslint
    - packages/config/prettier
    - Configure pre-commit hooks (Husky)
    Estimate: 2h
    Owner: DevOps
    Status: ✅ Completed

[x] T1.1.5: Setup base TypeScript
    - packages/config/typescript
    - tsconfig.base.json
    - tsconfig for apps and packages
    Estimate: 2h
    Owner: DevOps
    Status: ✅ Completed
```

### Infrastructure Setup ✅

**Note**: All infrastructure tasks completed as part of M1.1

```
[x] T1.1.6: Docker Compose development
    - PostgreSQL 15
    - Redis 7 (3 nodes cluster)
    - Keycloak 23
    - MinIO
    - PgAdmin
    - Redis Commander
    Estimate: 4h
    Owner: DevOps

[ ] T1.1.7: Prisma setup packages/database
    - Install Prisma
    - Configure datasource
    - First schema (core.tenants)
    - Script migrate/seed
    Estimate: 3h
    Owner: Backend

[ ] T1.1.8: Keycloak initial config
    - Realm master
    - Client admin-cli
    - Test admin user
    Estimate: 2h
    Owner: Backend
```

### Core API Skeleton

```
[ ] T1.1.9: apps/core-api setup
    - Fastify app init
    - Env config (.env.example)
    - Logger (Pino)
    - Error handler
    Estimate: 3h
    Owner: Backend

[ ] T1.1.10: Health check endpoint
    - GET /health
    - Check DB, Redis, Keycloak
    Estimate: 2h
    Owner: Backend

[ ] T1.1.11: OpenAPI/Swagger setup
    - @fastify/swagger
    - Swagger UI on /docs
    Estimate: 2h
    Owner: Backend
```

### Base CI/CD

```
[ ] T1.1.12: GitHub Actions - Lint & Typecheck
    - Workflow .github/workflows/ci.yml
    - Run on PR to develop/main
    Estimate: 2h
    Owner: DevOps

[ ] T1.1.13: GitHub Actions - Test
    - Vitest runner
    - Coverage report
    Estimate: 2h
    Owner: DevOps

[ ] T1.1.14: GitHub Actions - Build
    - Build all apps/packages
    - Cache dependencies
    Estimate: 2h
    Owner: DevOps
```

**Total Estimates M1.1**: ~32h

---

## M1.2 - Multi-Tenancy Core (Week 5-8) ✅ COMPLETED

**Completion Date**: January 13, 2026  
**Commit**: `0921ab7`  
**Note**: All tasks for this milestone have been completed. See STATUS.md for detailed deliverables.

### Tenant CRUD ✅

```
[ ] T1.2.1: Prisma schema - core.tenants
    - Complete Tenant model
    - TenantStatus enum
    - Migration 001_create_tenants
    Estimate: 2h
    Owner: Backend

[ ] T1.2.2: apps/core-api/src/modules/tenant
    - tenant.controller.ts (CRUD endpoints)
    - tenant.service.ts (business logic)
    - tenant.repository.ts (data access)
    - tenant.schema.ts (Zod validation)
    Estimate: 6h
    Owner: Backend

[ ] T1.2.3: Slug validation
    - Regex: [a-z0-9-]+
    - Unique check
    - Reserved slugs (admin, api, etc.)
    Estimate: 2h
    Owner: Backend

[ ] T1.2.4: Unit tests tenant.service
    - Test CRUD operations
    - Test validation
    Estimate: 3h
    Owner: Backend

[ ] T1.2.5: Integration tests tenant API
    - Test endpoints E2E
    Estimate: 3h
    Owner: Backend
```

### Tenant Provisioning

```
[ ] T1.2.6: provisioning.service.ts
    - orchestrateProvisioning()
    - Rollback on error
    Estimate: 4h
    Owner: Backend

[ ] T1.2.7: createTenantSchema()
    - CREATE SCHEMA SQL
    - Apply template migrations
    - Seed initial data
    Estimate: 4h
    Owner: Backend

[ ] T1.2.8: Tenant schema template
    - users, teams, roles, permissions tables
    - Migration template
    - Seed script
    Estimate: 4h
    Owner: Backend

[ ] T1.2.9: keycloak.service.ts - createRealm()
    - Keycloak Admin Client
    - Create realm
    - Create clients (web, api)
    - Create base roles
    Estimate: 6h
    Owner: Backend

[ ] T1.2.10: storage.service.ts - createBucket()
    - MinIO client
    - Create tenant bucket
    Estimate: 3h
    Owner: Backend

[ ] T1.2.11: Integration test provisioning
    - Test complete flow
    - Test rollback
    Estimate: 4h
    Owner: Backend
```

**Total Estimates M1.2**: ~41h

---

## M1.3 - Authentication & Authorization (Week 9-12) ✅ COMPLETED

**Completion Date**: January 13, 2026  
**Commit**: `5a12f39`  
**Note**: All tasks for this milestone have been completed. See STATUS.md for detailed deliverables.

### JWT & Auth ✅

```
[ ] T1.3.1: jwt.service.ts
    - JWKS client setup
    - verifyToken() with caching
    - extractTenantSlug()
    Estimate: 4h
    Owner: Backend

[ ] T1.3.2: auth.controller.ts
    - Login redirect
    - Callback handler
    - Logout
    - /auth/me endpoint
    Estimate: 4h
    Owner: Backend

[ ] T1.3.3: auth.guard.ts
    - Fastify preHandler hook
    - Extract and validate JWT
    - Inject user in request
    Estimate: 3h
    Owner: Backend

[ ] T1.3.4: tenant.guard.ts
    - Extract tenant from JWT
    - Validate tenant status
    - Setup TenantContext (AsyncLocalStorage)
    Estimate: 3h
    Owner: Backend

[ ] T1.3.5: tenant-context.ts
    - AsyncLocalStorage implementation
    - TenantContextService
    Estimate: 2h
    Owner: Backend

[ ] T1.3.6: Integration tests auth flow
    - Test login/logout
    - Test JWT validation
    - Test context propagation
    Estimate: 4h
    Owner: Backend
```

### RBAC

```
[ ] T1.3.7: Prisma schema - RBAC models
    - Role, Permission, UserRole, RolePermission
    - Update tenant template
    Estimate: 3h
    Owner: Backend

[ ] T1.3.8: permission.service.ts
    - checkPermission(userId, permission)
    - getUserPermissions() with cache
    - matchesPermission() (wildcard)
    Estimate: 4h
    Owner: Backend

[ ] T1.3.9: permission.controller.ts
    - CRUD permissions
    - CRUD roles
    - Assign role to user
    Estimate: 4h
    Owner: Backend

[ ] T1.3.10: permission.guard.ts
    - Check permissions
    - @RequirePermissions() decorator
    Estimate: 3h
    Owner: Backend

[ ] T1.3.11: Seed core permissions
    - users:*, teams:*, settings:*
    - Roles: super_admin, tenant_admin, user
    Estimate: 2h
    Owner: Backend

[ ] T1.3.12: Unit tests permission matching
    - Test wildcard logic
    - Test caching
    Estimate: 3h
    Owner: Backend

[ ] T1.3.13: Integration tests RBAC
    - Test permission checks
    - Test role assignment
    Estimate: 4h
    Owner: Backend
```

**Total Estimates M1.3**: ~43h

---

_(Continues for M1.4-M1.7 in similar fashion)_

**Note**: M1.4 has been completed. M1.5-M1.7 have been renumbered to M2.1-M2.3 in STATUS.md to reflect backend completion.

---

## M1.4 - Plugin System Base (Week 13-16) ✅ COMPLETED

**Completion Date**: January 13, 2026  
**Commit**: `e0f6e53`  
**Deliverables**: 2,062 lines added across plugin system components

**Note**: All tasks for this milestone have been completed. See STATUS.md for detailed deliverables including:

- Plugin Type Definitions (218 lines)
- Plugin Registry Service (585 lines)
- Plugin Lifecycle Service
- Plugin REST API (572 lines, 9 endpoints)
- Plugin Hook System (196 lines)
- Sample Analytics Plugin (443 lines)

---

## M2.1 - Frontend Foundation (Formerly M1.5)

**Status**: ⚪ Not Started  
**Estimated Duration**: ~4 weeks  
**Estimated Effort**: ~56 hours

See STATUS.md for detailed task breakdown for this milestone.

---

## M2.2 - Frontend Auth & Layout (Formerly M1.6)

**Status**: ⚪ Not Started  
**Dependencies**: M2.1

---

## M2.3 - Testing & Deployment (Formerly M1.7)

**Status**: 🟡 50% Complete  
**Dependencies**: M2.2

---

## M2.4 - Workspaces (Week 27-30) ⏳ PENDING

**Status**: ⏳ Pending (0% Complete)  
**Priority**: **CRITICAL** for MVP  
**Dependencies**: M2.3 (can proceed in parallel after 75% completion)  
**Estimated Total**: 172 hours (~4 weeks with 1-2 developers)

**Reference**: `specs/WORKSPACE_SPECIFICATIONS.md` (1,781 lines comprehensive spec)

### Week 27-28: Backend Implementation (72h)

```
[ ] T2.4.1: Database Schema Updates (12h)
    Owner: Backend Lead
    Priority: High
    Tasks:
    - [ ] Create Workspace model in Prisma schema
        - slug (String, unique)
        - name (String)
        - description (String?, optional)
        - settings (Json, default: {})
        - createdAt, updatedAt
    - [ ] Create WorkspaceMember model
        - workspaceId (FK to Workspace)
        - userId (FK to User)
        - role (Enum: ADMIN, MEMBER, VIEWER)
        - invitedBy (String)
        - joinedAt (DateTime)
        - Unique constraint: (workspaceId, userId)
    - [ ] Create WorkspaceResource model
        - id, workspaceId, resourceType, resourceId
        - For cross-workspace resource tracking (Phase 2+)
    - [ ] Update Team model
        - Add workspaceId (String, NOT NULL after migration)
        - Add FK constraint to Workspace
    - [ ] Create indexes:
        - workspace.slug (unique)
        - workspace_member: (workspaceId, userId) unique
        - workspace_member: (userId) for user workspace list
        - team: (workspaceId) for filtering
    - [ ] Configure cascading deletes
    - [ ] Run prisma generate && prisma migrate dev
    Status: ⏳ Pending

[ ] T2.4.2: Tenant Context Enhancement (4h)
    Owner: Backend Lead
    Priority: High
    Dependencies: T2.4.1
    Tasks:
    - [ ] Update TenantContext interface: add workspaceId?: string
    - [ ] Add TenantContextService.getWorkspaceIdOrThrow() method
    - [ ] Update @plexica/types package
    - [ ] Update existing context creation to support workspaceId
    Status: ⏳ Pending

[ ] T2.4.3: Workspace Service Implementation (24h)
    Owner: Backend Developer 1
    Priority: High
    Dependencies: T2.4.1, T2.4.2
    Files: apps/core-api/src/modules/workspace/workspace.service.ts (~400 lines)
    Tasks:
    - [ ] Implement CRUD operations:
        - create(dto, creatorId) - with admin membership creation
        - findAll(userId) - user's accessible workspaces
        - findOne(id) - with members, teams, counts
        - update(id, dto) - name, description, settings only
        - delete(id) - validate no teams exist
    - [ ] Implement membership operations:
        - getMembership(workspaceId, userId) - with Redis cache
        - addMember(workspaceId, dto, invitedBy)
        - updateMemberRole(workspaceId, userId, role)
        - removeMember(workspaceId, userId) - prevent last admin
    - [ ] Implement workspace queries:
        - getTeams(workspaceId) - workspace teams with counts
    - [ ] Integrate RedisService:
        - Cache membership checks (key: workspace:{id}:member:{userId})
        - TTL: 5 minutes
        - Invalidate on membership changes
    - [ ] Integrate EventBusService:
        - core.workspace.created
        - core.workspace.updated
        - core.workspace.deleted
        - core.workspace.member.added
        - core.workspace.member.role_updated
        - core.workspace.member.removed
    - [ ] Add validation and error handling
    - [ ] Add structured logging
    Status: ⏳ Pending

[ ] T2.4.4: Workspace Guards Implementation (16h)
    Owner: Backend Developer 2
    Priority: High
    Dependencies: T2.4.3
    Files:
    - apps/core-api/src/shared/guards/workspace.guard.ts (~80 lines)
    - apps/core-api/src/shared/guards/workspace-role.guard.ts (~50 lines)
    Tasks:
    - [ ] Implement WorkspaceGuard:
        - Extract workspaceId from: header > path > query > body
        - Call WorkspaceService.getMembership()
        - Throw 400 if no workspaceId
        - Throw 403 if no membership
        - Enhance tenantContext.workspaceId
        - Attach workspaceMembership to request
    - [ ] Implement WorkspaceRoleGuard:
        - Create @WorkspaceRoles(...roles) decorator
        - Use Reflector to get required roles
        - Check request.workspaceMembership.role
        - Throw 403 if insufficient permissions
    - [ ] Create WorkspaceRepository base class:
        - getWorkspaceId() helper
        - applyWorkspaceFilter(query) helper
        - Add JSDoc with usage examples
    Status: ⏳ Pending

[ ] T2.4.5: Workspace Controller Implementation (12h)
    Owner: Backend Developer 1
    Priority: High
    Dependencies: T2.4.3, T2.4.4
    File: apps/core-api/src/modules/workspace/workspace.controller.ts (~200 lines)
    Tasks:
    - [ ] Implement 9 API endpoints:
        - POST /api/workspaces (TenantGuard only)
        - GET /api/workspaces (TenantGuard only)
        - GET /api/workspaces/:workspaceId (WorkspaceGuard)
        - PATCH /api/workspaces/:workspaceId (WorkspaceGuard + ADMIN)
        - DELETE /api/workspaces/:workspaceId (WorkspaceGuard + ADMIN)
        - GET /api/workspaces/:workspaceId/members (WorkspaceGuard)
        - POST /api/workspaces/:workspaceId/members (WorkspaceGuard + ADMIN)
        - PATCH /api/workspaces/:workspaceId/members/:userId (WorkspaceGuard + ADMIN)
        - DELETE /api/workspaces/:workspaceId/members/:userId (WorkspaceGuard + ADMIN)
        - GET /api/workspaces/:workspaceId/teams (WorkspaceGuard)
    - [ ] Apply appropriate guards to each endpoint
    - [ ] Add OpenAPI/Swagger decorators
    - [ ] Add request validation with DTOs
    - [ ] Add response DTOs/serializers
    - [ ] Test all endpoints manually with Postman/Insomnia
    Status: ⏳ Pending

[ ] T2.4.6: DTOs and Validation (4h)
    Owner: Backend Developer 2
    Priority: Medium
    Dependencies: None (can do in parallel)
    Files: apps/core-api/src/modules/workspace/dto/*.dto.ts
    Tasks:
    - [ ] CreateWorkspaceDto:
        - slug: string (2-50 chars, lowercase, alphanumeric + hyphens)
        - name: string (2-100 chars)
        - description?: string (max 500 chars)
        - settings?: Record<string, any>
    - [ ] UpdateWorkspaceDto:
        - name?: string
        - description?: string
        - settings?: Record<string, any>
    - [ ] AddMemberDto:
        - userId: string (UUID)
        - role?: WorkspaceRole (default: MEMBER)
    - [ ] UpdateMemberRoleDto:
        - role: WorkspaceRole (enum validation)
    - [ ] Add class-validator decorators to all DTOs
    - [ ] Export all DTOs from index.ts
    Status: ⏳ Pending
```

### Week 29: Frontend Implementation (48h)

```
[ ] T2.4.7: Workspace Context Provider (8h)
    Owner: Frontend Developer 1
    Priority: High
    Dependencies: Backend API ready (T2.4.5)
    File: apps/web/src/contexts/WorkspaceContext.tsx (~100 lines)
    Tasks:
    - [ ] Create WorkspaceContext with state:
        - currentWorkspace: Workspace | null
        - workspaces: Workspace[]
        - isLoading: boolean
        - error: string | null
    - [ ] Implement methods:
        - fetchWorkspaces() - load user's workspaces
        - switchWorkspace(id) - change current + invalidate queries
        - createWorkspace(dto) - create and auto-switch
        - refreshWorkspaces() - force reload
    - [ ] Integrate with TenantContext (workspace lives within tenant)
    - [ ] Persist currentWorkspace.id in localStorage
    - [ ] Auto-select first workspace on load if none selected
    - [ ] Add useWorkspace() hook export
    - [ ] Add error handling and retry logic
    Status: ⏳ Pending

[ ] T2.4.8: Workspace Switcher Component (12h)
    Owner: Frontend Developer 1
    Priority: High
    Dependencies: T2.4.7
    File: apps/web/src/components/WorkspaceSwitcher.tsx (~150 lines)
    Tasks:
    - [ ] Create dropdown component:
        - Trigger button shows current workspace name + icon
        - Dropdown content with workspace list
        - Each workspace: icon, name, member count
        - Search/filter input for 10+ workspaces
        - "Create New Workspace" button at bottom
        - Keyboard navigation (arrow keys, enter, escape)
    - [ ] Create workspace modal/dialog:
        - Form: name, slug (auto-generated from name), description
        - Validation and error display
        - Submit creates workspace and switches to it
    - [ ] Add loading states (skeleton during fetch)
    - [ ] Add empty state ("No workspaces yet")
    - [ ] Style with existing design system (shadcn/ui)
    - [ ] Add to main layout header (between logo and user menu)
    - [ ] Responsive: hide text on mobile, show icon only
    Status: ⏳ Pending

[ ] T2.4.9: Workspace Settings Page (16h)
    Owner: Frontend Developer 2
    Priority: High
    Dependencies: T2.4.7, Backend API
    File: apps/web/src/pages/settings/WorkspaceSettings.tsx (~300 lines)
    Tasks:
    - [ ] Create page with tabs:
        - General: name, slug, description, created info
        - Members: list with roles, add/edit/remove actions
        - Teams: list of teams in workspace
        - (Danger Zone: delete workspace)
    - [ ] General tab:
        - Editable fields: name, description (admin only)
        - Read-only: slug, created date, creator name
        - Save button with optimistic updates
    - [ ] Members tab:
        - Table: avatar, name, email, role badge, joined date, actions
        - Add member button (opens modal) - admin only
        - Role dropdown per member (inline edit) - admin only
        - Remove button (with confirmation) - admin only
        - Disable remove for last admin
        - Search and pagination for many members
    - [ ] Teams tab:
        - Card grid or table view
        - Team name, member count, created date
        - Click to navigate to team detail page
        - Empty state: "No teams in this workspace"
    - [ ] Danger Zone (admin only):
        - Delete workspace button
        - Confirmation dialog with warning about teams
        - Prevent deletion if teams exist (show error)
    - [ ] Add to routes: /settings/workspace
    - [ ] Protect with workspace context requirement
    Status: ⏳ Pending

[ ] T2.4.10: API Client Enhancement (4h)
    Owner: Frontend Developer 1
    Priority: High
    Dependencies: T2.4.7
    File: apps/web/src/lib/api/client.ts (enhancements)
    Tasks:
    - [ ] Add X-Workspace-ID header injection:
        - Read from WorkspaceContext.currentWorkspace.id
        - Add to all requests automatically
        - Skip if no workspace selected (allow null for workspace list endpoint)
    - [ ] Handle workspace-specific errors:
        - 400 "Workspace ID required" → show workspace switcher
        - 403 "Access to workspace denied" → redirect to workspace list
    - [ ] Add workspace API methods:
        - getWorkspaces()
        - getWorkspace(id)
        - createWorkspace(dto)
        - updateWorkspace(id, dto)
        - deleteWorkspace(id)
        - getWorkspaceMembers(id)
        - addWorkspaceMember(id, dto)
        - updateWorkspaceMemberRole(id, userId, role)
        - removeWorkspaceMember(id, userId)
        - getWorkspaceTeams(id)
    - [ ] Add React Query hooks for each endpoint
    Status: ⏳ Pending

[ ] T2.4.11: Update Team Pages (8h)
    Owner: Frontend Developer 2
    Priority: Medium
    Dependencies: T2.4.7
    Files: apps/web/src/pages/teams/*.tsx
    Tasks:
    - [ ] TeamListPage:
        - Filter teams by currentWorkspace.id automatically
        - Show workspace name in breadcrumb
        - Empty state: "No teams in [workspace name]"
        - Add workspace context badge in header
    - [ ] TeamDetailPage:
        - Show workspace name in page header
        - Add workspace badge/tag
        - Breadcrumb: Dashboard > Workspaces > [Workspace] > Teams > [Team]
    - [ ] CreateTeamForm:
        - Auto-assign currentWorkspace.id
        - Hide workspace selector (implicit from context)
        - Show selected workspace name (read-only)
    - [ ] Update team queries to include workspace filter
    Status: ⏳ Pending
```

### Week 30: Migration, Testing & Documentation (52h)

```
[X] T2.4.12: Migration Script (SKIPPED - Database Reset)
    Owner: Backend Lead + DevOps
    Priority: ~~Critical~~ N/A
    Dependencies: All backend tasks complete
    Decision: Instead of creating a migration script, we performed a full database reset
             since there are no production installations yet. All data has been wiped
             and migrations reapplied from scratch with the new workspace schema.
    Action Taken:
    - [X] Executed `pnpm prisma migrate reset --force` (14 Jan 2025)
    - [X] All migrations reapplied: 20260113194754_init + 20260114095039_add_workspaces
    - [X] Prisma Client regenerated
    - [X] Database now has clean workspace-enabled schema
    Note: Future production migrations will require proper migration scripts
    Status: ✅ Complete (Alternative approach taken)

[ ] T2.4.13: Unit Tests - Backend (16h)
    Owner: Backend Team
    Priority: High
    Dependencies: T2.4.3, T2.4.4
    Files: apps/core-api/src/modules/workspace/**/*.spec.ts
    Tasks:
    - [ ] WorkspaceService tests (~15 tests):
        - create() success, duplicate slug error
        - findAll() returns user's workspaces only
        - findOne() with relations, not found error
        - update() success, not found error
        - delete() success, has teams error, not found error
        - getMembership() cache hit, cache miss, not member
        - addMember() success, duplicate error
        - updateMemberRole() success, not found
        - removeMember() success, last admin error
        - getTeams() filtered by workspace
    - [ ] WorkspaceGuard tests (~8 tests):
        - Extract from header, path, query, body
        - No workspace ID error
        - No membership error
        - Context enhancement success
    - [ ] WorkspaceRoleGuard tests (~6 tests):
        - Admin access granted
        - Member access granted/denied based on required roles
        - Viewer access denied for admin-only endpoints
    - [ ] Target: >80% coverage for workspace code
    - [ ] Run: pnpm test:cov
    Status: ⏳ Pending

[ ] T2.4.14: Integration Tests - Backend (12h)
    Owner: Backend Team
    Priority: High
    Dependencies: T2.4.5
    Files: apps/core-api/src/modules/workspace/**/*.integration.spec.ts
    Tasks:
    - [ ] Full workspace lifecycle test:
        - Create workspace
        - List workspaces
        - Get workspace details
        - Update workspace
        - Delete workspace
    - [ ] Membership management test:
        - Add member
        - List members
        - Update member role
        - Remove member
        - Last admin protection
    - [ ] Permission scenarios:
        - Admin can do everything
        - Member can view, not edit
        - Viewer can only view
        - Non-member gets 403
    - [ ] Team filtering test:
        - Create teams in different workspaces
        - Verify filtering works correctly
    - [ ] Error cases:
        - Not found (404)
        - Forbidden (403)
        - Bad request (400)
        - Conflict (409)
    Status: ⏳ Pending

[ ] T2.4.15: E2E Tests - Frontend (8h)
    Owner: QA + Frontend Team
    Priority: High
    Dependencies: Frontend complete
    Files: apps/web/e2e/workspace.spec.ts
    Tools: Playwright
    Tasks:
    - [ ] Workspace switcher test:
        - Login
        - Verify workspace switcher visible
        - Open dropdown
        - Verify workspace list
    - [ ] Create workspace test:
        - Click "Create New Workspace"
        - Fill form (name, description)
        - Submit
        - Verify switched to new workspace
        - Verify appears in switcher
    - [ ] Switch workspace test:
        - Open switcher
        - Click different workspace
        - Verify URL or context changes
        - Verify teams list updates
    - [ ] Workspace settings test:
        - Navigate to workspace settings
        - Edit workspace name
        - Save
        - Verify updated in header
    - [ ] Member management test (admin):
        - Go to members tab
        - Add member
        - Change member role
        - Remove member
        - Verify changes persist
    - [ ] Delete workspace test:
        - Navigate to danger zone
        - Attempt delete with teams (should fail)
        - Remove all teams
        - Delete workspace
        - Verify redirected and removed from list
    Status: ⏳ Pending

[ ] T2.4.16: Documentation (8h)
    Owner: Tech Lead + Team
    Priority: Medium
    Dependencies: All implementation complete
    Tasks:
    - [ ] Update technical specifications:
        - [x] FUNCTIONAL_SPECIFICATIONS.md (already done)
        - [x] TECHNICAL_SPECIFICATIONS.md (already done)
        - [ ] Update OpenAPI/Swagger docs with workspace endpoints
    - [ ] Create user documentation:
        - [ ] docs/user/WORKSPACES.md:
            * What are workspaces
            * How to create a workspace
            * How to invite members
            * How to manage workspace settings
            * Workspace roles explained
            * How to switch between workspaces
    - [ ] Create developer documentation:
        - [ ] docs/developer/WORKSPACE_INTEGRATION.md:
            * WorkspaceContext usage
            * WorkspaceGuard usage patterns
            * WorkspaceRepository pattern
            * Writing workspace-scoped queries
            * Testing workspace features
    - [ ] Update README.md:
        - [ ] Add workspace to key features list
        - [ ] Add workspace screenshot
        - [ ] Update architecture diagram if needed
    - [ ] Update CHANGELOG.md:
        - [ ] Add v0.7.0 entry with workspace feature
    Status: ⏳ Pending
```

**Success Criteria for M2.4**:

- ✅ All 9 workspace API endpoints functional
- ✅ Frontend workspace switcher integrated in header
- ✅ Workspace settings page fully functional
- ✅ Migration script tested on dev database
- ✅ Test coverage >80% for workspace code
- ✅ E2E tests pass for workspace workflows
- ✅ Documentation complete and reviewed
- ✅ Backward compatibility maintained (default workspace)
- ✅ No breaking changes to existing features
- ✅ Performance: workspace operations < 500ms p95

---

## Task Tracking

For each task:

- [ ] Assign owner
- [ ] Estimate effort
- [ ] Create git branch
- [ ] Implement + test
- [ ] Code review
- [ ] Merge

**Sprint Velocity Target**: ~40h per week (per full-time developer)

---

_Phase 1 MVP Task Breakdown v1.2_  
_Last Updated: January 14, 2026_  
_Status: Backend Complete ✅ (M1.1-M1.4), Frontend Complete ✅ (M2.1-M2.2), Testing 🟡 (M2.3 50%), Workspaces ⏳ (M2.4 Pending)_
