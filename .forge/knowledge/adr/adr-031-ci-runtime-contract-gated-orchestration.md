# ADR-031: CI Runtime Contract and Gated Compose Orchestration

**Status**: Accepted
**Date**: 2026-08-21
**Revised**: 2026-08-21 — final review blockers resolved
**Deciders**: Plexica Team and user
**Related**: Spec 009; ADR-004; ADR-013

## Context
Self-hosted jobs share Docker resources. Fixed names/ports and broad cleanup
can interfere with another run. Dynamic ports require a discovered host contract
and a separate DNS-only container contract. Keycloak's externally issued JWT
issuer must contain the assigned port, while Core backchannels must not leave the
Compose network. Docker-managed plugin sidecars and both CI jobs also need an
enforceable project and runner-capacity boundary.

## Decision
1. Every CI action/command receives a validated project ID, private runtime
   directory, and label-scoped teardown/diagnostic selector. CI `!override`s all
   publications to Docker-assigned loopback ports; engine/render/discovery gates
   fail before startup if that cannot be proved.
2. Use **Keycloak 26 request-host mode**, not a startup hostname. CI sets
   `KC_HTTP_ENABLED=true` and `KC_HOSTNAME_STRICT=false`, omits `KC_HOSTNAME`,
   and does not configure proxy headers because Docker directly forwards the
   loopback request Host header. After Keycloak starts, inspect its mapping and
   write three non-interchangeable values: public issuer base and host-admin base
   (both the manifest URL), and container Admin/JWKS base
   (`http://keycloak:8080`). Browser/runner requests, including all host-run
   provisioning, use host-admin; Core checks `iss` against public issuer and
   calls discovery/JWKS/Admin/health through container DNS. A host helper rejects
   DNS-only or non-manifest provisioning URLs.
3. Sidecars use one bounded identity helper over runtime scope plus install ID.
   CI scope equals project; its container is on exactly the inspected project
   network under its derived alias, has a matching scope label, and has no host
   port binding. Create, inspect, restart/replacement, stop, remove, recovery,
   and proxy all derive and validate that identity. Local uses explicit `local`
   scope and retains ADR-013 local-process/host-port behavior outside CI.
4. Both `ci-runtime-contract` and normal `ci` run on
   `[self-hosted, plexica-ci-concurrent-e2e]`; `ci` needs the contract job. In
   both jobs shared admission is the first executable step after checkout and
   precedes install/build/Docker pull/start. It hard-fails unless a class marker,
   >=4 CPUs, >=16 GiB cgroup memory, >=12 GiB availability/headroom, and >=60
   GiB Docker storage are measured and retained as non-secret evidence.
5. The independently bootstrapped contract job starts two projects concurrently,
   proving Keycloak issuer/JWKS/provisioning direction, Redpanda metadata and
   round trip, private plugin routing, scoped failure/teardown, and B survival.

## Options considered
| Option | Outcome |
| --- | --- |
| Fixed ranges and port-owner cleanup | Rejected: races and can touch unrelated resources. |
| Dynamic ports but configured `KC_HOSTNAME` | Rejected: assigned port is unknown at Keycloak startup. |
| Request-host Keycloak with trusted proxy headers | Rejected: no proxy exists; trusting forwarded headers adds spoofable input. |
| Reverse proxy/external port allocator | Rejected: new infrastructure is unnecessary. |
| Project contract, request-host Keycloak, private sidecars, admission | Selected: Docker discovery makes all boundaries explicit. |

## Consequences
**Positive:** concurrent isolation, correct dynamic public issuer, internal Core
backchannels, private sidecars, and observable capacity admission.
**Negative:** staged Keycloak setup, duplicate job admission/bootstrap, and
strict CI-only sidecar inspection.
**Neutral:** no schema/public API/dependency/production hosting change; ordinary
local Compose and ADR-013 development stay available.

## Constitution alignment
| Article | Status | Rationale |
| --- | --- | --- |
| Rule 1 — E2E | Compliant | Requires real two-project web/admin full-stack verification. |
| Rule 2 — Green CI | Compliant | Evidence and verifier failures have no bypass. |
| Rule 4 — Files <=200 | Compliant | Focused helpers and line gate required. |
| Rule 5 — ADR | Compliant | Records CI infrastructure and auth-boundary decision. |
| Security | Improved | DNS boundary, scoped cleanup, private routing, redacted evidence. |

## Relationship to existing ADRs
ADR-004 remains authoritative for Redpanda semantics. ADR-013 remains
authoritative for sidecars; this ADR narrows their CI identity/network/proxy
contract and preserves its local behavior.
