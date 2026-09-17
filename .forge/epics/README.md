# Epics — Plexica v2

> Created 2026-09-17 per Sprint 5 retrospective Action #3 (epics E01–E07,
> one per spec 001–007). `.forge/epics/` was previously empty.

## Structure

```
epic-NN-slug/
  epic.md        # Epic definition: id, status, linked spec, linked stories
```

Epic IDs: `E01`…`E07`. Story IDs use `ENN-SNNN` (e.g., `E06-S001`) once
stories are formalized via `/forge-story`; sprint-tracked stories keep their
spec-sprint IDs (e.g., `006-01`) in sprint files.

| Epic | Title           | Spec                       | Status      |
| ---- | --------------- | -------------------------- | ----------- |
| E01  | Infrastructure  | 001-infrastructure-setup   | Complete    |
| E02  | Foundations     | 002-foundations            | Complete    |
| E03  | Core Features   | 003-core-features          | Complete    |
| E04  | Plugin System   | 004-plugin-system          | Complete    |
| E05  | Super Admin     | 005-super-admin            | Complete    |
| E06  | Cross-Cutting   | 006-cross-cutting-features | In Progress |
| E07  | Consolidation   | 007-consolidation          | Not Started |

## Post-E07 Follow-ups (Specs 008–012)

Specs 008–012 are follow-up/epic-scale items, not part of the E01–E07
mapping. They are tracked here and referenced from the closest epic:

| Spec | Title                                            | Closest Epic | Note |
| ---- | ------------------------------------------------ | ------------ | ---- |
| 008  | Kafka JavaScript Client Migration                | E04          | Replaces event-bus client; ADR-004 bus |
| 009  | Dependabot Docker Image Updates                  | E01          | CI/infra hygiene |
| 010  | CI Dynamic Ports                                 | E01          | CI infra |
| 011  | Object Storage Server Swap (Silo)                | E01          | Storage infra |
| 012  | PR #77 Review Fixes (Batch 2)                    | E05          | Admin app fixes |

These are intentionally **not** assigned to a sprint yet. They are candidates
for a post-E07 follow-up sprint or continuous pipeline work, to be
prioritized with the user when Sprint 7 closes.