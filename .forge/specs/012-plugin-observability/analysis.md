# Spec 012 — Plugin Observability: Adversarial Consistency Review

**Reviewer**: forge-reviewer (claude-opus-4.6)
**Date**: March 7, 2026
**Status**: **BLOCKED — 3 CRITICAL issues must be resolved before implementation**
**Review Type**: Cross-artifact adversarial consistency review (7 dimensions)
**Spec**: `.forge/specs/012-plugin-observability/`

---

## Input Artifacts Reviewed

| #   | Artifact          | Path                                          | Lines |
| --- | ----------------- | --------------------------------------------- | ----- |
| 1   | Functional Spec   | `spec.md`                                     | 904   |
| 2   | Architecture Plan | `plan.md`                                     | 1257  |
| 3   | UX Design Spec    | `design-spec.md`                              | 1074  |
| 4   | User Journeys     | `user-journey.md`                             | 239   |
| 5   | ADR-026           | `adr-026-otel-direct-tempo-export.md`         | ~290  |
| 6   | ADR-027           | `adr-027-prom-client-core-metrics.md`         | ~230  |
| 7   | ADR-028           | `adr-028-log-ingestion-promtail-loki.md`      | ~290  |
| 8   | ADR-029           | `adr-029-chart-library-recharts.md`           | —     |
| 9   | ADR-030           | `adr-030-plugin-metrics-prometheus-format.md` | —     |

**Codebase Context Files Read**:

| File                                      | Purpose                                                       |
| ----------------------------------------- | ------------------------------------------------------------- |
| `apps/core-api/src/routes/plugin-v1.ts`   | Existing plugin routes — backward compatibility check         |
| `apps/super-admin/src/routes/_layout.tsx` | Existing Super Admin layout — correct target app verification |
| `docker-compose.yml`                      | Current infrastructure — no observability services            |
| `.forge/constitution.md`                  | All 9 articles checked                                        |

---

## Severity Legend

| Severity     | ID Prefix | Meaning                                                                 | Merge Gate                            |
| ------------ | --------- | ----------------------------------------------------------------------- | ------------------------------------- |
| **CRITICAL** | C-1xx     | Blocks implementation; will cause production defects or security issues | Must fix before implementation begins |
| **WARNING**  | W-2xx     | Will cause rework or specification confusion during implementation      | Should fix before sprint planning     |
| **INFO**     | I-3xx     | Improvement opportunity; no correctness impact                          | Fix at implementor discretion         |

---

## Issues

### Dimension 1: Spec-Plan Coherence

#### C-101 — Frontend target app mismatch across spec.md and plan.md vs actual codebase

**Severity**: CRITICAL
**Artifacts**: spec.md (lines 831–836, 853), plan.md (32 occurrences), design-spec.md (lines 15, 25, 61, 564, 1067–1068)

**Finding**: spec.md and plan.md place all observability frontend components in `apps/web/src/pages/admin/observability/` and `apps/web/src/components/observability/`. However, the **actual Super Admin portal lives at `apps/super-admin/`** — a completely separate TanStack Router application with its own layout (`_layout.tsx`), sidebar (`AdminSidebarNav`), auth guard (`useRequireSuperAdmin`), and established route conventions (dashboard, tenants, plugins, users, health, audit-logs).

The design-spec.md **correctly** references `apps/super-admin` (lines 15, 25, 61, 564, 1067–1068), but spec.md and plan.md do not.

**Impact**: If a developer follows plan.md's file map, they will create 11+ files in the wrong application. The observability dashboard would not share the Super Admin layout, sidebar navigation, or auth guard. It would be inaccessible from the existing Super Admin portal.

**Resolution Required**:

1. Update spec.md §12 "File Scope" to reference `apps/super-admin/` paths
2. Update plan.md §5 (file map, 32 occurrences), §6.1 (dependency list — `recharts` goes to `apps/super-admin/package.json`), §7 Phase 4 (all T012-27..33 file locations), §8.3 (E2E test paths)
3. Align route convention with existing `apps/super-admin/src/routes/_layout/` pattern (e.g., `_layout/observability/index.tsx`) instead of `pages/admin/observability/`

---

#### W-201 — Plan §1 overview text is stale (38 tasks / ~92 pts vs actual 45 tasks / 158 pts)

**Severity**: WARNING
**Artifact**: plan.md line 27

**Finding**: The plan introduction says "38 tasks totalling ~92 story points" but the actual summary table (line 1040) shows **45 tasks, 158 story points, ~131 hours**. The overview text was never updated after tasks were finalized.

**Impact**: Sprint planning based on the overview paragraph will grossly underestimate effort (42% point undercount).

**Resolution**: Update plan.md line 27 to match the summary table.

---

#### W-202 — Log query API endpoint (`GET /api/v1/observability/plugins/:id/logs`) has no explicit FR number

**Severity**: WARNING
**Artifact**: spec.md §8.3 line 521

**Finding**: The log query endpoint is defined in the API surface (spec.md §8.3) and has a plan task (T012-24), but no dedicated `FR-0XX` functional requirement covers it. FR-018 covers "Logs indexed in Loki with labels" (Loki storage), not the API query endpoint itself. The endpoint is implied by US-004 AC-3 ("I can filter logs by level, time range, and keyword") but orphaned from the FR traceability chain.

**Impact**: Traceability gap — acceptance testing cannot verify this endpoint against a specific requirement ID.

**Resolution**: Either (a) add an explicit `FR-020b` or renumber to cover the log query API endpoint, or (b) update FR-018 description to explicitly include the API endpoint.

---

#### I-301 — FR-014 (Plugin SDK auto-creates child spans) has no plan task

**Severity**: INFO
**Artifact**: spec.md FR-014, plan.md §10 traceability

**Finding**: FR-014 is "Should" priority and plan.md §10 notes "Plugin SDK (future — Should priority)". Acceptable deferral for Should priority but should be documented in a tech debt entry.

**Resolution**: Add TD-0XX entry in decision-log.md for FR-014 deferral.

---

### Dimension 2: Plan-ADR Consistency

#### C-102 — ADR-026 requires 7 OTel packages; plan.md only lists 6 (missing `@opentelemetry/instrumentation-fastify`)

**Severity**: CRITICAL
**Artifact**: ADR-026 line 157, plan.md lines 696–701

**Finding**: ADR-026 explicitly approves and requires `@opentelemetry/instrumentation-fastify` (^0.43) alongside 6 other packages. ADR-026 §9 code sample (line 191) shows `new FastifyInstrumentation()` alongside `new HttpInstrumentation()`. However, plan.md §6.1 dependency table lists only 6 packages — `@opentelemetry/instrumentation-fastify` is missing. Plan.md T012-12 only mentions `HttpInstrumentation` in its description.

**Impact**: Without `FastifyInstrumentation`, traces will show generic HTTP spans but will lack Fastify-specific route/handler enrichment (route name, handler function, plugin context). This degrades trace quality and makes route-level debugging significantly harder. The ADR was written specifically to include this package.

**Resolution**:

1. Add `@opentelemetry/instrumentation-fastify ^0.43` to plan.md §6.1 dependency table
2. Update T012-12 description to include `FastifyInstrumentation` alongside `HttpInstrumentation`
3. Update T012-17 to install 7 packages (not 6)
4. Confirm weekly downloads > 1000 for Art. 2.2 compliance (as of March 2026: ~180k/week — compliant)

---

#### W-203 — ADR task ID references do not match actual plan task IDs

**Severity**: WARNING
**Artifacts**: ADR-026 (lines 274–279), ADR-028 (line 284)

**Finding**: ADRs reference task IDs that don't match the actual plan:

| ADR says                                    | Actual plan task | Description                   |
| ------------------------------------------- | ---------------- | ----------------------------- |
| ADR-026 → T012-05 (telemetry.ts)            | T012-12          | OTel SDK init                 |
| ADR-026 → T012-08 (traceparent replacement) | T012-15          | plugin-hook.service.ts update |
| ADR-026 → T012-09 (Pino logger enrichment)  | T012-14          | logger.ts Pino mixin          |
| ADR-028 → T012-09 (Pino logger enrichment)  | T012-14          | Pino traceId/spanId injection |

ADR-027 task IDs (T012-06, T012-07, T012-02) match the plan correctly. ADR-028 task IDs for Loki/Promtail (T012-03, T012-04) also match. Only the tracing-related IDs are misaligned.

**Impact**: Implementors following ADR follow-up checklists will reference non-existent or wrong tasks, causing confusion during sprint execution.

**Resolution**: Update ADR-026 follow-up task references (T012-05→T012-12, T012-08→T012-15, T012-09→T012-14). Update ADR-028 line 284 (T012-09→T012-14).

---

### Dimension 3: Constitution Compliance

#### C-103 — `METRICS_AUTH_REQUIRED=false` allows unauthenticated access to `/metrics`, violating Art. 5.1

**Severity**: CRITICAL
**Artifact**: plan.md §12 line 1203

**Finding**: Plan.md defines environment variable `METRICS_AUTH_REQUIRED` (default: `true`) that controls whether `GET /metrics` requires authentication. When set to `false`, the metrics endpoint becomes publicly accessible. Constitution Art. 5.1 states: **"All endpoints require authentication unless explicitly marked public."** The `/metrics` endpoint exposes internal platform metrics (heap size, event loop lag, active connections, request rates) which are security-sensitive operational data.

There is no ADR approving this exception. The endpoint is not "explicitly marked public" in the spec — the spec (§8.2) says `Auth: Bearer + super_admin`.

**Impact**: A misconfigured production deployment exposes internal metrics to unauthenticated users, enabling reconnaissance attacks (learning request patterns, identifying performance bottlenecks to exploit, discovering internal service topology).

**Resolution**: Remove the `METRICS_AUTH_REQUIRED` environment variable entirely. If Prometheus scrape authentication is an operational concern, document a dedicated `/metrics` auth strategy (e.g., Prometheus Bearer token via `authorization` scrape config field, which is already planned in ADR-027 line 226: "Configure Prometheus scrape with Bearer token auth"). The env var toggle is unnecessary and dangerous.

---

#### W-204 — NFR-003 P95 < 500ms deviates from Art. 4.3 P95 < 200ms without explicit justification

**Severity**: WARNING
**Artifact**: spec.md line 364

**Finding**: Constitution Art. 4.3 sets P95 API response time at < 200ms for "standard API endpoints." NFR-003 sets observability API P95 at < 500ms with the parenthetical note "these proxy to Prometheus/Tempo which have their own SLAs." While the relaxation is technically reasonable (proxy endpoints add network hops), the constitution has no "proxy endpoint" exception category.

**Impact**: Without formal justification, this creates precedent for ad-hoc SLA relaxation across future specs.

**Resolution**: Add a brief justification paragraph in spec.md (e.g., in §9 Constitution Compliance) explicitly categorizing observability proxy endpoints as "non-standard" per Art. 4.3 and documenting why 500ms is acceptable. Consider adding this as a formal exception in the constitution amendments log.

---

#### W-205 — No OpenAPI/Swagger documentation task for 8 new API endpoints (Art. 3.4.5)

**Severity**: WARNING
**Artifact**: plan.md (all 45 tasks), constitution Art. 3.4 item 5

**Finding**: Constitution Art. 3.4.5 requires "All endpoints documented with OpenAPI/Swagger." Spec 012 adds 8 new API endpoints (1 `/metrics`, 7 `/api/v1/observability/*`), but no task in plan.md covers OpenAPI schema generation or documentation for these endpoints. The existing `plugin-v1.ts` routes already have OpenAPI schemas registered (lines 200+).

**Impact**: New endpoints ship without API documentation, violating Art. 3.4 and making integration harder for future consumers.

**Resolution**: Add a task (e.g., T012-26b, ~2 pts) in Phase 3 for OpenAPI schema definitions for all 8 new endpoints, following the existing pattern in `plugin-v1.ts`.

---

#### W-206 — No feature flag implementation task for dashboard UI rollout (Art. 9.1)

**Severity**: WARNING
**Artifact**: plan.md §11 (line 1190), spec.md §10 (line 875)

**Finding**: Both spec.md and plan.md claim Art. 9.1 compliance with the statement "feature flags for dashboard UI (additive, no breaking changes)" and "feature flags for dashboard UI rollout." However, no task in the 45-task plan actually implements a feature flag for the observability dashboard. The existing Super Admin layout uses a `admin_interfaces_enabled` feature flag gate (seen in `_layout.tsx` comment line 9), but no task adds an `observability_enabled` or similar flag.

**Impact**: Observability dashboard cannot be gradually rolled out or disabled without code deployment, violating Art. 9.1.

**Resolution**: Add a task to implement a feature flag (e.g., `observability_dashboard_enabled`) and gate the sidebar nav item + route on it. ~1 story point.

---

#### I-302 — Art. 5.3 Zod validation for observability query parameters not explicitly specified

**Severity**: INFO
**Artifact**: plan.md Phase 3 (T012-19..26)

**Finding**: Art. 5.3 requires "All external input validated with Zod schemas." Plan.md T012-19 mentions "ObservabilityService" with "PromQL/LogQL injection prevention" (§8.1) but no task explicitly creates Zod schemas for the query parameters (PromQL string, RFC3339 dates, pagination integers, severity enum). The injection prevention is good, but Zod structural validation is a separate concern.

**Resolution**: Ensure T012-19 or T012-20 explicitly defines Zod schemas for all query parameter types. The plan should mention schema file location (e.g., `observability.schema.ts`).

---

### Dimension 4: Backward Compatibility

#### I-303 — New routes must use separate file, not modify `plugin-v1.ts`

**Severity**: INFO
**Artifact**: plan.md §5.6 (modified files)

**Finding**: Plan.md correctly specifies new files for observability routes (`observability-v1.ts`, `metrics.ts`) and lists `plugin-v1.ts` only for "Add metrics proxy route." The proxy route `GET /api/v1/plugins/:id/metrics` is semantically part of the plugin domain and fits in `plugin-v1.ts`. This is appropriate.

**Impact**: None — backward compatibility is maintained.

**Resolution**: No action needed. Confirmed compliant.

---

### Dimension 5: Security Posture

#### W-207 — PromQL/LogQL injection prevention strategy not specified in detail

**Severity**: WARNING
**Artifact**: plan.md §8.1 (ObservabilityService test focus), spec.md §8.4 (error codes)

**Finding**: Plan.md mentions "PromQL/LogQL injection prevention" as a test focus area and spec.md defines `PROMQL_INJECTION_DETECTED` error code, but neither document specifies the actual prevention strategy. Options include: allowlist of metric names, regex validation of PromQL syntax, or proxy-only mode where the core API constructs all queries. Without a defined strategy, implementors may choose an insufficient approach (e.g., simple character escaping, which is easily bypassed in PromQL).

**Impact**: Insufficient injection prevention could allow a compromised Super Admin session to execute arbitrary PromQL against Prometheus, potentially causing resource exhaustion (expensive queries) or information disclosure.

**Resolution**: Add a security note in spec.md or plan.md specifying the injection prevention strategy. Recommended: metric name allowlist + query parameter validation (no raw PromQL passthrough) for the `/query` endpoint, and LogQL label filter construction (server-side template with parameter substitution) for the `/logs` endpoint.

---

### Dimension 6: UX-Spec Coherence

#### W-208 — Design-spec `apps/super-admin` paths are correct; spec.md and plan.md paths conflict

**Severity**: WARNING (subsumed by C-101 but noted separately for UX dimension)

**Finding**: Design-spec correctly identifies the Super Admin portal at `apps/super-admin` with existing `AdminSidebarNav` (design-spec line 564). The sidebar modification (adding "Observability" nav item after "Health") aligns with the existing `SUPER_ADMIN_NAV_ITEMS` array in `_layout.tsx` line 40–48. The design-spec's component placement and route structure are sound.

However, spec.md §12 and plan.md §5 direct implementations to `apps/web` — a different application. Any UX component work following plan.md will produce unusable artifacts.

**Resolution**: Subsumed by C-101. Fix spec.md and plan.md paths.

---

#### W-209 — Mobile responsiveness concern for observability dashboard (Art. 1.3)

**Severity**: WARNING
**Artifact**: spec.md §9.7 (line 875 area), design-spec.md §10

**Finding**: Constitution Art. 1.3 requires "All interfaces must be responsive and usable on mobile devices." Spec.md §9.7 states the dashboard is "designed for desktop-first (min-width 1024px)" and design-spec §10 specifies that the health table "scrolls horizontally on mobile" and the traces waterfall "uses horizontal scroll on mobile."

Horizontal scrolling is a known mobile usability anti-pattern (especially for data tables) and may not satisfy "usable on mobile devices." The health table has 7 columns (plugin name, status, CPU, memory, request rate, error rate, uptime) — this will be unusable on a 375px viewport with horizontal scroll alone.

**Impact**: May fail WCAG 2.1 AA criterion 1.4.10 (Reflow) which requires content to be usable at 320px width without horizontal scrolling. May also violate Art. 1.3 "usable on mobile" requirement.

**Resolution**: Design-spec should specify a card-based responsive layout for health data at mobile breakpoints (stacking columns into key-value cards) rather than relying on horizontal scroll. Alternatively, document this as an accepted limitation with a decision rationale (admin dashboards are typically desktop-only tools).

---

### Dimension 7: Test Coverage

#### W-210 — No dedicated unit test task for `trace-context.ts` middleware

**Severity**: WARNING
**Artifact**: plan.md §8.1, §7 Phase 5

**Finding**: Plan §8.1 lists `trace-context.ts` as a unit test focus area with tests for "Pino child logger enrichment, missing span handling (no crash), traceId format." However, Phase 5 tasks only include T012-37 ("Unit tests: telemetry.ts") and T012-38 ("Unit tests: MetricsService, ObservabilityService, PluginTargetsService"). `trace-context.ts` is not covered by either task.

T012-13 creates `trace-context.ts` (Phase 2) but its tests are orphaned — not assigned to any Phase 5 testing task.

**Impact**: `trace-context.ts` may ship without unit tests, potentially missing edge cases (missing span context, malformed traceId, concurrent request isolation).

**Resolution**: Either expand T012-37 description to explicitly include `trace-context.ts` tests, or add a dedicated T012-37b task (~1 pt).

---

#### I-304 — Contract test count (5) seems low for plugin metrics format validation

**Severity**: INFO
**Artifact**: plan.md §8.4

**Finding**: T012-42 allocates 5 contract tests for plugin `/metrics` format validation. Given ADR-030's requirements (Prometheus text exposition format, `http_requests_total` counter, `http_request_duration_seconds` histogram, label requirements, `sample_limit: 5000`), 5 tests may be thin. Recommended minimum: format validity, required counter presence, required histogram presence, label correctness, sample limit enforcement, empty metrics response, malformed response handling = 7 tests.

**Resolution**: Consider expanding to 7–8 contract tests. Low priority.

---

## Summary Table

| Dimension                  | CRITICALs | WARNINGs                | INFOs     | Verdict     |
| -------------------------- | --------- | ----------------------- | --------- | ----------- |
| 1. Spec-Plan Coherence     | 1 (C-101) | 2 (W-201, W-202)        | 1 (I-301) | BLOCKED     |
| 2. Plan-ADR Consistency    | 1 (C-102) | 1 (W-203)               | 0         | BLOCKED     |
| 3. Constitution Compliance | 1 (C-103) | 3 (W-204, W-205, W-206) | 1 (I-302) | BLOCKED     |
| 4. Backward Compatibility  | 0         | 0                       | 1 (I-303) | PASS        |
| 5. Security Posture        | 0         | 1 (W-207)               | 0         | CONDITIONAL |
| 6. UX-Spec Coherence       | 0         | 2 (W-208, W-209)        | 0         | CONDITIONAL |
| 7. Test Coverage           | 0         | 1 (W-210)               | 1 (I-304) | CONDITIONAL |
| **TOTAL**                  | **3**     | **10**                  | **4**     | **BLOCKED** |

---

## Sign-Off

### Verdict: **BLOCKED**

Three CRITICAL issues must be resolved before implementation can begin:

| ID        | Issue                                                                                       | Owner                     | Effort                                                   |
| --------- | ------------------------------------------------------------------------------------------- | ------------------------- | -------------------------------------------------------- |
| **C-101** | Frontend target app wrong in spec.md and plan.md (`apps/web` → `apps/super-admin`)          | Spec author + plan author | ~2h (32 path references in plan.md, 7 in spec.md)        |
| **C-102** | Missing `@opentelemetry/instrumentation-fastify` package in plan.md (required by ADR-026)   | Plan author               | ~15min (add to dep table + update T012-12, T012-17)      |
| **C-103** | `METRICS_AUTH_REQUIRED=false` env var violates Art. 5.1 (unauthenticated `/metrics` access) | Plan author               | ~15min (remove env var, document Prometheus Bearer auth) |

### Recommended Resolution Order

1. **C-103** (security — fastest fix, highest risk)
2. **C-102** (dependency gap — quick fix, blocks correct Phase 2 implementation)
3. **C-101** (app target — largest change, blocks all Phase 4 frontend work)

### Post-CRITICAL Recommendations

After CRITICAL issues are resolved, address WARNINGs before sprint planning:

- **W-201**: Fix stale overview text (5 min)
- **W-203**: Fix ADR task ID references (15 min)
- **W-205**: Add OpenAPI documentation task (5 min)
- **W-206**: Add feature flag task (5 min)
- **W-207**: Document injection prevention strategy (30 min)
- **W-210**: Add trace-context.ts to unit test task (5 min)

### Re-Review Trigger

Once all 3 CRITICALs are resolved, request re-review via `/forge-review`. If only CRITICALs are fixed and WARNINGs remain, the verdict upgrades to **APPROVED WITH CONDITIONS** (WARNINGs tracked as implementation TODOs).

---

_Review conducted by forge-reviewer (claude-opus-4.6) on March 7, 2026._
_Protocol: adversarial-review + constitution-compliance + ux-review (7 dimensions)._
_Anti-sycophancy: All 17 issues represent genuine cross-artifact inconsistencies or compliance gaps verified against source files._
