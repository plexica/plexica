# Plexica Testing Documentation

**Last Updated**: January 21, 2026  
**Status**: Comprehensive testing guide for all Plexica components

---

## Overview

This directory contains comprehensive testing documentation for the Plexica platform. Testing is organized into several categories to ensure quality across all layers of the application.

---

## Documentation Structure

### Core Testing Guides

- **[BACKEND_TESTING.md](./BACKEND_TESTING.md)** - Backend API and service testing
  - Unit tests for services
  - Integration tests for APIs
  - Database testing strategies
  - Mocking and test fixtures

- **[FRONTEND_TESTING.md](./FRONTEND_TESTING.md)** - Frontend component and flow testing
  - Component testing
  - Authentication flow testing
  - Multi-tenant URL testing
  - UI/UX testing

- **[E2E_TESTING.md](./E2E_TESTING.md)** - End-to-end testing
  - Complete user workflows
  - Multi-tenant scenarios
  - Workspace management
  - Plugin lifecycle

- **[QUICK_TEST.md](./QUICK_TEST.md)** - Quick testing guide
  - 5-minute smoke tests
  - Essential verification steps
  - Common troubleshooting

---

## Testing Strategy

### Test Pyramid

```
        /\
       /  \        E2E Tests (10%)
      /____\       - Critical user paths
     /      \
    /        \     Integration Tests (30%)
   /__________\    - API endpoints, Services
  /            \
 /              \  Unit Tests (60%)
/________________\ - Business logic, Utilities
```

### Coverage Targets

| Layer                 | Coverage Target | Current Status |
| --------------------- | --------------- | -------------- |
| **Unit Tests**        | 80%             | ⏳ In Progress |
| **Integration Tests** | 70%             | ⏳ Planned     |
| **E2E Tests**         | 50%             | ⏳ Planned     |
| **Overall**           | 75%             | ⏳ Target      |

---

## Quick Start

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests for specific package
pnpm test --filter @plexica/core-api
pnpm test --filter @plexica/web

# Run tests in watch mode
pnpm test:watch

# Generate coverage report
pnpm test:coverage
```

### Manual Testing

For quick manual verification:

```bash
# 1. Start all services
pnpm infra:start
pnpm dev

# 2. Follow QUICK_TEST.md
open docs/testing/QUICK_TEST.md

# 3. Run smoke tests
# See E2E_TESTING.md for detailed scenarios
```

---

## Test Types

### 1. Unit Tests

**Purpose**: Test individual functions/methods in isolation

**Tools**: Vitest, Mock Service Worker (MSW)

**Location**: `apps/*/src/**/*.test.ts`

**Example**:

```typescript
describe('TenantService', () => {
  it('should create tenant with valid data', async () => {
    const tenant = await tenantService.create({
      name: 'Test Corp',
      slug: 'test-corp',
    });
    expect(tenant.slug).toBe('test-corp');
  });
});
```

### 2. Integration Tests

**Purpose**: Test multiple components working together

**Tools**: Vitest, Supertest (API testing)

**Location**: `apps/*/src/__tests__/*.integration.test.ts`

**Example**:

```typescript
describe('POST /api/tenants', () => {
  it('should create tenant and return 201', async () => {
    const response = await request(app)
      .post('/api/tenants')
      .send({ name: 'Test Corp', slug: 'test-corp' })
      .expect(201);
    expect(response.body.slug).toBe('test-corp');
  });
});
```

### 3. End-to-End Tests

**Purpose**: Test complete user workflows from UI to database

**Tools**: Playwright (planned)

**Location**: `tests/e2e/*.spec.ts`

**Example**:

```typescript
test('user can create workspace', async ({ page }) => {
  await page.goto('http://localhost:5173');
  await page.click('text=Create Workspace');
  await page.fill('input[name="name"]', 'Engineering');
  await page.click('button[type="submit"]');
  await expect(page.locator('text=Engineering')).toBeVisible();
});
```

### 4. Manual Tests

**Purpose**: Human verification of UX, accessibility, edge cases

**Documentation**: See [QUICK_TEST.md](./QUICK_TEST.md) and [E2E_TESTING.md](./E2E_TESTING.md)

**When to Use**: Before releases, after major features, for exploratory testing

---

## Test Environment Setup

### Prerequisites

All services must be running:

```bash
# Check service status
pnpm infra:status

# Start services if needed
pnpm infra:start

# Verify health
curl http://localhost:3000/health      # Backend
curl http://localhost:5173             # Frontend (redirects to login)
curl http://localhost:8080             # Keycloak
```

### Test Database

Tests use a separate test database to avoid polluting development data:

```bash
# Set test database URL
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/plexica_test"

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
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/plexica_test
REDIS_URL=redis://localhost:6379/1
KEYCLOAK_URL=http://localhost:8080

# Frontend (apps/web/.env.test)
VITE_API_URL=http://localhost:3000
VITE_KEYCLOAK_URL=http://localhost:8080
VITE_DEFAULT_TENANT=test-tenant
```

---

## CI/CD Integration

Tests run automatically in GitHub Actions:

### On Pull Request

- ✅ Lint checks
- ✅ Type checks
- ✅ Unit tests
- ✅ Integration tests
- ⏳ E2E tests (planned)

### On Merge to Main

- ✅ Full test suite
- ✅ Coverage report
- ✅ Build verification
- ⏳ Deploy to staging (planned)

### Coverage Requirements

Pull requests must maintain:

- Overall coverage: ≥75%
- No decreases in coverage without justification

---

## Best Practices

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

3. **Arrange-Act-Assert (AAA) pattern**

   ```typescript
   it('should create workspace', async () => {
     // Arrange
     const data = { name: 'Engineering', slug: 'eng' };

     // Act
     const workspace = await createWorkspace(data);

     // Assert
     expect(workspace.name).toBe('Engineering');
   });
   ```

4. **One assertion per test (when practical)**
   - Makes failures easier to diagnose
   - Acceptable to have multiple related assertions

5. **Avoid test interdependence**
   - Each test should run independently
   - Use `beforeEach` for shared setup

### Mocking Guidelines

1. **Mock external dependencies**
   - Third-party APIs
   - File system
   - Network calls

2. **Don't mock what you own**
   - Test real database interactions in integration tests
   - Use test database, not mocks

3. **Use minimal mocks**
   - Only mock what's necessary
   - Prefer real instances when fast

---

## Troubleshooting

### Tests Failing Locally

1. **Check service status**

   ```bash
   pnpm infra:status
   ```

2. **Clear test cache**

   ```bash
   pnpm test --clearCache
   ```

3. **Reset test database**

   ```bash
   pnpm db:reset:test
   pnpm db:migrate
   ```

4. **Check environment variables**
   ```bash
   cat .env.test
   ```

### Slow Tests

- Use `vi.mock()` to mock heavy dependencies
- Avoid real database calls in unit tests
- Use `it.concurrent()` for independent tests
- Profile tests: `pnpm test --profile`

### Flaky Tests

- Add explicit waits for async operations
- Use `waitFor` utilities for DOM updates
- Increase timeouts for slow operations
- Check for race conditions

---

## Contributing

When adding new features:

1. **Write tests first** (TDD approach preferred)
2. **Maintain coverage** (don't decrease overall coverage)
3. **Update documentation** (this file and specific guides)
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

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library](https://testing-library.com/)
- [Playwright](https://playwright.dev/)
- [Test Driven Development](https://martinfowler.com/bliki/TestDrivenDevelopment.html)

---

**Next Steps**:

- Review [QUICK_TEST.md](./QUICK_TEST.md) for rapid verification
- Read [BACKEND_TESTING.md](./BACKEND_TESTING.md) for API testing
- Read [FRONTEND_TESTING.md](./FRONTEND_TESTING.md) for UI testing
- Check [E2E_TESTING.md](./E2E_TESTING.md) for comprehensive workflows
