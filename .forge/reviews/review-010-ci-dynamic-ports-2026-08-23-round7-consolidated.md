# FORGE Dual-Model Adversarial Review — Spec 010 CI Dynamic Ports — Round 7 (Consolidated)

| Field | Value |
| --- | --- |
| Date | 2026-08-23 |
| Reviewers | forge-reviewer (primary) + forge-reviewer-peer (dual-model) |
| Scope | Commits `288eb42` (feat(ci): isolate concurrent Docker runtime ports), `67a688c` (chore(ci): align dynamic runtime with Compose updates), plus uncommitted working tree (76 files, ~1936 insertions / 404 deletions) |
| Spec | `.forge/specs/010-ci-dynamic-ports/` (tech-spec.md, plan.md, tasks.md, tasks-orchestration.md), ADR-031 |
| Verdict | **REQUEST_CHANGES** (both reviewers independently) |

## Summary of what was reviewed

Full spec 010 implementation across two commits and the current uncommitted working tree: GitHub Actions workflow + docker-infra composite action and scripts (runtime env/compose contracts, admission, diagnostics sanitization/scanning, concurrent verifier, scoped teardown), Compose overlays (`docker-compose.ci.yml`, `infra/compose/docker-compose.ci-runtime-services.yml`), Redpanda CI entrypoint, Keycloak reconciliation, core-api config/contract/plugin sidecar services, web/admin Vite configs + same-origin runtime endpoints, packages/auth runtime-endpoints, E2E helpers and contract specs. Prior rounds 1–6 consulted; fixed items verified closed and not re-reported unless regressed or incomplete.

**Held-fixed verification (both reviewers):** R5-CRITICAL eager-load compose failure stays closed (real unstubbed `docker compose config` in render tests); R4/R5 tautological tests genuinely replaced with behavioral negatives; R6 duplicate-run fix landed for the verifier phase; atomicity fixes for runtime-config/listener writes landed; new admission flock added. No regressions found.

---

## Consolidated findings by dimension

### Dimension 1 — Correctness & Security

| # | Severity | Finding | Files | Source |
|---|---|---|---|---|
| C1 | **Major (blocking)** | Concurrent A/B bootstrap runs full web/admin suites from the same working tree with default shared Playwright output dirs (`test-results/`, `playwright-report/`); identical test titles → cleared/crossed traces and spurious reds on exactly the job that must prove concurrency safety deterministically. Fix: per-project output dirs or serialize suite invocation. | `verify-concurrent-ci-runtime.sh:51-52,155`; `e2e/playwright-base.ts:122-125` | Peer (unique) |
| C2 | Medium | `%q` quoting vs Compose `env_file` literal parsing mismatch: contract files are consumed both via bash `source` (%q-decoded) and Compose env_file (literal). Safe today only because all current values are %q-stable; any future credential with `$`/space/quote is silently mangled in one direction. Fix: validate safe charset at contract layer and emit raw, or split writers. | `ci-runtime-env.sh:25`; `docker-compose.ci-runtime-services.yml:11-14,81-83` | Primary |
| C3 | Minor | Failed container assertion after `startContainer` leaves rogue sidecar running — no best-effort stop/remove before rethrow. | `container-manager.service.ts:121-122` | Primary |
| C4 | Minor | CI target-rejection message masked: identity errors converted to generic `'Invalid proxy target URL'`. | `proxy.service.ts:66-69`; `plugin-container-identity.ts:53-59` | Primary |
| C5 | Minor | Sentinel tuples snapshot only six services (redis/minio/mailpit/loki excluded); AC "A's inspected port-to-container tuples" only partially honored. Extend list or document. | `verify-concurrent-ci-runtime.sh:58,164,174-175` | Primary |
| C6 | Minor | `assertCiPluginTarget` validates alias but not port; spec says "exactly the project network/alias". | `plugin-container-identity.ts:53-60` | Peer |
| C7 | Minor | Docker-proxy forbidden-env scan happens at start-time rules check; create path skips `assertOwned`, so forbidden containers can be created before refusal. | `.github/actions/docker-infra/scripts/bin/ci-plugin-docker-proxy.mjs:87-89` | Peer |
| C8 | Minor | Postgres password interpolated into manifest URLs unencoded; special chars break URL confusingly. | `ci-runtime-compose.sh:32` | Peer |

**Verified sound (no findings):** endpoint direction split (host=strict loopback / container=exact DNS), Core issuer-vs-JWKS call-site separation, runtime-dir owner/mode/symlink/traversal guards, secrets excluded from browser `runtime-config.js`, canary-proven diagnostics redaction, label+identity double-validated scoped `down -v`, raw docker.sock trust boundary documented in ADR-031 and enforced in code.

### Dimension 2 — Spec Compliance

All CI-PORT-01…12 traced to implementation with anchors (see traceability matrix below). **Gap:** tasks 5.4 / 6.1 / 6.2 unchecked — see B1.

| # | Severity | Finding | Files | Source |
|---|---|---|---|---|
| S1 | Medium | Contract E2E spec (`ci-runtime-contract.spec.ts`) runs twice per project: explicit pre-run at verifier :49-50 plus again inside full `playwright test` (:51-52, no `testIgnore`). Doubles login+CRM-install+proxy flow on the retry-prohibited 90-min path. Drop explicit pre-runs or add `testIgnore`. | `verify-concurrent-ci-runtime.sh:49-52`; `apps/web/playwright.config.ts` | Primary |
| S2 | Minor | Misleading step name "Migrate through the host manifest" runs only `test -f host.env`; actual migrations live in wait-services.sh. Carried since R4. | `ci.yml:144-145`; `wait-services.sh:25-26` | Both (convergent) |

### Dimension 3 — Test-Spec Coherence

Strong. Verified behavioral negatives: readiness-refusal AC via real curl refusal + wrong-projection assertion (`ci-runtime-lifecycle.test.sh:86-117`); fresh-runner no-vars regression + rendered-model propagation (`verify-ci-compose-render.test.sh:66-104`); direction/wrong-source negatives in endpoint/env/plugin tests; browser same-origin, no-Core-host-request, header preservation, no-wildcard-CORS proven against live responses incl. plugin-proxy paths. Verifier self-test asserts exact once-per-phase spec counts, failure isolation, near-miss port contracts.

| # | Severity | Finding | Files | Source |
|---|---|---|---|---|
| T1 | Minor | Residual coherence gap: all Docker-touching suites stub the docker CLI; only real-daemon path is `verify-ci-sidecar-lifecycle.mjs` inside core-api. Downstream of B1. | multiple test files | Both (convergent) |
| T2 | Minor | Lifecycle-test hygiene: fixture issuer port 99999 (>65535); CURL_LOG set but never written/asserted. | `ci-runtime-lifecycle.test.sh:110,114` | Both (convergent) |
| T3 | Nit | Fixture port 99999 flagged separately by peer. | same | Peer |

### Dimension 4 — Constitution Compliance

Rule 3 ✅ (single shared runtime-endpoints parser; vite proxy duplication sanctioned). Rule 4 ✅ (all inspected files ≤200 lines: max 198; line gate runs in CI) — though peer notes the line gate has a blind spot for root-level YAML (`check-authored-lines.sh:8-11`) while this spec edits exactly such files. Rule 5 ⚠️ minor drift: ADR-031 says "exactly one sidecar image" while implementation admits two (`CI_SIDECAR_HARNESS_IMAGE`). Rule 6 ✅ English commits. **Rules 1–2 blocked by B1** — suites exist and block but have never executed end-to-end.

| # | Severity | Finding | Files | Source |
|---|---|---|---|---|
| K1 | Minor | Line-gate blind spot for root-level YAML files. | `check-authored-lines.sh:8-11` | Peer |
| K2 | Minor | ADR-031 wording ("exactly one sidecar image") vs two-image implementation. | ADR-031; `sidecar-image.ts` | Peer |

### Dimension 5 — Maintainability & Code Quality

Robustness strong: `set -euo pipefail` throughout, validated project IDs, 0700 strict dirs, atomic manifest/listener writes, flock-serialized admission, label-validated teardown.

| # | Severity | Finding | Files | Source |
|---|---|---|---|---|
| M1 | Medium | Non-atomic direct writes can permanently poison runtime state: crash mid-write of `keycloak-credentials.env` or `admission.env` leaves partial file that the idempotent branch then rejects forever (regeneration only when absent; init refuses pre-existing dirs). Blast radius one run-id dir. Use tmp+mv (pattern exists at `publish-sidecar-images.sh:58-63`). | `ci-runtime-keycloak-credentials.sh:32-34`; `verify-ci-runner-capacity.sh:46-48` | Primary (peer converges on non-atomic writes class) |
| M2 | Minor | SC2086 unquoted expansions in down script. | `down-ci-runtime-project.sh:11-12,17,28` | Both (convergent) |
| M3 | Minor | Idempotent branch sources `sidecar-images.env` raw without `-O`/symlink/0600 guard (admission.env has one). | `verify-ci-sidecar-lifecycle.sh:22-24,42` | Both (convergent) |
| M4 | Minor | Inline `${{ inputs.purpose }}` interpolation without allowlist validation. | `ci-runner-admission/action.yml:13` | Both (convergent) |
| M5 | Minor | Unpinned harness base image `FROM`. | `infra/docker/ci-sidecar-harness.Dockerfile:1` | Both (convergent) |
| M6 | Minor | TOCTOU race on shared root mkdir between concurrent jobs → spurious fail-closed; use mkdir -p + mode recheck. | `ci-runtime-path.sh:23` | Primary |
| M7 | Minor | `export_host` checks `-O && ! -L` on host.env but not mode — weaker than keycloak-credentials guard. | `ci-runtime-env.sh:65` | Primary |
| M8 | Minor | Dead checked-in docker stub remains in repo. | `.github/actions/docker-infra/scripts/bin/docker` | Peer (carried) |

### Dimension 6 — UX Quality (CI developer experience)

Error messages specific and actionable (endpoint() names offending mapping; capacity gates name exact shortfall). Local dev unchanged: overlay-only changes, non-CI Vite host unset, runtimeEndpoints falls back outside contract.

| # | Severity | Finding | Files | Source |
|---|---|---|---|---|
| U1 | Minor | Verifier computes `failed_projects` then discards it with bare `exit 1` — doesn't name which project failed. | `verify-concurrent-ci-runtime.sh:156-161` | Primary |
| U2 | Minor | Runtime dirs accumulate indefinitely under `$RUNNER_TEMP/plexica-ci/` on persistent runners: contract job never tears down its own dir; quality job has no cleanup phase; `init_ci_runtime` refuses pre-existing ones. | `ci.yml:39-54,56-83` | Both (convergent) |

### Dimension 7 — Operational Risk

No retry/skip/downscale/bypass/`continue-on-error` paths found anywhere. Retries disabled under contract (`playwright-base.ts`); artifacts `if: always()` + `if-no-files-found: error`.

| # | Severity | Finding | Files | Source |
|---|---|---|---|---|
| O1 | Minor | Diagnostics scanner pattern list omits `user(?:name)?` / `access_key` key names. | sanitize/scan mjs | Peer (carried) |
| O2 | Minor | KAFKA_BROKERS port unbounded (>65535 accepted). | broker validation | Peer (carried since R3) |

---

## Traceability matrix (CI-PORT-01..12)

All 12 requirements trace to implementation anchors **and** automated test evidence:

| Req | Implementation | Tests |
|---|---|---|
| 01 Ownership/project ID/dir | `ci-runtime-path.sh`, admission action, validated selectors everywhere | down/cleanup tests |
| 02 Dynamic ports/sentinel/gates | `127.0.0.1::port` overrides, `endpoint()` regex guard, render gate | render tests incl. negatives; legacy-port assert |
| 03 Endpoint contracts | atomic dual-contract writer + assert-host/container | env/endpoint-contract tests |
| 04 Core E2E boundary | DNS-only core-api-e2e env; `/api` proxy → `http://core-api-e2e:3001` | browser same-origin E2E; contract spec |
| 05 Redpanda gated listener | staged listener file tmp+mv before release | redpanda contract tests; Kafka roundtrip |
| 06 Keycloak request-host issuer | overlay env, staged credentials/issuer, container JWKS base | keycloak-contract tests; issuer mjs; core unit tests |
| 07 Plugin sidecars | identity/scope/contract/sidecar-image services | unit tests; sidecar lifecycle proof |
| 08 State/reconciliation | manifest-only provisioning + reconcile readback | admin-api tests |
| 09 Independent contract job | separate bootstrap jobs; `ci` needs contract | workflow structure; verifier |
| 10 Admission | first post-checkout step, all three jobs; thresholds fail hard | capacity tests incl. shortfalls |
| 11 Evidence/no bypass | sanitize+scan fail-closed, always() uploads | scan/sanitize tests |
| 12 Vite binding/readiness | CI-only `host:'0.0.0.0'`; readiness + projection check | vite.config tests; lifecycle negatives |

**Traceability gaps:** (1) Tasks 5.4/6.1/6.2 unchecked — no recorded green admitted-runner `--full-e2e` run anywhere (= blocking finding B1). (2) Sentinel tuple AC partially honored (six-service subset, C5).

---

## Verdict: REQUEST_CHANGES

Both reviewers independently returned REQUEST_CHANGES.

### Blocking issues (must fix before merge)

| # | Issue | Attribution |
|---|---|---|
| **B1** | **No admitted-runner execution evidence.** Tasks 5.4 (`--full-e2e` two-project verifier), 6.1, 6.2 remain unchecked; every Docker-touching test stubs the docker CLI. The spec's central acceptance criteria — A-down/B-survives with real daemon dynamic ports, dead-registry digest resolution of the pinned sidecar harness image, bind-mount write-between-create-and-start ordering, true two-project concurrency — are statically plausible but formally unproven after seven rounds. Constitution Rules 1–2 cannot be discharged without this. *Action:* execute on an admitted runner, attach sentinel artifact + run link, check tasks 5.4/6.1/6.2. | Both reviewers (top finding each) |
| **B2** | **Shared Playwright output dirs corrupt concurrent A/B runs.** Parallel bootstraps run full suites from one tree into default `test-results/`/`playwright-report/`; identical titles → cleared/crossed artifacts and spurious failures on the very job proving concurrency determinism. *Action:* per-project output dirs or serialized suite invocation. | Peer (unique); primary did not find |

### Non-blocking issues (fix soon / track)

1. [Med] `%q` vs Compose env_file latent mismatch (`ci-runtime-env.sh:25`)
2. [Med] Contract spec double-run per project (`verify-concurrent-ci-runtime.sh:49-52`)
3. [Med] Non-atomic credential/admission writes risking permanent runtime-dir poisoning
4. [Min] Rogue sidecar left running on failed post-start assertion
5. [Min] Proxy target-rejection error masked to generic message
6. [Min] Sentinel tuple subset (six services)
7. [Min] Plugin target port not validated in `assertCiPluginTarget`
8. [Min] Proxy create-path skips owned-container assertion
9. [Min] Unencoded DB password in manifest URLs
10. [Min] Misleading "Migrate through the host manifest" step name
11. [Min] Line-gate blind spot for root-level YAML
12. [Min] ADR-031 "exactly one sidecar image" vs two-image reality
13. [Min] SC2086 quoting; raw `sidecar-images.env` source; `${{ inputs.purpose }}` interpolation; unpinned harness FROM; root-mkdir TOCTOU; host.env mode-guard gap; dead docker stub; lifecycle-test port/CURL_LOG nits; unnamed failing projects in verifier; runtime-dir accumulation on runners; scanner key-list gaps; unbounded KAFKA_BROKERS port

---

*Reviewer disagreement note:* none material. The two models converged on B1 as the sole merge gate; the peer additionally elevated the Playwright output-dir collision to blocking (B2), which the primary missed — adopted as blocking given it directly undermines the deterministic concurrency proof required by Constitution Rule 2. Full individual reports: `/tmp/opencode/010-review-primary.md`, `/tmp/opencode/010-review-peer.md`.
