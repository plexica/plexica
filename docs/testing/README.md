# Plexica Testing Documentation

**Last Updated**: February 11, 2026  
**Status**: Comprehensive testing guide for all Plexica components

---

## 📊 Test Suite Overview

### Current Test Statistics

| Metric                 | Value                  | Status           |
| ---------------------- | ---------------------- | ---------------- |
| **Total Tests**        | 1,855+                 | 🟢 Comprehensive |
| **Backend (core-api)** | 1,047 tests (64 files) | 🟢 Complete      |
| **Frontend E2E**       | 169 tests (15 files)   | ✅ Complete      |
| **Packages**           | 639+ tests (13 files)  | 🟢 Complete      |
| **Coverage**           | 63% lines              | 🟡 Target: 80%   |
| **Pass Rate**          | 100%\*                 | ✅ Excellent     |

\*When test infrastructure is running

### Backend Test Breakdown

| Module        | Unit | Integration | E2E  | Total  | Files |
| ------------- | ---- | ----------- | ---- | ------ | ----- |
| **Auth**      | ~150 | ~50         | ~30  | ~230   | 10    |
| **Tenant**    | ~180 | ~40         | ~50  | ~270   | 10    |
| **Workspace** | ~200 | ~60         | ~40  | ~300   | 11    |
| **Plugin**    | ~150 | ~50         | ~40  | ~240   | 13    |
| **Services**  | ~20  | -           | -    | ~20    | 4     |
| **Other**     | -    | -           | -    | ~87    | 16    |
| **TOTAL**     | ~700 | ~200        | ~160 | ~1,047 | 64    |

### Frontend Test Breakdown (Playwright E2E)

| App             | Test Files | Tests | Status      |
| --------------- | ---------- | ----- | ----------- |
| **Super-Admin** | 9          | 105   | ✅ Complete |
| **Web App**     | 6          | 64    | ✅ Complete |
| **TOTAL**       | 15         | 169   | ✅ Complete |

---

## 📁 Documentation Structure

### Core Testing Guides

- **[BACKEND_TESTING.md](./BACKEND_TESTING.md)** - Backend API and service testing
  - Unit tests for services (700+ tests)
  - Integration tests for APIs (200+ tests)
  - Database testing strategies
  - Mocking and test fixtures

- **[FRONTEND_TESTING.md](./FRONTEND_TESTING.md)** - Frontend component and flow testing
  - Playwright configuration
  - E2E workflow testing (169 tests)
  - Super-admin panel testing (105 tests)
  - Web app testing (64 tests)

- **[E2E_TESTING.md](./E2E_TESTING.md)** - End-to-end testing
  - Complete user workflows
  - Backend E2E scenarios (~160 tests)
  - Frontend E2E scenarios (~169 tests)
  - Multi-tenant scenarios

- **[QUICK_TEST.md](./QUICK_TEST.md)** - Quick testing guide
  - 5-minute smoke tests
  - Essential verification steps
  - Common troubleshooting

---

## 🧪 Testing Strategy

### Test Pyramid

```
         /\
        /  \        E2E Tests (~160 tests)
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

### Coverage Status

| Layer                 | Coverage | Target  | Gap      | Status         |
| --------------------- | -------- | ------- | -------- | -------------- |
| **Unit Tests**        | ~63%     | 80%     | +17%     | 🟡 In Progress |
| **Integration Tests** | ~65%     | 70%     | +5%      | 🟡 Close       |
| **E2E Tests**         | ~70%     | 50%     | ✅ Met   | ✅ Good        |
| **Overall**           | **63%**  | **80%** | **+17%** | 🟡 Target      |

### Module Coverage Targets

| Module        | Current | Target  | Status         |
| ------------- | ------- | ------- | -------------- |
| **Auth**      | ~75%    | 85%     | 🟡 Close       |
| **Tenant**    | ~70%    | 85%     | 🟡 In Progress |
| **Workspace** | ~65%    | 85%     | 🟡 In Progress |
| **Plugin**    | 87.65%  | 90%     | ✅ Good        |
| **Services**  | ~50%    | 80%     | 🔴 Needs Work  |
| **Overall**   | **63%** | **80%** | 🟡 In Progress |

### Coverage Improvement Plan

See [`/specs/TEST_COVERAGE_IMPROVEMENT_PLAN.md`](../../specs/TEST_COVERAGE_IMPROVEMENT_PLAN.md) for:

- Detailed roadmap to reach 80% coverage
- Phase 1 (63% → 70%) & Phase 2 (70% → 80%)
- Module-by-module action items
- 6-week implementation timeline

---

## 🚀 Quick Start

### Running Tests

```bash
# Start test infrastructure (one time)
cd test-infrastructure
./scripts/test-setup.sh

# Run all tests
cd apps/core-api
pnpm test

# Run tests by type
pnpm test:unit              # Fast (~30s)
pnpm test:integration       # Medium (~90s)
pnpm test:e2e               # Comprehensive (~2 min)

# Generate coverage report
pnpm test:coverage

# Watch mode (for development)
pnpm test --watch

# Interactive UI dashboard
pnpm test --ui
```

### Frontend E2E Tests

```bash
# Super-admin E2E tests
cd apps/super-admin
pnpm test:e2e

# Web app E2E tests
cd apps/web
pnpm test:e2e
```

---

## 🎯 Test Environment Setup

### Prerequisites

All tests require test infrastructure services:

```bash
# Check service status
./test-infrastructure/scripts/test-check.sh

# Start services if needed
./test-infrastructure/scripts/test-setup.sh

# Verify health
curl http://localhost:3000/health      # Backend
curl http://localhost:5173             # Frontend (redirects)
curl http://localhost:8081/health      # Keycloak
```

### Test Database

Tests use separate test database to avoid polluting development data:

```bash
# Set test database URL
export DATABASE_URL="postgresql://postgres:postgres@localhost:5433/plexica_test"

# Run migrations
pnpm db:migrate

# Seed test data (if available)
pnpm db:seed:test
```

### Environment Variables

Create `.env.test` in each app:

```env
# Backend (apps/core-api/.env.test)
NODE_ENV=test
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/plexica_test
REDIS_URL=redis://localhost:6380/0
KEYCLOAK_URL=http://localhost:8081

# Frontend (apps/web/.env.test)
VITE_API_URL=http://localhost:3000
VITE_KEYCLOAK_URL=http://localhost:8081
VITE_DEFAULT_TENANT=acme-corp
```

---

## 📚 Test Types

### Unit Tests (700+ tests)

**Purpose**: Test individual functions/methods in isolation  
**Tools**: Vitest + Mocking  
**Location**: `apps/core-api/src/__tests__/**/unit/`  
**Duration**: <30 seconds

Test individual services, utilities, and business logic:

```typescript
describe('TenantService', () => {
  it('should create tenant with valid data', async () => {
    const tenant = await service.createTenant({ name: 'Test', slug: 'test' });
    expect(tenant.slug).toBe('test');
  });
});
```

### Integration Tests (200+ tests)

**Purpose**: Test multiple components working together  
**Tools**: Vitest + Supertest + Real Database  
**Location**: `apps/core-api/src/__tests__/**/integration/`  
**Duration**: ~90 seconds

Test API endpoints with real database:

```typescript
describe('POST /api/tenants', () => {
  it('should create tenant in database', async () => {
    const response = await request(app)
      .post('/api/tenants')
      .send({ name: 'Test', slug: 'test' })
      .expect(201);
    expect(response.body.slug).toBe('test');
  });
});
```

### E2E Tests - Backend (160+ tests)

**Purpose**: Test complete workflows with full system  
**Tools**: Vitest + Full Stack  
**Location**: `apps/core-api/src/__tests__/**/e2e/`  
**Duration**: ~2 minutes

Test end-to-end scenarios with all services:

```typescript
it('should complete tenant provisioning', async () => {
  // 1. Create tenant
  // 2. Verify PostgreSQL schema created
  // 3. Verify Keycloak realm created
  // 4. Verify roles created
});
```

### E2E Tests - Frontend (169 tests)

**Purpose**: Test complete user workflows from UI  
**Tools**: Playwright  
**Location**: `apps/super-admin/tests/e2e/`, `apps/web/tests/e2e/`  
**Duration**: Varies

Test frontend user journeys:

```typescript
test('user can create workspace', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await page.click('text=Create Workspace');
  // ... complete workflow
});
```

---

## 🔧 Test Infrastructure

### Services Running (Docker)

- **PostgreSQL** (port 5433) - Test database
- **Keycloak** (port 8081) - Identity provider
- **Redis** (port 6380) - Caching layer
- **MinIO** (ports 9010/9011) - Object storage

### Management Commands

```bash
cd test-infrastructure

# Start all services
./scripts/test-setup.sh

# Check service status
./scripts/test-check.sh

# Reset test data
./scripts/test-reset.sh

# Stop all services
./scripts/test-teardown.sh
```

### Test Data

**Default Test Users**:

- Super Admin: `super-admin@test.local` / `test123`
- Tenant Admin: `admin@acme-corp.local` / `test123`
- Member: `member@acme-corp.local` / `test123`

**Test Tenants**:

- `acme-corp` (schema: `tenant_acme_corp`)
- `demo-company` (schema: `tenant_demo_company`)

---

## 🔍 CI/CD Integration

### GitHub Actions Workflow

Tests run automatically on PR and merge:

- ✅ Unit tests (fast)
- ✅ Linting and type checks
- ✅ Build verification
- ✅ Integration tests (with services)
- ✅ E2E tests (full stack)
- ✅ Coverage reporting

**Total pipeline**: ~8 minutes

### Coverage Requirements

Pull requests must maintain:

- Overall coverage: ≥80% (target)
- No decrease in coverage without justification
- All modules above 75% (or documented exceptions)

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

5. **Test both success and failure paths**
   - Happy path: Feature works as expected
   - Error cases: Proper error handling

### Mocking Guidelines

1. **Mock external dependencies**
   - Third-party APIs
   - File system
   - Network calls

2. **Don't mock what you own**
   - Test real services in integration tests
   - Use real database in integration/E2E tests

3. **Use minimal mocks**
   - Only mock what's necessary
   - Prefer real instances when fast

---

## 📖 Contributing

When adding new features:

1. **Write tests first** (TDD approach preferred)
2. **Maintain coverage** (don't decrease overall coverage)
3. **Update documentation** (this guide and specific modules)
4. **Run full test suite** before submitting PR

```bash
# Full pre-PR checklist
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm build
```

---

## 🎓 Resources

- **[Vitest Documentation](https://vitest.dev/)** - Test runner
- **[Testing Library](https://testing-library.com/)** - Component testing
- **[Playwright](https://playwright.dev/)** - Frontend E2E
- **[Test Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)**

---

## 🔗 Next Steps

- Review **[BACKEND_TESTING.md](./BACKEND_TESTING.md)** for API testing
- Review **[FRONTEND_TESTING.md](./FRONTEND_TESTING.md)** for UI testing
- Review **[E2E_TESTING.md](./E2E_TESTING.md)** for comprehensive workflows
- Read **[/specs/TEST_COVERAGE_IMPROVEMENT_PLAN.md](../../specs/TEST_COVERAGE_IMPROVEMENT_PLAN.md)** for coverage roadmap
