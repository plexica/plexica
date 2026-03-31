# Spec 006: Cross-Cutting Features

**Phase**: 5 — Cross-Cutting Features
**Duration**: 3-4 weeks
**Status**: Draft
**Date**: March 2026

---

## Overview

This phase delivers the horizontal capabilities that span the entire platform:
real-time notifications (SSE + email), full internationalization with language
switching, user profile management, and the production observability stack.
These features integrate with the plugin system (Spec 004) so that plugins can
emit notifications and register their own translations.

## Dependencies

| Spec                | Requirement                                         |
| ------------------- | --------------------------------------------------- |
| 002 — Foundations   | Auth, tenant context, base frontend shell           |
| 003 — Core Features | Workspace, team, role models (notification targets) |
| 004 — Plugin System | Plugin SDK hooks for notifications and i18n bundles |

---

## Features

### 6.1 Notifications (1.5 weeks)

| ID     | Feature                                  | E2E Test                                                          |
| ------ | ---------------------------------------- | ----------------------------------------------------------------- |
| 006-01 | Real-time in-app notifications (SSE)     | User receives notification when invited to a workspace            |
| 006-02 | Notification center (list, mark as read) | User opens notification center, marks notification as read        |
| 006-03 | Email notifications                      | Workspace invite arrives via email (Mailpit in test)              |
| 006-04 | Per-user notification preferences        | User chooses which notifications to receive (in-app, email, both) |
| 006-05 | Plugins can generate notifications       | CRM plugin emits notification on new contact                      |

### 6.2 Full Internationalization (1 week)

| ID     | Feature                                     | E2E Test                                               |
| ------ | ------------------------------------------- | ------------------------------------------------------ |
| 006-06 | All frontend strings from react-intl        | No hardcoded strings (started in Phase 1)              |
| 006-07 | Language switch (English / Italian)         | User changes language, entire interface updates        |
| 006-08 | Locale-aware date/number formatting         | Dates and numbers display in correct format for locale |
| 006-09 | Plugins can register their own translations | CRM plugin has EN/IT translations loaded via SDK       |
| 006-10 | Tenant translation overrides                | Tenant admin customizes specific translation strings   |

### 6.3 User Profile (0.5 weeks)

| ID     | Feature                                    | E2E Test                                                 |
| ------ | ------------------------------------------ | -------------------------------------------------------- |
| 006-11 | Profile page with personal data            | User views and edits name, email                         |
| 006-12 | Avatar (from Keycloak JWT `picture` claim) | User avatar displayed in header and profile              |
| 006-13 | Active session management                  | User sees active sessions, can terminate them            |
| 006-14 | Password change                            | Redirect to Keycloak account console for password change |

### 6.4 Observability (1 week)

| ID     | Feature                                         | E2E Test                                              |
| ------ | ----------------------------------------------- | ----------------------------------------------------- |
| 006-15 | Health check endpoint (`/health`)               | Endpoint checks DB, Redis, Keycloak, Kafka            |
| 006-16 | Structured logs (Pino JSON) with correlation ID | Logs parseable with `requestId`, `tenantId`, `userId` |
| 006-17 | Prometheus metrics (`/metrics`)                 | HTTP latency, error rate, Kafka consumer lag exported |
| 006-18 | Base Grafana dashboard                          | Pre-configured dashboard with key platform metrics    |
| 006-19 | OpenTelemetry tracing (optional, feature flag)  | Distributed tracing activatable in staging/prod       |
| 006-20 | Kafka monitoring dashboard                      | Consumer lag per plugin, DLQ size, event throughput   |

---

## Acceptance Criteria

- [ ] Real-time notifications work end-to-end (SSE connection + email delivery)
- [ ] Notification center lists notifications with read/unread state
- [ ] Per-user notification preferences persist and are respected
- [ ] Plugins can emit notifications via the SDK
- [ ] Full i18n with language switch (EN/IT) — no page reload required
- [ ] Locale-aware formatting for dates, numbers, and currency
- [ ] Plugin translations load through SDK registration
- [ ] Tenant admin can override specific translation keys
- [ ] User profile page: view/edit name, avatar display, session list
- [ ] Password change redirects to Keycloak account console
- [ ] `/health` endpoint returns status of all dependencies
- [ ] `/metrics` endpoint exports Prometheus-compatible metrics
- [ ] Structured JSON logs include correlation ID, tenant ID, user ID
- [ ] Grafana dashboard importable and functional with base metrics
- [ ] All features verified by corresponding E2E tests

---

## Non-Functional Requirements

| Metric                                | Target                   |
| ------------------------------------- | ------------------------ |
| SSE connection establishment          | < 1 s                    |
| Notification delivery (event to UI)   | < 2 s                    |
| Language switch (full UI update)      | < 500 ms, no page reload |
| Health check response time            | < 200 ms                 |
| Prometheus scrape duration            | < 100 ms                 |
| Notification preferences save         | < 300 ms                 |
| Log write overhead on request latency | < 5 ms (async writes)    |

---

## Risks

| Risk                                     | Impact | Mitigation                                                                                     |
| ---------------------------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| SSE connection management at scale       | HIGH   | Per-tenant connection pools; max connections per user; heartbeat keepalive                     |
| Missing i18n translation keys at runtime | MEDIUM | Fallback to English default; CI lint rule that flags missing keys                              |
| Observability overhead on API latency    | MEDIUM | Sampling for OpenTelemetry tracing; async Pino log writes; feature-flag tracing off by default |
| Email delivery reliability in prod       | MEDIUM | Retry queue for failed sends; Mailpit for dev/test; dead-letter logging                        |
| Plugin notification spam                 | LOW    | Rate limit on plugin notification emission (max 10/min per plugin per user)                    |
