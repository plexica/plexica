# FORGE Adversarial Review — Spec 010 CI Dynamic Ports — Round 5 (PEER)

- **Date**: 2026-08-22
- **Scope**: uncommitted working tree (`git status` + diff + untracked files), ~75 files, +1720/−394.
- **Method**: independent peer-model adversarial review (`forge-reviewer-peer`). Spec artifacts (tech-spec.md, plan.md, tasks.md, tasks-orchestration.md) and ADR-031 read in full; prior rounds 1–4 consulted only for remediation tracking, then each item independently re-verified against current code.
- **Execution caveat**: this session had **no shell tool**, so no command was executed. All findings below are from direct file reading plus documented Docker Compose semantics. Where a claim depends on runtime behavior, it is labeled and paired with a concrete orchestrator verification command. All prior-round statuses were re-derived from the current code, not copied.

---

## Verdict

# REQUEST CHANGES

One CRITICAL finding of the same failure class that produced Rounds 2–4's blockers persists: green stubbed suites validate units while real fresh-runner Compose wiring fails closed before any service starts. The Round-4 fixes were correctly implemented for what they covered, but the eager-load requirement class was only partially addressed.

### Severity counts

| Severity | Count |
|---|---|
| CRITICAL | 1 |
| HIGH | 0 |
| MEDIUM | 3 |
| MINOR | 7 |
| NIT | 2 |

---

## CRITICAL findings

### [PEER][CRITICAL-1] Correctness/Reliability — Compose overlay requires `WEB_E2E_PUBLIC_BASE`, `ADMIN_E2E_PUBLIC_BASE`, `KEYCLOAK_PUBLIC_ISSUER_BASE` at every load; no lifecycle stage exports them before the first `compose create`

**Files**:
- `docker-compose.ci.yml:17-18` — `keycloak-init.environment`: `KEYCLOAK_ADMIN_ORIGIN: ${ADMIN_E2E_PUBLIC_BASE:?required}`, `KEYCLOAK_WEB_ORIGIN: ${WEB_E2E_PUBLIC_BASE:?required}`
- `infra/compose/docker-compose.ci-runtime-services.yml:18` — `core-api-e2e.environment.KEYCLOAK_PUBLIC_ISSUER_BASE: ${KEYCLOAK_PUBLIC_ISSUER_BASE:?required}` (also `:?required` on `CI_RUNTIME_DIR`/`CI_COMPOSE_PROJECT` throughout both files)
- `.github/actions/docker-infra/scripts/start-services.sh:16` — first real invocation `"${compose[@]}" create postgres redis minio keycloak mailpit loki`
- `.github/actions/docker-infra/scripts/wait-services.sh:14` (`up -d --wait …`) and `:34` (`create web-e2e admin-e2e`) — both precede the points where the values exist (`write-browser` at `:35`, complete-stage `source-ci-runtime-host.sh` at `:36`)
- `.github/workflows/ci.yml:137-142` — the `phase: full` step exports only `CI_COMPOSE_PROJECT`, `CI_RUNTIME_DIR`, `POSTGRES_*`; nothing earlier writes these variables to `$GITHUB_ENV` (verified: the only `GITHUB_ENV` writers are `ci.yml:31,106` — encryption material — and `ci-runner-admission/action.yml:15`)
- `.github/actions/docker-infra/scripts/verify-concurrent-ci-runtime.sh:44-45` — contract-job `bootstrap()` calls `start-services.sh`/`wait-services.sh` before its first host-contract source at `:46`

**Why this matters**: Compose interpolates `${VAR:?err}` for the *entire* merged model at project-load time, regardless of which services a `create`/`up` command names. On a clean admitted runner there is no repo `.env` (ADR-031: gitignored, never present). Therefore the very first Compose call of both jobs fails with `required variable WEB_E2E_PUBLIC_BASE is missing` (or one of its two siblings) — before any container exists. This is exactly R4 BLOCKER-2's class: required-at-load values resolved later in the lifecycle. R4's fix pre-created `sidecar-images.env` (`ci-runtime-env.sh:37` — correct) and added the unstubbed render test — but that test explicitly passes all three missing variables (`verify-ci-compose-render.test.sh:74-76`), which is itself corroborating evidence they are required at load, and no other test or production path supplies them early.

**Suggested fix**: export placeholder loopback values (e.g., `http://127.0.0.1:1`) in `start-services.sh`/`wait-services.sh` (or the admission action via `$GITHUB_ENV`) before any Compose call, ensuring the real values overwrite them before `core-api-e2e`/`keycloak-init` are *created* (wait-services already sources the real complete-stage contract at `:36` and infra stage at `:22-23`, so ordering works); alternatively move the `keycloak-init` origin injection out of the always-loaded overlay into a late-stage `compose run`/create-time env. Then add one unstubbed regression test running `docker compose config` (and ideally `create --dry-run`) **without** those variables set.

**Orchestrator verification (static claim)**: `env -i PATH="$PATH" CI_COMPOSE_PROJECT=plexica-ci-x-123456 CI_RUNTIME_DIR=/tmp/rt docker compose -f docker-compose.yml -f docker-compose.ci.yml config >/dev/null` → expect exit 1 with a `required variable … is missing` error.

---

## MEDIUM findings

### [PEER][MEDIUM-1] Test-Spec Coherence — Task 5.1's lifecycle "verification" is a tautology

**File**: `.github/actions/docker-infra/scripts/ci-runtime-lifecycle.test.sh:7`
```bash
grep -F 'WEB_E2E_PUBLIC_BASE' "$(dirname "$0")/verify-health.sh" >/dev/null
```
The entire staged-lifecycle test suite (task 5.1 verification: "prove the host readiness gate fails for an altered mapping") reduces to grepping a literal string in another script. It asserts nothing about behavior. Combined with the absence of any wrong-mapping negative (see MEDIUM-3), task 5.1's acceptance ("readiness gate refuses altered mapping") has no behavioral test at all.
**Fix**: replace with a stubbed-docker test that feeds `verify-health.sh` a poisoned mapping (refused curl / mismatched runtime-config body) and asserts nonzero exit — the existing `wait-services.test.sh` stub infrastructure already supports this shape.

### [PEER][MEDIUM-2] Performance/Reliability — Sidecar resolution depends on unproven daemon-side digest resolution against a dead registry

**Files**: `publish-sidecar-images.sh:30,56-63` (ephemeral registry removed at EXIT trap; published ref written to `sidecar-images.env`); `docker-container-restart.ts:31` / `sidecar-image.ts:23-34` (Core resolves installs to `127.0.0.1:<port>/sidecar-harness@sha256:<64>`); `verify-ci-sidecar-lifecycle.sh:40` (proof executes after publication).
Container creation by `name@sha256:digest` where the named registry no longer works only succeeds if the daemon resolves the digest from its local store (populated because `publish-sidecar-images.sh:44` tags locally and `:46` pushes, which records the manifest digest). This is plausible but unverifiable statically and has **never been executed end-to-end** — R4's real-Docker reproduction died at compose config (BLOCKER-2), and task 5.4 remains unchecked. If the daemon attempts a pull instead, every plugin install fails at runtime.
**Fix**: do not change code blindly — make the pending admitted-runner run (tasks 5.4/6.1) explicitly assert this path, or add a cheap local check in the verifier that `docker image inspect "$CI_SIDECAR_HARNESS_IMAGE"` succeeds inside the job before Playwright.

### [PEER][MEDIUM-3] Test-Spec Coherence — Readiness-gate refusal AC still untested (carried R3 #3, R4)

tech-spec.md:119-123 requires "a refused or wrong mapping fails the job". Neither `wait-services.test.sh` nor `verify-health.sh` has any negative case: the curl stub (`wait-services.test.sh:35-38`) always returns the correct runtime-config body; no test simulates a stale port, refused connection, or tampered `apiBase`. Status: OPEN (third round carrying this).
**Fix**: add poisoned-mapping cases to `wait-services.test.sh` (curl returning 000/wrong issuer) asserting failure.

---

## MINOR findings

1. **[PEER][MINOR-1] Duplicated contract-spec runs remain** — `verify-concurrent-ci-runtime.sh:138-141`: lines 140-141 repeat 138-139 verbatim (each contract spec runs twice per project on a retry-prohibited, 90-min-capped critical path); line 141 also drops the `e2e/` prefix (inconsistent-form incomplete-edit artifact; harmless because Playwright treats positional args as regex, but confusing). OPEN since R4. Fix: delete 140-141.
2. **[PEER][MINOR-2] `KAFKA_BROKERS` port unbounded** — `ci-runtime-endpoint-contract.mjs:66` and `e2e/ci-runtime-manifest.ts:80` accept `/^127\.0\.0\.1:[1-9][0-9]*$/` (ports >65535 pass) while every URL-valued manifest entry bounds at 65535 (`ci-runtime-manifest.ts:26-40`). OPEN since R3. Fix: `[1-9][0-9]{0,4}` plus ≤65535 check.
3. **[PEER][MINOR-3] Fail-closed diagnostics scanner omits `user` keys** — `scan-ci-runtime-diagnostics.mjs:7` forbidden-pattern list lacks `user(?:name)?` and its value-registry filter (`:10`) likewise, while the sanitizer redacts them (`sanitize-ci-runtime-diagnostics.mjs:7`). A leaked raw `KEYCLOAK_ADMIN_USER=…` would pass the scan that exists precisely to block this. OPEN since R4. Fix: align key lists (add `user(?:name)?` to both scan patterns).
4. **[PEER][MINOR-4] Raw `source` of `sidecar-images.env` bypasses ownership/mode re-validation** — `verify-ci-sidecar-lifecycle.sh:22-24`: idempotent branch sources directly; unlike `host.env`/`admission.env` there is no `-O`/symlink/0600 check. OPEN since R4. Fix: reuse the `[[ -f && -O && ! -L && mode == 600 ]]` guard used at `:12`.
5. **[PEER][MINOR-5] Harness image layers accumulate in the daemon store** — `verify-ci-sidecar-lifecycle.sh:26` removes only the tag; no dangling-layer prune anywhere in teardown (`down-ci-runtime-project.sh` handles compose resources only), slowly eroding the 60 GiB admission threshold (`verify-ci-runner-capacity.sh:45`). OPEN since R4. Fix: scoped `docker image prune -f --filter label=…` or remove-by-digest in teardown.
6. **[PEER][MINOR-6] Non-atomic secret/listener writes to final paths** — `ci-runtime-keycloak-credentials.sh:33-34` writes credentials directly to `keycloak-credentials.env`; a mid-write crash leaves a permanently invalid file that `valid()` then rejects on every retry until manual cleanup. Same pattern for `redpanda-listener.env` (`ci-runtime-compose.sh:41`) — though the Redpanda entrypoint fails closed on a malformed contract, a truncated-but-syntactically-valid port is conceivable. OPEN since R4 (Nit→Minor for the credentials file given fail-stuck semantics). Fix: tmp+mv as `publish-sidecar-images.sh:58-63` already does.
7. **[PEER][MINOR-7] Misleading step name in workflow** — `ci.yml:143-144` "Migrate through the host manifest" runs only `test -f "$CI_RUNTIME_DIR/host.env"`; migrations actually happen inside `wait-services.sh:25-26`. Cosmetic, but it misleads anyone auditing migration direction from the workflow alone. Fix: rename step or assert the migrate log artifact.

## NIT findings

1. **[PEER][NIT-1] Unpinned harness base image** — `infra/docker/ci-sidecar-harness.Dockerfile:1`: `FROM node:24-bookworm` vs repo-wide digest-pinning standard (everything else in the overlay is pinned, including runtime-resolved `registry:2`). OPEN since R3.
2. **[PEER][NIT-2] Inline `${{ inputs.purpose }}` shell interpolation** — `.github/actions/ci-runner-admission/action.yml:13`. Callers pass fixed literals (`contract|quality|build`), so theoretical only, but it is the exact pattern R4 eliminated elsewhere. Fix: validate `purpose` against an allowlist regex in the step.

---

## Prior-round remediation verification (independently re-checked in current code)

| Prior finding | Status | Evidence (current tree) |
|---|---|---|
| **R4 BLOCKER-1** digest-pin regex rejects emitted loopback ref | **RESOLVED** | Both validators widened identically to admit optional `host[:port]/` prefix (`ci-plugin-docker-rules.mjs:8`, `sidecar-image.ts:6` — grammar matches the requested fix form). Round-trip test added: `sidecar-image.test.ts:93-97` asserts the literal emitted `127.0.0.1:32791/sidecar-harness@sha256:<64>` passes `isDigestPinnedImage`, plus near-miss negatives `:102-108`; harness-ref resolution tested `:58-65`. Static check of the regex against the emitted shape (`127.0.0.1` → host class, `:port` → port group, `/sidecar-harness` → name, digest tail): matches. |
| **R4 BLOCKER-2** fresh-runner compose load order | **PARTIALLY RESOLVED** | `ci-runtime-env.sh init:37` now pre-creates `sidecar-images.env` (0600 via `chmod 600 "$dir"/*` at `:38`) with an explanatory comment (`:34-36`); init is invoked first post-checkout in all jobs via `ci-runner-admission/action.yml:14`; unstubbed real-compose fresh-dir test added (`verify-ci-compose-render.test.sh:66-81`). **But only one of four eager-load requirements was fixed — see CRITICAL-1 for the remaining three.** |
| R4 Minor 1 duplicated contract-spec runs | OPEN | `verify-concurrent-ci-runtime.sh:138-141` unchanged (new MINOR-1). |
| R4 Minor 2 KAFKA_BROKERS bounds | OPEN | Both validators still `[1-9][0-9]*` (MINOR-2). |
| R4 Minor 3 scanner `user` gap | OPEN | `scan-ci-runtime-diagnostics.mjs:7,10` lack user keys (MINOR-3). |
| R4 Minor 4 raw source of sidecar env | OPEN | `verify-ci-sidecar-lifecycle.sh:22-24` unchanged (MINOR-4). |
| R4 Minor 5 blob accumulation | OPEN | No prune added (MINOR-5). |
| R4 Nit 1 unpinned harness base | OPEN | `ci-sidecar-harness.Dockerfile:1` (NIT-1). |
| R4 Nit 2 non-atomic credentials write | OPEN | `ci-runtime-keycloak-credentials.sh:33-34` unchanged (MINOR-6). |
| R4 Nit 3 SC2086 quoting | OPEN | `down-ci-runtime-project.sh:12,28` unchanged. |
| R3 #9 sentinel regex / #14 task statuses / Minor 8 CWD paths / 10 endpoint() localhost / 12 silent-empty defaults / 13 spec twins / 15 $PWD / 16 proxy inspect surface | RESOLVED (stable) | Spot-reverified: strict loopback regex + explicit rejection (`ci-runtime-compose.sh:16-18`); honest "pending admitted-runner verification" headers (tasks.md:8, tasks-orchestration.md:8); BASH_SOURCE-derived roots in start/wait/down/compose scripts; `${…:?required}` present (though it now contributes to CRITICAL-1); 11-line spec shims over shared flow; verifier sentinel anchored `_URL\|_BASE\|_BROKERS` (`verify-concurrent-ci-runtime.sh:88`); proxy inspect restricted to trustedImages with decode guard (`ci-plugin-docker-proxy` policy module). |

No previously RESOLVED item regressed, except insofar as the R4-BLOCKER-2 fix family proved incomplete (CRITICAL-1 is a sibling defect of the same mechanism, not a regression of the fixed one).

---

## Traceability matrix vs spec tasks / ACs

| Change area (diff) | Spec/task coverage | Verdict |
|---|---|---|
| Admission capacity gate + flock + evidence (`verify-ci-runner-capacity.*`) | Task 1.1; CI-PORT-10/11 | Covered. Thresholds match spec (≥4 CPU, ≥16 GiB, ≥12 GiB headroom, ≥60 GiB, marker, fail-closed `:10,36-45`). |
| New `.github/actions/ci-runner-admission/` composite action | Implements Task 5.3 intent ("shared admission first executable step post-checkout") but **not listed in any task's Files section** | **[NO TASK]** (substantive, justified; add a line to tasks.md 5.3 for traceability). |
| Contract writer `ci-runtime-env.sh` (+ atomic dual-env, browser-config, endpoint contract mjs) | Task 1.2; CI-PORT-01/02/03/08/12 | Covered; tests cover permissions, wrong-source rejection, forbidden values. |
| Render/publication gate (`verify-ci-compose-render.*`) + unstubbed fresh-dir case | Task 1.3; CI-PORT-02 | Covered. |
| CI overlay services (`docker-compose.ci.yml`, `docker-compose.ci-runtime-services.yml`) | Task 2.1; CI-PORT-01–04, 12 | Covered; all publications `127.0.0.1::port` `!override`; DNS-only proxy target baked into web/admin env; runtime-config.js mounted ro. |
| Redpanda gated listener (`ci-entrypoint.sh`, `redpanda-contract.test.sh`) | Task 2.2; CI-PORT-05 | Covered; no fallback metadata; entrypoint validates exact loopback shape. |
| Keycloak request-host staging + project-scoped creds (`docker-compose.ci.yml:9-18`, `ci-runtime-keycloak-credentials.*`) | Tasks 2.3; CI-PORT-06/08 | Covered (`KC_HTTP_ENABLED=true`, `KC_HOSTNAME_STRICT=false`, no KC_HOSTNAME/proxy headers ✓). |
| Core issuer/JWKS split (`config.ts`, `ci-runtime-contract.ts`, unit tests) | Task 3.1; CI-PORT-03/04/06 | Covered; direction negatives well tested (`keycloak-runtime-contract.test.ts`). |
| Plugin identity/lifecycle/proxy enforcement (`plugin-container-identity.ts`, `plugin-container-contract.ts`, restart/options/proxy.service wiring) | Tasks 3.2–3.3; CI-PORT-07 | Covered; all lifecycle paths assert contract; proxy rejects foreign targets. |
| Browser runtime config + same-origin clients (`packages/auth/runtime-endpoints.ts`, app shims, api-client/keycloak-auth, tests) | Task 4.1; empty-base AC | Covered; parser rejects everything except `{apiBase:'', keycloakBase:loopback}`. |
| Vite server/preview proxy + CI-only `0.0.0.0` binding (+ tests) | Task 4.2; CI-PORT-04/12 | Covered both apps; fail-closed on wrong `E2E_CORE_API_PROXY_TARGET`. |
| Manifest-only Playwright/host provisioning (`playwright-base.ts`, `admin-api.ts`, app playwright configs, `admin-api.test.ts`) | Task 4.3; no-CI-webServer AC | Covered (`webServer: []` under contract; coreApiEnv throws in CI). |
| Workflow rebuild (3 labelled jobs, admission-first, artifacts `if: always()` + `if-no-files-found: error`, no broad cleanup) | Task 5.3; CI-PORT-09–11 | Covered; enforced by `ci-workflow-contract.test.mjs`. Old cleanup scripts deleted ✓. |
| Two-project verifier + sentinels (`verify-concurrent-ci-runtime.*`) | Task 5.4; A-down/B-survives AC | Authored, honestly marked pending real-runner proof. |
| Diagnostics collection/redaction/scanner, scoped teardown | Task 5.2; CI-PORT-11 | Covered; gaps = MINOR-3/MINOR-5. |
| `quality` job (typecheck + frontend units on admitted runner) | Not mentioned in spec/tasks | Likely pre-existing job brought under the admission contract — **[ORPHAN CHANGE]** candidate; harmless and consistent with CI-PORT-10 but should be noted in tasks.md 5.3. |
| `ci-runtime-lifecycle.test.sh` | Task 5.1 | Present but tautological (**MEDIUM-1**) — task 5.1's stated verification ("readiness gate fails for altered mapping") is **[NOT IMPLEMENTED]** as a behavior test. |
| Wrong-mapping readiness refusal | tech-spec.md:119-123 | **[NOT IMPLEMENTED]** (test-level) — carried. |

---

## Dimension-by-dimension notes

- **D1 Correctness & Security**: CRITICAL-1 dominates. Otherwise security posture is strong and internally consistent: validated project IDs everywhere (`ci-runtime-path.sh:4`), 0700/0600 modes with owner/symlink checks, fail-closed ownership guards on every sourced artifact except MINOR-4, digest-pinned images, socket-proxy allowlists, sanitized+scanned diagnostics, scoped teardown with foreign-selection refusal (`down-ci-runtime-project.sh:12-27`, `collect-ci-runtime-diagnostics.sh:15-28`). `%q` writer vs naive TS reader remains an accepted residual (loud-failure mitigation documented in rounds 2–4).
- **D2 Architecture & Constitution**: Rule 4 (≤200 lines) — largest files inspected are `config.ts` 198, `verify-concurrent-ci-runtime.sh` 177, `playwright-base.ts` 135; decomposition respected. No console.log in production paths (scripts use printf/stdout.write). Zod validation on external input upheld (`config.ts` superRefine + endpoint-contract validator). No SQL changes. ADR-031 updated and matches implementation (request-host Keycloak, admission labels, ephemeral registry trust boundary). Rule 6 N/A (uncommitted tree).
- **D3 Code Quality & Maintainability**: helper-per-concern discipline held; `ci-runtime-compose.sh` write_* functions stay readable despite long single-invocation lines (32, 36 — borderline readability; acceptable). `endpoint()` http:// prefix strip-and-reuse idiom is slightly obscure but correct.
- **D4 Test-Spec Coherence**: strong unit/negative coverage for contracts (issuer direction, scope/network binding, digest pins, vite configs, runtime-endpoints); E2E contract spec genuinely asserts same-origin, plugin-proxy preservation, no wildcard CORS, empty apiBase. Weak spots: MEDIUM-1 (tautology), MEDIUM-3 (carried), pervasive docker-stubbing that again let a real-wiring defect (CRITICAL-1) through.
- **D5 Performance & Reliability**: duplicated contract specs (MINOR-1) on the timeout-capped path; blob accumulation (MINOR-5); concurrent bootstraps serialized appropriately at admission (flock) — residual TOCTOU honestly documented in-script.
- **D6 Documentation & Traceability**: task statuses honest about what is proven vs authored; plan §6 file map matches the diff closely; two traceability notes ([NO TASK] admission action, [ORPHAN CHANGE] quality job).
- **D7 UX Quality (CI DX)**: error messages across the contract writer, endpoint validator, and render gate are specific and actionable ("must be an inspected 127.0.0.1 endpoint", "Refusing foreign plugin sidecar selection"); artifact uploads are `if: always()` with `if-no-files-found: error`. Main DX hazard is CRITICAL-1 itself: a fresh runner will die with a bare `required variable WEB_E2E_PUBLIC_BASE is missing` far from its cause.

---

## Summary

Summary: 13 issues found. 1 CRITICAL (blocking), 0 HIGH, 3 MEDIUM, 7 MINOR, 2 NIT.
Recommendation: **REQUEST CHANGES** — fix CRITICAL-1 (export early placeholders or defer the `:?required` origins out of the always-loaded overlay) plus the cheap carried minors (1, 2, 3), then execute the real admitted-runner proof (tasks 5.4/6.1) capturing MEDIUM-2's daemon digest-resolution assumption as evidence. The Round-4 blocker fixes themselves are correct and well-tested; the remaining work is finishing the eager-load fix family and finally running the pipeline end-to-end.
