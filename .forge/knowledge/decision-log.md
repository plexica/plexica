# Decision Log

> This document tracks architectural decisions, technical debt, deferred
> decisions, and implementation notes that don't warrant a full ADR.

**Last Updated**: March 8, 2026 (Spec 006 closed — 10 test fixes applied; optionalAuthMiddleware added to public translation routes)

> **Archive Notice**: Completed decisions from February 2026 have been moved to
> [archives/2026-02/decisions-2026-02.md](./archives/2026-02/decisions-2026-02.md).
> March 2026 closed entries: [archives/2026-03/decisions-2026-03.md](./archives/2026-03/decisions-2026-03.md).
> Historical decisions from 2025 and earlier: [archives/decision-log-2025.md](./archives/decision-log-2025.md)

---

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

## Active Decisions

### Technical Debt

| ID         | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Impact      | Severity   | Tracked In                            | Target Sprint                |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------- | ------------------------------------- | ---------------------------- |
| TD-001     | Test coverage at 76.5%, target 80%                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Quality     | MEDIUM     | CI report 2026-02-18                  | Next Sprint                  |
| TD-002     | Core modules (auth, tenant, workspace) need 85% coverage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Quality     | HIGH       | `AGENTS.md`                           | Q1 2026                      |
| TD-004     | 24 integration tests deferred (oauth-flow + ws-resources)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Quality     | MEDIUM     | CI report 2026-02-18                  | Sprint 5                     |
| ~~TD-005~~ | ~~3 flaky E2E tests in tenant-concurrent need investigation~~ — **RESOLVED 2026-03-07**: Replaced 2 hard-coded `setTimeout(resolve, 2000)` sleeps with a `waitForTenantStatus()` polling helper (polls `GET /api/tenants/:id` every 300ms, 15s timeout). Performance ceiling raised 180s→240s / 20s→30s per tenant to accommodate CI load. All 3 flaky assertions now deterministic.                                                                                                                                                                                                                                                                                                                                                                                                                                         | Quality     | ~~LOW~~    | Resolved 2026-03-07                   | ~~Sprint 5~~ Done            |
| ~~TD-006~~ | ~~40 deprecated E2E tests (ROPC flow) need removal~~ — **RESOLVED 2026-03-07**: Deleted `security-hardening.e2e.test.ts` (23 tests) and `token-refresh.e2e.test.ts` (17 tests). Both files were `describe.skip`-wrapped with a comment pointing to the replacement `auth-complete.e2e.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Quality     | ~~LOW~~    | Resolved 2026-03-07                   | ~~Sprint 5~~ Done            |
| ~~TD-007~~ | ~~CSP `frame-ancestors` not set — meta tag approach in T005-15 cannot cover frame-ancestors directive; production deployment requires HTTP response headers for full CSP~~ — **RESOLVED 2026-03-07**: Added `frameguard: { action: 'deny' }` to `@fastify/helmet` config in both `apps/core-api/src/index.ts` and `apps/core-api/src/test-app.ts`. `X-Frame-Options: DENY` is now set unconditionally in all environments. Production CSP `frame-ancestors: 'none'` continues to cover modern browsers; legacy browsers now also protected via this header.                                                                                                                                                                                                                                                                  | Security    | ~~MEDIUM~~ | Resolved 2026-03-07                   | ~~Sprint 7~~ Done            |
| TD-008     | Contract tests for Module Federation widget API surface deferred — Constitution Art. 8.1 requires contract tests for plugin-to-core API interactions; Pact/contract tests for widget remote module interfaces deferred to Spec 010 Phase 3 or a dedicated testing spec                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Quality     | MEDIUM     | Spec 005 plan §9.4                    | Sprint 10 (Spec 010 Phase 3) |
| ~~TD-009~~ | ~~FR-009 `GET /api/v1/plugins/:id/metrics` endpoint not implemented — Spec 004 FR-009 requires a per-plugin metrics endpoint proxying container Prometheus metrics; endpoint stub omitted from T004-09 scope. Deferred pending Spec 004 Phase 2 (observability).~~ — **RESOLVED 2026-03-07**: Endpoint planned as T012-18 in Spec 012 (Plugin Observability) plan.md. Core API proxies `GET http://<container>:<port>/metrics` per plugin, with `sample_limit: 5000` enforcement. ADR-030 defines the plugin metrics contract (Prometheus exposition format).                                                                                                                                                                                                                                                                | Feature     | ~~LOW~~    | Resolved 2026-03-07, ADR-030, T012-18 | ~~Sprint 6~~ Done            |
| ~~TD-010~~ | ~~`JobQueueService` singleton (`job-queue.singleton.ts`) — singleton state persists between test runs if `_resetJobQueueSingletonForTests()` is not called. Current unit tests work correctly because `vi.mock` intercepts `JobQueueService`/`JobRepository` constructors, but if future tests rely on instance identity across test files the singleton must be explicitly reset in `afterEach`.~~ — **RESOLVED 2026-03-07**: `afterEach(() => { _resetJobQueueSingletonForTests(); })` added to `jobs.routes.test.ts` and `search.routes.test.ts`. Both files retain the existing `afterAll` reset as defense-in-depth.                                                                                                                                                                                                    | Quality     | ~~LOW~~    | Resolved 2026-03-07                   | ~~Sprint 7~~ Done            |
| ~~TD-014~~ | ~~`updatedAt` fabricated from app server clock in PATCH settings response~~ — **RESOLVED 2026-03-07**: `updateSettings()` RETURNING clause extended to include `updated_at`; return type changed to `WorkspaceSettings & { updatedAt: Date }`. Route handler now uses `settings.updatedAt.toISOString()` from DB. Unit tests updated with `updated_at` in mock rows + new assertion `expect(result.updatedAt).toBe(dbUpdatedAt)`.                                                                                                                                                                                                                                                                                                                                                                                            | Quality     | ~~LOW~~    | Resolved 2026-03-07                   | ~~Sprint 6~~ Done            |
| ~~TD-015~~ | ~~`WorkspaceSettingsUpdateSchema.partial()` injects Zod-defaults on PATCH~~ — **RESOLVED 2026-03-07**: New `PatchWorkspaceSettingsSchema` added to `workspace-settings.schema.ts` using `.optional()` on each field (no `.default()`). `validatePatchWorkspaceSettings()` helper exported. PATCH route updated to use `PatchWorkspaceSettings` type + `validatePatchWorkspaceSettings()`, eliminating the manual key-intersection workaround. 4 new unit tests added (`PatchWorkspaceSettingsSchema` + `validatePatchWorkspaceSettings()` describe blocks).                                                                                                                                                                                                                                                                  | Quality     | ~~LOW~~    | Resolved 2026-03-07                   | ~~Sprint 6~~ Done            |
| ~~TD-016~~ | ~~`WorkspaceSwitcher` create-workspace buttons missing accessible labels~~ — **RESOLVED 2026-03-07**: `aria-label="Create workspace"` added to the `<Button type="submit">` and `aria-label="Cancel creating workspace"` added to the Cancel button in `WorkspaceSwitcher.tsx`. WCAG 2.1 AA criterion 4.1.2 now satisfied for both form action buttons.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | UX/A11y     | ~~LOW~~    | Resolved 2026-03-07                   | ~~Sprint 6~~ Done            |
| ~~TD-017~~ | ~~9-column member SELECT block duplicated 3× in `workspace.service.ts`~~ — **RESOLVED 2026-03-07**: `MEMBER_SELECT_COLUMNS` constant (`Prisma.sql` fragment) extracted at module level. All 3 duplicate blocks in `getMemberWithUser()` and the two branches of `getMembers()` replaced with `SELECT ${MEMBER_SELECT_COLUMNS}`. Single source of truth for column list going forward.                                                                                                                                                                                                                                                                                                                                                                                                                                        | Quality     | ~~LOW~~    | Resolved 2026-03-07                   | ~~Sprint 7~~ Done            |
| ~~TD-013~~ | ~~NFR-005 content-hashed translation bundle URLs not implemented~~ — **RESOLVED 2026-03-07**: `GET /api/v1/translations/:locale/:namespace/:hash` endpoint added. Hash-match returns `200 immutable; max-age=31536000`; stale hash returns `301` redirect to current hash URL. Stable URL headers fixed to `max-age=60, stale-while-revalidate=3600` (not immutable). `X-Translation-Hash` response header added. Frontend `useTranslations.ts` updated with two-step fetch pattern (stable-URL query `staleTime:60s` → content-addressed query `staleTime:Infinity`). 7 new integration tests covering 200/301/401/400/404 cases.                                                                                                                                                                                           | Performance | ~~LOW~~    | Resolved 2026-03-07                   | ~~Sprint 8~~ Done            |
| ~~TD-011~~ | ~~Plugin-workspace contract tests deferred~~ — **RESOLVED 2026-03-06**: 18 in-process contract tests written at `apps/core-api/src/__tests__/workspace/integration/workspace-plugins.contract.test.ts`. Covers all 4 endpoints (POST/GET/PATCH/DELETE), all status codes (200/201/204/400/401/403/404/409), and full response shape per Constitution Art. 6.2. All 18 tests pass.                                                                                                                                                                                                                                                                                                                                                                                                                                            | Quality     | ~~MEDIUM~~ | Resolved 2026-03-06                   | ~~Sprint 10~~ Done           |
| ~~TD-012~~ | ~~`apiClient as unknown as ApiClient` double-cast in 3+ files~~ — **RESOLVED 2026-03-06**: `api-client.ts` exports `apiClient` typed as `WebApiClient & ApiClient`. All 4 call-site casts removed across `WorkspaceTreeView.tsx`, `MoveWorkspaceDialog.tsx`, `PluginToggleCard.tsx`, `TemplatePickerGrid.tsx`. `tsc --noEmit` clean, all 941 frontend tests pass.                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Quality     | ~~LOW~~    | Resolved 2026-03-06                   | ~~Sprint 7~~ Done            |
| ~~TD-018~~ | ~~Null bytes in tenant `name` field not rejected at application layer — Zod `string()` schema accepts `\x00` bytes; they reach Prisma/PostgreSQL which throws a 500 (`invalid byte sequence for encoding "UTF8": 0x00`) instead of a clean 400.~~ — **RESOLVED 2026-03-07**: Added JSON Schema `pattern: '^[^\u0000]*$'` to the `name` field in all 4 locations: `createTenantSchema` and `updateTenantSchema` in `routes/tenant.ts`, and `POST /admin/tenants` and `PATCH /admin/tenants/:id` inline schemas in `routes/admin.ts`. Fastify/ajv now rejects null bytes at the schema-validation layer with a clean 400 before the request reaches Prisma. Test assertion in `security-headers.integration.test.ts` tightened from `[400, 500]` to strict `400`. All 11 security-header tests and 179 tenant unit tests pass. | Security    | ~~LOW~~    | Resolved 2026-03-07                   | ~~Sprint 10~~ Done           |
| TD-019     | Spec 012 E2E tests not yet implemented — Constitution Art. 8.1 requires E2E tests for critical user flows; the Plugin Observability dashboard (FR-013, FR-014, FR-015, FR-028, FR-030, FR-031) has no Playwright E2E coverage. Unit and integration tests exist (T012-34..T012-37) but full user-journey E2E (open dashboard, view metrics, filter logs, view trace) is deferred. Risk: a wiring regression between the frontend chart components and the backend observability routes would not be caught by current tests.                                                                                                                                                                                                                                                                                                 | Quality     | MEDIUM     | forge-review 2026-03-08               | Sprint 011 (post-Spec 012)   |
| TD-020     | Force-uninstall lifecycle status mismatch — Spec 012 plan.md T012-18 assumes plugins reach `PluginLifecycleStatus.ACTIVE` before being scraped; however Spec 004 US-002 (force-uninstall) sets `lifecycleStatus = UNINSTALLED` directly from `ACTIVE` without transitioning through `DEACTIVATED`. `PluginTargetsService.removeTarget()` is not called in the force-uninstall path, leaving stale Prometheus scrape targets in `plugins.json`. Low immediate risk (Prometheus will mark the target `down` after the next scrape interval), but needs explicit `removeTarget()` call in the force-uninstall handler and a regression test.                                                                                                                                                                                    | Quality     | LOW        | forge-review 2026-03-08               | Sprint 011                   |

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
