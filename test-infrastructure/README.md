# Plexica Test Infrastructure

Complete test infrastructure for Plexica core-api with real services (PostgreSQL, Keycloak, Redis, MinIO, Redpanda).

## 📁 Directory Structure

```
test-infrastructure/
├── docker/                       # Docker configuration for test services
│   ├── docker-compose.test.yml  # Docker Compose for all test services
│   ├── postgres-test-init.sql   # PostgreSQL initialization
│   └── keycloak-test-realm.json # Keycloak test realm with users/clients
├── fixtures/                     # Test data fixtures
│   ├── minimal-seed.ts          # Minimal seed data for tests
│   └── factories/               # (Future) Data factories
├── helpers/                      # Test utility helpers
│   ├── test-database.helper.ts  # Database operations & factories
│   ├── test-keycloak.helper.ts  # Keycloak user/token management
│   ├── test-auth.helper.ts      # JWT token creation & validation
│   ├── test-minio.helper.ts     # MinIO bucket/object operations
│   ├── test-redpanda.helper.ts  # Redpanda/Kafka topic & message operations
│   └── test-context.helper.ts   # Unified test context
├── scripts/                      # Setup/teardown scripts
│   ├── test-setup.sh            # Start infrastructure & seed data
│   ├── test-teardown.sh         # Stop infrastructure
│   └── test-reset.sh            # Reset data without restarting
└── README.md                     # This file
```

## 🚀 Quick Start

### 1. Start Test Infrastructure

```bash
./test-infrastructure/scripts/test-setup.sh
```

This will:

- Start Docker containers (PostgreSQL, Keycloak, Redis, MinIO, Redpanda)
- Run database migrations
- Create tenant schemas
- Create MinIO buckets for tenants
- Seed minimal test data

### 2. Run Tests

```bash
cd apps/core-api
npm run test          # All tests
npm run test:unit     # Unit tests only
npm run test:integration  # Integration tests only
npm run test:e2e      # E2E tests only
```

### 3. Reset Test Data

Between test runs, you can reset the data without restarting containers:

```bash
./test-infrastructure/scripts/test-reset.sh
```

### 4. Stop Test Infrastructure

```bash
./test-infrastructure/scripts/test-teardown.sh
```

## 🐳 Docker Services

All services use different ports to avoid conflicts with production:

| Service          | Port(s)    | Container Name                | Purpose                     |
| ---------------- | ---------- | ----------------------------- | --------------------------- |
| PostgreSQL       | 5433       | plexica-postgres-test         | Test database               |
| Keycloak         | 8081       | plexica-keycloak-test         | Test authentication         |
| Redis            | 6380       | plexica-redis-test            | Test cache                  |
| MinIO            | 9010, 9011 | plexica-minio-test            | Test object storage         |
| Redpanda         | 9095, 8088 | plexica-redpanda-test         | Test event streaming        |
| Redpanda Console | 8091       | plexica-redpanda-console-test | Test Kafka UI for debugging |

All services use **tmpfs** for maximum performance (data is stored in RAM).

## 🔑 Test Credentials

### Keycloak Users

| Username                | Password | Role          | Tenant       |
| ----------------------- | -------- | ------------- | ------------ |
| test-super-admin        | test123  | super-admin   | -            |
| test-tenant-admin-acme  | test123  | tenant-admin  | acme-corp    |
| test-tenant-member-acme | test123  | tenant-member | acme-corp    |
| test-tenant-admin-demo  | test123  | tenant-admin  | demo-company |

### Keycloak Admin

- **Username**: admin
- **Password**: admin
- **URL**: http://localhost:8081

### MinIO Admin

- **Access Key**: minioadmin_test
- **Secret Key**: minioadmin_test
- **Console URL**: http://localhost:9011

### Redpanda Admin

- **Kafka Broker**: localhost:9095
- **HTTP Proxy**: http://localhost:8088
- **Admin API**: http://localhost:9650
- **Console UI**: http://localhost:8091

## 📦 Minimal Seed Data

The minimal seed creates:

- **2 tenants**: acme-corp, demo-company
- **2 PostgreSQL schemas**: tenant_acme_corp, tenant_demo_company
- **2 MinIO buckets**: tenant-acme-corp, tenant-demo-company
- **3 users**:
  - 2 in acme-corp (admin, member)
  - 1 in demo-company (admin)
- **2 workspaces**: One per tenant
- **1 super admin**

This provides a minimal, realistic multi-tenant environment for testing.

## 🛠️ Test Helpers

### Test Context (Unified Helper)

```typescript
import { testContext } from '@/test-infrastructure/helpers/test-context.helper';

// Use in tests
describe('My Test', () => {
  beforeAll(async () => {
    await testContext.resetAll(); // Reset database, MinIO, Redis
  });

  afterAll(async () => {
    await testContext.cleanup(); // Disconnect services
  });

  it('should work', async () => {
    // Access helpers
    const tenant = await testContext.db.createTenant({
      slug: 'test-tenant',
      name: 'Test Tenant',
    });

    const token = testContext.auth.createMockSuperAdminToken();

    const bucket = await testContext.minio.createTenantBucket('test-tenant');

    // Produce event to Redpanda
    await testContext.redpanda.produceMessage('events.tenant.created', {
      key: tenant.id,
      value: { tenantId: tenant.id, name: tenant.name },
    });

    // Consume and verify event
    const messages = await testContext.redpanda.consumeMessages('events.tenant.created', {
      groupId: 'test-consumer',
    });
    expect(messages[0].value.tenantId).toBe(tenant.id);
  });
});
```

### Database Helper

```typescript
import { testDb } from '@/test-infrastructure/helpers/test-database.helper';

// Create tenant with schema and MinIO bucket
const tenant = await testDb.createTenant({
  slug: 'my-tenant',
  name: 'My Tenant',
  withSchema: true, // Create PostgreSQL schema
  withMinioBucket: true, // Create MinIO bucket
});

// Create user in tenant schema
const user = await testDb.createUser('my-tenant', {
  keycloakId: 'kc-user-123',
  email: 'user@example.com',
  firstName: 'John',
  lastName: 'Doe',
});

// Create workspace
const workspace = await testDb.createWorkspace('my-tenant', tenant.id, {
  slug: 'main',
  name: 'Main Workspace',
  ownerId: user.id,
});

// Reset all data
await testDb.reset();
```

### Keycloak Helper

```typescript
import { testKeycloak } from '@/test-infrastructure/helpers/test-keycloak.helper';

// Create a test user in Keycloak
const userId = await testKeycloak.createUser({
  username: 'test-user',
  email: 'test@example.com',
  password: 'password123',
  roles: ['tenant-admin'],
  attributes: {
    tenant_id: ['my-tenant'],
  },
});

// Get real JWT token
const tokenResponse = await testKeycloak.getUserToken('test-user', 'password123');
const { access_token } = tokenResponse;

// Find user
const user = await testKeycloak.findUserByEmail('test@example.com');

// Delete user
await testKeycloak.deleteUser(userId);
```

### Auth Helper

```typescript
import { testAuth } from '@/test-infrastructure/helpers/test-auth.helper';

// Create mock JWT tokens (no Keycloak required)
const superAdminToken = testAuth.createMockSuperAdminToken();
const tenantAdminToken = testAuth.createMockTenantAdminToken('acme-corp');
const tenantMemberToken = testAuth.createMockTenantMemberToken('acme-corp');

// Create auth headers
const headers = testAuth.createAuthHeader(superAdminToken);
// { authorization: 'Bearer eyJhbGc...' }

// Get real tokens from Keycloak
const realToken = await testAuth.getRealSuperAdminToken();

// Token utilities
const decoded = testAuth.decodeToken(token);
const roles = testAuth.extractRoles(token);
const tenantId = testAuth.extractTenantId(token);
const isSuperAdmin = testAuth.isSuperAdmin(token);
```

### MinIO Helper

```typescript
import { testMinio } from '@/test-infrastructure/helpers/test-minio.helper';

// Create tenant bucket (automatic when creating tenant via testDb)
await testMinio.createTenantBucket('my-tenant');

// Upload file
await testMinio.uploadFile('my-tenant', 'path/to/file.pdf', '/local/file.pdf');

// Upload buffer
const buffer = Buffer.from('Hello World');
await testMinio.uploadBuffer('my-tenant', 'greeting.txt', buffer);

// Download file
await testMinio.downloadFile('my-tenant', 'path/to/file.pdf', '/local/download.pdf');

// Get object as buffer
const data = await testMinio.getObject('my-tenant', 'greeting.txt');

// List objects
const objects = await testMinio.listObjects('my-tenant', 'path/to/', true);

// Delete object
await testMinio.deleteObject('my-tenant', 'path/to/file.pdf');

// Generate presigned URL
const url = await testMinio.getPresignedUrl('my-tenant', 'file.pdf', 3600);

// Clean up all buckets
await testMinio.cleanupAllBuckets();
```

### Redpanda Helper

```typescript
import { testRedpanda } from '@/test-infrastructure/helpers/test-redpanda.helper';

// Create topic
await testRedpanda.createTopic('events.tenant.created', {
  partitions: 3,
  replicationFactor: 1,
});

// Produce message
await testRedpanda.produceMessage('events.tenant.created', {
  key: 'tenant-123',
  value: { id: 'tenant-123', name: 'Test Tenant' },
  headers: { 'content-type': 'application/json' },
});

// Consume messages
const messages = await testRedpanda.consumeMessages('events.tenant.created', {
  groupId: 'test-consumer-group',
  fromBeginning: true,
  timeout: 5000,
});

// List topics
const topics = await testRedpanda.listTopics();

// Delete topic
await testRedpanda.deleteTopic('events.tenant.created');

// Get topic metadata
const metadata = await testRedpanda.getTopicMetadata('events.tenant.created');

// Clean up all test topics
await testRedpanda.cleanupAllTopics();
```

## 📝 Environment Variables

All test environment variables are in `apps/core-api/.env.test`:

```bash
# Node Environment
NODE_ENV=test

# Database (Test PostgreSQL on port 5433)
DATABASE_URL="postgresql://plexica_test:plexica_test_password@localhost:5433/plexica_test?schema=core"

# Redis (Test Redis on port 6380)
REDIS_HOST="localhost"
REDIS_PORT="6380"

# Keycloak (Test Keycloak on port 8081)
KEYCLOAK_URL="http://localhost:8081"
KEYCLOAK_REALM="plexica-test"
KEYCLOAK_CLIENT_ID="plexica-test-api"
KEYCLOAK_CLIENT_SECRET="test-client-secret"

# MinIO (Test MinIO on ports 9010/9011)
MINIO_ENDPOINT="localhost"
MINIO_PORT="9010"
MINIO_ACCESS_KEY="minioadmin_test"
MINIO_SECRET_KEY="minioadmin_test"
MINIO_USE_SSL="false"

# Redpanda (Test Redpanda/Kafka on port 9095)
REDPANDA_BROKERS="localhost:9095"
KAFKA_CLIENT_ID="plexica-test-client"
KAFKA_CONSUMER_GROUP_ID="plexica-test-consumer"

# JWT
JWT_SECRET="test-jwt-secret-key-do-not-use-in-production"

# Logging
LOG_LEVEL="error"
```

## 🧪 Test Patterns

### Unit Tests

Use **mock tokens** (no real Keycloak):

```typescript
import { testAuth } from '@/test-infrastructure/helpers/test-auth.helper';

describe('Service Unit Test', () => {
  it('should validate permissions', () => {
    const token = testAuth.createMockTenantAdminToken('acme-corp');
    const isSuperAdmin = testAuth.isSuperAdmin(token);
    expect(isSuperAdmin).toBe(false);
  });
});
```

### Integration Tests

Use **real Keycloak** and **database**:

```typescript
import { testContext } from '@/test-infrastructure/helpers/test-context.helper';

describe('API Integration Test', () => {
  beforeAll(async () => {
    await testContext.resetAll();
  });

  it('should create tenant', async () => {
    const token = await testContext.auth.getRealSuperAdminToken();

    // Call API with real token
    const response = await fetch('http://localhost:3000/api/tenants', {
      method: 'POST',
      headers: {
        ...testContext.auth.createAuthHeader(token.access_token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ slug: 'test', name: 'Test' }),
    });

    expect(response.status).toBe(201);

    // Verify database
    const tenant = await testContext.db.getPrisma().tenant.findUnique({
      where: { slug: 'test' },
    });
    expect(tenant).toBeDefined();

    // Verify MinIO bucket
    const bucketExists = await testContext.minio.tenantBucketExists('test');
    expect(bucketExists).toBe(true);
  });
});
```

### E2E Tests

Full end-to-end flow with **all services**:

```typescript
import { testContext } from '@/test-infrastructure/helpers/test-context.helper';

describe('E2E: Tenant Provisioning', () => {
  beforeAll(async () => {
    await testContext.resetAll();
  });

  it('should provision complete tenant', async () => {
    // 1. Create tenant (via API)
    const superAdminToken = await testContext.auth.getRealSuperAdminToken();
    // ... API calls ...

    // 2. Verify database schema exists
    const schemaExists = await testContext.db.getPrisma().$queryRaw`
      SELECT schema_name FROM information_schema.schemata 
      WHERE schema_name = 'tenant_test'
    `;
    expect(schemaExists).toHaveLength(1);

    // 3. Verify MinIO bucket exists
    const bucketExists = await testContext.minio.tenantBucketExists('test');
    expect(bucketExists).toBe(true);

    // 4. Verify Keycloak user can authenticate
    const userToken = await testContext.keycloak.getUserToken('admin@test.local', 'password');
    expect(userToken.access_token).toBeDefined();

    // 5. Verify Redpanda topic was created
    const topics = await testContext.redpanda.listTopics();
    expect(topics).toContain('events.tenant.test.created');

    // 6. Verify event was published
    const messages = await testContext.redpanda.consumeMessages('events.tenant.test.created', {
      groupId: 'test-consumer',
      fromBeginning: true,
    });
    expect(messages).toHaveLength(1);
    expect(messages[0].value).toMatchObject({
      tenantId: 'test',
      eventType: 'TENANT_CREATED',
    });
  });
});
```

## 🔧 Troubleshooting

### Services won't start

```bash
# Check if ports are already in use
lsof -i :5433 # PostgreSQL
lsof -i :8081 # Keycloak
lsof -i :6380 # Redis
lsof -i :9010 # MinIO
lsof -i :9095 # Redpanda Kafka

# Stop existing containers
docker-compose -f test-infrastructure/docker/docker-compose.test.yml down -v
```

### Keycloak is slow to start

Keycloak can take 60-90 seconds to start. The `test-setup.sh` script waits up to 120 seconds.

### Database migrations fail

```bash
# Run migrations manually
cd packages/database
DATABASE_URL="postgresql://plexica_test:plexica_test_password@localhost:5433/plexica_test?schema=core" npx prisma migrate deploy
```

### Seed data fails

```bash
# Run seed manually
tsx test-infrastructure/fixtures/minimal-seed.ts
```

### Redpanda topics are not visible

```bash
# Check Redpanda status
docker exec plexica-redpanda-test rpk cluster health

# List topics manually
docker exec plexica-redpanda-test rpk topic list

# Access Redpanda Console
open http://localhost:8091
```

## 📚 Next Steps

1. **Phase 2**: Implement Auth tests (reorganize existing + add new)
2. **Phase 3**: Implement Tenant tests (provisioning + isolation)
3. **Phase 4**: Implement Workspace tests (permissions + teams)
4. **Phase 5**: Implement Plugin tests (lifecycle + marketplace)
5. **Phase 6**: Set up CI/CD with GitHub Actions
6. **Phase 7**: Create quickstart seed with demo data

See `TEST_IMPLEMENTATION_PLAN.md` for detailed implementation plan.
