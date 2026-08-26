# FORGE Dual-Model Adversarial Review — Spec 010 CI Dynamic Ports — Round 9 (Consolidated)

| Field | Value |
| --- | --- |
| Date | 2026-08-23 |
| Reviewers | forge-reviewer (primary) + forge-reviewer-peer (dual-model), orchestrator-adjudicated |
| Scope | Uncommitted working tree vs `191f859` (76 modified + ~50 new untracked files, ~2085 insertions / 416 deletions) — contains claimed fixes for all round-8 findings |
| Spec | `.forge/specs/010-ci-dynamic-ports/` (tech-spec, plan, tasks, tasks-orchestration), ADR-031 |
| Verdict | **REQUEST_CHANGES** (primary; peer APPROVED WITH NOTES — overturned on R9-1, empirically confirmed) |

## Context

Round 8 findings (H1 mapfile teardown, M1–M7, L3/L11) were delivered in chat with no report file on disk; this round reconstructs and verifies their closure directly against source. Prior consolidated state: round-7 report (`...round7-consolidated.md`) with blockers B1/B2 and non-blocking items 1–13.

## Verdicts of individual reviewers

| Reviewer | Verdict | Key finding |
|---|---|---|
| forge-reviewer (primary) | REQUEST_CHANGES | R9-1 EXIT-trap teardown regression |
| forge-reviewer-peer | APPROVED WITH NOTES | Found F1/F2 mediums; missed R9-1 |

Peer APPROVED is **overturned**: the primary's R9-1 was independently reproduced by the orchestrator against source (see below). Per governance, the more severe verified finding governs.

---

## Findings table

| # | Severity | Finding | File(s) | Source |
|---|---|---|---|---|
| R9-1 | **HIGH — blocking** | EXIT-trap teardown regression makes every *successful* verifier run exit 1. Line 152 explicitly tears down project A (`down "$project_a"` deletes its runtime dir); `initialized[]` still contains A; on normal completion the EXIT trap re-downs both projects; `validate_ci_runtime` → `realpath -e` fails on A's deleted dir → `teardown=1` → `exit 1`. ⚙ Empirically traced against source by orchestrator. Also renders B1 evidence impossible until fixed. | `verify-concurrent-ci-runtime.sh:38-39,131,152`; `down-ci-runtime-project.sh:9,33-35`; `ci-runtime-path.sh:48` | Primary; confirmed by orchestrator |
| R9-F | **MEDIUM — blocking** | Verifier self-test is flaky (~20% observed: 3/10 then 4/20 silent rc=1): concurrent A/B bootstraps interleave multi-line appends into shared `COMMAND_LOG`, breaking node line-adjacency assertions. Runs in CI (`ci.yml:136`) → random red CI = Constitution Rule 2 exposure. Passes deterministically when run alone. | `verify-concurrent-ci-runtime.test.sh:79,92-95,108-113` | Orchestrator verification |
| F2 | Medium | `expectedPort` param added for round-7 item 7 has zero production callers (`proxy.service.ts:62` passes 2 args) — manifest-port match is tested but never enforced at runtime. Cosmetic closure. | `plugin-container-identity.ts:54-68`; `proxy.service.ts:62` | Peer; confirmed |
| F1 | Medium-Low | Restart-replacement path asserts post-start identity but never force-removes a failed replacement (unlike `startContainer`'s remove-and-rethrow). Rogue sidecar can persist. | `docker-container-restart.ts:69-72` vs `container-manager.service.ts:120-129` | Peer; confirmed |
| R9-3 | Low-Med | Admission lock created as `/etc/plexica-ci-concurrent-e2e.lock` — requires `/etc` write access; non-root admitted runners fail admission. Belongs in `$RUNNER_TEMP`. | `verify-ci-runner-capacity.sh:8,25` | Primary |
| R9-6 | Low | Sentinel tuple still covers only six services; AC partially honored (carried C5). | `verify-concurrent-port-gates.sh:11-18` | Both |
| R9-7 | Low | ADR-031 drift persists and moved: Decision §3 "CI scope equals project" contradicts shipped hash-projection scope (`plugin-runtime-scope.ts`). | ADR-031 | Both |
| R9-8 | Low | Quality/contract-job runtime dirs still accumulate on persistent runners (U2 partial). | `ci.yml:39-83` | Both |
| Carried lows | Low | SC2086 unquoted loops; dead checked-in docker stub; unpinned harness `FROM`; raw `sidecar-images.env` source guard gap; root-mkdir TOCTOU; U1 unnamed failing projects; misleading step name; KAFKA_BROKERS port >65535; proxy create-path admits forbidden-env before Core-side refusal (C7 residual). | see individual reports | Both |

## Local verification run (orchestrator)

Docker daemon available (not needed for shell suites). Shell contract tests **16/17 pass** (the 1 failure = R9-F flake, passes deterministically in isolation). Vitest unit suites (plugin-container-identity, keycloak-runtime-contract): **11/11 pass**. Constitution Rule 4 sweep across all touched/new files: clean, max 198 lines (`config.ts`). No retry/skip/bypass paths found; retries remain disabled under contract.

## Per-item closure status

### Round-7 blockers & items
- **B1 — OPEN (acknowledged gate).** Tasks 5.4/6.1/6.2 unchecked; no admitted-runner execution evidence.
- **B2 — CLOSED ⚙.** Per-project `--output` + `PLAYWRIGHT_HTML_REPORT` in `run_playwright`; contract-spec dedupe via `CI_RUNTIME_SKIP_CONTRACT_SPEC`.
- Items: 1 ✅ · 2 ✅ · 3 ✅ · 4 partial (create path fixed; restart path = F1) · 5 ❌ · 6 partial · 7 cosmetic-only (F2) · 8 mitigated Core-side, open at proxy · 9 partial fail-closed · 10 ❌ · 11 ✅ · 12 wording changed, new drift (R9-7) · 13 mixed (purpose-allowlist ✅, host.env mode guard ✅, scanner keys ✅, CURL_LOG/port nits ✅; SC2086 ❌, sidecar-env source ⚠️, harness FROM ❌, mkdir TOCTOU ❌, dead stub ❌, U1 ❌, dir accumulation ⚠️, KAFKA bound ❌).

### Round-8 items
- **H1 — genuinely closed ⚙** (mapfile-based sidecar capture + two-sidecar behavioral proof) — but **introduced R9-1**.
- M-series best-evidence closed: atomic writes ✅, capacity flock ✅, per-project Keycloak creds + real-rejection probe ✅, contract-spec dedupe ✅, %q/env_file writer split ✅, Playwright output dirs ✅, runtime-config.js dist mount ✅ (would have 404'd).
- **Caveat:** without a round-8 ground-truth list, if any of M1–M7 actually referred to SC2086 / sidecar-env-source guard / unpinned FROM / mkdir TOCTOU, those specific claims are **not** closed — those four are open regardless of numbering.
- L3/L11 best-evidence closed (lifecycle hygiene; line-gate blind spot).

---

## Verdict: REQUEST_CHANGES

### Blocking issues (must fix before merge)

| # | Issue | Note |
|---|---|---|
| **B1** | Admitted-runner execution evidence still absent (tasks 5.4/6.1/6.2 unchecked). Acknowledged gate — carried, not new. | Cannot be discharged until R9-1/R9-F are fixed. |
| **R9-1** | EXIT-trap re-down regression: every successful `--full-e2e` verifier run exits 1. Fix: tolerate already-torn-down projects in `cleanup()` (skip when runtime dir absent, or remove from `initialized[]` after explicit teardown). Introduced by the round-8 H1 fix. | Blocks B1 evidence. |
| **R9-F** | Flaky verifier self-test (~20%) in CI — determinism violation, Constitution Rule 2 exposure. Fix: serialize COMMAND_LOG appends or use per-stream log files with post-hoc merge. | Random red CI. |

Everything else is non-blocking track-before-or-soon-after-merge work.

### Recommended sequence

1. Fix R9-1 (cleanup tolerance) and R9-F (log serialization).
2. Re-run shell contract suite ×20 to prove determinism.
3. Execute task 5.4 `--full-e2e` on an admitted runner; attach sentinel artifact + run link; check tasks 5.4/6.1/6.2 → discharges B1.
4. Targeted follow-ups (F2 wire-up, F1 restart cleanup, R9-3 lock location, R9-7 ADR wording) — non-blocking.

Full individual reports: `/tmp/opencode/010-round9-primary.md`, `/tmp/opencode/010-round9-peer.md`.

*Reviewer disagreement note:* peer returned APPROVED WITH NOTES; overturned because the primary's R9-1 was mechanically confirmed against source by the orchestrator (explicit teardown of A at verifier :152 + stale `initialized[]` entry re-downed by EXIT trap + `realpath -e` fail-closed in down script). This is precisely the class of interaction static single-pass reads miss — hence dual-model + adjudication.
