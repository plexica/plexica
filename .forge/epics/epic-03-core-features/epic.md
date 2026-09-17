# E03 — Core Features

| Field        | Value                                      |
| ------------ | ------------------------------------------ |
| Epic ID      | E03                                        |
| Title        | Core Features                              |
| Status       | Complete                                   |
| Linked Spec  | `003-core-features`                        |
| Spec Path    | `.forge/specs/003-core-features/spec.md`   |
| Linked Sprint| Sprint 3                                   |

## Description

Core platform capabilities for end users: workspaces, team and role models
with ABAC, tenant settings, and the audit log. These are the notification
targets and context models that Spec 006 (Cross-Cutting) builds on.

## Linked Stories

Full story list in `.forge/sprints/completed/2026-04-08-sprint-003.yaml`
(134 task-scale items, 322 task pts — pre-normalization scale).

| Story | Title | Status |
| ----- | ----- | ------ |
| 003-* | Workspaces, ABAC roles, tenant settings, audit log | done |

## Notes

- Tracked at task granularity (pre-velocity-normalization).
- ABAC tree-walk pattern established here (ADR-003) — reused by plugin
  permission checks in E04.