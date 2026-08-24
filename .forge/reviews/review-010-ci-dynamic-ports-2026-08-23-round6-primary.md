# FORGE Adversarial Review — Spec 010 CI Dynamic Ports — Round 6 (PRIMARY)

- **Date**: 2026-08-23
- **Scope**: uncommitted working tree (~76 modified files, +1911/−400, plus untracked files under `.github/actions/ci-runner-admission/`, `.github/actions/docker-infra/scripts/`, `apps/*/e2e/`, `e2e/keycloak/`, `services/core-api/src/lib|modules/plugin/services/`, `infra/docker/`, modified CI workflows and `docker-compose.ci.yml`).
- **Method**: fully independent primary-model adversarial review. No Round-6 report was read or referenced. Rounds ≤5 reports consulted only for remediation tracking; every status below re-derived from current file contents by direct reading. Spec artifacts (`tech-spec.md`, `tasks.md`, `tasks-orchestration.md`) read in full.
- **Execution caveat**: this session has **no shell tool**; nothing was executed. All claims are statically derived from file contents and documented Compose/Docker semantics; orchestrator verification commands are provided where a claim is runtime-dependent.

---

## Verdict

# REQUEST CHANGES

The Round-5 CRITICAL is **fixed correctly and completely** (verified below across every load path), and both demanded behavioral negative-test suites exist and are genuinely behavioral. What blocks approval now is not a code defect but the still-absent **executed** admitted-runner proof (tasks 5.4/6.1/6.2 unchecked, zero recorded green full-E2E run against real Docker) — the exact discharge criterion the Round-5 review made explicit — plus eight carried MINORs that have now survived two to four rounds untouched. No CRITICAL or HIGH defect was found this round, and no previously resolved item regressed.

### Severity counts

| Severity | Count |
|---|---|
| CRITICAL | 0 |
| HIGH | 0 |
| MEDIUM | 1 |
| MINOR | 8 |
| NIT | 3 |

---

## CRITICAL findings

None. The Round-5 CRITICAL-1 family is closed; see remediation table for the full verification trace.

## HIGH findings

None.

---

## MEDIUM findings

### [PRIMARY][MEDIUM-1] Completeness/Constitution — The admitted-runner end-to-end proof has still never been executed; every Docker-touching suite in the tree stubs `docker`, so the pipeline's real wiring remains unproven by any recorded run

**Files**:
- `.forge/specs/010-ci-dynamic-ports/tasks-orchestration.md:8` — status line itself admits: *"Implementation complete — pending admitted-runner verification (5.4 `--full-e2e` execution, 6.1, 6.2 open)"*; task 5.4 checkbox unchecked (:39-42), 6.1/6.2 unchecked (:52, :60).
- Corroborating stub coverage: `wait-services.test.sh:12-44` (docker/curl/pnpm stubs), `ci-runtime-compose.test.sh:11-28`, `verify-concurrent-ci-runtime.test.sh:7-56` (all helpers replaced by log-and-return stubs), `verify-ci-sidecar-lifecycle.test.sh:15-19`.

**Why this matters**: Rounds 2–5 each surfaced a defect class that *only* manifests on real Compose/Docker wiring (load-time interpolation, digest resolution against a dead registry, bind-mount timing) while every stubbed suite stayed green. This round's fixes were again validated almost exclusively by stubbed tests plus one conditional unstubbed render (`verify-ci-compose-render.test.sh:69` skips silently when Docker is absent). Until `verify-concurrent-ci-runtime.sh --full-e2e` has passed once on an admitted runner, assumptions such as "Compose resolves `name@sha256:` from the local store after registry teardown", "`up -d --wait` tolerates the staged listener contract", and "bind-mounted `runtime-config.js` content written between create and start is served by Vite preview" remain unproven. Note the mitigating design improvement this round: `verify-ci-sidecar-lifecycle.sh:43-46` now fails closed on exactly the dead-registry digest assumption (`docker image inspect` before the in-container proof), with behavioral negatives (`verify-ci-sidecar-lifecycle.test.sh:83-111`) — but a fail-closed guard proves refusal, not success.
**Impact**: merge proceeds on an unexecuted acceptance criterion (tech-spec.md:138-140 delivery verification; Constitution Rules 1–2 pressure). If any runtime assumption fails, CI goes red on main-bound PRs with expensive debugging far from cause.
**Suggestion**: execute task 5.4 (`bash .github/actions/docker-infra/scripts/verify-concurrent-ci-runtime.sh --full-e2e`) on an admitted runner, capture the sentinel artifact + sidecar digest-resolution log lines as review evidence, then tick 5.4/6.1/6.2. This is also self-enforcing at merge time because the `ci-runtime-contract` job (ci.yml:39-44) runs the verifier — but the evidence must exist and be attached per task 6.2.

---

## MINOR findings

1. **[PRIMARY][MINOR-1] Contract specs still run twice per project in the verifier hot path** — `.github/actions/docker-infra/scripts/verify-concurrent-ci-runtime.sh:138-141`: lines 140-141 repeat 138-139 verbatim (each contract spec runs twice per `verify_project`), and line 141 drops the `e2e/` prefix (incomplete-edit artifact; works only because Playwright treats positional args as regex). OPEN since R4. Fix: delete lines 140-141.
2. **[PRIMARY][MINOR-2] `KAFKA_BROKERS` port still unbounded above 65535** — `ci-runtime-endpoint-contract.mjs:66` and `e2e/ci-runtime-manifest.ts:80` accept `/^127\.0\.0\.1:[1-9][0-9]*$/` while every URL-valued manifest entry bounds ≤65535 (`ci-runtime-manifest.ts:26-40`). OPEN since R3. Fix: bound the port numerically in both validators.
3. **[PRIMARY][MINOR-3] Fail-closed diagnostics scanner still omits `user`/`username` keys** — `scan-ci-runtime-diagnostics.mjs:7` (forbidden pattern) and `:10` (registry filter) lack `user(?:name)?`, while the sanitizer covers them (`sanitize-ci-runtime-diagnostics.mjs:7`). A leak reaching diagnostics through a non-sanitizing path passes the scan that exists to block it. OPEN since R4. Fix: align key lists.
4. **[PRIMARY][MINOR-4] Raw `source` of `sidecar-images.env` still bypasses ownership/mode re-validation** — `verify-ci-sidecar-lifecycle.sh:22-24` and `:33-34` grep one line pattern then source directly; unlike `host.env` (`ci-runtime-env.sh:55`), `admission.env` (:12) and credentials (`ci-runtime-keycloak-credentials.sh:17-20`) there is no `-O`/symlink/0600 guard. Same shape as the previously fixed host.env bypass. OPEN since R4. Fix: reuse the standard guard.
5. **[PRIMARY][MINOR-5] Harness image layers still accumulate in the daemon store** — `verify-ci-sidecar-lifecycle.sh:26` removes only the build tag; the pushed digest-referenced layers persist (nothing prunes them; `down-ci-runtime-project.sh` handles Compose resources only), eroding the 60 GiB admission threshold (`verify-ci-runner-capacity.sh:45`). OPEN since R4. Fix: scoped prune or remove-by-digest in teardown.
6. **[PRIMARY][MINOR-6] Non-atomic writes to final paths persist — now including `admission.env`** — `ci-runtime-keycloak-credentials.sh:32-35` (truncating redirect of credential material; mid-write crash leaves a permanently invalid file that `valid()` rejects until manual cleanup), `ci-runtime-compose.sh:44` (`redpanda-listener.env`), and `verify-ci-runner-capacity.sh:47-48` (`admission.env`; flock-bounded and fail-closed via the `project=` grep at `verify-ci-sidecar-lifecycle.sh:15`, so lower impact, but the same pattern). OPEN since R4. Fix: tmp+mv as `publish-sidecar-images.sh:58-63` already does.
7. **[PRIMARY][MINOR-7] Misleading workflow step name unchanged** — `ci.yml:144-145` "Migrate through the host manifest" still runs only `test -f "$CI_RUNTIME_DIR/host.env"`; migrations happen in `wait-services.sh:25-26`. Misleads anyone auditing migration direction from the workflow alone. OPEN since R5. Fix: rename the step.
8. **[PRIMARY][MINOR-8] Job-owned runtime directories accumulate forever on persistent runners** — the admission action creates `$RUNNER_TEMP/plexica-ci/<project>` per job (`.github/actions/ci-runner-admission/action.yml:14`), but teardown only ever removes verifier project dirs (`down-ci-runtime-project.sh:31-32` via `verify-concurrent-ci-runtime.sh:35` and the `down` phase); the `contract`/`quality`/`build` jobs' own admission dirs are never swept, and `init_ci_runtime` refuses pre-existing dirs rather than recycling them (`ci-runtime-path.sh:35-37`). Carried as a D6 observation since R5, now logged explicitly: unbounded disk/inode growth on long-lived self-hosted runners. Fix: stale-directory sweep (by mtime, scope-label safe) in admission or a final `always()` cleanup step.

## NIT findings

1. **[PRIMARY][NIT-1] Unpinned harness base image** — `infra/docker/ci-sidecar-harness.Dockerfile:1`: `FROM node:24-bookworm` vs the digest-pinning standard enforced everywhere else in this very changeset (e.g., `docker-compose.ci-runtime-services.yml:4`). OPEN since R3.
2. **[PRIMARY][NIT-2] Unquoted expansions (SC2086)** — `down-ci-runtime-project.sh:12,28` (`for id in $resources`, `docker rm -f $sidecars`). Safe today (hex IDs from `docker ps -aq`), but quote or use arrays. OPEN since R5.
3. **[PRIMARY][NIT-3] Test-hygiene nits in the new lifecycle suite** — `ci-runtime-lifecycle.test.sh:110` uses `http://127.0.0.1:99999` (port >65535) as the poisoned issuer fixture, normalizing a value the contract validators reject elsewhere; `:114` sets `CURL_LOG="$temp/curl-wrong.log"` without creating or asserting the file (dead variable next to live siblings at :75/:98). Cosmetic.

---

## Prior-round remediation verification (independently re-checked in current code)

| R5 required action | Status | Evidence (current tree, read directly) |
|---|---|---|
| **1. Fix CRITICAL-1** (three public-base vars required at every compose load) | ✅ **RESOLVED** | Chosen fix = R5 alternative #3, implemented cleanly: the `:?required` interpolations are gone from both overlays (`docker-compose.ci.yml`, `infra/compose/docker-compose.ci-runtime-services.yml` — exhaustive repo grep for `${WEB_E2E_PUBLIC_BASE:`-style eager requirements now matches only review files); origins flow through `browser-endpoints.env`, an `env_file` resolved at container-create time, pre-created empty by `init` (`ci-runtime-env.sh:38` with explanatory comment :34-37). **Ordering traced end-to-end**: issuer lands in `browser-endpoints.env` at write-infra (`ci-runtime-compose.sh:39`) before `core-api-e2e` create (`wait-services.sh:31`); web/admin origins land at write-browser (`ci-runtime-compose.sh:54`) before `keycloak-init` up (`wait-services.sh:38`); web/admin containers are created (:34) against the pre-created empty `runtime-config.js` mount and started (:37) only after `browser-config` writes it (:35). **Both job paths verified relative to first compose call**: `ci` job — admission exports `CI_COMPOSE_PROJECT`/`CI_RUNTIME_DIR` via `$GITHUB_ENV` (`ci-runner-admission/action.yml:15`) immediately post-checkout; first compose invocation is the render gate inside `start-services.sh:14`, which now renders with `env -u WEB_E2E_PUBLIC_BASE -u ADMIN_E2E_PUBLIC_BASE -u KEYCLOAK_PUBLIC_ISSUER_BASE` (`verify-ci-compose-render.sh:23-24`) and succeeds because only `${CI_RUNTIME_DIR:?}`/`${CI_COMPOSE_PROJECT:?}` remain as load-time requirements. Contract job — `bootstrap()` sets both vars inline per command (`verify-concurrent-ci-runtime.sh:43-45`). **Hunt for NEW eager requirements**: repo-wide `:\?` grep over YAML finds only the two early-exported vars plus pre-existing `E2E_POSTGRES_TLS_SOURCE` in `docker-compose.e2e-production.yml`, which is not in the include chain (`docker-compose.yml:5-11` includes only database-auth/platform-services/observability; the CI overlay adds only `ci-runtime-services.yml`). **Regression test is genuinely unstubbed**: `verify-ci-compose-render.test.sh:69-103` runs real `docker compose config` from a fresh init dir with all three vars unset (`env -u`, :82-83, :94-95), asserts success (:85-87), then simulates late discovery and asserts the rendered model embeds the discovered values in `core-api-e2e` and `keycloak-init` (:90-103) — guarding placeholder leakage; a static grep guard backs it up for Docker-less environments (:75-79). Consumer-side fail-closed preserved: reconcile scripts reject missing/undiscovered origins under the contract (`reconcile-admin-client.sh:8-17`, `reconcile-tenant-clients.sh:9-16`); the render gate rejects a re-introduced static origin (`verify-ci-compose-render.sh:63`, negative test `verify-ci-compose-render.test.sh:53-55`). |
| **2. Behavioral negative tests for readiness-gate refusal** | ✅ **RESOLVED** | The tautological grep suite is gone. `ci-runtime-lifecycle.test.sh` is now behavioral: drives the real `ci-runtime-compose.sh` stages through mocked-docker discovery, asserts exact manifest artifacts (:55-72), a positive readiness pass asserting every discovered URL is requested (:74-84), a **stale-mapping refusal** (poisoned `WEB_E2E_PUBLIC_BASE=http://127.0.0.1:39999`, curl exit 7, nonzero exit + URL observed in curl log, :86-103), and a **wrong-projection refusal** (issuer mismatch in served `runtime-config.js` → nonzero exit + exact error message, :105-117). Additionally `wait-services.test.sh:58-96` runs the *entire* `wait-services.sh` with a poisoned `docker port` stub and asserts failure before Playwright (`commands-refused` contains no `playwright`, :94-95). These satisfy tech-spec.md:119-125 including its named negative-test requirement. |
| **3. Execute admitted-runner proof (tasks 5.4/6.1)** | ❌ **NOT DISCHARGED** | Tasks 5.4/6.1/6.2 remain unchecked; `tasks-orchestration.md:8` states execution is pending; no evidence artifacts referenced anywhere. Positive mitigation this round: the dead-registry digest assumption now fails closed with behavioral tests (`verify-ci-sidecar-lifecycle.sh:40-46`, `verify-ci-sidecar-lifecycle.test.sh:83-111`), and the `ci` job invokes the real proof (`ci.yml:146-147`, enforced by `ci-workflow-contract.test.mjs:29-30`). See MEDIUM-1. |
| **4. Sweep carried minors** (dup contract runs, KAFKA bounds, scanner keys, raw source, non-atomic writes, unpinned base, SC2086, step name) | ❌ **NOT ADDRESSED** | All eight re-verified open in current code: MINOR-1 (`verify-concurrent-ci-runtime.sh:138-141`), MINOR-2 (`ci-runtime-endpoint-contract.mjs:66`, `e2e/ci-runtime-manifest.ts:80`), MINOR-3 (`scan-ci-runtime-diagnostics.mjs:7,10`), MINOR-4 (`verify-ci-sidecar-lifecycle.sh:22-24,33-34`), MINOR-6 (`ci-runtime-keycloak-credentials.sh:32-35`, `ci-runtime-compose.sh:44`), NIT-1 (`ci-sidecar-harness.Dockerfile:1`), NIT-2 (`down-ci-runtime-project.sh:12,28`), MINOR-7 (`ci.yml:144-145`). |
| **5. Traceability for admission action + `quality` job** | ✅ **RESOLVED** | `tasks-orchestration.md:32` now lists `.github/actions/ci-runner-admission/action.yml` in task 5.3's Files; :33 explicitly brings the `quality` job under the contract (same runner label, admission post-checkout, scoped admission artifact) — matching implementation (`ci.yml:56-83`). |

### Regression check on earlier resolved items (spot re-verification)

| Prior resolution | Status |
|---|---|
| R4 BLOCKER-1 digest-pin grammar admits emitted loopback ref | STABLE — `sidecar-image.ts:6` regex unchanged; round-trip/near-miss tests intact (`sidecar-image.test.ts:91-107`). |
| R4 BLOCKER-2 `sidecar-images.env` pre-created before first render | STABLE — `ci-runtime-env.sh:38`, guarded by `verify-ci-compose-render.test.sh:73`. |
| R3 Major: full Playwright suites only at bootstrap; forbidden in `ci` job | STABLE — `verify-concurrent-ci-runtime.sh:49-52` (bootstrap) vs `ci-workflow-contract.test.mjs:34-35`. Residual duplication tracked as MINOR-1. |
| R3 Minor 10 endpoint() localhost rejection | STABLE — `ci-runtime-compose.sh:16-18` + negative `ci-runtime-compose.test.sh:55-68`. |
| R3 Minor 13 spec shims over shared flow | STABLE — both `apps/{web,admin}/e2e/ci-runtime-contract.spec.ts` shim `runCiRuntimeContractFlow`; flow asserts same-origin origin-equality, no direct Core-base request, header preservation, no wildcard CORS, no reflected foreign origin, `apiBase===''` (`ci-runtime-contract-flow.ts:67-105`). |
| Vite CI-only binding + exact proxy target fail-closed | STABLE — `apps/web/vite.config.ts:7-15,41,50` (spread-conditional host, throw on wrong target). |

No previously RESOLVED item regressed.

---

## Traceability highlights

- **[COVERED]** Admission → capacity/flock/evidence (`verify-ci-runner-capacity.sh`, thresholds :42-45 match CI-PORT-10; documented TOCTOU residual :23-27). Contract writer with per-entry validation + atomic 0600 replacement (`ci-runtime-env.sh:9-29`). Render/publication gate incl. legacy-port and static-origin rejection (`verify-ci-compose-render.sh:19-65`). Staged lifecycle ordering per tech-spec delivery steps 1–2 (`wait-services.sh` sequence). Two-project verifier with sentinels, disjoint-port, cross-project Keycloak rejection, byte-compare of B state after A teardown (`verify-concurrent-ci-runtime.sh:162-177`). Diagnostics sanitize→fail-scan pipeline with unsafe-artifact guard (`collect-ci-runtime-diagnostics.sh:31-53`). Workflow contract enforced negatively (`ci-workflow-contract.test.mjs`).
- **[NOT IMPLEMENTED]** Executed `--full-e2e` proof and final verification matrix (MEDIUM-1) — the spec's own status fields say so honestly.
- **[RESOLVED THIS ROUND]** [NO TASK] on the admission action and [ORPHAN CHANGE] on the `quality` job from R5 — both now recorded in task 5.3.
- Line-count discipline held in every inspected file (largest seen: `verify-concurrent-ci-runtime.sh` 177, `ci.yml` 172, `ci-runtime-lifecycle.test.sh` 117).

---

## Dimension-by-dimension notes

- **D1 Correctness & Security**: No correctness defect found this round; the eager-load family is closed with a design that is arguably better than the originally suggested placeholder export (no fake values can ever leak into containers, since values arrive only via create-time env_file). Security posture remains strong: strict project/dir validation everywhere (`ci-runtime-path.sh`), owner/symlink/mode guards on sourced artifacts (except MINOR-4), per-project derived Keycloak credentials with cross-project rejection probe, digest-pinned images end-to-end, socket-proxy allowlist unchanged, scoped teardown refusing foreign selection. Residual gaps are the carried MINORs 3/4/6.
- **D2 Architecture & Constitution**: No stack or pattern deviation. Rule 4 respected; no `console.log` in production paths; Zod/node validation on external inputs upheld; ADR-031 continues to match implementation. Rule 1/2 tension is exactly MEDIUM-1: the E2E proof exists as code but not as executed evidence.
- **D3 Code Quality & Maintainability**: helper-per-concern discipline intact; new `verify-health.sh` (30 lines) and `wait-for-http.sh` (16 lines) are focused and reusable. Long single-invocation lines in `write_infra`/`write_container_set` remain borderline readability (unchanged from R5).
- **D4 Test-Spec Coherence**: This round's strongest dimension. The tautology is gone; refusal ACs have genuine behavioral coverage in two independent suites; the unstubbed render regression test asserts both renderability without late variables and value propagation into the rendered model. Remaining coherence gap is only the executed-proof absence (MEDIUM-1) and the fixture nit NIT-3.
- **D5 Performance & Reliability**: duplicated contract specs on the retry-prohibited critical path (MINOR-1); harness layer accumulation (MINOR-5); job-dir accumulation (MINOR-8); non-atomic fail-stuck writes (MINOR-6). Concurrent bootstraps appropriately serialized at admission; verifier traps preserve exit codes correctly (`verify-concurrent-ci-runtime.sh:29-39`).
- **D6 Documentation & Traceability**: task statuses honest; R5's two traceability gaps closed; overlay comments explain the env_file lifecycle accurately (`docker-compose.ci.yml:15-23`, `ci-runtime-env.sh:34-37`, `ci-runtime-compose.sh:37-38,53`).
- **D7 UX Quality (CI DX)**: error messages remain specific and actionable throughout; artifacts upload with `if: always()` + `if-no-files-found: error`. The prior dominant hazard (bare "required variable … is missing" on fresh runners) is eliminated by design.

---

## Verification commands executed

None — no shell tool in this session. Static claims carry their own orchestrator commands:

| Claim | Command for orchestrator |
|---|---|
| No eager-load requirement remains | `env -u WEB_E2E_PUBLIC_BASE -u ADMIN_E2E_PUBLIC_BASE -u KEYCLOAK_PUBLIC_ISSUER_BASE CI_COMPOSE_PROJECT=<p> CI_RUNTIME_DIR=<fresh-init> docker compose --project-name <p> -f docker-compose.yml -f docker-compose.ci.yml config --quiet` → expect exit 0 |
| Full script suites | `bash .github/actions/docker-infra/scripts/*.test.sh && node .github/actions/docker-infra/scripts/*.test.mjs` |
| Discharge MEDIUM-1 | `CI_COMPOSE_PROJECT=<p> CI_RUNTIME_DIR=<dir> bash .github/actions/docker-infra/scripts/verify-concurrent-ci-runtime.sh --full-e2e` on an admitted runner; attach sentinel + sidecar digest-resolution evidence |

---

## Summary

Summary: 12 issues found. 0 CRITICAL, 0 HIGH, 1 MEDIUM, 8 MINOR, 3 NIT.
Recommendation: **REQUEST CHANGES** — the code-level blockers are gone: the Round-5 CRITICAL is fixed completely with a superior mechanism and a genuinely unstubbed regression test, and the readiness-refusal AC finally has real behavioral negative coverage. The single blocking item is discharging the still-unexecuted admitted-runner proof (task 5.4 `--full-e2e` + 6.1/6.2) with captured evidence — the exact criterion Round 5 set and the spec's own status lines acknowledge. While touching the tree, clear the eight carried MINORs (most are one-to-three-line fixes: delete duplicated verifier lines, bound the Kafka port, add `user(?:name)?` to two scanner patterns, reuse the existing file-guard, tmp+mv three writes, pin one base image, quote two expansions, rename one step) and add a stale-runtime-dir sweep. With the execution evidence attached, this changeset is ready for human review.
