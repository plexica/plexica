# E01 — Infrastructure

| Field        | Value                                      |
| ------------ | ------------------------------------------ |
| Epic ID      | E01                                        |
| Title        | Infrastructure                             |
| Status       | Complete                                   |
| Linked Spec  | `001-infrastructure-setup`                 |
| Spec Path    | `.forge/specs/001-infrastructure-setup/spec.md` |
| Linked Sprint| Sprint 1                                   |

## Description

Bootstrap of the entire development environment: pnpm monorepo, Docker
Compose stack (PostgreSQL, Keycloak, Redis, MinIO, Redpanda, Mailpit),
core database schema (tenant model), `@plexica/ui` design system foundation,
frontend shell, integration smoke tests, and the GitHub Actions CI pipeline.
This epic is the foundation every later epic builds on.

## Linked Stories

Full story list in `.forge/sprints/completed/2026-04-01-sprint-001.yaml`
(39 task-scale items, 109 task pts — pre-normalization scale).

| Story | Title | Status |
| ----- | ----- | ------ |
| 001-T01…T39 | Monorepo scaffold, Docker stack, Prisma core schema, design system, CI | done |

## Notes

- Tracked at task granularity (pre-velocity-normalization, Sprint 6 onward
  uses the S/M/L story scale).
- Post-epic follow-ups (specs 008–012) are noted in `.forge/epics/README.md`.