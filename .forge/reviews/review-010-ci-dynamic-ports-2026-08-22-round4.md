# FORGE Adversarial Review — Spec 010 CI Dynamic Ports — Round 4

- **Date**: 2026-08-22
- **Scope**: uncommitted working tree (`git diff HEAD` + untracked files): ~75 modified files (+1696/−393 lines) plus ~40 new files, implementing Round-3 fixes.
- **Method**: dual-model adversarial review. Pass A (`forge-reviewer`) and Pass B (`forge-reviewer-peer`) executed in parallel this round (nested-agent infra repaired by commit `chore(forge): enable nested review agents`; one initial empty result was retried successfully). Both passes ran independent checklists. Pass B's session exposed no shell tool, so all execution claims were verified by the orchestrator with real commands and marked accordingly.
- **Constitution**: `.forge/constitution.md` Rules 1–6 assessed article-by-article.
- **Prior rounds**: round 1–3 reports consulted for resolution tracking only; accepted residuals not re-litigated.

---

## Verdict

# REQUEST CHANGES

**Both models independently recommend REQUEST CHANGES.** The Round-3 fix direction was correctly implemented architecturally, but two new BLOCKERs were found — same failure class as rounds 2–3: green unit/contract suites validate units in isolation while real Docker/Compose wiring fails closed. Neither BLOCKER is reachable by any existing test suite; both were reproduced/proven during this review.

### Severity counts

| Severity | Count |
|---|---|
| BLOCKER | 2 |
| Major | 0 |
| Minor | 5 |
| Nit | 3 |
| Residual-Accepted | 4 (unchanged) |

---

## BLOCKER findings

### [BLOCKER-1] Digest-pin regex rejects the exact reference `publish-sidecar-images.sh` emits → proxy crash-loops and Core sidecar resolution throws on every run

**Files**: `.github/actions/docker-infra/scripts/publish-sidecar-images.sh:43,56-61`; `infra/docker/ci-plugin-docker-rules.mjs:8,12-14`; `services/core-api/src/modules/plugin/services/sidecar-image.ts:6,25-30`

Both validators share:

```
^[a-z0-9][a-z0-9._/-]*(?::[0-9]+)?(?::[a-z0-9._-]+)?@sha256:[a-f0-9]{64}$
```

The leading class admits `/` but not `:`. For `127.0.0.1:<port>/sidecar-harness@sha256:<64hex>`, name consumes `127.0.0.1`, port group consumes `:<port>`, and `/sidecar-harness` is unreachable — no backtracking path matches. **Verified by orchestrator execution** (`node -e`, random port):

```
matches pin regex: false          # emitted loopback-registry ref
node:24-bookworm@sha256:… true    # passes only via accidental tag-group backtrack
```

Deterministic consequences on every run where `sidecar-images.env` exists:
1. `plugin-docker-proxy` throws at module load (`ci-plugin-docker-rules.mjs:12-14`) → socket proxy down for the whole job.
2. `resolveSidecarImage()` throws per install (`sidecar-image.ts:27-30`) → CI-PORT-07 proof (`verify-ci-sidecar-lifecycle.mjs:16`) can never pass.

**Test seam**: no test covers the loopback form — `sidecar-image.test.ts:18` uses a portless fake ref; `ci-plugin-manager-proxy-payload.test.ts:20-21` likewise; `publish-sidecar-images.test.sh:70-86` asserts file content only; shell gate at `verify-ci-sidecar-lifecycle.sh:35` checks only the `@sha256:` suffix, green-lighting references its own Node consumers reject.

**Fix**: widen both regexes identically to admit an optional registry host prefix, e.g. `^(?:[a-z0-9][a-z0-9.-]*(?::[0-9]+)?/)?[a-z0-9][a-z0-9._/-]*(?::[a-z0-9._-]+)?@sha256:[a-f0-9]{64}$`; keep fail-closed behavior; add a round-trip test asserting the literal emitted ref passes `isDigestPinnedImage` AND proxy startup validation; execute once against real Docker.

### [BLOCKER-2] Fresh-runner ordering inversion: Compose requires `sidecar-images.env` at load time, long before publication

**Files**: `docker-compose.ci.yml:2-3` (`include:` pulls the overlay into every invocation); `infra/compose/docker-compose.ci-runtime-services.yml:11,82` (required short-form `env_file` on `core-api-e2e`, `plugin-docker-proxy`); `start-services.sh:14` → `verify-ci-compose-render.sh:26` renders before anything publishes the file; publication happens later in `wait-services.sh:27-28`. `ci-runtime-env.sh init:34` pre-creates `host.env`, `container.env`, `runtime-config.js`, `redpanda-listener.env` — but NOT `sidecar-images.env`.

Compose resolves `env_file` eagerly at project-load time. **Verified by orchestrator execution against real Docker 29.7.2**:

```
$ docker compose --project-name plexica-ci-abc123456 -f docker-compose.yml -f docker-compose.ci.yml config --quiet
env file /tmp/opencode/rt/sidecar-images.env not found: stat … no such file or directory   ← exit 1
```

So `phase: full` (`action.yml:30-51`) dies at its very first compose invocation on a clean runner — independent of BLOCKER-1 — proving the pipeline has never executed end-to-end. All script tests stub Docker entirely (`verify-ci-compose-render.test.sh:10-41`, `wait-services.test.sh:12-30`), which is why nothing caught it.

**Fix**: pre-create an empty/placeholder `sidecar-images.env` (mode 600, sibling ownership guards) in `ci-runtime-env.sh init` or at the top of `start-services.sh` before any compose call; alternatively long-form `env_file` with `required: false` plus the existing fail-closed consumer checks. Add one unstubbed integration test running real `docker compose config` against the overlay from a fresh runtime dir.

---

## Minor findings

1. **[Minor] Duplicated contract-spec runs + path asymmetry left in `verify_project`** — `verify-concurrent-ci-runtime.sh:138-141`: lines 140-141 repeat 138-139 (web/admin contract spec each run twice on a retry-prohibited, 90-min-capped critical path); line 141 drops the `e2e/` prefix (incomplete-edit artifact). Full Playwright suites were correctly trimmed (R3 Major fixed). Fix: delete 140-141, restore prefix on 141.
2. **[Minor] `KAFKA_BROKERS` port still unbounded** — `e2e/ci-runtime-manifest.ts:80`, `.github/actions/docker-infra/scripts/ci-runtime-endpoint-contract.mjs:66` accept ports >65535 while URL-valued manifest entries bound at 65535 (`ci-runtime-manifest.ts:26-40`). Carried PARTIAL since R3 #11.
3. **[Minor] Diagnostics scanner omits `user` key** — `scan-ci-runtime-diagnostics.mjs:7,10`: sanitizer covers `user(?:name)?` (`sanitize-ci-runtime-diagnostics.mjs:7`) but the fail-closed scanner does not, so a leaked `KEYCLOAK_ADMIN_USER=…` would pass the scan. Align key lists.
4. **[Minor] Raw `source` of `sidecar-images.env` bypasses ownership/mode re-validation** — `verify-ci-sidecar-lifecycle.sh:22-24`: idempotent branch sources directly; unlike `host.env` there is no `-O`/symlink/mode check. Same shape as the previously fixed host.env bypass.
5. **[Minor] Harness image blobs accumulate in the daemon store** — `verify-ci-sidecar-lifecycle.sh:26` removes only the tag; pushed digest-referenced layers persist across runs, eroding the 60 GiB admission threshold (`verify-ci-runner-capacity.sh:45`). Add scoped prune of dangling sidecar layers in teardown.

## Nit findings

1. **[Nit] Unpinned harness base image** — `infra/docker/ci-sidecar-harness.Dockerfile:1`: `FROM node:24-bookworm` vs repo-wide `tag@digest` standard. Carried from R3.
2. **[Nit] Non-atomic credentials write** — `ci-runtime-keycloak-credentials.sh:33-34`: direct write to final path; mid-write crash permanently fails `valid()` re-check until manual cleanup. Use tmp+mv as `publish-sidecar-images.sh:58-63` already does.
3. **[Nit] Unquoted expansions (SC2086)** — `down-ci-runtime-project.sh:12,28`. Safe today (hex IDs); quote or use arrays.

---

## Round-3 resolution table (consensus)

| R3 finding | Status | Evidence |
|---|---|---|
| **BLOCKER** sidecar proof wired with rejected refs | **NOT RESOLVED — new variant introduced by fix** | Mechanism replaced correctly (ephemeral registry, digest pinning) but validator grammar contradicts emitted shape → BLOCKER-1; plus load-order inversion → BLOCKER-2 |
| **Major** Rule 4: 204-line proxy, line gate red | **RESOLVED** | Decomposed: `ci-plugin-docker-proxy.mjs` 113 lines + `ci-plugin-docker-rules.mjs` 112; largest scoped file 198 (`config.ts`); `bash scripts/check-authored-lines.sh` PASSES (orchestrator-executed) |
| **Major** duplicated full Playwright suites in verifier | **RESOLVED** (with residual minor) | Full suites now only at bootstrap (`verify-concurrent-ci-runtime.sh:49-52`); `verify_project` runs contract specs only (:137-141); duplicate contract runs logged as Minor 1 |
| Minor 1 `purpose` interpolated inline | RESOLVED | `action.yml:25-66` routes inputs via `env:` blocks (admission action keeps inline form with fixed literals — theoretical only) |
| Minor 2 raw `source host.env` | RESOLVED | `source-ci-runtime-host.sh:7` → validated `export-host`; used at `verify-concurrent-ci-runtime.sh:113,115,129` |
| Minor 3 wrong-mapping readiness negative missing | NOT RESOLVED | `wait-services.test.sh:35-38` stub always returns correct config; no poisoned case |
| Minor 4 `%q` writer round-trip hostile test | NOT RESOLVED | `ci-runtime-env.sh:25` unchanged; no hostile-charset test |
| Minor 5 credential persistence / admin-user redaction | RESOLVED | `down-ci-runtime-project.sh:31-33` chmod+rm+assert-gone; sanitizer covers user keys; scanner gap = new Minor 3 |
| Minor 6 dead disjunct / mis-scoped browser throw | RESOLVED | `packages/auth/src/runtime-endpoints.ts:33` returns undefined when `!ciRuntime`; throw scoped to contract mode |
| Minor 7 repo-root `:ro` mounts incl. socket proxy | Residual-Accepted | Unchanged (`docker-compose.ci-runtime-services.yml:25,51,69,87`) |
| Minor 8 CWD-relative compose paths | RESOLVED | All four scripts derive root from `BASH_SOURCE` |
| Minor 9 sentinel regex over secrets | RESOLVED | `verify-concurrent-ci-runtime.sh:88` anchors `_URL\|_BASE\|_BROKERS`; base64url credentials cannot contain `.`/`:` (orchestrator adjudication of pass divergence) |
| Minor 10 `endpoint()` accepts localhost | RESOLVED | `ci-runtime-compose.sh:16-18` strict regex + explicit rejection |
| Minor 11 KAFKA_BROKERS bounds | PARTIAL (unchanged) | New Minor 2 |
| Minor 12 silent-empty env defaults | RESOLVED | `${…:?required}` at `docker-compose.ci.yml:17-18`, `docker-compose.ci-runtime-services.yml:18` |
| Minor 13 ~95% identical spec twins | RESOLVED | Both specs 11-line shims over shared `runCiRuntimeContractFlow` |
| Minor 14 stale task statuses | RESOLVED (defensibly partial per Pass B) | Headers honest ("pending admitted-runner verification"); 5.4 unchecked pending real-runner proof — currently blocked by the two BLOCKERs |
| Minor 15 `$PWD` in env test | RESOLVED | Passed as argument, no interpolation |
| Minor 16 unrestricted proxy inspect surface | RESOLVED | Restricted to trustedImages w/ decode guard (`ci-plugin-docker-proxy.mjs:55-62`); traversal negatives tested |
| Nit unpinned harness base | NOT RESOLVED | New Nit 1 |

No prior finding regressed except insofar as the R3-BLOCKER fix introduced the two new fatal defects above.

---

## Dimension coverage

| Dimension | Verdict | Note |
|---|---|---|
| Correctness | **Issues — 2 BLOCKERS** | Regex/reference-shape contradiction (proven by execution); fresh-runner compose ordering (reproduced against real Docker) |
| Security | Issues (minor) | Strong overall: digest-pinned images everywhere, fail-closed validators, flock admission, 0700 runtime dirs, sanitize→scan-fail-closed diagnostics pipeline; residuals: scanner `user` gap, raw env source |
| Performance | Issues (minor) | Duplicated contract specs on timeout-capped critical path; harness blob accumulation |
| Maintainability | Clean* | Rule 4 decomposition clean (policy/transport seam); *gate passes by orchestrator execution |
| Constitution Compliance | Partial | R4 compliant (verified); R5 compliant (ADR-031 updated; ephemeral-registry mechanism may merit an amendment note); R1/R2 designed-compliant but unsatisfiable until blockers fixed; R3 N/A (frontend patterns untouched); R6 N/A (uncommitted tree) |
| Test-Spec Coherence | Issues | CI-PORT-07 undemonstrable (BLOCKER-1); AC "readiness refuses wrong mapping" untested (tech-spec.md:119-123); pervasive docker-stubbing masks real Compose semantics — neither BLOCKER reachable by any suite |
| UX Quality | N/A (clean) | Infra-only; dev-facing errors in runtime-endpoints libs clear and correctly scoped post-R3 rewrite |

---

## Consensus / divergence notes

- **Consensus (both passes)**: verdict REQUEST CHANGES; BLOCKER-1 mechanics and consequences; R3 Major 1 and Major 2 resolved; minors 1-3 list overlap.
- **Divergence adjudicated by orchestrator execution/static check**:
  - *R3 #9 sentinel regex*: Pass A RESOLVED, Pass B NOT RESOLVED → **adjudicated RESOLVED**: pattern anchors on `_URL|_BASE|_BROKERS` keys and base64url values cannot contain `.`/`:` (`verify-concurrent-ci-runtime.sh:88`).
  - *R3 #14 task statuses*: Pass A RESOLVED, Pass B PARTIAL → **RESOLVED with defensible caveat** (5.4 unchecked pending real-runner proof that the BLOCKERs currently prevent).
  - *Playwright duplication*: Pass A PARTIAL, Pass B RESOLVED-with-new-minor → recorded as RESOLVED with residual Minor 1.
- **Infrastructure caveat**: initial subagent delegation returned empty twice this session (matching the R3-session defect); retries succeeded and both passes completed in parallel. Pass B executed no commands (no shell tool in its session); every execution-dependent claim was independently verified by the orchestrator and is labeled as such.

---

## Verification commands executed (orchestrator)

| Command | Result |
|---|---|
| `bash .github/actions/docker-infra/scripts/*.test.sh` (17 suites) | ALL PASS |
| `node --test .github/actions/docker-infra/scripts/*.test.mjs` (3 suites) | ALL PASS |
| `pnpm --filter core-api exec vitest run --project unit` (5 changed/new files) | 33/33 PASS |
| web/admin/auth lib suites (`ci-runtime-manifest`, `playwright-contract`, `runtime-endpoints` ×2, packages/auth) | 83/83 PASS |
| `bash scripts/check-authored-lines.sh` | PASS (max 200) |
| `wc -l infra/docker/ci-plugin-docker-proxy.mjs` | 113 lines (was >200) |
| `grep continue-on-error .github/workflows/ci.yml` | absent |
| `grep` fixed ports in `ci-runtime-env.sh` | absent |
| `node -e` regex vs emitted sidecar ref | **false → BLOCKER-1 confirmed** |
| Real `docker compose config` without `sidecar-images.env` | **exit 1 "env file not found" → BLOCKER-2 confirmed** |

---

## Positive findings

- The R3-BLOCKER fix architecture is genuinely right: ephemeral digest-inspected loopback registry (`publish-sidecar-images.sh:23-63`), atomic 0600 publication with staging cleanup, idempotent republish gating, admission-evidence gating — only the validator grammar betrays it.
- Proxy decomposition cleanly separates policy (`ci-plugin-docker-rules.mjs`: query allowlist, HostConfig allowlist, label equality, network/alias pinning) from transport (`ci-plugin-docker-proxy.mjs`).
- Teardown provably removes plaintext credentials and asserts removal; diagnostics gained a fail-closed leak scanner with 0600 per-file verification.
- Admission serialization via flock with pid evidence and honestly documented TOCTOU residual is exemplary fail-closed engineering.
- Task-file statuses now accurately distinguish implemented from proven-on-real-hardware — exactly the traceability FORGE wants.
- Every compose image is digest-pinned, including `registry:2` resolved at runtime rather than trusted mutable.

---

## Final recommendation

**REQUEST CHANGES.**

Required before next round (Round 5):
1. Fix BLOCKER-1 (both regexes + round-trip test on the literal emitted reference).
2. Fix BLOCKER-2 (pre-create `sidecar-images.env` in init/start; add unstubbed real-compose render test).
3. Execute `verify-ci-sidecar-lifecycle.sh` once end-to-end against real Docker on an admitted runner to finally discharge CI-PORT-07 (this also unlocks task 5.4).
4. Opportunistic: Minors 1-5 (cheap; Minor 1 saves real CI minutes).

The two BLOCKERs are small, surgical fixes (one regex widening each + one file pre-creation). With them addressed and one real end-to-end run captured as evidence, this changeset should be approvable.
