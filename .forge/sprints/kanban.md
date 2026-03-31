# Kanban Board — Plexica v2

> Lightweight kanban. No ceremonies. Ship features, track progress, adjust scope.

**Status**: Sprint 1 IN PROGRESS (started 2026-03-31)
**Timeline**: 25-27 weeks (~6 months), 1 developer full-time
**WIP Limit**: 2 features in progress max per developer

---

## Board Columns

| Todo | In Progress | Blocked | Done |
|------|-------------|---------|------|
| Not started | Actively being worked on (max 2) | Waiting on dependency/decision | E2E passing, CI green |

Complete current feature before pulling next. Blocked items need a reason logged here.

---

## Phase-to-Sprint Mapping

| Sprint | Phase | Spec | Weeks | Focus |
|--------|-------|------|-------|-------|
| Sprint 1 | Phase 0 | 001 | 1-2 | Infrastructure: monorepo, Docker, CI, DB, Keycloak |
| Sprint 2 | Phase 1a | 002 | 3-4 | Auth + Multi-tenancy (Keycloak, tenant isolation, RLS) |
| Sprint 3 | Phase 1b | 002 | 5-6 | Frontend Shell + Design System (React, TanStack Router, Tailwind) |
| Sprint 4 | Phase 2a | 003 | 7-8 | Workspace Management (CRUD, members, invitations) |
| Sprint 5 | Phase 2b | 003 | 9-10 | Users, Roles, ABAC (permission engine, role assignment) |
| Sprint 6 | Phase 2c | 003 | 11-12 | Tenant Settings + Phase 2 polish (branding, billing info, cleanup) |
| Sprint 7 | Phase 3a | 004 | 13-14 | Plugin Core + Module Federation (registry, lifecycle, remote loading) |
| Sprint 8 | Phase 3b | 004 | 15-16 | Kafka Events + Backend Proxy (event bus, plugin API proxy) |
| Sprint 9 | Phase 3c | 004 | 17-18 | CRM Plugin + Marketplace + CLI (reference plugin, install flow) |
| Sprint 10 | Phase 4 | 005 | 19-20 | Super Admin (tenant management, system metrics, user management) |
| Sprint 11 | Phase 5a | 006 | 21-22 | Notifications (SSE) + i18n (IT/EN, namespace loading) |
| Sprint 12 | Phase 5b | 006 | 23-24 | User Profile + Observability (OpenTelemetry, Grafana, Pino) |
| Sprint 13 | Phase 6 | 007 | 25-27 | Consolidation: E2E suite, perf audit, docs, release candidate |

**Risk buffer**: Sprints 7-9 (Plugin System) carry the highest complexity.
Allow 1-2 weeks buffer after Sprint 9 before starting Phase 4.

---

## Current Sprint State

```
Sprint 1:  [→] In Progress  (2026-03-31 → 2026-04-13)  0/39 tasks done  0/109 pts
Sprint 2:  [ ] Not Started
Sprint 3:  [ ] Not Started
Sprint 4:  [ ] Not Started
Sprint 5:  [ ] Not Started
Sprint 6:  [ ] Not Started
Sprint 7:  [ ] Not Started
Sprint 8:  [ ] Not Started
Sprint 9:  [ ] Not Started
Sprint 10: [ ] Not Started
Sprint 11: [ ] Not Started
Sprint 12: [ ] Not Started
Sprint 13: [ ] Not Started
```

First sprint begins when the new repository is bootstrapped.

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

**Velocity tracking**: Count features completed per sprint. After Sprint 2,
use actual velocity to adjust scope for remaining sprints.

**Scope adjustment**: If a sprint runs over, carry incomplete items to next sprint.
Do not extend sprint duration — cut scope instead.

**No gold-plating**: Feature parity with v1 spec is the goal. Improvements come after v2.0 ships.
