# E06 — Cross-Cutting

| Field        | Value                                      |
| ------------ | ------------------------------------------ |
| Epic ID      | E06                                        |
| Title        | Cross-Cutting                              |
| Status       | In Progress — notifications workstream done; i18n next |
| Linked Spec  | `006-cross-cutting-features`               |
| Spec Path    | `.forge/specs/006-cross-cutting-features/spec.md` |
| Linked Sprint| Sprint 6 (active)                          |

## Description

Horizontal capabilities spanning the entire platform: real-time
notifications (SSE + email), full internationalization (EN/IT) with plugin
and tenant translation support, user profile management (avatar, sessions,
password), and the production observability stack (health checks, structured
logs, Prometheus/Grafana, Kafka monitoring). Integrates with the plugin SDK
(E04) so plugins can emit notifications and register translations.

## Planned Stories

Full story list in `.forge/sprints/active/sprint-006.yaml`
(13 stories, 27 pts — S/M/L normalized scale).

| Story | Title | Size | Points | Status |
| ----- | ----- | ---- | ------ | ------ |
| 006-01 | Real-time notification infrastructure (SSE) | L | 3 | Done (2026-09-22) |
| 006-02 | Notification center UI | M | 2 | Done (2026-09-22) |
| 006-03 | Email notifications with retry queue | M | 2 | Done (2026-09-22) |
| 006-04 | Per-user notification preferences | M | 2 | Done (2026-09-22) |
| 006-05 | Plugin notification emission via SDK | M | 2 | Done (2026-09-22) |
| 006-06 | Full react-intl migration (no hardcoded strings) | L | 3 | In Progress (start) |
| 006-07 | Language switch (EN/IT) + locale-aware formatting | M | 2 | Pending |
| 006-08 | Plugin translation registration via SDK | M | 2 | Pending |
| 006-09 | Tenant translation overrides | S | 1 | Pending |
| 006-10 | Profile page + avatar | M | 2 | Pending |
| 006-11 | Session management + password change | M | 2 | Pending |
| 006-12 | Health check endpoint + structured logs | M | 2 | Pending |
| 006-13 | Observability dashboards (Prometheus + Grafana + Kafka) | M | 2 | Pending |

## Progress

Updated 2026-09-22. 5/13 stories done (006-01..006-05, notifications — 11 pts).

| Workstream | Stories | Tasks | Status |
| ---------- | ------- | ----- | ------ |
| Notifications (SSE + email + prefs + plugin emit) | 006-01..006-05 (11 pts) | Phases 1-3 (1.1-3.19) | Done — merged PR #178 (aba7900), #180 (c1abdc7), #195 (6f1923c) |
| Internationalization (react-intl, EN/IT, plugin + tenant translations) | 006-06..006-09 (8 pts) | Phase 4 (4.1-4.9) | Next — kickoff (006-06 started) |
| User Profile (page, avatar, sessions, password change) | 006-10..006-11 (4 pts) | Phase 5 (5.1-5.8) | Pending |
| Observability (health, logs, Prometheus/Grafana, Kafka) | 006-12..006-13 (4 pts) | Phase 6 (6.1-6.13) + 7 | Pending |

Delivery evidence: core-api unit 678 · web unit 73 · notification+admin INT 334 ·
5 new E2E specs green in CI (notification-sse, notification-center,
notification-email, notification-prefs, plugin-notification). Open issues:
#179 (flake E2E plugin-system ac-06-dlq/ac-02) + health probe flake note.

## Notes

- First epic planned entirely on the normalized S/M/L velocity scale.
- OpenTelemetry tracing (spec 006-19, optional) deferred to Sprint 7.
- Notifications workstream (006-01..006-05) delivered 2026-09-22 via PRs
  #178/#180/#195 (11 pts). Phase 4 i18n kickoff is the next step.