# Decision Log

> This document tracks architectural decisions, technical debt, deferred
> decisions, and implementation notes that don't warrant a full ADR.

**Last Updated**: February 26, 2026

> **Archive Notice**: Completed decisions from February 2026 have been moved to
> [archives/2026-02/decisions-2026-02.md](./archives/2026-02/decisions-2026-02.md).
> Historical decisions from 2025 and earlier: [archives/decision-log-2025.md](./archives/decision-log-2025.md)

---

## Active Decisions

### Technical Debt

| ID         | Description                                                                                                                                                            | Impact   | Severity | Tracked In                     | Target Sprint                                                |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------- | ------------------------------ | ------------------------------------------------------------ |
| TD-001     | Test coverage at 76.5%, target 80%                                                                                                                                     | Quality  | MEDIUM   | CI report 2026-02-18           | Next Sprint                                                  |
| TD-002     | Core modules (auth, tenant, workspace) need 85% coverage                                                                                                               | Quality  | HIGH     | `AGENTS.md`                    | Q1 2026                                                      |
| ~~TD-003~~ | ~~keycloak.service.ts at 2.83% coverage~~                                                                                                                              | Quality  | ~~HIGH~~ | ~~CI report 2026-02-18~~       | ✅ **CLOSED 2026-02-23** — 96.1% unit + 19 integration tests |
| TD-004     | 24 integration tests deferred (oauth-flow + ws-resources)                                                                                                              | Quality  | MEDIUM   | CI report 2026-02-18           | Sprint 5                                                     |
| TD-005     | 3 flaky E2E tests in tenant-concurrent need investigation                                                                                                              | Quality  | LOW      | CI report 2026-02-19           | Sprint 5                                                     |
| TD-006     | 40 deprecated E2E tests (ROPC flow) need removal                                                                                                                       | Quality  | LOW      | CI report 2026-02-18           | Sprint 5                                                     |
| TD-007     | CSP `frame-ancestors` not set — meta tag approach in T005-15 cannot cover frame-ancestors directive; production deployment requires HTTP response headers for full CSP | Security | MEDIUM   | ISSUE-008 from Spec 005 review | Sprint 7                                                     |

### Deferred Decisions

| ID     | Decision                             | Reason Deferred                          | Revisit Date | Context               |
| ------ | ------------------------------------ | ---------------------------------------- | ------------ | --------------------- |
| DD-001 | GraphQL API layer                    | Focus on REST first; evaluate after v1.0 | Q2 2026      | Plugin API evolution  |
| DD-002 | Real-time collaboration (WebSockets) | Core platform stability priority         | Q2 2026      | Future plugin feature |

---

## Decisions Requiring Attention

### ADR-020 Created: Font Hosting Strategy for Tenant Theming (February 26, 2026)

**Date**: February 26, 2026  
**Context**: Spec 005 (Frontend Architecture) design-spec Open Question #3 flagged by forge-ux agent — font hosting strategy has CSP, GDPR, and performance implications requiring architectural decision before implementation planning.

**Status**: ✅ ADR written — implementation NOT started

**ADR-020** — Font Hosting Strategy  
**File**: `.forge/knowledge/adr/adr-020-font-hosting-strategy.md`  
**Decision**: Self-host a curated library of ~25 popular open-source fonts (WOFF2) via MinIO/CDN. Fonts loaded via `FontFace` API and applied through CSS custom properties (`--font-heading`, `--font-body`). Google Fonts CDN rejected due to GDPR risk (user IP transmission) and wider CSP surface. Tenant-uploaded custom fonts deferred due to font-file exploit risk and validation complexity.

**Key implications**:

- **CSP**: `font-src 'self'` — tightest possible policy, no third-party origins
- **GDPR**: Zero user data transmitted to third parties for font loading
- **Performance**: Single-origin WOFF2 with preloading; <200ms on 3G
- **Font selector**: Curated dropdown (25 fonts), not arbitrary URL input

**Resolves**: Design-spec Open Question #3  
**Blocks**: Spec 010 Phase 2 (Tenant Theming) font selector implementation

---

### Spec 004 ADRs Created: Plugin Lifecycle & Container Adapter (February 24, 2026)

**Date**: February 24, 2026  
**Context**: Branch `feature/spec-004-plugin-system` — plan.md identified two architectural decisions requiring formal ADRs before implementation can begin.

**Status**: ✅ ADRs written — implementation NOT started (Sprint 4)

**ADR-018** — Plugin Lifecycle vs Marketplace Status  
**File**: `.forge/knowledge/adr/adr-018-plugin-lifecycle-status.md`  
**Decision**: Add separate `lifecycleStatus` column (`PluginLifecycleStatus` enum: REGISTERED→INSTALLING→INSTALLED→ACTIVE→DISABLED→UNINSTALLING→UNINSTALLED) to `plugins` table alongside the existing `status` column (marketplace: DRAFT/PUBLISHED/etc.). The two concerns are orthogonal and must not be conflated.

**ADR-019** — Pluggable Container Adapter  
**File**: `.forge/knowledge/adr/adr-019-pluggable-container-adapter.md`  
**Decision**: Define `ContainerAdapter` interface with `DockerContainerAdapter` (using `dockerode`) and `NullContainerAdapter` (no-op for tests). Selected via `CONTAINER_ADAPTER` env var at startup. K8s adapter deferred to Phase 5.

**Key implementation tasks unlocked**:

- T004-01: Add `PluginLifecycleStatus` enum + migration
- T004-06/07: Implement `ContainerAdapter` interface + Docker adapter
- T004-08: Wire adapter into `PluginLifecycleService` (replaces `runLifecycleHook` stub)

---

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

### Spec 011 Plan & ADRs: Workspace Hierarchy & Templates (February 20, 2026)

**Date**: February 20, 2026  
**Context**: Spec 011 architecture planning for workspace hierarchy, templates, and plugin hook integration

**Status**: ✅ Plan, ADRs, and performance analysis complete — implementation **NOT STARTED** (Sprint 3)

**Deliverables Created**:

1. **Plan 011**: `.forge/specs/011-workspace-hierarchy-templates/plan.md` (~1900 lines)
   - 18 tasks across 3 phases (~49 story points)
   - 3 database migrations, 4 new services, 12 new endpoints
   - 110 tests planned (52 unit + 36 integration + 17 E2E + 5 benchmark)
   - **§14 Performance Impact Analysis** (new): descendant query sargability, scale scenarios, re-parenting cost, NFR-P01–P05
2. **ADR-013**: Materialised Path for Workspace Hierarchy (`.forge/knowledge/adr/adr-013-materialised-path.md`)
   - Chosen over adjacency list (recursive CTEs) and nested sets (expensive writes)
   - O(log n) descendant queries via B-TREE indexed path column
   - Path immutability aligns with parentId immutability requirement (FR-006)
3. **ADR-014**: WorkspacePlugin Scoping (`.forge/knowledge/adr/adr-014-workspace-plugin-scoping.md`)
   - Separate `workspace_plugins` table (not extending `tenant_plugins`)
   - Cascade disable on tenant plugin removal; no cascade re-enable
   - DDD bounded context separation (Art. 3.2)

**Key Architectural Decisions**:

- Materialised path pattern for unlimited-depth hierarchy (ADR-013)
- Separate workspace_plugins join table scoped to workspace (ADR-014)
- Template application in single DB transaction; failure = full rollback
- Hook timeout fail-open at 5s; before_create sequential, created parallel fire-and-forget
- All queries use `Prisma.$queryRaw` + schema-per-tenant pattern

**Performance Analysis Findings** (plan.md §14):

- `WHERE path LIKE 'rootId/%'` is **sargable** only with `varchar_pattern_ops` B-TREE index — must be explicit in T011-01 migration
- `getAggregatedCounts` rewritten to single-pass JOIN (not two correlated subqueries) — see plan.md §14.3
- Scale scenario (500 ws, 10k members): uncached aggregation ~10–25ms — within 200ms P95 SLA
- Re-parenting > 100-node subtrees needs chunked batch UPDATE to avoid lock contention
- Redis cache (TTL 300s) for `agg_counts` and `descendants` results required
- NFR-P01–P05 added to plan.md §14.9; must be added to spec.md by implementor
- New task **T011-07b** (2 pts, Sprint 3): performance hardening — indexes + cache + benchmarks

**Phase Plan**:

- **Phase 1: Hierarchy** (~23 pts, Sprint 3, Weeks 1-3) — includes T011-07b
- **Phase 2: Templates** (~13 pts, Sprint 4, Weeks 4-5)
- **Phase 3: Plugin Integration** (~13 pts, Sprint 4-5, Weeks 5-7)

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
