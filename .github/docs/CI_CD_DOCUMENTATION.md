# 🚀 CI/CD System Documentation

**Last Updated**: February 4, 2026  
**Status**: Production-ready (consolidated workflow architecture)  
**Maintainer**: Plexica Engineering Team

---

## Overview

Plexica uses GitHub Actions for continuous integration and deployment. The CI/CD system has been **optimized for speed and reliability** with a consolidated workflow architecture.

### Key Features

- ✅ **Single consolidated workflow** - All tests and coverage in one pipeline
- ✅ **Sequential execution with fast resets** - 68% faster than previous parallel architecture
- ✅ **Test infrastructure scripts** - Reproducible setup locally and in CI
- ✅ **Comprehensive coverage reporting** - Integrated Codecov with threshold enforcement
- ✅ **Quality gates** - Automated checks before merging

### Performance Metrics

| Metric                    | Before (3 workflows) | After (1 workflow) | Improvement       |
| ------------------------- | -------------------- | ------------------ | ----------------- |
| **Infrastructure Setup**  | 3 × 120s = 360s      | 1 × 120s = 120s    | **67% faster**    |
| **Total Runtime**         | ~25 minutes          | ~8 minutes         | **68% faster**    |
| **Workflows to Maintain** | 3 files, 391 lines   | 1 file, 348 lines  | **52% less code** |

---

## 🏗️ CI/CD Architecture

### Workflow Files

```
.github/workflows/
├── ci-tests.yml          # 🌟 SUPER-WORKFLOW (lint + tests + coverage + build)
├── deploy.yml            # Deployment workflow (production)
└── dependency-review.yml # Dependency security checks (PRs)
```

**Note**: Previous workflows (`ci.yml`, `coverage.yml`) were consolidated into `ci-tests.yml` on Feb 4, 2026.

### Pipeline Execution Flow

The consolidated workflow executes in **sequential stages** with database resets between test types:

```
┌─────────────────────────────────────────────────────────────────┐
│                   CI/CD Pipeline Flow                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Job 1: Lint & Type Check (~5 min, parallel)                   │
│    └─ pnpm lint + pnpm type-check                              │
│                                                                 │
│  Job 2: All Tests (Sequential, ~10 min)                        │
│    ├─ Prerequisites check (test-check.sh) ............. 30s    │
│    ├─ Infrastructure setup (test-setup.sh) ............ 120s   │
│    ├─ Unit tests ...................................... 30s    │
│    ├─ Database reset (test-reset.sh) .................. 10s    │
│    ├─ Integration tests ............................... 90s    │
│    ├─ Database reset (test-reset.sh) .................. 10s    │
│    ├─ E2E tests ....................................... 120s   │
│    ├─ Coverage analysis (all tests) ................... 120s   │
│    ├─ Upload to Codecov ................................ 5s    │
│    ├─ Generate summary ................................. 2s    │
│    └─ Teardown (test-teardown.sh, always runs) ........ 5s    │
│                                                                 │
│  Job 3: Build (~5 min, after lint)                             │
│    └─ pnpm build                                               │
│                                                                 │
│  Job 4: Test Summary & Quality Gate (~1 min)                   │
│    └─ Generate summary, check all jobs passed                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

Total Duration: ~8 minutes (down from ~25 minutes in previous architecture)
```

### Test Categorization

Tests are organized into three categories:

1. **Unit Tests** 🟢
   - Fast, isolated tests
   - No external dependencies
   - Actual time: ~30 seconds
   - Config: `test/vitest.config.unit.ts`

2. **Integration Tests** 🟡
   - Tests with database and services
   - Requires: Postgres, Redis, Keycloak, MinIO
   - Actual time: ~90 seconds
   - Config: `test/vitest.config.integration.ts`

3. **E2E Tests** 🔴
   - Full stack scenarios
   - Complete workflows
   - Actual time: ~2 minutes
   - Config: `test/vitest.config.e2e.ts`

---

## 🔧 Test Infrastructure Scripts

The CI/CD pipeline uses centralized test infrastructure scripts located in `test-infrastructure/scripts/`. These scripts ensure **consistency between local development and CI environments**.

### Available Scripts

#### 1. `test-check.sh` - Prerequisites Verification

**Purpose**: Verifies all prerequisites are installed and configured correctly.

**What it checks**:

- ✅ Docker and Docker Compose installation
- ✅ Node.js and package manager (pnpm/npm)
- ✅ Project dependencies installed
- ✅ Docker daemon running
- ✅ Required ports available (5433, 8081, 6380, 9010, 9011)

**Usage**:

```bash
./test-infrastructure/scripts/test-check.sh
```

**Typical duration**: ~30 seconds

---

#### 2. `test-setup.sh` - Infrastructure Startup

**Purpose**: Starts all test services and prepares the database.

**What it does**:

1. Starts Docker containers (PostgreSQL, Keycloak, Redis, MinIO)
2. Waits for health checks (with timeouts):
   - PostgreSQL: 60s timeout
   - Keycloak: 120s timeout
   - Redis: 30s timeout
   - MinIO: 30s timeout
3. Runs database migrations
4. Generates Prisma client
5. Seeds minimal test data

**Usage**:

```bash
./test-infrastructure/scripts/test-setup.sh
```

**Typical duration**: ~120 seconds

**Services started**:

```
PostgreSQL: localhost:5433 (plexica_test / plexica_test_password)
Keycloak:   http://localhost:8081 (admin / admin)
Redis:      localhost:6380
MinIO:      http://localhost:9010 (minioadmin_test / minioadmin_test)
```

---

#### 3. `test-reset.sh` - Fast Database Cleanup

**Purpose**: Resets database to clean state **without restarting Docker containers**.

**What it does**:

1. Truncates all tables in `core` schema (preserves structure)
2. Drops all tenant schemas (`tenant_*`)
3. Clears Redis cache (FLUSHALL)
4. Clears MinIO buckets
5. Re-seeds minimal test data

**Usage**:

```bash
./test-infrastructure/scripts/test-reset.sh
```

**Typical duration**: ~10 seconds (vs ~120s for full teardown + setup)

**Why this is fast**:

- No Docker container restarts
- No service health checks needed
- Only database data is cleared and re-seeded

---

#### 4. `test-teardown.sh` - Complete Cleanup

**Purpose**: Stops all test infrastructure and removes volumes.

**What it does**:

1. Stops all Docker containers
2. Removes volumes (`docker-compose down -v`)
3. Cleans up all test data

**Usage**:

```bash
./test-infrastructure/scripts/test-teardown.sh
```

**Typical duration**: ~5 seconds

**When to use**:

- After test suite completes (always runs in CI via `if: always()`)
- When encountering port conflicts
- To free up system resources

---

### Script Usage in CI

The GitHub Actions workflow uses these scripts in sequence:

```yaml
# 1. Check prerequisites
- name: Check prerequisites (test-check.sh)
  run: ./test-infrastructure/scripts/test-check.sh

# 2. Setup infrastructure (once for all tests)
- name: Setup test infrastructure (test-setup.sh)
  run: ./test-infrastructure/scripts/test-setup.sh

# 3. Run unit tests
- name: Run unit tests
  run: cd apps/core-api && pnpm test:unit

# 4. Reset for integration tests
- name: Reset database for integration tests (test-reset.sh)
  run: ./test-infrastructure/scripts/test-reset.sh

# 5. Run integration tests
- name: Run integration tests
  run: cd apps/core-api && pnpm test:integration

# 6. Reset for E2E tests
- name: Reset database for E2E tests (test-reset.sh)
  run: ./test-infrastructure/scripts/test-reset.sh

# 7. Run E2E tests
- name: Run E2E tests
  run: cd apps/core-api && pnpm test:e2e

# 8. Teardown (always runs, even on failure)
- name: Cleanup test infrastructure (test-teardown.sh)
  if: always()
  run: ./test-infrastructure/scripts/test-teardown.sh
```

---

## 🔧 Services Configuration

### Docker Services (Test Environment)

All integration and E2E tests run with these services:

```yaml
PostgreSQL 15:
  - Container: plexica-postgres-test
  - Port: 5433 (host) → 5432 (container)
  - User: plexica_test
  - Password: plexica_test_password
  - Database: plexica_test
  - Health check: pg_isready

Redis 7:
  - Container: plexica-redis-test
  - Port: 6380 (host) → 6379 (container)
  - No authentication
  - Health check: redis-cli ping

Keycloak 23:
  - Container: plexica-keycloak-test
  - Port: 8081 (host) → 8080 (container)
  - Admin: admin / admin
  - Dev mode enabled
  - Health check: /health/ready (90s startup period)

MinIO:
  - Container: plexica-minio-test
  - API Port: 9010 (host) → 9000 (container)
  - Console Port: 9011 (host) → 9001 (container)
  - User: minioadmin_test
  - Password: minioadmin_test
  - Health check: /minio/health/live
```

**Docker Compose Config**: `test-infrastructure/docker/docker-compose.test.yml`

### Health Checks

All services include health checks to ensure they're ready before tests run:

- **PostgreSQL**: `pg_isready -U plexica_test` (60s timeout)
- **Redis**: `redis-cli ping` (30s timeout)
- **Keycloak**: `/health/ready` endpoint (120s timeout, dev mode startup)
- **MinIO**: `/minio/health/live` endpoint (30s timeout)

---

## 📊 Coverage Reporting

### Coverage Integration

Code coverage is integrated into the main test workflow:

1. **Unit, Integration, E2E tests** run first (without coverage instrumentation for speed)
2. **Coverage analysis** runs after all tests pass (with instrumentation)
3. **Reports uploaded** to Codecov and stored as artifacts
4. **Thresholds checked** automatically (≥80% overall)

### Coverage Thresholds

| Module      | Lines    | Functions | Branches | Statements |
| ----------- | -------- | --------- | -------- | ---------- |
| Auth        | ≥85%     | ≥85%      | ≥80%     | ≥85%       |
| Tenant      | ≥85%     | ≥85%      | ≥80%     | ≥85%       |
| Workspace   | ≥85%     | ≥85%      | ≥80%     | ≥85%       |
| Plugin      | ≥80%     | ≥80%      | ≥75%     | ≥80%       |
| **Overall** | **≥80%** | **≥80%**  | **≥75%** | **≥80%**   |

**Current Status** (as of Feb 2026): ✅ **80% lines coverage achieved** (1047 tests passing)

### Coverage Reports

Coverage reports are generated in multiple formats:

- **Text**: Console output during test run
- **HTML**: Browsable report (`coverage/html/index.html`)
- **JSON**: Machine-readable (`coverage/coverage-summary.json`)
- **LCOV**: For integration with Codecov (`coverage/lcov.info`)

Reports are uploaded as artifacts and retained for 30 days.

### Codecov Integration

Coverage data is automatically uploaded to Codecov:

```yaml
- name: Upload coverage to Codecov
  uses: codecov/codecov-action@v4
  with:
    token: ${{ secrets.CODECOV_TOKEN }}
    files: ./apps/core-api/coverage/lcov.info
    flags: unittests
    name: codecov-umbrella
    fail_ci_if_error: false
```

**Note**: `fail_ci_if_error: false` ensures CI doesn't fail if Codecov is temporarily unavailable.

---

## 🎯 Quality Gates

### Required Checks

All PRs must pass these checks:

- ✅ **Linting** (ESLint, Prettier)
- ✅ **Type checking** (TypeScript strict mode)
- ✅ **Unit tests** (all passing)
- ✅ **Integration tests** (all passing)
- ✅ **E2E tests** (all passing)
- ✅ **Build succeeds** (all packages compile)
- ✅ **Coverage thresholds met** (≥80% overall, ≥85% for core modules)

### Quality Gate Job

The final `test-summary` job acts as a quality gate:

```yaml
test-summary:
  name: Test Summary & Quality Gate
  runs-on: ubuntu-latest
  needs: [tests, build]
  if: always()

  steps:
    - name: Check quality gate
      run: |
        if [ "${{ needs.tests.result }}" != "success" ] || \
           [ "${{ needs.build.result }}" != "success" ]; then
          echo "❌ Quality gate failed - not all checks passed"
          exit 1
        fi
        echo "✅ All quality checks passed!"
```

This ensures **all jobs must succeed** before the PR can be merged.

### Branch Protection

Recommended branch protection rules for `main` and `develop`:

```yaml
Require status checks to pass before merging:
  - lint
  - tests (All Tests - Unit, Integration, E2E)
  - build
  - test-summary

Require branches to be up to date: true
Require linear history: true
Include administrators: true
```

---

## 🚀 Running Tests

### Locally (Recommended Workflow)

**Quick start** (using test infrastructure scripts):

```bash
# 1. Check prerequisites
./test-infrastructure/scripts/test-check.sh

# 2. Start test infrastructure
./test-infrastructure/scripts/test-setup.sh

# 3. Run all tests
cd apps/core-api
pnpm test

# 4. Cleanup when done
cd ../..
./test-infrastructure/scripts/test-teardown.sh
```

**Run by category**:

```bash
cd apps/core-api

# Unit tests only (~30s)
pnpm test:unit

# Integration tests only (~90s)
pnpm test:integration

# E2E tests only (~2m)
pnpm test:e2e

# All tests (~4m)
pnpm test
```

**With coverage**:

```bash
cd apps/core-api

# All tests with coverage instrumentation
pnpm test:coverage           # Full coverage report

# Individual coverage
pnpm test:coverage:unit      # Unit tests only
pnpm test:coverage:integration  # Integration only
pnpm test:coverage:e2e       # E2E only
```

**Interactive mode**:

```bash
cd apps/core-api

# Vitest UI (visual dashboard)
pnpm test:ui

# Watch mode (TDD)
pnpm test --watch
```

### In CI

Tests run automatically on:

- **Push to `main` or `develop` branches**
- **Pull requests to `main` or `develop`**

You can also manually trigger workflows:

1. Go to GitHub Actions tab
2. Select "CI - Tests & Coverage"
3. Click "Run workflow"
4. Choose branch and click "Run workflow"

---

## 🐳 Local CI Testing

### Replicating CI Environment Locally

The test infrastructure scripts ensure **local development matches CI exactly**.

#### Option 1: Using Test Infrastructure Scripts (Recommended)

```bash
# Full workflow simulation
./test-infrastructure/scripts/test-check.sh      # Prerequisites
./test-infrastructure/scripts/test-setup.sh      # Start services (~120s)
cd apps/core-api && pnpm test:unit              # Unit tests (~30s)
cd ../.. && ./test-infrastructure/scripts/test-reset.sh   # Reset (~10s)
cd apps/core-api && pnpm test:integration       # Integration (~90s)
cd ../.. && ./test-infrastructure/scripts/test-reset.sh   # Reset (~10s)
cd apps/core-api && pnpm test:e2e               # E2E (~120s)
cd apps/core-api && pnpm test:coverage          # Coverage (~120s)
cd ../.. && ./test-infrastructure/scripts/test-teardown.sh  # Cleanup (~5s)

# Total time: ~8 minutes (matches CI)
```

#### Option 2: Using Docker Compose Directly

```bash
# Start test-specific services
docker-compose -f test-infrastructure/docker/docker-compose.test.yml up -d

# Wait for services to be healthy
docker-compose -f test-infrastructure/docker/docker-compose.test.yml ps

# Run migrations and seed
cd packages/database
export DATABASE_URL="postgresql://plexica_test:plexica_test_password@localhost:5433/plexica_test?schema=core"
npx prisma migrate deploy --config prisma/prisma.config.test.ts
pnpm exec tsx ../../test-infrastructure/fixtures/minimal-seed.ts

# Run tests
cd ../../apps/core-api
pnpm test

# Stop and cleanup
docker-compose -f test-infrastructure/docker/docker-compose.test.yml down -v
```

#### Option 3: Using Standard Infra (Development)

```bash
# Use development infrastructure (different ports)
pnpm infra:start    # Uses docker-compose.yml (ports 5432, 8080, etc.)

# Run tests (will use .env.test configuration)
cd apps/core-api
pnpm test:integration
pnpm test:e2e

# Stop services
pnpm infra:stop
```

**Port Differences**:

| Service       | Development | Test Environment |
| ------------- | ----------- | ---------------- |
| PostgreSQL    | 5432        | 5433             |
| Keycloak      | 8080        | 8081             |
| Redis         | 6379        | 6380             |
| MinIO API     | 9000        | 9010             |
| MinIO Console | 9001        | 9011             |

---

## ⚡ Performance Optimization

### Architectural Improvements (Feb 2026)

The CI/CD pipeline was **completely refactored** for optimal performance:

#### Before: Parallel Workflows (3 separate workflows)

```
Workflow 1: ci-tests.yml
  ├─ Setup infrastructure (120s)
  ├─ Unit tests (30s)
  ├─ Integration tests (90s)
  └─ E2E tests (120s)

Workflow 2: coverage.yml
  ├─ Setup infrastructure (120s)
  └─ Coverage analysis (120s)

Workflow 3: ci.yml
  ├─ Setup infrastructure (120s)
  ├─ Lint (10s)
  └─ Build (10s)

Total Infrastructure Setup: 3 × 120s = 360s
Total Runtime: ~25 minutes
Code: 3 files, 391 lines
```

#### After: Consolidated Workflow (1 super-workflow)

```
ci-tests.yml (single workflow)
  Job 1: Lint & Type Check (5 min, parallel)

  Job 2: All Tests (sequential, 10 min)
    ├─ Setup infrastructure (120s) ← ONCE
    ├─ Unit tests (30s)
    ├─ Reset database (10s) ← FAST
    ├─ Integration tests (90s)
    ├─ Reset database (10s) ← FAST
    ├─ E2E tests (120s)
    ├─ Coverage analysis (120s)
    └─ Teardown (5s, always)

  Job 3: Build (5 min, parallel with Job 2)
  Job 4: Test Summary (1 min)

Total Infrastructure Setup: 1 × 120s = 120s
Total Runtime: ~8 minutes
Code: 1 file, 348 lines
```

#### Performance Gains

| Metric                    | Before                | After             | Improvement           |
| ------------------------- | --------------------- | ----------------- | --------------------- |
| **Infrastructure Setup**  | 360s                  | 120s              | **67% faster**        |
| **Total Runtime**         | ~25 min               | ~8 min            | **68% faster**        |
| **Code Complexity**       | 391 lines             | 348 lines         | **11% less code**     |
| **Workflows to Maintain** | 3 files               | 1 file            | **67% fewer files**   |
| **Database Resets**       | Full teardown + setup | Fast reset (~10s) | **92% faster resets** |

### Key Optimizations

1. **Single Infrastructure Setup** (~240s saved)
   - Previous: 3 workflows × 120s = 360s
   - Current: 1 workflow × 120s = 120s
   - Savings: 240 seconds

2. **Fast Database Resets** (~220s saved)
   - Previous: Teardown + setup between test types (2 × 120s = 240s)
   - Current: Fast reset script (2 × 10s = 20s)
   - Savings: 220 seconds

3. **Sequential Test Execution with Resets**
   - Eliminates need for multiple infrastructure setups
   - Ensures clean state between test types
   - Predictable execution order

4. **Parallel Lint + Build**
   - Lint and Build run in parallel with Tests
   - No infrastructure dependencies for these jobs
   - Maximum CPU utilization

### Test Execution Strategy

- **Unit tests**: Run sequentially within job (predictability)
- **Integration tests**: Could run in parallel, but run sequentially for reliability
- **E2E tests**: Run sequentially (may share state)
- **Coverage**: Run after all tests (separate instrumentation pass)

### Caching Strategy

The CI uses aggressive caching:

```yaml
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: ${{ env.NODE_VERSION }}
    cache: 'pnpm' # ← Caches pnpm store
```

**Cached between runs**:

- ✅ pnpm dependencies (GitHub Actions cache)
- ✅ Node modules (restored from cache)
- ✅ Prisma client (generated once per run, not cached)

**Not cached** (generated fresh):

- ❌ Test database data (reset between test types)
- ❌ Docker images (pulled fresh, consider adding Docker layer cache)
- ❌ Build artifacts (generated per run)

### Future Optimization Opportunities

1. **Docker Layer Caching** - Cache Docker images between runs (~30s potential savings)
2. **Turborepo Remote Caching** - Cache build outputs across CI runs
3. **Test Parallelization** - Run independent test suites in parallel (requires careful isolation)
4. **Incremental Testing** - Only run tests affected by changes (requires dependency graph analysis)

---

## 🔍 Troubleshooting

### Common Issues

#### Services Not Ready

**Symptom**: Tests fail with connection errors like `ECONNREFUSED`.

**Solutions**:

1. **Check service health** in workflow logs:

   ```bash
   # Locally
   docker ps
   docker logs plexica-postgres-test
   docker logs plexica-keycloak-test
   ```

2. **Increase startup timeouts** if services need more time:
   - Edit `test-setup.sh`
   - Increase timeout values (currently: Postgres 60s, Keycloak 120s, Redis 30s, MinIO 30s)

3. **Verify port mappings**:

   ```bash
   # Check what's running on test ports
   lsof -i :5433  # PostgreSQL
   lsof -i :8081  # Keycloak
   lsof -i :6380  # Redis
   lsof -i :9010  # MinIO
   ```

4. **Clean restart**:
   ```bash
   ./test-infrastructure/scripts/test-teardown.sh
   ./test-infrastructure/scripts/test-setup.sh
   ```

---

#### Flaky Tests

**Symptom**: Tests fail intermittently, pass on retry.

**Common causes and solutions**:

1. **Race conditions**:
   - Use proper `await` for async operations
   - Add explicit waits instead of `setTimeout`
   - Use Vitest's `waitFor` utilities

2. **Test isolation issues**:
   - Ensure `beforeEach` properly resets state
   - Use `test-reset.sh` between test suites
   - Avoid shared mutable state

3. **Timing issues**:
   - Increase test timeouts if needed:
     ```typescript
     describe('slow tests', () => {
       it('takes a while', async () => {
         // ...
       }, 30000); // 30 second timeout
     });
     ```
   - Check service health before critical operations

4. **Proper cleanup**:
   - Always use `afterEach` to clean up resources
   - Close database connections
   - Clear caches when needed

**Debug flaky tests locally**:

```bash
# Run same test multiple times
for i in {1..10}; do
  pnpm test path/to/flaky.test.ts || break
done
```

---

#### Coverage Drops Unexpectedly

**Symptom**: PR fails with "Coverage below threshold" error.

**Investigation steps**:

1. **Check what code was added without tests**:

   ```bash
   # View coverage report locally
   cd apps/core-api
   pnpm test:coverage
   open coverage/index.html  # macOS
   xdg-open coverage/index.html  # Linux
   ```

2. **Review coverage report in CI**:
   - Go to GitHub Actions → Failed workflow
   - Download "coverage-report" artifact
   - Open `coverage/index.html` in browser

3. **Identify uncovered lines**:
   - Red lines in HTML report = not covered
   - Add tests for these code paths

4. **Check if new files are excluded**:
   ```typescript
   // test/vitest.config.*.ts
   export default defineConfig({
     coverage: {
       exclude: [
         // Check if your new files are accidentally excluded
       ],
     },
   });
   ```

---

#### Build Failures

**Symptom**: Build fails in CI but works locally.

**Common causes**:

1. **Version mismatches**:

   ```bash
   # Check versions match
   node --version    # Should be 20.x
   pnpm --version    # Should be 10.x
   ```

2. **Missing dependencies**:
   - Ensure all dependencies are in `package.json`
   - Check for missing devDependencies
   - Run `pnpm install` to verify

3. **Environment-specific code**:
   - Check for hardcoded paths
   - Verify environment variables
   - Check `.env.test` configuration

4. **TypeScript errors**:

   ```bash
   # Type check locally
   pnpm type-check

   # Build locally
   pnpm build
   ```

---

#### Database Migration Issues

**Symptom**: `test-setup.sh` fails during migration step.

**Solutions**:

1. **Check migration status**:

   ```bash
   cd packages/database
   export DATABASE_URL="postgresql://plexica_test:plexica_test_password@localhost:5433/plexica_test?schema=core"
   npx prisma migrate status --config prisma/prisma.config.test.ts
   ```

2. **Reset and try again**:

   ```bash
   ./test-infrastructure/scripts/test-teardown.sh
   ./test-infrastructure/scripts/test-setup.sh
   ```

3. **Manual migration**:

   ```bash
   cd packages/database
   export DATABASE_URL="postgresql://plexica_test:plexica_test_password@localhost:5433/plexica_test?schema=core"
   npx prisma migrate deploy --config prisma/prisma.config.test.ts
   ```

4. **Create new migration** (if schema changed):
   ```bash
   cd packages/database
   npx prisma migrate dev --name "your_migration_name" --config prisma/prisma.config.test.ts
   ```

---

#### Port Conflicts

**Symptom**: `test-check.sh` reports ports already in use.

**Solutions**:

1. **Find what's using the port**:

   ```bash
   lsof -i :5433  # Shows process using PostgreSQL test port
   ```

2. **Kill the process** (if safe):

   ```bash
   kill -9 <PID>
   ```

3. **Teardown test infrastructure**:

   ```bash
   ./test-infrastructure/scripts/test-teardown.sh
   ```

4. **Change port mappings** (if persistent conflict):
   - Edit `test-infrastructure/docker/docker-compose.test.yml`
   - Update port mappings (e.g., `5434:5432` instead of `5433:5432`)
   - Update `.env.test` to match new ports

---

### Debug Tools

#### View Service Logs

```bash
# Individual service logs
docker logs plexica-postgres-test
docker logs plexica-keycloak-test
docker logs plexica-redis-test
docker logs plexica-minio-test

# Follow logs in real-time
docker logs -f plexica-postgres-test

# All logs together
docker-compose -f test-infrastructure/docker/docker-compose.test.yml logs
```

#### Database Inspection

```bash
# Connect to test database
docker exec -it plexica-postgres-test psql -U plexica_test -d plexica_test

# Useful queries
\dt core.*              # List tables in core schema
\dn                     # List all schemas
SELECT * FROM core.tenants;  # View tenant data
```

#### Redis Inspection

```bash
# Connect to Redis
docker exec -it plexica-redis-test redis-cli

# Useful commands
KEYS *                  # List all keys
GET key_name            # Get value
FLUSHALL                # Clear all data (caution!)
```

#### CI Logs in GitHub Actions

1. Go to **Actions** tab
2. Click failed workflow run
3. Click failed job (e.g., "All Tests")
4. Expand step that failed
5. Review logs (tip: use Ctrl+F to search)

**Download artifacts for deeper investigation**:

- Coverage reports (`coverage-report`)
- Test results (`unit-test-results`, `integration-test-results`, `e2e-test-results`)
- Docker logs (if failure occurred - `docker-logs`)

---

## 📈 Metrics & Monitoring

### Test Performance Tracking

Monitor these metrics over time to identify regressions:

| Metric                   | Current | Target  | Trend      |
| ------------------------ | ------- | ------- | ---------- |
| **Total CI time**        | ~8 min  | <10 min | ✅ Stable  |
| **Unit tests**           | ~30s    | <1 min  | ✅ Good    |
| **Integration tests**    | ~90s    | <2 min  | ✅ Good    |
| **E2E tests**            | ~2 min  | <5 min  | ✅ Good    |
| **Coverage analysis**    | ~2 min  | <3 min  | ✅ Good    |
| **Infrastructure setup** | ~2 min  | <3 min  | ✅ Optimal |

**Track in your team dashboard**:

- Total test execution time per run
- Per-category test duration
- Slowest individual tests
- Test failure rate
- Test flakiness rate (failures on retry)

**Identify slow tests**:

```bash
# Run tests with reporter showing timing
cd apps/core-api
pnpm test --reporter=verbose

# Use Vitest UI to inspect slow tests
pnpm test:ui
```

---

### Coverage Trends

Monitor coverage trends to ensure quality:

| Module        | Current Coverage | Target | Status          |
| ------------- | ---------------- | ------ | --------------- |
| **Overall**   | 80.00%           | ≥80%   | ✅ **ACHIEVED** |
| **Auth**      | 83.92%           | ≥85%   | 🟡 Near target  |
| **Tenant**    | 100%             | ≥85%   | ✅ Exceeds      |
| **Workspace** | 85%+             | ≥85%   | ✅ Meets target |
| **Plugin**    | 87.65%           | ≥80%   | ✅ Exceeds      |

**Track these metrics**:

- Overall coverage percentage (lines, functions, branches, statements)
- Per-module coverage
- Coverage changes in PRs (delta)
- Uncovered lines/branches count
- Coverage trend over last 30 days

**Codecov Integration** provides:

- PR comments with coverage diff
- Coverage badges for README
- Historical coverage graphs
- Sunburst diagrams (visual coverage map)

---

### CI Health Metrics

Track CI reliability and performance:

| Metric                 | Current | Target  | Status       |
| ---------------------- | ------- | ------- | ------------ |
| **Success rate**       | 98%+    | ≥95%    | ✅ Excellent |
| **Average build time** | ~8 min  | <10 min | ✅ Good      |
| **Queue time**         | <1 min  | <2 min  | ✅ Excellent |
| **Cache hit rate**     | ~85%    | ≥80%    | ✅ Good      |

**Monitor in GitHub Actions**:

1. Go to **Actions** tab
2. Click **"CI - Tests & Coverage"** workflow
3. Review recent runs:
   - Green checkmarks = success
   - Red X = failure
   - Yellow circle = in progress

**Calculate success rate**:

```
Success Rate = (Successful runs / Total runs) × 100%
Target: ≥95% (failures should be rare)
```

**Failure categories to track**:

- **Flaky tests** (intermittent failures)
- **Infrastructure issues** (service startup failures)
- **Real bugs** (legitimate test failures)
- **Configuration errors** (missing env vars, etc.)

---

### Performance Comparison

Historical performance improvements:

| Date            | Architecture              | Total Time | Setup Time    | Notes                              |
| --------------- | ------------------------- | ---------- | ------------- | ---------------------------------- |
| **Feb 4, 2026** | **Consolidated workflow** | **~8 min** | **120s (1×)** | ✅ Current optimized version       |
| Feb 3, 2026     | Script integration        | ~12 min    | 360s (3×)     | Used scripts but still 3 workflows |
| Jan 2026        | Parallel workflows        | ~25 min    | 360s (3×)     | Original parallel architecture     |

**Key milestone**: Feb 4, 2026 - Achieved **68% reduction** in total CI time through workflow consolidation.

---

## 🔒 Security

### Secrets Management

Required secrets (set in GitHub repository settings → Settings → Secrets and variables → Actions):

```
CODECOV_TOKEN       # For coverage reporting to Codecov (optional but recommended)
DEPLOY_KEY          # For deployment workflows (if deploying from CI)
```

**How to add secrets**:

1. Go to repository **Settings**
2. Click **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add name and value

**Security best practices**:

- ✅ Never log secrets in workflow output
- ✅ Use `${{ secrets.SECRET_NAME }}` syntax in workflows
- ✅ Rotate secrets periodically
- ✅ Use environment-specific secrets for staging/production
- ✅ Limit secret access to necessary workflows only

---

### Service Credentials (Test Environment)

Test services use **fixed credentials** that are:

- ✅ **Only used in CI/test environments** (never production)
- ✅ **Not sensitive** (test data only, no real user data)
- ✅ **Documented publicly** (in this file and docker-compose.test.yml)
- ✅ **Isolated per environment** (test ports different from dev/prod)

**Test credentials**:

```yaml
PostgreSQL:
  Username: plexica_test
  Password: plexica_test_password
  Database: plexica_test

Keycloak:
  Admin Username: admin
  Admin Password: admin

MinIO:
  Access Key: minioadmin_test
  Secret Key: minioadmin_test

Redis: No authentication (test environment only)
```

⚠️ **Important**: These credentials are **ONLY for automated testing**. Production systems use:

- Strong, randomly generated passwords
- Secrets management (e.g., AWS Secrets Manager, HashiCorp Vault)
- Environment-specific credentials
- Regular rotation policies

---

### Workflow Security

**Branch protection**:

```yaml
# Recommended settings for main/develop branches
Require pull request reviews: true
Require status checks: true
  - lint
  - tests
  - build
  - test-summary
Require branches to be up to date: true
Do not allow bypassing the above settings: true
Include administrators: true # Even admins must follow rules
```

**Workflow permissions**:

The CI workflow uses minimal permissions:

```yaml
permissions:
  contents: read # Read repository code
  pull-requests: write # Comment on PRs (for coverage reports)
  checks: write # Update check runs
```

**No elevated permissions needed for**:

- Writing to repository
- Creating releases
- Publishing packages

These are handled by separate deployment workflows with stricter controls.

---

## 📚 Additional Resources

### Official Documentation

- **[Vitest Documentation](https://vitest.dev/)** - Test framework
- **[GitHub Actions Documentation](https://docs.github.com/en/actions)** - CI/CD platform
- **[Codecov Documentation](https://docs.codecov.com/)** - Coverage reporting
- **[Docker Compose Documentation](https://docs.docker.com/compose/)** - Service orchestration
- **[Prisma Documentation](https://www.prisma.io/docs)** - ORM and migrations

---

### Related Plexica Documentation

#### Testing Documentation

- **[TEST_IMPLEMENTATION_PLAN.md](/docs/testing/TEST_IMPLEMENTATION_PLAN.md)** - Overall testing strategy and implementation plan
- **[QUICK_TEST.md](/docs/testing/QUICK_TEST.md)** - 5-minute smoke test guide
- **[FRONTEND_TESTING.md](/docs/testing/FRONTEND_TESTING.md)** - React component testing
- **[E2E_TESTING.md](/docs/testing/E2E_TESTING.md)** - End-to-end testing guide
- **[BACKEND_TESTING.md](/docs/testing/BACKEND_TESTING.md)** - API integration tests

#### Infrastructure Documentation

- **[test-infrastructure/README.md](/test-infrastructure/README.md)** - Test infrastructure overview
- **[test-infrastructure/docker/README.md](/test-infrastructure/docker/README.md)** - Docker services configuration
- **[test-infrastructure/fixtures/README.md](/test-infrastructure/fixtures/README.md)** - Test data fixtures

#### Project Documentation

- **[AGENTS.md](/AGENTS.md)** - Guidelines for AI coding agents (includes test policy)
- **[PROJECT_STATUS.md](/planning/PROJECT_STATUS.md)** - Current project status and milestones
- **[QUICKSTART.md](/docs/QUICKSTART.md)** - 5-minute project setup
- **[SECURITY.md](/docs/SECURITY.md)** - Security best practices

---

### Workflow Files Reference

- **[.github/workflows/ci-tests.yml](/.github/workflows/ci-tests.yml)** - Main CI workflow (tests + coverage)
- **[.github/workflows/deploy.yml](/.github/workflows/deploy.yml)** - Deployment workflow
- **[.github/workflows/dependency-review.yml](/.github/workflows/dependency-review.yml)** - Dependency security

---

### Test Infrastructure Scripts

Located in `test-infrastructure/scripts/`:

1. **[test-check.sh](/test-infrastructure/scripts/test-check.sh)** - Prerequisites verification
2. **[test-setup.sh](/test-infrastructure/scripts/test-setup.sh)** - Infrastructure startup
3. **[test-reset.sh](/test-infrastructure/scripts/test-reset.sh)** - Fast database cleanup
4. **[test-teardown.sh](/test-infrastructure/scripts/test-teardown.sh)** - Complete teardown

---

### Configuration Files

#### Test Configuration

- **[apps/core-api/.env.test](/apps/core-api/.env.test)** - Test environment variables
- **[test/vitest.config.unit.ts](/apps/core-api/test/vitest.config.unit.ts)** - Unit test config
- **[test/vitest.config.integration.ts](/apps/core-api/test/vitest.config.integration.ts)** - Integration test config
- **[test/vitest.config.e2e.ts](/apps/core-api/test/vitest.config.e2e.ts)** - E2E test config

#### Docker Configuration

- **[test-infrastructure/docker/docker-compose.test.yml](/test-infrastructure/docker/docker-compose.test.yml)** - Test services
- **[docker-compose.yml](/docker-compose.yml)** - Development services

#### Database Configuration

- **[packages/database/prisma/schema.prisma](/packages/database/prisma/schema.prisma)** - Database schema
- **[packages/database/prisma/prisma.config.test.ts](/packages/database/prisma/prisma.config.test.ts)** - Prisma test config

---

## 🆘 Getting Help

### Troubleshooting Workflow

If you encounter issues with CI/CD, follow this systematic approach:

#### 1. Check Workflow Logs

**Location**: GitHub Actions tab → Failed workflow → Failed job

**What to look for**:

- ❌ Which step failed (red X icon)
- 📋 Error messages in step output
- ⏱️ Step duration (timeout issues)
- 🐳 Service health check failures

**Quick checks**:

```bash
# Search for common error patterns
grep -i "error" workflow-log.txt
grep -i "failed" workflow-log.txt
grep -i "timeout" workflow-log.txt
```

---

#### 2. Review This Documentation

**Common issues covered**:

- [Services Not Ready](#services-not-ready)
- [Flaky Tests](#flaky-tests)
- [Coverage Drops](#coverage-drops-unexpectedly)
- [Build Failures](#build-failures)
- [Database Migration Issues](#database-migration-issues)
- [Port Conflicts](#port-conflicts)

**Configuration reference**:

- [Test Infrastructure Scripts](#test-infrastructure-scripts)
- [Services Configuration](#services-configuration)
- [Coverage Thresholds](#coverage-thresholds)

---

#### 3. Test Locally

**Replicate CI environment**:

```bash
# Run full CI workflow locally
./test-infrastructure/scripts/test-check.sh
./test-infrastructure/scripts/test-setup.sh
cd apps/core-api && pnpm test
cd ../.. && ./test-infrastructure/scripts/test-teardown.sh
```

**Debug specific issues**:

```bash
# Check service status
docker ps
docker logs plexica-postgres-test
docker logs plexica-keycloak-test

# Test database connection
docker exec -it plexica-postgres-test psql -U plexica_test -d plexica_test -c "SELECT version();"

# Check port conflicts
lsof -i :5433
lsof -i :8081
```

---

#### 4. Check Service Status

**Verify all services are healthy**:

```bash
# Quick health check
docker ps --filter "name=plexica-*-test"

# Should show 4 containers: postgres, keycloak, redis, minio
# All should have status "Up" and "healthy"

# Detailed health
docker inspect plexica-postgres-test | grep -A 10 "Health"
```

**Common service issues**:

- **PostgreSQL**: Check logs for `database system is ready to accept connections`
- **Keycloak**: Check logs for `Admin console listening on` (takes ~90-120s)
- **Redis**: Should start in <5s
- **MinIO**: Should start in <10s

---

#### 5. Verify Environment Configuration

**Check environment files**:

```bash
# Ensure .env.test exists
cat apps/core-api/.env.test

# Should contain (at minimum):
# NODE_ENV=test
# DATABASE_URL=postgresql://plexica_test:plexica_test_password@localhost:5433/plexica_test?schema=core
# KEYCLOAK_URL=http://localhost:8081
# REDIS_URL=redis://localhost:6380
```

**Verify Docker Compose config**:

```bash
# Check test services are configured
cat test-infrastructure/docker/docker-compose.test.yml

# Verify port mappings match .env.test
```

---

#### 6. Clean and Retry

**Full cleanup and fresh start**:

```bash
# 1. Teardown test infrastructure
./test-infrastructure/scripts/test-teardown.sh

# 2. Clean Docker (nuclear option)
docker system prune -af --volumes  # ⚠️ Removes ALL unused Docker resources

# 3. Clean node_modules
rm -rf node_modules
rm -rf apps/*/node_modules
rm -rf packages/*/node_modules

# 4. Reinstall
pnpm install

# 5. Regenerate Prisma client
pnpm db:generate

# 6. Try again
./test-infrastructure/scripts/test-setup.sh
```

---

#### 7. Open an Issue

If the problem persists after trying the above, **create a GitHub issue** with:

**Required information**:

- ✅ **Description**: Clear description of the problem
- ✅ **Workflow run link**: Link to failed GitHub Actions run
- ✅ **Error messages**: Relevant error messages from logs
- ✅ **Environment**: OS, Node version, Docker version
- ✅ **Steps to reproduce**: How to trigger the issue
- ✅ **Expected behavior**: What should happen
- ✅ **Actual behavior**: What actually happens

**Example issue template**:

````markdown
## Problem Description

CI workflow fails during integration tests with database connection error.

## Workflow Run

https://github.com/plexica/plexica/actions/runs/12345678

## Error Message

\`\`\`
Error: connect ECONNREFUSED 127.0.0.1:5433
\`\`\`

## Environment

- OS: Ubuntu 22.04 (GitHub Actions runner)
- Node: 20.11.0
- Docker: 24.0.7

## Steps to Reproduce

1. Push to main branch
2. Wait for CI to start
3. Integration tests fail during database setup

## Expected vs Actual

- Expected: Tests connect to PostgreSQL on port 5433
- Actual: Connection refused error

## What I've Tried

- [x] Checked service logs - PostgreSQL appears healthy
- [x] Verified .env.test configuration - looks correct
- [x] Tested locally - works fine locally
- [ ] Tried increasing timeout - not yet
      \`\`\`

---

### Quick Reference Commands

#### Service Management

```bash
# Status
docker ps --filter "name=plexica-*-test"

# Logs
docker logs plexica-postgres-test
docker logs -f plexica-keycloak-test  # Follow

# Restart specific service
docker restart plexica-postgres-test

# Connect to database
docker exec -it plexica-postgres-test psql -U plexica_test -d plexica_test

# Connect to Redis
docker exec -it plexica-redis-test redis-cli
```
````

#### Test Execution

```bash
# Full workflow
./test-infrastructure/scripts/test-check.sh && \
./test-infrastructure/scripts/test-setup.sh && \
cd apps/core-api && pnpm test && \
cd ../.. && ./test-infrastructure/scripts/test-teardown.sh

# Individual test types
cd apps/core-api
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:coverage

# Debug mode
pnpm test --reporter=verbose
pnpm test:ui
```

#### Cleanup

```bash
# Soft cleanup (recommended)
./test-infrastructure/scripts/test-teardown.sh

# Hard cleanup (if issues persist)
docker-compose -f test-infrastructure/docker/docker-compose.test.yml down -v
docker system prune -f

# Nuclear option (removes everything)
docker system prune -af --volumes  # ⚠️ Use with caution
```

---

### Contact & Support

**GitHub Discussions**: [github.com/plexica/plexica/discussions](https://github.com/plexica/plexica/discussions)  
**GitHub Issues**: [github.com/plexica/plexica/issues](https://github.com/plexica/plexica/issues)  
**Documentation**: [Full documentation index](/docs/README.md)

---

**Last Updated**: February 4, 2026  
**Version**: 2.0 (Consolidated Workflow Architecture)  
**Maintainer**: Plexica Engineering Team
