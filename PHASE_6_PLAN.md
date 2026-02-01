# Phase 6: CI/CD Setup - Implementation Plan

## 📋 Overview

**Objective**: Configure comprehensive CI/CD pipeline for automated testing  
**Duration**: 1-2 days  
**Status**: 🔄 IN PROGRESS

---

## 🎯 Goals

1. ✅ **Automated Test Execution**: Run all tests (unit, integration, E2E) in CI
2. ✅ **Coverage Reporting**: Generate and track code coverage metrics
3. ✅ **Test Parallelization**: Speed up test execution with parallel jobs
4. ✅ **Test Infrastructure**: Set up required services (Postgres, Keycloak, Redis, MinIO)
5. ✅ **Quality Gates**: Enforce minimum coverage and test passing requirements
6. ✅ **Performance Monitoring**: Track test execution times

---

## 📊 Current State Analysis

### Existing CI Workflow (`.github/workflows/ci.yml`)

**What We Have**:

- ✅ Basic lint job
- ✅ Basic test job with Postgres + Redis
- ✅ Build job with artifact upload
- ✅ Node.js 20 + pnpm 10 setup

**What's Missing**:

- ❌ Keycloak service (required for auth tests)
- ❌ MinIO service (required for storage tests)
- ❌ Test categories (unit/integration/E2E separation)
- ❌ Code coverage reporting
- ❌ Test parallelization
- ❌ Coverage thresholds enforcement
- ❌ Test result aggregation
- ❌ Performance monitoring

---

## 🗂️ Task Breakdown

### Task 6.1: Enhance Test Infrastructure ⏳

**Estimated Time**: 2-3 hours

**Objective**: Add missing services and improve test setup

**Subtasks**:

1. Add Keycloak service container to CI
2. Add MinIO service container to CI
3. Configure service health checks
4. Set up service networking
5. Configure environment variables for all services
6. Add Docker Compose alternative for local CI testing

**Files to Create/Modify**:

- `.github/workflows/ci.yml` (enhance)
- `.github/workflows/test-e2e.yml` (new - E2E specific)
- `docker-compose.ci.yml` (new - for local CI testing)

---

### Task 6.2: Implement Test Categorization ⏳

**Estimated Time**: 2-3 hours

**Objective**: Separate test execution by category with parallelization

**Subtasks**:

1. Create separate CI jobs for unit/integration/E2E tests
2. Configure Vitest for test categorization
3. Set up test path patterns for each category
4. Implement parallel test execution
5. Add job dependencies and ordering
6. Configure test timeouts per category

**Test Categories**:

```yaml
- Unit Tests: Fast, no external deps    (~30s target)
- Integration Tests: With DB/Redis             (~2min target)
- E2E Tests: Full stack with Keycloak  (~5min target)
```

**Files to Create/Modify**:

- `.github/workflows/tests-unit.yml` (new)
- `.github/workflows/tests-integration.yml` (new)
- `.github/workflows/tests-e2e.yml` (new)
- `vitest.config.unit.ts` (new)
- `vitest.config.integration.ts` (new)
- `vitest.config.e2e.ts` (new)

---

### Task 6.3: Add Code Coverage Reporting ⏳

**Estimated Time**: 2-3 hours

**Objective**: Generate, track, and enforce code coverage metrics

**Subtasks**:

1. Configure Vitest coverage with c8/istanbul
2. Set up coverage thresholds per module
3. Integrate with Codecov or similar service
4. Add coverage badges to README
5. Generate HTML coverage reports
6. Upload coverage artifacts
7. Add coverage comparison for PRs

**Coverage Targets**:

```yaml
Auth: ≥85% overall
Tenant: ≥85% overall
Workspace: ≥85% overall
Plugin: ≥80% overall
Overall: ≥80% overall
```

**Files to Create/Modify**:

- `vitest.config.ts` (add coverage config)
- `.github/workflows/coverage.yml` (new)
- `.codecov.yml` (new)
- `README.md` (add badges)

---

### Task 6.4: Implement Quality Gates ⏳

**Estimated Time**: 1-2 hours

**Objective**: Enforce quality standards and prevent regressions

**Subtasks**:

1. Add required check for all test jobs
2. Enforce minimum coverage thresholds
3. Add test flakiness detection
4. Configure PR status checks
5. Add automatic labeling based on tests
6. Set up branch protection rules

**Quality Gates**:

```yaml
- All tests must pass
- Coverage must meet thresholds
- No test flakiness detected
- Build must succeed
- Linting must pass
```

**Files to Create/Modify**:

- `.github/workflows/quality-gate.yml` (new)
- `.github/branch-protection-rules.yml` (new)

---

### Task 6.5: Add Performance Monitoring ⏳

**Estimated Time**: 1-2 hours

**Objective**: Track and optimize test execution times

**Subtasks**:

1. Add test timing reports
2. Track historical test performance
3. Set up performance regression detection
4. Add test execution time budgets
5. Generate performance comparison reports

**Metrics to Track**:

```yaml
- Total test execution time
- Per-module test duration
- Slowest tests identification
- Parallelization effectiveness
- Resource usage (CPU, memory)
```

**Files to Create/Modify**:

- `.github/workflows/performance.yml` (new)
- `scripts/analyze-test-performance.ts` (new)

---

### Task 6.6: Documentation & Scripts ⏳

**Estimated Time**: 1 hour

**Objective**: Document CI/CD setup and provide helper scripts

**Subtasks**:

1. Document CI/CD architecture
2. Create local CI testing scripts
3. Add troubleshooting guide
4. Document environment variables
5. Create CI debugging tools

**Files to Create**:

- `.github/docs/CI_CD_ARCHITECTURE.md` (new)
- `.github/docs/CI_TROUBLESHOOTING.md` (new)
- `scripts/ci-local.sh` (new - run CI locally)
- `scripts/ci-debug.sh` (new - debug CI issues)

---

## 🏗️ Proposed CI/CD Architecture

### GitHub Actions Workflow Structure

```
.github/workflows/
├── ci.yml                      # Main CI workflow (orchestrator)
├── tests-unit.yml              # Unit tests (fast, no external deps)
├── tests-integration.yml       # Integration tests (with services)
├── tests-e2e.yml               # E2E tests (full stack)
├── coverage.yml                # Coverage collection and reporting
├── quality-gate.yml            # Quality checks and enforcement
├── performance.yml             # Performance monitoring
└── deploy.yml                  # Deployment (existing)
```

### Job Execution Flow

```
┌─────────────────────────────────────────────────────────┐
│                      Main CI Workflow                   │
└─────────────────┬───────────────────────────────────────┘
                  │
        ┌─────────┴─────────┐
        │                   │
        ▼                   ▼
   ┌────────┐          ┌────────┐
   │  Lint  │          │  Build │
   └────┬───┘          └────┬───┘
        │                   │
        └─────────┬─────────┘
                  │
      ┌───────────┼───────────┐
      │           │           │
      ▼           ▼           ▼
┌──────────┐ ┌─────────────┐ ┌──────────┐
│   Unit   │ │ Integration │ │   E2E    │
│  Tests   │ │    Tests    │ │  Tests   │
│ (Parallel)│ │  (Parallel) │ │(Sequential)│
└─────┬────┘ └──────┬──────┘ └─────┬────┘
      │             │              │
      └─────────────┼──────────────┘
                    │
                    ▼
            ┌───────────────┐
            │   Coverage    │
            │   Reporting   │
            └───────┬───────┘
                    │
                    ▼
            ┌───────────────┐
            │ Quality Gate  │
            │   Check       │
            └───────────────┘
```

### Service Configuration

```yaml
Services Required:
  - PostgreSQL 15 (always)
  - Redis 7 (always)
  - Keycloak 23 (integration + E2E)
  - MinIO (integration + E2E)

Resource Allocation:
  - Unit Tests: Basic resources
  - Integration Tests: Medium resources
  - E2E Tests: High resources
```

---

## 📝 Implementation Checklist

### Phase 6.1: Enhanced Infrastructure

- [ ] Add Keycloak service to CI
- [ ] Add MinIO service to CI
- [ ] Configure health checks
- [ ] Set up networking
- [ ] Test service connectivity

### Phase 6.2: Test Categorization

- [ ] Create unit test workflow
- [ ] Create integration test workflow
- [ ] Create E2E test workflow
- [ ] Configure Vitest configs per category
- [ ] Test parallel execution

### Phase 6.3: Coverage Reporting

- [ ] Configure Vitest coverage
- [ ] Set up Codecov integration
- [ ] Add coverage thresholds
- [ ] Generate HTML reports
- [ ] Add badges to README

### Phase 6.4: Quality Gates

- [ ] Add required checks
- [ ] Configure branch protection
- [ ] Set up PR checks
- [ ] Add auto-labeling
- [ ] Test quality enforcement

### Phase 6.5: Performance Monitoring

- [ ] Add timing reports
- [ ] Track historical data
- [ ] Set performance budgets
- [ ] Create comparison reports
- [ ] Add regression detection

### Phase 6.6: Documentation

- [ ] Write CI/CD architecture doc
- [ ] Create troubleshooting guide
- [ ] Document environment variables
- [ ] Create local testing scripts
- [ ] Add debugging tools

---

## 🎯 Success Criteria

### Functional Requirements

- ✅ All tests run automatically on push/PR
- ✅ Test results reported in < 10 minutes total
- ✅ Coverage reports generated and tracked
- ✅ Quality gates enforced
- ✅ PRs cannot merge if tests fail

### Performance Requirements

- ✅ Unit tests complete in < 30s
- ✅ Integration tests complete in < 2 min
- ✅ E2E tests complete in < 5 min
- ✅ Total CI pipeline < 10 min (parallel)

### Quality Requirements

- ✅ Test flakiness < 1%
- ✅ CI success rate ≥ 95%
- ✅ Coverage thresholds enforced
- ✅ No false positives

---

## 🔧 Environment Variables Required

```bash
# Database
DATABASE_URL=postgresql://plexica:plexica_password@localhost:5432/plexica?schema=core

# Keycloak
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=plexica
KEYCLOAK_CLIENT_ID=plexica-api
KEYCLOAK_CLIENT_SECRET=<secret>
KEYCLOAK_ADMIN_USER=admin
KEYCLOAK_ADMIN_PASSWORD=admin

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# MinIO
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=plexica

# Test Configuration
TEST_TIMEOUT=30000
E2E_TIMEOUT=60000
CI=true
NODE_ENV=test
```

---

## 📊 Expected Outcomes

### Metrics

- **Test Files**: 45+ files
- **Total Tests**: ~870+ tests
- **Coverage**: ≥80% overall
- **CI Duration**: <10 minutes
- **Success Rate**: ≥95%

### Artifacts

- Coverage reports (HTML + JSON)
- Test results (JUnit XML)
- Performance metrics (JSON)
- Build artifacts (dist folders)

### Alerts & Notifications

- Test failures
- Coverage drops
- Performance regressions
- Flaky test detection

---

## 🚀 Next Steps

1. **Start with Task 6.1**: Enhance test infrastructure
2. **Verify services**: Test Keycloak + MinIO setup locally
3. **Implement categorization**: Separate test workflows
4. **Add coverage**: Integrate reporting
5. **Enforce gates**: Set up quality checks
6. **Monitor performance**: Track metrics

---

**Phase 6 Status**: 🔄 READY TO START  
**Estimated Duration**: 1-2 days (8-16 hours)  
**Priority**: HIGH - Critical for automation
