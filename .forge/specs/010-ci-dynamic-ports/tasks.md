# Tasks: 010 — Concurrent Self-Hosted CI Dynamic Ports

> Dependency-ordered implementation plan. This task list changes CI orchestration only;
> ordinary `docker compose up` and ADR-013 local plugin development remain unchanged.

| Field | Value |
| --- | --- |
| Status | Complete — verified on admitted self-hosted runner (run 32941464394) |
| Author | forge-scrum |
| Date | 2026-08-21 |
| Spec | [tech-spec.md](./tech-spec.md) |
| Plan | [plan.md](./plan.md) |
| ADR | [ADR-031](../../knowledge/adr/adr-031-ci-runtime-contract-gated-orchestration.md) |

---

## Legend and delivery guard

- `[CI-PORT-NN]` maps directly to the acceptance requirement in `tech-spec.md`.
- `[P]` means parallel with other marked tasks in the same phase once listed dependencies finish.
- Sizes: `[S]` <30m, `[M]` 30m–2h, `[L]` 2–4h. No task is larger than one focused session.
- **200-line guard (mandatory for every task):** each authored `.ts`, `.sh`, `.yml`, and
  `.yaml` target must be at most 200 lines. Split new orchestration into focused helpers
  before it reaches the limit; do not weaken `scripts/check-authored-lines.sh`.

## Phase 1 — Admission and immutable CI contracts

- [x] **1.1** `[L]` `[CI-PORT-10]` `[CI-PORT-11]` `[P]` Create fail-closed runner admission and evidence capture.
  - **Files**: Create `.github/actions/docker-infra/scripts/verify-ci-runner-capacity.sh`, `.github/actions/docker-infra/scripts/verify-ci-runner-capacity.test.sh`; modify `.github/actions/docker-infra/action.yml`.
  - **Implementation**: Before any install, build, pull, or Compose operation, require at least 4 online CPUs, at least 16 GiB effective cgroup memory, 12 GiB measured headroom, and 60 GiB Docker-root free space on any default `self-hosted` runner (revised 2026-08-24: the runner-class marker is no longer required). Treat missing or unreadable evidence as failure. Write only non-secret evidence below the caller-provided private runtime directory and make the action expose this as an explicit preflight phase.
  - **Acceptance mapping**: CI-PORT-10; CI-PORT-11 acceptance: capacity shortfall blocks before pull/start and evidence is retainable.
  - **Dependencies**: None.
  - **Verification**: `bash .github/actions/docker-infra/scripts/verify-ci-runner-capacity.test.sh`; exercise each threshold shortfall as non-zero cases.
  - **200-line guard**: Keep measurement, validation, and fixture/test code in separate files if needed; run `pnpm test:line-gate && pnpm check:lines`.

- [x] **1.2** `[L]` `[CI-PORT-01]` `[CI-PORT-02]` `[CI-PORT-03]` `[P]` Create the atomic dual-contract writer and source-direction checks.
  - **Files**: Create `.github/actions/docker-infra/scripts/ci-runtime-env.sh`, `.github/actions/docker-infra/scripts/ci-runtime-env.test.sh`.
  - **Implementation**: Validate a lower-case collision-resistant project ID and create `0700 "$RUNNER_TEMP/plexica-ci/$project"`. Atomically write `0600` `host.env`/host manifest and `container.env`; provide explicit `export-host`, `export-container`, and browser-runtime-config operations. Reject Compose DNS in host input, loopback/host-gateway or inspected port input in container input, missing manifest fields, the wrong contract for a consumer, a browser `apiBase` other than `''`, or browser Core endpoints. Do not implement port probing or free-port allocation.
  - **Acceptance mapping**: CI-PORT-01–03; CI-PORT-08 host/container ownership; CI-PORT-12 browser runtime configuration boundary.
  - **Dependencies**: None.
  - **Verification**: `bash .github/actions/docker-infra/scripts/ci-runtime-env.test.sh`; tests cover permissions, atomic replacement, wrong-source rejection, and forbidden browser values.
  - **200-line guard**: Split manifest parsing/validation from command dispatch before either script exceeds 200 lines; run the line gate.

- [x] **1.3** `[M]` `[CI-PORT-02]` Add Docker/Compose/render preflight that proves CI overrides every host publication.
  - **Files**: Create `.github/actions/docker-infra/scripts/verify-ci-compose-render.sh`, `.github/actions/docker-infra/scripts/verify-ci-compose-render.test.sh`; modify `docker-compose.ci.yml`.
  - **Implementation**: Require Docker >=24 and Compose >=2.24.4, render the CI stack with the supplied project name, and fail unless every host-consumed publication is a Docker-assigned `127.0.0.1::containerPort` CI `!override`. Reject fixed mappings, wildcard/non-loopback publication, base-port inheritance, and legacy project names before `compose create`.
  - **Acceptance mapping**: CI-PORT-01–02; prior-port/legacy-port exclusion in CI-PORT-09 acceptance.
  - **Dependencies**: Task 1.2.
  - **Verification**: `bash .github/actions/docker-infra/scripts/verify-ci-compose-render.test.sh`; `docker compose --project-name <validated-project> -f docker-compose.yml -f docker-compose.ci.yml config` must pass the guard.
  - **200-line guard**: Keep YAML overlay and render parser independently below 200 lines; run the line gate.

## Phase 2 — Staged project Compose runtime

- [x] **2.1** `[L]` `[CI-PORT-02]` `[CI-PORT-04]` `[CI-PORT-08]` Define the CI-only project-scoped Compose services and mount boundaries.
  - **Files**: Modify `docker-compose.ci.yml`; create `infra/compose/docker-compose.ci-runtime-services.yml`; modify `docker-compose.yml` only if an include is required for the CI overlay; modify `infra/compose/docker-compose.database-auth.yml`, `infra/compose/docker-compose.platform-services.yml`.
  - **Implementation**: Remove the CI `name`, retain developer mappings outside the overlay, and use dynamic loopback `!override` publications for every runner-consumed service. Define `core-api-e2e`, `web-e2e`, and `admin-e2e` on the project default network; mount only their intended private runtime artifacts, inject DNS-only infrastructure values into Core, and publish the discovered Core base for runner-only health/integration use. Give project resources Compose labels and no fixed `plexica-ci`/`plexica-e2e` identity.
  - **Acceptance mapping**: CI-PORT-01–04, CI-PORT-08, CI-PORT-12; Core service and runner-only Core mapping acceptance.
  - **Dependencies**: Tasks 1.2–1.3.
  - **Verification**: Render via Task 1.3, then `docker compose --project-name <project> -f docker-compose.yml -f docker-compose.ci.yml create postgres redis minio keycloak core-api-e2e web-e2e admin-e2e`; inspect that services, networks, volumes, and published ports are project-scoped.
  - **200-line guard**: Keep the new CI services in their own compose fragment and split any fragment at 200 lines; run the line gate.

- [x] **2.2** `[L]` `[CI-PORT-05]` `[P]` Gate Redpanda release on its inspected listener contract.
  - **Files**: Create `infra/redpanda/ci-entrypoint.sh`; modify `docker-compose.ci.yml`, `infra/compose/docker-compose.platform-services.yml`; create `.github/actions/docker-infra/scripts/redpanda-contract.test.sh`.
  - **Implementation**: After `compose create`/inspection, write the exact project host listener metadata to a private listener file; do not start Redpanda until the file is valid. Preserve internal `redpanda:9092`, make the external advertised listener exactly the inspected loopback mapping, and prevent fallback `localhost:19092` metadata. Keep normal local Redpanda behavior unchanged.
  - **Acceptance mapping**: CI-PORT-05; CI-PORT-08 project-owned topics/credentials.
  - **Dependencies**: Tasks 1.2–1.3 and 2.1.
  - **Verification**: `bash .github/actions/docker-infra/scripts/redpanda-contract.test.sh`; inspect broker metadata from the runner and run an isolated KafkaJS produce/consume round trip against the manifest host listener.
  - **200-line guard**: Separate entrypoint parsing from contract test logic if either reaches 200 lines; run the line gate.

- [x] **2.3** `[L]` `[CI-PORT-06]` `[CI-PORT-08]` `[P]` Stage Keycloak request-host discovery and reconcile only manifest-derived browser clients.
  - **Files**: Modify `infra/compose/docker-compose.database-auth.yml`, `infra/keycloak/reconcile-dev-keycloak.sh`, `infra/keycloak/reconcile-admin-client.sh`, `infra/keycloak/reconcile-tenant-clients.sh`; create `.github/actions/docker-infra/scripts/keycloak-contract.test.sh`.
  - **Implementation**: In CI use Keycloak 26 with `KC_HTTP_ENABLED=true` and `KC_HOSTNAME_STRICT=false`, omitting `KC_HOSTNAME` and `KC_PROXY_HEADERS`. After health and port inspection, write identical `KEYCLOAK_PUBLIC_ISSUER_BASE` and `KEYCLOAK_HOST_ADMIN_BASE` plus DNS-only `KEYCLOAK_CONTAINER_ADMIN_JWKS_BASE=http://keycloak:8080`. Make container reconcilers use their DNS admin path while receiving exact manifest-derived web/admin callback, origin, logout, PKCE, and role values; read back each client setting and fail on mismatch.
  - **Acceptance mapping**: CI-PORT-06, CI-PORT-08; issuer/request-host and reconciliation readback acceptance.
  - **Dependencies**: Tasks 1.2–1.3 and 2.1.
  - **Verification**: `bash .github/actions/docker-infra/scripts/keycloak-contract.test.sh`; request discovery/token endpoints via host-admin and assert the issuer has the discovered port while container reconciliation uses only `keycloak:8080`.
  - **200-line guard**: Do not grow existing reconcilers past 200 lines; extract shared readback helpers and run the line gate.

## Phase 3 — Core and plugin boundary enforcement

- [x] **3.1** `[L]` `[CI-PORT-03]` `[CI-PORT-04]` `[CI-PORT-06]` `[P]` Split Core public issuer validation from DNS-only Keycloak backchannels.
  - **Files**: Modify `services/core-api/src/lib/config.ts`, `services/core-api/src/middleware/auth-middleware.ts`, `services/core-api/src/middleware/jwks-cache.ts`, `services/core-api/src/lib/keycloak-admin-internal.ts`, `services/core-api/src/modules/admin/services/health-check-keycloak.ts`; modify `services/core-api/src/__tests__/unit/config-security.test.ts`, `services/core-api/src/__tests__/auth-middleware.test.ts`; create `services/core-api/src/__tests__/unit/keycloak-runtime-contract.test.ts`.
  - **Implementation**: Add separately validated public issuer and container admin/JWKS configuration. Under `CI_RUNTIME_CONTRACT=1`, require the public issuer to be a manifest loopback origin only for expected JWT `iss`; require Core discovery, JWKS, Admin API, and health calls to use `keycloak:8080` only. Reject swapped, host-gateway, DNS-in-host, and loopback-in-container contract values. Do not emit wildcard CORS in CI.
  - **Acceptance mapping**: CI-PORT-03–04, CI-PORT-06; issuer/JWKS direction and no-wildcard-CORS acceptance.
  - **Dependencies**: Tasks 1.2 and 2.3.
  - **Verification**: `pnpm --filter core-api test:unit -- keycloak-runtime-contract config-security`; run the contract verifier’s Core issuer/JWKS direction check after Task 5.2.
  - **200-line guard**: `config.ts` is already 190 lines—extract CI contract validation before adding fields; every resulting file must pass the line gate.

- [x] **3.2** `[L]` `[CI-PORT-07]` `[P]` Implement a single project-scoped plugin container identity and runtime options.
  - **Files**: Create `services/core-api/src/modules/plugin/services/plugin-container-identity.ts`; modify `services/core-api/src/lib/config.ts`, `services/core-api/src/modules/plugin/services/docker-runtime-options.ts`, `services/core-api/src/modules/plugin/services/container-manager.service.ts`, `services/core-api/src/modules/plugin/services/docker-container-restart.ts`; create `services/core-api/src/__tests__/unit/plugin-container-identity.test.ts`.
  - **Implementation**: Validate UUID install IDs and normalized bounded scope; derive the name/alias `plexica-plugin-<scope>-<16-char-sha256>`, scope/install labels, and the exact project network. In CI require scope to equal project and network to equal the inspected project default network. Create, inspect, restart/replacement, stop, and removal must derive/validate the identity and have no `PortBindings`, published ports, or host-gateway entry; preserve local scope and ADR-013 host-port/local-process behavior outside the contract.
  - **Acceptance mapping**: CI-PORT-07; CI-PORT-08 project labels/network/teardown selection.
  - **Dependencies**: Tasks 1.2 and 2.1.
  - **Verification**: `pnpm --filter core-api test:unit -- plugin-container-identity`; assert invalid scope/install IDs, foreign network/labels, port bindings, and host gateway are rejected.
  - **200-line guard**: `container-manager.service.ts` is at its limit—move identity/inspection responsibilities into focused helpers rather than extending it; run the line gate.

- [x] **3.3** `[L]` `[CI-PORT-07]` Enforce derived DNS-only plugin targets in proxy, recovery, and lifecycle paths.
  - **Files**: Modify `services/core-api/src/modules/plugin/services/proxy.service.ts`, `services/core-api/src/modules/plugin/services/runtime-recovery.service.ts`, `services/core-api/src/modules/plugin/routes/proxy.routes.ts`, `services/core-api/src/modules/plugin/services/install-runtime.service.ts`, `services/core-api/src/__tests__/plugin-proxy-lifecycle.test.ts`, `services/core-api/src/__tests__/unit/plugin-runtime-recovery.test.ts`; create `services/core-api/src/__tests__/unit/plugin-runtime-contract.test.ts`.
  - **Implementation**: Replace loopback-derived container URLs in CI with the identity helper’s exact alias and port. Validate create/start/restart/replacement/recovery/stop/remove/proxy inspection against the project network, alias, and labels; reject loopback, raw IP, host gateway, and foreign aliases before fetch. Continue permitting existing dev backends outside CI.
  - **Acceptance mapping**: CI-PORT-04 and CI-PORT-07; plugin inspection and proxy negative acceptance.
  - **Dependencies**: Task 3.2.
  - **Verification**: `pnpm --filter core-api test:unit -- plugin-runtime-contract plugin-runtime-recovery`; `pnpm --filter core-api test:int -- plugin-proxy-lifecycle` with a CI-contract fixture.
  - **200-line guard**: `proxy.service.ts` is 187 lines and `runtime-recovery.service.ts` is 161—extract target validation/identity adapters; run the line gate.

## Phase 4 — Same-origin web and admin contracts

- [x] **4.1** `[L]` `[CI-PORT-03]` `[CI-PORT-12]` `[P]` Add mounted browser runtime configuration and strict same-origin endpoint parsing.
  - **Files**: Create `apps/web/src/lib/runtime-endpoints.ts`, `apps/admin/src/lib/runtime-endpoints.ts`, `apps/web/src/lib/runtime-endpoints.test.ts`, `apps/admin/src/lib/runtime-endpoints.test.ts`; modify `apps/web/index.html`, `apps/admin/index.html`, `apps/web/src/services/api-client.ts`, `apps/admin/src/services/api-client.ts`, `apps/web/src/services/keycloak-auth.ts`, `apps/admin/src/services/keycloak-auth.ts`, `apps/web/src/vite-env.d.ts`, `apps/admin/src/vite-env.d.ts`.
  - **Implementation**: Load runner-generated read-only `runtime-config.js`. When `CI_RUNTIME_CONTRACT=1`, require `{ apiBase: '', keycloakBase: KEYCLOAK_PUBLIC_ISSUER_BASE }`, reject missing, `/api`, absolute, Core, DNS, host-gateway, and static-localhost API values, and retain existing client `/api/...` paths. Do not expose `E2E_CORE_API_PROXY_TARGET` or `CORE_API_PUBLIC_BASE` to browser JavaScript.
  - **Acceptance mapping**: CI-PORT-03, CI-PORT-06, CI-PORT-12; empty base, issuer-only browser config, and no `/api/api` acceptance.
  - **Dependencies**: Task 1.2.
  - **Verification**: `pnpm --filter web test -- runtime-endpoints` and `pnpm --filter @plexica/admin test -- runtime-endpoints`; tests cover ordinary and plugin-proxy `/api/...` construction and every forbidden CI value.
  - **200-line guard**: Keep each parser and its tests focused; no generated runtime artifact is checked in; run the line gate.

- [x] **4.2** `[M]` `[CI-PORT-04]` `[CI-PORT-12]` Configure CI-only Vite server/preview proxy and host binding for both applications.
  - **Files**: Modify `apps/web/vite.config.ts`, `apps/admin/vite.config.ts`; create `apps/web/vite.config.test.ts`, `apps/admin/vite.config.test.ts`.
  - **Implementation**: Under `CI_RUNTIME_CONTRACT=1` only, set `server.host` and `preview.host` to `0.0.0.0`; otherwise omit both settings. Make both server and preview proxy only `/api` to the exact non-public `E2E_CORE_API_PROXY_TARGET=http://core-api-e2e:3001`, with no rewrite and `changeOrigin: false`, preserving method, query, credentials, and plugin-proxy paths.
  - **Acceptance mapping**: CI-PORT-04 and CI-PORT-12; same-origin proxy and CI-only binding acceptance.
  - **Dependencies**: Tasks 2.1 and 4.1.
  - **Verification**: `pnpm --filter web test -- vite.config` and `pnpm --filter @plexica/admin test -- vite.config`; assert CI/non-CI host values, exact proxy target, no rewrite, and `/api`-only matching.
  - **200-line guard**: Keep shared proxy factory in a small local module only if config files would exceed 200 lines; run the line gate.

- [x] **4.3** `[L]` `[CI-PORT-03]` `[CI-PORT-04]` `[CI-PORT-06]` Rewire CI Playwright and host provisioning consumers to the host manifest without starting local servers.
  - **Files**: Modify `e2e/playwright-base.ts`, `e2e/keycloak/admin-api.ts`, `e2e/keycloak/run-super-admin.ts`, `apps/web/playwright.config.ts`, `apps/admin/playwright.config.ts`, `apps/web/e2e/helpers/api-check.ts`, `apps/admin/e2e/helpers/api-client.ts`; create `e2e/keycloak/admin-api.test.ts`.
  - **Implementation**: In the CI runtime contract, require host-manifest values for runner migration/fixture/provisioning and public Playwright URLs, reject Compose DNS/static fallback/wrong selected Keycloak URL, and disable Playwright `webServer` creation of Core/web/admin. Retain existing host-process local E2E defaults outside CI.
  - **Acceptance mapping**: CI-PORT-01, CI-PORT-03–04, CI-PORT-06, CI-PORT-08; manifest-only runner setup and host-provisioning rejection acceptance.
  - **Dependencies**: Tasks 1.2, 2.1, 2.3, and 4.1–4.2.
  - **Verification**: `pnpm --filter web exec playwright test --list` and `pnpm --filter @plexica/admin exec playwright test --list` with valid CI manifest env; `pnpm --filter web test -- admin-api` (or the applicable workspace Vitest command) for wrong-source negatives.
  - **200-line guard**: `playwright-base.ts` is 122 lines and web config is 145—extract CI-only setup helpers instead of extending either past 200; run the line gate.

## Continuation

Phases 5–6, the overall summary, and final cross-references are in
[tasks-orchestration.md](./tasks-orchestration.md). Complete those phases after
the dependencies in Phases 1–4 above.
