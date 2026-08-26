# ADR-031: CI Runtime Contract and Gated Compose Orchestration

**Status**: Accepted
**Date**: 2026-08-21
**Revised**: 2026-08-21 — final review blockers resolved
**Revised**: 2026-08-24 — runner class changed to the default `self-hosted`
runner per user decision; measured capacity admission is retained without the
dedicated class marker.
**Revised**: 2026-08-26 — `ci-runtime-contract` is now gated: it runs only on
`workflow_dispatch` or when a lightweight pre-flight job detects a change
under a fixed CI-infrastructure path set (fail-open to running on any
detection uncertainty, timeout, or job-level failure). When it does not run,
`ci` runs the same full single-project web/admin Playwright suite the
contract also exercises, so every trigger keeps real E2E coverage without the
doubled two-project environment. See CI-PORT-13.
**Deciders**: Plexica Team and user
**Related**: Spec 010; ADR-004; ADR-013

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
4. Both `ci-runtime-contract` and normal `ci` run on the default `self-hosted`
   runner (revised 2026-08-24 from the dedicated labelled runner); `ci` needs
   the contract job. In
   both jobs shared admission is the first executable step after checkout and
   precedes install/build/Docker pull/start. It hard-fails unless measured
   >=4 CPUs, >=16 GiB cgroup memory, >=12 GiB availability/headroom, and >=60
   GiB Docker storage are measured and retained as non-secret evidence under a
   machine-shared flock serialization lock. `ci-runtime-contract` itself runs
   only on `workflow_dispatch` or when a dedicated `self-hosted` pre-flight
   job (no admission, no Node/pnpm — it does not consume the capacity the
   admission gate protects) reports a change under a fixed
   CI-infrastructure path set; any pre-flight failure, timeout, or
   unrecognized event fails open to running the contract. When the contract
   is skipped, `ci` runs the identical full single-project web/admin
   Playwright suite (contract spec plus the rest) that the contract job also
   proves, so Rule 1 (E2E) coverage never depends on which path a given
   trigger takes (revised 2026-08-26).
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

## Trust boundary
The CI runner workspace bind is read-only from the containers' perspective:
`.env` is gitignored and therefore never present on CI runners, the `.git`
exposure mounted into containers is read-only, and all runtime secrets arrive
exclusively through environment variables written by the contract writer — no
secret material can be modified by, or persisted into, the workspace bind.
The socket-mounted plugin Docker proxy is a single-purpose, least-privilege
component: it enforces one fixed network and derived alias, exact ownership
labels, no host port bindings, only the CA-bundle bind, and two trusted
digest-pinned sidecar image references through trusted server-side
configuration (`PLUGIN_SIDECAR_IMAGE` for plugin images and
`CI_SIDECAR_HARNESS_IMAGE` for harness-marked installs). Client payloads can
never select an image, and the
proxy fails closed at startup if the pinned-image configuration is missing or
not in full `repo@sha256:...` form. A full Core compromise therefore degrades to
creating sidecars strictly inside those constraints — it cannot start arbitrary
images, publish ports, mount host paths beyond the CA bundle, or reach the host
gateway.

## Consequences
**Positive:** concurrent isolation, correct dynamic public issuer, internal
Core backchannels, private sidecars, observable capacity admission, and
(2026-08-26) ordinary PRs/pushes no longer pay the doubled two-project E2E
cost while still keeping real single-project E2E coverage on every trigger.
**Negative:** staged Keycloak setup, duplicate job admission/bootstrap,
strict CI-only sidecar inspection, and (2026-08-26) the two-project isolation
proof itself (Keycloak issuer separation, prior-port sentinel, cross-project
sidecar isolation) is re-verified only on `workflow_dispatch` or a
CI-infrastructure path change, not on every trigger — mitigated by the
fail-open default and the broad `.github/**` coverage of the fixed path set.
**Neutral:** no schema/public API/dependency/production hosting change;
ordinary local Compose and ADR-013 development stay available.

## Platform assumption requiring one empirical verification (2026-08-26)
The scoped-triggering design (CI-PORT-13) relies on GitHub treating a
required status check's `skipped` conclusion as satisfying branch
protection, so that ordinary PRs are not permanently blocked on "Concurrent
runtime contract" when it is intentionally skipped. GitHub's documentation
states required status checks "must have a successful, skipped, or neutral
status" to allow merging — this is a platform behavior, not something this
repository's own tests (`ci-workflow-contract.test.mjs` does static YAML
pattern-matching only) can verify. Before relying on this for a real merge,
open one throwaway PR that touches only an application file, confirm
`ci-runtime-contract` reports `skipped` and the PR is reported mergeable,
then record the observed run URL here. If this assumption is ever wrong for
this repository/ruleset, the failure mode is total: every ordinary PR would
stay blocked on a check that never runs.

## Constitution alignment
| Article | Status | Rationale |
| --- | --- | --- |
| Rule 1 — E2E | Compliant | Requires real two-project web/admin full-stack verification when the contract runs, and an equivalent real single-project full web/admin run inside `ci` on every trigger where it does not (2026-08-26). |
| Rule 2 — Green CI | Compliant | Evidence and verifier failures have no bypass. |
| Rule 4 — Files <=200 | Compliant | Focused helpers and line gate required. |
| Rule 5 — ADR | Compliant | Records CI infrastructure and auth-boundary decision. |
| Security | Improved | DNS boundary, scoped cleanup, private routing, redacted evidence. |

## Relationship to existing ADRs
ADR-004 remains authoritative for Redpanda semantics. ADR-013 remains
authoritative for sidecars; this ADR narrows their CI identity/network/proxy
contract and preserves its local behavior.
