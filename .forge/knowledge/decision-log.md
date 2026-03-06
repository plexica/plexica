# Decision Log

> This document tracks architectural decisions, technical debt, deferred
> decisions, and implementation notes that don't warrant a full ADR.

**Last Updated**: March 6, 2026 (ADR-021 accepted, ADR-022 updated, ADR-024, ADR-025 added; TD-012 logged)

> **Archive Notice**: Completed decisions from February 2026 have been moved to
> [archives/2026-02/decisions-2026-02.md](./archives/2026-02/decisions-2026-02.md).
> March 2026 closed entries: [archives/2026-03/decisions-2026-03.md](./archives/2026-03/decisions-2026-03.md).
> Historical decisions from 2025 and earlier: [archives/decision-log-2025.md](./archives/decision-log-2025.md)

---

### ADR-021 Accepted: Pino Structured Logging in Frontend Error Boundaries (March 2, 2026)

**Date**: March 2, 2026
**Context**: Spec 010 (Frontend Production Readiness) Phase 1 — error boundaries
(FR-016, FR-017, FR-018) require structured error logging with multi-tenant context
fields (`pluginId`, `tenantId`, `componentStack`). Constitution Art. 6.3 mandates
Pino JSON logging. Four options evaluated: Pino browser, console.error, Winston, Sentry SDK.

**Status**: ✅ ADR written and Accepted

**ADR-021** — Pino Structured Logging in Frontend Error Boundaries
**File**: `.forge/knowledge/adr/adr-021-pino-frontend-logging.md`
**Decision**: Use `pino` with browser transport (`pino({ browser: { asObject: true } })`)
in `apps/web` for all structured logging. ~5–6KB gzipped addition to shell bundle
(within 15KB budget). `pino-pretty` as devDependency only. ESLint `no-console` rule
enforces consistent usage. Same JSON schema as backend logs enables unified aggregation.

**Key implications**:

- **Zero new library**: Pino already in monorepo for backend; pnpm deduplicates
- **Art. 6.3 compliance**: Structured JSON with `timestamp`, `level`, `message`, `tenantId`, `userId`
- **Bundle budget**: ~5–6KB gzipped ≪ 15KB ceiling; negligible vs React (~45KB)
- **Enforcement**: ESLint `no-console: "error"` in `apps/web` prevents raw console usage

**Resolves**: Spec 010 FR-018 (structured error logging), NFR-011 (Pino logger integration)
**Blocks**: T010-04 (Pino logger implementation in shell)

---

### ADR-022 Updated: axe-core for Automated Accessibility Testing (March 2, 2026)

**Date**: March 2, 2026
**Context**: Spec 010 (Frontend Production Readiness) Phase 5 — WCAG 2.1 AA compliance
(Constitution Art. 1.3) requires automated accessibility testing for 8 new components
across 12 WCAG criteria. Current test suite has zero a11y tooling. Four options evaluated:
axe-core ecosystem, jest-axe, Pa11y, manual-only.

**Status**: ✅ ADR updated and Accepted (supersedes initial 2026-02-28 draft)

**ADR-022** — axe-core for Automated Accessibility Testing
**File**: `.forge/knowledge/adr/adr-022-axe-core-playwright.md`
**Decision**: Use the axe-core ecosystem via three `devDependencies`:
`vitest-axe` (Vitest-native component-level a11y matchers), `@axe-core/playwright`
(E2E page-level scans), and `@axe-core/react` (optional dev overlay).
All packages are dev-only — zero production bundle impact. CI blocks merge
on `critical`/`serious` WCAG violations.

**Key implications**:

- **Art. 1.3 compliance**: Automated WCAG 2.1 AA enforcement at both component and E2E level
- **Art. 2.2 compliance**: This ADR IS the required dependency approval; all packages satisfy policy
- **Zero production impact**: All three packages are `devDependencies`; Vite tree-shaking confirmed
- **Framework-native**: `vitest-axe` is purpose-built for Vitest (not a jest-axe shim)
- **~57% automated coverage**: Remaining WCAG criteria covered by manual testing (T010-33, T010-35)

**Resolves**: Spec 010 FR-026 (axe-core testing), NFR-012 (WCAG 2.1 AA compliance)
**Unblocks**: T010-31 (axe-core audit), T010-36 (E2E accessibility tests)

---

### ADR-025 Created: Audit Logs in Core Schema (March 2, 2026)

**Date**: March 2, 2026
**Context**: Spec 008 (Admin Interfaces) `/forge-analyze` flagged W-302 — `audit_logs`
placed in core shared schema deviates from ADR-002 schema-per-tenant pattern without
an ADR. Super Admin cross-tenant audit visibility (FR-006) makes per-tenant placement
architecturally impossible.

**Status**: ✅ ADR written and Accepted

**ADR-025** — Audit Logs Placement in Core Schema
**File**: `.forge/knowledge/adr/adr-025-audit-logs-core-schema.md`
**Decision**: `audit_logs` table lives in the core shared schema as a deliberate,
bounded exception to ADR-002. This is the **only** approved exception. Five mandatory
safeguards enforce tenant isolation at the application layer: single `AuditLogRepository`
access path, required `tenantId` parameter on all tenant-scoped methods, explicitly-named
Super Admin cross-tenant methods gated by role check, PostgreSQL RLS as defense-in-depth,
and a code review gate on all repository changes.

**Resolves**: W-302 from Spec 008 `/forge-analyze`
**Blocks**: Spec 008 T008-03 (AuditLogRepository implementation must enforce all 5 safeguards)

---

### ADR-024 Created: Application-Level Team Member Roles vs Keycloak RBAC (March 2, 2026)

**Date**: March 2, 2026
**Context**: Spec 008 (Admin Interfaces) `/forge-analyze` flagged C-201 — plan.md §5.7
introduces `team_members.role` enum (OWNER/ADMIN/MEMBER/VIEWER) without an ADR, potentially
creating a dual role system conflicting with Keycloak as the sole RBAC authority (Art. 5.1).

**Status**: ✅ ADR written and Accepted

**ADR-024** — Application-Level Team Member Roles vs Keycloak RBAC
**File**: `.forge/knowledge/adr/adr-024-team-member-role-vs-keycloak.md`
**Decision**: `team_members.role` is an application-level organizational role, subordinate
to and bounded by the user's Keycloak realm role. A `TeamAuthGuard` computes the effective
team role as `min(keycloakMaxRole, team_members.role)` on every team-scoped request —
Keycloak is always the security boundary, `team_members.role` adds within-tenant
organizational context only. This mirrors ADR-017's ABAC "can only restrict, never expand"
principle.

**Resolves**: C-201 (CRITICAL) from Spec 008 `/forge-analyze`
**Blocks**: Spec 008 T008-32/T008-33 (team member service must implement `TeamAuthGuard`)

---

## Active Decisions

### Technical Debt

| ID     | Description                                                                                                                                                                                                                                                                                                                                                                                                                                    | Impact   | Severity | Tracked In                                     | Target Sprint                |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------- | ---------------------------------------------- | ---------------------------- |
| TD-001 | Test coverage at 76.5%, target 80%                                                                                                                                                                                                                                                                                                                                                                                                             | Quality  | MEDIUM   | CI report 2026-02-18                           | Next Sprint                  |
| TD-002 | Core modules (auth, tenant, workspace) need 85% coverage                                                                                                                                                                                                                                                                                                                                                                                       | Quality  | HIGH     | `AGENTS.md`                                    | Q1 2026                      |
| TD-004 | 24 integration tests deferred (oauth-flow + ws-resources)                                                                                                                                                                                                                                                                                                                                                                                      | Quality  | MEDIUM   | CI report 2026-02-18                           | Sprint 5                     |
| TD-005 | 3 flaky E2E tests in tenant-concurrent need investigation                                                                                                                                                                                                                                                                                                                                                                                      | Quality  | LOW      | CI report 2026-02-19                           | Sprint 5                     |
| TD-006 | 40 deprecated E2E tests (ROPC flow) need removal                                                                                                                                                                                                                                                                                                                                                                                               | Quality  | LOW      | CI report 2026-02-18                           | Sprint 5                     |
| TD-007 | CSP `frame-ancestors` not set — meta tag approach in T005-15 cannot cover frame-ancestors directive; production deployment requires HTTP response headers for full CSP                                                                                                                                                                                                                                                                         | Security | MEDIUM   | ISSUE-008 from Spec 005 review                 | Sprint 7                     |
| TD-008 | Contract tests for Module Federation widget API surface deferred — Constitution Art. 8.1 requires contract tests for plugin-to-core API interactions; Pact/contract tests for widget remote module interfaces deferred to Spec 010 Phase 3 or a dedicated testing spec                                                                                                                                                                         | Quality  | MEDIUM   | Spec 005 plan §9.4                             | Sprint 10 (Spec 010 Phase 3) |
| TD-009 | FR-009 `GET /api/v1/plugins/:id/metrics` endpoint not implemented — Spec 004 FR-009 requires a per-plugin metrics endpoint proxying container Prometheus metrics; endpoint stub omitted from T004-09 scope. Deferred pending Spec 004 Phase 2 (observability).                                                                                                                                                                                 | Feature  | LOW      | Spec 004 FR-009, FORGE review 2026-02-28       | Sprint 6 (Spec 004 Phase 2)  |
| TD-010 | `JobQueueService` singleton (`job-queue.singleton.ts`) — singleton state persists between test runs if `_resetJobQueueSingletonForTests()` is not called. Current unit tests work correctly because `vi.mock` intercepts `JobQueueService`/`JobRepository` constructors, but if future tests rely on instance identity across test files the singleton must be explicitly reset in `afterEach`.                                                | Quality  | LOW      | Spec 007 HIGH #5 fix, 2026-03-02               | Sprint 7                     |
| TD-011 | Plugin-workspace contract tests deferred — Constitution Art. 8.1 requires contract tests for plugin-to-core API interactions; Pact/contract tests for the workspace plugin toggle surface (`PATCH /api/workspaces/:id/plugins/:pluginId`) were not written as part of Spec 011 Phase 4 due to scope constraints. Deferred to Spec 010 Phase 3 or a dedicated testing spec.                                                                     | Quality  | MEDIUM   | F-034 from Spec 011 Phase 4 review, 2026-03-06 | Sprint 10 (Spec 010 Phase 3) |
| TD-012 | `apiClient as unknown as ApiClient` double-cast in 3+ files (`WorkspaceTreeView.tsx`, `MoveWorkspaceDialog.tsx`, `TemplatePickerGrid.tsx`) — the `apiClient` export from `@/lib/api-client` is typed as a broad union that requires a double-cast to the narrower `ApiClient` interface at each call site. Fix requires updating `@/lib/api-client` to export `apiClient` with the correct `ApiClient` type directly, eliminating all casting. | Quality  | LOW      | I-6 from Spec 011 Phase 4 review, 2026-03-06   | Sprint 7                     |

### Deferred Decisions

| ID     | Decision                             | Reason Deferred                          | Revisit Date | Context               |
| ------ | ------------------------------------ | ---------------------------------------- | ------------ | --------------------- |
| DD-001 | GraphQL API layer                    | Focus on REST first; evaluate after v1.0 | Q2 2026      | Plugin API evolution  |
| DD-002 | Real-time collaboration (WebSockets) | Core platform stability priority         | Q2 2026      | Future plugin feature |

---

### ADR-023 Created: SSE for Real-Time Notification Delivery (February 28, 2026)

**Date**: February 28, 2026
**Context**: Spec 007 (Core Services) design-spec Open Question #2 — real-time
delivery mechanism for notification badge updates and job status counters.
Three options evaluated: SSE, WebSocket, HTTP polling.

**Status**: ✅ ADR written — implementation NOT started (Spec 007 planning phase)

**ADR-023** — Server-Sent Events for Real-Time Notification Delivery
**File**: `.forge/knowledge/adr/adr-023-sse-real-time-notifications.md`
**Decision**: Server-Sent Events (SSE) via `GET /api/v1/notifications/stream`.
Browser `EventSource` API (no new npm dependency). Redis pub/sub fan-out
on channel `notifications:{tenantId}:{userId}` for multi-instance support.
Ping every 30s; 5-minute replay window on reconnect via Redis sorted set.

**Key implications**:

- **Zero new dependencies**: Native browser `EventSource` + existing Fastify + Redis
- **DD-002 compliance**: WebSocket (collaboration) remains deferred to Q2 2026; SSE serves a different concern
- **Tenant isolation**: Redis channels scoped to `{tenantId}:{userId}` — cross-tenant delivery architecturally impossible
- **Infrastructure**: Fastify `connectionTimeout: 0` for SSE routes; Nginx `proxy_read_timeout 65s`

**Resolves**: design-spec.md Open Question #2
**Blocks**: Spec 007 notification endpoint implementation (T007-NNN)

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
- _March 2026: [archives/2026-03/decisions-2026-03.md](./archives/2026-03/decisions-2026-03.md)_
- _2025 and earlier: [archives/decision-log-2025.md](./archives/decision-log-2025.md)_
