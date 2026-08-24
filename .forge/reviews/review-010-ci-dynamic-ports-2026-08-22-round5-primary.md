# FORGE Adversarial Review — Spec 010 CI Dynamic Ports — Round 5 (PRIMARY)

- **Date**: 2026-08-22
- **Scope**: uncommitted working tree (`git status` + diff + untracked files), ~75 files, +1720/−394, plus ~40 new files under `.github/actions/`, `e2e/`, `apps/*/e2e`, `services/core-api`.
- **Method**: independent primary-model adversarial review. Spec artifacts (`tech-spec.md`, `plan.md`, `tasks.md`, `tasks-orchestration.md`) and ADR-031 read in full; prior rounds 1–4 and the Round-5 peer report consulted only for remediation tracking, then every status re-derived from current code by direct file reading.
- **Execution caveat**: this session had **no shell tool**, so no command was executed. All findings derive from static reading plus documented Docker Compose semantics. Runtime-dependent claims are labeled with a concrete orchestrator verification command. Notably, the decisive CRITICAL finding is *statically deterministic* from Compose interpolation rules and is corroborated by three independent code paths in the tree itself (see CRITICAL-1).

---

## Verdict

# REQUEST CHANGES

One CRITICAL defect of the same failure class that produced Rounds 2–4's blockers persists: green stubbed suites validate units in isolation while real fresh-runner Compose wiring fails closed before any container starts. The Round-4 blocker fixes were correctly implemented for what they covered (both verified in code below), but the eager-load requirement family was only partially addressed — one of four load-time requirements was fixed, three were not.

### Severity counts

| Severity | Count |
|---|---|
| CRITICAL | 1 |
| HIGH | 0 |
| MEDIUM | 3 |
| MINOR | 7 |
| NIT | 3 |

---

## CRITICAL findings

### [PRIMARY][CRITICAL-1] Correctness/Reliability — Compose requires `WEB_E2E_PUBLIC_BASE`, `ADMIN_E2E_PUBLIC_BASE`, `KEYCLOAK_PUBLIC_ISSUER_BASE` at every project load; no lifecycle stage or workflow step exports them before the first real Compose invocation → both CI jobs die at their first `compose create`

**Files**:
- `docker-compose.ci.yml:17-18` — `keycloak-init.environment`: `KEYCLOAK_ADMIN_ORIGIN: ${ADMIN_E2E_PUBLIC_BASE:?required}`, `KEYCLOAK_WEB_ORIGIN: ${WEB_E2E_PUBLIC_BASE:?required}`
- `infra/compose/docker-compose.ci-runtime-services.yml:18` — `core-api-e2e.environment.KEYCLOAK_PUBLIC_ISSUER_BASE: ${KEYCLOAK_PUBLIC_ISSUER_BASE:?required}` (and `:?required` on `CI_RUNTIME_DIR`/`CI_COMPOSE_PROJECT` throughout both files — those two ARE exported early and are fine)
- `.github/actions/docker-infra/scripts/start-services.sh:14-20` — line 14 runs `verify-ci-compose-render.sh` (which injects its own private placeholders, see below), then **line 16 `"${compose[@]}" create postgres redis minio keycloak mailpit loki` runs with none of the three variables set**
- `.github/actions/docker-infra/scripts/wait-services.sh:14` — `up -d --wait …` equally precedes any point where the values exist in the shell environment (infra-stage contract is sourced only at :22-23, complete stage at :36)
- `.github/actions/ci-runner-admission/action.yml:15` — writes only `CI_COMPOSE_PROJECT` and `CI_RUNTIME_DIR` to `$GITHUB_ENV`
- `.github/workflows/ci.yml` — verified by exhaustive read: the only `$GITHUB_ENV` writers are :31 and :106 (encryption material) and the admission action (:15). Nothing anywhere exports the three missing variables.
- `.github/actions/docker-infra/scripts/verify-concurrent-ci-runtime.sh:44-45` — contract-job `bootstrap()` calls `start-services.sh`/`wait-services.sh`; same failure.

**Why this matters**: Compose interpolates `${VAR:?err}` for the *entire merged model at project-load time*, before service selection and regardless of which services a `create`/`up` command names. On a clean admitted runner there is no repo `.env` (ADR-031 trust boundary: gitignored, never present). Therefore the very first Compose call of both jobs fails hard with `required variable ADMIN_E2E_PUBLIC_BASE is missing` — before any container exists. This is exactly R4 BLOCKER-2's class ("required at load, provided later"), of which R4 fixed only one member (`sidecar-images.env`).

**Corroborating in-tree evidence (three independent confirmations, all read directly)**:
1. The render gate itself must inject placeholder values just to make `compose config` parse: `verify-ci-compose-render.sh:20-26` defines `render_env=(WEB_E2E_PUBLIC_BASE=http://127.0.0.1:32000 ADMIN_E2E_PUBLIC_BASE=http://127.0.0.1:32001 KEYCLOAK_PUBLIC_ISSUER_BASE=http://127.0.0.1:32004)` with the comment *"the fail-closed compose variables are provided later in the runtime lifecycle"* — but they never are, in any shell that invokes real Compose.
2. The unstubbed regression test added for R4 BLOCKER-2 (`verify-ci-compose-render.test.sh:73-76`) must pass all three variables explicitly on its fresh-dir run — proving they are required at load while testing only the `env_file` half of the problem.
3. Inside `wait-services.sh`, later stages work only because `source-ci-runtime-host.sh` (`eval` of validated `export KEY=…` lines) puts the values into the process environment *after* :22/:36 — demonstrating the mechanism the earlier invocations lack.

**Deterministic consequences**: task 5.4's pending admitted-runner run cannot pass; the `ci` job dies inside the `phase: full` action's first step; the contract job dies inside `bootstrap()`. This also explains why every existing suite stays green: all Docker-touching tests stub `docker` entirely (`wait-services.test.sh:12-44`, `ci-runtime-compose.test.sh:11-28`, `verify-concurrent-ci-runtime.test.sh:29-56`), so no test ever loads the real overlay without the variables.

**Suggested fix** (minimal, preserves the fail-closed contract):
1. In both `start-services.sh` and `wait-services.sh`, immediately after `validate_ci_runtime` and *before any Compose invocation*, export loopback placeholders when unset:
   ```bash
   export WEB_E2E_PUBLIC_BASE="${WEB_E2E_PUBLIC_BASE:-http://127.0.0.1:1}" \
          ADMIN_E2E_PUBLIC_BASE="${ADMIN_E2E_PUBLIC_BASE:-http://127.0.0.1:1}" \
          KEYCLOAK_PUBLIC_ISSUER_BASE="${KEYCLOAK_PUBLIC_ISSUER_BASE:-http://127.0.0.1:1}"
   ```
   Ordering already guarantees correctness downstream: `wait-services.sh` sources the infra-stage contract (:22-23) before creating `core-api-e2e` (:31) — which is the only consumer whose *created config* embeds the issuer — and sources the complete stage (:36) before `start web-e2e admin-e2e` (:37) and `up keycloak-init` (:38), so no container is ever created with a placeholder baked in.
2. Add an unstubbed regression test that runs `docker compose -f docker-compose.yml -f docker-compose.ci.yml config` from a fresh runtime dir **without** those variables (expect success after fix 1) and asserts `core-api-e2e`'s rendered `KEYCLOAK_PUBLIC_ISSUER_BASE` equals the real manifest value after the complete-stage export (guarding against placeholder leakage into created containers).
3. Alternatively (equally valid): move `keycloak-init`'s origin injection out of the always-loaded overlay into a late-stage create-time env.

**Orchestrator verification (deterministic)**:
```
env -i PATH="$PATH" HOME="$HOME" CI_COMPOSE_PROJECT=plexica-ci-probe-123456 \
  CI_RUNTIME_DIR="$(RUNNER_TEMP=$(mktemp -d) bash .github/actions/docker-infra/scripts/ci-runtime-env.sh init plexica-ci-probe-123456)" \
  docker compose --project-name plexica-ci-probe-123456 -f docker-compose.yml -f docker-compose.ci.yml config --quiet
# Expected pre-fix: exit 1, "required variable ADMIN_E2E_PUBLIC_BASE is missing"
```
(No daemon operations — `config` only.)

---

## MEDIUM findings

### [PRIMARY][MEDIUM-1] Test-Spec Coherence — Task 5.1's lifecycle "verification" is a tautology; its stated acceptance has no behavioral test

**File**: `.github/actions/docker-infra/scripts/ci-runtime-lifecycle.test.sh:4-7` — the entire suite is:
```bash
for script in start-services.sh wait-services.sh verify-health.sh; do
  grep -F 'CI_COMPOSE_PROJECT' "$(dirname "$0")/$script" >/dev/null
done
grep -F 'WEB_E2E_PUBLIC_BASE' "$(dirname "$0")/verify-health.sh" >/dev/null
```
Task 5.1 (`tasks-orchestration.md:20`) requires: *"prove the host readiness gate fails for an altered mapping"*. A grep proves nothing about behavior. Combined with MEDIUM-2, the readiness-refusal acceptance criterion (tech-spec.md:119-123) has zero behavioral coverage.
**Fix**: replace with stubbed-docker cases feeding `verify-health.sh` a refused URL / tampered `runtime-config.js` body and asserting nonzero exit; the stub infrastructure in `wait-services.test.sh` already supports this shape.

### [PRIMARY][MEDIUM-2] Test-Spec Coherence — Readiness-gate refusal AC still untested (carried R3 #3 → R4 → now third round)

**File**: `.github/actions/docker-infra/scripts/wait-services.test.sh:35-38` — the `curl` stub always returns exactly the correct `runtime-config.js` body; there is no case simulating a stale port, refused connection, wrong issuer, or leaked `CORE_API_PUBLIC_BASE` in the served config. tech-spec.md:119-123 requires "a refused or wrong mapping fails the job". OPEN across three rounds.
**Fix**: add poisoned-mapping negatives to `wait-services.test.sh` (curl exit 7 / body containing `core-api-e2e` / mismatched `keycloakBase`) asserting failure, and ideally one exercising `verify-health.sh` end-to-end with a wrong mapping.

### [PRIMARY][MEDIUM-3] Performance/Reliability — Sidecar digest resolution against the removed ephemeral registry is unproven and cannot be discharged statically

**Files**: `publish-sidecar-images.sh:19,30,46-63` (registry removed at EXIT trap after pushing; `CI_SIDECAR_HARNESS_IMAGE=127.0.0.1:<port>/sidecar-harness@sha256:<64>` published); `docker-container-restart.ts:31` + `sidecar-image.ts:23-34` (Core creates/replaces by that ref); `verify-ci-sidecar-lifecycle.sh:40` (proof depends on it).
Container creation by `name@sha256:` against a dead registry succeeds only if the daemon resolves the digest purely from its local content store (plausible — the push at :46 records the manifest locally — but unverifiable statically and **never executed end-to-end**: R4's real-Docker reproduction died at compose load, and task 5.4 remains unchecked). If the daemon attempts a registry round-trip, every plugin install/restart in CI fails at runtime.
**Fix**: do not change code speculatively. Make the pending admitted-runner run (tasks 5.4/6.1) explicitly exercise this path, and add a cheap in-job guard before Playwright, e.g. `docker image inspect "$CI_SIDECAR_HARNESS_IMAGE" >/dev/null` inside the job after publication, failing closed if the local store does not hold the digest.
**Orchestrator check (post-fix)**: run `bash .github/actions/docker-infra/scripts/verify-ci-sidecar-lifecycle.sh` once against real Docker after CRITICAL-1 is repaired.

---

## MINOR findings

1. **[PRIMARY][MINOR-1] Duplicated contract-spec runs remain on the timeout-capped critical path** — `verify-concurrent-ci-runtime.sh:138-141`: lines 140-141 repeat 138-139 verbatim (each contract spec runs twice per project); line 141 additionally drops the `e2e/` prefix (incomplete-edit artifact; harmless because Playwright treats positional args as regex, but confusing). OPEN since R4. Fix: delete lines 140-141.
2. **[PRIMARY][MINOR-2] `KAFKA_BROKERS` port unbounded** — `ci-runtime-endpoint-contract.mjs:66` and `e2e/ci-runtime-manifest.ts:80` accept `/^127\.0\.0\.1:[1-9][0-9]*$/` (ports >65535 pass) while every URL-valued manifest entry bounds ≤65535 (`ci-runtime-manifest.ts:26-40`). OPEN since R3. Fix: `[1-9][0-9]{0,4}` plus numeric ≤65535 check in both validators.
3. **[PRIMARY][MINOR-3] Fail-closed diagnostics scanner omits `user` keys** — `scan-ci-runtime-diagnostics.mjs:7` forbidden pattern and `:10` registry filter lack `user(?:name)?` (and `database_url`/`postgres_host_url` appear only in the registry filter), while the sanitizer covers them (`sanitize-ci-runtime-diagnostics.mjs:7`). A leak reaching diagnostics through a path that bypasses sanitization would pass the scan that exists to block it. OPEN since R4. Fix: align key lists in both scanner patterns.
4. **[PRIMARY][MINOR-4] Raw `source` of `sidecar-images.env` bypasses ownership/mode re-validation** — `verify-ci-sidecar-lifecycle.sh:22-24`: the idempotent branch greps one line pattern then sources directly; unlike `host.env`/`admission.env`/credentials there is no `-O`/symlink/0600 guard. Same shape as the previously fixed host.env bypass. OPEN since R4. Fix: reuse the `[[ -f && -O && ! -L && $(stat -c %a) == 600 ]]` guard used at `:12`.
5. **[PRIMARY][MINOR-5] Harness image layers accumulate in the daemon store** — `verify-ci-sidecar-lifecycle.sh:26` removes only the tag; pushed digest-referenced layers persist across runs (nothing prunes them; `down-ci-runtime-project.sh` handles Compose resources only), eroding the 60 GiB admission threshold (`verify-ci-runner-capacity.sh:45`). OPEN since R4. Fix: scoped `docker image prune -f --filter label=…` or remove-by-digest in teardown.
6. **[PRIMARY][MINOR-6] Non-atomic secret/listener writes to final paths** — `ci-runtime-keycloak-credentials.sh:33-34` writes credentials via truncating redirect; a mid-write crash leaves a permanently invalid file that `valid()` rejects on every retry until manual cleanup. Same pattern for `redpanda-listener.env` (`ci-runtime-compose.sh:41`). OPEN since R4 (Nit→Minor given fail-stuck semantics). Fix: tmp+mv as `publish-sidecar-images.sh:58-63` already does.
7. **[PRIMARY][MINOR-7] Misleading workflow step name** — `ci.yml:143-144` "Migrate through the host manifest" runs only `test -f "$CI_RUNTIME_DIR/host.env"`; migrations actually happen inside `wait-services.sh:25-26`. Misleads anyone auditing migration direction from the workflow alone. Fix: rename the step or assert a migration log artifact.

## NIT findings

1. **[PRIMARY][NIT-1] Unpinned harness base image** — `infra/docker/ci-sidecar-harness.Dockerfile:1`: `FROM node:24-bookworm` vs the repo-wide digest-pinning standard enforced everywhere else in this very changeset (including runtime-resolved `registry:2`). OPEN since R3.
2. **[PRIMARY][NIT-2] Unquoted expansions (SC2086)** — `down-ci-runtime-project.sh:12,28` (`for id in $resources`, `docker rm -f $sidecars`). Safe today (hex IDs from `docker ps -aq`), but quote or use arrays.
3. **[PRIMARY][NIT-3] Render gate validates a config that differs from the created one** — `verify-ci-compose-render.sh:21-25` renders with placeholder origins/ports, so the render proof's environment values are not the ones eventually baked into containers. Acceptable once CRITICAL-1's fix makes placeholders impossible to leak (see suggested assertion in CRITICAL-1 fix #2), but worth a comment until then. Relatedly, silent bootstrap failure in the verifier (`verify-concurrent-ci-runtime.sh:158-160`) exits without naming the failed project — cheap DX improvement.

---

## Prior-round remediation verification (independently re-checked in current code)

| Prior finding | Status | Evidence (current tree, read directly) |
|---|---|---|
| **R4 BLOCKER-1** digest-pin regex rejected the emitted loopback ref | **RESOLVED** | Both validators widened identically to admit optional `host[:port]/`: `sidecar-image.ts:5-6` and `ci-plugin-docker-rules.mjs:8` share `^(?:[a-z0-9][a-z0-9.-]*(?::[0-9]+)?\/)?[a-z0-9][a-z0-9._/-]*(?::[a-z0-9._-]+)?@sha256:[a-f0-9]{64}$`. Traced the literal emitted shape (`127.0.0.1:PORT/sidecar-harness@sha256:HEX`) through the grammar: matches. Round-trip tests present: `sidecar-image.test.ts:88-107` asserts the emitted form passes plus near-miss negatives (missing port, empty name, 63/65 hex). |
| **R4 BLOCKER-2** fresh-runner compose load order (`sidecar-images.env`) | **RESOLVED (single member)** | `ci-runtime-env.sh init:37` pre-creates all five runtime files including `sidecar-images.env`, chmod 600 at :38; explanatory comment :34-36; init invoked first post-checkout via `ci-runner-admission/action.yml:14`; unstubbed fresh-dir render test added (`verify-ci-compose-render.test.sh:66-81`). **But only one of four eager-load requirements was fixed — see CRITICAL-1 for the remaining three.** |
| R4 Minor 1 duplicated contract-spec runs | **OPEN** | `verify-concurrent-ci-runtime.sh:138-141` unchanged (MINOR-1). |
| R4 Minor 2 KAFKA_BROKERS bounds | **OPEN** | Both validators still `[1-9][0-9]*` (MINOR-2). |
| R4 Minor 3 scanner `user` gap | **OPEN** | `scan-ci-runtime-diagnostics.mjs:7,10` lack user keys (MINOR-3). |
| R4 Minor 4 raw source of sidecar env | **OPEN** | `verify-ci-sidecar-lifecycle.sh:22-24` unchanged (MINOR-4). |
| R4 Minor 5 blob accumulation | **OPEN** | No prune added anywhere in teardown (MINOR-5). |
| R4 Nit 1 unpinned harness base | **OPEN** | `ci-sidecar-harness.Dockerfile:1` (NIT-1). |
| R4 Nit 2 non-atomic credentials write | **OPEN** | `ci-runtime-keycloak-credentials.sh:33-34` unchanged (MINOR-6). |
| R4 Nit 3 SC2086 quoting | **OPEN** | `down-ci-runtime-project.sh:12,28` unchanged (NIT-2). |
| R3 Major duplicated full Playwright suites in verifier | **RESOLVED (stable)** | Full suites only at bootstrap (`verify-concurrent-ci-runtime.sh:51-52`); `verify_project` runs contract specs (:138-141) — residual duplication logged as MINOR-1. Enforced negatively by `ci-workflow-contract.test.mjs:34-35` (`/playwright test/` forbidden in the `ci` job). |
| R3 Minor 8 CWD-relative compose paths | **RESOLVED (stable)** | All scripts derive root from `BASH_SOURCE` (`ci-runtime-compose.sh:6-8`, `wait-services.sh:6-9`, `start-services.sh:6-9`, `down-ci-runtime-project.sh:6-8`). |
| R3 Minor 10 `endpoint()` accepts localhost | **RESOLVED (stable)** | Strict regex + explicit rejection with actionable message (`ci-runtime-compose.sh:16-18`); negative tested (`ci-runtime-compose.test.sh:51-64`). |
| R3 Minor 12 silent-empty env defaults | **RESOLVED (stable)** | `${…:?required}` present throughout both overlays. (These gates are now co-responsible for CRITICAL-1's blast radius.) |
| R3 Minor 13 ~identical spec twins | **RESOLVED (stable)** | Both specs are 12-line shims over shared `runCiRuntimeContractFlow` (`apps/web/e2e/ci-runtime-contract.spec.ts`, admin equivalent). |
| R3 Minor 9 sentinel regex over secrets | **RESOLVED (stable)** | Anchored `_URL\|_BASE\|_BROKERS` keys (`verify-concurrent-ci-runtime.sh:88`); hostile-credential negative present in self-test (:113, :117). |
| R3 Minor 16 unrestricted proxy inspect surface | **RESOLVED (stable)** | Policy module restricts create payload to allowlisted keys/images/labels/network with exact-label JSON equality (`ci-plugin-docker-rules.mjs:39-112`). |
| R3 #3 readiness refusal negative | **OPEN (3rd round)** | MEDIUM-2. |

No previously RESOLVED item regressed; CRITICAL-1 is a sibling defect of the R4-BLOCKER-2 mechanism family, not a regression of the fixed member.

---

## Traceability matrix vs spec tasks / ACs

| Change area (diff) | Spec/task coverage | Verdict |
|---|---|---|
| Admission capacity gate + flock serialization + evidence (`verify-ci-runner-capacity.*`) | Task 1.1; CI-PORT-10/11 | Covered. Thresholds match spec (≥4 CPU, ≥16 GiB cgroup, ≥12 GiB headroom, ≥60 GiB root, marker, fail-closed `:42-45`); TOCTOU residual honestly documented in-script (:23-27). |
| New `.github/actions/ci-runner-admission/` composite action | Implements Task 5.3 intent ("shared admission first executable post-checkout") but **not listed in any task's Files section** | **[NO TASK]** — substantive and justified; add one line to tasks.md 5.3 for traceability. |
| Contract writer (`ci-runtime-env.sh`, `ci-runtime-path.sh`, endpoint-contract mjs) | Task 1.2; CI-PORT-01/02/03/08/12 | Covered; atomic 0600 writes with per-entry validation (`atomic_write:9-29`), strict project/dir validation, wrong-source rejection tested. `%q` writer vs naive TS reader remains an accepted residual (documented rounds 2–4). |
| Render/publication gate (+ unstubbed fresh-dir case) | Task 1.3; CI-PORT-02 | Covered for publications; fidelity nit NIT-3. |
| CI overlay services (`docker-compose.ci.yml`, `docker-compose.ci-runtime-services.yml`) | Task 2.1; CI-PORT-01–04, 12 | Covered structurally: all publications `127.0.0.1::port` `!override`; DNS-only proxy target baked into web/admin env; runtime-config.js mounted ro; internal-only `plugin-docker-control` network. Load-time variable handling = **CRITICAL-1**. |
| Redpanda gated listener (`ci-entrypoint.sh`, listener file, `redpanda-contract.test.sh`) | Task 2.2; CI-PORT-05 | Covered; entrypoint validates exact loopback shape and fails closed (`ci-entrypoint.sh:4-11`); no fallback metadata; `init()` pre-creates the mounted listener file so the bind resolves. |
| Keycloak request-host staging + project-scoped credentials | Task 2.3; CI-PORT-06/08 | Covered (`KC_HTTP_ENABLED=true`, `KC_HOSTNAME_STRICT=false`, no `KC_HOSTNAME`/proxy headers — base file :59-64 plus overlay :11-12); per-project derived credentials with cross-project rejection probe (`verify-concurrent-ci-runtime.sh:111-125`). |
| Core issuer/JWKS split (`ci-runtime-contract.ts`, `config.ts`, unit tests) | Task 3.1; CI-PORT-03/04/06 | Covered; direction negatives well tested (`keycloak-runtime-contract.test.ts`: swapped bases, foreign scope/network, direct Docker, non-loopback issuers). `config.ts` 198 lines — inside Rule 4. |
| Plugin identity/lifecycle/proxy enforcement (`plugin-container-identity.ts`, `plugin-container-contract.ts`, restart/options/proxy wiring) | Tasks 3.2–3.3; CI-PORT-07 | Covered; name derivation consistent across TS (`plugin-container-identity.ts:33-34`), shell teardown (`down-ci-runtime-project.sh:22`), proxy policy (`ci-plugin-docker-rules.mjs:16-19`), scope hash consistent (`plugin-runtime-scope.ts:4` = `ci-runtime-scope.sh` = endpoint-contract scalar). Alias length bounded at 63 (test `plugin-container-identity.test.ts:15-20`). Proxy target validation wired before fetch (`proxy.service.ts:59-70`). |
| Browser runtime config + same-origin clients (`packages/auth/runtime-endpoints.ts`, app shims, api-client/keycloak-auth, index.html script tags) | Task 4.1; empty-base AC | Covered; parser accepts only `{apiBase:'', keycloakBase:strict-loopback}` and returns undefined outside contract (`packages/auth/src/runtime-endpoints.ts:33-43`); non-CI fallback intact. |
| Vite server/preview proxy + CI-only `0.0.0.0` binding (+ tests both apps) | Task 4.2; CI-PORT-04/12 | Covered; fail-closed on wrong `E2E_CORE_API_PROXY_TARGET` (`apps/web/vite.config.ts:8-15`, tests incl. negative matrix). |
| Manifest-only Playwright/host provisioning (`playwright-base.ts`, app playwright configs, admin api-client) | Task 4.3; no-CI-webServer AC | Covered (`webServer: ciRuntime ? [] : […]` both configs; `coreApiEnv` throws in contract mode `playwright-base.ts:73-74`; runner client uses manifest `CORE_API_PUBLIC_BASE` only). |
| Workflow rebuild (3 labelled jobs, admission-first, artifacts `if: always()` + `if-no-files-found: error`, old cleanup scripts deleted) | Task 5.3; CI-PORT-09–11 | Structurally covered; enforced by `ci-workflow-contract.test.mjs` (label constraint, admission-before-setup, artifact steps). Runtime executability = **CRITICAL-1**. Step-name cosmetic gap = MINOR-7. |
| Two-project verifier + sentinels (`verify-concurrent-ci-runtime.*`) | Task 5.4; A-down/B-survives AC | Authored with genuine ordering/isolation assertions (byte-compare of B sentinels/manifests/runtime-config :169-176, disjoint-port and legacy-port checks with near-miss tests); honestly marked pending real-runner proof — currently unreachable due to CRITICAL-1. Residual duplication MINOR-1. |
| Diagnostics collection/redaction/scanner, scoped teardown | Task 5.2; CI-PORT-11 | Covered; gaps = MINOR-3/MINOR-5. Teardown provably refuses foreign/unlabelled selection (`down-ci-runtime-project.sh:11-27`) and asserts runtime dir removal (:31-33). |
| `quality` job (typecheck + frontend units on admitted runner) | Not mentioned in spec/tasks | **[ORPHAN CHANGE]** candidate — harmless and consistent with CI-PORT-10, but should be recorded in tasks.md 5.3. |
| `ci-runtime-lifecycle.test.sh` | Task 5.1 | Present but tautological (**MEDIUM-1**) — task 5.1's stated verification is **[NOT IMPLEMENTED]** as behavior. |
| Wrong-mapping readiness refusal | tech-spec.md:119-123 | **[NOT IMPLEMENTED]** at test level — carried (MEDIUM-2). |

---

## Dimension-by-dimension notes

- **D1 Correctness & Security**: CRITICAL-1 dominates everything else. Security posture otherwise strong and internally consistent: validated project IDs everywhere (`ci-runtime-path.sh:4,32,45`), 0700 runtime dirs with owner/symlink/mode guards, fail-closed ownership checks on every sourced artifact except MINOR-4, digest-pinned images end-to-end, socket-proxy allowlists, sanitize→fail-closed-scan diagnostics pipeline, scoped teardown with foreign-selection refusal, admission flock with documented residual. No secrets in code; encryption material generated per-run in workflow.
- **D2 Architecture & Constitution**: Rule 4 (≤200 lines) respected in every file inspected (`config.ts` 198, `proxy.service.ts` 189, `verify-concurrent-ci-runtime.sh` 177, `playwright-base.ts` 135; largest policy module 112). No `console.log` in production paths (scripts use printf/stdout.write). Zod validation on external input upheld (`config.ts` superRefine + endpoint-contract validator). No SQL changes; parameterization untouched. ADR-031 updated and matches implementation (request-host Keycloak, admission labels, ephemeral-registry trust boundary). Rule 6 N/A (uncommitted tree).
- **D3 Code Quality & Maintainability**: helper-per-concern discipline held consistently (path/scope/compose/env/credentials/publish/down/diagnostics each isolated). Long single-invocation lines in `write_infra`/`write_container_set` (`ci-runtime-compose.sh:32,36`) are borderline readability but within limits; the `endpoint()` prefix-strip idiom (`${value#http://}`) is slightly obscure but correct.
- **D4 Test-Spec Coherence**: strong unit/negative coverage for contracts (issuer/JWKS direction, scope/network binding, digest pins incl. round-trip, vite configs, runtime-endpoints, endpoint validator localhost rejection); the browser E2E contract spec genuinely asserts same-origin origin-equality, plugin-proxy path/header preservation, no wildcard CORS, no reflected foreign origin, and empty `apiBase` (`ci-runtime-contract-flow.ts:67-105`) — this is real coverage, not mock theater. Weak spots: MEDIUM-1 tautology, MEDIUM-2 carried gap, and pervasive docker-stubbing that again let a real-wiring defect (CRITICAL-1) through — the recurring lesson of rounds 2–5.
- **D5 Performance & Reliability**: duplicated contract specs (MINOR-1) on a retry-prohibited, 90-min-capped critical path; harness blob accumulation (MINOR-5); wrapper runtime-dir accumulation (see D6 note — same erosion class); concurrent bootstraps serialized appropriately at admission with honest TOCTOU documentation; verifier cleanup traps preserve failure codes correctly (`:29-39`).
- **D6 Documentation & Traceability**: task statuses honest about authored-vs-proven (5.4/6.1/6.2 open); plan §6 file map matches the diff closely; two traceability notes ([NO TASK] admission action, [ORPHAN CHANGE] quality job). Additional observation: per-run wrapper dirs under `$RUNNER_TEMP/plexica-ci/` (contract/quality/build jobs' own dirs) are never removed by any teardown path, and `init_ci_runtime` refuses pre-existing dirs (`ci-runtime-path.sh:35-37`) — guaranteed accumulation on persistent self-hosted runners; recommend a stale-directory sweep in admission or a final teardown step.
- **D7 UX Quality (CI DX)**: error messages across the contract writer, endpoint validator, render gate, and E2E helpers are specific and actionable ("must be an inspected 127.0.0.1 endpoint", "Refusing foreign plugin sidecar selection", "CI Playwright must use Compose Core, not a host webServer"); artifact uploads are `if: always()` with `if-no-files-found: error`. The dominant DX hazard is CRITICAL-1 itself: a fresh runner dies with a bare `required variable ADMIN_E2E_PUBLIC_BASE is missing` far from its cause. Secondary: silent bootstrap-failure exit (NIT-3).

---

## Verification commands executed

None — **no shell tool in this session**. Static claims above carry their own orchestrator commands:

| Claim | Command for orchestrator |
|---|---|
| CRITICAL-1 | `env -i PATH="$PATH" CI_COMPOSE_PROJECT=plexica-ci-probe-123456 CI_RUNTIME_DIR=<fresh-init> docker compose --project-name plexica-ci-probe-123456 -f docker-compose.yml -f docker-compose.ci.yml config --quiet` → expect exit 1, "required variable ADMIN_E2E_PUBLIC_BASE is missing" (pre-fix) |
| Digest-pin grammar | `node -e "console.log(/^(?:[a-z0-9][a-z0-9.-]*(?::[0-9]+)?\/)?[a-z0-9][a-z0-9._\/-]*(?::[a-z0-9._-]+)?@sha256:[a-f0-9]{64}$/.test('127.0.0.1:32791/sidecar-harness@sha256:'+'a'.repeat(64)))"` → expect true |
| Full suites | `bash .github/actions/docker-infra/scripts/*.test.sh`, `node .github/actions/docker-infra/scripts/*.test.mjs`, `pnpm --filter core-api exec vitest run src/__tests__/unit/{keycloak-runtime-contract,plugin-container-identity,sidecar-image}.test.ts`, `pnpm --filter web test -- vite.config runtime-endpoints`, `pnpm check:lines` |
| MEDIUM-3 discharge | After CRITICAL-1 fix: `CI_COMPOSE_PROJECT=<proj> CI_RUNTIME_DIR=<dir> bash .github/actions/docker-infra/scripts/verify-ci-sidecar-lifecycle.sh` against real Docker |

---

## Summary

Summary: 14 issues found. 1 CRITICAL (blocking), 0 HIGH, 3 MEDIUM, 7 MINOR, 3 NIT.
Recommendation: **REQUEST CHANGES** — fix CRITICAL-1 (export early placeholders before any Compose invocation in `start-services.sh`/`wait-services.sh`, plus the placeholder-leakage regression assertion), replace the tautological lifecycle test and add the readiness-refusal negatives (MEDIUM-1/2, cheap), and finally execute the pipeline end-to-end on an admitted runner (tasks 5.4/6.1), capturing MEDIUM-3's daemon digest-resolution assumption as evidence. The Round-4 blocker fixes themselves are correct and well-tested; what remains is finishing the eager-load fix family and discharging the long-pending real-runner proof. With those addressed, this changeset should be approvable.
