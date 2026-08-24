# Review Round 10 — Consolidated (Spec 010: CI Dynamic Ports)

## Metadata

| Field | Value |
|---|---|
| Date | 2026-08-23 |
| Reviewers | forge-reviewer (primary) + forge-reviewer-peer (independent model), orchestrated & adjudicated by Forge |
| Scope | Uncommitted working tree vs commit `191f859` (~76 modified + ~50 new files); diff-based review, no PR |
| Spec | `.forge/specs/010-ci-dynamic-ports/` |
| Baseline report | `review-010-ci-dynamic-ports-2026-08-23-round9-consolidated.md` |
| Individual verdicts | Primary: **REQUEST_CHANGES** · Peer: **REQUEST_CHANGES** |
| Final verdict | **APPROVED** (code-level) — see adjudication below |

## Verdicts and Adjudication

| Reviewer | Verdict | Sole stated reason |
|---|---|---|
| Primary | REQUEST_CHANGES | Missing empirical determinism runs for R9-F (reviewer session had no command-execution capability; zero code defects found) |
| Peer | REQUEST_CHANGES | Same — missing empirical ×10 determinism run (disclosed honestly, not fabricated; zero HIGH/MEDIUM found) |

**Disagreement:** none on any finding or closure judgment. Both verdicts were REQUEST_CHANGES strictly on an *evidence-discharge* condition, explicitly conditioned ("if green, R9-F closes with no code change").

**Adjudication rationale (more severe verified finding governs):** the single open condition was discharged post-review by the orchestrator, which has shell access:

- **Determinism (R9-F):** `verify-concurrent-ci-runtime.test.sh` executed **21×** (1 warm-up + 20 formal runs): **21/21 PASS, zero flakes** (logs `/tmp/opencode/r10-det-*.log`). Exceeds the ≥10× requirement.
- **Full shell contract suite:** all **18/18** `*.test.sh` under `.github/actions/docker-infra/scripts/` green.
- **Vitest units:** `plugin-container-identity`, `plugin-proxy-manifest-port`, `docker-container-restart` — **3 files / 7 tests, all pass** (vitest v4.1.10).
- **Constitution Rule 4 sweep (orchestrator, mechanical):** every touched/new file ≤ 198 lines (max: `config.ts` at 198). No violation.

With the sole blocking condition discharged, both reviewers' conditional-flip criteria are met → **APPROVED**.

## Findings Table (open or newly found)

| ID | Severity | File / Source | Source | Status |
|---|---|---|---|---|
| P1 | Low | `proxy.service.ts` — masked mismatch error message via `validateTargetHost` catch-all | New (peer) | Open, non-blocking |
| P2 | Low | `proxy-authorization.service.ts:118` — silent `manifestPort` degradation on unparsable manifest | New (peer) | Open, non-blocking |
| P3 | Info | `proxy.service.ts:88` glue line untested directly | New (peer) | Open, non-blocking |
| P4 | Info | EXIT trap overrides INT/TERM exit codes (130→1) | New (peer) | Open, non-blocking |
| P5 | Info | flock/bash≥4.4 runner prerequisites undocumented | New (peer) | Open, non-blocking |
| P6 | Info | Rule-4 capacity pressure (files at 197–198 lines) | New (peer) | Open, watch-list |
| — | Carried lows | R9-3 (`/etc` admission lock — note: now load-bearing on mainline admission path), R9-6 (six-service sentinel tuple), R9-7 (ADR-031 §3 drift vs hash-projection scope), R9-8 (quality-job runtime dir accumulation), SC2086 loops, unpinned harness `FROM node:24-bookworm`, sidecar-env source guard, mkdir TOCTOU, U1 unnamed failing projects, misleading step name, KAFKA_BROKERS port bound, proxy create-path forbidden-env ordering | Round 9 | Carried, non-blocking |
| — | Low | Dead docker stub **`.github/actions/docker-infra/scripts/bin/docker` still present** (primary could not relocate it; orchestrator located via `git ls-files`) | Round 9 | Confirmed still open |

No HIGH or MEDIUM findings remain open.

## Round-9 Closure Status

| Item | Status | Verification method | Evidence |
|---|---|---|---|
| **R9-1** (HIGH) EXIT-trap teardown regression | ✅ CLOSED | ⚙ Empirical + static read (both reviewers static-traced success + failure paths; orchestrator read source; self-test run 21×) | `torn_down[]` recorded only after down-script rc=0 (`verify-concurrent-ci-runtime.sh:26–28`); `cleanup()` skips torn-down projects (:48 iterates `initialized[]`, `down()` early-returns); explicit A-down at :162; exactly one `down` per project on success AND failure paths; pinned by self-test assertions |
| **R9-F** (MEDIUM) flaky verifier self-test | ✅ CLOSED | ⚙ Empirical (orchestrator) + static lock audit (both reviewers) | All COMMAND_LOG writers funnel through `flock -x 9`-guarded `append_log`; **21/21 deterministic passes**; interaction probes (flock × EXIT trap) sound |
| **F1** (Med-Low) restart replacement leak | ✅ CLOSED | Static read (both reviewers) + orchestrator source check + unit test | `docker-container-restart.ts:77–79`: failed replacement force-removed (`{force:true,v:true}`) before rethrow, mirroring startContainer remove-and-rethrow contract |
| **F2** (MEDIUM) expectedPort dead param | ✅ CLOSED | Static caller-chain trace (both reviewers) + orchestrator source check | Manifest port → `manifestPort` (`proxy-authorization.service.ts:118`) → `proxy.service.ts:88` → runtime refusal throw (`plugin-container-identity.ts:67–69`); enforcement tested in plugin-runtime-contract tests; no legitimate-mismatch false positives (target port derives from same manifest) |
| **B1** admitted-runner execution evidence | ⏳ OPEN — user-owned tracked gate | Static read (tasks 5.4/6.1/6.2 confirmed `[ ]` in tasks-orchestration.md) | See Section (b) below |
| R9-3, R9-6, R9-7, R9-8 + 9 other carried lows | Carried, non-blocking | Static read (both reviewers independently re-checked) | See findings table |

## New-Regression Hunt

Adversarial probes into fix interactions found **no regressions** — the round-8→9 failure mode (a fix introducing R9-1) did **not** recur:

- flock guard × EXIT trap: atomic append groups, synchronous invocation, distinct logs per negative path — sound.
- torn_down tracking × failure paths: five paths traced; partial teardowns correctly retried by cleanup (failed downs are never recorded as torn_down) — sound.
- expectedPort enforcement × legitimate mismatches: target port and enforcement derive from the same manifest; no legitimate path broken — sound.
- Retry/skip/bypass sweep: clean. No `isTestToken`-style dual code paths introduced.

---

## (a) Code-level blockers remaining

**None.** All four round-9 code findings (R9-1, R9-F, F1, F2) are verified closed. No HIGH/MEDIUM issues are open. The remaining items are LOW/INFO quality improvements suitable for follow-up tasks, plus the carried round-9 lows.

## (b) Admitted-runner execution evidence gate — TRACKED, USER-OWNED (NOT a code-level blocker)

Tasks **5.4**, **6.1**, **6.2** in `tasks-orchestration.md` remain unchecked: end-to-end execution of the dynamic-port CI pipeline on a real admitted GitHub runner (with Docker daemon) has not yet produced evidence artifacts. This gate is acknowledged in the spec plan, is outside what local review can discharge, and is owned by the user. It does **not** block this review's code-level approval but must be discharged before the spec can be declared done.

## Recommended Next Steps

1. **Land the diff** — no further code changes required for merge-readiness at the code level.
2. **User action:** execute tasks 5.4/6.1/6.2 on an admitted runner to close gate B1; attach execution evidence artifacts to the spec.
3. File follow-up tasks for the six new LOW/INFO findings (P1–P6) and the dead docker stub removal (`.github/actions/docker-infra/scripts/bin/docker`).
4. Batch the carried round-9 lows into a hygiene pass (consider escalating the R9-3 `/etc` lock relocation given it is now load-bearing).
5. Watch P6 capacity pressure: files at 197–198 lines should be decomposed before their next modification.
