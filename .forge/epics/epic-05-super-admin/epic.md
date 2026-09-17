# E05 — Super Admin

| Field        | Value                                      |
| ------------ | ------------------------------------------ |
| Epic ID      | E05                                        |
| Title        | Super Admin                                |
| Status       | Complete                                   |
| Linked Spec  | `005-super-admin`                          |
| Spec Path    | `.forge/specs/005-super-admin/spec.md`     |
| Linked Sprint| Sprint 5                                   |

## Description

The dedicated super-admin application: platform dashboard with metrics,
tenant lifecycle management (provision, suspend, reactivate, GDPR delete),
plugin catalog management, system health check, Kafka status + DLQ
visibility, and filterable system logs. Delivered 11/11 stories with the
first formal sprint close and retrospective in the project.

## Linked Stories

Full story list in `.forge/sprints/completed/2026-07-02-sprint-005.yaml`
(11 stories, 11 pts — flat 1pt-per-story scale, pre-normalization).

| Story | Title | Status |
| ----- | ----- | ------ |
| 005-01 | Dashboard with platform metrics | done |
| 005-02 | Tenant list with search and filters | done |
| 005-03 | Tenant detail (info, users, plugins, audit) | done |
| 005-04 | Tenant provisioning wizard | done |
| 005-05 | Tenant suspension | done |
| 005-06 | Tenant reactivation | done |
| 005-07 | Tenant deletion (GDPR saga) | done |
| 005-08 | Plugin catalog management | done |
| 005-09 | System health check | done |
| 005-10 | Filterable system logs | done |
| 005-11 | Kafka status (consumer lag, DLQ size) | done |

## Notes

- First sprint with an epic-linked retrospective (sprint-005.md) and the
  source of the velocity normalization + epic tracking action items.
- Post-epic follow-up: Spec 012 (PR #77 review fixes) applies to the admin
  PKCE auth work shipped here — see `.forge/epics/README.md`.