# Tech Spec: 009 — Concurrent Self-Hosted CI Dynamic Ports
| Field | Value |
| --- | --- |
| Status | Final review revision |
| Author | forge-architect |
| Date | 2026-08-21 |
| Track | Quick |
| Spec ID | 009 |
| Decision | ADR-031 Accepted, revised 2026-08-21 |

## Overview
Make simultaneous self-hosted CI safe through a project-owned Compose contract,
Docker-assigned loopback ports, and DNS-only container backchannels. Contract
full E2E runs Core as the project-network `core-api-e2e` service; browsers reach
it only at same-origin `/api` through the web/admin Vite or preview proxy. The
inspected Core loopback mapping is runner-only. Normal `docker compose up` and
ADR-013 local-process plugin development remain unchanged.

## Requirements
1. **CI-PORT-01 Ownership.** A collision-resistant validated project ID and
   `0700 $RUNNER_TEMP/plexica-ci/$project` are passed to every Compose command,
   action, helper, diagnostic, E2E harness, restart, and teardown. No fixed
   `plexica-ci`/`plexica-e2e` name or broad cleanup remains in active CI.
2. **CI-PORT-02 Dynamic publication and sentinel.** The CI overlay replaces every
   host-consumed publication with Docker-assigned `127.0.0.1` ports. Docker >=24,
   Compose >=2.24.4, disposable mapping, rendered-config proof, and prior-port
   sentinel proof fail closed; probing/free-port allocation is prohibited.
3. **CI-PORT-03 Endpoint contracts.** One atomic manifest writer creates
   host-only inspected URLs, container-only DNS URLs, and a browser projection.
    The browser API origin value is the empty same-origin base (`''`), never
    `CORE_API_PUBLIC_BASE` or `/api`: both existing clients already pass paths
    beginning `/api`. Active CI has no fixed localhost fallback; host processes never receive DNS
    endpoints and containers never connect to host-loopback mappings.
4. **CI-PORT-04 Core E2E boundary.** Contract/full CI E2E creates
   `core-api-e2e` on the project default network. Core uses DNS-only PostgreSQL,
   Redis, MinIO, Redpanda, Keycloak backchannel, and plugin alias endpoints.
    Web/admin proxy access is exclusively `http://core-api-e2e:3001` on the
    project network; browser API requests are same-origin `/api`.
5. **CI-PORT-05 Redpanda.** The inspected Kafka host mapping is supplied to the
   external advertised listener before release; exact host metadata and an
   isolated KafkaJS produce/consume round trip are required.
6. **CI-PORT-06 Keycloak request-host issuer.** Keycloak 26 runs with
   `KC_HTTP_ENABLED=true`, `KC_HOSTNAME_STRICT=false`, no `KC_HOSTNAME`, and no
   `KC_PROXY_HEADERS`: Docker passes the browser/runner Host header directly. On
   health, inspection writes `KEYCLOAK_PUBLIC_ISSUER_BASE` and
   `KEYCLOAK_HOST_ADMIN_BASE` (the same manifest URL), and
   `KEYCLOAK_CONTAINER_ADMIN_JWKS_BASE=http://keycloak:8080`. Browser/runner token
   and provisioning calls use host-admin; Core validates `iss` against public
   issuer but calls JWKS, discovery, health, and Admin API only through DNS.
7. **CI-PORT-07 Plugin sidecars.** A validated length-bounded identity helper
   derives name and DNS alias from `(PLUGIN_RUNTIME_SCOPE, installId)`; CI supplies
   the project scope. Every lifecycle/proxy path uses it. Sidecars have exactly the
   project network/alias and scope label, no host binding, and reject gateway or
   foreign targets.
8. **CI-PORT-08 State and reconciliation.** Projects own volumes, networks,
   Keycloak state, Kafka topics, credentials, fixtures, labels, and teardown
   selection. Host admin/tenant provisioning uses only the manifest host-admin
   URL and proves exact callback/origin/logout/PKCE/role scope by readback.
9. **CI-PORT-09 Independent contract.** `ci-runtime-contract` bootstraps itself
   and runs two concurrent project full web/admin E2E stacks; `ci` requires it and
   may not consume its Docker state.
10. **CI-PORT-10 Admission.** Both jobs run on
    `[self-hosted, plexica-ci-concurrent-e2e]`. Immediately after checkout each
    runs shared admission before install, build, pull, or start: marker, >=4 online
    CPUs, >=16 GiB effective cgroup memory, >=12 GiB headroom, and >=60 GiB Docker
    root free space. Missing/unreadable/insufficient evidence fails hard.
11. **CI-PORT-11 Evidence and compatibility.** Retain sanitized non-secret
    project diagnostics and admission evidence on success/failure. No retry, skip,
    downscale, `continue-on-error`, broad cleanup, or capacity bypass.
12. **CI-PORT-12 Web/admin container reachability.** Under
    `CI_RUNTIME_CONTRACT=1`, both Vite `server.host` and `preview.host` bind
    `0.0.0.0` so their published `127.0.0.1` Compose mappings are reachable from
    the runner. Outside that contract, the host option remains unset and Vite's
    safe local default applies. Readiness must request each discovered manifest
    loopback web/admin mapping from the host before Playwright begins.

## Acceptance Criteria
- Two concurrent projects have distinct networks, volumes, ports, Keycloak
  issuers, Kafka topics, and plugin aliases. Tearing down A leaves B's browser,
  Core health, Keycloak validation, plugin proxy, and Kafka round trip healthy.
- The prior-port sentinel records A's inspected port-to-container tuples before A
  teardown. B must retain its original tuples and health after A is down; no B
  manifest, container, or request may use a recorded A port or legacy fixed port.
- A browser/runner discovery, token, or provisioning request observes
  `issuer=${KEYCLOAK_PUBLIC_ISSUER_BASE}/realms/<realm>` with its assigned port.
  Core accepts that issuer while its JWKS/discovery/Admin/health requests target
  `keycloak:8080` only.
- Contract E2E creates `core-api-e2e`; its infrastructure, Keycloak backchannel,
  plugin routes, and web/admin proxy target use project-network DNS. Its inspected
  loopback `CORE_API_PUBLIC_BASE` is host-manifest-only for runner integration and
  migration-orchestration health gates, never for a browser; Prisma migrations use
  `POSTGRES_HOST_URL`.
- `web-e2e` and `admin-e2e` publish inspected loopback URLs. Their browser runtime
  configuration fixes `apiBase` to `''` (the same-origin base); clients append their
  existing `/api/...` paths and may contain the discovered public
  Keycloak issuer only. It contains no Core host URL, DNS alias, static localhost
  port, or `host.docker.internal` target.
- Both Vite `server.proxy` and `preview.proxy` accept `/api` only and use the
  server-only `E2E_CORE_API_PROXY_TARGET=http://core-api-e2e:3001`; they preserve
  path, query, method, credentials, and `/api/v1/plugins/:installId/proxy/*` routes
  without rewrite. Unit/config tests prove both app clients produce `/api/...`, never
  `/api/api/...`, for ordinary and plugin-proxy requests.
- Browser E2E records API requests from both apps and proves their origin equals
  the page origin, including `/api/v1/plugins/:installId/proxy/*`; it proves no
  request targets `CORE_API_PUBLIC_BASE`. Core must not emit wildcard CORS
  (`Access-Control-Allow-Origin: *`) in CI.
- Runner migrations, Prisma status, fixture setup, browser setup, and host
  provisioning use only `host.env` manifest entries. Core/container startup uses
  only `container.env`; a host DNS URL or container loopback URL is a hard error.
- A host provisioning helper fails if its selected URL differs from manifest
  host-admin or resolves to Compose DNS; it never receives a DNS-only URL.
- Plugin inspection proves project network, derived alias, scope label, and absent
  `HostConfig.PortBindings`/published ports for create/start/restart/recovery/
  stop/remove/proxy. Foreign, loopback, and host-gateway targets fail.
- Redpanda exposes the manifest host listener only to the runner, advertises its
  exact inspected metadata, and passes the project-isolated KafkaJS round trip.
- Each job uploads non-secret admission and scoped diagnostic evidence; an absent
  marker, probe/evidence failure, or threshold shortfall blocks before pull/start.
- In CI, web/admin `server` and `preview` bind `0.0.0.0`, while non-CI execution
  leaves both host settings unset. After Compose mapping discovery, the runner
  readiness gate successfully requests every `WEB_E2E_PUBLIC_BASE` and
  `ADMIN_E2E_PUBLIC_BASE` loopback URL before Playwright; a refused or wrong mapping
  fails the job.
- Local `docker compose up`, fixed developer ports, and ADR-013 local-process or
  local Docker plugin paths remain compatible and do not require CI manifests.

## Delivery and verification
1. Gate admission/engine/render, create project resources, inspect mappings, and
   write contracts. Start Keycloak, then publish its request-host entries only
   after health; write Redpanda's inspected listener before it is released.
2. Run runner-side migration/status and fixture work with `host.env`; create Core
   with `container.env`, inspect its runner-only publication, then create web/admin
   with the DNS-only proxy target, CI-only `0.0.0.0` Vite bindings, and browser
   `apiBase=''`; verify their discovered loopback mappings from the host before
   Playwright. Reconcile Keycloak clients from the manifest before browser E2E.
3. `verify-concurrent-ci-runtime.sh --full-e2e` proves issuer/JWKS direction,
   plugin routing, Kafka, A teardown/B survival, prior-port sentinels, admission,
   scoped diagnostics, and `down -v` selection.

## Tasks
1. Add project contracts, dynamic-port/render/sentinel gates, and staged Keycloak discovery.
2. Split public issuer, host-admin, and container Admin/JWKS variables and call sites.
3. Add Core/web/admin CI Compose E2E services, DNS-only Vite/preview proxy, and
   manifest-only browser configuration with an empty API origin base.
4. Add scoped sidecar identity, lifecycle/proxy enforcement, and both labelled jobs' admission.
5. Run the two-project verifier with migrations, issuer/JWKS/provisioning, Kafka, and routing checks.

## Constitution compliance
| Rule | Status | Evidence |
| --- | --- | --- |
| 1 — E2E | Compliant | Blocking two-project browser/API Keycloak, plugin, and Kafka flows. |
| 2 — Green CI | Compliant | Admission and all verifier evidence fail hard. |
| 4 — Files <=200 | Compliant | Focused helpers plus line gate. |
| 5 — ADR | Compliant | ADR-031 records infrastructure/auth boundary. |

## Cross-References
| Document | Path |
| --- | --- |
| Plan 009 | [plan.md](./plan.md) |
| ADR-031 | [ADR-031](../../knowledge/adr/adr-031-ci-runtime-contract-gated-orchestration.md) |
| Constitution | [constitution.md](../../constitution.md), Rules 1, 2, 4, 5 |
