# Decision Log

> This document tracks architectural decisions, technical debt, deferred
> decisions, and implementation notes that don't warrant a full ADR.

**Last Updated**: February 19, 2026

> **Archive Notice**: Completed decisions from February 2026 have been moved to
> [archives/2026-02/decisions-2026-02.md](./archives/2026-02/decisions-2026-02.md).
> Historical decisions from 2025 and earlier: [archives/decision-log-2025.md](./archives/decision-log-2025.md)

---

## Active Decisions

### Technical Debt

| ID     | Description                                               | Impact  | Severity | Tracked In           | Target Sprint |
| ------ | --------------------------------------------------------- | ------- | -------- | -------------------- | ------------- |
| TD-001 | Test coverage at 76.5%, target 80%                        | Quality | MEDIUM   | CI report 2026-02-18 | Next Sprint   |
| TD-002 | Core modules (auth, tenant, workspace) need 85% coverage  | Quality | HIGH     | `AGENTS.md`          | Q1 2026       |
| TD-003 | keycloak.service.ts at 2.83% coverage                     | Quality | HIGH     | CI report 2026-02-18 | Next Sprint   |
| TD-004 | 24 integration tests deferred (oauth-flow + ws-resources) | Quality | MEDIUM   | CI report 2026-02-18 | Sprint 5      |
| TD-005 | 3 flaky E2E tests in tenant-concurrent need investigation | Quality | LOW      | CI report 2026-02-19 | Sprint 5      |
| TD-006 | 40 deprecated E2E tests (ROPC flow) need removal          | Quality | LOW      | CI report 2026-02-18 | Sprint 5      |

### Deferred Decisions

| ID     | Decision                             | Reason Deferred                          | Revisit Date | Context               |
| ------ | ------------------------------------ | ---------------------------------------- | ------------ | --------------------- |
| DD-001 | GraphQL API layer                    | Focus on REST first; evaluate after v1.0 | Q2 2026      | Plugin API evolution  |
| DD-002 | Real-time collaboration (WebSockets) | Core platform stability priority         | Q2 2026      | Future plugin feature |

---

## Decisions Requiring Attention

### workspace-resources.integration.test.ts Architecture Mismatch - NEEDS REWRITE (February 17, 2026)

**Date**: February 17, 2026  
**Context**: Investigating 35 integration test failures (JWT 401 errors)

**Status**: DEFERRED — tracked as TD-004

**Finding**: `workspace-resources.integration.test.ts` has fundamental architecture mismatch

**Problems**:

1. Creates standalone Fastify app instead of using `buildTestApp()` helper
2. Manually creates schemas/tables with raw SQL instead of using Prisma
3. Bypasses tenant/workspace services that routes expect
4. Routes use Prisma-based services which expect different table structures

**Correct Pattern** (from `workspace-crud.integration.test.ts` and `workspace-members.integration.test.ts`):

- Use `buildTestApp()` to get fully configured app
- Use `testContext.auth.createMockToken()` for JWT generation
- Create tenants via `/api/admin/tenants` endpoint (proper provisioning)
- Let services handle database operations

**Decision**: Mark this test file for complete rewrite in Sprint 5

---

### Spec 010 Created: Frontend Production Readiness (February 17, 2026)

**Date**: February 17, 2026  
**Context**: Frontend brownfield analysis revealed critical gaps blocking production deployment

**Status**: ✅ spec done — implementation **IN PROGRESS** (Sprint 4)

**Critical Gaps Identified**:

1. **No Error Boundaries**: Plugin crashes cascade to full shell crash (violates FR-005, NFR-008)
2. **Incomplete Tenant Theming**: No API for tenant logo/colors/fonts (violates FR-009, FR-010)
3. **Widget System Not Implemented**: Plugins cannot expose reusable UI components (violates FR-011)

**Specification**: `.forge/specs/010-frontend-production-readiness/`

**Phase Breakdown**:

- **Phase 1: Error Boundaries** (8 pts, 17h, Sprint 4 Week 1)
- **Phase 2: Tenant Theming** (13 pts, 28h, Sprint 4 Week 2-3)
- **Phase 3: Widget System** (10 pts, 20h, Sprint 4 Week 4)
- **Phase 4: Test Coverage** (21 pts, 45h, Sprint 5 Week 1-2)
- **Phase 5: Accessibility** (8 pts, 16h, Sprint 5 Week 3)

**Sprint Planning**: Sprint 4 (4 weeks) + Sprint 5 (3 weeks) = 7 weeks total

---

## Questions & Clarifications

<!-- Use this section to track open questions that need resolution -->

No open questions currently.

---

_This document is living and should be updated as decisions are made or
deferred. For significant architectural decisions, create a full ADR using
`/forge-adr`._

_Archives:_

- _February 2026: [archives/2026-02/decisions-2026-02.md](./archives/2026-02/decisions-2026-02.md)_
- _2025 and earlier: [archives/decision-log-2025.md](./archives/decision-log-2025.md)_
