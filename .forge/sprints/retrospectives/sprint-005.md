# Sprint 5 Retrospective — Super Admin Panel (Spec 005)

**Date**: 2026-09-17
**Sprint**: 5 (2026-07-02 → 2026-07-31, closed retroactively)
**Goal**: Deliver Spec 005 — Super Admin Panel
**Stories**: 11/11 done (100%), 11 pts delivered, 11 pts planned
**This is the first retrospective in the project.**

---

## What Went Well

- **Full scope delivered.** All 11 stories (dashboard, tenant lifecycle
  provision/suspend/reactivate/delete, plugin catalog, health check, Kafka
  status + DLQ, system logs) shipped. All 11 pages exist under
  `apps/admin/src/pages/` and all 11 E2E specs under
  `apps/admin/e2e/005-*.spec.ts` — Constitution Rule 1 (E2E per feature) held.
- **Clean, low-risk scope.** Sprint 4 was the hard architecture sprint;
  Sprint 5 was mostly a single-page admin UI over existing data models and
  APIs. The kanban risk note ("simpler than Sprint 4 — single-page admin UI,
  existing data models, no new infra") proved correct: no new core
  infrastructure was needed.
- **ADRs on time.** ADR-022 (super admin data model) and ADR-023 (admin PKCE
  auth) were written and accepted during the sprint — governance matched the
  constitution's "significant = ADR" rule (data model + auth changes).
- **PKCE remediation.** The admin app migrated from password-grant to PKCE
  (PR #77, 2026-07-24) — a security-improving mid-sprint change, shipped
  with E2E fixed (deterministic suites, no conditional skips, per decision
  log ID-013 supersede note).
- **Spec 005 artifacts complete.** `.forge/specs/005-super-admin/` has
  spec, plan, tasks, design-spec, user-journey, and wireframes — the full
  FORGE artifact chain for planning the sprint.

---

## What Went Wrong

1. **Sprint was never closed.** The sprint file sat in `active/` from
   2026-07-02 until 2026-09-17. `end_date` was null; velocity was never
   recorded; `actual_velocity` was unknown to anyone using the board.
2. **Active sprint YAML was never updated.** All 11 stories remained
   `status: pending` even after PR #73 merged. Anyone reading the sprint file
   would conclude the sprint hadn't started.
3. **Kanban was stale.** `kanban.md` still read "Sprint 5: Not Started" weeks
   after the work merged. The board was the source of truth for nobody.
4. **~2 months of wall-clock time** between start (2026-07-02) and archival
   (2026-09-17). No one noticed because no routine checked sprint hygiene.
5. **No retrospective existed** — this is the project's first. Lessons from
   Sprints 1–4 were never harvested into the process.

---

## Process Section — Sprint Tracking Failure

**Root cause**: Closing a sprint and updating sprint state requires a
*manual ceremony* (forge-scrum `/forge-sprint close`). Nothing enforced it.
There was no cadence review, no pre-flight check for stale sprint files, and
no trigger connecting "PR merged" → "story done" → "kanban updated".

**Chain of failure**:
1. Work merged (2026-07-20/24) — repo reality moved forward.
2. Sprint YAML stayed `pending` — the tracking artifact froze.
3. Kanban stayed "Not Started" — the board froze too.
4. No close ceremony → no velocity recorded → no retro → no lessons.

**Systemic issues found (beyond this sprint)**:

| Issue | Evidence | Impact |
| ----- | -------- | ------ |
| **No epics tracked** | `.forge/epics/` is empty; no epic exists for any of the 7 specs | Stories have no parent container; cross-sprint work is untraceable |
| **No velocity scale normalization** | Sprint 1: 109 pts, Sprint 2: 219 pts, Sprint 3: 322 pts, Sprint 4: 30 pts, Sprint 5: 11 pts | Sprint velocities are not comparable; "capacity planning" is guesswork. Sprint 4/5 counted features/stories at 1pt each, while Sprints 1–3 counted tasks — different scales |
| **No prior retros** | `retrospectives/` created today | 5 sprints of lessons lost; recurring issues (e.g. stale tracking) never caught |
| **`next_sprint_number` drift** | `sprint-sequence.yaml` still said `5` while Sprint 5 was active | Sequence file was not incremented on Sprint 5 start; only fixed now on close |

---

## Improvements for Next Sprint

1. **Close sprints on a fixed cadence** — close ceremony within 3 days of the
   last story landing; never leave a sprint in `active/` past its end date.
2. **Update story status as PRs merge** — story `status` must flip to `done`
   the moment the merge commit lands; `completed_at` = merge date.
3. **Normalize velocity scale** — define one point system across all sprints
   (suggest: 1 story = 1pt, size by [S/M/L] per story, tasks don't carry
   points). Rebaseline Sprints 1–3 if historical comparison is needed.
4. **Stand up epics** — create epic ENN for each spec; link stories to them
   so cross-sprint scope is visible.
5. **Run the retrospective within 1 week of close** — always produce ≥ 1
   actionable improvement, appended to `lessons-learned.md`.
6. **Sequence file hygiene** — `/forge-sprint start` must bump
   `next_sprint_number`; a pre-flight check should warn on stale active
   sprints (no end_date, > X days old).

---

## Action Items

| # | Action | Owner | Target |
| - | ------ | ----- | ------ |
| 1 | Add sprint-close pre-flight check: warn on active sprints with `end_date: null` or age > 30 days (can integrate with `pre-flight-checks` skill) | Forge/scrum | Sprint 6 |
| 2 | Define and document a normalized velocity scale (1 story = 1pt, [S/M/L] sizing); record it in `sprint-sequence.yaml` header or a `.forge/sprints/velocity.md` | Forge/scrum + user | Sprint 6 |
| 3 | Create epics E01–E07 (one per spec 001–007) and link existing stories | Forge/scrum | Sprint 6 |
| 4 | Enforce retro within 1 week of every sprint close; append findings to `.forge/knowledge/lessons-learned.md` | Forge/scrum | Sprint 6 |
| 5 | Backfill `next_sprint_number` hygiene: verify `sprint-sequence.yaml` matches reality at every `/forge-sprint start` | Forge/scrum | Sprint 6 |

---

## Velocity Trend (raw, unnormalized — see Action #2)

| Sprint | Points | Note |
| ------ | ------ | ---- |
| 1 | 109 | task-level points |
| 2 | 219 | task-level points |
| 3 | 322 | task-level points |
| 4 | 30 | 30 features @ 1pt |
| 5 | 11 | 11 stories @ 1pt |

**Conclusion**: velocity is currently incomparable across sprints. Sprint 5
delivered 11/11 stories on a 1pt-per-story scale. Do not extrapolate
capacity from this data until normalization (Action #2) lands.