# Quick Start: Running Auth Tests

## Prerequisites

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

## Running Tests

### All Auth Tests

```bash
cd apps/core-api

# Run all unit tests
npm run test:unit -- auth/unit/

# Run all integration tests
npm run test:integration -- auth/integration/

# Run all E2E tests
npm run test:e2e -- auth/e2e/
```

### Individual Test Files

```bash
# Unit tests
npm run test:unit -- auth/unit/auth.middleware.test.ts
npm run test:unit -- auth/unit/jwt.test.ts
npm run test:unit -- auth/unit/permission.service.test.ts

# Integration tests
npm run test:integration -- auth/integration/auth-flow.integration.test.ts
npm run test:integration -- auth/integration/permission.integration.test.ts

# E2E tests
npm run test:e2e -- auth/e2e/cross-tenant-security.e2e.test.ts
npm run test:e2e -- auth/e2e/token-refresh.e2e.test.ts
npm run test:e2e -- auth/e2e/security-hardening.e2e.test.ts
```

### With Coverage

```bash
npm run test:coverage
```

### Watch Mode (for development)

```bash
npm run test:unit -- --watch auth/unit/jwt.test.ts
```

## Troubleshooting

### Tests fail with connection errors

**Problem**: Can't connect to Keycloak, PostgreSQL, or Redis

**Solution**:

```bash
cd test-infrastructure
./scripts/test-check.sh  # Check service status
./scripts/test-setup.sh  # Restart services if needed
```

### Tests fail with "schema does not exist"

**Problem**: Database schemas not created

**Solution**:

```bash
cd test-infrastructure
./scripts/test-reset.sh  # Reset and recreate schemas
```

### Keycloak users not found

**Problem**: Test users not created in Keycloak

**Solution**:

```bash
# Restart Keycloak to reload realm config
cd test-infrastructure
docker compose -f docker/docker-compose.test.yml restart keycloak-test

# Wait for Keycloak to be ready (takes ~30 seconds)
./scripts/test-check.sh
```

### Tests hang or timeout

**Problem**: Service not responding

**Solution**:

```bash
# Check Docker logs
docker logs plexica-postgres-test
docker logs plexica-keycloak-test
docker logs plexica-redis-test

# Restart specific service
docker restart plexica-keycloak-test
```

### Clean slate restart

```bash
cd test-infrastructure
./scripts/test-teardown.sh  # Stop all services
./scripts/test-setup.sh     # Start fresh
```

## Expected Results

### Unit Tests

- Should run without needing external services
- Fast execution (< 10 seconds)
- All mocked

### Integration Tests

- Require database and Redis
- Medium execution time (10-30 seconds)
- Test with real services

### E2E Tests

- Require all services (Keycloak, DB, Redis)
- Slower execution (30-60 seconds)
- Full stack testing

## Test Data

### Default Test Credentials

- **Username**: `test-super-admin`, `test-tenant-admin-acme`, `test-tenant-member-acme`
- **Password**: `test123`
- **Keycloak Realm**: `plexica`
- **Keycloak URL**: http://localhost:8081

### Test Tenants

- `acme-corp` (schema: `tenant_acme_corp`)
- `demo-company` (schema: `tenant_demo_company`)

## Continuous Development

### Running tests during development

```bash
# Terminal 1: Keep services running
cd test-infrastructure
./scripts/test-check.sh

# Terminal 2: Run tests in watch mode
cd apps/core-api
npm run test:unit -- --watch auth/unit/
```

### Before committing

```bash
# Run all auth tests
npm run test:unit -- auth/unit/
npm run test:integration -- auth/integration/
npm run test:e2e -- auth/e2e/

# Check coverage
npm run test:coverage
```

## Getting Help

- **Infrastructure docs**: `test-infrastructure/README.md`
- **Troubleshooting**: `test-infrastructure/TROUBLESHOOTING.md`
- **Implementation plan**: `TEST_IMPLEMENTATION_PLAN.md`
- **Phase 2 summary**: `PHASE_2_COMPLETE.md`
