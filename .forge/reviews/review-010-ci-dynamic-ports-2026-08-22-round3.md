# Consolidated Adversarial Review — Spec 010 (CI Dynamic Ports), Round 3

**Date**: 2026-08-22
**Scope**: Working-tree delta on `feat/010-ci-dynamic-ports` — full unstaged diff (~75 files, +1622/−371) plus untracked files (`infra/docker/ci-sidecar-harness.Dockerfile`, harness Dockerfile consumers, updated proxy + tests, admission/capacity scripts, spec artifacts, ADR-031) reviewed against `.forge/specs/010-ci-dynamic-ports/{tech-spec.md,plan.md,tasks.md,tasks-orchestration.md}`, ADR-031, constitution, AGENTS.md.
**Reviewers**: forge-reviewer (primary pass) + forge-reviewer-peer (independent verification pass), consolidated by the Forge orchestrator.
**Prior rounds**: `.forge/reviews/review-010-ci-dynamic-ports-2026-08-22.md` (round 1, REQUEST_CHANGES), `.forge/reviews/review-010-ci-dynamic-ports-2026-08-22-round2.md` (round 2, REQUEST_CHANGES). Every round-2 finding re-verified below against code on disk.
**Verdict**: **REQUEST CHANGES**

> **Process note (transparency)**: Nested subagent delegation failed repeatedly this session
> (both `forge-reviewer` and `forge-reviewer-peer` task launches returned empty results —
> see commit `191f859 chore(forge): enable nested review agents`). The review was therefore
> executed by the orchestrator in two structured passes: a **primary verification pass**
> driven by the round-2 findings checklist, and an **independent adversarial pass** that
> re-derived expectations from tech-spec ACs and test suites before reading implementations.
> All file:line evidence below was verified directly on disk; all feasible unit tests were
> executed locally (results reported). Re-running `/forge-review` once subagent delegation
> is restored is recommended before human review.

---

## Verdict Summary

- Round 3 consensus: **1 BLOCKER (HIGH), 2 Major, 16 Minor, 1 NIT**.
- Round-2 resolution: of 4 blocking items — **2 RESOLVED** (`/images/create` pinning; admission flock serialization), **2 NOT RESOLVED** (sidecar proof coherence — changed shape, now worse: see BLOCKER; duplicated Playwright critical path). Of 15 minors — **2 PARTIALLY RESOLVED**, **13 NOT RESOLVED**, **0 REGRESSED** beyond the sidecar item.
- Constitution: **VIOLATED** — Rule 4 breached (`infra/docker/ci-plugin-docker-proxy.mjs` is 204 lines; `pnpm check:lines` fails, verified locally) which also turns the `quality` job red (Rule 2). Rule 1/2 evidence further blocked by the BLOCKER. Rules 3 and 5 compliant. Rule 6 N/A for the uncommitted tree; recent commits observed are English-only Conventional Commits.
- UX Quality: **N/A** — infra-only changes; the mis-scoped browser throw (Minor #6) remains the one UI-relevant defect (white-screen on stale local `dist/runtime-config.js` outside CI).

---

## Blocking Findings

### [BLOCKER] Correctness / Test-Spec Coherence — sidecar lifecycle proof wired with a tag reference that both trust boundaries reject
**Found identically by BOTH passes** (primary pass via wiring trace; peer pass via proxy test-suite expectations).
Refs: `infra/compose/docker-compose.ci-runtime-services.yml:21,82`; `.github/actions/docker-infra/scripts/verify-ci-sidecar-lifecycle.sh:16,21`; `infra/docker/ci-plugin-docker-proxy.mjs:9-16,107`; `services/core-api/src/modules/plugin/services/sidecar-image.ts:23-33`; `services/core-api/src/modules/plugin/services/container-manager.service.ts:75`.

- What was fixed since round 2 (genuinely): the harness path now exists end-to-end — `resolveSidecarImage()` resolves manifest images equal to `CI_SIDECAR_HARNESS_IMAGE` to the harness reference instead of silently substituting the pinned node image; the proxy admits create payloads whose `Image` is either trusted reference (`trustedImages`, proxy:107); the harness Dockerfile actually serves `sidecar-ok` on :3000; the proof inspects network/port/label contract and teardown isolation.
- What is broken: every production wiring point sets `CI_SIDECAR_HARNESS_IMAGE=plexica-ci-sidecar-harness:${CI_COMPOSE_PROJECT}` — a **tag reference, not digest-pinned**. But:
  1. The proxy **fails closed at startup**: lines 13–16 throw unless *both* `PLUGIN_SIDECAR_IMAGE` and `CI_SIDECAR_HARNESS_IMAGE` match the digest-pin regex. Its own test suite asserts exactly this ("an unpinned harness" → non-zero exit, `ci-plugin-docker-proxy.test.mjs:52-61`). Result: the proxy container crash-loops in every CI run, breaking all plugin Docker operations for the whole job.
  2. Even if it started, `resolveSidecarImage()` throws for any non-digest-pinned harness value (`sidecar-image.ts:27-29`) — the `-e CI_SIDECAR_HARNESS_IMAGE=$image` passed at `verify-ci-sidecar-lifecycle.sh:21` cannot resolve.
- Additional impossibility: a locally `docker build`-ed image has no repository digest (`RepoDigests` empty until pushed), so "just pin it" requires pushing to a local registry or loading by image ID — the fix must include that mechanism.
- Impact: the round-2 HIGH is **not resolved; it moved earlier in the failure chain**. Either the job is permanently red (Constitution Rule 2 violation) or the proof is dead weight. CI-PORT-07 evidence remains undemonstrable as wired.
- Required fix direction: publish the harness image to a project-scoped local registry (or `docker save/load` + digest computation), wire the resulting `name@sha256:…` into compose env for both `core-api-e2e` and `plugin-docker-proxy`, keep the fail-closed checks, and prove once end-to-end against real Docker.

---

## Major Findings

### [MAJOR] Constitution Rule 4 — line gate fails; authored file over 200 lines (also breaks Rule 2)
Refs: `infra/docker/ci-plugin-docker-proxy.mjs` (204 lines); `scripts/check-authored-lines.sh`; `.github/workflows/ci.yml:118`.
- Verified locally: `pnpm check:lines` → `Authored-file line gate failed: 1 file(s) exceed 200 lines.` The `quality` job executes `pnpm test:line-gate && pnpm check:lines` before anything else — **every CI run on this tree is red regardless of the BLOCKER**.
- Fix: decompose the proxy (natural seams: startup/pin validation, ownership assertions, create-payload sanitizer, request router) into ≤200-line modules under `infra/docker/`. Mechanical but mandatory.

### [MAJOR] Performance — duplicated full Playwright suites on the verifier critical path (carried, round-2 Major #3)
**Both passes agree.**
Refs: `.github/actions/docker-infra/scripts/verify-concurrent-ci-runtime.sh:51-52,137-140`.
- `verify_project` still runs the full web + admin Playwright suites (lines 139–140) immediately after running the targeted `ci-runtime-contract.spec.ts` pair (137–138), duplicating the full suites already executed during bootstrap (51–52). These are the longest sequential segments of a timeout-capped, retry-prohibited job.
- Fix: in `verify_project`, assert B survival via the targeted contract specs plus Core/Kafka/Keycloak health probes only; leave full suites to bootstrap.

---

## Minor Findings

Carried from round 2 unless marked NEW/PARTIAL. Statuses verified on disk this round:

1. **[MINOR]** `action.yml:13`: `purpose` still interpolated via `${{ inputs.purpose }}` inside the shell run block instead of `env:` (R2 #1). NOT RESOLVED.
2. **[MINOR]** Raw `source "$runtime/host.env"` bypasses ownership/symlink/mode re-validation at `ci-runtime-compose.sh:51` and `verify-concurrent-ci-runtime.sh:114-115` (R2 #2). NOT RESOLVED.
3. **[MINOR]** No "wrong mapping" negative for the readiness gate: `wait-services.test.sh` curl stub always returns the correct `runtime-config.js`; nothing drives `verify-health.sh` to failure on a poisoned config, though tasks-orchestration 5.1 requires it (R2 #3). NOT RESOLVED.
4. **[MINOR]** `%q` writer (`ci-runtime-env.sh:25,60-61`) vs strict TS reader; no hostile-charset write→parse round-trip test; password interpolated unencoded (R2 #4). NOT RESOLVED (mitigation unchanged: reader fails closed loudly).
5. **[MINOR]** Teardown never removes `$RUNTIME_DIR` — plaintext credentials persist after `down -v` (`down-ci-runtime-project.sh` has no cleanup of the dir); diagnostics sanitizer regex still does not cover `KEYCLOAK_ADMIN_USER` (`sanitize-ci-runtime-diagnostics.mjs:6` — key list lacks `user`) (R2 #5). NOT RESOLVED.
6. **[MINOR]** `packages/auth/src/runtime-endpoints.ts:46-54`: dead disjunct `unsafeApiBase(String(value.apiBase))` unreachable (apiBase `!== ''` already throws); unconditional throw fires even when `ciRuntime === false` → stale local `dist/runtime-config.js` white-screens dev preview (R2 #6). NOT RESOLVED.
7. **[MINOR]** Repo-root `.:/workspace:ro` mount on all four CI containers including the socket-mounted proxy exposes `.env`/`.git`; contradicts ADR-031's "only the CA-bundle bind" wording (ADR-031:60) (R2 #7). NOT RESOLVED.
8. **[MINOR]** CWD-dependent `-f docker-compose.yml …` in `start-services.sh:8`, `wait-services.sh:8`, `verify-health.sh:9`, `down-ci-runtime-project.sh:28` while sibling scripts resolve root from script path (R2 #8). NOT RESOLVED.
9. **[MINOR]** Port-reuse sentinel regex scans entire manifest text including base64url credentials (`verify-concurrent-ci-runtime.sh:88`) — spurious digit collision can fail the job (R2 #9). NOT RESOLVED.
10. **[MINOR]** `endpoint()` accepts `localhost:<port>` (`ci-runtime-compose.sh:16`) while downstream contract mandates strict `127.0.0.1` — late failure instead of discovery-time rejection (R2 #10). NOT RESOLVED.
11. **[MINOR]** `KAFKA_BROKERS` validation now mandates strict `127.0.0.1:` host (`e2e/ci-runtime-manifest.ts:80`) but port remains unbounded (>65535 accepted) (R2 #11). **PARTIALLY RESOLVED.**
12. **[MINOR]** Silent-empty `${ADMIN_E2E_PUBLIC_BASE}` / `${WEB_E2E_PUBLIC_BASE}` (`docker-compose.ci.yml:17-18`) and `${KEYCLOAK_PUBLIC_ISSUER_BASE:-}` (`ci-runtime-services.yml:15`) persist instead of `:?required` (R2 #12). NOT RESOLVED.
13. **[MINOR]** `apps/{web,admin}/e2e/ci-runtime-contract.spec.ts` remain ~95% identical (57 lines each; admin imports web helpers cross-app and adds explicit `page.goto(ADMIN_E2E_PUBLIC_BASE)` asymmetry) (R2 #13). NOT RESOLVED.
14. **[MINOR]** Task statuses: 5.1–5.3 now checked, but **5.4 remains unchecked although implemented and wired** (`ci.yml:44`); both task-file headers still say `Status | Pending`; 6.1/6.2 legitimately open (R2 #14). **PARTIALLY RESOLVED.**
15. **[MINOR]** CWD-dependent `$PWD` interpolation persists in `ci-runtime-env.test.sh:47` (R2 #15). NOT RESOLVED.
16. **[MINOR] NEW** Residual proxy surface: `GET /images/<any-ref>/json` inspects arbitrary images without restricting to trusted references (`ci-plugin-docker-proxy.mjs:153`). Read-only, but inconsistent with the pull/create pinning posture; restrict to `trustedImages` refs.

---

## Nits

1. **[NIT]** `infra/docker/ci-sidecar-harness.Dockerfile:1` builds `FROM node:24-bookworm` unpinned while the repo standard is Dependabot-managed `tag@digest` pins (see `0a20fee chore(ci): track Docker images via Dependabot tag@digest pins`). Pin the base or confirm Dependabot coverage extends to this new Dockerfile.

---

## Prior-Round Resolution Table

### Round-2 blocking items (4)

| # | Round-2 finding | Status | Evidence |
|---|---|---|---|
| B1 | Self-defeating sidecar lifecycle proof (HIGH) | **NOT RESOLVED — shape changed, escalated to BLOCKER** | Harness path added (`sidecar-image.ts:31-33`, serving Dockerfile, proxy `trustedImages`), but wired with tag references rejected by proxy startup pin check (`ci-plugin-docker-proxy.mjs:13-16`; own test `:52-61`) and by `resolveSidecarImage` (`sidecar-image.ts:27-29`). See BLOCKER above. |
| M1 | Un-pinned `POST /images/create` | **RESOLVED** | `fromImage` must be in `trustedImages` (`ci-plugin-docker-proxy.mjs:174-176`); rejects covered by passing test suite. Residual inspect surface logged as Minor #16. |
| M2 | Admission headroom TOCTOU race | **RESOLVED** | `flock` serialization around measure+admit window (`verify-ci-runner-capacity.sh:14-27,49`); documented residual post-admission overcommit accepted as out of scope; capacity test passes. |
| M3 | Duplicated full Playwright suites on critical path | **NOT RESOLVED** | Full suites still run twice per project (`verify-concurrent-ci-runtime.sh:51-52` bootstrap, `:139-140` verify_project). Carried as Major. |

### Round-2 minors (15)

| # | Finding | Status |
|---|---|---|
| 1 | `purpose` injection shape | NOT RESOLVED |
| 2 | Raw `source host.env` bypass | NOT RESOLVED |
| 3 | Wrong-mapping readiness negative missing | NOT RESOLVED |
| 4 | `%q` writer / URL encoding / round-trip test | NOT RESOLVED |
| 5 | Credential persistence + `KEYCLOAK_ADMIN_USER` redaction | NOT RESOLVED |
| 6 | Dead `unsafeApiBase` clause / mis-scoped throw | NOT RESOLVED |
| 7 | Repo-root `:ro` mount vs ADR-031 wording | NOT RESOLVED |
| 8 | CWD-relative compose paths | NOT RESOLVED |
| 9 | Port-sentinel regex over secrets | NOT RESOLVED |
| 10 | `endpoint()` accepts localhost | NOT RESOLVED |
| 11 | `KAFKA_BROKERS` port bounds | PARTIALLY RESOLVED (host strict, port unbounded) |
| 12 | Silent-empty env defaults | NOT RESOLVED |
| 13 | Duplicated contract spec twins | NOT RESOLVED |
| 14 | Stale task statuses | PARTIALLY RESOLVED (5.4/header stale) |
| 15 | `$PWD` interpolation in env test | NOT RESOLVED |

---

## Test Runs (executed locally this round)

| Suite | Result |
| --- | --- |
| `node infra/docker/ci-plugin-docker-proxy.test.mjs` | **PASS** (fail-closed startup matrix + create/pull allowlist) |
| 14 shell contract tests (`ci-runtime-env`, `-keycloak-credentials`, `-compose`, `-cleanup`, `ensure-topics`, `keycloak/redpanda-contract`, `verify-ci-runtime-artifacts`, `verify-ci-runner-capacity`, `verify-ci-sidecar-lifecycle`, `verify-ci-compose-render`, `wait-services`, `wait-for-http`, `down-ci-runtime-project`) | **ALL PASS** |
| Node contract tests (`ci-runtime-endpoint-contract`, `sanitize-ci-runtime-diagnostics`, `ci-workflow-contract`) | **PASS** |
| `verify-concurrent-ci-runtime.test.sh` | **PASS** (negative cases emit expected failure messages) |
| Vitest `sidecar-image.test.ts` + `ci-plugin-manager-proxy-payload.test.ts` (core-api) | **PASS** (14 tests) |
| Vitest `apps/web/src/lib/runtime-endpoints.test.ts` | **PASS** (13 tests) |
| `pnpm check:lines` | **FAIL** — `ci-plugin-docker-proxy.mjs: 204 lines (maximum 200)` |

Note: all green suites validate units in isolation — none can exercise the BLOCKER, which only manifests when the real compose wiring meets the proxy's fail-closed startup check.

---

## Dimension Coverage

| Dimension | Primary pass | Peer pass |
| --- | --- | --- |
| Correctness | Covered — BLOCKER wiring contradiction; carried port-sentinel/localhost/bounds issues | Covered — independently derived same contradiction from proxy test expectations; confirms proof cannot pass |
| Security | Covered — `/images/create` fix verified; residual `/images/<ref>/json` inspect; `purpose` injection shape; credential persistence | Covered — agrees pull path closed; flags inspect residual + raw-source bypass as remaining soft spots |
| Performance | Covered — duplicated Playwright critical path (Major) | Covered — concurs, notes retry prohibition amplifies timeout risk |
| Maintainability | Covered — 204-line proxy (Rule 4 breach); CWD-relative paths; spec twins | Covered — proposes decomposition seams matching primary pass |
| Constitution Compliance | Covered — Rule 4 VIOLATED (verified gate failure); Rules 1/2 blocked; Rule 3 no new violations; Rule 5 compliant (ADR-031 present/updated, mount-wording conflict logged); Rule 6 N/A (recent commits English Conventional) | Covered — same article-by-article outcome |
| Test-Spec Coherence | Covered — CI-PORT-07 evidence undemonstrable (BLOCKER); readiness-gate negative AC still untested; task 5.4 status stale | Covered — AC-by-AC cross-check concurs; notes verifier negatives are otherwise strong |
| UX Quality | **N/A** — infra-only changes | **N/A** — flags mis-scoped browser throw (Minor #6) as sole user-visible defect (dev-preview white-screen) |

---

## Consensus / Divergence Notes

- **Full consensus** on the BLOCKER mechanism, both Majors, the Rule 4 line-gate failure, and all resolution statuses. No finding had divergent severity between the two passes.
- The two passes reached the BLOCKER by different routes (production wiring trace vs. test-suite expectation derivation), which raises confidence it is real and not reviewer anchoring.
- Sole judgment call: whether the sidecar item should be HIGH or BLOCKER. Rated BLOCKER because it renders the `ci` job permanently red as wired (Rule 2) and invalidates the spec's central CI-PORT-07 evidence.
- Delegation caveat: see process note — subagent infrastructure returned empty results; passes were executed sequentially by the orchestrator with independent checklists. Recommend a true dual-model re-run when nested agents are restored.

## Positive Findings

- Round-2 majors on the proxy pull path and admission serialization are genuinely fixed with real tests (pull restricted to trusted refs; `flock` window with pid evidence and documented residual).
- The harness approach itself is sound: serving Dockerfile, exact identity/network/port inspection, teardown-isolation assertion, and admission-evidence gating in the proof script.
- All 22 executable contract/unit suites pass locally; negative-path coverage across the scripts remains unusually thorough.
- Structural hygiene elsewhere holds: no skip patterns or `continue-on-error` in workflows; Zod validation intact; recent commits English-only Conventional Commits.

## Recommendation

**REQUEST CHANGES** — 1 BLOCKER, 2 Major, 16 Minor, 1 Nit.

Required before human review:
1. Publish the sidecar harness image through a digest-bearing channel (local registry push or equivalent) and wire the pinned reference into both `core-api-e2e` and `plugin-docker-proxy`; prove once end-to-end against real Docker (BLOCKER).
2. Decompose `ci-plugin-docker-proxy.mjs` below 200 lines so the line gate — and therefore CI — goes green (Major, mechanical).
3. Trim duplicated full Playwright suites from `verify_project` (Major).
4. Address the two partially-resolved minors (KAFKA_BROKERS bounds; task 5.4/header statuses) opportunistically alongside the blockers.
