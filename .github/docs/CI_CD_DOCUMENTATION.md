# 🚀 CI/CD System Documentation

## Overview

Plexica uses GitHub Actions for continuous integration and deployment. The CI/CD system is designed to:

- Run tests in parallel for faster feedback
- Generate comprehensive code coverage reports
- Enforce quality gates before merging
- Track test performance over time

---

## 🏗️ CI/CD Architecture

### Workflow Files

```
.github/workflows/
├── ci-tests.yml         # Main test workflow (unit, integration, E2E)
├── coverage.yml         # Code coverage reporting
├── ci.yml              # Legacy workflow (to be deprecated)
├── deploy.yml          # Deployment workflow
└── dependency-review.yml # Dependency security checks
```

### Test Categorization

Tests are organized into three categories:

1. **Unit Tests** 🟢
   - Fast, isolated tests
   - No external dependencies
   - Target: < 30 seconds
   - Config: `test/vitest.config.unit.ts`

2. **Integration Tests** 🟡
   - Tests with database and services
   - Requires: Postgres, Redis, Keycloak, MinIO
   - Target: < 2 minutes
   - Config: `test/vitest.config.integration.ts`

3. **E2E Tests** 🔴
   - Full stack scenarios
   - Complete workflows
   - Target: < 5 minutes
   - Config: `test/vitest.config.e2e.ts`

---

## 🔧 Services Configuration

### GitHub Actions Services

All integration and E2E tests run with these services:

```yaml
PostgreSQL 15:
  - Port: 5432
  - User: plexica_test
  - Password: plexica_test_password
  - Database: plexica_test

Redis 7:
  - Port: 6379
  - No authentication

Keycloak 23:
  - Port: 8080
  - Admin: admin / admin
  - Dev mode enabled

MinIO:
  - Port: 9000
  - User: minioadmin_test
  - Password: minioadmin_test
```

### Health Checks

All services include health checks to ensure they're ready before tests run:

- **PostgreSQL**: `pg_isready` check
- **Redis**: `redis-cli ping` check
- **Keycloak**: `/health/ready` endpoint (90s startup period)
- **MinIO**: `/minio/health/live` endpoint

---

## 📊 Coverage Reporting

### Coverage Thresholds

| Module      | Lines    | Functions | Branches | Statements |
| ----------- | -------- | --------- | -------- | ---------- |
| Auth        | ≥85%     | ≥85%      | ≥80%     | ≥85%       |
| Tenant      | ≥85%     | ≥85%      | ≥80%     | ≥85%       |
| Workspace   | ≥85%     | ≥85%      | ≥80%     | ≥85%       |
| Plugin      | ≥80%     | ≥80%      | ≥75%     | ≥80%       |
| **Overall** | **≥80%** | **≥80%**  | **≥75%** | **≥80%**   |

### Coverage Reports

Coverage reports are generated in multiple formats:

- **Text**: Console output
- **HTML**: Browsable report (`coverage/html/index.html`)
- **JSON**: Machine-readable (`coverage/coverage-summary.json`)
- **LCOV**: For integration with tools like Codecov

Reports are uploaded as artifacts and retained for 30 days.

---

## 🎯 Quality Gates

### Required Checks

All PRs must pass these checks:

- ✅ Linting (ESLint, Prettier)
- ✅ Type checking (TypeScript)
- ✅ Unit tests
- ✅ Integration tests
- ✅ E2E tests
- ✅ Build succeeds
- ✅ Coverage thresholds met

### Branch Protection

Recommended branch protection rules for `main` and `develop`:

```yaml
Require status checks to pass:
  - lint
  - test-unit
  - test-integration
  - test-e2e
  - build
  - test-summary

Require branches to be up to date: true
Require linear history: true
```

---

## 🚀 Running Tests

### Locally

```bash
# Run all tests
pnpm test

# Run by category
pnpm test:unit              # Unit tests only
pnpm test:integration       # Integration tests only
pnpm test:e2e               # E2E tests only

# With coverage
pnpm test:coverage          # All tests with coverage
pnpm test:coverage:unit     # Unit tests coverage
pnpm test:coverage:integration  # Integration coverage
pnpm test:coverage:e2e      # E2E coverage

# Interactive mode
pnpm test:ui                # Vitest UI
```

### In CI

Tests run automatically on:

- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`

You can also manually trigger workflows from the GitHub Actions tab.

---

## 🐳 Local CI Testing

### Using Docker Compose

To replicate CI environment locally:

```bash
# Start all test services
pnpm infra:start

# Run tests (services will be ready)
pnpm test:integration
pnpm test:e2e

# Stop services
pnpm infra:stop
```

### Using Docker Compose Test Configuration

```bash
# Start test-specific services
docker-compose -f test-infrastructure/docker/docker-compose.test.yml up -d

# Wait for services to be healthy
docker-compose -f test-infrastructure/docker/docker-compose.test.yml ps

# Run tests
pnpm test

# Stop and cleanup
docker-compose -f test-infrastructure/docker/docker-compose.test.yml down -v
```

---

## ⚡ Performance Optimization

### Parallel Execution

Tests are run in parallel across multiple jobs:

```
Lint (10s) ─┐
            ├─► Build (10s) ─┐
Unit (30s) ─┤                ├─► Summary
Integration (2m) ─┤           │
E2E (5m) ─────────┘          │
Coverage (20m) ──────────────┘
```

Total CI time: ~5-6 minutes (parallel) instead of ~35 minutes (sequential)

### Test Execution

- **Unit tests**: Run sequentially within the job (for predictability)
- **Integration tests**: Can run in parallel (isolated)
- **E2E tests**: Run sequentially (share state)

### Caching

The CI uses caching for:

- **pnpm dependencies**: Cached by GitHub Actions
- **Node modules**: Cached between runs
- **Prisma client**: Generated once per run

---

## 🔍 Troubleshooting

### Services Not Ready

If tests fail with connection errors:

1. Check service health checks in workflow logs
2. Increase startup timeouts if needed
3. Verify port mappings are correct

### Flaky Tests

If tests fail intermittently:

1. Check for race conditions
2. Verify test isolation (use `beforeEach`/`afterEach`)
3. Increase timeouts if needed
4. Use proper waits instead of fixed sleeps

### Coverage Drops

If coverage unexpectedly drops:

1. Check what code was added without tests
2. Review coverage report artifacts
3. Use `test:coverage` locally to investigate
4. Check if new files are excluded in coverage config

### Build Failures

If build fails in CI but works locally:

1. Check Node/pnpm versions match
2. Verify all dependencies are in package.json
3. Check for environment-specific code
4. Review build logs for specific errors

---

## 📈 Metrics & Monitoring

### Test Performance

Track these metrics over time:

- Total test execution time
- Per-category test duration
- Slowest tests
- Test failure rate
- Flakiness rate

### Coverage Trends

Monitor coverage trends:

- Overall coverage percentage
- Per-module coverage
- Coverage changes in PRs
- Uncovered lines/branches

### CI Health

Track CI reliability:

- Success rate (target: ≥95%)
- Average build time
- Queue time
- Failure reasons

---

## 🔒 Security

### Secrets Management

Required secrets (set in GitHub repository settings):

```
CODECOV_TOKEN            # For coverage reporting (optional)
DEPLOY_KEY               # For deployment (if applicable)
```

### Service Credentials

Test services use fixed credentials that are:

- ✅ Only used in CI/test environments
- ✅ Never used in production
- ✅ Documented in this file
- ✅ Not sensitive (test data only)

---

## 📚 Additional Resources

### Documentation

- [Vitest Documentation](https://vitest.dev/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Codecov Documentation](https://docs.codecov.com/)

### Related Files

- `TEST_IMPLEMENTATION_PLAN.md` - Overall testing strategy
- `PHASE_5_COMPLETE.md` - Plugin test implementation
- `test-infrastructure/README.md` - Test infrastructure docs

---

## 🆘 Getting Help

If you encounter issues with CI/CD:

1. **Check workflow logs**: GitHub Actions tab → Failed workflow → Job logs
2. **Review this documentation**: Ensure configuration matches
3. **Test locally**: Replicate issue in local environment
4. **Check service status**: Verify all services are healthy
5. **Open an issue**: If problem persists, create a GitHub issue

---

**Last Updated**: January 2025  
**Maintainer**: Plexica Team
