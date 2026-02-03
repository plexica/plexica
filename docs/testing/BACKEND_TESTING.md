# Backend Testing Guide

**Last Updated**: 2025-02-03  
**Status**: Complete  
**Owner**: Engineering Team  
**Document Type**: Testing Guide

**Last Updated**: January 21, 2026  
**Component**: Core API (Fastify + Prisma)

---

## Overview

This guide covers testing strategies for the Plexica backend API, including unit tests, integration tests, and API endpoint testing.

---

## Test Structure

```
apps/core-api/src/__tests__/
├── setup.ts                              # Global test setup
├── fixtures/                             # Test data fixtures
│   ├── tenants.ts
│   ├── users.ts
│   └── plugins.ts
├── unit/                                 # Unit tests
│   ├── services/
│   │   ├── tenant-provisioning.test.ts
│   │   ├── plugin.service.test.ts
│   │   └── auth.service.test.ts
│   └── lib/
│       └── jwt-utils.test.ts
└── integration/                          # Integration tests
    ├── tenant.api.test.ts
    ├── auth.api.test.ts
    ├── workspace.api.test.ts
    └── plugin.api.test.ts
```

---

## Running Tests

### All Tests

```bash
cd apps/core-api
pnpm test
```

### Watch Mode

```bash
pnpm test --watch
```

### Specific Test File

```bash
pnpm test tenant-provisioning.test.ts
```

### Coverage Report

```bash
pnpm test --coverage
open coverage/index.html
```

---

## Unit Tests

Unit tests focus on testing individual functions and services in isolation.

### Service Testing Example

**File**: `apps/core-api/src/__tests__/unit/services/tenant-provisioning.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TenantProvisioningService } from '../../../services/tenant-provisioning.service';
import { prisma } from '@plexica/database';

// Mock Prisma
vi.mock('@plexica/database', () => ({
  prisma: {
    tenant: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    $executeRaw: vi.fn(),
  },
}));

describe('TenantProvisioningService', () => {
  let service: TenantProvisioningService;

  beforeEach(() => {
    service = new TenantProvisioningService();
    vi.clearAllMocks();
  });

  describe('createTenant', () => {
    it('should create tenant with valid data', async () => {
      const tenantData = {
        name: 'Test Corp',
        slug: 'test-corp',
        status: 'ACTIVE',
      };

      vi.mocked(prisma.tenant.create).mockResolvedValue({
        id: 'tenant-id',
        ...tenantData,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.createTenant(tenantData);

      expect(result.slug).toBe('test-corp');
      expect(prisma.tenant.create).toHaveBeenCalledWith({
        data: expect.objectContaining(tenantData),
      });
    });

    it('should throw error for duplicate slug', async () => {
      vi.mocked(prisma.tenant.create).mockRejectedValue(new Error('Unique constraint violation'));

      await expect(service.createTenant({ name: 'Test', slug: 'existing' })).rejects.toThrow();
    });
  });

  describe('provisionTenantSchema', () => {
    it('should create database schema for tenant', async () => {
      vi.mocked(prisma.$executeRaw).mockResolvedValue(1);

      await service.provisionTenantSchema('test-corp');

      expect(prisma.$executeRaw).toHaveBeenCalledWith(expect.stringContaining('CREATE SCHEMA'));
    });
  });
});
```

### Utility Function Testing

**File**: `apps/core-api/src/__tests__/unit/lib/jwt-utils.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { verifyJWT, hasRole, extractTenantFromToken } from '../../../lib/jwt-utils';

describe('JWT Utilities', () => {
  const mockToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...';
  const mockPayload = {
    sub: 'user-123',
    email: 'test@example.com',
    realm_access: { roles: ['admin', 'user'] },
    tenant_id: 'tenant-456',
  };

  describe('verifyJWT', () => {
    it('should verify valid token', async () => {
      // Note: In real test, mock jwksClient
      const payload = await verifyJWT(mockToken);
      expect(payload.sub).toBe('user-123');
    });

    it('should throw on invalid token', async () => {
      await expect(verifyJWT('invalid-token')).rejects.toThrow();
    });
  });

  describe('hasRole', () => {
    it('should return true when user has role', () => {
      const result = hasRole(mockPayload, 'admin');
      expect(result).toBe(true);
    });

    it('should return false when user lacks role', () => {
      const result = hasRole(mockPayload, 'super_admin');
      expect(result).toBe(false);
    });
  });

  describe('extractTenantFromToken', () => {
    it('should extract tenant ID from payload', () => {
      const tenantId = extractTenantFromToken(mockPayload);
      expect(tenantId).toBe('tenant-456');
    });

    it('should return null when no tenant', () => {
      const tenantId = extractTenantFromToken({ sub: 'user' });
      expect(tenantId).toBeNull();
    });
  });
});
```

---

## Integration Tests

Integration tests verify that multiple components work together correctly, including actual HTTP requests and database operations.

### API Endpoint Testing

**File**: `apps/core-api/src/__tests__/integration/tenant.api.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { app } from '../../../app'; // Your Fastify app
import { prisma } from '@plexica/database';

describe('Tenant API Integration Tests', () => {
  let server: FastifyInstance;
  let authToken: string;

  beforeAll(async () => {
    server = Fastify();
    await server.register(app);
    await server.ready();

    // Get auth token for tests
    authToken = await getTestAuthToken();
  });

  afterAll(async () => {
    await server.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean up test data
    await prisma.tenant.deleteMany({
      where: { slug: { startsWith: 'test-' } },
    });
  });

  describe('POST /api/tenants', () => {
    it('should create new tenant', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/tenants',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          name: 'Test Corporation',
          slug: 'test-corp',
        },
      });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.body);
      expect(body.tenant).toBeDefined();
      expect(body.tenant.slug).toBe('test-corp');
      expect(body.tenant.name).toBe('Test Corporation');
    });

    it('should reject duplicate slug', async () => {
      // Create first tenant
      await server.inject({
        method: 'POST',
        url: '/api/tenants',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { name: 'First', slug: 'duplicate-slug' },
      });

      // Try to create duplicate
      const response = await server.inject({
        method: 'POST',
        url: '/api/tenants',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { name: 'Second', slug: 'duplicate-slug' },
      });

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('already exists');
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/tenants',
        payload: { name: 'Test', slug: 'test' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should validate required fields', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/tenants',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { name: 'Test' }, // Missing slug
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('slug');
    });
  });

  describe('GET /api/tenants/:id', () => {
    it('should return tenant by ID', async () => {
      // Create tenant
      const createResponse = await server.inject({
        method: 'POST',
        url: '/api/tenants',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { name: 'Test', slug: 'test-get' },
      });

      const { tenant } = JSON.parse(createResponse.body);

      // Get tenant
      const response = await server.inject({
        method: 'GET',
        url: `/api/tenants/${tenant.id}`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe(tenant.id);
      expect(body.slug).toBe('test-get');
    });

    it('should return 404 for non-existent tenant', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/tenants/non-existent-id',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PATCH /api/tenants/:id', () => {
    it('should update tenant', async () => {
      // Create tenant
      const createResponse = await server.inject({
        method: 'POST',
        url: '/api/tenants',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { name: 'Original', slug: 'test-update' },
      });

      const { tenant } = JSON.parse(createResponse.body);

      // Update tenant
      const response = await server.inject({
        method: 'PATCH',
        url: `/api/tenants/${tenant.id}`,
        headers: { authorization: `Bearer ${authToken}` },
        payload: { name: 'Updated Name' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.name).toBe('Updated Name');
      expect(body.slug).toBe('test-update'); // Unchanged
    });

    it('should not allow slug update', async () => {
      const createResponse = await server.inject({
        method: 'POST',
        url: '/api/tenants',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { name: 'Test', slug: 'original-slug' },
      });

      const { tenant } = JSON.parse(createResponse.body);

      const response = await server.inject({
        method: 'PATCH',
        url: `/api/tenants/${tenant.id}`,
        headers: { authorization: `Bearer ${authToken}` },
        payload: { slug: 'new-slug' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('DELETE /api/tenants/:id', () => {
    it('should soft delete tenant', async () => {
      const createResponse = await server.inject({
        method: 'POST',
        url: '/api/tenants',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { name: 'To Delete', slug: 'test-delete' },
      });

      const { tenant } = JSON.parse(createResponse.body);

      const response = await server.inject({
        method: 'DELETE',
        url: `/api/tenants/${tenant.id}`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(204);

      // Verify soft delete
      const dbTenant = await prisma.tenant.findUnique({
        where: { id: tenant.id },
      });
      expect(dbTenant).toBeNull(); // Or check deletedAt field
    });
  });
});

// Helper function to get test auth token
async function getTestAuthToken(): Promise<string> {
  // Implementation depends on your auth system
  // Option 1: Use test user credentials with Keycloak
  // Option 2: Generate mock JWT for testing
  // Option 3: Use a test-only bypass mechanism
  return 'mock-test-token';
}
```

---

## Mocking Strategies

### 1. Mocking Prisma Client

```typescript
vi.mock('@plexica/database', () => ({
  prisma: {
    tenant: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    plugin: {
      // ... mock methods
    },
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));
```

### 2. Mocking External Services

```typescript
vi.mock('../services/keycloak.service', () => ({
  KeycloakService: vi.fn().mockImplementation(() => ({
    createRealm: vi.fn().mockResolvedValue({ id: 'realm-123' }),
    createUser: vi.fn().mockResolvedValue({ id: 'user-456' }),
    assignRole: vi.fn().mockResolvedValue(true),
  })),
}));
```

### 3. Mocking Redis

```typescript
vi.mock('ioredis', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
    })),
  };
});
```

---

## Test Fixtures

Create reusable test data:

**File**: `apps/core-api/src/__tests__/fixtures/tenants.ts`

```typescript
import { Tenant } from '@prisma/client';

export const mockTenantData = {
  id: 'tenant-123',
  name: 'Test Corporation',
  slug: 'test-corp',
  status: 'ACTIVE' as const,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

export const createMockTenant = (overrides?: Partial<Tenant>): Tenant => ({
  ...mockTenantData,
  ...overrides,
});

export const tenantFixtures = {
  active: createMockTenant(),
  suspended: createMockTenant({
    id: 'tenant-456',
    slug: 'suspended-tenant',
    status: 'SUSPENDED',
  }),
  provisioning: createMockTenant({
    id: 'tenant-789',
    slug: 'new-tenant',
    status: 'PROVISIONING',
  }),
};
```

---

## Database Testing

### Test Database Setup

Use a separate test database:

```bash
# Create test database
createdb plexica_test

# Set test environment variable
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/plexica_test"

# Run migrations
cd packages/database
npx prisma migrate deploy --config ./prisma/prisma.config.ts
```

### Test Database Cleanup

```typescript
import { beforeEach, afterAll } from 'vitest';
import { prisma } from '@plexica/database';

beforeEach(async () => {
  // Clear test data before each test
  await prisma.tenant.deleteMany();
  await prisma.plugin.deleteMany();
  await prisma.tenantPlugin.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});
```

---

## Coverage Targets

### Target Metrics

| Component              | Target Coverage |
| ---------------------- | --------------- |
| **Services**           | 85%             |
| **Routes/Controllers** | 80%             |
| **Middleware**         | 90%             |
| **Utilities**          | 95%             |
| **Overall Backend**    | 80%             |

### Running Coverage

```bash
pnpm test --coverage

# View coverage report
open coverage/index.html

# Check coverage thresholds
pnpm test --coverage --coverage.thresholds.lines=80
```

---

## Best Practices

### 1. Test Structure

Use AAA (Arrange-Act-Assert) pattern:

```typescript
it('should create workspace', async () => {
  // Arrange
  const workspaceData = { name: 'Engineering', slug: 'eng' };

  // Act
  const workspace = await workspaceService.create(workspaceData);

  // Assert
  expect(workspace.slug).toBe('eng');
});
```

### 2. Descriptive Test Names

```typescript
// ✅ Good
it('should return 404 when tenant does not exist');
it('should create tenant with default roles');
it('should reject workspace with duplicate slug');

// ❌ Bad
it('test 1');
it('returns error');
it('works');
```

### 3. Isolated Tests

Each test should be independent:

```typescript
// ✅ Good
beforeEach(async () => {
  await prisma.tenant.deleteMany();
});

it('test 1', async () => {
  const tenant = await createTenant();
  // ...
});

it('test 2', async () => {
  const tenant = await createTenant();
  // ...
});

// ❌ Bad (tests depend on order)
let sharedTenant;

it('creates tenant', async () => {
  sharedTenant = await createTenant();
});

it('updates tenant', async () => {
  await updateTenant(sharedTenant.id); // Depends on previous test
});
```

### 4. Minimal Mocking

Only mock external dependencies:

```typescript
// ✅ Good - mock external service
vi.mock('@keycloak/keycloak-admin-client');

// ❌ Bad - don't mock your own services
vi.mock('../services/workspace.service'); // Test the real service
```

---

## Troubleshooting

### Tests Timeout

Increase timeout for slow operations:

```typescript
it('should provision tenant', async () => {
  // This test may take longer
  const tenant = await provisionTenant(data);
  expect(tenant).toBeDefined();
}, 10000); // 10 second timeout
```

### Database Connection Issues

```bash
# Check PostgreSQL is running
docker ps | grep postgres

# Check connection
psql -h localhost -U postgres -d plexica_test

# Reset test database
dropdb plexica_test
createdb plexica_test
pnpm db:migrate
```

### Mock Not Working

```typescript
// Ensure mock is before imports
vi.mock('@plexica/database');

import { prisma } from '@plexica/database'; // Import after mock

// Clear mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});
```

---

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Fastify Testing](https://www.fastify.io/docs/latest/Guides/Testing/)
- [Prisma Testing Guide](https://www.prisma.io/docs/guides/testing)

---

**Next**: See [FRONTEND_TESTING.md](./FRONTEND_TESTING.md) for frontend test strategies
