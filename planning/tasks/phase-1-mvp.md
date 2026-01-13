# Phase 1 - MVP Core - Task Breakdown

Detailed tasks for Milestone 1.1 - 1.7

---

## M1.1 - Foundation (Week 1-4)

### Setup Monorepo

```
[ ] T1.1.1: Initialize Git repository
    Estimate: 0.5h
    Owner: DevOps
    
[ ] T1.1.2: Setup pnpm workspace
    - Create pnpm-workspace.yaml
    - Configure root package.json
    Estimate: 1h
    Owner: DevOps
    
[ ] T1.1.3: Setup Turborepo
    - Install turborepo
    - Configure turbo.json (pipeline)
    - Test build/dev/lint tasks
    Estimate: 2h
    Owner: DevOps

[ ] T1.1.4: Setup ESLint + Prettier
    - packages/config/eslint
    - packages/config/prettier
    - Configure pre-commit hooks (Husky)
    Estimate: 2h
    Owner: DevOps

[ ] T1.1.5: Setup base TypeScript
    - packages/config/typescript
    - tsconfig.base.json
    - tsconfig for apps and packages
    Estimate: 2h
    Owner: DevOps
```

### Infrastructure Setup

```
[ ] T1.1.6: Docker Compose development
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

## M1.2 - Multi-Tenancy Core (Week 5-8)

### Tenant CRUD

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

## M1.3 - Authentication & Authorization (Week 9-12)

### JWT & Auth

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

*Phase 1 MVP Task Breakdown*  
*Last Updated: January 2025*
