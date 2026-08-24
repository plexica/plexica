# Consolidated Adversarial Review — Spec 010 (CI Dynamic Ports)

**Date**: 2026-08-22
**Scope**: Working-tree changes — `.github/actions/docker-infra/**` (+ `ci-runner-admission`), `.github/workflows/ci.yml`, `docker-compose.ci.yml`, `infra/compose/docker-compose.ci-runtime-services.yml`, `infra/redpanda/ci-entrypoint.sh`, `apps/{web,admin}` runtime/proxy/E2E changes, `packages/auth/src/runtime-endpoints.ts`, `services/core-api/src/lib/ci-runtime-contract.ts`, spec artifacts (tech-spec/plan/tasks/tasks-orchestration), ADR-031.
**Reviewers**: forge-reviewer (primary) + forge-reviewer-peer (independent dual-model review)
**Verdict**: **REQUEST_CHANGES**

---

## Verdict Summary

- 0 Critical / ~5 Major / ~15 Minor across both models
- Constitution: **PARTIAL** — no article violations; Rule 1 weakened by a vacuous CORS assertion (4.1); tasks traceability broken (6.1); Rule 6 N/A (nothing committed yet — eventual commits must be Conventional Commits in English)

## Top Actionable Fixes (merged, prioritized)

| # | Sev | Finding | Refs |
|---|-----|---------|------|
| 1 | Major | Render gate rejects any entry with `published` key; real Compose ≥2.24 can emit `published: ""` for dynamic ports → total CI outage. Accept `published === ''`/undefined, reject only fixed values. Current test only validates its own fixture — prove once against real `docker compose config --format json`. | `verify-ci-compose-render.sh:24`, test `verify-ci-compose-render.test.sh:10–34` |
| 2 | Major | Wildcard-CORS AC asserted on same-origin requests → passes vacuously even with `cors: { origin: '*' }`. Add an Origin-bearing/cross-origin probe or runner-side curl. | `apps/{web,admin}/e2e/ci-runtime-contract.spec.ts:44–45` |
| 3 | Major | Task 4.3 planned `e2e/keycloak/admin-api.test.ts` (wrong-source negatives) — file does not exist; behavior only exercised incidentally in E2E. | `tasks.md:123`; `admin-api.ts:12–27` |
| 4 | Major | TS manifest consumer accepts `localhost`/`::1` and portless URLs while writer contract mandates `127.0.0.1` + explicit port — reader is last line of defense for all base URLs and accepts the fixed-localhost fallback the spec forbids. | `e2e/ci-runtime-manifest.ts:26–28,57–63` vs `ci-runtime-endpoint-contract.mjs:69–78` |
| 5 | Major | Docker proxy mounts `/var/run/docker.sock` and allows any image string + unrestricted image create. Mitigations verified but residual escalation path from plugin workload to runner host. Pin/allowlist images, document trust boundary in ADR-031. | `infra/docker/ci-plugin-docker-proxy.mjs:80–125,198` |
| 6 | Minor | `%q` escaping in writer vs naive parser reader: special chars in `POSTGRES_PASSWORD` corrupt URLs for TS consumers only. Also missing URL-component encoding at build site. Add round-trip test; encode password. | `ci-runtime-env.sh:25`, `ci-runtime-compose.sh:35`, `ci-runtime-manifest.ts:34–37` |
| 7 | Minor | Only `EXIT` trap installed in verifier — SIGINT/SIGTERM leak two full Compose stacks. Use `trap cleanup EXIT SIGINT SIGTERM`. | `verify-concurrent-ci-runtime.sh:28–35` |
| 8 | Minor | Port-reuse check uses substring matching → false positives (`3000` matches `30001`). Compare exact numeric ports. | `verify-concurrent-ci-runtime.sh:78–89` |
| 9 | Minor | Admission headroom measured point-in-time; two concurrent admissions can both pass before allocation → nondeterministic OOM. Serialize via `flock` reservations or cgroup slice per project. | `verify-ci-runner-capacity.sh:25`, `verify-concurrent-ci-runtime.sh:144` |
| 10 | Minor | Expression-injection shape: `purpose` input interpolated into shell before validation. Pass via `env:` and validate before use. | `.github/actions/ci-runner-admission/action.yml:13` |
| 11 | Minor | Raw `source "$runtime/host.env"` skips ownership/symlink re-validation done elsewhere. Route through validating loader. | `ci-runtime-compose.sh:51`, `verify-concurrent-ci-runtime.sh:105–106` |
| 12 | Minor | Repo-wide read-only bind mounts include `.env`/`.git` for e2e services — contradicts least-privilege posture; narrow mounts or document accepted risk in ADR-031. | `docker-compose.ci-runtime-services.yml:21,47,65,79–80` |
| 13 | Minor | Dead code: `unsafeApiBase(String(value.apiBase))` unreachable (`apiBase === ''` already threw); present-but-invalid runtime config throws even when `ciRuntime === false`. Remove dead clause, scope the throw. | `packages/auth/src/runtime-endpoints.ts:42–55` |
| 14 | Minor | CI host binding implemented twice: compose CLI `--host 0.0.0.0` overrides the tested vite-config conditional path. Drop CLI flag, rely on contract-gated vite config. | compose overlay `:42,60` vs `apps/*/vite.config.ts:24,30` |
| 15 | Minor | `rpk topic create … \|\| true` swallows all failures (spec CI-PORT-11 prohibits skip patterns). Replace with describe→create-if-absent idempotency. | `ensure-topics.sh:17,20` |
| 16 | Minor | Missing "wrong mapping" negative for readiness gate (task 5.1): stubbed web port returning mismatched `runtime-config.js` should fail. | `wait-services.test.sh` |
| 17 | Minor | Tasks files claim "Pending" with unchecked boxes while phases 1–5 demonstrably exist — FORGE traceability broken. Reconcile status. | `tasks.md`, `tasks-orchestration.md` |

### Additional minors
- Repo-root resolution inconsistent across lifecycle scripts (CWD-dependent `-f` paths) — resolve once via shared helper (`start-services.sh:8`, `wait-services.sh:8`, `verify-health.sh:9`).
- `endpoint()` accepts `localhost:` but downstream contract requires `127.0.0.1` — tighten regex (`ci-runtime-compose.sh:16`).
- `ci-runtime-env.test.sh:47` CWD-dependent `$PWD` interpolation — derive from script path.
- Credentials persist plaintext in `$RUNTIME_DIR` after teardown — `rm -rf` validated path in `down-ci-runtime-project.sh`.
- `KEYCLOAK_ADMIN_USER` not redacted in diagnostics sanitizer.
- Project B runs full Playwright suites twice (doubles longest sequential segment of 90-min job).
- Duplicated project-ID regex in ≥6 places; duplicated Playwright blocks in verifier; ~95% duplicated `ci-runtime-contract.spec.ts` between apps (cross-app helper import).
- `${ADMIN_E2E_PUBLIC_BASE}` silent-empty default in `docker-compose.ci.yml:17–18` — use `:?required`.

## Positive Findings

- Dual-contract direction enforcement, symlink/ownership checks, fail-closed admission gates with off-by-one boundary negatives, credential canary tests, diagnostics redaction with post-scan — unusually thorough for CI infra.
- No `continue-on-error`, retries, or skip patterns in workflows (one borderline `|| true` in ensure-topics).
- File-size rule compliant (largest reviewed: 198 lines).

## Dimension Coverage

Both reviewers covered: Correctness, Security, Performance, Testability/Test-Spec Coherence, Maintainability, Documentation/Spec Consistency, UX Quality (N/A — infra-only changes; noted white-screen on invalid runtime config is acceptable for CI-only failure mode).
