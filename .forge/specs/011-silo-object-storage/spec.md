# Spec: 011 - Object Storage Server Swap (Solution-Agnostic Rename)

> Feature specification for Feature track. Created by `forge-pm` via `/forge-specify`.

| Field   | Value      |
| ------- | ---------- |
| Status  | Draft      |
| Author  | forge-pm   |
| Date    | 2026-09-16 |
| Track   | Feature    |
| Spec ID | 011        |

> **BINDING SCOPE CHANGE (2026-09-16, human-ordered, supersedes earlier decisions).**
> All own identifiers must be **solution-agnostic**: neither `minio` nor
> `silo` may appear in our own code, config, scripts, or setup docs. This
> supersedes the earlier full-rename-to-`silo` decisions recorded in this
> spec's former Q-1–Q-4, in `plan.md` (the former `SILO_*` proposal), and in
> ADR-034's rename inventory wherever they conflict. The plan and ADR-034
> were BOTH amended 2026-09-16 to the neutral vocabulary (status: Proposed,
> human acceptance pending) — the architect mirrors the canonical stale-key
> list (§5 FR-004) and remaining sign-offs are ADR acceptance + breaking-API
> deploy ordering only (see §12 and §14). Only three forced third-party strings stay (allowlist in
> US-002/FR-002): the container image reference `pgsty/silo:...`, the npm
> `minio` import (SDK kept), and the server-consumed
> `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` keys **only as compose mapping
> targets fed from neutral host vars** (never as our interface).
> Additionally, the `minioBucket` DB column + admin API field rename to
> neutral is now **IN scope** (human-ordered), including the Prisma
> data-model migration — a flagged scope growth (§1.1, US-006, FR-013).

---

## 1. Overview

Replace the unmaintained object-storage server image
(`minio/minio:RELEASE.2024-01-16T16-07-38Z`, pinned in
`infra/compose/docker-compose.platform-services.yml`) with the maintained
drop-in fork image **`pgsty/silo`** (release line
`RELEASE.2026-09-03T13-18-01Z` era), digest-pinned like every other platform
image. The `minio@8.0.7` npm SDK is **kept unchanged** against the new
server — no migration to `@aws-sdk/client-s3`, no new core dependency.
All own identifiers use neutral **`storage` / `object-storage` vocabulary**:
service `storage`, volume `storage_data`, host env `STORAGE_*`, files
`storage-client.ts` / `health-check-storage.ts` / `smoke-storage.test.ts`,
symbols such as `storageBucket`, fresh-install default access key neutral
(e.g. `storageadmin`). The zero-`minio`/zero-`silo` invariant for own
code/config/docs is grep-verifiable, with an explicit allowlist of exactly
3 forced third-party exceptions (US-002). The persisted
`minioBucket` field/column is renamed to `storageBucket` **including the
Prisma migration**, the `@plexica/api-types` admin tenant field, and every
reader/writer (US-006). S3 wire compatibility is the invariant. Proof is
the existing `smoke-storage` suite plus the existing CI E2E storage flows
(avatar/logo upload, presigned URLs, tenant bucket lifecycle incl. GDPR
erasure batching) going green, plus migration tests for the DB rename.
Dependabot alert #77 (stream-json via the minio client chain) is **not**
fixed by this change and is re-evaluated as a documented exception with
expiry.

### 1.1 Scope growth flag (honest)

Relative to the original mechanical-rename plan, this scope change **grows
scope in two breaking ways**:

1. **Data-model migration**: `Tenant.minioBucket` (`minio_bucket` column)
   → `storageBucket` (`storage_bucket` column) requires a real Prisma
   migration that applies cleanly on existing DBs, with a tested rollback
   path (US-006, FR-013, §8). Per Constitution **Rule 5**, a data-model
   change requires ADR coverage — flagged for the architect (§14); this
   spec does not itself satisfy Rule 5.
2. **Breaking admin API field rename**: `minioBucket` → `storageBucket`
   in admin tenant responses changes the admin API contract; the admin
   frontend and E2E helpers ship in the same change (§9, US-006).

## 2. Problem Statement

The platform's object-storage server is pinned to a January-2024 release
whose upstream line is no longer maintained, while GitHub issue #175
(enhancement, opened 2026-09-14 by lucaforni) tracks replacing it with the
maintained fork. The replacement server is a verified drop-in: S3 API +
`MINIO_*` server env contract + `/minio/*`-compatible routes/metrics +
on-disk format unchanged, classic image translates legacy server argv, and
mcli is bundled with an `mc` alias so the existing `mc ready local`
healthcheck keeps working. Without this swap the platform keeps running an
unmaintained storage server with no upgrade path; with it, the server line
stays maintained while every client-visible behavior (SDK calls, presigned
URLs, bucket lifecycle, health probes) is preserved.

**Binding user decisions (current, superseding all earlier rename decisions):**

1. Feature track.
2. KEEP the `minio` npm SDK against the new server — no
   `@aws-sdk/client-s3` migration, no new core dependency.
3. SOLUTION-AGNOSTIC naming: own identifiers use neutral
   `storage`/`object-storage` vocabulary (service `storage`, volume
   `storage_data`, `STORAGE_*` env, neutral filenames/symbols, neutral
   default access key e.g. `storageadmin`). Neither `minio` nor `silo`
   appears in own identifiers; exactly 3 forced third-party strings are
   allowlisted (§4 US-002).
4. DB + API rename `minioBucket` → `storageBucket` is IN scope, including
   the Prisma data-model migration, the `@plexica/api-types` admin tenant
   field, and every reader/writer (US-006).
5. Compose maps the server-consumed `MINIO_ROOT_USER`/
   `MINIO_ROOT_PASSWORD` keys FROM neutral host vars
   (e.g. `${STORAGE_ACCESS_KEY}`) — our interface stays agnostic while the
   server still gets the keys it reads (FR-003). This replaces the
   architect's keep-`MINIO_ROOT` host-var decision.
6. Fail-fast on BOTH stale `MINIO_*` (host side) and stale `SILO_*` (from
   the superseded plan), with migration errors naming the `STORAGE_*`
   replacements (FR-004).

## 3. Goals / Non-Goals

### Goals

- G-1: Server image points at a digest-pinned replacement release
  (`pgsty/silo`) in compose, `.env.example`, and dev docs, consistent with
  spec 009 digest-pinning conventions.
- G-2: Solution-agnostic rename across service name, volume, env vars,
  scripts, docs, filenames, symbols, and e2e helpers with no behavior
  change; zero-`minio`/zero-`silo` invariant for own identifiers,
  grep-verifiable modulo the 3-entry allowlist.
- G-3: S3 wire compatibility proven by existing suites green (smoke +
  integration + E2E storage flows) plus DB-migration tests green.
- G-4: ADR coverage for the infra replacement AND the data-model change
  (Rule 5) — flagged for the architect; this spec records the requirement
  (FR-011).
- G-5: Alert #77 re-evaluated as documented exception with expiry; the
  `pnpm-workspace.yaml` override comment (lines 36-38) updated, not
  removed.
- G-6: `minioBucket` column + admin API field renamed to `storageBucket`
  end-to-end (migration, types, readers/writers, admin UI, E2E helpers)
  with rollback coverage.

### Non-Goals

- NG-1: No SDK migration (`minio@8.0.7` stays; no `@aws-sdk/client-s3`).
- NG-2: No fix for Dependabot alert #77 (client chain unchanged).
- NG-3: No operator/Helm chart work.
- NG-4: No production data migration beyond local volume reuse + rollback
  path (FR-010) and the `minio_bucket` → `storage_bucket` column rename
  with its rollback (FR-013).
- NG-5: No new-vendor identifiers: nothing is named after the replacement
  product in our own code/config/docs (that was the superseded plan).

## 4. User Stories

### US-001: Maintained storage server image

**As a** platform operator, **I want** the object-storage server to run a
maintained release at a pinned digest, **so that** the storage layer has
an upgrade path instead of a frozen 2024 binary.

**Acceptance Criteria:**

- Given `infra/compose/docker-compose.platform-services.yml`, when the
  storage service image is inspected, then it references
  `pgsty/silo:<RELEASE-tag>@sha256:<digest>` (tag + digest, per spec 009
  convention; this is allowlist entry E1) and no `minio/minio` image
  reference remains in any compose file.
- Given the release line `RELEASE.2026-09-03T13-18-01Z` era, when the
  ADR + implementation pin the exact tag and digest, then the digest is the
  authority and the tag is a supported non-`latest` release tag.
- Given `docker compose config` (or equivalent render check), when run
  against the platform-services compose file, then it renders validly with
  the replacement image.
- Given a stale `MINIO_ENDPOINT` is set in host env, when the core API
  starts, then startup fails with a migration error naming
  `STORAGE_ENDPOINT` (canonical FR-004 list; no silent shim).
- Given a stale `SILO_ACCESS_KEY` is set in host env, when the core API
  starts, then startup fails with a migration error naming
  `STORAGE_ACCESS_KEY`.
- Given `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` are present ONLY as
  compose left-hand-side mapping targets valued from neutral host vars
  (FR-003, allowlist E3), when the guard runs, then NO guard error is
  raised for them.

### US-002: Solution-agnostic rename (zero-minio/zero-silo invariant)

**As a** developer, **I want** every own `minio`/`silo` identifier renamed
to neutral `storage` vocabulary (service, volume, env vars, files,
symbols, scripts, docs), **so that** no vendor-specific naming misleads
future maintainers regardless of which server product runs underneath.

**Acceptance Criteria:**

- Given the compose file, when inspected, then the service is named
  `storage`, the volume is `storage_data` (no `minio_data` remains),
  ports use `STORAGE_PORT`/`STORAGE_CONSOLE_PORT`, and host env uses
  `STORAGE_ACCESS_KEY`/`STORAGE_SECRET_KEY` (no `MINIO_*` or `SILO_*`
  remains as our interface; the only `MINIO_*` keys present are the two
  server-consumed mapping targets per FR-003).
- Given the canonical zero-match gate (3 scriptable searches, run after
  implementation over own code/config/scripts/docs, excluding history
  paths `ARCHIVE/**`, `.forge/specs/**`, `.forge/sprints/**/archive/**`,
  `.forge/knowledge/adr/**` change-log/mapping-table sections), when run,
  then zero matches remain outside allowlist E1–E3 + server-observed
  strings (observed, recorded in report — never adopted as our
  identifiers). The 3 searches are: (1) `MINIO_|SILO_` (case-sensitive:
  stale host-var / vendor-prefix sweep; justifications: E1 image ref,
  E3 compose-LHS mapping targets, history-path excludes); (2)
  `minioBucket|minio_bucket|minioadmin` (case-sensitive: persisted-field /
  default-key sweep; justifications: `minioadmin` covered only by the
  `storageadmin` replacement + history excludes; `minioBucket` has NO
  allowlist cover — must be zero); (3) case-insensitive `minio|silo`
  (broad residual sweep incl. `minio/` routes, `minio_data`, `silo_data`,
  `siloadmin`; justifications: E1 image ref, E2 npm `minio` import +
  `package.json`/lockfile entries, E3 compose-LHS keys, server-observed
  runtime strings observed + recorded in the implementation report,
  history-path excludes). Wording is unified to "observed, recorded in
  report" throughout):
  - (E1) the container image reference `pgsty/silo:<tag>@sha256:<digest>`
    (compose `image:` + ADR/pin table + implementation report pin table);
  - (E2) the npm `minio` package import inside the storage client
    (`import … from 'minio'`, `"minio"` in `package.json`/lockfile) — SDK
    kept by binding decision;
  - (E3) the compose mapping targets `MINIO_ROOT_USER` /
    `MINIO_ROOT_PASSWORD` as left-hand-side keys only, each valued from a
    neutral host var (FR-003) — never read by our code as interface vars.
  - Historical records (this spec's mapping tables, the updated ADR's
    change log, old specs/plans/sprint archives) necessarily name old
    values and are excluded from the gate; server-emitted runtime strings
    (if the server keeps them: e.g. probe path, metric names, on-disk
    marker) are observed, recorded in the implementation report, not added
    to the allowlist.
- Given the rename inventory (§13 Implementation Scope), when the
  implementation is reviewed, then every listed path is renamed
  (incl. `storage-client.ts`, `health-check-storage.ts`,
  `smoke-storage.test.ts`, `storage-env-guard.ts`) and no behavior change
  (SDK calls, bucket layout, port default values, healthcheck semantics)
  is introduced beyond identifier renaming, the image swap, and the
  US-006 DB/API rename.

### US-003: S3 compatibility proven by existing suites

**As a** QA engineer, **I want** S3 compatibility proven by the existing
smoke, integration, and E2E storage flows going green against the new
server, **so that** the swap is certified without inventing new test
infrastructure.

**Acceptance Criteria:**

- Given `services/core-api/src/__tests__/smoke-storage.test.ts` (renamed
  from `smoke-minio.test.ts`; bucket CRUD: `bucketExists`/`makeBucket`,
  `putObject`/`listObjects`, `removeObject`), when run against the new
  server, then all cases pass unmodified except mechanical env-var renames
  in test setup.
- Given the tenant bucket lifecycle (`bucketExists`, `createBucket` →
  `makeBucket`, `deleteBucket` → `removeBucket` with 1000-batch GDPR
  erasure via `listObjects` + `removeObjects`, `listBuckets` ping in
  `health-check-storage.ts`), when exercised, then behavior is identical
  to the baseline. (`listBuckets` ping semantics unchanged.)
- Given avatar/logo upload (`putObject` at `avatars/{userId}` and `logo`)
  and presigned reads (`presignedGetObject`, 3600s, region pin
  `us-east-1`), when the CI E2E storage flows run
  (`apps/web/e2e/user-profile.spec.ts` avatar flow,
  `apps/web/e2e/tenant-settings.spec.ts` branding/logo flow, marketplace
  presigned-asset reads covered by the marketplace E2E spec
  `apps/web/e2e/marketplace-assets.spec.ts` — if that spec does not exist
  or does not cover presigned reads, the gap is explicitly recorded as an
  accepted gap in the implementation report with rationale, not silently
  assumed covered), then they pass green.
- Given the Phase-3 readers/writers rename (`minioBucket` →
  `storageBucket` across all readers/writers per FR-013) has landed, when
  verification runs, then `smoke-storage` PLUS the provisioning/lifecycle
  integration suites are re-run green AFTER the rename; on red, the change
  rolls back per the ≤ 5-step rollback procedure (US-006).
- Given no gap is found in existing coverage, when the test plan is
  finalized, then no new E2E spec is added (per Rule 1 scoping: storage
  flows already covered — cite them); if a gap IS found, it is recorded
  as a new acceptance criterion before implementation.

### US-004: Docs and examples use neutral storage vocabulary

**As a** new contributor, **I want** `.env.example`, README, and dev docs
to describe object storage neutrally (not MinIO, not Silo), **so that**
local setup works first try and survives future server swaps.

**Acceptance Criteria:**

- Given `.env.example`, when inspected, then the object-storage section is
  headed neutrally (e.g. "Object Storage"), exposes
  `STORAGE_PORT`/`STORAGE_CONSOLE_PORT`/`STORAGE_ENDPOINT`/
  `STORAGE_ACCESS_KEY`/`STORAGE_SECRET_KEY` (with safe placeholder
  defaults, default access key neutral e.g. `storageadmin`), documents the
  compose-level `MINIO_ROOT_*` ← `STORAGE_*` indirection (FR-003), and
  contains zero `MINIO_*`/`SILO_*` entries.
- Given the README / dev docs and `AGENTS.md` env table, when inspected,
  then they reference neutral endpoint/access/secret variables and name
  the server product only where the image reference requires it.
- Given a fresh `docker compose up` from docs, when the stack starts, then
  the storage service is healthy via the readiness probe and the core API
  smoke check (`check-test-env.sh` equivalent, updated path) passes.

### US-005: Alert #77 re-evaluated as documented exception

**As a** security reviewer, **I want** Dependabot alert #77 explicitly
re-evaluated (not silently claimed fixed), **so that** the risk record stays
honest: the vulnerable chain (`stream-json` MEDIUM via `minio@8.0.7`) is
unchanged by a server-only swap.

**Acceptance Criteria:**

- Given `pnpm-workspace.yaml` lines 36-38 (override comment: 3.x is
  ESM-only, breaks minio CJS `jsonl/Parser.js`; client only uses
  `jsonl/Parser`, not the vulnerable filters), when the implementation
  lands, then the comment is updated to reflect the new-server context
  (client unchanged) with a re-evaluation date and an expiry/review date,
  and the override itself is untouched.
- Given the implementation report, when read, then it states explicitly
  that #77 is NOT fixed by this change and records the exception rationale
  + expiry.
- Given Dependabot state for #77, when checked post-merge, then the alert
  remains open (or is closed only as documented-exception with expiry —
  never as "fixed by server swap").

### US-006: Persisted bucket field renamed to neutral (DB migration + API contract)

**As a** platform maintainer, **I want** the persisted `minioBucket`
field/column renamed to `storageBucket` end-to-end (Prisma model +
migration, API types, all readers/writers, admin UI, E2E helpers), **so
that** the data model and admin API contract carry no vendor-specific
naming.

**Acceptance Criteria:**

- Given an existing database with the `minio_bucket` column populated,
  when the new Prisma migration runs, then it applies cleanly
  (`RENAME COLUMN minio_bucket TO storage_bucket`, unique constraint
  carried over, values preserved one-to-one), `prisma validate` /
  `prisma migrate status` is clean, and all tenant rows keep their bucket
  values. Seeded up+down migration tests live at the canonical path
  `services/core-api/src/__tests__/tenant-bucket-migration.int.test.ts`
  (populated bucket values + uniqueness + down-migration restore).
- Given the migration applied, when post-migration assertions run, then
  `pg_indexes` contains zero rows matching `minio` for tenant tables
  (fail otherwise), and the implementation report records pre/post index
  names. When rolled back per the documented procedure (down-migration
  renaming `storage_bucket` back, ≤ 5 steps together with the
  server/volume rollback), then the previous schema is restored and the
  smoke suite passes; the rollback procedure is smoke-verified in CI or
  documented as verified.
- Given the column migration window, when the migration runs, then the API
  is STOPPED (maintenance window; rolling mixed-version operation with old
  code reading `minio_bucket` alongside new code writing `storage_bucket`
  is FORBIDDEN). Phases 1–4 land as ONE atomic PR (phases = task order,
  not merge units); Phase-3 merge is BLOCKED without deploy-ordering +
  maintenance-window sign-off (see edge #10, §8).
- Given the admin API (tenant provision `201` response, tenant detail
  response) and `packages/api-types` admin tenant types, when inspected,
  then the field is `storageBucket` (no `minioBucket` in request/response
  contracts), the admin UI renders the neutral field, and E2E helpers
  (`deletion-infrastructure.ts`, `api-client-types.ts`, deletion specs)
  use `storageBucket` helpers (e.g. `storageBucketExists`).
- Given a repo-wide search for `minioBucket|minio_bucket|minioadmin`
  (canonical gate search #2; see US-002 for the full 3-search gate),
  when run after implementation, then zero matches remain in own
  code/config/docs outside historical records (this spec's mapping
  tables, ADR change log, old specs/plans/archives) and the server/SDK
  allowlist (E1–E3, which does not cover `minioBucket`).

## 5. Functional Requirements

| ID     | Requirement | Priority | Story Ref |
| ------ | ----------- | -------- | --------- |
| FR-001 | Storage service runs digest-pinned `pgsty/silo` image (`tag@sha256:digest`, allowlist E1) in `docker-compose.platform-services.yml`; no `minio/minio` image reference remains in compose. | Must | US-001 |
| FR-002 | Solution-agnostic rename: service `minio` → `storage`; volume `minio_data` → `storage_data`; host env `MINIO_*`/`SILO_*` → `STORAGE_*` (endpoint, public endpoint, access/secret, ports `STORAGE_PORT`/`STORAGE_CONSOLE_PORT`, CI contract `STORAGE_HOST_URL`, plugin bucket key if present); fresh-install default access key neutral (e.g. `storageadmin` — no `minioadmin`/`siloadmin`); zero-`minio`/zero-`silo` invariant for own identifiers modulo allowlist E1–E3 (US-002 gate). | Must | US-002 |
| FR-003 | Container-key indirection (explicit): compose sets the server-consumed keys `MINIO_ROOT_USER: ${STORAGE_ACCESS_KEY:-…}` and `MINIO_ROOT_PASSWORD: ${STORAGE_SECRET_KEY:-…}` (allowlist E3 — left-hand side only). Our code, scripts, CI, and docs NEVER read `MINIO_ROOT_*` as interface vars; the indirection is documented in `.env.example` + ADR. This replaces the architect's keep-`MINIO_ROOT` host-var decision. | Must | US-002, US-004 |
| FR-004 | Core API config (`config.ts` Zod schema), storage client (`storage-client.ts`), health probe (`health-check-storage.ts`), guard module (`storage-env-guard.ts`), and `ci-runtime-contract.ts` read `STORAGE_*` variables and fail fast on BOTH stale `MINIO_*` and stale `SILO_*` (the latter from the superseded plan), throwing a migration error that names the `STORAGE_*` replacement for each stale key. No silent back-compat shim. **Canonical stale-key list (final for the architect to mirror in plan/ADR — no additions, no subtractions):** `MINIO_ENDPOINT` → `STORAGE_ENDPOINT`, `MINIO_PUBLIC_ENDPOINT` → `STORAGE_PUBLIC_ENDPOINT`, `MINIO_ACCESS_KEY` → `STORAGE_ACCESS_KEY`, `MINIO_SECRET_KEY` → `STORAGE_SECRET_KEY`, `MINIO_PORT` → `STORAGE_PORT`, `MINIO_CONSOLE_PORT` → `STORAGE_CONSOLE_PORT`, `MINIO_HOST_URL` → `STORAGE_HOST_URL`, plus exact `SILO_*` mirrors `SILO_ENDPOINT` → `STORAGE_ENDPOINT`, `SILO_PUBLIC_ENDPOINT` → `STORAGE_PUBLIC_ENDPOINT`, `SILO_ACCESS_KEY` → `STORAGE_ACCESS_KEY`, `SILO_SECRET_KEY` → `STORAGE_SECRET_KEY`, `SILO_PORT` → `STORAGE_PORT`, `SILO_CONSOLE_PORT` → `STORAGE_CONSOLE_PORT`, `SILO_HOST_URL` → `STORAGE_HOST_URL`. **Explicitly EXCLUDED from the guard:** `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` — these exist ONLY as compose left-hand-side mapping targets valued from neutral host vars (allowlist E3, FR-003) and MUST NOT trigger a guard error when present. Negative-test ACs (US-002 gate): (a) stale `MINIO_ENDPOINT` set → startup fails with error naming `STORAGE_ENDPOINT`; (b) stale `SILO_ACCESS_KEY` set → startup fails with error naming `STORAGE_ACCESS_KEY`; (c) `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` present as compose mapping targets → NO guard error. Client call surface unchanged (`bucketExists`, `makeBucket`/`createBucket`, `removeBucket`/`deleteBucket` with 1000-batch erasure, `listObjects`, `removeObjects`, `putObject`, `presignedGetObject` 3600s + `us-east-1` region pin, `listBuckets` ping). The npm `minio` package import inside the client is kept (allowlist E2); symbols renamed neutrally (`createStorageClient`, `pingStorage`, `storageBucket` locals). | Must | US-002, US-003 |
| FR-005 | All CI scripts under `.github/actions/docker-infra/scripts/` (`ci-runtime-compose.sh`, `ci-runtime-env.sh`, `ci-test-env-guard.sh`, `generate-ci-runtime-secrets.sh`, `publish-plugin-assets.sh`, `verify-concurrent-ci-runtime.sh`, incl. `MINIO_HOST_URL`/`SILO_HOST_URL`→`STORAGE_HOST_URL` contract keys and secret-name assertions in `*.test.sh`) and `action.yml` inputs migrated to `STORAGE_*`; no `MINIO_*`/`SILO_*` remains. | Must | US-002 |
| FR-006 | Shell scripts (`scripts/run-web-e2e-production.sh`, `scripts/e2e-production-assets.sh`, `scripts/upload-crm-ui-assets.sh`, `services/core-api/scripts/check-test-env.sh` incl. health-probe path) migrated to `STORAGE_*`. | Must | US-002, US-004 |
| FR-007 | E2E helpers and manifests (`e2e/playwright-base.ts`, `e2e/ci-runtime-manifest.ts`, `e2e/keycloak/admin-api.test.ts`, `apps/admin/e2e/helpers/deletion-infrastructure.ts` incl. `minioBucketExists` → `storageBucketExists`, `apps/admin/src/lib/playwright-contract.test.ts` snapshot) migrated to `STORAGE_*` / `storageBucket`; no `MINIO_*`/`SILO_*`/`minioBucket` remains outside history. | Must | US-002, US-006 |
| FR-008 | `.env.example`, README/dev docs, `AGENTS.md` env table + stack row, and constitution storage row (if touched) use neutral storage vocabulary; the server product is named only at the image reference. | Must | US-004 |
| FR-009 | Healthcheck keeps working: `mc ready local` (via bundled mcli `mc` alias) or an explicitly documented server-native equivalent; `command: server /data --console-address ":9001"` argv behavior verified under the new server binary (argv translation or updated command recorded in ADR + report). | Must | US-001, US-003 |
| FR-010 | Prod volume is renamed one-time via `docker volume` rename/copy (`minio_data` → `storage_data`) reusing on-disk format unchanged (server reads it natively); dev/CI use fresh ephemeral `storage_data` volumes. Rollback documented: repin previous `minio/minio` digest + restore volume (≤ 5 steps, smoke-verified). | Must | US-001 |
| FR-011 | ADR coverage for BOTH the server swap + neutral rename AND the data-model/API rename (Rule 5): ADR-034 as amended 2026-09-16 to the neutral vocabulary (status: Proposed, human acceptance pending) covers the FR-003 indirection, the canonical FR-004 dual fail-fast stale-key list (mirrored verbatim), and the FR-013 migration; remaining sign-off = ADR acceptance. This spec flags the requirement; it does not itself satisfy Rule 5. | Must | US-001, US-006 |
| FR-012 | #77 re-evaluation recorded: `pnpm-workspace.yaml` override comment updated with re-evaluation date + expiry; implementation report states #77 NOT fixed. | Must | US-005 |
| FR-013 | Prisma data-model migration `minio_bucket` → `storage_bucket`: `Tenant.minioBucket` → `Tenant.storageBucket` with `@map("storage_bucket")`; migration renames the column preserving values + unique constraint; `@plexica/api-types` admin tenant field renamed; every reader/writer updated (tenant provisioning incl. rollback path, provision-conflict check, tenant detail/detail-info tab, provision result view, deletion context + GDPR purge step, `tenant-schema.ts`, `create-tenant` CLI output, tenant-provisioning tests, deletion specs); down-migration + rollback procedure documented and smoke-verified. | Must | US-006 |

## 6. Non-Functional Requirements

| ID      | Category    | Requirement | Target |
| ------- | ----------- | ----------- | ------ |
| NFR-001 | Compatibility | Existing storage-related suites green against the new server: `smoke-storage.test.ts` (renamed; re-run green AFTER the Phase-3 readers/writers rename, rollback on red), core-api integration coverage of avatar/logo/presigned/bucket-lifecycle endpoints (incl. provisioning/lifecycle integration re-run post-rename), and E2E avatar (`user-profile.spec.ts`), logo (`tenant-settings.spec.ts`), marketplace presigned reads (`apps/web/e2e/marketplace-assets.spec.ts`, or an explicitly recorded accepted gap if uncovered) — plus migration tests (`tenant-bucket-migration.int.test.ts`) for FR-013. | 100% of listed suites pass; 0 new failures vs baseline |
| NFR-002 | Performance | No P95 regression basis: storage-facing API P95 within noise of baseline (constitution: API P95 < 200ms). Minimal P95 procedure: reuse the covered-endpoint timings (avatar/logo upload, presigned-URL issue, bucket-lifecycle endpoints) from the same suite run old-server vs new-server, and publish either an old-vs-new comparison table (ΔP95 within ±10%) or absolute P95 < 200ms per endpoint in the implementation report. | ΔP95 within ±10% or absolute P95 < 200ms on covered endpoints |
| NFR-003 | Security | Secrets handling unchanged: no secrets in code/logs, env-only; presigned URL TTL stays 3600s; bucket-per-tenant private isolation preserved; GDPR erasure batching (1000/call) preserved. | 0 secrets findings in review; existing GDPR/erasure tests 100% green |
| NFR-004 | Reliability | Digest-pinned image (`tag@sha256:digest`, digest resolved at implementation time via registry per Q-2 method retained); healthcheck retries/intervals preserved; rollback paths (server+volume per FR-010; DB per FR-013/US-006) documented and smoke-verified. | `docker compose config` valid; each rollback procedure ≤ 5 steps |
| NFR-005 | Maintainability | Rename is mechanical only (plus the ordered FR-013 field rename): no file exceeds 200 lines after rename (Rule 4) — the stale-env guard lives in `storage-env-guard.ts`, not inlined into `config.ts`; one data-fetching/storage pattern preserved (Rule 3 — SDK client unchanged). | Max file length ≤ 200 lines (lint green); 0 new storage abstractions |
| NFR-006 | Compatibility | #77 exception hygiene: override comment carries re-evaluation date + expiry/review date (≤ 6 months). | Expiry date present and ≤ 6 months out |
| NFR-007 | Data safety | Column rename preserves every bucket value; migration is transactional (`RENAME COLUMN`, no data rewrite); pre-migration backup step documented; down-migration restores the prior column name with values intact. | 0 rows lost/changed value in migration tests; down-migration verified |

## 7. Edge Cases & Error Scenarios

| #  | Scenario | Expected Behavior |
| -- | -------- | ----------------- |
| 1  | Existing local `minio_data` Docker volume on upgrade | Prod — one-time `docker volume` rename/copy to `storage_data` (data-loss-free; on-disk format reused unchanged); dev/CI — fresh ephemeral `storage_data` (no migration). Rollback = repin prior digest + restore/copy back, per FR-010. |
| 2  | New-server binary rejects legacy server argv | Prefer classic image with argv translation; if translation absent, update `command:` explicitly and record in ADR + implementation report. |
| 3  | `mc ready local` alias missing in the new image | Fall back to a documented server-native readiness probe; update compose healthcheck + `check-test-env.sh` consistently. |
| 4  | Stale `MINIO_*` host env still set (developer's old `.env`) | Fail-fast: `config.ts` + `storage-env-guard.ts` reject startup with a migration error naming the `STORAGE_*` replacements (e.g. `MINIO_ENDPOINT` → `STORAGE_ENDPOINT`). No silent back-compat shim — a shim would violate the agnostic invariant (US-002). |
| 5  | Stale `SILO_*` env set (from the superseded plan: `plan.md`/ADR-034 proposed `SILO_*`, never shipped to code) | Fail-fast identically to #4: each stale `SILO_*` key is rejected with its `STORAGE_*` replacement named (e.g. `SILO_ACCESS_KEY` → `STORAGE_ACCESS_KEY`). Prevents the superseded vocabulary from silently configuring the system. |
| 6  | Server renames its routes or metric names | Block: S3 wire compat is the invariant; any route/metric rename must be recorded as a scope break and re-reviewed. Server-emitted strings are observed, recorded in the report, never adopted as our identifiers. |
| 7  | `MINIO_PUBLIC_ENDPOINT` / `SILO_PUBLIC_ENDPOINT` consumers (browser presigned fetch, `VITE_PLUGIN_ASSET_ORIGIN`) | Single neutral key `STORAGE_PUBLIC_ENDPOINT`; presigned-URL host-signing behavior re-verified via E2E. |
| 8  | CI `*.test.sh` secret-name assertions (24/32-byte hex, `changeme`/`minioadmin` guards) | Updated to `STORAGE_*` names with identical entropy/format rules; default secret sentinel neutral (`storageadmin`). |
| 9  | `minio` npm package name still appears in `package.json`/lockfile | Expected and allowlisted (E2): client SDK is kept; listed explicitly in the implementation report (not a rename miss). |
| 10 | Existing DBs already carry `minio_bucket` with data | FR-013 migration renames the column in place (values preserved); migration tests at canonical `services/core-api/src/__tests__/tenant-bucket-migration.int.test.ts` cover populated tables + unique-constraint carryover + down-migration restore + `pg_indexes` zero-`minio` assertion. DEPLOY RULE (binding): the API MUST be STOPPED during the column migration (maintenance window); rolling mixed-version operation (old code on `minio_bucket` alongside new code on `storage_bucket`) is FORBIDDEN. Phases 1–4 land as ONE atomic PR (phases = task order, not merge units); Phase-3 merge is BLOCKED without deploy-ordering + maintenance-window sign-off. |
| 11 | Rollback after the DB migration has applied | Down-migration renames `storage_bucket` back; procedure combined with the server/volume rollback stays ≤ 5 steps and is smoke-verified (US-006). |
| 12 | Admin API consumers still send/expect `minioBucket` | Breaking change by order: no back-compat alias (an alias would perpetuate the vendor name in the contract); coordinated admin frontend release; migration error / contract-test failure surfaces stale usage. |

## 8. Data Requirements

**Data-model change IN scope (scope growth, see §1.1).** Object-storage
layout otherwise unchanged: bucket-per-tenant (`tenant-{slug}`), keys
`avatars/{userId}` and `logo`, private policy, presigned GET TTL 3600s.
GDPR erasure semantics unchanged (list-all + 1000-batch `removeObjects` +
`removeBucket`).

- Prisma: `Tenant.minioBucket String? @unique @map("minio_bucket")` →
  `Tenant.storageBucket String? @unique @map("storage_bucket")`.
  Migration: `ALTER TABLE "core"."tenants" RENAME COLUMN "minio_bucket"
  TO "storage_bucket"` (constraint/index carried over, values preserved).
  Down-migration reverses the rename. Migration tests at canonical
  `services/core-api/src/__tests__/tenant-bucket-migration.int.test.ts`:
  apply on a seeded DB (populated bucket values + uniqueness), assert
  values intact, assert `pg_indexes` has zero `minio`-matching rows for
  tenant tables (fail otherwise; record pre/post index names in the
  report), `migrate status` clean, rollback restores prior name + values.
- Deploy ordering (binding): the API is STOPPED during the column
  migration (maintenance window); rolling mixed-version (old
  `minio_bucket` code alongside new `storage_bucket` code) is FORBIDDEN.
  Phases 1–4 land as ONE atomic PR (phases = task order, not merge
  units); Phase-3 merge blocked without deploy-ordering +
  maintenance-window sign-off (US-006, edge #10).
- Volume mechanics: prod one-time `docker volume` rename/copy
  (`minio_data` → `storage_data`) reusing on-disk state unchanged;
  dev/CI fresh ephemeral `storage_data`; rollback per FR-010.
- Rule 5: this migration requires ADR coverage — flagged for the
  architect (FR-011); the implementing PR must cite it.

## 9. API Requirements

**Breaking admin API rename IN scope (scope growth, see §1.1).** The
storage client call surface stays frozen (`bucketExists`,
`createBucket`/`makeBucket`, `deleteBucket`/`removeBucket`, `listObjects`,
`removeObjects`, `putObject`, `presignedGetObject`, `listBuckets`); only
env-var plumbing and internal naming change. REST endpoints for profile
avatar, tenant branding/logo, and marketplace assets keep identical
contracts. The **admin tenant contract changes**:

| Method | Path | Change |
| ------ | ---- | ------ |
| POST | `/admin/tenants` | Response `201: { tenantId, slug, schemaName, realmName, minioBucket, tempPassword }` → `storageBucket` replaces `minioBucket`. |
| GET | admin tenant-detail | `minioBucket` field → `storageBucket`. |
| GET | admin health response | Service key `minio` → `storage` (neutral rename; contract-test snapshot in `apps/admin/src/lib/playwright-contract.test.ts` updated accordingly — traceable via FR-007). |

- `packages/api-types` admin tenant types renamed in the same change;
  admin UI (`tenant-detail-info-tab`, `provision-step-result`), admin E2E
  helpers (`api-client-types.ts`, `deletion-infrastructure.ts` incl.
  `storageBucketExists`), and deletion specs aligned atomically.
- Health probe path kept unless the server renames it (edge case #3); any
  change recorded as scope break. The admin health service key follows the
  neutral rename (no vendor-named service key).

## 10. UX/UI Notes

No user-facing UI change. Console port default (9001) and behavior
preserved under `STORAGE_CONSOLE_PORT`. Admin bucket-field labels use
neutral wording (no vendor names). No a11y impact.

## 11. Out of Scope

- SDK migration: `minio@8.0.7` stays; no `@aws-sdk/client-s3`, no new core
  dependency, no `package.json`/lockfile client change (only the
  surrounding comment context goes neutral).
- Dependabot alert #77 fix: the `stream-json` chain via the minio client is
  unchanged; re-evaluated as documented exception with expiry only (US-005).
- Operator/Helm chart work: compose-only change; no Helm, no K8s manifests.
- Production data migration: beyond the prod one-time volume rename/copy +
  rollback path (FR-010) and the `minio_bucket` → `storage_bucket` column
  rename + rollback (FR-013, US-006), no prod migration tooling or backfill.
- Behavior change of any kind in the rename: bucket layout, key schemes,
  TTLs, port defaults, healthcheck semantics are frozen (the DB/API field
  rename in §8–§9 is the sole ordered exception).
- New E2E specs: none unless a coverage gap is found during planning
  (US-003); existing suites + migration tests are the proof vehicle.
- Back-compat alias for `minioBucket`: explicitly excluded (edge #12).

## 12. Open Questions

> Clarification pass 2026-09-16 (second pass — scope change): the four
> questions resolved under the old rename are SUPERSEDED below. No open
> `[NEEDS CLARIFICATION]` markers remain in this spec.

- **Q-1 — Stale `MINIO_*` handling (old, SUPERSEDED in scope but retained
  in substance):** fail-fast with a migration error naming the neutral
  replacement. Now FR-004 (covers `MINIO_*` AND `SILO_*` → `STORAGE_*`).
- **Q-2 — Exact server digest: RETAINED → digest-authoritative, resolved
  at implementation time from the registry (spec-009 style).** The spec
  records the resolution method, not a hardcoded digest: implementer looks
  up the digest for the chosen non-`latest` `RELEASE.*` tag in the
  `RELEASE.2026-09-03T13-18-01Z` era via registry inspection, pins
  `tag@sha256:digest`, and records tag + digest + verification method in
  the ADR/implementation report. US-001 acceptance criteria reflect this.
- **Q-3 — Volume migration mechanics: RETAINED with neutral names → prod
  one-time rename/copy (`minio_data` → `storage_data`); dev/CI fresh.**
  See FR-010, edge case #1, §8.
- **Q-4 — File-level rename scope (old `silo-*` names, SUPERSEDED):**
  neutral filenames `storage-client.ts`, `health-check-storage.ts`,
  `smoke-storage.test.ts`, plus `storage-env-guard.ts`, with all import
  sites updated. The npm `minio` package import inside the client stays
  (SDK kept, allowlist E2). See §13.
- **Q-5 — Neutral vocabulary (NEW, RESOLVED by human scope change):**
  own identifiers use `storage`/`object-storage`; neither `minio` nor
  `silo` in own code/config/docs; 3-entry allowlist (US-002); default
  access key neutral (e.g. `storageadmin`).
- **Q-6 — DB/API rename in scope (NEW, RESOLVED by human order):**
  `minioBucket` → `storageBucket` including Prisma migration,
  `@plexica/api-types`, and all readers/writers (US-006, FR-013),
  with rollback coverage.
- **Q-7 — Container-key indirection (NEW, RESOLVED):** compose sets
  `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` FROM `${STORAGE_ACCESS_KEY}`/
  `${STORAGE_SECRET_KEY}` (FR-003); replaces the architect's prior
  host-`MINIO_*` decision.
- **Q-8 — Stale `SILO_*` handling (NEW, RESOLVED):** fail-fast with
  `STORAGE_*` replacements named (edge #5, FR-004).

**Still needing the human / architect (not spec blockers — plan + ADR already amended):**

1. Plan + ADR-034 amended 2026-09-16 to the neutral vocabulary (status:
   Proposed, human acceptance pending); the architect mirrors the
   canonical FR-004 stale-key list verbatim in plan/ADR. Remaining
   sign-off = ADR acceptance only.
2. Human sign-off: breaking admin API field rename (`minioBucket` →
   `storageBucket`) deploy ordering + maintenance-window sign-off
   (coordinated admin frontend release; no back-compat alias per edge
   #12; no mixed-version rolling per edge #10; Phases 1–4 as ONE atomic
   PR). Phase-3 merge blocked without it.

## 13. Implementation Scope

> Paths relative to project root. Every `SILO_*`/`silo-*` path in the
> superseded plan reads as `STORAGE_*`/`storage-*` here.

### New Components

| Component Type | Path | Description |
| -------------- | ---- | ----------- |
| ADR update / addendum | `.forge/knowledge/adr/ADR-034-*-object-storage.md` (update or superseding record) | Neutral rename + FR-003 indirection + FR-004 dual fail-fast + FR-013 migration Rule-5 coverage (FR-011). Numbering at architect's discretion. |
| Spec | `.forge/specs/011-silo-object-storage/spec.md` | This document (directory name retained as history; not renamed). |
| Prisma migration | `services/core-api/prisma/migrations/XXXX_rename_minio_bucket_to_storage_bucket/` | `RENAME COLUMN minio_bucket → storage_bucket` + down-migration; seeded up+down tests at canonical `services/core-api/src/__tests__/tenant-bucket-migration.int.test.ts` incl. `pg_indexes` zero-`minio` assertion. |
| Guard module | `services/core-api/src/lib/storage-env-guard.ts` | Dual fail-fast over the canonical FR-004 stale-key list (`MINIO_*` + `SILO_*` → `STORAGE_*` errors; `MINIO_ROOT_*` excluded). Keeps `config.ts` ≤ 200 lines (Rule 4). |

### Modified Components

| Path | Modification Type | Description |
|------|-------------------|-------------|
| `infra/compose/docker-compose.platform-services.yml` | Enhancement | Image → `pgsty/silo:tag@digest` (E1); service `minio`→`storage`; volume `minio_data`→`storage_data`; host env/ports → `STORAGE_*`; container keys `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` KEPT as mapping targets valued from `${STORAGE_ACCESS_KEY}`/`${STORAGE_SECRET_KEY}` (FR-003); verify `command:`/healthcheck under the new binary. |
| `services/core-api/prisma/schema.prisma` | Refactor (data model) | `minioBucket @map("minio_bucket")` → `storageBucket @map("storage_bucket")`. |
| `packages/api-types/src/admin/tenant.ts` | Refactor (breaking) | Admin tenant field `minioBucket` → `storageBucket`. |
| `services/core-api/src/lib/config.ts` | Refactor | Zod schema `MINIO_*` → `STORAGE_*` (endpoint, public endpoint, access/secret) + call into `storage-env-guard.ts`. |
| `services/core-api/src/lib/minio-client.ts` → `services/core-api/src/lib/storage-client.ts` | Refactor (rename) | Env plumbing rename only; SDK call surface frozen; npm `minio` import kept (E2); symbols neutral (`createStorageClient`, `pingStorage`). |
| `services/core-api/src/modules/admin/services/health-check-minio.ts` → `health-check-storage.ts` | Refactor (rename) | Import update; neutral probe registration name. |
| `services/core-api/src/__tests__/smoke-minio.test.ts` → `services/core-api/src/__tests__/smoke-storage.test.ts` | Refactor (rename) | Setup env rename only; assertions frozen. |
| `services/core-api/src/lib/ci-runtime-contract.ts` | Refactor | Contract keys → `STORAGE_*` (incl. `STORAGE_HOST_URL`); loopback validation message update. |
| `services/core-api/scripts/check-test-env.sh` | Refactor | `MINIO_*`/`SILO_*` grep/env + probe block → `STORAGE_*`/neutral. |
| `services/core-api/src/modules/tenant/tenant-provisioning.ts`, `services/core-api/src/modules/admin/services/tenant-provision.service.ts`, `services/core-api/src/modules/tenant/tenant-schema.ts`, `services/core-api/src/modules/admin/services/deletion-context.service.ts`, `services/core-api/src/modules/admin/services/deletion-step-gdpr-purge.ts`, `services/core-api/src/modules/admin/services/tenant-detail.service.ts`, `services/core-api/src/cli/create-tenant.ts` | Refactor (breaking field) | `minioBucket` params/vars/messages → `storageBucket` (FR-013). |
| `services/core-api/src/modules/tenant-settings/service-branding.ts`, `services/core-api/src/modules/user-profile/service.ts`, `services/core-api/src/modules/plugin/routes/marketplace.routes.ts` | Refactor | Import path updates only (no logic change). |
| `.github/actions/docker-infra/action.yml` | Refactor | Input naming → neutral `storage-*`; all access/secret env mappings → `STORAGE_*`; neutral descriptions. |
| `.github/actions/docker-infra/scripts/*.sh` (+ `*.test.sh` incl. `ci-runtime-compose.sh`, `ci-runtime-env.sh`, `ci-test-env-guard.sh`, `generate-ci-runtime-secrets.sh`, `publish-plugin-assets.sh`, `verify-concurrent-ci-runtime.sh`) | Refactor | `MINIO_*`/`SILO_*`/`MINIO_HOST_URL` → `STORAGE_*`/`STORAGE_HOST_URL`; secret-format assertions renamed, rules identical; default sentinel neutral. |
| `scripts/run-web-e2e-production.sh`, `scripts/e2e-production-assets.sh`, `scripts/upload-crm-ui-assets.sh` | Refactor | `MINIO_*`/`SILO_*` exports/guards → `STORAGE_*`; default access-key value neutral (`storageadmin`). |
| `e2e/playwright-base.ts`, `e2e/ci-runtime-manifest.ts`, `e2e/keycloak/admin-api.test.ts`, `apps/admin/e2e/helpers/deletion-infrastructure.ts` (incl. `storageBucketExists`), `apps/admin/e2e/helpers/api-client-types.ts`, `apps/admin/e2e/005-07-deletion.spec.ts`, `apps/admin/src/lib/playwright-contract.test.ts` | Refactor | `MINIO_*`/`SILO_*` defaults/snapshots → `STORAGE_*`; `minioBucket` fields/helpers → `storageBucket`. |
| `apps/admin/src/components/tenants/tenant-detail-info-tab.tsx`, `apps/admin/src/components/tenants/provision-step-result.tsx` | Refactor | `minioBucket` bindings → `storageBucket`; neutral labels. |
| `.env.example` | Enhancement | Object-storage section → neutral `STORAGE_*` keys + FR-003 indirection note; zero `MINIO_*`/`SILO_*`. |
| `README.md` / dev docs, `AGENTS.md` env table + stack row | Enhancement | Vendor references → neutral storage vocabulary (image ref only where required). |
| `.forge/constitution.md` | Enhancement | Storage row → neutral wording **only if touched**; record amendment entry per constitution process. |
| `pnpm-workspace.yaml` | Enhancement | Lines 36-38 override comment: re-evaluation date + expiry added; override values untouched. |

### Documentation Updates

| Path | Section | Update Description |
|------|---------|--------------------|
| ADR (updated per FR-011) | All | Why the replacement server, drop-in evidence, tag+digest, neutral rename scope, FR-003 indirection, FR-004 dual fail-fast, FR-013 migration + rollback, #77 non-fix statement. |
| Implementation report (plan-phase artifact) | Verification | Tag/digest/verification-method table (spec 009 style), allowlist E1–E3 inventory, canonical 3-search zero-match gate evidence (`MINIO_|SILO_`, `minioBucket|minio_bucket|minioadmin`, case-insensitive `minio|silo`; history-path excludes; E1–E3 + server-observed justifications, wording "observed, recorded in report"), pre/post `pg_indexes` names, suite results (smoke re-run post-Phase-3 + provisioning/lifecycle integration + E2E + canonical migration tests), old-vs-new P95 table or absolute < 200ms per endpoint, #77 exception record, deploy-ordering + maintenance-window sign-off record. |

## 14. Constitution Compliance

| Article | Status | Notes |
| ------- | ------ | ----- |
| Art. 1 | Compliant | No new E2E: storage flows already covered (`user-profile.spec.ts` avatar, `tenant-settings.spec.ts` logo, marketplace presigned reads per `apps/web/e2e/marketplace-assets.spec.ts` or a recorded accepted gap, tenant lifecycle incl. GDPR erasure). US-003 cites them; migration tests (not E2E) cover FR-013 at the canonical `tenant-bucket-migration.int.test.ts` path; new E2E only if a gap is found. |
| Art. 2 | Compliant | Acceptance = existing smoke + integration + E2E storage flows green + migration tests green against the new server; merge blocked otherwise. |
| Art. 3 | Compliant | Storage pattern unchanged: single `minio` SDK client wrapper (neutral filename/symbols); no new abstraction, no `@aws-sdk/client-s3`. |
| Art. 4 | Compliant | Rename is mechanical (+ ordered FR-013 field rename); the stale-env guard lives in `storage-env-guard.ts` so `config.ts` stays ≤ 200 lines (NFR-005). |
| Art. 5 | **Flagged — ADR acceptance pending (amended, not missing)** | Server swap + rename + FR-013 data-model change (`minio_bucket` → `storage_bucket`) Rule-5 coverage is recorded in ADR-034 as amended 2026-09-16 to the neutral vocabulary (status: Proposed, human acceptance pending). FR-011 records the requirement; implementing PR must cite the ADR acceptance. |
| Art. 6 | Compliant | Unchanged process requirement for the implementing PR (commits in English). |
| Art. 7 | Compliant | Bucket-per-tenant isolation, 3600s presigned TTL, GDPR 1000-batch erasure, env-only secrets — all preserved (NFR-003). |

---

## Cross-References

| Document | Path |
| -------- | ---- |
| Constitution | `.forge/constitution.md` |
| GitHub issue | Issue #175 — Replace MinIO with Silo fork (enhancement, lucaforni, 2026-09-14) |
| Dependabot alert | Alert #77 — `stream-json` MEDIUM via `minio@8.0.7` (open; `fixed_in` 3.5.0); override comment in `pnpm-workspace.yaml` lines 36-38 |
| Prior spec | `.forge/specs/009-dependabot-docker-image-updates/tech-spec.md` (MinIO pin table: `RELEASE.2024-01-16T16-07-38Z` / `sha256:4c4a48…`; tag@digest convention reused here) |
| Current server pin | `infra/compose/docker-compose.platform-services.yml` (`minio/minio:RELEASE.2024-01-16T16-07-38Z@sha256:4c4a…`) |
| Client surface (post-rename) | `services/core-api/src/lib/storage-client.ts`, `services/core-api/src/__tests__/smoke-storage.test.ts`, `services/core-api/src/modules/admin/services/health-check-storage.ts` |
| Data model (post-rename) | `services/core-api/prisma/schema.prisma` (`Tenant.storageBucket @map("storage_bucket")`), `packages/api-types/src/admin/tenant.ts` (`storageBucket`) |
| Amended plan + ADR (Proposed, human accept pending) | `.forge/specs/011-silo-object-storage/plan.md` (amended 2026-09-16 to neutral vocabulary), `.forge/knowledge/adr/adr-034-silo-object-storage.md` (amended 2026-09-16: neutral rename + FR-003 indirection + canonical FR-004 stale-key list + FR-013 migration; superseded `SILO_*` proposal retained only in change-log history) |
| Architecture | `.forge/architecture/architecture.md` |
| Plan | <!-- /forge-plan --> |
| Tasks | <!-- /forge-tasks --> |
