# Tech Spec: 009 — Dependabot Docker Image Updates

> Lightweight specification for the Quick track. Combines requirements,
> tasks, and acceptance criteria in a single document.
> Created by the `forge-pm` agent via `/forge-quick`.

| Field | Value |
| --- | --- |
| Status | Complete |
| Author | forge-pm |
| Date | 2026-08-21 |
| Track | Quick |
| Spec ID | 009 |

---

## Overview

Enable Dependabot to discover Docker images in the Compose and Dockerfile
directories while retaining image immutability. Existing digest-only image
references will become `image:tag@sha256:digest` (or
`FROM image:tag@sha256:digest`) without changing their current digest.

## Requirements

1. **DEP-001 — Docker update coverage:** Add update entries to
   `.github/dependabot.yml`: one `docker-compose` entry for `/infra/compose`
   and one `docker` entry each for `/e2e/fixtures/plugin-proxy` and
   `/examples/plugins/crm`. They must run weekly on Monday at 08:00, matching
   existing Dependabot scheduling conventions. The four Compose files in
   `/infra/compose` must be renamed so their filenames match the Dependabot
   docker-compose fetcher regex `(docker-)?compose(-[\w]+)?(?>\.[\w-]+)?\.ya?ml`
   (e.g. `docker-compose.database-auth.yml`), with all include/script
   references updated; the Dependabot `docker` ecosystem does not parse Compose
   files and the docker-compose fetcher ignores non-matching filenames.
2. **DEP-002 — Immutable, trackable references:** Convert every digest-only
   Docker reference in the four renamed `infra/compose/docker-compose.*.yml`
   files and the two scoped Dockerfiles to `tag@sha256:digest`; retain each
   occurrence's exact current digest and preserve Dockerfile build-stage
   aliases.
3. **DEP-003 — Tag selection:** Use the exact supported, non-`latest` release
   tag for each image and architecture. The selected tag must be recorded in
   the implementation report and paired with the baseline digest below.
4. **DEP-004 — No unrelated changes:** Do not alter image commands, environment,
   volumes, ports, health checks, service names, or application source code.

### Baseline digests to preserve

| Image | Digest | Occurrences |
| --- | --- | --- |
| `redis` | `sha256:8b81dd37ff027bec4e516d41acfbe9fe2460070dc6d4a4570a2ac5b9d59df065` | `docker-compose.platform-services.yml` |
| `minio/minio` | `sha256:4c4a4876193f030c81f57aabb22bcb9a73462010eb61fcab66908e03e5484af8` | `docker-compose.platform-services.yml` |
| `docker.redpanda.com/redpandadata/redpanda` | `sha256:342d52b03d70e8c605897b1756d6faab14067af6f8a969264093dabbce1858dd` | `docker-compose.platform-services.yml` (2) |
| `axllent/mailpit` | `sha256:c5a6d0ba4d08187f70f305471da5fd9ad424fdfc2f25a2308226a786335dfa9f` | `docker-compose.platform-services.yml` |
| `postgres` | `sha256:fceb6f86328c36f2438fae3b851b0cc57c4a7e69a58c866d9ce24281f2cf0c9c` | `docker-compose.database-auth.yml` (2), `docker-compose.e2e-production.yml` (2) |
| `quay.io/keycloak/keycloak` | `sha256:09a381c715ab0b111835b70f2905955274843a219c6f27efb348e4d9f4086858` | `docker-compose.database-auth.yml` (2) |
| `grafana/loki` | `sha256:4c431d2e6b9b38718694b31c5d56be7c80dc69c513215fde1aeb5b02cd4e2665` | `docker-compose.observability.yml` |
| `grafana/grafana` | `sha256:62d2b9d20a19714ebfe48d1bb405086081bc602aa053e28cf6d73c7537640dfb` | `docker-compose.observability.yml` |
| `node:24-alpine` | `sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd` | `e2e/fixtures/plugin-proxy/Dockerfile` |
| `node:24-alpine` | `sha256:4ba75f835bb8802193e4c114572113d4b26f95f6f094f4b5229d2a77773e0afc` | `examples/plugins/crm/Dockerfile` (2) |

## Tasks

1. Resolve the tag channel in DEP-003 and map each baseline digest to its tag.
2. Rename the four `/infra/compose` files to fetcher-regex-conforming names
   (`git mv`) and update the three include paths in `docker-compose.yml`, the
   two E2E scripts, keeping the CI `hashFiles('infra/compose/*.yml')` wildcard
   working unchanged.
3. Add one `docker-compose` entry for `/infra/compose` and two `docker`
   entries for the Dockerfile directories, all with the existing weekly
   schedule.
4. Rewrite all 16 scoped image occurrences to `tag@digest`, retaining aliases
   (`AS builder`) and every baseline digest exactly.
5. Validate the Dependabot YAML and run the relevant Compose configuration
   rendering/build parsing checks.

## Acceptance Criteria

- Given `.github/dependabot.yml`, when Dependabot configuration is validated,
  then it contains one `docker-compose` entry for `/infra/compose` and one
  `docker` entry for each Dockerfile directory, and all use the Monday 08:00
  weekly schedule.
- Given the four renamed files in `/infra/compose`, when their filenames are
  matched against the Dependabot docker-compose fetcher regex
  `(docker-)?compose(-[\w]+)?(?>\.[\w-]+)?\.ya?ml` (case-insensitive), then
  every filename matches, and no reference to the previous filenames remains
  outside historical review documents.
- Given the six scoped image files, when their Docker references are inspected,
  then none is digest-only and every reference matches `tag@sha256:<digest>`.
- Given the baseline table, when the migrated references are compared with it,
  then all 16 occurrences retain the exact listed digest, including duplicated
  service and build-stage references.
- Given each migrated Compose file and Dockerfile, when it is parsed by its
  relevant Docker/Compose validation command, then it is syntactically valid
  and retains its existing service configuration and Dockerfile stage aliases.
- Given the implementation change, when its test suite is selected, then
  configuration/static validation is run; an E2E test is not required because
  this is repository automation configuration with no user-facing flow.

---

## Implementation Targets

### Files to Create

None. Validation is performed with Dependabot YAML, Compose, and Dockerfile
parsing commands; this change introduces no application code.

### Files to Modify

| Path | Change Description |
| --- | --- |
| `.github/dependabot.yml` | Add `docker-compose` entry for `/infra/compose` and `docker` entries for both Dockerfile directories. |
| `infra/compose/docker-compose.platform-services.yml` | Renamed from `platform-services.yml`; convert five image occurrences to tag@digest. |
| `infra/compose/docker-compose.database-auth.yml` | Renamed from `database-auth.yml`; convert four image occurrences to tag@digest. |
| `infra/compose/docker-compose.observability.yml` | Renamed from `observability.yml`; convert two image occurrences to tag@digest. |
| `infra/compose/docker-compose.e2e-production.yml` | Renamed from `e2e-production.yml`; convert two image occurrences to tag@digest. |
| `docker-compose.yml` | Update three include paths to the renamed files. |
| `scripts/run-web-e2e-production.sh` | Point `-f` at the renamed E2E production file. |
| `scripts/e2e-production-assets.sh` | Point `-f` at the renamed E2E production file. |
| `e2e/fixtures/plugin-proxy/Dockerfile` | Convert the Node base image to tag@digest. |
| `examples/plugins/crm/Dockerfile` | Convert both Node base image references to tag@digest. |

### Files to Reference (Read-only)

| Path | Purpose |
| --- | --- |
| `.forge/constitution.md` | Verify governance and test requirements. |
| `.github/dependabot.yml` | Preserve existing scheduling conventions. |

---

## Cross-References

| Document | Path |
| --- | --- |
| Constitution | `.forge/constitution.md` |
