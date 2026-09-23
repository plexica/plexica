# E06 — Cross-Cutting

| Field        | Value                                      |
| ------------ | ------------------------------------------ |
| Epic ID      | E06                                        |
| Title        | Cross-Cutting                              |
| Status       | In Progress — notifications + i18n workstreams done; profile next |
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
| 006-06 | Full react-intl migration (no hardcoded strings) | L | 3 | Done (2026-09-23) |
| 006-07 | Language switch (EN/IT) + locale-aware formatting | M | 2 | Done (2026-09-23) |
| 006-08 | Plugin translation registration via SDK | M | 2 | Done (2026-09-23) |
| 006-09 | Tenant translation overrides | S | 1 | Done (2026-09-23) |
| 006-10 | Profile page + avatar | M | 2 | Pending |
| 006-11 | Session management + password change | M | 2 | Pending |
| 006-12 | Health check endpoint + structured logs | M | 2 | Pending |
| 006-13 | Observability dashboards (Prometheus + Grafana + Kafka) | M | 2 | Pending |

## Progress

Updated 2026-09-23. 9/13 stories done (006-01..006-09 — 19 pts).

| Workstream | Stories | Tasks | Status |
| ---------- | ------- | ----- | ------ |
| Notifications (SSE + email + prefs + plugin emit) | 006-01..006-05 (11 pts) | Phases 1-3 (1.1-3.19) | Done — merged PR #178 (aba7900), #180 (c1abdc7), #195 (6f1923c) |
| Internationalization (react-intl, EN/IT, plugin + tenant translations) | 006-06..006-09 (8 pts) | Phase 4 (4.1-4.9) | Done — merged PR #196 (2026-09-23) |
| User Profile (page, avatar, sessions, password change) | 006-10..006-11 (4 pts) | Phase 5 (5.1-5.8) | Pending |
| Observability (health, logs, Prometheus/Grafana, Kafka) | 006-12..006-13 (4 pts) | Phase 6 (6.1-6.13) + 7 | Pending |

Delivery evidence (notifications): core-api unit 678 · web unit 73 ·
notification+admin INT 334 · 5 E2E specs green in CI (notification-sse,
notification-center, notification-email, notification-prefs,
plugin-notification). Open issues: #179 (flake E2E plugin-system
ac-06-dlq/ac-02) + health probe flake note.

Delivery evidence (i18n, PR #196): web unit 111 · core-api unit 688 ·
3 i18n E2E specs green in CI (i18n-language-switch, plugin-translations,
tenant-translation-overrides).

## Notes

- First epic planned entirely on the normalized S/M/L velocity scale.
- OpenTelemetry tracing (spec 006-19, optional) deferred to Sprint 7.
- Notifications workstream (006-01..006-05) delivered 2026-09-22 via PRs
  #178/#180/#195 (11 pts). Phase 4 i18n workstream (006-06..006-09) delivered
  2026-09-23 via PR #196 (8 pts); Phase 5 profile is next.