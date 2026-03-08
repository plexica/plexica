# Decision Log

> This document tracks architectural decisions, technical debt, deferred
> decisions, and implementation notes that don't warrant a full ADR.

**Last Updated**: March 8, 2026 (ADR-031 added; Spec 013 plan completed)

> **Archive Notice**: Completed decisions from February 2026 have been moved to
> [archives/2026-02/decisions-2026-02.md](./archives/2026-02/decisions-2026-02.md).
> March 2026 closed entries: [archives/2026-03/decisions-2026-03.md](./archives/2026-03/decisions-2026-03.md).
> Historical decisions from 2025 and earlier: [archives/decision-log-2025.md](./archives/decision-log-2025.md)

---

## Active Decisions

### Technical Debt

| ID     | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Impact  | Severity | Tracked In              | Target Sprint                |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | -------- | ----------------------- | ---------------------------- |
| TD-001 | Test coverage at 76.5%, target 80%                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Quality | MEDIUM   | CI report 2026-02-18    | Next Sprint                  |
| TD-002 | Core modules (auth, tenant, workspace) need 85% coverage                                                                                                                                                                                                                                                                                                                                                                                                                                               | Quality | HIGH     | `AGENTS.md`             | Q1 2026                      |
| TD-004 | 24 integration tests deferred (oauth-flow + ws-resources). Root cause documented in [archives/2026-02/decisions-2026-02.md](./archives/2026-02/decisions-2026-02.md) — "workspace-resources.integration.test.ts Architecture Mismatch" entry.                                                                                                                                                                                                                                                          | Quality | MEDIUM   | CI report 2026-02-18    | Sprint 5                     |
| TD-008 | Contract tests for Module Federation widget API surface deferred — Constitution Art. 8.1 requires contract tests for plugin-to-core API interactions; Pact/contract tests for widget remote module interfaces deferred to Spec 010 Phase 3 or a dedicated testing spec                                                                                                                                                                                                                                 | Quality | MEDIUM   | Spec 005 plan §9.4      | Sprint 10 (Spec 010 Phase 3) |
| TD-019 | Spec 012 E2E tests not yet implemented — Constitution Art. 8.1 requires E2E tests for critical user flows; the Plugin Observability dashboard (FR-013, FR-014, FR-015, FR-028, FR-030, FR-031) has no Playwright E2E coverage. Unit and integration tests exist (T012-34..T012-37) but full user-journey E2E (open dashboard, view metrics, filter logs, view trace) is deferred. Risk: a wiring regression between frontend chart components and backend routes would not be caught.                  | Quality | MEDIUM   | forge-review 2026-03-08 | Sprint 011 (post-Spec 012)   |
| TD-020 | Force-uninstall lifecycle status mismatch — Spec 012 plan.md T012-18 assumes plugins reach `PluginLifecycleStatus.ACTIVE` before being scraped; however Spec 004 US-002 (force-uninstall) sets `lifecycleStatus = UNINSTALLED` directly from `ACTIVE` without transitioning through `DEACTIVATED`. `PluginTargetsService.removeTarget()` is not called in the force-uninstall path, leaving stale Prometheus scrape targets in `plugins.json`. Needs explicit `removeTarget()` call + regression test. | Quality | LOW      | forge-review 2026-03-08 | Sprint 011                   |

### Deferred Decisions

| ID     | Decision                             | Reason Deferred                          | Revisit Date | Context               |
| ------ | ------------------------------------ | ---------------------------------------- | ------------ | --------------------- |
| DD-001 | GraphQL API layer                    | Focus on REST first; evaluate after v1.0 | Q2 2026      | Plugin API evolution  |
| DD-002 | Real-time collaboration (WebSockets) | Core platform stability priority         | Q2 2026      | Future plugin feature |

---

### Spec 010: Frontend Production Readiness — IN PROGRESS (February 17, 2026)

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

### Spec 013: Extension Points — PLAN COMPLETE (March 8, 2026)

**Date**: March 8, 2026
**Context**: Plugin extension points system — UI extension slots, data model extensions, and extension registry

**Status**: ✅ spec done, ✅ plan done — implementation **NOT STARTED**

**ADR-031**: Extension Tables Core Shared Schema — bounded exception to ADR-002 (schema-per-tenant), following ADR-025 pattern. 5 extension tables (`extension_slots`, `extension_contributions`, `workspace_extension_visibility`, `extensible_entities`, `data_extensions`) placed in core shared schema because cross-plugin slot resolution requires core visibility. 5 mandatory safeguards: single `ExtensionRegistryRepository` access path, required `tenantId` parameter, explicitly-named Super Admin cross-tenant methods with role check, PostgreSQL RLS defense-in-depth, code review gate on repository changes.

**Plan Summary**:

- **Total tasks**: 29 (T013-01 through T013-29)
- **Total story points**: 85 pts
- **Phase 1 — Core Infrastructure**: T013-01..06, 23 pts
- **Phase 2 — Plugin SDK & API**: T013-07..10, 16 pts
- **Phase 3 — Frontend Components**: T013-11..19, 22 pts
- **Phase 4 — Testing**: T013-20..25, 19 pts
- **Phase 5 — Migration & Docs**: T013-26..29, 5 pts

**Key Dependencies**: Spec 010 widget system (Phase 3 prerequisite), ADR-004/011 Module Federation

**Blocking Risks**: R-002 (Module Federation load failures in production), R-005 (cache invalidation race conditions)

**Specification**: `.forge/specs/013-extension-points/`

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
