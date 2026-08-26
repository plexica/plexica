# FORGE Adversarial Review — Spec 010 CI Dynamic Ports — Round 6 (PEER)

- **Date**: 2026-08-23
- **Scope**: uncommitted working tree (~76 modified files +1911/−400 plus untracked `.github/actions/ci-runner-admission/`, `apps/*/e2e/`, `e2e/keycloak/`, `services/core-api/src/lib|modules/plugin/services`, `infra/docker/`, modified workflows and `docker-compose.ci.yml`). No round-6 primary report was consulted.
- **Method**: independent peer-model adversarial review (`forge-reviewer-peer`). Spec artifacts (tech-spec.md, tasks.md, tasks-orchestration.md) read in full; R5 peer report consulted only for remediation tracking, then every item re-derived from current file contents. This session had **no shell tool** — all findings are from direct file reading; where a claim depends on runtime behavior it is labeled with an orchestrator verification command.
- **Round-6 focus**: completeness/correctness of the R5 CRITICAL-1 fix, behavioral quality of the new negative tests, regressions of R3–R5 resolutions, and fresh defects introduced by the fix round itself.

---

## Verdict

# REQUEST CHANGES

The R5 CRITICAL is **genuinely fixed** — the eager-load `${VAR:?}` family was eliminated by moving late-discovered origins into a pre-created `browser-endpoints.env` env_file, and the regression test now runs a *real, unstubbed* `docker compose config` without those variables. The readiness-refusal negatives are now behavioral (poisoned inputs, asserted failures), not string greps. What remains blocking is not a code defect but the **still-unexecuted accepted-runner end-to-end proof** (tasks 5.4/6.1): after six rounds, the spec's central acceptance (two-project concurrency, A-down/B-survives, daemon-side digest resolution) has never run on a real runner, which Constitution Rules 1–2 make a merge precondition. All eight carried minors from R4/R5 were also left untouched despite being an explicit R5 required action.

### Severity counts

| Severity | Count |
|---|---|
| CRITICAL | 0 |
| HIGH | 1 |
| MEDIUM | 0 |
| MINOR | 10 |
| NIT | 2 |

---

## HIGH findings

### [PEER][HIGH-1] Completeness/Test-Spec Coherence — Admitted-runner end-to-end proof (tasks 5.4 / 6.1) still never executed; every real-runner-only acceptance claim remains unproven

**Files**:
- `.forge/specs/010-ci-dynamic-ports/tasks-orchestration.md:8` — status header: *"pending admitted-runner verification (5.4 `--full-e2e` execution, 6.1, 6.2 open)"*
- `.forge/specs/010-ci-dynamic-ports/tasks-orchestration.md:39-42` — task 5.4 checkbox `[ ]` with honest note: *"the `--full-e2e` EXECUTION on an admitted runner is still pending"*
- `.forge/specs/010-ci-dynamic-ports/tasks-orchestration.md:52` — task 6.1 checkbox `[ ]`

**Why this blocks**: tech-spec.md's acceptance criteria — two concurrent projects with disjoint everything, A-down/B-survives tuple stability (`verify-concurrent-ci-runtime.sh:163-177`), issuer-port observation, plugin proxy routing through the derived alias, and container creation of `name@sha256:` refs against a torn-down registry — are only exercised by `--full-e2e`, which has never been run. R5's specific worry (daemon digest resolution against the dead ephemeral registry) now has a cheap local guard (`verify-ci-sidecar-lifecycle.sh:40-46` adds `docker image inspect "$CI_SIDECAR_HARNESS_IMAGE"` after registry teardown — good), but the guard itself has also never executed outside stubs. Constitution Rule 2 (no merge without green unit+integration+E2E CI) makes this a hard merge gate, not an advisory gap. Sixth consecutive round carrying this.

**Required action**: run the `ci-runtime-contract` and `ci` jobs on a real `[self-hosted, plexica-ci-concurrent-e2e]` runner; attach the sentinel artifacts (`a-b-port-sentinel.txt`, admission.env, diagnostics) as evidence against tasks 5.4/6.1, then check the boxes.

---

## MINOR findings

1. **[PEER][MINOR-1] Duplicated contract-spec runs remain** (carried R4, R5) — `.github/actions/docker-infra/scripts/verify-concurrent-ci-runtime.sh:138-141`: lines 140-141 repeat 138-139 verbatim (web and admin contract specs each run twice per project on the retry-prohibited, 90-min-capped critical path); line 141 also drops the `e2e/` prefix (Playwright treats positional args as regex, so harmless but confusing incomplete-edit artifact). Fix: delete lines 140-141.
2. **[PEER][MINOR-2] `KAFKA_BROKERS` port unbounded** (carried R3→R5) — `.github/actions/docker-infra/scripts/ci-runtime-endpoint-contract.mjs:66` and `e2e/ci-runtime-manifest.ts:80` accept `/^127\.0\.0\.1:[1-9][0-9]*$/` (ports >65535 pass) while every URL-valued manifest entry bounds at 65535 (`ci-runtime-manifest.ts:26-40`). Fix: bound to ≤65535.
3. **[PEER][MINOR-3] Fail-closed diagnostics scanner omits `user` keys** (carried R4→R5) — `scan-ci-runtime-diagnostics.mjs:7,10` forbidden-key lists lack `user(?:name)?` while the sanitizer redacts them (`sanitize-ci-runtime-diagnostics.mjs:7` includes `user(?:name)?` and `keycloak[_-]?admin[_-]?user` at `:37`). A leaked raw `KEYCLOAK_ADMIN_USER=ci-admin-…` line would pass the scan that exists precisely to block it. Fix: align key lists.
4. **[PEER][MINOR-4] Idempotent branch sources `sidecar-images.env` with no ownership/symlink/format guard** (carried R4→R5) — `verify-ci-sidecar-lifecycle.sh:22-24` greps for a digest-shaped line then `source`s the file directly; unlike `admission.env` (`:12`) there is no `-O`/`! -L`/0600 check, and unlike the rebuild branch (`:35`) the resulting `CI_SIDECAR_HARNESS_IMAGE` is never format-re-checked before use in docker commands. Mitigated by the 0700/owner-only runtime dir, but inconsistent with the file's own guard discipline. Fix: reuse the `[[ -f && -O && ! -L && mode == 600 ]]` guard and re-assert the digest shape after sourcing.
5. **[PEER][MINOR-5] Non-atomic Keycloak credentials write with fail-stuck semantics** (carried R4 Nit→R5 Minor) — `ci-runtime-keycloak-credentials.sh:32-34` writes credentials directly to the final path under `umask 077`; a mid-write crash leaves a permanently invalid file that `valid()` (`:22`) rejects on every retry until manual cleanup. Note: this file is *not* bind-mounted, so tmp+mv is safe here (see NIT-2 for the files where it is not). Fix: tmp+mv as `publish-sidecar-images.sh:58-63` already does.
6. **[PEER][MINOR-6] Sidecar harness layers accumulate in the daemon store** (carried R4→R5) — `verify-ci-sidecar-lifecycle.sh:26` cleanup removes only the tag; neither the teardown path (`down-ci-runtime-project.sh`) nor anywhere else prunes dangling layers, slowly eroding the 60 GiB Docker-root admission threshold (`verify-ci-runner-capacity.sh:45`). Fix: scoped `docker image prune -f --filter label=…` or remove-by-digest in teardown.
7. **[PEER][MINOR-7] New: `quality` job (and the contract-job orchestrator project) never tears down its admitted runtime directory** — `.github/actions/ci-runner-admission/action.yml:14` creates `$RUNNER_TEMP/plexica-ci/<project>` with admission evidence (`verify-ci-runner-capacity.sh:46-48`), but the `quality` job (`.github/workflows/ci.yml:56-83`) ends at artifact upload with no docker-infra `down`/diagnostics phase; the contract job similarly downs projects A/B (`verify-concurrent-ci-runtime.sh:172`) but never removes the orchestrator's own `plexica-ci-contract-*` directory. On a long-lived self-hosted runner these accumulate indefinitely. Fix: add a `phase: down` step (or best-effort scoped `rm -rf` via the validated teardown script) to `quality`.
8. **[PEER][MINOR-8] Unquoted expansions in teardown selection loops** (carried R4 SC2086) — `down-ci-runtime-project.sh:11-12,17-18,28`: `$resources`/`$sidecars` rely on word-splitting of `docker ps -aq` output (safe for hex IDs today, but shellcheck-visible and fragile if selection ever changes). Fix: mapfile/array iteration.
9. **[PEER][MINOR-9] Misleading workflow step name** (carried R5) — `.github/workflows/ci.yml:144-145`: step "Migrate through the host manifest" runs only `test -f "$CI_RUNTIME_DIR/host.env"`; migrations actually happen inside `wait-services.sh:25-26`. Fix: rename the step (e.g., "Assert host manifest exists").
10. **[PEER][MINOR-10] `runtime-config.js` written in place, undocumented exception to the atomic-write rule** — `.github/actions/docker-infra/scripts/ci-runtime-env.sh:49` truncates and rewrites `runtime-config.js` directly (`node -e … > "$dir/runtime-config.js"`), unlike every env file which uses tmp+mv (`:28`). The in-place write is actually *required* here (see NIT-2), but nothing documents that, so a future consistency "fix" to tmp+mv would silently break the bind-mounted projection in already-created web-e2e/admin-e2e containers (they would keep reading the old, empty inode). Fix: add a comment stating the bind-mount/inode constraint.

## NIT findings

1. **[PEER][NIT-1] Unpinned harness base image** (carried R3→R5) — `infra/docker/ci-sidecar-harness.Dockerfile:1`: `FROM node:24-bookworm` vs repo-wide digest-pinning standard (even runtime-resolved `registry:2` is digest-pinned via `publish-sidecar-images.sh:23-30`).
2. **[PEER][NIT-2] Intentional non-atomicity of bind-mounted artifacts is implicit and fragile** — `ci-runtime-compose.sh:44` (`redpanda-listener.env`) and `ci-runtime-env.sh:49` (`runtime-config.js`) must be written in place because both are bind-mounted into containers created *before* the writes complete (`start-services.sh:18-20`, `wait-services.sh:34-37`); a tmp+mv rename would leave the mount pointing at the stale empty inode created by `init` (`ci-runtime-env.sh:38`). Correct today, but the invariant lives only in reviewers' heads. Fix: comment at both sites. (Related carried nit: inline `${{ inputs.purpose }}` interpolation persists at `.github/actions/ci-runner-admission/action.yml:13`; callers pass fixed literals so impact is theoretical.)

---

## Prior-round remediation verification (independently re-checked in current code)

| R5 required action | Status | Evidence (current tree) |
|---|---|---|
| **1. Fix CRITICAL-1** (public-base vars required at every compose load) | ✅ **RESOLVED — verified complete and correct** | Origins removed from Compose interpolation entirely: `keycloak-init` now receives them via `env_file: ${CI_RUNTIME_DIR:?}/browser-endpoints.env` (`docker-compose.ci.yml:15-19`) and reconcilers read `ADMIN_E2E_PUBLIC_BASE`/`WEB_E2E_PUBLIC_BASE` directly under `CI_RUNTIME_CONTRACT=1` with fail-closed presence+format checks (`infra/keycloak/reconcile-admin-client.sh:8-17`, `reconcile-tenant-clients.sh:9-14`); `core-api-e2e` gets the issuer from the same env_file (`docker-compose.ci-runtime-services.yml:14`, consumed at create time — Core needs only `KEYCLOAK_PUBLIC_ISSUER_BASE`, verified: no `WEB_/ADMIN_E2E_PUBLIC_BASE` references exist in `services/core-api/src`). `init` pre-creates `browser-endpoints.env` (and `sidecar-images.env`) empty with an explanatory comment (`ci-runtime-env.sh:34-38`). Remaining eager requirements are exactly `CI_RUNTIME_DIR`/`CI_COMPOSE_PROJECT` (grep of all four compose files confirms — no other `:?`), and both are exported before the FIRST compose invocation on **both** job paths: build path via admission `$GITHUB_ENV` (`ci-runner-admission/action.yml:15`, admission is the first post-checkout step, `ci.yml:92`) before `start-services.sh:14-16`; contract path via inline per-invocation env (`verify-concurrent-ci-runtime.sh:13-14,44-45`) after `init` at `:151-152`. The regression test runs a **real unstubbed** `docker compose config` with all three vars `env -u`'d on a fresh runtime dir (`verify-ci-compose-render.test.sh:80-87`), then simulates late discovery and asserts the rendered model embeds the values in the right consumers (`:90-103`), plus a static anti-regression grep (`:75-79`). Production render guard mirrors the `env -u` (`verify-ci-compose-render.sh:23-24`). Static trace of the load-time requirement graph finds no remaining sibling of this defect class. |
| **2. Behavioral negative tests for readiness-gate refusal** | ✅ **RESOLVED** | Tautological grep replaced by a behavioral suite: `ci-runtime-lifecycle.test.sh` drives the real `ci-runtime-compose.sh` staged writes against mocked docker/curl, then feeds a **stale mapping** (`WEB_E2E_PUBLIC_BASE=http://127.0.0.1:39999`, curl stub exiting 7) and asserts `verify-health.sh` fails (`:88-103`), then a **wrong runtime projection** (issuer `127.0.0.1:99999`) asserting failure with the exact message (`:105-117`). `wait-services.test.sh:58-96` poisons `docker compose port web-e2e` to return the stale port, asserts the full `wait-services.sh` fails closed, that the refused URL was actually probed, and that Playwright was **never invoked** (`:94`). tech-spec.md:119-125 updated to describe the proven refusal branch. Both are genuine poisoned-input behavioral tests, not string greps. |
| **3. Execute admitted-runner end-to-end proof (5.4/6.1)** | ❌ **NOT DONE** (⚠️ partially mitigated) | Tasks 5.4/6.1 checkboxes still `[ ]` (`tasks-orchestration.md:39-42,52`). Mitigation added: dead-registry digest-resolution now has a local `docker image inspect` fail-closed check (`verify-ci-sidecar-lifecycle.sh:40-46`) implementing R5's suggested cheap guard — but that check and the whole `--full-e2e` flow remain unexecuted on real infrastructure. Elevated to HIGH-1. |
| **4. Sweep carried minors** | ❌ **NOT DONE** | All eight listed items verified still open in current tree: duplicated runs (`verify-concurrent-ci-runtime.sh:138-141` → MINOR-1), KAFKA bounds (MINOR-2), scanner user keys (MINOR-3), raw `source sidecar-images.env` (MINOR-4), blob accumulation (MINOR-6), non-atomic credentials write (MINOR-5), SC2086 (MINOR-8), step name (MINOR-9). |
| **5. Traceability entries for `ci-runner-admission/` and the `quality` job** | ✅ **RESOLVED** | `tasks-orchestration.md:32-33`: task 5.3 Files now lists "create `.github/actions/ci-runner-admission/action.yml` (composite admission wrapper invoked by every job)" and its Implementation paragraph explicitly covers bringing the pre-existing `quality` job under the same contract with its own admission artifact. |

**Regression check of earlier resolved items**: no regression found. Spot-reverified stable: strict loopback `endpoint()` rejection (`ci-runtime-compose.sh:16-18`), anchored manifest sentinel regex (`verify-concurrent-ci-runtime.sh:88`), BASH_SOURCE-derived roots (start/wait/down/compose scripts), validated project IDs (`ci-runtime-path.sh:4,32,45`), 0700/0600 modes with owner/symlink guards, atomic dual-env writer with `%q` round-trip tests, honest "pending" status headers (`tasks.md:8`, `tasks-orchestration.md:8`), file-length rule respected (largest inspected: `verify-concurrent-ci-runtime.sh` 177, `reconcile-admin-client.sh` 128, `ci.yml` 172 — all ≤200).

---

## Fresh-defect scan of the fix round itself

Specifically hunted for new defects introduced by the R5 fixes; results:

- **env_file + `%q` interplay**: browser-endpoints.env/container.env values are shell-`%q`-quoted (`ci-runtime-env.sh:25`) but consumed by Compose's dotenv parser. All contract-approved values (loopback URLs, base64url secrets, hex keys) contain no shell metacharacters, so `%q` is identity — verified safe for every key written today. Fragile if a future approved value ever contains `$`, `#`, or quotes; covered implicitly by the endpoint-contract validators.
- **Create-before-populate ordering**: `core-api-e2e` is created (`wait-services.sh:31`) after `sidecar-images.env` is populated (`:28`) and after the issuer lands in `browser-endpoints.env` (`ci-runtime-compose.sh:39`, deliberately at infra time — commented at `:37-38`); `web/admin-e2e` created (`:34`) after `runtime-config.js` exists (pre-created by init) and started (`:37`) after `browser-config` populates it; `keycloak-init` started (`:38`) only after write-browser (`:53` comment). Ordering traced end-to-end: correct, including the bind-mount-inode constraint noted in MINOR-10/NIT-2.
- **Empty env_file at first load**: Compose accepts a zero-byte env_file; the unstubbed regression test proves this against real Compose when Docker is available (`verify-ci-compose-render.test.sh:69`).
- No new eager-load `${VAR:?}` was introduced anywhere (grep over all compose files: only `CI_RUNTIME_DIR`/`CI_COMPOSE_PROJECT` remain).

---

## Traceability highlights vs spec tasks / ACs

| Change area | Coverage | Verdict |
|---|---|---|
| Admission composite action + capacity gate | Task 1.1 / 5.3; CI-PORT-10/11; now listed in tasks-orchestration 5.3 Files | Covered (traceability gap from R5 closed) |
| `browser-endpoints.env` mechanism (init pre-create, write-browser-endpoints, consumer env_files, reconciler fail-closed reads) | Task 1.2/2.3; CI-PORT-03/06/08 | Covered; behavioral + unstubbed render tests |
| Staged lifecycle + readiness refusal negatives | Task 5.1; tech-spec:119-125 | Covered behaviorally (was R5 MEDIUM-1/MEDIUM-3) |
| Dead-registry digest-resolution guard | Task 5.4 intent; CI-PORT-07 | Authored + unit-level; **execution pending** (HIGH-1) |
| Two-project verifier | Task 5.4; A-down/B-survives AC | Authored, honestly marked pending; duplicated-spec lines remain (MINOR-1) |
| `quality` job teardown | CI-PORT-01/11 spirit | **Gap**: runtime dir never removed (MINOR-7) |
| Tasks 6.1/6.2 | Final matrix + review | Open by design; 6.2 is satisfied in-progress by this review round |

## Dimension-by-dimension notes

- **D1 Correctness/Security**: no new correctness defect found; the eager-load class is closed with test evidence. Security posture unchanged-strong (validated project IDs, owner/mode guards, digest-pinned images, sanitized+scanned diagnostics, scoped teardown with foreign-selection refusal); residual gaps are the carried MINOR-3/4.
- **D2 Constitution**: Rules 1–2 are the open gate (HIGH-1). Rule 4 (≤200 lines) respected everywhere inspected. Rule 3 (one pattern) upheld. Rule 5: ADR-031 matches implementation (request-host Keycloak, admission labels, ephemeral registry trust boundary). Rule 6 N/A (uncommitted tree).
- **D3 Architecture**: overlay/include structure, DNS-only backchannels, and contract direction are consistent with the confirmed decisions; the env_file indirection is a clean resolution that removes interpolation-time coupling entirely.
- **D4 Test-Spec Coherence**: significantly improved this round — the two weakest spots from R5 (tautology, missing refusal AC) are now genuinely behavioral; remaining weakness is exclusively unexecuted real-infrastructure proof.
- **D5 Performance/Reliability**: duplicated contract specs (MINOR-1) and blob accumulation (MINOR-6) persist on the timeout-capped path; runtime-dir leakage newly flagged (MINOR-7).
- **D6 Documentation/Traceability**: tasks/spec updated honestly; the bind-mount non-atomicity invariant is undocumented (NIT-2/MINOR-10).
- **D7 UX (CI DX)**: failure messages remain specific and actionable; artifact uploads `if: always()` + `if-no-files-found: error`; main residual DX hazard is that all of this is still unexercised on real hardware.

## Summary

Summary: 13 issues found. 0 CRITICAL, 1 HIGH (blocking, process/evidence gate), 0 MEDIUM, 10 MINOR, 2 NIT.
Recommendation: **REQUEST CHANGES** — the R5 blocker family is properly fixed and well-tested; what remains before merge is (a) executing the admitted-runner `--full-e2e` proof and attaching evidence for tasks 5.4/6.1 (HIGH-1, Constitution Rules 1–2), and (b) the cheap carried-minor sweep (MINOR-1/2/3 especially, all three-round carryovers). No code change is required for the CRITICAL/HIGH classes of Rounds 2–5.

### Orchestrator verification for the closed blocker class (static claims)

```bash
runtime=$(RUNNER_TEMP=$(mktemp -d) bash .github/actions/docker-infra/scripts/ci-runtime-env.sh init plexica-ci-verify-123456)
env -u WEB_E2E_PUBLIC_BASE -u ADMIN_E2E_PUBLIC_BASE -u KEYCLOAK_PUBLIC_ISSUER_BASE \
  CI_COMPOSE_PROJECT=plexica-ci-verify-123456 CI_RUNTIME_DIR="$runtime" \
  docker compose -f docker-compose.yml -f docker-compose.ci.yml config >/dev/null
# Expected in R5: exit 1 (required variable … missing). Expected now: exit 0.
bash .github/actions/docker-infra/scripts/ci-runtime-lifecycle.test.sh
bash .github/actions/docker-infra/scripts/wait-services.test.sh
bash .github/actions/docker-infra/scripts/verify-ci-compose-render.test.sh   # includes the unstubbed fresh-dir case when Docker is present
```
