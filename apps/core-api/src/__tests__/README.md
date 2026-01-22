# Core API Test Suite

This directory contains comprehensive tests for the Plexica Core API, with a focus on the M2.3 Plugin-to-Plugin Communication milestone.

## 📊 Test Statistics

- **Total Tests**: 207
- **Passing**: 206 (99.5%)
- **Test Files**: 12
- **Test Coverage**: Target >80% for M2.3 components

### M2.3 Plugin Communication Tests

| Test File                                  | Tests   | Focus Area                         | Status           |
| ------------------------------------------ | ------- | ---------------------------------- | ---------------- |
| `services/service-registry.test.ts`        | 14      | Service registration & discovery   | ✅ Passing       |
| `services/dependency-resolution.test.ts`   | 15      | Dependency management & validation | ✅ Passing       |
| `services/shared-data.test.ts`             | 23      | Cross-plugin data sharing          | ✅ Passing       |
| `services/plugin-api-gateway.test.ts`      | 18      | API routing & communication        | ✅ Passing       |
| `schemas/plugin-manifest.test.ts`          | 30      | Manifest validation & schema       | ✅ Passing       |
| `integration/plugin-communication.test.ts` | 11      | End-to-end integration             | ✅ Passing       |
| **Total M2.3 Tests**                       | **111** |                                    | **100% Passing** |

## 🚀 Running Tests

### Run All Tests

```bash
cd apps/core-api
pnpm test --run
```

### Run Specific Test File

```bash
pnpm test service-registry.test.ts
```

### Run M2.3 Tests Only

```bash
pnpm test src/__tests__/services/service-registry.test.ts \
           src/__tests__/services/dependency-resolution.test.ts \
           src/__tests__/services/shared-data.test.ts \
           src/__tests__/services/plugin-api-gateway.test.ts \
           src/__tests__/schemas/plugin-manifest.test.ts \
           src/__tests__/integration/plugin-communication.test.ts
```

### Watch Mode (for development)

```bash
pnpm test --watch
```

### Generate Coverage Report

```bash
pnpm test -- --coverage
```

### View Coverage in Browser

```bash
pnpm test -- --coverage --reporter=html
open coverage/index.html
```

## 📁 Test Structure

```
__tests__/
├── services/                    # Service layer tests
│   ├── service-registry.test.ts       (14 tests - Service registration & discovery)
│   ├── dependency-resolution.test.ts   (15 tests - Dependency validation)
│   ├── shared-data.test.ts            (23 tests - Data sharing)
│   └── plugin-api-gateway.test.ts     (18 tests - API gateway)
├── schemas/                     # Schema validation tests
│   └── plugin-manifest.test.ts        (30 tests - Manifest validation)
├── integration/                 # Integration tests
│   └── plugin-communication.test.ts   (11 tests - E2E scenarios)
├── middleware/                  # Middleware tests
│   ├── auth.middleware.test.ts
│   └── tenant-context.middleware.test.ts
└── other tests...
```

## 🧪 Test Categories

### Unit Tests

Test individual components in isolation with mocked dependencies.

**Examples:**

- `service-registry.test.ts` - Service registration, discovery, health updates
- `dependency-resolution.test.ts` - Circular dependency detection, version validation
- `shared-data.test.ts` - Set/get/delete operations, TTL, namespace management

### Schema Tests

Validate data structures and formats using Zod schemas.

**Examples:**

- `plugin-manifest.test.ts` - Plugin manifest structure, API service schema, semver validation

### Integration Tests

Test complete workflows across multiple components.

**Examples:**

- `plugin-communication.test.ts` - Complete plugin lifecycle, cross-plugin data sharing, multi-service plugins

## 🎯 What Each M2.3 Test File Covers

### 1. Service Registry Tests (`services/service-registry.test.ts`)

**Coverage**: Service registration, discovery, health monitoring, caching

**Key Test Scenarios:**

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

**Last Updated**: January 22, 2026  
**Test Suite Version**: 1.0 (M2.3 Milestone)  
**Maintained by**: Plexica Engineering Team
