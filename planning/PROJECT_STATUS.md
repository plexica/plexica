# Plexica - Project Status

**Last Updated**: March 8, 2026  
**Current Phase**: Phase 4 — Extension Points ✅ Complete  
**Current Milestone**: **Spec 013 Complete** ✅  
**Version**: 0.13.0

---

## 📊 Quick Overview

| Metric                       | Value                                                       | Status               |
| ---------------------------- | ----------------------------------------------------------- | -------------------- |
| **Current Focus**            | Spec 013 Extension Points — ✅ Complete (Sprint 010)        | ✅ Done              |
| **Specs Complete**           | 13/13 (001–013 all merged)                                  | ✅ All complete      |
| **Last Merge**               | Spec 013 Extension Points (Sprint 010, Mar 2026)            | ✅ Merged            |
| **Sprint**                   | Sprint 010 closed Mar 8, 2026 — 85/85 pts (100%)            | ✅ Closed            |
| **Backend MVP**              | Core + Multi-tenancy + Auth + Plugins + Admin + i18n        | ✅ **100% Complete** |
| **Frontend MVP**             | Tenant App + Super Admin + Error Bounds + Theming + Widgets | ✅ **100% Complete** |
| **Plugin System**            | Lifecycle + Container + Hooks + EventBus + Extension Points | ✅ **100% Complete** |
| **Admin Interfaces**         | Super Admin + Tenant Admin (all screens + tests + a11y)     | ✅ **100% Complete** |
| **i18n System**              | Backend + Frontend + Content-hashed URLs                    | ✅ **100% Complete** |
| **Workspace Hierarchy**      | Materialised path + Templates + Plugin Hooks + FE           | ✅ **100% Complete** |
| **Plugin Observability**     | OTel + Prometheus + Loki + Grafana + Dashboard              | ✅ **100% Complete** |
| **Extension Points**         | Slots + Contributions + Visibility + DataExtensions + SDK   | ✅ **100% Complete** |
| **Test Coverage (core-api)** | ≥80% lines (TD-001 resolved by Sprint 009 tests)            | ✅ Target met        |
| **Test Coverage (frontend)** | ~80%+ (Spec 010 Phase 4 complete)                           | ✅ Target met        |
| **Security Vulnerabilities** | 0 known                                                     | ✅ Excellent         |
| **Open Technical Debt**      | TD-002, TD-004, TD-008, TD-019, TD-020                      | 🟡 5 items tracked   |

---

## ✅ Completed Specs (001–013)

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
| 012  | Plugin Observability                | Sprint 7–9  | Apr 11, 2026 | 158 pts      |
| 013  | Extension Points                    | Sprint 010  | Mar 8, 2026  | 85 pts       |

---

## 🐛 Open Technical Debt

| ID     | Description                                                              | Severity | Target      |
| ------ | ------------------------------------------------------------------------ | -------- | ----------- |
| TD-002 | auth/tenant/workspace modules need 85% coverage (Constitution Art. 4.1)  | HIGH     | Q2 2026     |
| TD-004 | 24 integration tests deferred (oauth-flow + ws-resources rewrite)        | MEDIUM   | Next sprint |
| TD-008 | Module Federation widget contract tests deferred (Constitution Art. 8.1) | MEDIUM   | Next sprint |
| TD-019 | Spec 013 E2E tests not yet Playwright-based (Constitution Art. 8.1)      | MEDIUM   | Sprint 011  |
| TD-020 | Force-uninstall path missing `removeTarget()` → stale Prometheus targets | LOW      | Sprint 011  |

> **TD-001 resolved**: Overall core-api test coverage reached ≥80% via the 80+ new tests
> added in Spec 012 Phase 5 (Sprint 009 T012-34..T012-42). CI threshold now passing.

---

## 📋 Sprint History

| Sprint    | Name / Focus                                       | Velocity         | Closed       |
| --------- | -------------------------------------------------- | ---------------- | ------------ |
| Sprint 1  | i18n Backend (Spec 006)                            | 23/28 pts (82%)  | Feb 15, 2026 |
| Sprint 2  | i18n Frontend (Spec 006)                           | 5/5 pts (100%)   | Feb 16, 2026 |
| Sprint 3  | Workspace Foundation (Spec 009)                    | 24/24 pts (100%) | Feb 17, 2026 |
| Sprint 4  | Security hardening + Spec 010 phases 1–3           | 31/31 pts (100%) | Feb 21, 2026 |
| Sprint 5  | Spec 010 phases 4–5 + Spec 011 phases 1–3          | 49/49 pts (100%) | Feb 28, 2026 |
| Sprint 6  | Spec 004 + 008 backend + final reviews             | 92/92 pts (100%) | Mar 3, 2026  |
| Sprint 7  | Spec 012 Phase 1–2 (OTel + prom-client + scraping) | 61/61 pts (100%) | Mar 21, 2026 |
| Sprint 8  | Spec 012 Phase 3–4 (Loki + Alert Engine)           | 24/24 pts (100%) | Mar 30, 2026 |
| Sprint 9  | Spec 012 Phase 4–5 (Dashboard + Tests + Docs)      | 77/77 pts (100%) | Apr 11, 2026 |
| Sprint 10 | Spec 013 Extension Points (all 5 phases)           | 85/85 pts (100%) | Mar 8, 2026  |

**Average velocity (last 10 sprints)**: ~49 pts/sprint  
**All-time story points delivered**: ~685 pts

---

## 🏗 Architecture Summary

### Technology Stack (Active)

| Layer           | Technology                        | Status    |
| --------------- | --------------------------------- | --------- |
| Runtime         | Node.js 20 + TypeScript 5.9       | ✅ Active |
| Backend         | Fastify 5.7                       | ✅ Active |
| Frontend        | React 19 + Vite + TanStack Router | ✅ Active |
| Database        | PostgreSQL 15 + Prisma 6.8        | ✅ Active |
| Auth            | Keycloak 26                       | ✅ Active |
| Cache           | Redis / ioredis                   | ✅ Active |
| Object Storage  | MinIO                             | ✅ Active |
| Event Bus       | Redpanda + KafkaJS                | ✅ Active |
| Testing         | Vitest 4 + Playwright             | ✅ Active |
| Logging         | Pino (backend + browser)          | ✅ Active |
| a11y Testing    | vitest-axe + @axe-core/playwright | ✅ Active |
| Tracing         | OpenTelemetry SDK + Grafana Tempo | ✅ Active |
| Metrics         | prom-client + Prometheus          | ✅ Active |
| Log Aggregation | Promtail + Grafana Loki           | ✅ Active |
| Dashboards      | recharts (super-admin)            | ✅ Active |

### Key ADRs (All Accepted)

| ADR | Decision                                                   |
| --- | ---------------------------------------------------------- |
| 013 | Materialised Path for workspace hierarchy                  |
| 014 | WorkspacePlugin scoping (separate table)                   |
| 017 | ABAC — team roles can only restrict, not expand            |
| 018 | Plugin lifecycle status separate from marketplace status   |
| 019 | Pluggable ContainerAdapter interface                       |
| 020 | Self-hosted fonts via MinIO (GDPR + CSP)                   |
| 021 | Pino browser transport in frontend                         |
| 022 | axe-core ecosystem for a11y testing                        |
| 023 | SSE for real-time notifications                            |
| 024 | Team member roles subordinate to Keycloak RBAC             |
| 025 | audit_logs in core schema (bounded exception)              |
| 026 | OTel SDK + direct OTLP/gRPC export to Tempo                |
| 027 | prom-client for core platform metrics                      |
| 028 | Promtail → Loki log ingestion                              |
| 029 | recharts for observability dashboards                      |
| 030 | Plugin metrics in Prometheus exposition format             |
| 031 | Extension tables in core shared schema (bounded exception) |
