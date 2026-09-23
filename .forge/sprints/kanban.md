# Kanban Board — Plexica v2

> Lightweight kanban. No ceremonies. Ship features, track progress, adjust scope.

**Status**: Sprint 6 IN PROGRESS — Sprint 7 NEXT
**Timeline**: 14-18 weeks remaining (~4 months), 1 developer full-time
**WIP Limit**: 2 features in progress max per developer
**Velocity scale**: Normalized S/M/L (S=1, M=2, L=3 pts) since Sprint 6 — see `.forge/sprints/velocity.md`

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
| Sprint 6 | 006  | 3     | Cross-Cutting: notifications (SSE), i18n (IT/EN), user profile, observability |
| Sprint 7 | 007  | 2-3   | Consolidation: E2E suite, perf audit, security hardening, docs, release candidate    |

**Risk buffer**: Sprint 5 (Super Admin) is simpler than Sprint 4 — single-page admin UI, existing data models, no new infra.
Sprint 6 (Cross-Cutting) and Sprint 7 (Consolidation) are lower-risk.

---

## Current Sprint State

```
Sprint 1:  [✓] Done        (2026-03-31 → 2026-04-01)  39/39 tasks done  109/109 pts  — Spec 001
Sprint 2:  [✓] Done        (2026-04-01 → 2026-04-03)  68/68 tasks done  219/219 pts  — Spec 002
Sprint 3:  [✓] Done        (2026-04-08 → 2026-06-19) 134/134 tasks done  322/322 pts  — Spec 003
Sprint 4:  [✓] Done        (2026-06-26 → 2026-07-02)  30/30 features done  004-01 → 004-30  — Spec 004 (Plugin System)
Sprint 5:  [✓] Done        (2026-07-02 → 2026-07-31)  11/11 stories done   005-01 → 005-11  — Spec 005 (Super Admin)
Sprint 6:  [→] In Progress (2026-09-17 → 2026-10-08)   9/13 stories done   006-01 → 006-09  — Spec 006 (Cross-Cutting) — 19/27 pts earned
Sprint 7:  [ ] Not Started  — Spec 007
```

**Sprint 6 — Spec 006 (Cross-Cutting), normalized scale** — story list in
`.forge/sprints/active/sprint-006.yaml`. Progress as of 2026-09-23:
**9/13 stories done** (006-01..006-05 notifications + 006-06..006-09 i18n —
19 pts) via PRs #178, #180, #195, #196. Next: Phase 5 profile (006-10).

| Story | Title | Size | Pts | Status |
| ----- | ----- | ---- | --- | ------ |
| 006-01 | Real-time notification infrastructure (SSE) | L | 3 | done (2026-09-22) |
| 006-02 | Notification center UI | M | 2 | done (2026-09-22) |
| 006-03 | Email notifications with retry queue | M | 2 | done (2026-09-22) |
| 006-04 | Per-user notification preferences | M | 2 | done (2026-09-22) |
| 006-05 | Plugin notification emission via SDK | M | 2 | done (2026-09-22) |
| 006-06 | Full react-intl migration (no hardcoded strings) | L | 3 | done (2026-09-23) |
| 006-07 | Language switch (EN/IT) + locale-aware formatting | M | 2 | done (2026-09-23) |
| 006-08 | Plugin translation registration via SDK | M | 2 | done (2026-09-23) |
| 006-09 | Tenant translation overrides | S | 1 | done (2026-09-23) |
| 006-10 | Profile page + avatar | M | 2 | pending |
| 006-11 | Session management + password change | M | 2 | pending |
| 006-12 | Health check endpoint + structured logs | M | 2 | pending |
| 006-13 | Observability dashboards (Prometheus + Grafana + Kafka) | M | 2 | pending |

**Total**: 13 stories, 27 pts. **Progress**: 9/13 stories done (006-01..006-09,
notifications + i18n — 19 pts earned). **Remaining**: 4 stories, 8 pts (profile →
observability). Deferred to Sprint 7: OTel tracing (006-19, optional).

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

**Velocity tracking**: Normalized S/M/L story points (S=1, M=2, L=3) per
`.forge/sprints/velocity.md`. Baseline ≈ 8-9 pts/week (Sprints 4-5). Warn
when planned pts exceed 120% of baseline. Sprints 1-3 used task points,
Sprints 4-5 used flat 1pt-per-item — not comparable.

**Scope adjustment**: If a sprint runs over, carry incomplete items to next sprint.
Do not extend sprint duration — cut scope instead.

**No gold-plating**: Feature parity with v1 spec is the goal. Improvements come after v2.0 ships.
