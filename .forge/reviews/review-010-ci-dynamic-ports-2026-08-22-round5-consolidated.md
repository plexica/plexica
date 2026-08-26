# FORGE Dual-Model Adversarial Review — Spec 010 CI Dynamic Ports — Round 5 (CONSOLIDATED)

- **Date**: 2026-08-22
- **Scope**: uncommitted working tree, ~75 files, +1720/−394 (`git status`/`git diff` + untracked files)
- **Models**: forge-reviewer `[PRIMARY]` × forge-reviewer-peer `[PEER]`, run in parallel per FORGE governance
- **Individual reports**:
  - `.forge/reviews/review-010-ci-dynamic-ports-2026-08-22-round5-primary.md`
  - `.forge/reviews/review-010-ci-dynamic-ports-2026-08-22-round5-peer.md`
- **Orchestrator verification**: the decisive CRITICAL was re-verified independently with shell access (grep of overlay files, start/wait-services scripts, `$GITHUB_ENV` writers, keycloak-credentials writer) — see CONFIRMED below.

---

## Verdict: REQUEST CHANGES (both models, unanimous)

One CRITICAL defect of the same failure class that produced Rounds 2–4 blockers persists: stubbed suites validate units while real fresh-runner Compose wiring fails closed before any service starts. Round-4 fixes were correctly implemented for what they covered, but the eager-load fix family was only partially addressed.

| Severity | Count |
|---|---|
| CRITICAL | 1 |
| HIGH | 0 |
| MEDIUM | 3 |
| MINOR | 7 |
| NIT | 3 |

---

## Consensus findings (flagged by BOTH models)

### 🔴 [CONSENSUS][CRITICAL-1] — CONFIRMED BY ORCHESTRATOR
Compose overlay requires `WEB_E2E_PUBLIC_BASE`, `ADMIN_E2E_PUBLIC_BASE`, `KEYCLOAK_PUBLIC_ISSUER_BASE` at every project load; nothing exports them before the first `compose create`.

- `docker-compose.ci.yml:17-18`, `infra/compose/docker-compose.ci-runtime-services.yml:18` — `${VAR:?required}`
- `start-services.sh:16` (`compose create …`) and `wait-services.sh:14` (`up -d --wait`) precede any point where the values exist (`write-browser` wait-services:35; complete-stage source :36)
- Only `$GITHUB_ENV` writers in tree: `ci.yml:31,106` (encryption material) and `ci-runner-admission/action.yml:15` (project/dir) — none export the three vars
- Corroboration: the render gate itself must inject placeholders (`verify-ci-compose-render.sh:22-24`) and the R4-BLOCKER-2 regression test passes all three explicitly (`verify-ci-compose-render.test.sh:74-76`)
- Orchestrator check ruled out the one potential false positive: `keycloak-credentials.env` (sourced `set -a` before first compose call) contains only `KEYCLOAK_ADMIN_USER/PASSWORD/E2E_CLIENT_SECRET`

On a clean admitted runner (no repo `.env` per ADR-031) both jobs die at their first Compose call. Fix: export loopback placeholder values before any compose call (existing sourcing order overwrites with real values before any container embedding them is created), or move the origin injection out of the always-loaded overlay; add an unstubbed regression test running `docker compose config` **without** those variables set.

### 🟠 [CONSENSUS][MEDIUM-1] Task 5.1 lifecycle "verification" is a tautology
`ci-runtime-lifecycle.test.sh:4-7` reduces to grepping literal strings in another script. Task 5.1's acceptance ("readiness gate fails for an altered mapping") has zero behavioral coverage. Fix: stubbed-docker negative case feeding verify-health.sh a poisoned mapping.

### 🟠 [CONSENSUS][MEDIUM-2] Readiness-refusal AC still untested after 3 rounds
tech-spec.md:119-123 requires "refused or wrong mapping fails the job"; `wait-services.test.sh:35-38` curl stub always returns the correct body. Carried OPEN since R3 #3.

### 🟠 [CONSENSUS][MEDIUM-3] Sidecar digest resolution vs dead registry never proven end-to-end
`publish-sidecar-images.sh` removes the ephemeral registry, then Core resolves installs to `127.0.0.1:<port>/sidecar-harness@sha256:` — plausible daemon-side local-store resolution but statically unverifiable and never executed (task 5.4 pending). Fix: in-job `docker image inspect "$CI_SIDECAR_HARNESS_IMAGE"` guard + discharge via admitted-runner run.

### 🟡 [CONSENSUS][MINOR] (all carried from R3/R4, unchanged)
1. Duplicated contract-spec runs (`verify-concurrent-ci-runtime.sh:140-141`; retry-prohibited 90-min path)
2. `KAFKA_BROKERS` port unbounded >65535 (`ci-runtime-endpoint-contract.mjs:66`, `e2e/ci-runtime-manifest.ts:80`)
3. Fail-closed scanner omits `user(?:name)?` keys while sanitizer covers them (`scan-ci-runtime-diagnostics.mjs:7,10`)
4. Raw `source sidecar-images.env` without `-O`/symlink/0600 guard (`verify-ci-sidecar-lifecycle.sh:22-24`)
5. Harness image layers accumulate in daemon store; only tag removed (`verify-ci-sidecar-lifecycle.sh:26`)
6. Non-atomic writes to final paths (`ci-runtime-keycloak-credentials.sh:33-34`, `ci-runtime-compose.sh:41`) vs tmp+mv used elsewhere
7. Misleading step name — `ci.yml:143-144` "Migrate through the host manifest" runs only `test -f`
8. SC2086 unquoted expansions (`down-ci-runtime-project.sh:12,28`)
9. Unpinned harness base image (`infra/docker/ci-sidecar-harness.Dockerfile:1`)

---

## Single-model findings

- 🟢 [PRIMARY][NIT] Render gate validates placeholder-env config rather than created config; silent bootstrap-failure exit in verifier (`verify-concurrent-ci-runtime.sh:158-160`) — primary model only.
- 🟢 [PEER][NIT] Inline `${{ inputs.purpose }}` shell interpolation in `ci-runner-admission/action.yml:13`; callers pass fixed literals so theoretical, but it is the exact pattern R4 eliminated elsewhere. Validate against an allowlist — peer model only.

No contradictions between models; severity rankings agreed on every overlapping finding.

---

## Prior-round remediation (both models concur)

| Prior finding | Status |
|---|---|
| R4 BLOCKER-1 (digest-pin regex vs emitted loopback ref) | ✅ RESOLVED — validators widened identically, round-trip + near-miss tests added (`sidecar-image.test.ts:88-107`) |
| R4 BLOCKER-2 (fresh-runner load order) | ⚠️ PARTIALLY RESOLVED — `sidecar-images.env` pre-create fixed and tested; sibling eager-load requirements unresolved → CRITICAL-1 |
| R4 Minors 1–5, Nits 1–3 | ❌ OPEN (mapped to consensus minors above) |
| R3 Majors + Minors 8–16 | ✅ RESOLVED (stable), spot-reverified by both models |
| R3 #3 readiness-refusal negative | ❌ OPEN (3rd round carried = MEDIUM-2) |

No regression of previously resolved items.

---

## Traceability matrix highlights

Coverage against CI-PORT-01–12 is otherwise strong across tasks 1.x–5.x (admission gate, contract writer, render gate, overlay services, Redpanda gated listener, Keycloak staging, core issuer split, plugin identity/proxy, browser runtime config, vite proxies, manifest-only Playwright, workflow rebuild, two-project verifier, diagnostics).

Gaps:
- `.github/actions/ci-runner-admission/` — **[NO TASK]** (implements task 5.3 intent but absent from tasks.md Files sections; add a line)
- `quality` job — **[ORPHAN CHANGE]** candidate (likely pre-existing job brought under admission contract; note in tasks.md 5.3)
- Readiness-refusal AC — **[NOT IMPLEMENTED]** at test level (= MEDIUM-2)
- Residual: never-cleaned wrapper runtime dirs under `$RUNNER_TEMP/plexica-ci/` on persistent runners

## Dimension notes

- **D1 Correctness/Security**: CRITICAL-1 dominates; otherwise strong posture (validated project IDs, 0700/0600 modes, fail-closed guards, digest pins, socket-proxy allowlists, sanitized diagnostics).
- **D2 Constitution**: ≤200-line rule respected (max inspected: config.ts 198); no console.log in production paths; Zod validation upheld; ADR-031 matches implementation.
- **D4 Test-Spec Coherence**: contracts well tested; weak spots are the tautological lifecycle test and pervasive docker-stubbing that again let a real-wiring defect through.
- **D7 CI DX**: error messages specific/actionable; main hazard is CRITICAL-1 itself (bare `required variable … missing` far from cause).

---

## Required actions to clear REQUEST CHANGES

1. **Fix CRITICAL-1** (early placeholder export or defer origins out of always-loaded overlay) + unstubbed no-vars regression test.
2. Add behavioral negative tests for readiness-gate refusal (clears MEDIUM-1 + MEDIUM-2).
3. Execute the long-pending admitted-runner end-to-end proof (tasks 5.4/6.1), explicitly capturing the daemon digest-resolution assumption (MEDIUM-3) as evidence.
4. Sweep the cheap carried minors (dup spec runs, KAFKA bounds, scanner keys, raw-source guard, atomic writes, base-image pin).
5. Add traceability entries for `ci-runner-admission` action and `quality` job in tasks.md.
