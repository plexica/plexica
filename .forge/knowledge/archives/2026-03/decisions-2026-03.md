# Decision Log Archives — March 2026

> Archived from `.forge/knowledge/decision-log.md` on March 2, 2026.
> These entries are completed and no longer need to be in the active log.

---

## Closed Technical Debt Entries — March 2026

### TD-011: `requireRole` Missing from Auth Mock in 5 Unit Test Files (CLOSED 2026-03-02)

| Field        | Value                           |
| ------------ | ------------------------------- |
| **ID**       | TD-011                          |
| **Closed**   | 2026-03-02                      |
| **Impact**   | Quality                         |
| **Severity** | LOW                             |
| **Tracked**  | Spec 007 review fix, 2026-03-02 |

**Description**: `requireRole` was not exported from `vi.mock('../../middleware/auth.js')` in 5 unit test files. When RBAC was added to route `preHandler` options (Spec 007 HIGH #3), the auth mock in the following files did not include `requireRole`, causing 63 test failures:

- `core-services-flows.e2e.unit.test.ts`
- `jobs.routes.unit.test.ts`
- `notification.routes.unit.test.ts`
- `search.routes.unit.test.ts`
- `storage.routes.unit.test.ts`

**Resolution**: Fixed 2026-03-02 as part of Spec 007 review remediation. All 5 files updated with `requireRole: vi.fn(() => vi.fn(...))` in their `vi.mock('../../middleware/auth.js')` calls.

**Standing pattern**: Future route unit tests must include `requireRole: vi.fn(() => vi.fn(...))` in all `vi.mock('../../middleware/auth.js')` calls when routes use `preHandler` RBAC guards.

---

## Archival Batch — March 8, 2026

### Spec 006 Closed: i18n System Test Fixes (March 8, 2026)

**Date**: March 8, 2026
**Context**: Spec 006 (i18n System) was feature-complete (28/28 story points, 6/6 milestones) but
10 process checklist items remained open and 10 test failures were blocking a clean green suite.

**Status**: ✅ All 10 test failures fixed; all 229 i18n tests passing; Spec 006 fully closed.

**Fix 1 — `TranslationKeySchema` edge-case tests (3 tests)**
`translation.schemas.test.ts` lines 147–160: Three tests expected that keys starting with `.`, ending
with `.`, or containing `..` would be accepted by `TranslationKeySchema` ("Regex allows this"). The
schema was tightened after the tests were written — the regex now requires keys to start and end with
alphanumeric/underscore, and a `.refine()` explicitly rejects consecutive dots. Tests updated to
`expect(result.success).toBe(false)` and comments corrected to reflect actual schema behaviour.

**Fix 2 — `locale-switching.test.ts` `displayName` field (1 test)**
`locale-switching.test.ts` line 293: `enLocale.displayName` does not exist on the `LocaleInfo` type.
`getAvailableLocales()` returns `{ code, name, nativeName, namespaceCount }`. Test updated to assert
`enLocale.name === 'English'` and `typeof enLocale.nativeName === 'string'`. The stale `isRTL` field
(never part of the response schema) was also removed.

**Fix 3 — `optionalAuthMiddleware` on public translation GET routes (6 tests)**
`i18n.controller.ts`: The two public GET routes (`/translations/:locale/:namespace` and
`/translations/:locale/:namespace/:hash`) had no `preHandler`. When a `?tenant=` query parameter
was supplied with a valid JWT, the controller checked `if (!request.user)` but `request.user` was
never populated because no middleware had decoded the token. Added `preHandler: optionalAuthMiddleware`
to both routes — unauthenticated requests continue to work (no breaking change), and authenticated
requests now have `request.user` available for the tenant ownership check. Six tests in
`translation.routes.test.ts` that sent auth tokens to tenant-scoped GET requests were previously
returning 401; they now return 200/302/403 as expected.

**Fix 4 — Missing auth headers in two GET tests (part of Fix 3 root cause)**
`translation.routes.test.ts`: The `should include tenant overrides` test (line 247) and two GET
requests inside `should invalidate cache after updating overrides` (lines 694 and 724) were calling
`GET /translations/en/core?tenant=...` without an `Authorization` header. These were relying on the
now-fixed `optionalAuthMiddleware` gap but also genuinely needed auth tokens added. Auth headers
added to all three call sites.

**Resolves**: Spec 006 process checklist (10 items), 10 failing i18n tests
**Files changed**: `i18n.controller.ts`, `translation.routes.test.ts`, `translation.schemas.test.ts`, `locale-switching.test.ts`

---

### ADR-026..030 Created: Plugin Observability Architecture (March 7, 2026)

**Date**: March 7, 2026
**Context**: Spec 012 (Plugin Observability) architecture planning — 5 open questions
(OQ-001 through OQ-005) from spec.md required formal architectural decisions before
implementation planning could proceed. Covers tracing, metrics, log aggregation,
frontend charting, and plugin metrics contract.

**Status**: ✅ All 5 ADRs written and Accepted; plan.md created (45 tasks, ~158 story points)

**ADR-026** — OpenTelemetry SDK with Direct Tempo Export
**File**: `.forge/knowledge/adr/adr-026-otel-direct-tempo-export.md`
**Decision**: Use `@opentelemetry/sdk-node` with `@opentelemetry/exporter-trace-otlp-grpc`
for direct OTLP/gRPC export to Grafana Tempo. Six `@opentelemetry/*` packages approved
as dependencies of `apps/core-api`. Head-based sampling (100% dev, 10% production).
`BatchSpanProcessor` with fail-open semantics. OTel Collector sidecar deferred to
future production-hardening spec.

**ADR-027** — prom-client for Core Platform Metrics
**File**: `.forge/knowledge/adr/adr-027-prom-client-core-metrics.md`
**Decision**: `prom-client` ^15.1.3 as direct dependency of `apps/core-api` (already
exists in `packages/event-bus`; pnpm deduplicates). `MetricsService` with dedicated
`Registry` instance, merged with event-bus registry at `GET /metrics`. Histogram
buckets aligned with Constitution Art. 4.3 P95 < 200ms SLA. No new npm package
needed — reuse existing monorepo dependency.

**ADR-028** — Log Ingestion via Promtail → Loki
**File**: `.forge/knowledge/adr/adr-028-log-ingestion-promtail-loki.md`
**Decision**: Promtail sidecar in docker-compose reads container JSON logs via
Docker volume mount (`/var/lib/docker/containers`). `docker_sd_configs` for
automatic container discovery. Pipeline stages extract Pino JSON fields
(`level`, `tenantId`, `pluginId`, `traceId`). Loki Docker logging driver
rejected (requires host-level Docker plugin install). No Elasticsearch
(remains commented out per existing decision).

**ADR-029** — Chart Library Selection: recharts
**File**: `.forge/knowledge/adr/adr-029-chart-library-recharts.md`
**Decision**: `recharts` ^2.15 as dependency of `apps/web`. ~45KB gzipped,
code-split into admin observability route (not in main bundle). Accessibility
strategy: SVG `aria-label` attributes, data table fallback for screen readers,
non-colour line differentiation (dash patterns). `uPlot` rejected (Canvas
blocks SVG a11y; Art. 1.3 violation). `@visx` rejected (too verbose for
dashboard use case).

**ADR-030** — Plugin Metrics Format Contract (Prometheus Exposition)
**File**: `.forge/knowledge/adr/adr-030-plugin-metrics-prometheus-format.md`
**Decision**: Plugins MUST expose `GET /metrics` in Prometheus text exposition
format (v0.0.4). Required metrics: `http_requests_total` (counter),
`http_request_duration_seconds` (histogram). Plugin SDK `BasePlugin`
auto-configures `prom-client` and serves `/metrics`. Prometheus `sample_limit: 5000`
per plugin target. Core API proxies individual plugin metrics at
`GET /api/v1/plugins/:id/metrics` (resolves TD-009).

**OQ-005 Resolution** (alert delivery — non-ADR decision): MVP uses in-app alerts
via SSE (reusing ADR-023 pattern) only. External integrations (PagerDuty, Slack)
deferred to post-MVP.

**Key implications**:

- **8 new npm packages**: 6 `@opentelemetry/*` (ADR-026), `recharts` (ADR-029); `prom-client` reused (ADR-027)
- **5 new Docker services**: Prometheus, Grafana, Tempo, Loki, Promtail (ADR-026/027/028)
- **No new PostgreSQL tables**: All observability data stored in Prometheus/Tempo/Loki
- **Art. 2.2 compliance**: All dependency additions approved via ADRs
- **Art. 1.3 compliance**: recharts SVG + data table fallback for WCAG 2.1 AA (ADR-029)
- **Art. 9.2 compliance**: Full monitoring stack (health checks, structured logs, alerts) (ADR-026/027/028)
- **TD-009 resolved**: `GET /api/v1/plugins/:id/metrics` planned as T012-18

**Resolves**: Spec 012 OQ-001 (tracing), OQ-002 (log ingestion), OQ-003 (charting), OQ-004 (plugin metrics), OQ-005 (alert delivery), TD-009
**Blocks**: Spec 012 implementation (45 tasks across 5 phases)

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

## Resolved Technical Debt Entries — March 7–8, 2026

| ID     | Description (Short)                                         | Closed     | Resolution Summary                                                                                          |
| ------ | ----------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------- |
| TD-005 | 3 flaky E2E tests in tenant-concurrent                      | 2026-03-07 | Replaced hard-coded sleeps with `waitForTenantStatus()` polling helper; CI timeouts raised                  |
| TD-006 | 40 deprecated E2E tests (ROPC flow) need removal            | 2026-03-07 | Deleted `security-hardening.e2e.test.ts` and `token-refresh.e2e.test.ts` (both skip-wrapped)                |
| TD-007 | CSP `frame-ancestors` not set                               | 2026-03-07 | Added `frameguard: { action: 'deny' }` to `@fastify/helmet` in `index.ts` + `test-app.ts`                   |
| TD-009 | `GET /api/v1/plugins/:id/metrics` not implemented           | 2026-03-07 | Planned as T012-18 in Spec 012 plan.md; ADR-030 defines Prometheus exposition contract                      |
| TD-010 | `JobQueueService` singleton state bleeds between test runs  | 2026-03-07 | `afterEach(() => { _resetJobQueueSingletonForTests(); })` added to both affected test files                 |
| TD-012 | `apiClient as unknown as ApiClient` double-cast in 3+ files | 2026-03-06 | `api-client.ts` exports `apiClient` as `WebApiClient & ApiClient`; 4 call-site casts removed                |
| TD-013 | NFR-005 content-hashed translation bundle URLs not impl.    | 2026-03-07 | Hash-match endpoint added; `X-Translation-Hash` header; two-step fetch in `useTranslations.ts`              |
| TD-014 | `updatedAt` fabricated from app server clock in PATCH       | 2026-03-07 | `updateSettings()` RETURNING clause extended; `settings.updatedAt` from DB                                  |
| TD-015 | `WorkspaceSettingsUpdateSchema.partial()` injects defaults  | 2026-03-07 | `PatchWorkspaceSettingsSchema` added with `.optional()` fields; `validatePatchWorkspaceSettings()` exported |
| TD-016 | `WorkspaceSwitcher` create-workspace buttons missing labels | 2026-03-07 | `aria-label` added to submit and cancel buttons; WCAG 4.1.2 satisfied                                       |
| TD-017 | 9-column member SELECT block duplicated 3× in service       | 2026-03-07 | `MEMBER_SELECT_COLUMNS` Prisma.sql fragment extracted; all 3 blocks replaced                                |
| TD-018 | Null bytes in tenant `name` not rejected at app layer       | 2026-03-07 | JSON Schema `pattern: '^[^\u0000]*$'` added to all 4 create/update schema locations                         |

---

_Appended: March 8, 2026 — 19 entries added (6 ADR/spec entries + 12 resolved TDs + 1 spec closure)_
