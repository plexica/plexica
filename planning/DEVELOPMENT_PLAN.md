# Plexica - Development Plan

**Current Phase**: Phase 1 - MVP Core (Backend Complete)  
**Last Updated**: January 13, 2026  
**Status**: Backend 100% ✅, Frontend 0% ⚪

---

## Table of Contents

1. [Phase 1 - MVP Core](#phase-1---mvp-core)
2. [Development Strategies](#development-strategies)
3. [Stack and Tools](#stack-and-tools)
4. [Testing Strategy](#testing-strategy)
5. [Deployment Strategy](#deployment-strategy)

---

## Phase 1 - MVP Core

### Milestone 1.1 - Foundation (4 weeks) ✅ COMPLETED

**Completion Date**: January 13, 2026  
**Commit**: `b7f71e0`

#### Week 1: Monorepo Setup ✅

**Tasks**:

```
[x] Setup repository
    [x] Initialize Git repository
    [x] Configure .gitignore
    [x] Setup pnpm workspace (pnpm-workspace.yaml)
    [x] Setup Turborepo (turbo.json)
    [x] Configure ESLint + Prettier (shared config)
    [x] Setup TypeScript base config

[x] Configure development tools
    [x] Setup Vitest for testing
    [x] Configure Husky for pre-commit hooks
    [x] Setup commitlint for conventional commits
    [x] Configure path aliases (@plexica/*)
```

**Deliverable**: ✅ Working monorepo with development tools

#### Week 2-3: Infrastructure Setup ✅

**Tasks**:

```
[x] Docker Compose for local development
    [x] PostgreSQL 15 container
    [x] Redis 7 cluster (3 nodes)
    [x] Keycloak 23 container
    [x] MinIO/S3 container
    [x] PgAdmin for DB debug
    [x] Redis Commander for cache debug

[x] Prisma setup
    [x] Install Prisma in packages/database
    [x] Configure PostgreSQL datasource
    [x] Create first schema (core)
    [x] Setup migration workflow
    [x] Seed script for test data

[x] Keycloak configuration
    [x] Setup master realm
    [x] Create admin client for Core API
    [x] Configure SMTP for email (Mailhog dev)
```

**Deliverable**: ✅ Working dev infrastructure, DB and Keycloak configured

#### Week 4: Core API Skeleton ✅

**Tasks**:

```
[x] apps/core-api setup
    [x] Initialize Fastify app
    [x] Configure env variables (.env.example)
    [x] Setup Prisma client in app
    [x] Configure logger (Pino)
    [x] Health check endpoint
    [x] OpenAPI/Swagger setup

[x] Base shared packages
    [x] @plexica/types: define initial interfaces
    [x] @plexica/config: shared configurations
    [x] @plexica/database: Prisma client wrapper

[x] Base CI/CD
    [x] GitHub Actions: lint and typecheck
    [x] GitHub Actions: test runner
    [x] GitHub Actions: build check
```

**Deliverable**: ✅ Working Core API with base endpoints

---

### Milestone 1.2 - Multi-Tenancy Core (4 weeks) ✅ COMPLETED

**Completion Date**: January 13, 2026  
**Commit**: `0921ab7`

#### Week 5-6: Tenant Management ✅

**Tasks**:

```
[x] Core Prisma schema
    [x] Model Tenant
    [x] Model Plugin
    [x] Model TenantPlugin
    [x] Model SuperAdmin
    [x] Migration 001_create_core_schema

[x] Tenant Module (apps/core-api)
    [x] tenant.controller.ts
        [x] POST /api/tenants (create)
        [x] GET /api/tenants (list)
        [x] GET /api/tenants/:id (get)
        [x] PATCH /api/tenants/:id (update)
        [x] DELETE /api/tenants/:id (delete)
    [x] tenant.service.ts
        [x] CRUD business logic
        [x] Slug validation (alphanumeric, lowercase)
    [x] tenant.repository.ts
        [x] Data access layer
    [x] tenant.schema.ts
        [x] Zod validation schemas

[x] Testing
    [x] Unit tests tenant.service
    [x] Integration tests tenant API
```

**Deliverable**: ✅ Working tenant CRUD (with provisioning)

#### Week 7-8: Tenant Provisioning ✅

**Tasks**:

```
[x] Provisioning Service
    [x] provisioning.service.ts
        [x] createTenantSchema(slug): create PostgreSQL schema
        [x] createKeycloakRealm(slug): create Keycloak realm
        [x] createStorageBucket(slug): create MinIO bucket
        [x] seedTenantData(slug): insert initial data
        [x] orchestrateProvisioning(): coordinate all operations

[x] Tenant schema template
    [x] Create migration template in packages/database
    [x] Script to apply template to new schema
    [x] Seed base data (roles, core permissions)

[x] Keycloak Admin Client integration
    [x] keycloak.service.ts
    [x] createRealm()
    [x] createClients (web, api)
    [x] createBaseRoles()

[x] Base Storage Service
    [x] storage.service.ts
    [x] MinIO client setup
    [x] createBucket()
    [x] Tenant isolation enforcement

[x] Cleanup & Rollback
    [x] Implement rollback on provisioning error
    [x] deleteTenantSchema()
    [x] deleteKeycloakRealm()
    [x] deleteStorageBucket()

[x] Testing
    [x] Integration test complete provisioning
    [x] Test rollback on error
```

**Deliverable**: ✅ Working automatic tenant provisioning

---

### Milestone 1.3 - Authentication & Authorization (4 weeks) ✅ COMPLETED

**Completion Date**: January 13, 2026  
**Commit**: `5a12f39`

#### Week 9-10: Keycloak Integration ✅

**Tasks**:

```
[x] JWT Service
    [x] jwt.service.ts
    [x] verifyToken(): validate JWT with JWKS
    [x] extractTenantSlug(): extract tenant from realm
    [x] Cache token validation (Redis)

[x] Auth Module
    [x] auth.controller.ts
        [x] POST /api/auth/login (redirect to Keycloak)
        [x] GET /api/auth/callback (handle callback)
        [x] POST /api/auth/logout
        [x] GET /api/auth/me (user info)
    [x] auth.service.ts
        [x] Token exchange management
        [x] Refresh token logic

[x] Guards (Fastify hooks)
    [x] auth.guard.ts: verify JWT
    [x] tenant.guard.ts: validate tenant and set context
    [x] Decorators to apply guards

[x] Tenant Context
    [x] tenant-context.ts (AsyncLocalStorage)
    [x] TenantContextService
    [x] Middleware to set context from JWT

[x] Testing
    [x] Unit tests JWT service
    [x] Integration tests auth flow
    [x] Test context propagation
```

**Deliverable**: ✅ Complete auth with JWT validation

#### Week 11-12: RBAC System ✅

**Tasks**:

```
[x] Tenant Prisma schema (RBAC)
    [x] Model Role
    [x] Model Permission
    [x] Model RolePermission
    [x] Model UserRole
    [x] Updated migration template

[x] Permission Module
    [x] permission.controller.ts
        [x] CRUD permissions
        [x] CRUD roles
        [x] Assign role to user
    [x] permission.service.ts
        [x] checkPermission(userId, permission)
        [x] getUserPermissions(userId)
        [x] matchesPermission() (wildcard support)
    [x] Cache permissions per user (Redis)

[x] Permission Guard
    [x] permission.guard.ts
    [x] Decorator @RequirePermissions()
    [x] Example usage in controllers

[x] Seed core permissions
    [x] users:read, users:write, users:delete
    [x] teams:read, teams:write
    [x] settings:read, settings:write
    [x] Base roles: super_admin, tenant_admin, user

[x] Testing
    [x] Unit tests permission matching
    [x] Integration tests permission check
    [x] E2E test auth + authorization flow
```

**Deliverable**: ✅ Complete and working RBAC

---

### Milestone 1.4 - Plugin System Base (4 weeks) ✅ COMPLETED

**Completion Date**: January 13, 2026  
**Commit**: `e0f6e53`

#### Week 13-14: Plugin SDK ✅

**Tasks**:

```
[x] packages/sdk setup
    [x] PlexicaPlugin base class
    [x] Lifecycle hooks (onInstall, onEnable, onDisable)
    [x] Database client wrapper (uses Prisma)
    [x] Logger wrapper
    [x] Context access (tenant, user)

[x] Decorators
    [x] @Route(method, path)
    [x] @Permission(permission)
    [x] @EventHandler(eventType)

[x] Plugin Manifest interface
    [x] PluginManifest type in @plexica/types
    [x] JSON Schema for validation

[x] SDK Documentation
    [x] README with examples
    [x] API reference
    [x] Getting started guide

[x] Testing
    [x] Unit tests SDK base
    [x] Mock plugin for testing
```

**Deliverable**: ✅ Publishable SDK on npm (version 0.1.0 types defined)

#### Week 15-16: Plugin Registry & Loader ✅

**Tasks**:

```
[x] Plugin Module
    [x] plugin-registry.service.ts
        [x] register(manifest)
        [x] get(pluginId)
        [x] list()
        [x] validateManifest()
    [x] plugin-loader.service.ts
        [x] installPlugin(pluginId, tenantSlug)
        [x] enablePlugin(pluginId, tenantSlug)
        [x] disablePlugin(pluginId, tenantSlug)
        [x] uninstallPlugin(pluginId, tenantSlug)
    [x] plugin-migration.service.ts
        [x] applyPluginMigrations() (defined in manifest)
        [x] loadPluginMigrationFiles()

[ ] Docker deployment for plugins (Deferred to Phase 2)
    [ ] docker.service.ts
    [ ] deployPlugin(): pull + run container
    [ ] stopPlugin()
    [ ] Plugin network isolation

[ ] Plugin proxy (Deferred to Phase 2)
    [ ] plugin-proxy.service.ts
    [ ] Forward requests to plugin containers
    [ ] Add headers (X-Tenant-ID, X-User-ID)

[x] Testing
    [x] Integration test install/enable/disable
    [x] Test plugin lifecycle
    [x] Test migration application (structure defined)
```

**Deliverable**: ✅ Working plugin system with first test plugin (sample-analytics)

---

### Milestone 1.5 - Frontend Web App (4 weeks) ⚪ NOT STARTED

**Note**: This milestone has been renumbered to M2.1 - Frontend Foundation in STATUS.md to reflect backend completion.

#### Week 17-18: Base React App

**Tasks**:

```
[ ] apps/web setup
    [ ] Vite + React + TypeScript
    [ ] Configure Material-UI
    [ ] Setup React Router
    [ ] Configure Zustand store
    [ ] Setup i18next

[ ] Frontend packages
    [ ] @plexica/ui: shared components
        [ ] Button, Input, Card, Modal
        [ ] Layout components
    [ ] @plexica/api-client: fetch API wrapper
        [ ] Base URL configuration
        [ ] Auth token injection
        [ ] Error handling

[ ] Frontend auth flow
    [ ] Login page
    [ ] Keycloak redirect handling
    [ ] Token storage (secure)
    [ ] Auth context provider
    [ ] ProtectedRoute component

[ ] Base layout
    [ ] Header with logo and user menu
    [ ] Sidebar with navigation
    [ ] Main content area
    [ ] Responsive layout
```

**Deliverable**: React app with auth and layout

#### Week 19-20: Core Pages

**Tasks**:

```
[ ] Dashboard page
    [ ] Overview widgets
    [ ] Recent activity
    [ ] Quick actions

[ ] Settings page
    [ ] Tenant settings form
    [ ] Theme customization
    [ ] User preferences

[ ] Profile page
    [ ] User info
    [ ] Avatar upload
    [ ] Password change

[ ] Teams page (base)
    [ ] List teams
    [ ] Create team
    [ ] Team members

[ ] Testing
    [ ] Component tests (Vitest + Testing Library)
    [ ] E2E tests (Playwright)
```

**Deliverable**: Working frontend with core pages

---

### Milestone 1.6 - Super Admin Panel (4 weeks)

#### Week 21-22: Super Admin App

**Tasks**:

```
[ ] apps/super-admin setup
    [ ] Clone setup from apps/web
    [ ] Custom theme "admin"
    [ ] Different auth realm (master)

[ ] Dashboard
    [ ] System overview
    [ ] Metrics cards (tenant count, plugin count)
    [ ] Service health status

[ ] Tenant Management UI
    [ ] Tenant list table
        [ ] Columns: name, slug, status, users, created
        [ ] Filters, search, pagination
    [ ] Create tenant dialog
        [ ] Form validation
        [ ] Provisioning progress indicator
    [ ] Tenant detail page
        [ ] Info tab
        [ ] Users tab
        [ ] Plugins tab
        [ ] Settings tab
    [ ] Actions: suspend, delete tenant
```

**Deliverable**: Base Super Admin panel

#### Week 23-24: Plugin Management UI

**Tasks**:

```
[ ] Plugin Registry page
    [ ] List available plugins
    [ ] Plugin cards with info
    [ ] Install button

[ ] Plugin detail page
    [ ] Manifest view
    [ ] Installed tenants
    [ ] Configuration options

[ ] Testing
    [ ] E2E test tenant creation flow
    [ ] E2E test plugin installation
```

**Deliverable**: Complete Super Admin

---

### Milestone 1.7 - Testing & Deployment (2 weeks)

#### Week 25: Testing

**Tasks**:

```
[ ] Test coverage
    [ ] Increase coverage to >80%
    [ ] Unit tests critical services
    [ ] Complete API integration tests
    [ ] E2E test main user flows

[ ] Load testing
    [ ] Setup k6 for load tests
    [ ] Test core API endpoints
    [ ] Test provisioning under load

[ ] Security testing
    [ ] Test auth bypass attempts
    [ ] Test tenant isolation
    [ ] SQL injection tests
```

#### Week 26: Deployment & Documentation

**Tasks**:

```
[ ] Production-ready Docker Compose
    [ ] Optimize configurations
    [ ] Health checks
    [ ] Restart policies
    [ ] Volumes for persistence

[ ] Documentation
    [ ] Setup guide (README)
    [ ] API documentation (Swagger)
    [ ] Architecture overview
    [ ] Deployment guide

[ ] Demo deployment
    [ ] Deploy on staging server
    [ ] Seed demo data
    [ ] End-to-end test on staging
```

**Deliverable**: Deployed and tested MVP

---

### Milestone 2.4 - Workspaces (3-4 weeks) ⏳ PENDING

**Start Date**: TBD (After M2.3)  
**Priority**: **CRITICAL** for MVP  
**Estimated Hours**: 120-160 hours

**Note**: Originally planned for Phase 2, workspace feature moved to Phase 1 MVP per business requirements. See `specs/WORKSPACE_SPECIFICATIONS.md` for comprehensive technical specification.

#### Week 27-28: Backend Implementation

**Tasks**:

```
[ ] Database schema updates (12h)
    [ ] Create Workspace model (slug, name, description, settings)
    [ ] Create WorkspaceMember model (workspaceId, userId, role, invitedBy, joinedAt)
    [ ] Create WorkspaceResource model (for cross-workspace resource tracking)
    [ ] Update Team model: add workspaceId FK (NOT NULL after migration)
    [ ] Add workspace_id column to all plugin tables
    [ ] Create indexes:
        - workspace.slug (unique)
        - workspace_member (workspaceId, userId) unique
        - workspace_member (userId) for user's workspace list
        - team (workspaceId) for workspace teams query
    [ ] Configure cascading deletes (workspace → members, teams)
    [ ] Run Prisma generate and migrate

[ ] Tenant Context enhancement (4h)
    [ ] Update TenantContext interface: add workspaceId? field
    [ ] Add TenantContextService.getWorkspaceIdOrThrow() method
    [ ] Update context type definitions in @plexica/types

[ ] Workspace Service (24h)
    [ ] Implement WorkspaceService (~400 lines):
        [ ] create(dto, creatorId) - with admin membership
        [ ] findAll(userId) - user's accessible workspaces
        [ ] findOne(id) - with members, teams, counts
        [ ] update(id, dto) - name, description, settings
        [ ] delete(id) - with team count validation
        [ ] getMembership(workspaceId, userId) - with Redis cache
        [ ] addMember(workspaceId, dto, invitedBy) - with conflict check
        [ ] updateMemberRole(workspaceId, userId, role)
        [ ] removeMember(workspaceId, userId) - prevent last admin removal
        [ ] getTeams(workspaceId) - workspace teams with counts
    [ ] Integrate RedisService for membership caching (5 min TTL)
    [ ] Integrate EventBusService for workspace events:
        - core.workspace.created
        - core.workspace.updated
        - core.workspace.deleted
        - core.workspace.member.added
        - core.workspace.member.role_updated
        - core.workspace.member.removed
    [ ] Add error handling and validation
    [ ] Add logging for all operations

[ ] Guards & Middleware (16h)
    [ ] Implement WorkspaceGuard (~80 lines):
        [ ] Extract workspaceId from header (X-Workspace-ID)
        [ ] Extract workspaceId from path params
        [ ] Extract workspaceId from query params
        [ ] Extract workspaceId from request body
        [ ] Verify workspace exists and user has membership
        [ ] Enhance tenantContext.workspaceId
        [ ] Attach workspaceMembership to request
    [ ] Implement WorkspaceRoleGuard (~50 lines):
        [ ] Create @WorkspaceRoles() decorator
        [ ] Check required roles from metadata
        [ ] Verify membership role matches required roles
        [ ] Return 403 if insufficient permissions
    [ ] Create WorkspaceRepository base class (~50 lines):
        [ ] getWorkspaceId() helper
        [ ] applyWorkspaceFilter(query) helper
        [ ] Document usage patterns

[ ] Workspace Controller (12h)
    [ ] Implement WorkspaceController (~200 lines):
        [ ] POST /api/workspaces - create (auth required)
        [ ] GET /api/workspaces - list user's workspaces (auth required)
        [ ] GET /api/workspaces/:workspaceId - get details (workspace guard)
        [ ] PATCH /api/workspaces/:workspaceId - update (admin only)
        [ ] DELETE /api/workspaces/:workspaceId - delete (admin only)
        [ ] GET /api/workspaces/:workspaceId/members - list members
        [ ] POST /api/workspaces/:workspaceId/members - add member (admin only)
        [ ] PATCH /api/workspaces/:workspaceId/members/:userId - update role (admin only)
        [ ] DELETE /api/workspaces/:workspaceId/members/:userId - remove (admin only)
        [ ] GET /api/workspaces/:workspaceId/teams - list teams
    [ ] Apply guards (TenantGuard, WorkspaceGuard, WorkspaceRoleGuard)
    [ ] Add OpenAPI/Swagger decorators
    [ ] Add request validation (DTOs)

[ ] DTOs & Validation (4h)
    [ ] Create CreateWorkspaceDto (slug, name, description, settings)
    [ ] Create UpdateWorkspaceDto (name, description, settings)
    [ ] Create AddMemberDto (userId, role)
    [ ] Create UpdateMemberRoleDto (role)
    [ ] Add class-validator decorators:
        - slug: lowercase, alphanumeric + hyphens, 2-50 chars
        - name: 2-100 chars
        - description: optional, max 500 chars
        - userId: UUID validation
        - role: enum validation (ADMIN, MEMBER, VIEWER)
```

**Estimated Hours**: 72h (Backend)

#### Week 29: Frontend Implementation

**Tasks**:

```
[ ] Workspace Context (8h)
    [ ] Create WorkspaceContext provider (~100 lines):
        [ ] State: currentWorkspace, workspaces[], isLoading
        [ ] fetchWorkspaces() - load user's workspaces
        [ ] switchWorkspace(id) - change current workspace
        [ ] createWorkspace(dto) - create and switch
        [ ] useWorkspace() hook export
    [ ] Integrate with TenantContext (workspace lives within tenant)
    [ ] Persist current workspace in localStorage
    [ ] Auto-select first workspace if none selected

[ ] Workspace Switcher Component (12h)
    [ ] Create WorkspaceSwitcher component (~150 lines):
        [ ] Dropdown trigger button in header (shows current workspace)
        [ ] Workspace list with icons and names
        [ ] Search/filter for 10+ workspaces
        [ ] "Create New Workspace" button
        [ ] Create workspace modal/dialog
        [ ] Loading and error states
        [ ] Keyboard navigation support
        [ ] Responsive design (mobile/desktop)
    [ ] Add to main layout header
    [ ] Style with existing design system

[ ] Workspace Settings Page (16h)
    [ ] Create WorkspaceSettingsPage (~300 lines):
        [ ] General tab:
            - Workspace name (editable, admin only)
            - Workspace slug (read-only)
            - Description (editable, admin only)
            - Created date and creator info
        [ ] Members tab:
            - Members list with role badges
            - Add member button (admin only)
            - Role dropdown per member (admin only)
            - Remove member button (admin only, not last admin)
            - Invite pending state (future: email invites)
        [ ] Teams tab:
            - Teams list in workspace
            - Team member counts
            - Link to team detail pages
        [ ] Danger zone (admin only):
            - Delete workspace button
            - Confirmation dialog with team count warning
    [ ] Add to routes configuration
    [ ] Protect with role-based rendering

[ ] API Client Enhancement (4h)
    [ ] Update API client (~50 lines):
        [ ] Add X-Workspace-ID header injection from context
        [ ] Handle 400 (missing workspace) errors
        [ ] Handle 403 (workspace access denied) errors
        [ ] Add workspace API methods:
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

[ ] Update Team Pages (8h)
    [ ] Update TeamListPage:
        [ ] Filter teams by current workspace
        [ ] Show "No teams in workspace" empty state
        [ ] Show workspace context in breadcrumb
    [ ] Update TeamDetailPage:
        [ ] Show workspace name in header
        [ ] Workspace badge/tag
    [ ] Update CreateTeamForm:
        [ ] Auto-assign current workspace
        [ ] Hide workspace selector (implicit from context)
```

**Estimated Hours**: 48h (Frontend)

#### Week 30: Migration, Testing & Documentation

**Tasks**:

```
[X] Migration Script (SKIPPED - 0h)
    [X] Decision: Database reset instead of migration (14 Jan 2025)
    [X] Executed `pnpm prisma migrate reset --force`
    [X] All migrations reapplied from scratch
    [X] Clean database with workspace schema
    Note: No migration script needed - no production installations yet

[ ] Unit Tests (16h)
    [ ] WorkspaceService tests (~15 tests, 200 lines):
        [ ] create() - success, duplicate slug
        [ ] findAll() - user's workspaces only
        [ ] findOne() - with relations, not found
        [ ] update() - success, not found
        [ ] delete() - success, with teams error, not found
        [ ] getMembership() - cache hit, cache miss, not member
        [ ] addMember() - success, duplicate error
        [ ] updateMemberRole() - success, not found
        [ ] removeMember() - success, last admin error
        [ ] getTeams() - filtered by workspace
    [ ] WorkspaceGuard tests (~8 tests, 100 lines):
        [ ] Extract from header, path, query, body
        [ ] No workspace ID error
        [ ] No membership error
        [ ] Context enhancement
    [ ] WorkspaceRoleGuard tests (~6 tests, 80 lines):
        [ ] Admin access granted
        [ ] Member access granted for MEMBER+ roles
        [ ] Viewer access denied for ADMIN roles
        [ ] No membership error
    [ ] Target coverage: >80% for workspace code

[ ] Integration Tests (12h)
    [ ] Workspace API tests (~200 lines):
        [ ] Full workspace lifecycle (create, read, update, delete)
        [ ] Membership management (add, update role, remove)
        [ ] Permission scenarios (admin vs member vs viewer)
        [ ] Error cases (not found, forbidden, bad request)
        [ ] Team filtering by workspace
    [ ] Test with real tenant context
    [ ] Test workspace isolation

[ ] E2E Tests (8h)
    [ ] Playwright tests (~150 lines):
        [ ] Login and workspace switcher appears
        [ ] Create new workspace
        [ ] Switch between workspaces
        [ ] Add member to workspace (admin flow)
        [ ] Update member role
        [ ] Remove member
        [ ] Delete workspace (with empty workspace)
        [ ] Verify team list filtered by workspace

[ ] Documentation (8h)
    [ ] Update specifications:
        [x] FUNCTIONAL_SPECIFICATIONS.md (already updated)
        [x] TECHNICAL_SPECIFICATIONS.md (already updated)
        [ ] Update API documentation (Swagger/OpenAPI)
    [ ] Create user guide:
        [ ] What are workspaces
        [ ] How to create a workspace
        [ ] How to manage members
        [ ] How to switch workspaces
        [ ] Workspace roles explained
    [ ] Create developer guide:
        [ ] Workspace context usage
        [ ] WorkspaceGuard usage
        [ ] WorkspaceRepository pattern
        [ ] Workspace-scoped queries
    [ ] Update README.md with workspace feature
```

**Estimated Hours**: 52h (Migration, Testing, Docs)

**Total Estimated Hours**: 172h (~4 weeks with 1-2 developers)

**Deliverable**: Fully functional workspace system integrated into Plexica MVP

**Success Criteria**:

- ✅ All 9 workspace API endpoints functional and tested
- ✅ Workspace UI components integrated in header and settings
- ✅ Migration script successfully tested on dev data
- ✅ Test coverage >80% for workspace code
- ✅ E2E tests pass for full workspace workflows
- ✅ Documentation updated and published
- ✅ Backward compatibility maintained (default workspace)

---

## Development Strategies

### Git Workflow

```
main (protected)
  └── develop
       ├── feature/milestone-1.1-monorepo-setup
       ├── feature/milestone-1.2-tenant-management
       └── feature/milestone-1.3-auth
```

**Rules**:

- Feature branch from `develop`
- Mandatory PR review (at least 1 approval)
- CI must pass before merge
- Squash merge for feature branches
- Merge commit for develop → main

### Code Review Checklist

- [ ] Tests written and passing
- [ ] TypeScript strict mode without errors
- [ ] No leftover console.log
- [ ] Correct error handling
- [ ] Appropriate logging
- [ ] Documentation updated
- [ ] Acceptable performance (if API, < 500ms p95)

### Pair Programming

**Recommended sessions**:

- Auth & Security implementation
- Tenant provisioning logic
- Plugin SDK design
- Critical bug fixes

---

## Stack and Tools

### Development

| Tool       | Version | Use                   |
| ---------- | ------- | --------------------- |
| Node.js    | 20 LTS  | Runtime               |
| pnpm       | 8+      | Package manager       |
| Turborepo  | 1.10+   | Monorepo build system |
| TypeScript | 5.x     | Language              |
| ESLint     | 8.x     | Linting               |
| Prettier   | 3.x     | Formatting            |
| Vitest     | 1.x     | Testing               |
| Playwright | 1.x     | E2E testing           |

### Backend

| Tool    | Version | Use           |
| ------- | ------- | ------------- |
| Fastify | 4.x     | Web framework |
| Prisma  | 5.x     | ORM           |
| Zod     | 3.x     | Validation    |
| Pino    | 8.x     | Logging       |
| ioredis | 5.x     | Redis client  |

### Frontend

| Tool            | Version | Use                  |
| --------------- | ------- | -------------------- |
| Vite            | 5.x     | Build tool           |
| React           | 18+     | UI framework         |
| Material-UI     | 5.x     | Component library    |
| Zustand         | 4.x     | State management     |
| React Router    | 6.x     | Routing              |
| React Hook Form | 7.x     | Forms                |
| i18next         | 23.x    | Internationalization |

---

## Testing Strategy

### Test Pyramid

```
       /\
      /E2E\      (10% - Critical user flows)
     /------\
    /  API  \    (30% - Integration tests)
   /----------\
  /   Unit     \ (60% - Business logic)
 /--------------\
```

### Unit Tests

**Target**: 80% coverage of business logic code

**Tool**: Vitest

**What to test**:

- Services (business logic)
- Utilities and helpers
- Validators
- Permission matching logic

**Example**:

```typescript
// tenant.service.test.ts
describe('TenantService', () => {
  it('should create tenant with valid slug', async () => {
    const result = await tenantService.create({
      name: 'ACME Corp',
      slug: 'acme-corp',
    });

    expect(result.slug).toBe('acme-corp');
  });

  it('should reject invalid slug', async () => {
    await expect(tenantService.create({ name: 'Test', slug: 'Test Space' })).rejects.toThrow(
      'Invalid slug'
    );
  });
});
```

### Integration Tests

**Target**: All API endpoints

**Tool**: Vitest + Supertest-like

**What to test**:

- API endpoints (request → response)
- Database interactions
- Auth flow
- Error handling

**Example**:

```typescript
// tenant.api.test.ts
describe('POST /api/tenants', () => {
  it('should create tenant and return 201', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/tenants',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'Test', slug: 'test' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      name: 'Test',
      slug: 'test',
    });
  });
});
```

### E2E Tests

**Target**: Critical user flows

**Tool**: Playwright

**What to test**:

- Login flow
- Tenant creation (Super Admin)
- Plugin installation
- Base CRUD operations

**Example**:

```typescript
// tenant-creation.e2e.ts
test('Super Admin can create tenant', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[name=email]', 'admin@plexica.io');
  await page.fill('[name=password]', 'password');
  await page.click('button[type=submit]');

  await page.click('text=Tenants');
  await page.click('text=New Tenant');
  await page.fill('[name=name]', 'ACME Corp');
  await page.fill('[name=slug]', 'acme-corp');
  await page.click('button:has-text("Create")');

  await expect(page.locator('text=Tenant created')).toBeVisible();
});
```

---

## Deployment Strategy

### Development

**Tool**: Docker Compose

**Services**:

- PostgreSQL
- Redis (single node OK)
- Keycloak
- MinIO
- Core API
- Web app (dev server)

**Command**:

```bash
pnpm dev  # Start everything with hot reload
```

### Staging

**Tool**: Docker Compose (production-like)

**Services**: As development + nginx reverse proxy

**Deployment**:

```bash
docker-compose -f docker-compose.staging.yml up -d
```

### Production (Phase 2+)

**Tool**: Kubernetes + Helm

**Strategy**:

- Rolling updates
- Health checks
- Auto-scaling (HPA)
- Persistent volumes for stateful services

---

## Pre-MVP Release Checklist

### Functionality

- [x] Complete tenant provisioning
- [x] Working auth and RBAC
- [x] Operational base plugin system
- [x] 3+ working internal plugins (1 sample plugin completed)
- [ ] Complete frontend web app
- [ ] Complete Super Admin panel

### Quality

- [ ] Test coverage >80%
- [ ] Zero critical bugs
- [ ] Performance targets met (API < 500ms p95)
- [ ] Base security audit completed

### Documentation

- [ ] Setup guide
- [ ] API documentation
- [ ] Architecture documentation
- [ ] Plugin development guide

### Deployment

- [ ] Production-ready Docker Compose
- [ ] Working CI/CD pipeline
- [ ] Base monitoring (health checks)
- [ ] Backup strategy defined

---

_Plexica Development Plan v1.1_  
_Last Updated: January 13, 2026_  
_Status: Backend Complete (M1.1-M1.4), Frontend Pending_
