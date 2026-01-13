# Plexica - Development Plan

**Current Phase**: Pre-development  
**Last Updated**: January 2025

---

## Table of Contents

1. [Phase 1 - MVP Core](#phase-1---mvp-core)
2. [Development Strategies](#development-strategies)
3. [Stack and Tools](#stack-and-tools)
4. [Testing Strategy](#testing-strategy)
5. [Deployment Strategy](#deployment-strategy)

---

## Phase 1 - MVP Core

### Milestone 1.1 - Foundation (4 weeks)

#### Week 1: Monorepo Setup

**Tasks**:
```
[ ] Setup repository
    [ ] Initialize Git repository
    [ ] Configure .gitignore
    [ ] Setup pnpm workspace (pnpm-workspace.yaml)
    [ ] Setup Turborepo (turbo.json)
    [ ] Configure ESLint + Prettier (shared config)
    [ ] Setup TypeScript base config

[ ] Configure development tools
    [ ] Setup Vitest for testing
    [ ] Configure Husky for pre-commit hooks
    [ ] Setup commitlint for conventional commits
    [ ] Configure path aliases (@plexica/*)
```

**Deliverable**: Working monorepo with development tools

#### Week 2-3: Infrastructure Setup

**Tasks**:
```
[ ] Docker Compose for local development
    [ ] PostgreSQL 15 container
    [ ] Redis 7 cluster (3 nodes)
    [ ] Keycloak 23 container
    [ ] MinIO/S3 container
    [ ] PgAdmin for DB debug
    [ ] Redis Commander for cache debug

[ ] Prisma setup
    [ ] Install Prisma in packages/database
    [ ] Configure PostgreSQL datasource
    [ ] Create first schema (core)
    [ ] Setup migration workflow
    [ ] Seed script for test data

[ ] Keycloak configuration
    [ ] Setup master realm
    [ ] Create admin client for Core API
    [ ] Configure SMTP for email (Mailhog dev)
```

**Deliverable**: Working dev infrastructure, DB and Keycloak configured

#### Week 4: Core API Skeleton

**Tasks**:
```
[ ] apps/core-api setup
    [ ] Initialize Fastify app
    [ ] Configure env variables (.env.example)
    [ ] Setup Prisma client in app
    [ ] Configure logger (Pino)
    [ ] Health check endpoint
    [ ] OpenAPI/Swagger setup

[ ] Base shared packages
    [ ] @plexica/types: define initial interfaces
    [ ] @plexica/config: shared configurations
    [ ] @plexica/database: Prisma client wrapper

[ ] Base CI/CD
    [ ] GitHub Actions: lint and typecheck
    [ ] GitHub Actions: test runner
    [ ] GitHub Actions: build check
```

**Deliverable**: Working Core API with base endpoints

---

### Milestone 1.2 - Multi-Tenancy Core (4 weeks)

#### Week 5-6: Tenant Management

**Tasks**:
```
[ ] Core Prisma schema
    [ ] Model Tenant
    [ ] Model Plugin
    [ ] Model TenantPlugin
    [ ] Model SuperAdmin
    [ ] Migration 001_create_core_schema

[ ] Tenant Module (apps/core-api)
    [ ] tenant.controller.ts
        [ ] POST /api/tenants (create)
        [ ] GET /api/tenants (list)
        [ ] GET /api/tenants/:id (get)
        [ ] PATCH /api/tenants/:id (update)
        [ ] DELETE /api/tenants/:id (delete)
    [ ] tenant.service.ts
        [ ] CRUD business logic
        [ ] Slug validation (alphanumeric, lowercase)
    [ ] tenant.repository.ts
        [ ] Data access layer
    [ ] tenant.schema.ts
        [ ] Zod validation schemas

[ ] Testing
    [ ] Unit tests tenant.service
    [ ] Integration tests tenant API
```

**Deliverable**: Working tenant CRUD (without provisioning)

#### Week 7-8: Tenant Provisioning

**Tasks**:
```
[ ] Provisioning Service
    [ ] provisioning.service.ts
        [ ] createTenantSchema(slug): create PostgreSQL schema
        [ ] createKeycloakRealm(slug): create Keycloak realm
        [ ] createStorageBucket(slug): create MinIO bucket
        [ ] seedTenantData(slug): insert initial data
        [ ] orchestrateProvisioning(): coordinate all operations

[ ] Tenant schema template
    [ ] Create migration template in packages/database
    [ ] Script to apply template to new schema
    [ ] Seed base data (roles, core permissions)

[ ] Keycloak Admin Client integration
    [ ] keycloak.service.ts
    [ ] createRealm()
    [ ] createClients (web, api)
    [ ] createBaseRoles()

[ ] Base Storage Service
    [ ] storage.service.ts
    [ ] MinIO client setup
    [ ] createBucket()
    [ ] Tenant isolation enforcement

[ ] Cleanup & Rollback
    [ ] Implement rollback on provisioning error
    [ ] deleteTenantSchema()
    [ ] deleteKeycloakRealm()
    [ ] deleteStorageBucket()

[ ] Testing
    [ ] Integration test complete provisioning
    [ ] Test rollback on error
```

**Deliverable**: Working automatic tenant provisioning

---

### Milestone 1.3 - Authentication & Authorization (4 weeks)

#### Week 9-10: Keycloak Integration

**Tasks**:
```
[ ] JWT Service
    [ ] jwt.service.ts
    [ ] verifyToken(): validate JWT with JWKS
    [ ] extractTenantSlug(): extract tenant from realm
    [ ] Cache token validation (Redis)

[ ] Auth Module
    [ ] auth.controller.ts
        [ ] POST /api/auth/login (redirect to Keycloak)
        [ ] GET /api/auth/callback (handle callback)
        [ ] POST /api/auth/logout
        [ ] GET /api/auth/me (user info)
    [ ] auth.service.ts
        [ ] Token exchange management
        [ ] Refresh token logic

[ ] Guards (Fastify hooks)
    [ ] auth.guard.ts: verify JWT
    [ ] tenant.guard.ts: validate tenant and set context
    [ ] Decorators to apply guards

[ ] Tenant Context
    [ ] tenant-context.ts (AsyncLocalStorage)
    [ ] TenantContextService
    [ ] Middleware to set context from JWT

[ ] Testing
    [ ] Unit tests JWT service
    [ ] Integration tests auth flow
    [ ] Test context propagation
```

**Deliverable**: Complete auth with JWT validation

#### Week 11-12: RBAC System

**Tasks**:
```
[ ] Tenant Prisma schema (RBAC)
    [ ] Model Role
    [ ] Model Permission
    [ ] Model RolePermission
    [ ] Model UserRole
    [ ] Updated migration template

[ ] Permission Module
    [ ] permission.controller.ts
        [ ] CRUD permissions
        [ ] CRUD roles
        [ ] Assign role to user
    [ ] permission.service.ts
        [ ] checkPermission(userId, permission)
        [ ] getUserPermissions(userId)
        [ ] matchesPermission() (wildcard support)
    [ ] Cache permissions per user (Redis)

[ ] Permission Guard
    [ ] permission.guard.ts
    [ ] Decorator @RequirePermissions()
    [ ] Example usage in controllers

[ ] Seed core permissions
    [ ] users:read, users:write, users:delete
    [ ] teams:read, teams:write
    [ ] settings:read, settings:write
    [ ] Base roles: super_admin, tenant_admin, user

[ ] Testing
    [ ] Unit tests permission matching
    [ ] Integration tests permission check
    [ ] E2E test auth + authorization flow
```

**Deliverable**: Complete and working RBAC

---

### Milestone 1.4 - Plugin System Base (4 weeks)

#### Week 13-14: Plugin SDK

**Tasks**:
```
[ ] packages/sdk setup
    [ ] PlexicaPlugin base class
    [ ] Lifecycle hooks (onInstall, onEnable, onDisable)
    [ ] Database client wrapper (uses Prisma)
    [ ] Logger wrapper
    [ ] Context access (tenant, user)

[ ] Decorators
    [ ] @Route(method, path)
    [ ] @Permission(permission)
    [ ] @EventHandler(eventType)

[ ] Plugin Manifest interface
    [ ] PluginManifest type in @plexica/types
    [ ] JSON Schema for validation

[ ] SDK Documentation
    [ ] README with examples
    [ ] API reference
    [ ] Getting started guide

[ ] Testing
    [ ] Unit tests SDK base
    [ ] Mock plugin for testing
```

**Deliverable**: Publishable SDK on npm (version 0.1.0)

#### Week 15-16: Plugin Registry & Loader

**Tasks**:
```
[ ] Plugin Module
    [ ] plugin-registry.service.ts
        [ ] register(manifest)
        [ ] get(pluginId)
        [ ] list()
        [ ] validateManifest()
    [ ] plugin-loader.service.ts
        [ ] installPlugin(pluginId, tenantSlug)
        [ ] enablePlugin(pluginId, tenantSlug)
        [ ] disablePlugin(pluginId, tenantSlug)
        [ ] uninstallPlugin(pluginId, tenantSlug)
    [ ] plugin-migration.service.ts
        [ ] applyPluginMigrations()
        [ ] loadPluginMigrationFiles()

[ ] Docker deployment for plugins
    [ ] docker.service.ts
    [ ] deployPlugin(): pull + run container
    [ ] stopPlugin()
    [ ] Plugin network isolation

[ ] Plugin proxy
    [ ] plugin-proxy.service.ts
    [ ] Forward requests to plugin containers
    [ ] Add headers (X-Tenant-ID, X-User-ID)

[ ] Testing
    [ ] Integration test install/enable/disable
    [ ] Test plugin container lifecycle
    [ ] Test migration application
```

**Deliverable**: Working plugin system with first test plugin

---

### Milestone 1.5 - Frontend Web App (4 weeks)

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

| Tool | Version | Use |
|------|----------|-----|
| Node.js | 20 LTS | Runtime |
| pnpm | 8+ | Package manager |
| Turborepo | 1.10+ | Monorepo build system |
| TypeScript | 5.x | Language |
| ESLint | 8.x | Linting |
| Prettier | 3.x | Formatting |
| Vitest | 1.x | Testing |
| Playwright | 1.x | E2E testing |

### Backend

| Tool | Version | Use |
|------|----------|-----|
| Fastify | 4.x | Web framework |
| Prisma | 5.x | ORM |
| Zod | 3.x | Validation |
| Pino | 8.x | Logging |
| ioredis | 5.x | Redis client |

### Frontend

| Tool | Version | Use |
|------|----------|-----|
| Vite | 5.x | Build tool |
| React | 18+ | UI framework |
| Material-UI | 5.x | Component library |
| Zustand | 4.x | State management |
| React Router | 6.x | Routing |
| React Hook Form | 7.x | Forms |
| i18next | 23.x | Internationalization |

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
      slug: 'acme-corp'
    });
    
    expect(result.slug).toBe('acme-corp');
  });
  
  it('should reject invalid slug', async () => {
    await expect(
      tenantService.create({ name: 'Test', slug: 'Test Space' })
    ).rejects.toThrow('Invalid slug');
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
      payload: { name: 'Test', slug: 'test' }
    });
    
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      name: 'Test',
      slug: 'test'
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

- [ ] Complete tenant provisioning
- [ ] Working auth and RBAC
- [ ] Operational base plugin system
- [ ] 3+ working internal plugins
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

*Plexica Development Plan v1.0*  
*Last Updated: January 2025*
