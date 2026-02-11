# Testing Guide

**Last Updated**: February 11, 2026  
**Status**: Complete guide for all Plexica testing

---

## 📊 Test Suite Overview

### Current Statistics

| Metric            | Value                | Status           |
| ----------------- | -------------------- | ---------------- |
| **Total Tests**   | 1,855+               | 🟢 Comprehensive |
| **Backend Tests** | 1,047 (64 files)     | 🟢 Complete      |
| **Frontend E2E**  | 169 tests (15 files) | ✅ Complete      |
| **Coverage**      | 63% lines            | 🟡 Target: 80%   |
| **Pass Rate**     | 100%\*               | ✅ Excellent     |
| **Test Duration** | ~8 min (CI)          | ✅ Optimized     |

\*When test infrastructure is running

### Test Breakdown by Module

| Module        | Unit | Integration | E2E | Total    | Coverage  |
| ------------- | ---- | ----------- | --- | -------- | --------- |
| **Auth**      | 5    | 2           | 3   | 10 files | ~75%      |
| **Tenant**    | 6    | 1           | 3   | 10 files | ~70%      |
| **Workspace** | 6    | 2           | 3   | 11 files | ~65%      |
| **Plugin**    | 7    | 3           | 3   | 13 files | 87.65% ✅ |
| **Services**  | -    | -           | -   | 4 files  | ~50%      |
| **Other**     | -    | -           | -   | 16 files | Varies    |
| **TOTAL**     | ~27  | ~10         | ~12 | 64 files | **63%**   |

---

## 🚀 Quick Start

### Prerequisites

1. **Start test infrastructure** (only need to do this once):

   ```bash
   cd test-infrastructure
   ./scripts/test-setup.sh
   ```

2. **Verify services are running**:

   ```bash
   ./scripts/test-check.sh
   ```

   You should see:
   - ✅ PostgreSQL (port 5433)
   - ✅ Keycloak (port 8081)
   - ✅ Redis (port 6380)
   - ✅ MinIO (ports 9010, 9011)

### Running Tests

```bash
cd apps/core-api

# Run ALL tests (1,047 tests - ~3-5 min)
pnpm test

# By type
pnpm test:unit                  # Unit tests only (~30s)
pnpm test:integration           # Integration tests (~90s)
pnpm test:e2e                   # E2E tests (~2 min)

# Coverage report (current: 63%, target: 80%)
pnpm test:coverage

# Watch mode (for TDD)
pnpm test --watch

# Interactive UI dashboard
pnpm test --ui
```

### Module-Specific Tests

```bash
cd apps/core-api

# Auth module tests
pnpm test -- auth/

# Tenant module tests
pnpm test -- tenant/

# Workspace module tests
pnpm test -- workspace/

# Plugin module tests
pnpm test -- plugin/
```

### Individual Test Files

```bash
# Unit tests
pnpm test auth/unit/auth.middleware.test.ts
pnpm test auth/unit/jwt.test.ts
pnpm test tenant/unit/tenant.service.test.ts

# Integration tests
pnpm test auth/integration/auth-flow.integration.test.ts
pnpm test tenant/integration/tenant-api.integration.test.ts

# E2E tests
pnpm test auth/e2e/cross-tenant-security.e2e.test.ts
pnpm test workspace/e2e/workspace-lifecycle.e2e.test.ts
```

---

## 🧪 Test Types

### Unit Tests (700+ tests)

**Purpose**: Test individual functions and services in isolation with mocked dependencies

**Characteristics**:

- Fast execution (~30 seconds for all ~700 unit tests)
- Fully mocked dependencies
- No database required
- No external services required

**Examples**:

- `auth/unit/jwt.test.ts` - JWT token verification
- `tenant/unit/tenant.service.test.ts` - Tenant business logic
- `workspace/unit/workspace-permissions.test.ts` - Permission matrix
- `plugin/unit/plugin-lifecycle.test.ts` - Plugin state transitions

**Run Unit Tests**:

```bash
pnpm test:unit        # All unit tests
pnpm test:unit -- auth/      # Auth unit tests only
```

### Integration Tests (200+ tests)

**Purpose**: Test multiple components working together with real database but mocked external services

**Characteristics**:

- Medium execution (~90 seconds)
- Real PostgreSQL database
- Real Redis cache
- Mocked Keycloak and external APIs
- Tests API endpoints and database operations

**Examples**:

- `auth/integration/auth-flow.integration.test.ts` - Auth API endpoints
- `tenant/integration/tenant-api.integration.test.ts` - Tenant CRUD operations
- `workspace/integration/workspace-members.integration.test.ts` - Member management
- `plugin/integration/plugin-lifecycle.integration.test.ts` - Plugin workflows

**Run Integration Tests**:

```bash
pnpm test:integration        # All integration tests
pnpm test:integration -- tenant/  # Tenant integration tests
```

### E2E Tests (160+ tests)

**Purpose**: Test complete user workflows across full system stack

**Characteristics**:

- Slower execution (~2 minutes)
- Real services (PostgreSQL, Keycloak, Redis)
- No mocks - actual system behavior
- Full stack testing from API to database

**Backend E2E** (Vitest):

- `auth/e2e/cross-tenant-security.e2e.test.ts` - Multi-tenant security
- `workspace/e2e/workspace-collaboration.e2e.test.ts` - Team collaboration
- `plugin/e2e/plugin-ecosystem.e2e.test.ts` - Plugin interactions

**Frontend E2E** (Playwright):

- `apps/super-admin/tests/e2e/*.spec.ts` - 105 tests (super-admin UI)
- `apps/web/tests/e2e/*.spec.ts` - 64 tests (tenant web app)

**Run E2E Tests**:

```bash
# Backend E2E
pnpm test:e2e        # All backend E2E tests

# Frontend E2E
cd apps/super-admin
pnpm test:e2e

cd apps/web
pnpm test:e2e
```

---

## 📁 Test Organization

### Backend Test Structure

```
apps/core-api/src/__tests__/
├── setup/                              # Test configuration (6 files)
│   ├── unit-setup.ts
│   ├── integration-setup.ts
│   ├── e2e-setup.ts
│   ├── coverage-setup.ts
│   └── ...
├── auth/                               # Auth Module (10 tests)
│   ├── unit/                           # 5 files
│   ├── integration/                    # 2 files
│   └── e2e/                            # 3 files
├── tenant/                             # Tenant Module (10 tests)
│   ├── unit/                           # 6 files
│   ├── integration/                    # 1 file
│   └── e2e/                            # 3 files
├── workspace/                          # Workspace Module (11 tests)
│   ├── unit/                           # 6 files
│   ├── integration/                    # 2 files
│   └── e2e/                            # 3 files
├── plugin/                             # Plugin Module (13 tests)
│   ├── unit/                           # 7 files
│   ├── integration/                    # 3 files
│   └── e2e/                            # 3 files
└── [services, lib, examples, etc.]
```

### Frontend Test Structure

```
apps/super-admin/tests/e2e/
├── *.spec.ts                           # 9 Playwright specs (105 tests)
├── fixtures/                           # Test data
│   └── test-data.ts
├── helpers/                            # Test utilities
│   ├── api-mocks.ts
│   └── test-helpers.ts
└── [global-setup.ts, auth.ts, etc.]

apps/web/tests/e2e/
├── *.spec.ts                           # 6 Playwright specs (64 tests)
├── fixtures/                           # Test data
├── helpers/                            # Test utilities
└── [playwright.config.ts, etc.]
```

---

## 🎯 Coverage Targets

### Current Status

| Component      | Current | Target | Gap  | Status         |
| -------------- | ------- | ------ | ---- | -------------- |
| **Lines**      | 63.16%  | 80%    | +17% | 🟡 In Progress |
| **Statements** | 63.09%  | 80%    | +17% | 🟡 In Progress |
| **Functions**  | 64.11%  | 80%    | +16% | 🟡 In Progress |
| **Branches**   | 56.93%  | 75%    | +18% | 🟡 In Progress |

### Module Coverage Targets

| Module         | Current | Target | Status         |
| -------------- | ------- | ------ | -------------- |
| **Auth**       | ~75%    | 85%    | 🟡 Close       |
| **Tenant**     | ~70%    | 85%    | 🟡 In Progress |
| **Workspace**  | ~65%    | 85%    | 🟡 In Progress |
| **Plugin**     | 87.65%  | 90%    | ✅ Good        |
| **Services**   | ~50%    | 80%    | 🔴 Needs Work  |
| **Middleware** | ~60%    | 90%    | 🟡 In Progress |
| **Utilities**  | ~40%    | 70%    | 🔴 Needs Work  |

### Coverage Improvement Plan

See [`/specs/TEST_COVERAGE_IMPROVEMENT_PLAN.md`](../specs/TEST_COVERAGE_IMPROVEMENT_PLAN.md) for:

- Detailed roadmap to reach 80% coverage
- Module-by-module action items
- 6-week implementation timeline
- Success criteria and tracking metrics

---

## 💻 Development Workflow

### TDD Workflow (Recommended)

```bash
# 1. Start test infrastructure
cd test-infrastructure
./scripts/test-setup.sh

# 2. Run tests in watch mode in one terminal
cd apps/core-api
pnpm test --watch

# 3. Write failing test, implement feature, repeat
# (Your editor in another terminal)

# 4. Check coverage periodically
pnpm test:coverage

# 5. When done, stop services
cd test-infrastructure
./scripts/test-teardown.sh
```

### Before Committing

```bash
cd apps/core-api

# Run all tests
pnpm test

# Check coverage
pnpm test:coverage

# Verify linting and types
pnpm lint
pnpm typecheck

# Run build
pnpm build
```

---

## 🧹 Test Infrastructure Management

### Start/Stop Services

```bash
cd test-infrastructure

# Start services
./scripts/test-setup.sh

# Check status
./scripts/test-check.sh

# Reset test data
./scripts/test-reset.sh

# Stop services
./scripts/test-teardown.sh
```

### Test Database

- **Database**: PostgreSQL (port 5433)
- **Database Name**: `plexica_test`
- **Connection String**: `postgresql://postgres:postgres@localhost:5433/plexica_test`
- **Reset Between**: Before integration/E2E test suites

### Test Credentials

**Super Admin User**:

- Email: `super-admin@test.local`
- Password: `test123`
- Keycloak ID: `test-super-admin`

**Tenant Admin User**:

- Email: `admin@acme-corp.local`
- Password: `test123`
- Keycloak ID: `test-tenant-admin-acme`

**Tenant Member User**:

- Email: `member@acme-corp.local`
- Password: `test123`
- Keycloak ID: `test-tenant-member-acme`

**Test Tenants**:

- `acme-corp` (schema: `tenant_acme_corp`)
- `demo-company` (schema: `tenant_demo_company`)

---

## 🔍 Troubleshooting

### Tests Fail with Connection Errors

```bash
# Check service status
cd test-infrastructure
./scripts/test-check.sh

# Restart services if needed
./scripts/test-setup.sh

# View service logs
docker logs plexica-postgres-test
docker logs plexica-keycloak-test
docker logs plexica-redis-test
```

### Database Schema Errors

```bash
# Reset database and schemas
cd test-infrastructure
./scripts/test-reset.sh

# Verify migration
pnpm db:migrate
```

### Keycloak Issues

```bash
# Restart Keycloak and wait for startup
docker restart plexica-keycloak-test
sleep 30

# Verify it's ready
curl http://localhost:8081/health
```

### Tests Hang or Timeout

```bash
# Check if services are stuck
docker ps

# Force restart
cd test-infrastructure
./scripts/test-teardown.sh
./scripts/test-setup.sh
```

### Clear Test Cache

```bash
cd apps/core-api
pnpm test --clearCache
```

---

## 📚 More Information

- **Backend Testing Details**: [`docs/testing/BACKEND_TESTING.md`](./testing/BACKEND_TESTING.md)
- **Frontend Testing Details**: [`docs/testing/FRONTEND_TESTING.md`](./testing/FRONTEND_TESTING.md)
- **E2E Testing Guide**: [`docs/testing/E2E_TESTING.md`](./testing/E2E_TESTING.md)
- **Coverage Improvement**: [`specs/TEST_COVERAGE_IMPROVEMENT_PLAN.md`](../specs/TEST_COVERAGE_IMPROVEMENT_PLAN.md)
- **Test Infrastructure**: [`test-infrastructure/README.md`](../test-infrastructure/README.md)
- **AGENTS Guide**: [`AGENTS.md`](../AGENTS.md#testing-core-api-main-package)
