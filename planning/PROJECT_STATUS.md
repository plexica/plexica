# Plexica - Project Status

**Last Updated**: March 7, 2026  
**Current Phase**: Phase 3 — Plugin Observability  
**Current Milestone**: **Spec 012 - Plugin Observability** 🟡 (Draft spec complete — implementation not started)  
**Version**: 0.11.0

---

## 📊 Quick Overview

| Metric                       | Value                                                       | Status                   |
| ---------------------------- | ----------------------------------------------------------- | ------------------------ |
| **Current Focus**            | Spec 012 Plugin Observability — Sprint 007 next             | 🟡 Planning              |
| **Specs Complete**           | 11/12 (001–011 all merged)                                  | ✅ On track              |
| **Last Merge**               | Spec 010 Frontend Production Readiness (PR #59, Mar 2026)   | ✅ Merged                |
| **Sprint**                   | Sprint 006 closed Mar 3 — Sprint 007 not yet started        | 🟡 Between sprints       |
| **Backend MVP**              | Core + Multi-tenancy + Auth + Plugins + Admin + i18n        | ✅ **100% Complete**     |
| **Frontend MVP**             | Tenant App + Super Admin + Error Bounds + Theming + Widgets | ✅ **100% Complete**     |
| **Plugin System**            | Lifecycle + Container + Hooks + EventBus                    | ✅ **100% Complete**     |
| **Admin Interfaces**         | Super Admin + Tenant Admin (all screens + tests + a11y)     | ✅ **100% Complete**     |
| **i18n System**              | Backend + Frontend + Content-hashed URLs                    | ✅ **100% Complete**     |
| **Workspace Hierarchy**      | Materialised path + Templates + Plugin Hooks + FE           | ✅ **100% Complete**     |
| **Plugin Observability**     | Spec 012 draft — OTel + Prometheus + Loki + Grafana         | 🟡 **Draft (0% impl)**   |
| **Test Coverage (core-api)** | ~76.5% lines (target: 80%)                                  | 🟡 TD-001 (below target) |
| **Test Coverage (frontend)** | ~80%+ (Spec 010 Phase 4 complete)                           | ✅ Target met            |
| **Security Vulnerabilities** | 0 known                                                     | ✅ Excellent             |
| **Open Technical Debt**      | TD-001, TD-002, TD-004, TD-008                              | 🟡 4 items tracked       |

---

## 🎯 Current Work: Spec 012 — Plugin Observability

### Status: 📝 Draft — Sprint 007 Planning Required

**Spec**: `.forge/specs/012-plugin-observability/spec.md`  
**Plan**: `.forge/specs/012-plugin-observability/plan.md` (45 tasks, ~158 story points)  
**ADRs**: ADR-026 (OTel/Tempo), ADR-027 (prom-client), ADR-028 (Promtail/Loki), ADR-029 (recharts), ADR-030 (plugin metrics contract)

### What This Spec Delivers

| Area                         | Technology                        | Key Outcome                                                               |
| ---------------------------- | --------------------------------- | ------------------------------------------------------------------------- |
| **Distributed Tracing**      | OpenTelemetry SDK + Grafana Tempo | End-to-end trace visibility across plugins                                |
| **Platform Metrics**         | prom-client + Prometheus          | P95 latency, error rates, counters at `/metrics`                          |
| **Log Aggregation**          | Promtail → Loki                   | Structured log search with tenantId/pluginId                              |
| **Plugin Metrics**           | Prometheus exposition format      | Per-plugin health via `GET /api/v1/plugins/:id/metrics` (resolves TD-009) |
| **Observability Dashboards** | React + recharts                  | Super Admin dashboards for traces/metrics/logs/alerts                     |
| **Alert Engine**             | Prometheus alert rules + SSE      | In-app alerts for plugin health/error/latency                             |
| **Infrastructure**           | 5 new Docker Compose services     | Prometheus, Grafana, Tempo, Loki, Promtail                                |

### Plan Phases

| Phase | Name                                  | Tasks | Story Pts | Sprint Target |
| ----- | ------------------------------------- | ----- | --------- | ------------- |
| 1     | Infrastructure + Core Instrumentation | 10    | 35 pts    | Sprint 007    |
| 2     | Plugin Metrics Contract + Scraping    | 9     | 32 pts    | Sprint 007    |
| 3     | Log Aggregation                       | 7     | 25 pts    | Sprint 008    |
| 4     | Alert Engine                          | 9     | 33 pts    | Sprint 008    |
| 5     | Observability Dashboards (Frontend)   | 10    | 33 pts    | Sprint 009    |

**Total**: 45 tasks, ~158 story points, ~3 sprints

### Next Actions

1. `/forge-tasks` — generate `tasks.md` for Spec 012
2. `/forge-sprint` — start Sprint 007 targeting Phase 1–2 (~67 pts)
3. Begin implementation: Phase 1 OTel SDK + docker-compose services

---

## ✅ Completed Specs (001–011)

| Spec | Name                                | PR / Commit | Date         | Story Points |
| ---- | ----------------------------------- | ----------- | ------------ | ------------ |
| 001  | Core Platform Foundation            | Initial     | Jan 13, 2026 | —            |
| 002  | Authentication System (OAuth 2.0)   | Merged      | Feb 17, 2026 | 50 pts       |
| 003  | Event Bus + Message Bus             | Merged      | Jan 18, 2026 | —            |
| 004  | Plugin System (Lifecycle/Container) | PR #52      | Feb 24, 2026 | 92 pts       |
| 005  | Frontend Architecture (Module Fed)  | Merged      | Feb 26, 2026 | —            |
| 006  | i18n System (Backend + Frontend)    | Merged      | Feb 16, 2026 | 28 pts       |
| 007  | Core Services (Jobs, Search, Notif) | Merged      | Feb 28, 2026 | —            |
| 008  | Admin Interfaces (SA + TA + Tests)  | PR #56      | Mar 3, 2026  | 126 pts      |
| 009  | Workspace Management (Full)         | PR #57      | Mar 3, 2026  | 37 pts       |
| 010  | Frontend Production Readiness       | PR #59      | Mar 3, 2026  | 60 pts       |
| 011  | Workspace Hierarchy + Templates     | `8d2e47d`   | Mar 7, 2026  | 49 pts       |

---

## 🐛 Open Technical Debt

| ID     | Description                                                              | Severity | Target     |
| ------ | ------------------------------------------------------------------------ | -------- | ---------- |
| TD-001 | core-api test coverage at 76.5% — target 80%                             | MEDIUM   | Sprint 007 |
| TD-002 | auth/tenant/workspace modules need 85% coverage (Constitution Art. 4.1)  | HIGH     | Q1 2026    |
| TD-004 | 24 integration tests deferred (oauth-flow + ws-resources rewrite)        | MEDIUM   | Sprint 008 |
| TD-008 | Module Federation widget contract tests deferred (Constitution Art. 8.1) | MEDIUM   | Sprint 010 |

---

## 📋 Sprint History

| Sprint   | Name / Focus                              | Velocity         | Closed          |
| -------- | ----------------------------------------- | ---------------- | --------------- |
| Sprint 1 | i18n Backend (Spec 006)                   | 23/28 pts (82%)  | Feb 15, 2026    |
| Sprint 2 | i18n Frontend (Spec 006)                  | 5/5 pts (100%)   | Feb 16, 2026    |
| Sprint 3 | Workspace Foundation (Spec 009)           | 24/24 pts (100%) | Feb 17, 2026    |
| Sprint 4 | Security hardening + Spec 010 phases 1–3  | 31/31 pts (100%) | Feb 21, 2026    |
| Sprint 5 | Spec 010 phases 4–5 + Spec 011 phases 1–3 | 49/49 pts (100%) | Feb 28, 2026    |
| Sprint 6 | Spec 004 + 008 backend + final reviews    | 92/92 pts (100%) | Mar 3, 2026     |
| Sprint 7 | Spec 012 Plugin Observability (Phase 1–2) | — / ~67 pts      | **Not started** |

**Average velocity (last 6 sprints)**: ~37 pts/sprint  
**All-time story points delivered**: ~442 pts

---

## 🏗 Architecture Summary

### Technology Stack (Active)

| Layer              | Technology                        | Status      |
| ------------------ | --------------------------------- | ----------- |
| Runtime            | Node.js 20 + TypeScript 5.9       | ✅ Active   |
| Backend            | Fastify 5.7                       | ✅ Active   |
| Frontend           | React 19 + Vite + TanStack Router | ✅ Active   |
| Database           | PostgreSQL 15 + Prisma 6.8        | ✅ Active   |
| Auth               | Keycloak 26                       | ✅ Active   |
| Cache              | Redis / ioredis                   | ✅ Active   |
| Object Storage     | MinIO                             | ✅ Active   |
| Event Bus          | Redpanda + KafkaJS                | ✅ Active   |
| Testing            | Vitest 4 + Playwright             | ✅ Active   |
| Logging            | Pino (backend + browser)          | ✅ Active   |
| a11y Testing       | vitest-axe + @axe-core/playwright | ✅ Active   |
| Tracing (planned)  | OpenTelemetry SDK + Grafana Tempo | 🟡 Spec 012 |
| Metrics (planned)  | prom-client + Prometheus          | 🟡 Spec 012 |
| Logs (planned)     | Promtail + Grafana Loki           | 🟡 Spec 012 |
| Dashboards (plan.) | recharts                          | 🟡 Spec 012 |

### Key ADRs (All Accepted)

| ADR | Decision                                                 |
| --- | -------------------------------------------------------- |
| 013 | Materialised Path for workspace hierarchy                |
| 014 | WorkspacePlugin scoping (separate table)                 |
| 017 | ABAC — team roles can only restrict, not expand          |
| 018 | Plugin lifecycle status separate from marketplace status |
| 019 | Pluggable ContainerAdapter interface                     |
| 020 | Self-hosted fonts via MinIO (GDPR + CSP)                 |
| 021 | Pino browser transport in frontend                       |
| 022 | axe-core ecosystem for a11y testing                      |
| 023 | SSE for real-time notifications                          |
| 024 | Team member roles subordinate to Keycloak RBAC           |
| 025 | audit_logs in core schema (bounded exception)            |
| 026 | OTel SDK + direct OTLP/gRPC export to Tempo              |
| 027 | prom-client for core platform metrics                    |
| 028 | Promtail → Loki log ingestion                            |
| 029 | recharts for observability dashboards                    |
| 030 | Plugin metrics in Prometheus exposition format           |
