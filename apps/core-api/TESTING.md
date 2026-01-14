# Testing Guide

## Running Tests

### Unit Tests

Run all unit tests:

```bash
pnpm test
```

Run tests in watch mode:

```bash
pnpm test --watch
```

Run tests with coverage:

```bash
pnpm test --coverage
```

### Test Coverage

Current coverage target: **80%**

- Lines: 80%
- Functions: 80%
- Branches: 80%
- Statements: 80%

View coverage report:

```bash
pnpm test --coverage
open coverage/index.html
```

## Test Structure

```
apps/core-api/src/__tests__/
├── setup.ts                          # Test environment setup
├── tenant-provisioning.service.test.ts  # Unit tests for tenant provisioning
├── plugin.service.test.ts            # Unit tests for plugin service
└── tenant.api.test.ts                # Integration tests for tenant API
```

## Writing Tests

### Unit Tests

Unit tests should:

- Test individual functions/methods in isolation
- Mock external dependencies (database, API calls, etc.)
- Focus on business logic
- Be fast and deterministic

Example:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { MyService } from '../services/my-service';

describe('MyService', () => {
  it('should do something', async () => {
    const service = new MyService();
    const result = await service.doSomething();
    expect(result).toBe('expected');
  });
});
```

### Integration Tests

Integration tests should:

- Test multiple components working together
- Use real instances where practical
- Test actual HTTP requests/responses
- Verify end-to-end flows

Example:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import Fastify from 'fastify';

describe('API Integration Tests', () => {
  let app;

  beforeAll(async () => {
    app = Fastify();
    // Register routes
    await app.ready();
  });

  it('should handle API request', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/resource',
    });
    expect(response.statusCode).toBe(200);
  });
});
```

## Mocking

### Prisma Client

```typescript
vi.mock('@plexica/database', () => ({
  prisma: {
    tenant: {
      findMany: vi.fn(),
      create: vi.fn(),
      // ... other methods
    },
  },
}));
```

### External Services

```typescript
vi.mock('../services/external-service', () => ({
  ExternalService: vi.fn().mockImplementation(() => ({
    callAPI: vi.fn().mockResolvedValue({ data: 'mock' }),
  })),
}));
```

## CI/CD Integration

Tests run automatically in CI/CD pipeline:

- On every pull request
- On every push to main
- Before deployment

Failing tests will block merges and deployments.

## Troubleshooting

### Tests Failing Locally

1. Ensure database is running:

   ```bash
   pnpm infra:start
   ```

2. Check environment variables:

   ```bash
   cat .env
   ```

3. Clear test cache:
   ```bash
   pnpm test --clearCache
   ```

### Slow Tests

- Use `vi.mock()` to mock heavy dependencies
- Avoid real database calls in unit tests
- Use `it.concurrent()` for independent tests

### Coverage Not Met

```bash
pnpm test --coverage
```

Check the coverage report to see which files need more tests.
