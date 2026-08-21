# Tasks: 010 — Orchestration and Final Verification

> Continuation of [tasks.md](./tasks.md). Complete its Phases 1–4 before the
> dependency-ordered orchestration and verification work below.

| Field | Value |
| --- | --- |
| Status | Pending |
| Spec | [tech-spec.md](./tech-spec.md) |
| Plan | [plan.md](./plan.md) |
| ADR | [ADR-031](../../knowledge/adr/adr-031-ci-runtime-contract-gated-orchestration.md) |

## Phase 5 — Orchestration, cleanup, and independent concurrent proof

- [ ] **5.1** `[L]` `[CI-PORT-01]` `[CI-PORT-02]` `[CI-PORT-04]` `[CI-PORT-05]` `[CI-PORT-08]` Stage create/inspect/start/wait using only the appropriate contract.
  - **Files**: Modify `.github/actions/docker-infra/action.yml`, `.github/actions/docker-infra/scripts/start-services.sh`, `.github/actions/docker-infra/scripts/wait-services.sh`, `.github/actions/docker-infra/scripts/verify-health.sh`, `.github/actions/docker-infra/scripts/ensure-topics.sh`; create `.github/actions/docker-infra/scripts/ci-runtime-lifecycle.test.sh`.
  - **Implementation**: Accept project/runtime directory inputs on every action/helper command. Implement the required sequence: render; create/inspect infra; publish host contract; health/discover Keycloak; create/inspect/write/release Redpanda; host-contract migrations/status/fixtures/provisioning; create Core with container contract; inspect Core; create web/admin with private proxy and generated runtime config; reconcile; and request each discovered web/admin loopback URL before Playwright. Remove hard-coded container names and source the correct contract explicitly per stage.
  - **Acceptance mapping**: CI-PORT-01–06, CI-PORT-08, CI-PORT-12; staged lifecycle and readiness acceptance.
  - **Dependencies**: Tasks 1.1–1.3, 2.1–2.3, 3.1, and 4.1–4.3 in [tasks.md](./tasks.md).
  - **Verification**: `bash .github/actions/docker-infra/scripts/ci-runtime-lifecycle.test.sh`; run a single disposable project through create/inspect/start/wait and prove the host readiness gate fails for an altered mapping.
  - **200-line guard**: Split lifecycle phases into dedicated scripts; do not turn `action.yml`, `start-services.sh`, or `wait-services.sh` into monoliths; run the line gate.

- [ ] **5.2** `[L]` `[CI-PORT-01]` `[CI-PORT-08]` `[CI-PORT-11]` Replace broad cleanup with label-scoped project diagnostics and teardown.
  - **Files**: Create `.github/actions/docker-infra/scripts/collect-ci-runtime-diagnostics.sh`, `.github/actions/docker-infra/scripts/down-ci-runtime-project.sh`, `.github/actions/docker-infra/scripts/ci-runtime-cleanup.test.sh`; modify `.github/actions/docker-infra/action.yml`; delete `.github/actions/docker-infra/scripts/cleanup-conflicts.sh`, `.github/actions/docker-infra/scripts/cleanup-ports.sh`.
  - **Implementation**: Select only resources whose project and Plexica scope labels exactly match the validated project. Retain sanitized `ps`, endpoint allowlist, admission facts, Docker events, bounded logs, sentinel result, and exits on success/failure; redaction failure must fail. Reject selectors that could reach unlabelled/foreign resources. Use project-specific `down -v`; never `pkill`, port-owner cleanup, or process-wide `down --remove-orphans`.
  - **Acceptance mapping**: CI-PORT-01, CI-PORT-08, CI-PORT-11; scoped diagnostic and teardown acceptance.
  - **Dependencies**: Tasks 1.1–1.2 and 2.1 in [tasks.md](./tasks.md).
  - **Verification**: `bash .github/actions/docker-infra/scripts/ci-runtime-cleanup.test.sh`; create foreign labelled/unlabelled fixtures and prove collection/teardown refuses them while project cleanup succeeds.
  - **200-line guard**: Isolate redaction, resource selection, and teardown into separate scripts; run the line gate.

- [ ] **5.3** `[L]` `[CI-PORT-09]` `[CI-PORT-10]` `[CI-PORT-11]` Rebuild the workflow as independently bootstrapped contract and CI jobs.
  - **Files**: Modify `.github/workflows/ci.yml`; modify `.github/actions/docker-infra/action.yml` only for declared workflow inputs/outputs.
  - **Implementation**: Add `ci-runtime-contract` and `ci`, both on `[self-hosted, plexica-ci-concurrent-e2e]`; make `ci` require the contract job but bootstrap its own project and Docker state. Immediately after checkout invoke Task 1.1 admission in both jobs, before setup/install/build/pull/start. Generate independent project/runtime values, pass them to every action/script/E2E command, remove fixed job environment endpoints and all broad cleanup/retry/skip/downscale/bypass patterns, and upload non-secret admission/scoped diagnostic artifacts with `if: always()` and `if-no-files-found: error`.
  - **Acceptance mapping**: CI-PORT-01, CI-PORT-09–11; both-job admission and independent-state acceptance.
  - **Dependencies**: Task 1.1 in [tasks.md](./tasks.md), plus Tasks 5.1 and 5.2 above.
  - **Verification**: `docker compose -f docker-compose.yml -f docker-compose.ci.yml config >/dev/null`; workflow lint/parse available in the repository; inspect the workflow to confirm admission is the first post-checkout executable step in both jobs and no broad cleanup remains.
  - **200-line guard**: `ci.yml` is already 192 lines—move reusable behavior to the composite action/scripts and keep the workflow at or below 200 lines; run the line gate.

- [ ] **5.4** `[L]` `[CI-PORT-01]` `[CI-PORT-05]` `[CI-PORT-07]` `[CI-PORT-09]` `[CI-PORT-11]` Implement the two-project full concurrent runtime verifier.
  - **Files**: Create `.github/actions/docker-infra/scripts/verify-concurrent-ci-runtime.sh`, `.github/actions/docker-infra/scripts/verify-concurrent-ci-runtime.test.sh`; modify `.github/actions/docker-infra/scripts/collect-ci-runtime-diagnostics.sh`, `.github/workflows/ci.yml`.
  - **Implementation**: `--full-e2e` must independently bootstrap projects A and B, run web and admin browser E2E against both, snapshot B tuples, then tear down A and prove B’s browser, Core health, Keycloak validation, plugin proxy, Kafka round trip, network/volume/topic/issuer/alias identities, and inspected tuples are unchanged. Record prior-port sentinels and fail on legacy ports, A-port reuse, resource cross-selection, wrong issuer/JWKS direction, browser Core request, unsafe plugin target, unsanitized diagnostics, or invalid `down -v` selection.
  - **Acceptance mapping**: CI-PORT-01–12; all final acceptance criteria, especially A-down/B-survives.
  - **Dependencies**: Tasks 2.1–2.3, 3.1–3.3, and 4.1–4.3 in [tasks.md](./tasks.md), plus Tasks 5.1–5.3 above.
  - **Verification**: `bash .github/actions/docker-infra/scripts/verify-concurrent-ci-runtime.test.sh`; `bash .github/actions/docker-infra/scripts/verify-concurrent-ci-runtime.sh --full-e2e` on an admitted runner.
  - **200-line guard**: Keep project bootstrap, sentinel comparison, endpoint checks, Kafka verification, and cleanup in focused helpers; run the line gate.

## Phase 6 — Final feature verification

- [ ] **6.1** `[M]` `[CI-PORT-01–12]` Run the blocking implementation verification matrix.
  - **Files**: No production file change; update only failing test targets named by prior tasks.
  - **Implementation**: Run contract/unit/integration checks before the concurrent full E2E verifier. Resolve failures without weakening assertions, adding skips, `continue-on-error`, retries, capacity bypasses, or fallback endpoints.
  - **Acceptance mapping**: CI-PORT-01–12; Constitution Rules 1, 2, and 4.
  - **Dependencies**: Tasks 1.1–5.4 in [tasks.md](./tasks.md) and this document.
  - **Verification**: `pnpm test:line-gate && pnpm check:lines`; `pnpm lint`; `pnpm typecheck`; `pnpm --filter core-api test`; `pnpm --filter web test`; `pnpm --filter @plexica/admin test`; `bash .github/actions/docker-infra/scripts/verify-concurrent-ci-runtime.sh --full-e2e`.
  - **200-line guard**: Treat a line-gate failure as blocking; split files rather than granting exceptions.

- [ ] **6.2** `[S]` `[CI-PORT-01–12]` Conduct the required adversarial review and attach CI evidence.
  - **Files**: Update implementation/test files only to address review findings; do not add runtime secrets or unredacted artifacts.
  - **Implementation**: Review boundary direction, project selection, request-host issuer, Redpanda metadata, sidecar target validation, browser same-origin behavior, admission sequencing, diagnostics redaction, and A-down/B-survives evidence.
  - **Acceptance mapping**: CI-PORT-01–12; Constitution Rules 1, 2, 4, and 5.
  - **Dependencies**: Task 6.1.
  - **Verification**: `/forge-review .forge/specs/010-ci-dynamic-ports/`; confirm the completed workflow uploads non-secret admission and scoped diagnostic artifacts for both jobs.
  - **200-line guard**: Re-run `pnpm test:line-gate && pnpm check:lines` after any review fix.

---

## Summary

| Metric | Value |
| --- | --- |
| Total tasks | 18 |
| Total phases | 6 |
| Parallelizable tasks | 7; 1.1/1.2, 2.2/2.3, 3.1/3.2, and 4.1 may proceed in their indicated phases |
| Requirements covered | CI-PORT-01 through CI-PORT-12 |
| Estimated effort | 40–56 hours |
| Scope assessment | Feature-scale, but near the upper boundary; do not escalate if one team can complete the staged lanes under ADR-031. Escalate to an epic if CI runner remediation, new infrastructure, or local/production contract changes are discovered. |

## Cross-references

| Document | Path |
| --- | --- |
| Task phases 1–4 | [tasks.md](./tasks.md) |
| Tech spec | [tech-spec.md](./tech-spec.md) |
| Plan | [plan.md](./plan.md) |
| ADR-031 | [ADR-031](../../knowledge/adr/adr-031-ci-runtime-contract-gated-orchestration.md) |
| Constitution | [constitution.md](../../constitution.md) |
