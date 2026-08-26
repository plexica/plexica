# Consolidated Adversarial Review — Spec 010 (CI Dynamic Ports), Round 2

**Date**: 2026-08-22
**Scope**: Working-tree delta on `feat/010-ci-dynamic-ports` — full unstaged diff (~70 files) plus all untracked files (`.github/actions/ci-runner-admission/`, new `docker-infra/scripts/*` + tests, `apps/{web,admin}` e2e/playwright/runtime libs, `packages/auth/src/runtime-endpoints.ts`, `services/core-api` plugin contract/scope/image services + unit tests, `infra/docker/ci-plugin-docker-proxy.mjs`, `e2e/keycloak/admin-api.test.ts`) reviewed against `.forge/specs/010-ci-dynamic-ports/tech-spec.md`, `plan.md`, `tasks.md`, `tasks-orchestration.md`, ADR-031, constitution, AGENTS.md.
**Reviewers**: forge-reviewer (primary) + forge-reviewer-peer (independent dual-model review), run in parallel.
**Prior round**: `.forge/reviews/review-010-ci-dynamic-ports-2026-08-22.md` (REQUEST_CHANGES) — every finding re-verified below.
**Verdict**: **REQUEST_CHANGES**

---

## Verdict Summary

- Round 2 consensus: **1 HIGH / Critical, 3 Major (MEDIUM), ~12 Minor (LOW)** across both models.
- Prior round: of 17 findings — **8 RESOLVED, 3 PARTIALLY RESOLVED, 6 NOT RESOLVED, 0 REGRESSED**. The major correctness items from round 1 (render gate `published:""`, vacuous CORS assertion, missing admin-api test, lenient TS manifest reader, trap signals, substring port matching, duplicate host binding, `rpk || true`) were genuinely fixed with real tests. Substantial improvement.
- Constitution: **PARTIAL** — Rule 1/2 evidence is blocked by the HIGH finding (the CI-PORT-07 sidecar lifecycle proof cannot pass as wired); Rules 4 (file length ≤200; largest reviewed 200 lines), 5 (ADR-031 present), structural rules (no console.log in prod paths, no skip patterns) compliant. Rule 6 N/A until commit (nothing committed yet — eventual commits must be English-only Conventional Commits).
- UX Quality: **N/A** — no UI components or user-facing flows changed. White-screen on invalid browser runtime-config remains a deliberate fail-closed CI boundary, acceptable.

---

## Blocking Findings

### [HIGH] Correctness / Test-Spec Coherence — self-defeating sidecar lifecycle proof
**Found independently by BOTH models** (strongest signal of this round).
Refs: `services/core-api/src/modules/plugin/services/sidecar-image.ts:21-27`; `services/core-api/scripts/verify-ci-sidecar-lifecycle.mjs:8-26,45-47`; `verify-ci-sidecar-lifecycle.sh:16-21`; `services/core-api/src/modules/plugin/services/container-manager.service.ts:75,88-120`; `docker-compose.ci-runtime-services.yml:20`; `ci.yml:145-146`.

- Issue: Under `CI_RUNTIME_CONTRACT=1`, `resolveSidecarImage()` silently replaces any manifest image with the pinned `node:24-bookworm@sha256:…` (unit test confirms it "ignores the manifest image"). But the admitted lifecycle proof builds a harness image (`plexica-ci-sidecar-harness:$project`), passes it via the manifest, then probes `http://<alias>:3000` expecting `sidecar-ok`. The created container is a bare node image with no `Cmd` override — its default CMD is a REPL that exits immediately and serves nothing on port 3000. The probe cannot succeed.
- Impact: Either the `ci` job's "Prove real CI sidecar lifecycle" step fails every run (permanently red pipeline — Constitution Rule 2 violation) or the proof validates nothing about declared plugin images (dead-weight `docker build`). Note the failure modes cancel against each other: had the substitution not happened, the proxy would reject the harness image anyway (`ci-plugin-docker-proxy.mjs:104` requires `body.Image === pinned digest`). CI-PORT-07's create/start/proxy/remove inspection proof is not demonstrable as wired.
- Suggestion: Make the proof end-to-end coherent: either (a) build/push the harness as a digest-pinned reference and inject it as `PLUGIN_SIDECAR_IMAGE` into both `core-api-e2e` and the plugin proxy for this path, or (b) keep the pinned runtime image but add a CI-only `Cmd` passthrough (proxy already permits Entrypoint/Cmd at `ci-plugin-docker-proxy.mjs:132-133`; the manager does not send one) so `sidecar-ok` is served. Whatever is chosen must actually execute once against real Docker before merge.

---

## Major Findings (should fix before merge)

### [MAJOR] Security — un-pinned `POST /images/create` on the Docker socket proxy
**Found independently by BOTH models.**
Refs: `infra/docker/ci-plugin-docker-proxy.mjs:150-151,173-177`.
- Issue: `allowed()` admits `POST /images/create` for ANY reference without validating `fromImage`/`tag`/`fromSrc` against `PLUGIN_SIDECAR_IMAGE`; rule `'image'` skips ownership checks and `upstreamPath` forwards the incoming URL verbatim. `GET /images/<any-ref>/json` inspects arbitrary images too.
- Impact: A compromised Core can make the daemon pull arbitrary images from attacker-chosen registries (registry-side SSRF, disk exhaustion against the 60 GiB admission budget, pre-staging content in the daemon store). It cannot *run* them (create enforces `Image === sidecarImage`), hence Major not High — but this contradicts ADR-031's trust-boundary claim ("Client payloads can never select an image").
- Suggestion: For `POST /images/create`, parse the query and fail unless the resolved repository matches the pinned reference's repository part; reject `fromSrc` entirely. Restrict `GET /images/<ref>/json` to the pinned reference — or drop `/images/create` and pre-pull at proxy startup.

### [MAJOR] Correctness — admission headroom race unresolved (prior #9)
**Found independently by BOTH models.**
Refs: `.github/actions/docker-infra/scripts/verify-ci-runner-capacity.sh:14-31`; `verify-concurrent-ci-runtime.sh:43,153`; `ci.yml:13,58,88`.
- Issue: Headroom is measured point-in-time with no serialization/reservation. Three same-label jobs start concurrently, and inside the contract job both project bootstraps re-run admission concurrently.
- Impact: Two admissions can each observe ≥12 GiB free before either allocates → nondeterministic OOM/thrash on exactly the concurrency CI-PORT-10 exists to make safe.
- Suggestion: `flock` on `$RUNNER_TEMP/plexica-ci/.admission-lock` around measurement, writing per-project reservation records consumed by later admissions; or serialize whole-job admission with a lockfile held until teardown.

### [MAJOR] Performance — duplicated full Playwright suites on the critical path
Refs: `verify-concurrent-ci-runtime.sh:49-52,137-140`; `ci.yml:156-159`; `timeout-minutes: 90` at `ci.yml:14`.
- Issue: Project B runs all four Playwright suites during bootstrap, again in `verify_project` after A teardown, and the `ci` job runs them a third time. The duplicated suites are the longest sequential segment of a 90-minute-capped job with retries prohibited by design.
- Impact: Doubled/tripled critical path risks timeout-driven flakiness of exactly the deterministic gate this spec delivers.
- Suggestion: In `verify_project`, after A teardown assert B survival via the targeted `ci-runtime-contract.spec.ts` pair plus Core/Kafka/Keycloak health probes only; leave full suites to bootstrap + `ci` job.

---

## Minor Findings

1. **[MINOR] Security** — `action.yml:13`: `purpose` still interpolated via `${{ inputs.purpose }}` directly in the shell run block instead of `env:` (prior #10). All call sites hardcode safe values today; injection shape remains. Fix: pass via `env: PURPOSE`, validate before interpolation.
2. **[MINOR] Correctness** — Raw `source "$runtime/host.env"` bypasses ownership/symlink/mode re-validation at `ci-runtime-compose.sh:51` and `verify-concurrent-ci-runtime.sh:114-115` (prior #11, partially resolved — only `source-ci-runtime-host.sh` routes through `export_host`). Fix: route through the validating loader or add a validate-only subcommand before each raw source.
3. **[MINOR] Test-Spec Coherence** — No "wrong mapping" negative for the readiness gate (prior #16): `wait-services.test.sh` stubs always return the correct `runtime-config.js`; nothing drives `verify-health.sh:18-29` with a mismatched/poisoned config asserting job failure, though tasks-orchestration 5.1 explicitly requires it and tech-spec.md:119-123 states the AC. Fix: add a poisoned-stub case asserting non-zero exit.
4. **[MINOR] Correctness** — `%q` writer vs naive reader + unencoded password interpolation persists (`ci-runtime-env.sh:25`, `ci-runtime-compose.sh:35,39`, `e2e/ci-runtime-manifest.ts:46-49`; prior #6). Mitigated: TS reader now fails closed on non-conforming credential shapes, so corruption is loud not silent. Still: encode URL components at build site and add a hostile-charset write→parse round-trip test.
5. **[MINOR] Security/Hygiene** — Teardown never removes `$RUNTIME_DIR`: plaintext credentials (`host.env`, `keycloak-credentials.env`) persist after `down -v` (`down-ci-runtime-project.sh:27-28`). Also `sanitize-ci-runtime-diagnostics.mjs:7` regex still misses `KEYCLOAK_ADMIN_USER`. Fix: validated `rm -rf` of the runtime dir after successful down; add `user` to the redaction registry.
6. **[MINOR] Constitution Compliance** — `packages/auth/src/runtime-endpoints.ts:46-50`: dead clause `unsafeApiBase(String(value.apiBase))` unreachable (prior #13); unconditional throw fires even when `ciRuntime === false` → stale local `dist/runtime-config.js` white-screens dev preview. Fix: delete dead disjunct; scope the throw to explicit contract/deployed conditions.
7. **[MINOR] Security** — Repo-root read-only bind mount `.:/workspace:ro` on all four CI containers incl. the socket-mounted proxy exposes `.env`/`.git` (prior #12, shape changed from per-file mounts but risk equivalent); contradicts ADR-031's "only the CA-bundle bind" wording for the proxy. Fix: narrow mounts to required subtrees or document accepted risk in ADR-031.
8. **[MINOR] Maintainability** — CWD-dependent `-f docker-compose.yml …` in `start-services.sh:8`, `wait-services.sh:8`, `verify-health.sh:9`, `down-ci-runtime-project.sh:28` while sibling scripts resolve root from script path. Fix: shared `repo_root()` helper.
9. **[MINOR] Correctness** — Port-reuse sentinel regex `(^|[^0-9])PORT([^0-9]|$)` scans whole manifest text including base64url secrets; a digit run inside a credential matching an inspected port fails the job spuriously (~1%/run across pattern×manifest combinations) (`verify-concurrent-ci-runtime.sh:82-93`). Fix: restrict matching to `_BASE`/`_URL`/`KAFKA_BROKERS` values.
10. **[MINOR] Correctness** — `endpoint()` in `ci-runtime-compose.sh:16` accepts `localhost:<port>` while every downstream consumer requires strict `127.0.0.1` → late confusing failure instead of discovery-time rejection. Fix: tighten regex to `^127\.0\.0\.1:[1-9][0-9]*$`.
11. **[MINOR] Correctness** — `KAFKA_BROKERS` port validation unbounded (>65535 accepted) vs bounded URL ports (`e2e/ci-runtime-manifest.ts:80`, `ci-runtime-endpoint-contract.mjs:66`). Fix: share one validator with numeric ≤65535 check.
12. **[MINOR] Constitution Compliance** — Silent-empty `${ADMIN_E2E_PUBLIC_BASE}` / `${WEB_E2E_PUBLIC_BASE}` / `${KEYCLOAK_PUBLIC_ISSUER_BASE:-}` defaults persist (`docker-compose.ci.yml:17-18`, `ci-runtime-services.yml:15`) instead of `:?required`. Downstream fail-closed softens impact; fix for fail-fast ordering.
13. **[MINOR] Maintainability** — `apps/web/e2e/ci-runtime-contract.spec.ts` vs admin twin remain ~95% identical (57 lines each; undocumented asymmetry: admin uses explicit `page.goto(ADMIN_E2E_PUBLIC_BASE)` at :13, web relies on baseURL). Fix: extract shared parameterized helper into `e2e/`.
14. **[MINOR] Documentation/Spec Consistency** — Task statuses still inverted: task 5.4 unchecked although fully implemented and wired (`ci.yml:44`); both task-file headers say "Status | Pending" while phases 1–5 are checked (prior #17, partial). Fix: reconcile statuses so FORGE traceability reflects reality.
15. **[MINOR] Correctness** — CWD-dependent `$PWD` interpolation remains in `ci-runtime-env.test.sh:47`. Fix: derive from script path.

---

## Prior-Round Resolution Table (17 findings)

| # | Prior finding | Status | Evidence |
|---|---|---|---|
| 1 | Render gate rejects `published:""` | **RESOLVED** | `verify-ci-compose-render.sh:24` accepts empty/absent published, rejects fixed values; tests cover accept+reject cases (`verify-ci-compose-render.test.sh:47-52`); guard runs against real Compose in CI (`start-services.sh:13`). |
| 2 | Vacuous wildcard-CORS assertion | **RESOLVED** | Cross-origin probe `Origin: http://evil.example` asserting ACAO ≠ `*` and ≠ reflected origin in both specs (`apps/{web,admin}/e2e/ci-runtime-contract.spec.ts:46-51`); same-origin checks retained. |
| 3 | Missing `e2e/keycloak/admin-api.test.ts` | **RESOLVED** | File exists (95 lines) with wrong-source negatives rejecting ambient KEYCLOAK_URL disagreement (:53-58) and external hosts (:83-94); wired into web vitest config and quality job (`ci.yml:74`). |
| 4 | TS manifest consumer accepts localhost/::1/portless | **RESOLVED** | `strictLoopbackUrl` mandates hostname `127.0.0.1` + explicit port 1–65535 (`e2e/ci-runtime-manifest.ts:26-40`); credentials strictly pattern-checked; host-admin ≡ issuer enforced (:77-79). |
| 5 | docker.sock proxy escalation surface | **PARTIALLY RESOLVED** | Digest-pin fail-closed startup (:10-13), create payload allowlist with fixed binds/network/no ports (:83-147), ownership assertions (:52-74). Residual: un-pinned `/images/create` (new Major above). |
| 6 | `%q` escaping / URL encoding | **NOT RESOLVED** (peer) / **PARTIALLY RESOLVED** (primary) | Writer still `%q` (`ci-runtime-env.sh:25`); raw password interpolation (`ci-runtime-compose.sh:35,39`); no hostile-charset round-trip test. Mitigation: TS reader now fails closed on malformed credential shapes → loud failure, not silent corruption. Kept as Minor #4. |
| 7 | Trap signals leak Compose stacks | **RESOLVED** | `trap cleanup EXIT` + INT/TERM handlers with idempotency guard (`verify-concurrent-ci-runtime.sh:28-39`); tested (:84-98). |
| 8 | Substring port matching false positives | **RESOLVED** | Exact numeric comparison via associative array keyed on `${port%%:*}` (:68-80); near-miss cases tested. New narrower regex-over-secrets issue logged as Minor #9. |
| 9 | Admission TOCTOU race | **NOT RESOLVED** | No flock/reservation anywhere; concurrent admissions at `verify-concurrent-ci-runtime.sh:43,153`. Escalated to Major. |
| 10 | Expression injection via `purpose` | **NOT RESOLVED** | `action.yml:13` unchanged; kept as Minor #1 (all current call sites hardcoded). |
| 11 | Raw `source host.env` skips re-validation | **PARTIALLY RESOLVED** (primary) / **NOT RESOLVED** (peer) | `export-host` and `source-ci-runtime-host.sh` validate properly, but `ci-runtime-compose.sh:51` and `verify-concurrent-ci-runtime.sh:114-115` still source manifests raw. Kept as Minor #2. |
| 12 | Read-only mounts expose `.env`/`.git` | **PARTIALLY RESOLVED** | Per-file mounts replaced by single repo-root `.:/workspace:ro` mount — risk equivalent, simpler shape; ADR-031 wording still contradicts proxy mount. Kept as Minor #7. |
| 13 | Dead `unsafeApiBase` / mis-scoped throw | **NOT RESOLVED** | `runtime-endpoints.ts:46-50` unchanged. Kept as Minor #6. |
| 14 | Duplicate host binding CLI vs vite config | **RESOLVED** | No `--host` CLI flags in overlays; binding solely via gated vite configs (`apps/web/vite.config.ts:41,50`, admin :24,30); regression guard added and tested (`verify-concurrent-ci-runtime.sh:106-118`). |
| 15 | `rpk topic create \|\| true` | **RESOLVED** | Rewritten describe→create-if-absent→alter-config (`ensure-topics.sh:16-22`); broker-down still fails hard under `set -euo pipefail`; genuine-failure negative tested (:46-48). Base `infra/redpanda/ensure-topics.sh:12` retains `|| true` but is backstopped by alter-config + describe/grep fail-hard. |
| 16 | Missing wrong-mapping readiness negative | **NOT RESOLVED** | Gate implemented (`verify-health.sh:18-29`) but no negative test exists. Kept as Minor #3. |
| 17 | Stale task statuses | **PARTIALLY RESOLVED** | Phases 1–4 and 5.1–5.3 checked; task 5.4 unchecked despite being implemented+wired; headers still "Pending". Kept as Minor #14. |

---

## Dimension Coverage

| Dimension | Coverage |
| --- | --- |
| Correctness | Covered — HIGH sidecar-proof contradiction; admission race; port-sentinel regex over secrets; localhost acceptance drift; KAFKA_BROKERS bounds |
| Security | Covered — un-pinned `/images/create`; `purpose` template-injection shape; credential persistence; `.env`/`.git` exposure |
| Performance | Covered — duplicated Playwright critical path (Major) |
| Maintainability | Covered — CWD-relative compose paths; ~95%-duplicated contract specs; dead code |
| Constitution Compliance | Covered — Rule 1/2 evidence blocked by HIGH; Rule 4 compliant (max file 200 lines); Rule 5 compliant (ADR-031); no console.log/skip patterns in prod paths |
| Test-Spec Coherence | Covered — AC-by-AC cross-check; uncovered negative for readiness-gate AC (tech-spec.md:119-123); orphan/vacuous proofs flagged |
| UX Quality | N/A — infra-only changes; no UI components/styles/user flows modified |

## Positive Findings

- Round-1 major correctness fixes are real and test-backed: render gate, CORS cross-origin probe, strict TS manifest reader, trap hygiene, exact port comparison, single host-binding mechanism, idempotent topic creation.
- New negative tests added where prior review demanded them (admin-api wrong-source, render gate fixtures, verifier idempotent-cleanup, topic-create genuine failure).
- Structural rules hold: largest reviewed file exactly 200 lines; no `console.log` in production paths; admission precedes install/build/pull/start in all three jobs; Zod validation on Core external config intact.

## Recommendation

**NEEDS CHANGES** — 1 HIGH (blocking), 3 Major, 15 Minor.

Required before human review:
1. Reconcile harness image ↔ `resolveSidecarImage()` ↔ proxy pinning so the sidecar lifecycle proof actually runs a serving workload (HIGH — blocks CI-PORT-07 evidence and Constitution Rule 1/2).
2. Restrict or eliminate `POST /images/create` on the socket proxy to the pinned reference (Major).
3. Serialize admission via lockfile reservation (Major).
4. Trim duplicated Playwright suites from the verifier critical path (Major).

Plus commit-message discipline per Constitution Rule 6 when this tree is committed (English-only Conventional Commits).
