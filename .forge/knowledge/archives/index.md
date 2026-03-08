# Decision Log Archives Index

> Master index of all archived decision log entries.
> Active log: [../decision-log.md](../decision-log.md)

---

## 2026

### March 2026 (20 entries archived)

- **File**: [2026-03/decisions-2026-03.md](2026-03/decisions-2026-03.md)
- **Archived**: March 2, 2026 (initial) + March 8, 2026 (19 entries appended)
- **Topics**: Route unit test RBAC mock pattern, Spec 006 closure, ADR-021 through ADR-030 (observability stack), resolved TDs 005/006/007/009/010/012/013/014/015/016/017/018
- **Key decisions**:
  - TD-011 CLOSED: `requireRole` missing from auth mock in 5 unit test files — 63 test failures fixed; standing pattern documented
  - Spec 006 (i18n System) CLOSED: all 229 i18n tests passing; 10 test failures fixed (schema edge cases, displayName field, optionalAuthMiddleware)
  - ADR-026..030 ACCEPTED: Full observability stack — OpenTelemetry/Tempo, prom-client, Promtail/Loki, recharts, Prometheus plugin metrics contract
  - ADR-021 ACCEPTED: Pino browser transport for frontend error boundary structured logging
  - ADR-022 ACCEPTED: axe-core ecosystem (vitest-axe + @axe-core/playwright) for WCAG 2.1 AA automation
  - ADR-024 ACCEPTED: Application-level team member roles subordinate to Keycloak RBAC
  - ADR-025 ACCEPTED: `audit_logs` in core schema as bounded exception to ADR-002 (5 safeguards)
  - TDs 005/006/007/009/010/012/013/014/015/016/017/018 all CLOSED March 7–8, 2026

### February 2026 (25 entries archived)

- **File**: [2026-02/decisions-2026-02.md](2026-02/decisions-2026-02.md)
- **Archived**: February 19, 2026 (initial) + TD-003 appended March 2, 2026 + 5 entries appended March 8, 2026
- **Topics**: Security vulnerability remediation, E2E test remediation, CI pipeline, Keycloak 401 fix, integration test fixes, unit test stabilization, auth test stabilization, workspace tests, Spec 002 completion, Spec 009 completion, Sprint 2 security review, keycloak.service.ts coverage, ADR-023 (SSE), ADR-020 (font hosting), ADR-018/019 (plugin lifecycle + container adapter), Spec 011 plan, workspace-resources test mismatch
- **Key decisions**:
  - Security: 19 vulnerabilities patched (10 on Feb 19 + 9 on Feb 17), 0 audit findings
  - E2E: 184/184 actionable tests passing (100%)
  - Integration: 341/366 tests passing (93.2%)
  - Unit: 1,239/1,239 tests passing (100%)
  - Auth: 385/385 unit tests passing (100%)
  - Spec 002 (Authentication) — COMPLETE
  - Spec 009 (Workspace Management) / Sprint 3 — COMPLETE
  - Fastify serialization fix: `handleServiceError()` pattern
  - TD-003 CLOSED: keycloak.service.ts coverage raised from 2.83% → 96.1% (Feb 23)
  - ADR-023 ACCEPTED: SSE via `GET /api/v1/notifications/stream` with Redis pub/sub fan-out
  - ADR-020 ACCEPTED: Self-hosted WOFF2 font library via MinIO; `font-src 'self'` CSP; GDPR-safe
  - ADR-018/019 ACCEPTED: Separate `lifecycleStatus` column + pluggable `ContainerAdapter` interface
  - Spec 011 plan complete: materialised path (ADR-013), workspace_plugins scoping (ADR-014), perf analysis
  - workspace-resources.integration.test.ts mismatch documented (tracked as TD-004)

---

## 2025 and Earlier

- **File**: [decision-log-2025.md](decision-log-2025.md)
- Historical decisions prior to 2026

---

_Last updated: March 8, 2026_
