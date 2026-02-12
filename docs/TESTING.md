# Testing Guide - Plexica

**Last Updated**: February 11, 2026  
**Status**: Comprehensive guide for all Plexica testing

---

## 📊 Test Suite Overview

### Current Statistics

| Metric                 | Value                  | Status           |
| ---------------------- | ---------------------- | ---------------- |
| **Total Tests**        | 1,855+                 | 🟢 Comprehensive |
| **Backend (core-api)** | 1,047 tests (64 files) | 🟢 Complete      |
| **Frontend E2E**       | 169 tests (15 files)   | ✅ Complete      |
| **Packages**           | 639+ tests (13 files)  | 🟢 Complete      |
| **Coverage**           | 63% lines              | 🟡 Target: 80%   |
| **Pass Rate**          | 100%\*                 | ✅ Excellent     |
| **Test Duration**      | ~8 min (CI)            | ✅ Optimized     |

\*When test infrastructure is running

### Backend Test Breakdown

| Module        | Unit | Integration | E2E  | Total  | Files | Coverage  |
| ------------- | ---- | ----------- | ---- | ------ | ----- | --------- |
| **Auth**      | ~150 | ~50         | ~30  | ~230   | 10    | ~75%      |
| **Tenant**    | ~180 | ~40         | ~50  | ~270   | 10    | ~70%      |
| **Workspace** | ~200 | ~60         | ~40  | ~300   | 11    | ~65%      |
| **Plugin**    | ~150 | ~50         | ~40  | ~240   | 13    | 87.65% ✅ |
| **Services**  | ~20  | -           | -    | ~20    | 4     | ~50%      |
| **Other**     | -    | -           | -    | ~87    | 16    | Varies    |
| **TOTAL**     | ~700 | ~200        | ~160 | ~1,047 | 64    | **63%**   |

### Frontend Test Breakdown (Playwright E2E)

| App             | Test Files | Tests | Status      |
| --------------- | ---------- | ----- | ----------- |
| **Super-Admin** | 9          | 105   | ✅ Complete |
| **Web App**     | 6          | 64    | ✅ Complete |
| **TOTAL**       | 15         | 169   | ✅ Complete |

---

## 🚀 Quick Start (5 Minutes)

### Step 1: Start Test Infrastructure

```bash
cd test-infrastructure
./scripts/test-setup.sh
```

Wait ~30 seconds for services to start. Verify services:

```bash
./scripts/test-check.sh
```

You should see:

- ✅ PostgreSQL (port 5433)
- ✅ Keycloak (port 8081)
- ✅ Redis (port 6380)
- ✅ MinIO (ports 9010, 9011)

### Step 2: Run Tests

```bash
cd apps/core-api

# Run ALL tests (1,047 tests - ~3-5 min)
pnpm test

# By type (faster)
pnpm test:unit                  # Unit tests only (~30s)
pnpm test:integration           # Integration tests (~90s)
pnpm test:e2e                   # E2E tests (~2 min)

# With coverage report
pnpm test:coverage

# Watch mode (for TDD development)
pnpm test --watch

# Interactive UI dashboard
pnpm test --ui
```

### Step 3: Run Frontend E2E Tests

```bash
# Super-admin E2E tests (105 tests)
cd apps/super-admin
pnpm test:e2e

# Web app E2E tests (64 tests)
cd apps/web
pnpm test:e2e
```

---

## 🧪 Test Types

### Test Pyramid

```
         /\
        /  \        E2E Tests (~160 backend + 169 frontend)
       /____\       - Critical user paths
      /      \      - Full stack testing
     /        \     - Slow but comprehensive
    /__________\
   /            \
  /              \  Integration Tests (~200 tests)
 /________________\ - API endpoints, Services
                    - Medium speed
                    - Real database

Unit Tests (~700 tests)
- Business logic, Utilities
- Fast execution (<30s)
- Fully mocked dependencies
```

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
pnpm test:unit              # All unit tests
pnpm test:unit -- auth/     # Auth unit tests only
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
pnpm test:integration           # All integration tests
pnpm test:integration -- tenant/  # Tenant integration tests
```

### E2E Tests - Backend (160+ tests)

**Purpose**: Test complete user workflows across full system stack

**Characteristics**:

- Slower execution (~2 minutes)
- Real services (PostgreSQL, Keycloak, Redis)
- No mocks - actual system behavior
- Full stack testing from API to database

**Examples**:

- `auth/e2e/cross-tenant-security.e2e.test.ts` - Multi-tenant security
- `workspace/e2e/workspace-collaboration.e2e.test.ts` - Team collaboration
- `plugin/e2e/plugin-ecosystem.e2e.test.ts` - Plugin interactions

**Run E2E Tests**:

```bash
pnpm test:e2e        # All backend E2E tests
```

### E2E Tests - Frontend (169 tests)

**Purpose**: Test complete user workflows from UI with Playwright

**Characteristics**:

- Browser automation (Chromium)
- Real user interactions
- Visual regression detection
- Cross-browser compatibility

**Examples**:

- `apps/super-admin/tests/e2e/tenant-management.spec.ts` - Tenant CRUD (super-admin)
- `apps/web/tests/e2e/workspace-creation.spec.ts` - Workspace workflows (tenant UI)

**Run Frontend E2E**:

```bash
# Super-admin tests (105 tests)
cd apps/super-admin
pnpm test:e2e

# Web app tests (64 tests)
cd apps/web
pnpm test:e2e

# Headed mode (see browser)
pnpm test:e2e --headed

# Specific test file
pnpm test:e2e tests/e2e/tenant-management.spec.ts
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
- Phase 1 (63% → 70%) & Phase 2 (70% → 80%)
- Module-by-module action items
- 6-week implementation timeline
- Success criteria and tracking metrics

---

## 💻 Development Workflow

### TDD Workflow (Recommended)

```bash
# 1. Start test infrastructure (one time)
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

### Module-Specific Testing

```bash
cd apps/core-api

# Test by module
pnpm test -- auth/              # Auth module
pnpm test -- tenant/            # Tenant module
pnpm test -- workspace/         # Workspace module
pnpm test -- plugin/            # Plugin module

# Test specific file
pnpm test auth/unit/auth.middleware.test.ts
pnpm test tenant/integration/tenant-api.integration.test.ts
pnpm test workspace/e2e/workspace-lifecycle.e2e.test.ts
```

---

## 🧹 Test Infrastructure Management

### Services & Ports

Test infrastructure runs isolated services on different ports:

- **PostgreSQL** (port 5433) - Test database
- **Keycloak** (port 8081) - Identity provider
- **Redis** (port 6380) - Caching layer
- **MinIO** (ports 9010/9011) - Object storage

### Management Commands

```bash
cd test-infrastructure

# Start all services (~30 seconds)
./scripts/test-setup.sh

# Check service status
./scripts/test-check.sh

# Reset test data (between test runs)
./scripts/test-reset.sh

# Stop all services
./scripts/test-teardown.sh
```

### Test Database

- **Database**: PostgreSQL (port 5433)
- **Database Name**: `plexica_test`
- **Connection String**: `postgresql://postgres:postgres@localhost:5433/plexica_test`
- **Reset Between**: Before integration/E2E test suites
- **Migrations**: Automatic via Prisma

### Test Data & Credentials

**Default Test Users**:

- **Super Admin**: `super-admin@test.local` / `test123`
- **Tenant Admin**: `admin@acme-corp.local` / `test123`
- **Tenant Member**: `member@acme-corp.local` / `test123`

**Test Tenants**:

- `acme-corp` (schema: `tenant_acme_corp`)
- `demo-company` (schema: `tenant_demo_company`)

### Environment Configuration

Create `.env.test` in `apps/core-api/`:

```env
NODE_ENV=test
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/plexica_test
REDIS_URL=redis://localhost:6380/0
KEYCLOAK_URL=http://localhost:8081
KEYCLOAK_REALM=plexica-test
KEYCLOAK_CLIENT_ID=plexica-test-client
```

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
cd apps/core-api
pnpm db:migrate
```

### Keycloak Issues

```bash
# Restart Keycloak and wait for startup (~30s)
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

### Port Already in Use

```bash
# Find process using port 5433
lsof -i :5433

# Kill process if needed
kill -9 <PID>

# Or stop conflicting Docker containers
docker ps
docker stop <container-id>
```

---

## ✅ Best Practices

### Writing Good Tests

1. **Test behavior, not implementation**
   - Focus on "what" not "how"
   - Tests should survive refactoring

2. **Use descriptive test names**

   ```typescript
   // ✅ Good
   it('should return 404 when tenant does not exist');

   // ❌ Bad
   it('test tenant not found');
   ```

3. **Follow Arrange-Act-Assert (AAA) pattern**

   ```typescript
   it('should create workspace', async () => {
     // Arrange - Set up test data
     const data = { name: 'Eng', slug: 'eng' };

     // Act - Execute code under test
     const workspace = await createWorkspace(data);

     // Assert - Verify results
     expect(workspace.name).toBe('Eng');
   });
   ```

4. **Keep tests independent**
   - Each test should run in isolation
   - Use `beforeEach` for shared setup
   - Clean up after tests

5. **Test both success and failure paths**
   - Happy path: Feature works as expected
   - Error cases: Proper error handling
   - Edge cases: Boundary conditions

### Mocking Guidelines

1. **Mock external dependencies**
   - Third-party APIs
   - File system operations
   - Network calls

2. **Don't mock what you own**
   - Test real services in integration tests
   - Use real database in integration/E2E tests

3. **Use minimal mocks**
   - Only mock what's necessary
   - Prefer real instances when fast enough

### Test Organization

- **Unit tests**: `src/__tests__/<module>/unit/`
- **Integration tests**: `src/__tests__/<module>/integration/`
- **E2E tests**: `src/__tests__/<module>/e2e/`
- **Test utilities**: `src/__tests__/setup/`
- **Fixtures**: `src/__tests__/fixtures/`

---

## 🎓 CI/CD Integration

### GitHub Actions Workflow

Tests run automatically on PR and merge:

- ✅ Unit tests (fast, ~30s)
- ✅ Linting and type checks
- ✅ Build verification
- ✅ Integration tests (with services, ~90s)
- ✅ E2E tests (full stack, ~2min)
- ✅ Coverage reporting

**Total pipeline**: ~8 minutes

### Coverage Requirements

Pull requests must maintain:

- Overall coverage: ≥80% (target)
- No decrease in coverage without justification
- All modules above 75% (or documented exceptions)

See [CI/CD Documentation](../.github/docs/CI_CD_DOCUMENTATION.md) for details.

---

## 📚 Related Documentation

### Specialized Testing Guides

- **[Backend Testing](./testing/BACKEND_TESTING.md)** - Backend API and service testing details
  - Vitest configuration
  - API testing with Supertest
  - Database testing strategies
  - Mocking patterns

- **[Frontend Testing](./testing/FRONTEND_TESTING.md)** - Frontend E2E testing with Playwright
  - Playwright configuration
  - Component testing
  - E2E workflow testing
  - Visual regression testing

- **[E2E Testing](./testing/E2E_TESTING.md)** - Complete end-to-end testing workflows
  - Cross-module workflows
  - Multi-tenant scenarios
  - User journey testing
  - Performance testing

### Project Documentation

- **[Coverage Improvement Plan](../specs/TEST_COVERAGE_IMPROVEMENT_PLAN.md)** - Roadmap to 80% coverage
- **[Test Infrastructure](../test-infrastructure/README.md)** - Infrastructure setup details
- **[Test Infrastructure Troubleshooting](../test-infrastructure/TROUBLESHOOTING.md)** - Common issues
- **[AGENTS Guide](../AGENTS.md#testing-core-api-main-package)** - Testing guidelines for AI agents

---

## 📖 Contributing

When adding new features:

1. **Write tests first** (TDD approach preferred)
2. **Maintain coverage** (don't decrease overall coverage)
3. **Update documentation** (this guide and specific modules)
4. **Run full test suite** before submitting PR

```bash
# Full pre-PR checklist
cd apps/core-api
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm build
```

See [Contributing Guide](./CONTRIBUTING.md) for details.

---

## 🎓 External Resources

- **[Vitest Documentation](https://vitest.dev/)** - Test runner
- **[Testing Library](https://testing-library.com/)** - Component testing
- **[Playwright](https://playwright.dev/)** - Frontend E2E
- **[Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)** - Community standards

---

**Quick Links**:

- Backend Health: http://localhost:3000/health
- Keycloak: http://localhost:8081
- Test Infrastructure: [`test-infrastructure/README.md`](../test-infrastructure/README.md)

**Last Updated**: February 11, 2026  
**Version**: 2.0 (Consolidated from multiple sources)
