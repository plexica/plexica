# Task Breakdown - [Phase/Milestone Name]

> **Phase**: [Phase Number and Name]  
> **Milestone**: [Milestone Number and Name]  
> **Owner**: [Team/Person Name]  
> **Planned Start**: [DD MMM YYYY]  
> **Planned End**: [DD MMM YYYY]  
> **Status**: [ ] Not Started | [~] In Progress | [✓] Completed

---

## Milestone Objective

[Concise description of the main objective of this milestone - 2-3 sentences]

### Deliverables

- [ ] **Deliverable 1**: Specific description of expected result
- [ ] **Deliverable 2**: Specific description of expected result
- [ ] **Deliverable 3**: Specific description of expected result

### Success Criteria

1. **Criterion 1**: Measurable metric (e.g., "All E2E tests pass")
2. **Criterion 2**: Measurable metric (e.g., "Coverage >= 80%")
3. **Criterion 3**: Measurable metric (e.g., "Deploy to staging completed")

---

## Dependencies

### Previous Milestones

- **[M-X.X Name]**: Must be completed before starting
- **[M-Y.Y Name]**: Specific deliverable required

### External Services/Tools

- **[Service Name]**: Account setup, API keys, configuration
- **[Tool Name]**: Installation, licenses, training

### Known Blockers

| Blocker | Impact | Workaround | Owner | Status |
|---------|--------|------------|-------|--------|
| Problem description | High/Medium/Low | Possible temporary solution | Name | Open/In Progress/Resolved |

---

## Week 1: [DD-DD MMM] - [Week Phase Name]

### Week Objective

[What should be completed by the end of this week]

### Tasks

#### 1.1 [Task Name]

- **Owner**: [Name]
- **Effort**: [Hours/Days]
- **Priority**: [P0-Critical | P1-High | P2-Medium | P3-Low]
- **Status**: [ ] Todo | [~] In Progress | [✓] Done | [x] Blocked

**Description**:  
[Detailed task description - what needs to be done, why, and how]

**Acceptance Criteria**:
- [ ] Measurable criterion 1
- [ ] Measurable criterion 2
- [ ] Measurable criterion 3

**Technical Notes**:
```
- Technical note 1
- Technical note 2
- Link to relevant documentation
```

**Dependencies**:
- Depends on: [Task X.X]
- Blocks: [Task Y.Y]

**Testing**:
- [ ] Unit tests written
- [ ] Integration tests written
- [ ] Manually tested

---

#### 1.2 [Task Name]

- **Owner**: [Name]
- **Effort**: [Hours/Days]
- **Priority**: [P0-Critical | P1-High | P2-Medium | P3-Low]
- **Status**: [ ] Todo | [~] In Progress | [✓] Done | [x] Blocked

**Description**:  
[Detailed task description]

**Acceptance Criteria**:
- [ ] Criterion 1
- [ ] Criterion 2

**Technical Notes**:
```
- Technical note
```

**Dependencies**:
- Depends on: [Task X.X]

**Testing**:
- [ ] Unit tests
- [ ] Integration tests

---

#### 1.3 [Task Name]

[Repeat structure as above]

---

### Week 1 Total

- **Tasks**: X
- **Total Effort**: Y hours/days
- **Status**: [0/X] completed

---

## Week 2: [DD-DD MMM] - [Week Phase Name]

### Week Objective

[Week 2 objective]

### Tasks

#### 2.1 [Task Name]

[Same structure as Week 1]

---

#### 2.2 [Task Name]

[Same structure]

---

### Week 2 Total

- **Tasks**: X
- **Total Effort**: Y hours/days
- **Status**: [0/X] completed

---

## Week 3: [DD-DD MMM] - [Week Phase Name]

[Repeat structure from previous weeks]

---

## Week 4: [DD-DD MMM] - [Week Phase Name]

[Repeat structure from previous weeks]

---

## Testing Strategy

### Unit Testing

**Tool**: Vitest  
**Coverage Target**: >= 80%

**Focus Areas**:
- [ ] Services business logic
- [ ] Utility functions
- [ ] Validators/schemas
- [ ] Formatters/transformers

**Example**:
```typescript
// File: src/services/__tests__/example.service.test.ts

import { describe, it, expect } from 'vitest';
import { ExampleService } from '../example.service';

describe('ExampleService', () => {
  it('should perform expected behavior', () => {
    // Test implementation
  });
});
```

---

### Integration Testing

**Tool**: Vitest + Testcontainers (for DB)  
**Focus Areas**:
- [ ] API endpoints
- [ ] Database operations
- [ ] Service interactions
- [ ] Event handling

**Example**:
```typescript
// File: src/modules/example/__tests__/example.integration.test.ts

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../app';

describe('Example API Integration', () => {
  beforeAll(async () => {
    // Setup test database
  });

  it('POST /api/example creates resource', async () => {
    const response = await request(app)
      .post('/api/example')
      .send({ name: 'Test' })
      .expect(201);
    
    expect(response.body).toHaveProperty('id');
  });
});
```

---

### E2E Testing

**Tool**: Playwright  
**Focus Areas**:
- [ ] Critical user flows
- [ ] Authentication
- [ ] CRUD operations
- [ ] Error handling

**Example**:
```typescript
// File: e2e/example.spec.ts

import { test, expect } from '@playwright/test';

test('user can create and view resource', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[name=email]', 'test@example.com');
  await page.fill('[name=password]', 'password');
  await page.click('button[type=submit]');
  
  await expect(page).toHaveURL('/dashboard');
  // ... rest of test
});
```

---

## Code Review Checklist

### Pre-Review (Developer)

- [ ] Code follows project style guide
- [ ] All tests pass locally
- [ ] Coverage >= 80%
- [ ] No ESLint/TypeScript warnings
- [ ] Documentation updated (README, JSDoc)
- [ ] Descriptive commit messages
- [ ] Branch updated with main/develop

### During Review (Reviewer)

**Code Quality**:
- [ ] Logic is clear and understandable
- [ ] Variable/function names are meaningful
- [ ] No duplicated code
- [ ] Appropriate error handling
- [ ] Appropriate logging

**Architecture**:
- [ ] Respects project architectural patterns
- [ ] Separation of concerns (service/controller/repository)
- [ ] Dependencies injected correctly
- [ ] Well-defined interfaces

**Testing**:
- [ ] Tests cover edge cases
- [ ] Tests are deterministic
- [ ] Appropriate mocks/stubs
- [ ] Tests not too coupled to implementation

**Security**:
- [ ] Input validation present
- [ ] No sensitive data in logs
- [ ] Permissions checked
- [ ] SQL injection prevented (use Prisma)

**Performance**:
- [ ] Optimized database queries
- [ ] No N+1 query problem
- [ ] Appropriate caching
- [ ] Pagination for large lists

---

## Deployment Checklist

### Pre-Deployment

**Code**:
- [ ] Branch merged into main/develop
- [ ] All CI/CD tests passed
- [ ] Code review approved
- [ ] Version bump performed

**Database**:
- [ ] Migration files created
- [ ] Migration tested locally
- [ ] Rollback plan defined
- [ ] Database backup pre-deployment

**Configuration**:
- [ ] Environment variables updated
- [ ] Secrets configured (Vault/Secrets Manager)
- [ ] Feature flags set
- [ ] Rate limits configured

**Documentation**:
- [ ] CHANGELOG.md updated
- [ ] API docs updated (if applicable)
- [ ] README updated
- [ ] Deployment runbook created

---

### Deployment

**Steps**:
1. [ ] Notify team deployment in progress
2. [ ] Deploy to staging environment
3. [ ] Smoke tests on staging
4. [ ] Database migration (if needed)
5. [ ] Deploy to production (rolling/blue-green)
6. [ ] Post-deployment health checks
7. [ ] Monitor logs/metrics for 15min

**Rollback Plan**:
```bash
# In case of critical issues
kubectl rollout undo deployment/[deployment-name]
# or
helm rollback [release-name] [revision]
```

---

### Post-Deployment

**Verification**:
- [ ] Health checks OK
- [ ] Nominal metrics (latency, error rate)
- [ ] No critical errors in logs
- [ ] Production smoke tests passed

**Monitoring** (first 24h):
- [ ] Error rate < 1%
- [ ] P95 latency < XXXms
- [ ] CPU/Memory usage normal
- [ ] No critical alerts

**Communication**:
- [ ] Notify team deployment completed
- [ ] Update status page (if breaking changes)
- [ ] Notify customers (if major feature)

---

## Risks & Mitigation

| Risk | Probability | Impact | Mitigation | Owner |
|------|-------------|--------|------------|-------|
| Delay on critical task X | Medium | High | Assign backup developer | [Name] |
| Blocking bug on dependency Y | Low | High | Develop temporary workaround | [Name] |
| External service Z unavailable | Low | Medium | Implement fallback/cache | [Name] |
| Performance issue on query | Medium | Medium | Pre-optimize queries, add indexes | [Name] |

---

## Notes & Learnings

### Technical Decisions

**[DD MMM]**: Decision on [topic]
- **Context**: [Why decision was needed]
- **Decision**: [What was decided]
- **Rationale**: [Technical reasoning]
- **Alternatives Considered**: [Other options evaluated]

---

### Challenges Encountered

**[DD MMM]**: [Challenge Name]
- **Problem**: Problem description
- **Impact**: Impact on timeline/quality
- **Solution**: How it was resolved
- **Lesson Learned**: What was learned for the future

---

### Improvements Identified

- [ ] **Improvement 1**: Description and expected benefit
- [ ] **Improvement 2**: Description and expected benefit
- [ ] **Improvement 3**: Description and expected benefit

---

## References

### Documentation

- [Link to functional spec](../../specs/FUNCTIONAL_SPECIFICATIONS.md#section)
- [Link to technical spec](../../specs/TECHNICAL_SPECIFICATIONS.md#section)
- [Relevant ADR](../../planning/DECISIONS.md#adr-xxx)

### External Resources

- [Tool/Library docs](https://example.com)
- [Tutorial/Guide](https://example.com)
- [Stack Overflow discussion](https://stackoverflow.com/...)

---

## Summary

### Milestone Total

- **Total Tasks**: XX
- **Total Effort**: YY hours/days
- **Duration**: Z weeks
- **Team Size**: N people

### Progress Tracking

| Week | Tasks Planned | Tasks Completed | % Complete | Status |
|------|---------------|-----------------|------------|--------|
| Week 1 | 5 | 0 | 0% | Not Started |
| Week 2 | 6 | 0 | 0% | Not Started |
| Week 3 | 7 | 0 | 0% | Not Started |
| Week 4 | 4 | 0 | 0% | Not Started |
| **Total** | **22** | **0** | **0%** | **Not Started** |

---

*Task Breakdown [Milestone Name] v1.0*  
*Created: [DD MMM YYYY]*  
*Last updated: [DD MMM YYYY]*  
*Owner: [Team/Person]*
