# Kanban Board — Plexica v2

> Lightweight kanban. No ceremonies. Ship features, track progress, adjust scope.

**Status**: Sprint 3 IN PROGRESS (started 2026-04-08)
**Timeline**: 19-24 weeks remaining (~5 months), 1 developer full-time
**WIP Limit**: 2 features in progress max per developer

---

## Board Columns

| Todo        | In Progress                      | Blocked                        | Done                  |
| ----------- | -------------------------------- | ------------------------------ | --------------------- |
| Not started | Actively being worked on (max 2) | Waiting on dependency/decision | E2E passing, CI green |

Complete current feature before pulling next. Blocked items need a reason logged here.

---

## Sprint-to-Spec Mapping

One sprint per spec. Each spec delivers a self-contained, shippable increment.

| Sprint   | Spec | Weeks | Focus                                                                                |
| -------- | ---- | ----- | ------------------------------------------------------------------------------------ |
| Sprint 1 | 001  | 1-2   | Infrastructure: monorepo, Docker, CI, DB, Keycloak                                   |
| Sprint 2 | 002  | 2-3   | Foundations: JWT auth, multi-tenancy, tenant provisioning, frontend shell, dashboard |
| Sprint 3 | 003  | 4-5   | Core Features: workspaces, users/ABAC, tenant settings, audit log                    |
| Sprint 4 | 004  | 5-6   | Plugin System: registry, Module Federation, Kafka events, SDK, CRM plugin, CLI       |
| Sprint 5 | 005  | 2-3   | Super Admin: tenant management, plugin catalog, system monitoring                    |
| Sprint 6 | 006  | 3-4   | Cross-Cutting: notifications (SSE), i18n (IT/EN), user profile, observability        |
| Sprint 7 | 007  | 2-3   | Consolidation: E2E suite, perf audit, security hardening, docs, release candidate    |

**Risk buffer**: Sprint 4 (Plugin System) carries the highest complexity.
Allow 1 week buffer after Sprint 4 before starting Sprint 5.

---

## Current Sprint State

```
Sprint 1:  [✓] Done        (2026-03-31 → 2026-04-01)  39/39 tasks done  109/109 pts  — Spec 001
Sprint 2:  [✓] Done        (2026-04-01 → 2026-04-03)  68/68 tasks done  219/219 pts  — Spec 002
Sprint 3:  [→] In Progress  (2026-04-08 → 2026-04-22)   0/134 tasks done    0/322 pts  — Spec 003
Sprint 4:  [ ] Not Started  — Spec 004
Sprint 5:  [ ] Not Started  — Spec 005
Sprint 6:  [ ] Not Started  — Spec 006
Sprint 7:  [ ] Not Started  — Spec 007
```

---

## Definition of Done

A feature is **Done** when ALL of the following are true:

- [ ] E2E test passes (Playwright)
- [ ] Unit tests pass (Vitest)
- [ ] Integration tests pass
- [ ] Code review approved (or self-reviewed with checklist)
- [ ] CI pipeline green (lint, types, tests, coverage)
- [ ] No source file exceeds 200 lines
- [ ] Related docs updated if applicable

---

## Working Agreements

**WIP limits**: Max 2 items in progress. Finish or park before pulling new work.

**Blocked items**: Move to Blocked column. Log the reason and what unblocks it.
Revisit blocked items at the start of each week.

**Velocity tracking**: Count features completed per sprint. Use actual velocity
to adjust scope for remaining sprints after Sprint 3.

**Scope adjustment**: If a sprint runs over, carry incomplete items to next sprint.
Do not extend sprint duration — cut scope instead.

**No gold-plating**: Feature parity with v1 spec is the goal. Improvements come after v2.0 ships.
