# E06 — Cross-Cutting

| Field        | Value                                      |
| ------------ | ------------------------------------------ |
| Epic ID      | E06                                        |
| Title        | Cross-Cutting                              |
| Status       | In Progress                                |
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

| Story | Title | Size | Points |
| ----- | ----- | ---- | ------ |
| 006-01 | Real-time notification infrastructure (SSE) | L | 3 |
| 006-02 | Notification center UI | M | 2 |
| 006-03 | Email notifications with retry queue | M | 2 |
| 006-04 | Per-user notification preferences | M | 2 |
| 006-05 | Plugin notification emission via SDK | M | 2 |
| 006-06 | Full react-intl migration (no hardcoded strings) | L | 3 |
| 006-07 | Language switch (EN/IT) + locale-aware formatting | M | 2 |
| 006-08 | Plugin translation registration via SDK | M | 2 |
| 006-09 | Tenant translation overrides | S | 1 |
| 006-10 | Profile page + avatar | M | 2 |
| 006-11 | Session management + password change | M | 2 |
| 006-12 | Health check endpoint + structured logs | M | 2 |
| 006-13 | Observability dashboards (Prometheus + Grafana + Kafka) | M | 2 |

## Notes

- First epic planned entirely on the normalized S/M/L velocity scale.
- OpenTelemetry tracing (spec 006-19, optional) deferred to Sprint 7.