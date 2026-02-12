# Test Coverage Improvement Plan

**Version**: 1.0  
**Date**: February 11, 2026  
**Current Status**: 63% coverage  
**Target**: 80% coverage  
**Gap**: 17 percentage points

---

## 📊 Current Coverage Situation

### Overall Metrics (apps/core-api)

| Metric         | Current | Target | Gap  | Priority |
| -------------- | ------- | ------ | ---- | -------- |
| **Lines**      | 63.16%  | 80%    | +17% | 🔴 HIGH  |
| **Statements** | 63.09%  | 80%    | +17% | 🔴 HIGH  |
| **Functions**  | 64.11%  | 80%    | +16% | 🔴 HIGH  |
| **Branches**   | 56.93%  | 75%    | +18% | 🔴 HIGH  |

### Module-Level Coverage

| Module         | Current | Target | Gap  | Status         | Tests  |
| -------------- | ------- | ------ | ---- | -------------- | ------ |
| **Auth**       | ~75%    | 85%    | +10% | 🟡 Close       | 10     |
| **Tenant**     | ~70%    | 85%    | +15% | 🟡 In Progress | 10     |
| **Workspace**  | ~65%    | 85%    | +20% | 🟡 In Progress | 11     |
| **Plugin**     | 87.65%  | 90%    | +2%  | ✅ Good        | 13     |
| **Services**   | ~50%    | 80%    | +30% | 🔴 Needs Work  | 4      |
| **Middleware** | ~60%    | 90%    | +30% | 🔴 Needs Work  | varies |
| **Utilities**  | ~40%    | 70%    | +30% | 🔴 Needs Work  | varies |

---

## 🎯 Coverage Improvement Strategy

### Two-Phase Approach

**Phase 1: Quick Wins (63% → 70%)**

- Effort: 20-30 hours
- Timeline: 2-3 weeks
- Focus: Low-hanging fruit, high-impact areas

**Phase 2: Coverage Expansion (70% → 80%)**

- Effort: 15-20 hours
- Timeline: 2-3 weeks
- Focus: Branch coverage, edge cases, complex scenarios

---

## 📋 Phase 1: Quick Wins (63% → 70%)

### Goals for Phase 1

1. ✅ Identify modules with 0% coverage
2. ✅ Add basic unit tests for uncovered modules
3. ✅ Complete test service layer methods
4. ✅ Test API endpoint error paths
5. ✅ Reach overall coverage: **70%**

### Action Items by Module

#### Auth Module (75% → 78%)

**Current Gap**: Incomplete error path coverage

```typescript
// Missing test scenarios:
- [ ] JWT token expiration handling
- [ ] Refresh token rotation edge cases
- [ ] Permission caching behavior
- [ ] Cross-tenant security boundaries
- [ ] Keycloak connection failures
- [ ] Rate limiting on login attempts
- [ ] Session timeout scenarios
```

**Estimated Impact**: +3% coverage (1-2 new test files)

#### Tenant Module (70% → 75%)

**Current Gap**: Concurrent operations, edge cases

```typescript
// Missing test scenarios:
- [ ] Concurrent tenant creation (race conditions)
- [ ] Schema migration edge cases
- [ ] Cascade deletion of child resources
- [ ] Provisioning rollback scenarios
- [ ] Keycloak realm cleanup failures
- [ ] Schema naming conflicts
- [ ] Partial provisioning recovery
```

**Estimated Impact**: +5% coverage (2-3 new test files)

#### Workspace Module (65% → 70%)

**Current Gap**: Complex permission scenarios

```typescript
// Missing test scenarios:
- [ ] Last admin protection edge cases
- [ ] Concurrent member operations
- [ ] Team deletion cascades
- [ ] Workspace member pagination
- [ ] Role update race conditions
- [ ] Member removal with team dependencies
- [ ] Workspace archival workflow
```

**Estimated Impact**: +5% coverage (2-3 new test files)

#### Services Layer (50% → 65%)

**Current Gap**: Many services have no basic tests

```typescript
// Missing:
- [ ] Basic unit tests for all public services
- [ ] Service initialization tests
- [ ] Service dependency injection
- [ ] Service error handling
- [ ] Cache invalidation scenarios
- [ ] Transaction handling
```

**Estimated Impact**: +15% coverage (8-10 new test files)

#### Middleware (60% → 70%)

**Current Gap**: Incomplete middleware chain testing

```typescript
// Missing:
- [ ] Middleware execution order
- [ ] Error propagation through chain
- [ ] Tenant context edge cases
- [ ] Authentication bypass scenarios
- [ ] Request/response modification
```

**Estimated Impact**: +10% coverage (2-3 new test files)

#### Utilities & Helpers (40% → 55%)

**Current Gap**: Helper functions untested

```typescript
// Missing:
- [ ] All validator edge cases
- [ ] Formatter function variations
- [ ] Date utility functions
- [ ] String manipulation edge cases
- [ ] Error constructors
- [ ] Helper function error paths
```

**Estimated Impact**: +15% coverage (5-7 new test files)

---

## 📈 Phase 2: Coverage Expansion (70% → 80%)

### Goals for Phase 2

1. ✅ Improve branch coverage (57% → 70%)
2. ✅ Test all edge cases and boundary conditions
3. ✅ Complete integration test coverage
4. ✅ Add concurrent operation tests
5. ✅ Reach overall coverage: **80%**

### Action Items by Category

#### Branch Coverage Expansion

```typescript
// Focus areas:
- [ ] If/else branches in business logic
- [ ] Switch/case statement coverage
- [ ] Ternary operator conditions
- [ ] Error handling paths
- [ ] Null coalescing edge cases
- [ ] Conditional resource cleanup
- [ ] Feature flag branches
```

**Target**: 57% → 70% branches

#### Edge Case Testing

```typescript
// Common edge cases to test:
- [ ] Empty arrays/objects
- [ ] Null/undefined values
- [ ] Boundary values (min/max)
- [ ] Special characters in strings
- [ ] Very large numbers
- [ ] Concurrent identical requests
- [ ] Resource exhaustion scenarios
- [ ] Timezone edge cases
- [ ] Localization variants
```

**Target**: +5-8% overall coverage

#### Integration Test Expansion

```typescript
// Focus areas:
- [ ] Multi-step API workflows
- [ ] Transaction boundary tests
- [ ] Rollback/compensation scenarios
- [ ] Cross-module dependencies
- [ ] Event triggering chains
- [ ] Async operation sequencing
```

**Target**: +3-5% coverage

#### Module-Specific Targets

**Auth Module (78% → 85%)**

- [ ] All auth flow paths
- [ ] Permission matrix complete
- [ ] Cross-tenant isolation verified
- [ ] Token lifecycle complete

**Tenant Module (75% → 85%)**

- [ ] All state transitions
- [ ] All failure scenarios
- [ ] Concurrent operations
- [ ] Full lifecycle coverage

**Workspace Module (70% → 85%)**

- [ ] Permission matrix complete
- [ ] All member operations
- [ ] Team functionality complete
- [ ] Concurrent operations safe

**Services (65% → 80%)**

- [ ] All public methods tested
- [ ] All error paths covered
- [ ] Cache behavior verified
- [ ] Transaction handling complete

---

## 🔍 Coverage Gap Identification Process

### Step 1: Generate Coverage Report

```bash
cd apps/core-api
pnpm test:coverage

# Review the HTML report
open coverage/index.html
```

### Step 2: Identify Gaps by Percentage

```bash
# Find files with coverage < 50%
grep -r "[0-4][0-9]\.[0-9][0-9]%" coverage/

# Find files with 0% coverage
grep "0\.00%" coverage/
```

### Step 3: Analyze Uncovered Lines

In `coverage/index.html`:

1. Click on files with low coverage
2. Red lines = not covered
3. Yellow lines = partially covered (branch not taken)
4. Green lines = covered

### Step 4: Prioritize by Impact

1. **High Impact**: Business-critical functions
   - Authentication
   - Multi-tenant isolation
   - Data validation
   - Permission checks

2. **Medium Impact**: Important features
   - API endpoints
   - Service methods
   - Database operations
   - Cache operations

3. **Low Impact**: Utilities
   - String formatting
   - Date manipulation
   - Type conversions
   - Logging

---

## 📝 Weekly Progress Tracking

### Week 1: Foundation & Analysis

**Target Coverage**: 63% → 65%

```markdown
- [ ] Run full coverage report
- [ ] Identify top 10 coverage gaps
- [ ] Create test files for gaps
- [ ] Write 15-20 new tests
- [ ] Update documentation

**Expected Progress**: +2% coverage
```

### Week 2: Module Focus - Auth & Tenant

**Target Coverage**: 65% → 68%

```markdown
- [ ] Auth module tests (75% → 80%)
- [ ] Tenant module tests (70% → 75%)
- [ ] Service layer basics (50% → 60%)
- [ ] Write 20-25 new tests

**Expected Progress**: +3% coverage
```

### Week 3: Module Focus - Workspace & Services

**Target Coverage**: 68% → 70%

```markdown
- [ ] Workspace module tests (65% → 75%)
- [ ] Services completion (60% → 70%)
- [ ] Middleware coverage (60% → 70%)
- [ ] Write 20-25 new tests

**Expected Progress**: +2% coverage
```

### Week 4: Phase 2 - Branch Coverage & Edge Cases

**Target Coverage**: 70% → 75%

```markdown
- [ ] Focus on branch coverage
- [ ] Add edge case tests
- [ ] Complete integration tests
- [ ] Write 15-20 new tests
- [ ] Fix flaky tests

**Expected Progress**: +5% coverage
```

### Week 5: Phase 2 - Final Push

**Target Coverage**: 75% → 78%

```markdown
- [ ] Complete remaining modules
- [ ] Add concurrent operation tests
- [ ] Final edge case coverage
- [ ] Write 10-15 new tests
- [ ] Review all new tests

**Expected Progress**: +3% coverage
```

### Week 6: Phase 2 - Completion

**Target Coverage**: 78% → 80%

```markdown
- [ ] Reach 80% overall coverage
- [ ] All modules above targets
- [ ] All tests passing
- [ ] Documentation updated
- [ ] Coverage stable

**Expected Progress**: +2% coverage
```

---

## 🎯 Success Criteria

### Coverage Targets (MUST MEET)

- ✅ Overall lines: ≥80%
- ✅ Overall functions: ≥80%
- ✅ Overall statements: ≥80%
- ✅ Overall branches: ≥75%

### Module Targets (SHOULD MEET)

- ✅ Auth: ≥85%
- ✅ Tenant: ≥85%
- ✅ Workspace: ≥85%
- ✅ Plugin: ≥90% (already at 87.65%)
- ✅ Services: ≥80%
- ✅ Middleware: ≥90%
- ✅ Utilities: ≥70%

### Quality Targets (MUST MEET)

- ✅ No modules at 0% coverage
- ✅ All public functions have at least 1 test
- ✅ All error paths tested
- ✅ Test pass rate: 100%
- ✅ CI pipeline green
- ✅ No flaky tests
- ✅ All new tests follow AAA pattern

---

## 🛠️ Tools & Commands

### Coverage Analysis

```bash
# Full coverage report with statistics
cd apps/core-api
pnpm test:coverage

# HTML coverage report (visual)
pnpm test:coverage
open coverage/index.html

# Coverage for specific module
pnpm test:coverage -- --include=src/modules/auth/**

# Watch mode with coverage
pnpm test:coverage --watch

# Coverage threshold enforcement
pnpm test:coverage -- --coverage.lines=80
```

### Test Execution

```bash
# Run specific test file
pnpm test path/to/test.ts

# Run tests matching pattern
pnpm test --grep "should create tenant"

# Debug specific test
node --inspect-brk node_modules/.bin/vitest --run path/to/test.ts

# Verbose output
pnpm test --reporter=verbose
```

### CI Integration

```bash
# CI coverage check (fails if <80%)
pnpm test:coverage -- --coverage.lines=80 --coverage.functions=80

# Generate coverage badge data
# (integrate with Codecov)
```

---

## 📚 References & Resources

### Testing Documentation

- **Main Guide**: [`docs/TESTING.md`](../docs/TESTING.md)
- **Backend Testing**: [`docs/testing/BACKEND_TESTING.md`](../docs/testing/BACKEND_TESTING.md)
- **Test Structure**: [`apps/core-api/src/__tests__/README.md`](../apps/core-api/src/__tests__/README.md)

### Vitest & Testing Tools

- **Vitest Coverage**: https://vitest.dev/guide/coverage.html
- **Coverage Interpretation**: https://martinfowler.com/bliki/TestCoverage.html
- **Testing Best Practices**: https://github.com/goldbergyoni/javascript-testing-best-practices

### Code Examples

```typescript
// Unit Test Pattern (from existing tests)
describe('ServiceName.method', () => {
  it('should [expected behavior] when [condition]', async () => {
    // Arrange
    const input = {
      /* test data */
    };

    // Act
    const result = await service.method(input);

    // Assert
    expect(result).toBe(expectedValue);
  });
});

// Integration Test Pattern (from existing tests)
describe('POST /api/endpoint', () => {
  it('should return 201 with created resource', async () => {
    const response = await request(app).post('/api/endpoint').send(testData).expect(201);
    expect(response.body).toMatchObject(expected);
  });
});

// Error Path Test Pattern
describe('Error Handling', () => {
  it('should throw error for invalid input', async () => {
    await expect(service.method(invalidData)).rejects.toThrow('Expected error message');
  });
});
```

---

## 🔄 Iteration & Review

### Monthly Review (After Phase 2 Completion)

- ✅ Analyze coverage trends
- ✅ Identify emerging gaps from new code
- ✅ Update targets if needed
- ✅ Document lessons learned
- ✅ Celebrate milestone achievement 🎉

### Ongoing Maintenance

- ✅ Keep coverage ≥80% on all new code
- ✅ Add tests before adding features (TDD)
- ✅ Review coverage in PR checks
- ✅ Block merges if coverage drops below 80%
- ✅ Monthly coverage audit

### Quarterly Assessment

- ✅ Review test quality metrics
- ✅ Identify flaky tests
- ✅ Plan optimization improvements
- ✅ Update this plan if needed

---

## 📌 Important Notes

### Coverage vs. Quality

> Coverage is a tool, not a goal. 80% coverage doesn't guarantee good tests.
> Focus on:
>
> - Testing critical business logic
> - Testing error paths
> - Testing integration points
> - Testing edge cases

### Avoid Coverage Pitfalls

❌ **Don't**:

- Write tests just to increase coverage
- Test trivial getters/setters
- Mock everything (lose value of integration tests)
- Have tests that don't fail when code breaks

✅ **Do**:

- Write tests that verify behavior
- Test public APIs and business logic
- Mock only external dependencies
- Keep tests focused and independent

### Test Maintenance

- Review and refactor tests regularly
- Remove duplicate or redundant tests
- Keep test code as clean as production code
- Update tests when behavior changes
- Document complex test scenarios

---

## 🚀 Getting Started

### Immediate Actions

1. **Generate baseline coverage**

   ```bash
   cd apps/core-api
   pnpm test:coverage
   ```

2. **Identify top gaps**
   - Open `coverage/index.html`
   - Sort by lowest coverage
   - Note top 10 files needing work

3. **Create test plan**
   - List files to improve
   - Estimate tests needed
   - Assign priorities

4. **Start Phase 1**
   - Pick one module (recommend: Services)
   - Add 5-10 basic unit tests
   - Verify coverage increases
   - Iterate to next module

### Weekly Rhythm

```
Monday: Plan week (identify gaps, estimate effort)
Tue-Thu: Write tests (2-3 new tests per day)
Friday: Review progress (update this plan, celebrate wins)
```

---

## ✅ Final Checklist

Before considering Phase 2 complete:

### Coverage Verification

- [ ] Overall lines: ≥80% ✅
- [ ] Overall functions: ≥80% ✅
- [ ] Overall statements: ≥80% ✅
- [ ] Overall branches: ≥75% ✅

### Module Verification

- [ ] Auth: ≥85% ✅
- [ ] Tenant: ≥85% ✅
- [ ] Workspace: ≥85% ✅
- [ ] Plugin: ≥90% ✅
- [ ] Services: ≥80% ✅

### Quality Verification

- [ ] All tests pass ✅
- [ ] No flaky tests ✅
- [ ] No 0% coverage modules ✅
- [ ] CI pipeline green ✅

### Documentation Verification

- [ ] This plan updated ✅
- [ ] Test README updated ✅
- [ ] Coverage reasons documented ✅
- [ ] Team informed of changes ✅

---

**Document Owner**: Engineering Team  
**Review Frequency**: Weekly during improvement phase, Monthly after reaching 80%  
**Next Update**: February 18, 2026  
**Status**: 🟡 In Progress (Phase 1)
