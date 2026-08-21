# Plan: 009 — Concurrent Self-Hosted CI Dynamic Ports
| Field | Value |
| --- | --- |
| Status | Final review revision |
| Date | 2026-08-21 |
| Spec / ADR | [tech-spec.md](./tech-spec.md) / [ADR-031](../../knowledge/adr/adr-031-ci-runtime-contract-gated-orchestration.md) |

## 1. Boundary and source-of-truth invariant
This is CI-only orchestration. Normal `docker compose up`, fixed developer ports,
and ADR-013 local-process plugins remain unchanged. Every CI command receives a
validated lower-case project ID, private `0700` runtime directory, explicit
`docker compose --project-name "$project"`, and label-scoped selection.

`ci-runtime-env.sh` is the sole `0600`, atomic contract writer. It creates two
non-interchangeable inputs and validates each consumer before it starts:

| Source | May contain / consumers | Must never contain or be used by |
| --- | --- | --- |
| `host.env` + host manifest | inspected `127.0.0.1:<dynamic>` URLs; runner migrations/status, fixture/provisioning, Core integration/health, and runtime-config generation | Compose DNS, aliases, `host.docker.internal`, fixed/fallback ports, browser-consumed `CORE_API_PUBLIC_BASE` |
| `container.env` | `postgres`, `redis`, `minio`, `redpanda`, `keycloak`, and derived plugin-alias DNS endpoints; Core and sidecars | loopback mappings, host manifest, host gateway, assigned host ports |
| proxy-server environment | non-public exact `E2E_CORE_API_PROXY_TARGET=http://core-api-e2e:3001`; Vite/preview process in `web-e2e` and `admin-e2e` | browser JS, runtime config, host mappings, or any target other than that literal |
| browser `runtime-config.js` | runner-generated, read-only `{ apiBase: '', keycloakBase: KEYCLOAK_PUBLIC_ISSUER_BASE }`; both existing clients append `/api/...` paths | `CORE_API_PUBLIC_BASE`, `/api`, infrastructure/plugin DNS, host ports or gateways; it is served as bytes only |

The loader rejects a Compose DNS name in host input, a loopback/host-gateway URL in
container input, absent manifest fields, and any consumer passed the wrong file.
Thus a host process cannot use unresolved DNS and a container cannot use a
host-loopback endpoint. The browser consumes `runtime-config.js`; its empty base
plus the clients' existing `/api/...` paths resolve against its own web/admin
origin. Only the Vite/preview server reads the Core DNS target.

## 2. CI service and endpoint contract
`docker-compose.ci.yml` adds the following project-default-network services; all
publications use `127.0.0.1::containerPort` and are inspected, never allocated by
a probe.

| Service | Runtime endpoint use | Host publication / consumer |
| --- | --- | --- |
| `core-api-e2e` | `DATABASE_URL`→`postgres`; Redis/MinIO/Redpanda→DNS; `KEYCLOAK_CONTAINER_ADMIN_JWKS_BASE=http://keycloak:8080`; plugins→derived alias | dynamic `CORE_API_PUBLIC_BASE`; runner integration/health only |
| `web-e2e` | Vite/preview proxy matches `/api` and forwards unchanged to `core-api-e2e:3001`; static app base is `''` and its client paths start `/api` | dynamic `WEB_E2E_PUBLIC_BASE`; Playwright browser only |
| `admin-e2e` | Vite/preview proxy matches `/api` and forwards unchanged to `core-api-e2e:3001`; static app base is `''` and its client paths start `/api` | dynamic `ADMIN_E2E_PUBLIC_BASE`; Playwright browser only |
| Keycloak | PostgreSQL and `keycloak-init` admin backchannel→DNS | dynamic public/host-admin base; browser and host provisioning only |
| plugin sidecar | `PLUGIN_CORE_API_URL=http://core-api-e2e:3001`; exactly its derived alias/network | none |

Core receives `KEYCLOAK_PUBLIC_ISSUER_BASE` solely as the expected JWT `iss` value;
all Core HTTP calls to Keycloak use the container base. The runner writes
`runtime-config.js` after inspection; browser endpoint resolution requires
`apiBase=''` and reads the public issuer as `keycloakBase`. It rejects `/api`, an
absolute API base, or a missing API base in `CI_RUNTIME_CONTRACT=1`.
`CORE_API_PUBLIC_BASE` is never a `VITE_*` value or browser artifact. Both apps
configure identical Vite `server.proxy` and `preview.proxy` entries matching
`/api` from the non-public exact target `E2E_CORE_API_PROXY_TARGET`;
`changeOrigin: false` and no rewrite preserve the request path, query, method,
credentials, and `/api/v1/plugins/:installId/proxy/*` routes. Under that CI
contract only, both `server.host` and `preview.host` are `0.0.0.0`; otherwise the
host option is omitted for Vite's safe local default. After mapping discovery,
`wait-services` requests each manifest `127.0.0.1` web/admin URL from the runner
and fails before Playwright on a refused, stale, or non-ready mapping.
Playwright `PLAYWRIGHT_BASE_URL` and `PLAYWRIGHT_ADMIN_BASE_URL` are browser URLs;
`PLAYWRIGHT_CORE_API_URL`/`PLAYWRIGHT_API_URL` are runner-only integration values,
and `PLAYWRIGHT_KEYCLOAK_URL` is the matching host-manifest entry. No CI Playwright
`webServer` starts Core, web, or admin; CI waits for Compose. Local host-webServer
behavior and localhost defaults remain outside `CI_RUNTIME_CONTRACT=1`.

The browser never calls Core cross-origin, so Core CORS is not a browser integration
mechanism: the CI Core configuration disables CORS headers for these same-origin
paths; `Access-Control-Allow-Origin: *` is prohibited. The proxy is the only
browser-to-Core boundary. It forwards plugin proxy paths unchanged to Core, where
existing authentication/ABAC and the DNS-only plugin alias policy apply; no browser
receives a plugin or Core target URL.

## 3. Keycloak, migration, and setup direction
Keycloak 26 uses request-host mode: `KC_HTTP_ENABLED=true`,
`KC_HOSTNAME_STRICT=false`, no `KC_HOSTNAME`, and no `KC_PROXY_HEADERS`/proxy.
After health, inspection atomically writes identical
`KEYCLOAK_PUBLIC_ISSUER_BASE` and `KEYCLOAK_HOST_ADMIN_BASE`. Host token/Admin and
tenant reconciliation use only host-admin and reject anything other than the exact
manifest loopback URL. `keycloak-init` remains container-side and uses
`http://keycloak:8080`; it receives manifest-derived browser callback/origin/logout
values, never a host-admin endpoint.

Runner-side work remains runner-side: `ci-runtime-env.sh export-host` sets
`DATABASE_URL=$POSTGRES_HOST_URL` only for `prisma migrate deploy`, `migrate
status`, database fixture setup, and host provisioning. It supplies public
Playwright values from the same manifest. It must not source `container.env`.
`core-api-e2e` starts only after that work and receives `DATABASE_URL` with
`postgres:5432` plus `container.env`; it never inherits the runner `DATABASE_URL`.
This preserves a real container Core while retaining runner-only migration/test
setup without a host DNS lookup or container loopback connection.

## 4. Compose lifecycle and gates
Docker assigns a dynamic mapping on `compose create`; the verifier inspects the
created container rather than guessing it. Redpanda's CI entrypoint waits for a
runner-written, private listener file: create/inspect its map, write exact external
advertised metadata into that file, then start/release Redpanda. The lifecycle is:

```text
checkout -> admission -> engine/render -> create infra
 -> inspect/write host infra contract -> start postgres/keycloak -> Keycloak health/write issuer
 -> create/inspect Redpanda -> write listener -> start/gate Redpanda
 -> runner migrations/status + fixture/provisioning setup (host.env)
  -> create core-api-e2e (container.env) -> inspect/write runner-only Core base
  -> create/inspect web-e2e + admin-e2e with private DNS proxy target -> write browser runtime-config
  -> keycloak-init + host reconciliation/readback -> start/wait Core, web, admin by discovered loopback mapping
 -> browser/API/plugin/Kafka tests for A and B -> snapshot B sentinels -> down A
 -> verify B unchanged/healthy -> scoped down -v B
```

The prior-port sentinel snapshots each live project's inspected
`host-port, container-id, service` tuple before the other project is torn down.
It fails if B's tuple changes, if B uses an A tuple/legacy port, or if any teardown
selector reaches an unlabelled or foreign resource. Diagnostics retain only the
current project `ps`, endpoint allowlist, cgroup/capacity facts, Docker events,
sanitized logs, sentinel result, and exits; redaction failure blocks.

## 5. Plugin and runner enforcement
`plugin-container-identity.ts` validates normalized `PLUGIN_RUNTIME_SCOPE` (local
default) and UUID install ID, deriving `plexica-plugin-<scope>-<16-char-sha256>`
(scope <=31, DNS label <=63), alias, scope label, and install label. In
`CI_RUNTIME_CONTRACT=1`, scope equals project and `PLUGIN_DOCKER_NETWORK` equals
the inspected project network. Create/restart/replacement/stop/remove/recovery and
proxy validate exactly that network, alias, labels, and no `PortBindings`/published
ports; proxy rejects loopback, raw IP, host gateway, and foreign aliases. Local
scope preserves ADR-013 host-port and local-process behavior.

Both `ci-runtime-contract` and `ci` use
`[self-hosted, plexica-ci-concurrent-e2e]`; `ci` needs the independent contract
job. Immediately after checkout, before Node/pnpm setup, install, build, pull, or
Compose, both run `verify-ci-runner-capacity.sh`: marker, >=4 CPUs, >=16 GiB
effective cgroup memory, >=12 GiB headroom, >=60 GiB Docker-root free. Missing or
bad evidence exits nonzero. A unique `if: always()` upload retains non-secret
evidence with `if-no-files-found: error`; no retry, skip, downscale, bypass, or
`continue-on-error` is permitted.

## 6. Target implementation/configuration files
| Path | Required change / proof |
| --- | --- |
| `.github/workflows/ci.yml` | Add independent contract job, labels/needs, post-checkout admission, scoped artifacts/teardown; delete port and process-wide cleanup. |
| `.github/actions/docker-infra/action.yml` | Accept project/runtime directory and stage create, inspect, start, wait, and scoped down. |
| `.github/actions/docker-infra/scripts/{verify-ci-runner-capacity,ci-runtime-env,verify-ci-compose-render,verify-concurrent-ci-runtime,start-services,wait-services}.sh` | admission; atomic dual contracts; render/DNS/loopback guards; two-project verifier/sentinels; staged lifecycle. |
| `docker-compose.ci.yml` | Remove fixed name; override all ports; define `core-api-e2e`, `web-e2e`, `admin-e2e`; mount private runtime config; Redpanda listener gate. |
| `infra/compose/{database-auth,platform-services}.yml` | CI-compatible Keycloak request-host and Redpanda wrapper/hooks while retaining local defaults. |
| `infra/redpanda/ci-entrypoint.sh` | Read inspected listener file before Redpanda release; no fallback metadata. |
| `services/core-api/src/{lib/config.ts,middleware/auth-middleware.ts,middleware/jwks-cache.ts,lib/keycloak-admin-internal.ts,modules/admin/services/health-check-keycloak.ts}` | Split public issuer from container Keycloak calls; validate contract direction. |
| `services/core-api/src/modules/plugin/services/{plugin-container-identity.ts,docker-runtime-options.ts,container-manager.service.ts,docker-container-restart.ts,runtime-recovery.service.ts,proxy.service.ts}` | Scoped identity/network/port enforcement for all lifecycle/proxy paths. |
| `e2e/{playwright-base.ts,keycloak/admin-api.ts,keycloak/run-super-admin.ts,tenant-provisioning-helpers.ts}` | Manifest-only runner/browser endpoints; reject DNS and static fallback. |
| `apps/{web,admin}/{index.html,playwright.config.ts,vite.config.ts}` | Load mounted runtime config; configure `/api`-matching `server.proxy` and `preview.proxy` from the private exact CI DNS target; set both hosts to `0.0.0.0` only in CI and retain omitted local host defaults. |
| `apps/{web,admin}/src/{lib/runtime-endpoints.ts,services/api-client.ts,services/keycloak-auth.ts}` | Require empty same-origin `apiBase` and reject `/api`, absolute, or missing CI API config; clients retain their `/api/...` paths and public Keycloak issuer handling. |
| `.github/actions/docker-infra/scripts/{wait-services,verify-concurrent-ci-runtime}.sh` | Read discovered `WEB_E2E_PUBLIC_BASE`/`ADMIN_E2E_PUBLIC_BASE` loopback mappings and require host readiness before Playwright. |
| `apps/{web,admin}/e2e/*`, `apps/{web,admin}/src/**/*.test.ts`, `services/core-api/src/**/*.test.ts` | Assert same-origin `/api`, empty browser base, no `/api/api`, no browser Core host request, unchanged plugin proxy route, CI binding/readiness, and no wildcard CORS; retain Core-in-Compose, Keycloak, Kafka, and A-down/B-survives coverage. |

## 7. Verification and traceability
| Requirement | Proof |
| --- | --- |
| CI-PORT-01–03 | render/contract guards, dynamic maps, wrong-source negative tests |
| CI-PORT-04–06 | Compose Core E2E, empty same-origin browser base plus `/api` client paths, DNS-only Vite/preview proxy and Core JWKS/Admin checks |
| CI-PORT-07–08 | sidecar lifecycle/proxy negatives; reconciliation readback/isolation |
| CI-PORT-09 | two independently bootstrapped A/B web/admin full E2E stacks |
| CI-PORT-10–12 | pre-work admission, retained sanitized diagnostics, CI-only Vite binding, and discovered-loopback readiness |

ADR-031 remains sufficient: this plan operationalizes its selected CI contract;
it introduces no new dependency, data model, authentication model, or production
infrastructure decision. Constitution Rules 1/2/4/5 are compliant through blocking
real E2E, fail-hard gates, <=200-line helpers, and ADR-031.
