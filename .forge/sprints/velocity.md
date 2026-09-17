# Velocity Scale — Normalized Sprint Points

> Defines the single point system for all sprint planning from Sprint 6
> onward. Replaces the three incompatible scales used in Sprints 1-5
> (task points, feature points, flat story points).

**Status**: Active from Sprint 6 (2026-09-17). Created 2026-09-17 per Sprint 5
retro Action #2 and lessons-learned ("Velocity is meaningless without a
normalized scale").

---

## 1. Scale Definition

| Size | Points | Meaning                                            | Example                                        |
| ---- | ------ | -------------------------------------------------- | ---------------------------------------------- |
| S    | 1      | One focused feature in a single layer              | Health-check endpoint; avatar component        |
| M    | 2      | Typical full-stack story (API + UI + tests)        | Notification center with mark-as-read          |
| L    | 3      | Cross-cutting or infrastructure-heavy story        | SSE infrastructure; full react-intl migration  |

Rules:

- **Stories carry points. Tasks do not.** Task checkboxes exist only inside
  stories and never carry their own points.
- A story sized > 3 pts (L) must be split into smaller stories.
- Sizing assumes one full-time developer at roughly 2 working days per M
  story, including the mandatory E2E test (Constitution Rule 1).

## 2. Historical Conversion (Sprints 1-5)

The old scales are not directly comparable. Documented conversion for
archival rebaselining:

| Sprint | Old scale            | Old pts | Conversion      | Normalized |
| ------ | --------------------- | ------- | --------------- | ---------- |
| 1      | task pts (1-8/task)   | 109     | ÷ 7             | ≈ 16       |
| 2      | task pts (1-8/task)   | 219     | ÷ 7             | ≈ 31       |
| 3      | task pts (1-8/task)   | 322     | ÷ 7             | ≈ 46       |
| 4      | feature pts (1/feat)  | 30      | re-size S/M/L   | ≈ 55       |
| 5      | story pts (1/story)   | 11      | re-size S/M/L   | ≈ 18       |

Justification:

- **Sprints 1-3 (task scale)**: tasks averaged 2.4-3.2 pts each; one M story
  ≈ 6-8 tasks, so `task_pts ÷ 7 ≈ story_pts`. Archival only — task-scale
  sprints are **not** used for capacity planning (they were short bootstrap
  sprints with inflated task-level density).
- **Sprint 4 (feature scale)**: the 30 features were story-sized; most were
  M or L (registry, MF preset, Kafka, SDK, CLI). Estimated avg ≈ 1.8 →
  ≈ 55 pts.
- **Sprint 5 (story scale)**: 11 stories, mostly M-sized admin pages →
  ≈ 18 pts.

## 3. Normalized Velocity

| Sprint | Normalized pts | Planned weeks | Pts/week |
| ------ | -------------- | ------------- | -------- |
| 4      | ≈ 55           | 5-6           | ≈ 9.5    |
| 5      | ≈ 18           | 2-3           | ≈ 7.2    |

- **Baseline velocity for planning: ≈ 8-9 pts/week** for one full-time
  developer (Sprints 4-5 average). Sprints 1-3 are excluded — not comparable.
- **Overcommit warning threshold: 120% of baseline ≈ 10.5 pts/week**. A
  sprint planning above this must cut scope, not extend duration (kanban
  working agreement: cut scope, don't extend).
- **Sprint 6 target: 3 weeks × ~9 pts/week ≈ 27 pts** (13 stories committed).
  The spec estimates ~4 weeks of work (1.5 + 1 + 0.5 + 1); a 3-week sprint is
  aggressive, so optional item 006-19 (OpenTelemetry tracing, explicitly
  optional in spec) is deferred to Sprint 7.

## 4. Sprint-Close Pre-Flight Check (governance rule)

Process rule owned by the orchestrator — **not a sprint story**. Integrates
with the `pre-flight-checks` skill.

Before every `/forge-sprint start` and `/forge-sprint close`, warn when:

1. Any active sprint has `end_date: null` — a sprint with no end date is a
   process failure (Sprint 5 sat in `active/` for ~2 months with
   `end_date: null`).
2. Any active sprint is older than 30 days (`today − start_date > 30`).
3. `sprint-sequence.yaml` `next_sprint_number` does not match
   `active/` + `completed/` contents.

This rule exists because Sprint 5 was never formally closed, its stories
stayed `pending` after merge, and the kanban stayed stale for weeks.