# E02 — Foundations

| Field        | Value                                      |
| ------------ | ------------------------------------------ |
| Epic ID      | E02                                        |
| Title        | Foundations                                |
| Status       | Complete                                   |
| Linked Spec  | `002-foundations`                          |
| Spec Path    | `.forge/specs/002-foundations/spec.md`     |
| Linked Sprint| Sprint 2                                   |

## Description

Platform foundations: JWT authentication with Keycloak, multi-tenancy
(tenant context middleware), tenant provisioning, the base frontend shell
with sidebar, and the tenant dashboard. Establishes the auth and tenant
isolation patterns that all core features and plugins rely on.

## Linked Stories

Full story list in `.forge/sprints/completed/2026-04-03-sprint-002.yaml`
(68 task-scale items, 219 task pts — pre-normalization scale).

| Story | Title | Status |
| ----- | ----- | ------ |
| 002-* | JWT auth, tenant context, provisioning, shell, dashboard | done |

## Notes

- Tracked at task granularity (pre-velocity-normalization).
- Keycloak multi-realm and schema-per-tenant decisions locked here
  (ADR-001, ADR-002).