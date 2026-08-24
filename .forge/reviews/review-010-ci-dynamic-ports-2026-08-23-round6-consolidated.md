# FORGE Dual-Model Adversarial Review — Spec 010 CI Dynamic Ports — Round 6 (CONSOLIDATED)

- **Date**: 2026-08-23
- **Scope**: uncommitted working tree, ~76 files, +1911/−400 (`git status`/`git diff` + untracked files)
- **Models**: forge-reviewer `[PRIMARY]` × forge-reviewer-peer `[PEER]`, run in parallel per FORGE governance, fully isolated from each other
- **Individual reports**:
  - `.forge/reviews/review-010-ci-dynamic-ports-2026-08-23-round6-primary.md`
  - `.forge/reviews/review-010-ci-dynamic-ports-2026-08-23-round6-peer.md`
- **Orchestrator verification**: the decisive findings were re-verified independently with shell access before confirmation — compose eager-load gates (`docker-compose.ci.yml:15-21`, `infra/compose/docker-compose.ci-runtime-services.yml`), admission export order (`.github/actions/ci-runner-admission/action.yml`), unstubbed regression test body (`verify-ci-compose-render.test.sh:69-104`), task checkboxes (`tasks-orchestration.md:8,39-64`), `quality` job teardown absence (`.github/workflows/ci.yml` quality block vs `phase: down` at :172), in-place `runtime-config.js` write (`ci-runtime-env.sh:38,49-50`), non-atomic `admission.env` write (`verify-ci-runner-capacity.sh:47-48`). No false positives admitted this round.

---

## Verdict: REQUEST CHANGES (both models, unanimous)

**The Round-5 CRITICAL class is verifiably closed.** For the first time since Round 2 there are zero code-level CRITICAL/HIGH defects: the eager-load variable trap was eliminated structurally (origins moved into pre-created `browser-endpoints.env` env_file entries resolved at create time), behavioral negative tests replaced the tautologies, and traceability gaps were filled. What remains is one **process-evidence gate**: the admitted-runner end-to-end proof (tasks 5.4/6.1/6.2) has still never been executed after six rounds, and every Docker-touching suite stubs `docker` — so the real-wiring assumptions the stubs cannot validate (dead-registry digest resolution, two-project concurrency, bind-mount write-between-create-and-start) remain formally unproven. Under Constitution Rules 1–2 this blocks merge by itself.

| Severity | Count |
|---|---|
| CRITICAL | 0 |
| HIGH | 1 |
| MEDIUM | 0 |
| MINOR | 11 |
| NIT | 3 |

---

## Consensus findings (flagged by BOTH models)

### 🔴 [CONSENSUS][HIGH-1] Admitted-runner end-to-end proof never executed — CONFIRMED BY ORCHESTRATOR
Tasks 5.4/6.1/6.2 remain unchecked (`tasks-orchestration.md:8,39-42,52-64`; status line explicitly says "pending admitted-runner verification"). No recorded green `--full-e2e` run exists anywhere in the tree. Every Docker-touching suite stubs the docker CLI, so A-down/B-survives concurrency and daemon-side digest resolution of `127.0.0.1:<port>/sidecar-harness@sha256:` against a **removed** registry are plausible-but-unproven. This round did add a genuine fail-closed guard (`verify-ci-sidecar-lifecycle.sh:40-46`: `docker image inspect "$CI_SIDECAR_HARNESS_IMAGE"` with behavioral tests) — but a refusal guard proves failure detection, not success. Severity split between models (peer HIGH / primary MEDIUM); consolidated as HIGH because Constitution Rules 1–2 ("every feature has an E2E test", "no merge without green CI") make the executed run a hard merge gate, and it is the sole remaining R5 required action of its kind.

### 🟡 [CONSENSUS][MINOR] Carried minors — all re-verified open by both models
1. **Duplicated contract-spec runs** — `verify-concurrent-ci-runtime.sh:138-141`; lines 140-141 repeat 138-139 (141 also drops the `e2e/` prefix) on the retry-prohibited critical path. Carried R4→R6.
2. **`KAFKA_BROKERS` port unbounded (>65535 accepted)** — `ci-runtime-endpoint-contract.mjs:66`, `e2e/ci-runtime-manifest.ts:80`. Carried R3→R6.
3. **Diagnostics scanner omits `user(?:name)?` keys** while the sanitizer covers them — `scan-ci-runtime-diagnostics.mjs:7,10` vs sanitizer :7. Carried R4→R6.
4. **Raw `source sidecar-images.env` without `-O`/symlink/0600 re-validation** in the idempotent branch — `verify-ci-sidecar-lifecycle.sh:22-24,33-34`. Carried.
5. **Harness image layers accumulate in daemon store; tag-only removal, no prune in teardown** — `verify-ci-sidecar-lifecycle.sh:26`. Erodes the 60 GiB admission threshold over time. Carried.
6. **Non-atomic writes to final paths** — `ci-runtime-keycloak-credentials.sh:32-35`, `ci-runtime-compose.sh:44`; primary additionally flags `admission.env` (`verify-ci-runner-capacity.sh:47-48`, orchestrator-confirmed). Carried.
7. **Misleading step name "Migrate through the host manifest"** runs only `test -f host.env`; migrations live elsewhere — `ci.yml:144-145`. Carried.
8. **SC2086 unquoted expansions** — `down-ci-runtime-project.sh:11-12,17-18,28` (peer found more sites than the previously known :12,:28).

---

## Single-model findings

- 🟠 [PEER][MINOR-7] **`quality` job never tears down its admitted runtime dir** — `.github/workflows/ci.yml` quality block has the admission step but no diagnostics/down phases, unlike the `ci` job which ends with `phase: down` under `if: always()` (:150-174). Unbounded `$RUNNER_TEMP/plexica-ci/` accumulation per run on the persistent runner. **Orchestrator-CONFIRMED.**
- 🟠 [PEER][MINOR-10] **In-place overwrite of bind-mounted `runtime-config.js`** — `ci-runtime-env.sh:49` redirects directly onto the file that compose bind-mounts read-only into web/admin containers (:53,:71); the current ordering (write between create and start) works, but a future "consistency" tmp+mv refactor would silently swap inode and break the mounts. Document the invariant or add a guard. **Orchestrator-CONFIRMED** (line 38 pre-creates empty file; line 49 overwrites in place).
- 🟠 [PRIMARY][MINOR-8] **Generalized runtime-dir accumulation** — job-owned dirs under `$RUNNER_TEMP/plexica-ci/` are never swept on persistent runners and `init` refuses pre-existing dirs (`ci-runtime-path.sh:35-37`); overlaps PEER MINOR-7 but extends beyond the quality job. Partially corroborated.
- 🟢 [PEER][NIT] Inline `${{ inputs.purpose }}` shell interpolation persists in `ci-runner-admission/action.yml:13` — callers pass fixed literals, theoretical today, but it is the exact pattern R4 eliminated elsewhere.
- 🟢 [PRIMARY][NIT] Lifecycle-test hygiene — `ci-runtime-lifecycle.test.sh:110` fixture port 99999 (>65535) would fail a real bind; :114 sets CURL_LOG but never creates/asserts it.
- 🟡 [BOTH as NIT] Unpinned harness base image `FROM node:24-bookworm` — `infra/docker/ci-sidecar-harness.Dockerfile:1`.

No contradictions between models on any shared target; the only severity disagreement (HIGH vs MEDIUM on HIGH-1) was adjudicated by the orchestrator upward given the constitutional merge gate.

---

## Prior-round remediation (R5 required actions)

| # | R5 required action | Status |
|---|---|---|
| 1 | Fix CRITICAL-1 (eager-load public-base vars) + unstubbed no-vars regression test | ✅ **RESOLVED** — origins moved out of load-time interpolation into pre-created `browser-endpoints.env` env_file entries; only `CI_RUNTIME_DIR:?`/`CI_COMPOSE_PROJECT:?` remain as load-time gates and both are exported by admission via `$GITHUB_ENV` before any compose call on both job paths. Orchestrator traced both paths and grepped for new eager requirements: none in the CI include chain. Regression test genuinely runs real `docker compose config` with all three vars unset (`env -u WEB_E2E_PUBLIC_BASE …`, fresh runtime dir) plus rendered-model propagation assertions (`verify-ci-compose-render.test.sh:69-104`) |
| 2 | Behavioral negative tests for readiness-gate refusal | ✅ **RESOLVED** — tautological string-grep test removed; stale-mapping curl-refusal and wrong-projection cases added (`ci-runtime-lifecycle.test.sh:88-117`); poisoned port-discovery case proves Playwright is never reached (`wait-services.test.sh:58-96`); tech-spec AC updated |
| 3 | Execute admitted-runner end-to-end proof (5.4/6.1), capture digest-resolution evidence | ❌ **NOT DISCHARGED** — 6th round carried; becomes HIGH-1. Partially mitigated by new dead-registry `docker image inspect` guard |
| 4 | Sweep carried minors | ❌ **NOT DONE** — all eight carried items re-verified open (see consensus minors 1–8) |
| 5 | Traceability for `ci-runner-admission/` + `quality` job | ✅ **RESOLVED** — `tasks-orchestration.md:32-33` |

**No regression of previously resolved items** (R3 majors/minors, R4 blockers 1–2 re-spot-checked stable by both models independently).

---

## Traceability highlights

Coverage against CI-PORT-01–12 remains strong across tasks 1.x–5.3. R5's traceability gaps are closed: `ci-runner-admission/` and the `quality` job are now documented in `tasks-orchestration.md:32-33`. Residual gaps:

- Tasks **5.4 / 6.1 / 6.2 unchecked** (= HIGH-1) — the spec itself declares implementation "pending admitted-runner verification".
- Minor: duplicated-run line 141 drops the `e2e/` prefix in its own task reference.

---

## Dimension notes

- **D1 Correctness/Security**: strongest round yet; zero critical/high code defects. Posture held (validated project IDs, 0700/0600 modes, fail-closed guards, digest pins, sanitized diagnostics). Remaining exposure is operational (dir accumulation, layer growth) not exploitable.
- **D2 Constitution**: ≤200-line rule respected; no console.log; Zod validation upheld; ADR-031 matches implementation. Rules 1–2 are precisely what HIGH-1 enforces — the review cannot approve an unverifiable-by-execution state.
- **D4 Test-Spec Coherence**: major improvement — tautologies replaced with genuinely behavioral negatives; readiness-refusal AC finally tested after 3 rounds. Stubbed-docker suites remain the structural blind spot that only HIGH-1's execution can close.
- **D7 CI DX**: specific error messages retained; new inspect-guard failure output actionable.

---

## Required actions to clear REQUEST CHANGES

1. **Execute the admitted-runner proof (tasks 5.4/6.1/6.2)** — run the two-project concurrent verifier and full E2E matrix on a real self-hosted runner; attach evidence, explicitly capturing daemon-side digest resolution against the removed registry (HIGH-1).
2. **Sweep the cheap carried minors** — dedupe contract-spec runs, bound KAFKA ports, align scanner/sanitizer key sets, `-O`+symlink+mode guard on `source sidecar-images.env`, tmp+mv atomic writes, prune harness layers in teardown, add `phase: down` (or equivalent cleanup) to the `quality` job, rename the misleading step, quote expansions.
3. *(Optional, cheap)* Pin the harness base image digest; document the runtime-config.js bind-mount write-ordering invariant; validate `inputs.purpose` against an allowlist; fix lifecycle-test fixture port and CURL_LOG assertion.

Once action 1 lands with evidence, this changeset is approvable even if only the cheapest subset of action 2 is addressed (the remainder can ride as tracked follow-ups).
