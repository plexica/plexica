# E04 — Plugin System

| Field        | Value                                      |
| ------------ | ------------------------------------------ |
| Epic ID      | E04                                        |
| Title        | Plugin System                              |
| Status       | Complete                                   |
| Linked Spec  | `004-plugin-system`                        |
| Spec Path    | `.forge/specs/004-plugin-system/spec.md`   |
| Linked Sprint| Sprint 4                                   |

## Description

The plugin platform: registry with manifest validation, container lifecycle
(Docker sidecar), Module Federation Vite preset + shell hosting, Kafka event
system with DLQ, backend proxy with auth injection, workspace visibility,
CLI scaffolding + SDK, the CRM example plugin, and the marketplace UI.
This epic's SDK and event bus are the integration points for plugin
notifications and plugin i18n bundles in Spec 006.

## Linked Stories

Full story list in `.forge/sprints/completed/2026-07-02-sprint-004.yaml`
(30 features, 30 feature pts — pre-normalization scale).

| Story | Title | Status |
| ----- | ----- | ------ |
| 004-01 | Plugin registry CRUD + catalog routes | done |
| 004-02 | Manifest Zod schema validation | done |
| 004-03 | Install flow orchestrator | done |
| 004-07 | @plexica/vite-plugin + MF config generator | done |
| 004-14 | Core event emission (Kafka producer) | done |
| 004-30 | @plexica/sdk package | done |
| 004-28 | Marketplace UI | done |
| E2E-01…15, INT-01…09, PQ-01…04 | Test + quality suite | done |

## Notes

- Post-epic follow-up: Spec 008 (Kafka JavaScript client migration) touches
  the event bus built here — tracked as post-E07 follow-up, see
  `.forge/epics/README.md`.