# Core API Test Suite

This directory contains comprehensive tests for the Plexica Core API covering authentication, multi-tenancy, workspace management, plugins, and platform services.

## 📊 Current Test Status

- **Total Tests**: 1,047 tests
- **Test Files**: 64 files
- **Overall Pass Rate**: 100% (when infrastructure running)
- **Coverage**: 63% lines (target: 80%)

### Test Breakdown by Type

| Type              | Count      | Files        | Coverage |
| ----------------- | ---------- | ------------ | -------- |
| Unit Tests        | ~700       | 27 files     | Variable |
| Integration Tests | ~200       | 10 files     | 60-70%   |
| E2E Tests         | ~160       | 12 files     | 50-60%   |
| **Total**         | **~1,047** | **64 files** | **63%**  |

### Test Breakdown by Module

| Module    | Tests      | Files        | Status           | Target   |
| --------- | ---------- | ------------ | ---------------- | -------- |
| Auth      | ~280       | 15 files     | ✅ Passing       | 85%      |
| Tenant    | ~220       | 12 files     | ✅ Passing       | 85%      |
| Workspace | ~240       | 14 files     | ✅ Passing       | 85%      |
| Plugin    | ~170       | 10 files     | ✅ Passing       | 90%      |
| Services  | ~137       | 13 files     | ✅ Passing       | 80%      |
| **Total** | **~1,047** | **64 files** | **✅ 100% Pass** | **80%+** |

## 🚀 Running Tests

### Run All Tests

```bash
cd apps/core-api
pnpm test --run
```

**Expected**: ~1,047 tests pass in 3-5 minutes

### Run by Test Type

```bash
# Unit tests only (~700 tests, ~30s)
pnpm test:unit

# Integration tests only (~200 tests, ~90s)
pnpm test:integration

# E2E tests only (~160 tests, ~2 min)
pnpm test:e2e
```

### Run by Module

```bash
# Auth module tests
pnpm test -- auth/

# Tenant module tests
pnpm test -- tenant/

# Workspace module tests
pnpm test -- workspace/

# Plugin module tests
pnpm test -- plugin/
```

### Watch Mode

```bash
pnpm test --watch
```

### Coverage Report

```bash
cd apps/core-api
pnpm test:coverage
```

**Current Coverage**: 63% lines (target: 80%)

### Run Specific Test File

```bash
pnpm test src/__tests__/auth/unit/auth.service.test.ts
```

## 📁 Test Structure

```
__tests__/
├── auth/                          # Authentication module (~280 tests)
│   ├── unit/                      # Unit tests (~180 tests)
│   │   ├── auth.service.test.ts
│   │   ├── jwt.service.test.ts
│   │   ├── password.service.test.ts
│   │   └── ...
│   ├── integration/               # Integration tests (~70 tests)
│   │   ├── login.flow.test.ts
│   │   ├── logout.flow.test.ts
│   │   └── ...
│   └── e2e/                       # E2E tests (~30 tests)
│       └── auth.e2e.test.ts
├── tenant/                        # Multi-tenancy module (~220 tests)
│   ├── unit/                      # Unit tests (~140 tests)
│   ├── integration/               # Integration tests (~60 tests)
│   └── e2e/                       # E2E tests (~20 tests)
├── workspace/                     # Workspace module (~240 tests)
│   ├── unit/                      # Unit tests (~150 tests)
│   ├── integration/               # Integration tests (~70 tests)
│   └── e2e/                       # E2E tests (~20 tests)
├── plugin/                        # Plugin module (~170 tests)
│   ├── unit/                      # Unit tests (~100 tests)
│   ├── integration/               # Integration tests (~50 tests)
│   └── e2e/                       # E2E tests (~20 tests)
├── services/                      # Shared services (~137 tests)
│   ├── unit/                      # Unit tests
│   └── integration/               # Integration tests
├── middleware/                    # Middleware tests
├── setup/                         # Test utilities and setup
└── fixtures/                      # Test data and mocks
```

**Total: 64 test files across 1,047+ tests**

## 🧪 Test Categories

### Unit Tests (~700 tests, 27 files)

Test individual services and functions in isolation with mocked dependencies.

**Coverage**:

- Service methods (auth, tenant, workspace, plugin services)
- Utility functions and helpers
- Schema validation
- Error handling

**Examples**:

- `auth/unit/auth.service.test.ts` - Authentication logic
- `tenant/unit/tenant.service.test.ts` - Tenant operations
- `workspace/unit/workspace.service.test.ts` - Workspace CRUD
- `plugin/unit/plugin.service.test.ts` - Plugin management

### Integration Tests (~200 tests, 10 files)

Test complete workflows across multiple services with database interactions.

**Coverage**:

- API endpoint testing with actual database
- Cross-service communication
- Transaction handling
- Data consistency

**Examples**:

- `auth/integration/login.flow.test.ts` - Login flow with database
- `tenant/integration/tenant.crud.test.ts` - Tenant creation with validation
- `workspace/integration/workspace.member.test.ts` - Workspace member management
- `plugin/integration/plugin.lifecycle.test.ts` - Plugin install/uninstall

### E2E Tests (~160 tests, 12 files)

Test complete user scenarios with all infrastructure running.

**Coverage**:

- Full authentication flows (login → dashboard)
- Workspace creation and management
- Plugin lifecycle and marketplace
- Multi-tenant isolation
- Super-admin operations

**Examples**:

- `auth/e2e/auth.e2e.test.ts` - Complete login flow
- `workspace/e2e/workspace.management.e2e.test.ts` - Create workspace → add members → manage settings
- `plugin/e2e/plugin.lifecycle.e2e.test.ts` - Plugin install → configure → activate

- ✅ Register service and assign unique ID
- ✅ Discover service by name with caching
- ✅ Deregister service and invalidate cache
- ✅ Update service health status (HEALTHY → DEGRADED → UNAVAILABLE)
- ✅ List all services for a tenant
- ✅ Handle duplicate registrations (upsert)
- ✅ Cache invalidation on updates
- ✅ Filter unavailable services from discovery

**Mock Strategy:**

- Mock Prisma with Map-based in-memory storage
- Mock Redis for cache operations
- Track service registration with composite keys

### 2. Dependency Resolution Tests (`services/dependency-resolution.test.ts`)

**Coverage**: Dependency registration, circular detection, version validation, install ordering

**Key Test Scenarios:**

- ✅ Register plugin dependencies
- ✅ Detect circular dependencies (A→B→C→A)
- ✅ Validate semver version constraints (^1.0.0, ~2.3.4, >=1.0.0)
- ✅ Calculate topological install order
- ✅ Prevent uninstall when dependencies exist
- ✅ Validate dependency versions against installed plugins
- ✅ Handle multiple dependencies per plugin
- ✅ Clear dependencies on plugin removal

**Mock Strategy:**

- Mock Prisma for dependency and plugin storage
- Track dependencies in Map with composite keys
- Simulate version matching with semver

### 3. Shared Data Tests (`services/shared-data.test.ts`)

**Coverage**: Cross-plugin data sharing, TTL, namespaces, caching

**Key Test Scenarios:**

- ✅ Set and get shared data
- ✅ Delete shared data
- ✅ TTL and automatic expiration
- ✅ Namespace isolation
- ✅ List keys in namespace
- ✅ Filter by owner plugin
- ✅ Clear namespace
- ✅ Cache shared data in Redis
- ✅ Handle expired data gracefully
- ✅ Track metadata (owner, timestamps)

**Mock Strategy:**

- Mock Prisma for persistent storage
- Mock Redis for caching with TTL
- Simulate expiration by checking timestamps

### 4. Plugin API Gateway Tests (`services/plugin-api-gateway.test.ts`)

**Coverage**: API call routing, header injection, error handling

**Key Test Scenarios:**

- ✅ Call plugin API endpoint
- ✅ Inject tenant and caller headers
- ✅ Match path parameters (/contacts/:id)
- ✅ Handle different HTTP methods (GET, POST, PUT, DELETE)
- ✅ Service discovery integration
- ✅ Handle service not found
- ✅ Handle plugin mismatch
- ✅ Handle endpoint not found
- ✅ Handle HTTP errors (4xx, 5xx)
- ✅ Service health checks

**Mock Strategy:**

- Mock axios HTTP client
- Mock ServiceRegistryService for discovery
- Simulate HTTP responses and errors

### 5. Plugin Manifest Tests (`schemas/plugin-manifest.test.ts`)

**Coverage**: Manifest structure validation, schema enforcement

**Key Test Scenarios:**

- ✅ Valid complete manifest
- ✅ Validate plugin ID format (plugin-{name})
- ✅ Validate service name format ({plugin}.{resource})
- ✅ Validate semver format (version, minVersion, maxVersion)
- ✅ API service endpoint schema
- ✅ Dependency schema with version constraints
- ✅ Required fields enforcement
- ✅ Optional fields handling
- ✅ Invalid data rejection
- ✅ Real-world manifests (CRM, Analytics)

**Validation Rules:**

- Plugin ID: Must match `plugin-[a-z0-9-]+`
- Service Name: Must match `{pluginId}.{resourceName}`
- Version: Must be valid semver
- Endpoints: Must have method and path
- Dependencies: Must reference valid plugins

### 6. Integration Tests (`integration/plugin-communication.test.ts`)

**Coverage**: Complete plugin lifecycle, end-to-end scenarios

**Key Test Scenarios:**

- ✅ Validate manifest → Register services → Discover services
- ✅ Analytics depends on CRM → Validate dependencies
- ✅ Prevent CRM uninstall when Analytics depends on it
- ✅ CRM shares data with Analytics via SharedData
- ✅ List shared data in namespace
- ✅ Filter shared data by owner
- ✅ Handle TTL for temporary shared data
- ✅ Track service health status changes
- ✅ Multi-service plugin (CRM exposes contacts + deals)

**Integration Points:**

- ServiceRegistryService ↔ DependencyResolutionService
- SharedDataService ↔ Plugin communication
- Manifest validation → Service registration
- Health monitoring → Service discovery

## 🔧 Mock Patterns

### Prisma Mock Pattern

```typescript
const createMockPrisma = () => {
  const storage = new Map<string, any>();

  return {
    model: {
      upsert: vi.fn(async ({ where, create, update }) => {
        const key = generateKey(where);
        const existing = storage.get(key);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        } else {
          const record = { ...create, id: generateId() };
          storage.set(key, record);
          return record;
        }
      }),
      findFirst: vi.fn(async ({ where, include }) => {
        return Array.from(storage.values()).filter(matchWhere(where))[0] || null;
      }),
      // ... other methods
    },
    __clearAll: () => storage.clear(),
  } as any;
};
```

### Redis Mock Pattern

```typescript
const createMockRedis = () => {
  const cache = new Map<string, string>();

  return {
    get: vi.fn(async (key: string) => cache.get(key) || null),
    setex: vi.fn(async (key: string, ttl: number, value: string) => {
      cache.set(key, value);
      return 'OK';
    }),
    del: vi.fn(async (...keys: string[]) => {
      keys.forEach((key) => cache.delete(key));
      return keys.length;
    }),
    keys: vi.fn(async (pattern: string) => {
      const regex = new RegExp(pattern.replace('*', '.*'));
      return Array.from(cache.keys()).filter((k) => regex.test(k));
    }),
  } as any;
};
```

### Axios Mock Pattern

```typescript
const mockHttpClient = {
  request: vi.fn(),
};

vi.mock('axios', () => ({
  default: {
    create: () => mockHttpClient,
    isAxiosError: (error: any) => error?.isAxiosError === true,
  },
}));

// Usage in tests:
mockHttpClient.request.mockResolvedValue({
  data: { success: true },
  status: 200,
});

// Simulate errors:
mockHttpClient.request.mockRejectedValue({
  isAxiosError: true,
  response: { status: 404, data: 'Not found' },
});
```

## 🎨 Test Naming Convention

We follow the **Arrange-Act-Assert (AAA)** pattern with descriptive test names:

```typescript
describe('ServiceName', () => {
  describe('methodName', () => {
    it('should [expected behavior]', async () => {
      // Arrange - Set up test data and mocks
      const input = { ... };
      mockDependency.method.mockResolvedValue(result);

      // Act - Execute the function under test
      const output = await service.methodName(input);

      // Assert - Verify the results
      expect(output).toEqual(expectedOutput);
      expect(mockDependency.method).toHaveBeenCalledWith(expectedArgs);
    });
  });
});
```

**Test Name Guidelines:**

- Start with "should"
- Describe the expected behavior
- Be specific but concise
- Use "when" for conditional scenarios

**Examples:**

- ✅ `should register service and return unique ID`
- ✅ `should detect circular dependencies in plugin chain`
- ✅ `should return null when data is expired`
- ✅ `should throw error when service not found`

## 🔍 Common Test Patterns

### Setup and Teardown

```typescript
describe('TestSuite', () => {
  let service: ServiceClass;
  let mockPrisma: any;
  let mockRedis: any;
  let mockLogger: any;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    mockRedis = createMockRedis();
    mockLogger = createMockLogger();
    service = new ServiceClass(mockPrisma, mockRedis, mockLogger);
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockPrisma.__clearAll?.();
  });
});
```

### Testing Async Operations

```typescript
it('should handle async operation', async () => {
  mockPrisma.model.findFirst.mockResolvedValue(data);

  const result = await service.asyncMethod();

  expect(result).toBe(expected);
});
```

### Testing Error Cases

```typescript
it('should throw error when validation fails', async () => {
  const invalidInput = { ... };

  await expect(service.validate(invalidInput))
    .rejects
    .toThrow('Validation failed');
});
```

### Testing Cache Behavior

```typescript
it('should cache result on first call', async () => {
  await service.getData('key');

  expect(mockRedis.setex).toHaveBeenCalledWith('cache:key', 3600, JSON.stringify(data));
});
```

## 📈 Coverage Targets

We aim for **>80% coverage** on all M2.3 components:

- `service-registry.service.ts` - Target: 85%+
- `dependency-resolution.service.ts` - Target: 85%+
- `shared-data.service.ts` - Target: 85%+
- `plugin-api-gateway.service.ts` - Target: 85%+
- `plugin-manifest.schema.ts` - Target: 90%+

**Excluded from coverage:**

- Type definitions
- Logger calls
- Trivial getters/setters

## 🐛 Debugging Tests

### Run Single Test

```bash
pnpm test -t "should register service"
```

### Debug Mode

```bash
node --inspect-brk node_modules/.bin/vitest --run
```

### Verbose Output

```bash
pnpm test --reporter=verbose
```

### View Failed Test Details

```bash
pnpm test --run 2>&1 | grep -A 20 "FAIL"
```

## 📝 Adding New Tests

When adding new tests for M2.3 components:

1. **Choose the right file** - Unit tests in `services/`, integration in `integration/`
2. **Follow naming conventions** - Use descriptive "should" statements
3. **Use existing mocks** - Reuse `createMockPrisma()`, `createMockRedis()`, etc.
4. **Follow AAA pattern** - Arrange, Act, Assert
5. **Test edge cases** - Not just happy paths
6. **Update this README** - Add new test scenarios to the appropriate section

### Example: Adding a New Service Test

```typescript
// services/new-service.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NewService } from '../../services/new-service.js';

const createMockLogger = () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
});

describe('NewService', () => {
  let service: NewService;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = createMockLogger();
    service = new NewService(mockLogger);
  });

  describe('methodName', () => {
    it('should perform expected behavior', async () => {
      // Arrange
      const input = { ... };

      // Act
      const result = await service.methodName(input);

      // Assert
      expect(result).toBe(expected);
      expect(mockLogger.info).toHaveBeenCalled();
    });
  });
});
```

## ✅ Test Quality Checklist

Before submitting tests, ensure:

- [ ] All tests have descriptive names
- [ ] Tests follow AAA pattern
- [ ] Both success and error cases are tested
- [ ] Mocks are properly reset in `afterEach`
- [ ] Tests are isolated (don't depend on each other)
- [ ] Async operations use `async/await`
- [ ] Assertions are specific (not just `toBeTruthy()`)
- [ ] Edge cases are covered
- [ ] Tests run in <5 seconds
- [ ] No console warnings or errors

## 🔗 Related Documentation

- [M2.3 Plugin Communication Spec](../../../../planning/tasks/phase-2-mvp.md)
- [Plugin Manifest Schema](../../schemas/plugin-manifest.schema.ts)
- [Service Registry](../../services/service-registry.service.ts)
- [Dependency Resolution](../../services/dependency-resolution.service.ts)
- [Shared Data Service](../../services/shared-data.service.ts)
- [Plugin API Gateway](../../services/plugin-api-gateway.service.ts)

## 🎓 Test Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [AAA Pattern](https://automationpanda.com/2020/07/07/arrange-act-assert-a-pattern-for-writing-good-tests/)

---

**Last Updated**: February 11, 2026  
**Test Suite Version**: 2.0 (Comprehensive)  
**Maintained by**: Plexica Engineering Team
