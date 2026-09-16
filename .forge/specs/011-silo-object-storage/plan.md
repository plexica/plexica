# Plan: 011 - Object Storage Server Swap (Solution-Agnostic Rename)

> Technical implementation plan for Feature track. Created by `forge-architect` via `/forge-plan`.

| Field | Value |
| --- | --- |
| Status | Draft |
| Author | forge-architect |
| Date | 2026-09-16 (amended — binding scope change) |
| Track | Feature |
| Spec | `.forge/specs/011-silo-object-storage/spec.md` |

> **AMENDMENT NOTE (2026-09-16, binding human-ordered scope change).**
> This plan was rewritten to the **solution-agnostic** vocabulary mandated by
> the current `spec.md`. It **supersedes** the earlier `SILO_*` / `silo-*`
> proposal in every prior revision of this file wherever they conflict
> (service `silo`, volume `silo_data`, `SILO_*` env, `silo-client.ts`,
> `health-check-silo.ts`, `smoke-silo.test.ts`, `silo-env-guard.ts`,
> `siloadmin` default, keep-`MINIO_ROOT` host-var decision, and the
> `minioBucket` grandfathering in former §3/§5.4). Neutral replacements:
> service `storage`, volume `storage_data`, `STORAGE_*` env,
> `storage-client.ts`, `health-check-storage.ts`, `smoke-storage.test.ts`,
> `storage-env-guard.ts`, `storageadmin` default, FR-003 container-key
> indirection, FR-004 dual fail-fast, FR-013 DB/API rename. The directory
> name `011-silo-object-storage` is retained as history and is NOT renamed.

---

## 1. Overview

Swap the object-storage server image `minio/minio:RELEASE.2024-01-16T16-07-38Z`
→ digest-pinned
`pgsty/silo:RELEASE.2026-09-03T13-18-01Z@sha256:b616a0cf8cb281e7e6bb3c9b1fb53875b4016a2878223925541c18f82d6c5ca3`
(classic variant; digest reused from the 2026-09-16 resolution — see §2) and
perform the mechanical rename to **neutral `storage` vocabulary** across
compose, config, client wrapper, health probe, guard module, CI scripts,
shell scripts, e2e helpers, `.env.example`, and docs, **plus** the ordered
`minioBucket` → `storageBucket` DB/API rename end-to-end (Prisma model +
migration, `@plexica/api-types`, all readers/writers, admin UI, E2E
helpers). The `minio@8.0.7` npm SDK is kept; the SDK call surface, bucket
layout, presigned-URL semantics, and non-admin API contracts are frozen.
Proof is migration tests + `smoke-storage` + existing E2E storage flows
green, with a ≤5-step rollback (incl. DB down-migration) on any unfixable
failure. Single Rule-5 ADR: `adr-034-silo-object-storage.md` (amended —
covers infra swap + neutral rename + data-model change).

Binding constraints (from current spec, not re-litigated): neutral
vocabulary everywhere with zero-`minio`/zero-`silo` gate modulo exactly 3
allowlisted exceptions (E1 image ref, E2 npm `minio` import, E3 compose
LHS `MINIO_ROOT_*` mapping targets fed from `${STORAGE_*}` — our code never
reads `MINIO_ROOT_*`); dual fail-fast on stale `MINIO_*` AND stale `SILO_*`
with errors naming `STORAGE_*` replacements; no silent back-compat shim; no
`minioBucket` alias (spec edge #12); prod one-time volume rename/copy +
fresh ephemeral volumes for dev/CI; digest-authoritative pin.

## 2. Resolved Image Pin (digest is the authority)

| Field | Value |
| ----- | ----- |
| Image | `pgsty/silo:RELEASE.2026-09-03T13-18-01Z@sha256:b616a0cf8cb281e7e6bb3c9b1fb53875b4016a2878223925541c18f82d6c5ca3` |
| Tag | `RELEASE.2026-09-03T13-18-01Z` (non-`latest` RELEASE line, spec-009 style) |
| Manifest-list digest | `sha256:b616a0cf8cb281e7e6bb3c9b1fb53875b4016a2878223925541c18f82d6c5ca3` |
| Per-arch | `linux/amd64` `sha256:885275e0…` · `linux/arm64` `sha256:c35123a0…` |
| Variant | classic, **not** distroless (distroless has no shell/`mc`; the `mc ready local` healthcheck needs it) |
| Verification | **Reused verbatim** from the 2026-09-16 live resolution (Docker Hub Registry API v2: `/v2/repositories/pgsty/silo/tags/RELEASE.2026-09-03T13-18-01Z` + `?name=2026-09-03` listing). **Not re-queried in this doc-only amendment pass** (re-verify only if cheap — skipped); implementer re-confirms tag+digest at implementation time per spec Q-2 and records the verification method in the implementation report. |
| Legacy name | Docker Hub repo was renamed `pgsty/minio` → `pgsty/silo`; pin the canonical `pgsty/silo` (allowlist E1 — the only place `silo` may appear in own config/docs besides history). |

Upstream compat facts relied on (silo.pgsty.cc + `pgsty/silo` README +
Docker Hub overview, read 2026-09-16): S3 API, `MINIO_*` server env,
`minio_*` metrics, `x-minio-*` headers, `/minio/*` routes, `.minio.sys`
on-disk format unchanged (CI-held); only delivery surfaces renamed
(`silo` binary, image, service); container bundles client as `mcli`
**with an `mc` alias**; **no `minio` binary alias** in native artifacts.
Consequences for this plan: `command: server /data --console-address
":9001"` is binary-name-free argv → expected unchanged (re-verify);
`mc ready local` expected working via the alias (re-verify, fallback
ready); container keys `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` stay as
**mapping targets only** (E3, valued from `${STORAGE_*}` per FR-003) —
never read by our code.

## 3. Data Model

### 3.1 New Tables — none.

### 3.2 Modified Tables

#### `core.tenants`

| Column | Change | Before | After |
| --- | --- | --- | --- |
| `minio_bucket` → `storage_bucket` | Rename column (values preserved 1:1) | `minioBucket String? @unique @map("minio_bucket") @db.VarChar(255)` | `storageBucket String? @unique @map("storage_bucket") @db.VarChar(255)` |

- Prisma model (`services/core-api/prisma/schema.prisma` ~L29):
  `minioBucket … @map("minio_bucket")` →
  `storageBucket String? @unique @map("storage_bucket") @db.VarChar(255)`.
- No type, nullability, or uniqueness-semantics change. Partial unique
  index `tenants_minio_bucket_key … WHERE minio_bucket IS NOT NULL`
  (migration 002) is carried over renamed to the new column.
- **No back-compat alias.** Per spec edge #12 the old field name must not
  survive as an alias/select fallback — an alias would perpetuate the
  vendor name in the contract and defeat US-006.

### 3.3 Indexes

| Table | Index Name | Columns | Type |
| --- | --- | --- | --- |
| `core.tenants` | `tenants_storage_bucket_key` (renamed from `tenants_minio_bucket_key`) | `storage_bucket` | Partial UNIQUE `WHERE storage_bucket IS NOT NULL` (carried over) |

### 3.4 Migrations

Ordered list (new migration dir `services/core-api/prisma/migrations/NNN_rename_minio_bucket_to_storage_bucket/` — number = next free after `010_…` at implementation time):

1. **Up-migration** (`migration.sql`):
   ```sql
   -- Rename minio_bucket -> storage_bucket, values + constraint preserved
   ALTER TABLE core.tenants
     RENAME COLUMN minio_bucket TO storage_bucket;
   ALTER INDEX IF EXISTS tenants_minio_bucket_key
     RENAME TO tenants_storage_bucket_key;
   ```
   (If the index was created `IF NOT EXISTS`, the rename is guarded;
   implementer verifies the actual index name via `\d core.tenants` /
   `pg_indexes` before finalizing and adjusts. Transactional DDL —
   no data rewrite.)
2. **Down-migration** (documented rollback script, same dir or rollback
   runbook — reverses the rename):
   ```sql
   ALTER TABLE core.tenants
     RENAME COLUMN storage_bucket TO minio_bucket;
   ALTER INDEX IF EXISTS tenants_storage_bucket_key
     RENAME TO tenants_minio_bucket_key;
   ```
3. **Seeded-DB verification** (migration tests at canonical
   `services/core-api/src/__tests__/tenant-bucket-migration.int.test.ts`, part of proof gates §8):
   apply up-migration on a seeded DB (populated bucket values +
   duplicate-`NULL` rows + uniqueness), assert every value intact 1:1,
   `prisma validate` / `prisma migrate status` clean, unique-constraint
   violation still rejected on duplicates; assert `pg_indexes` contains
   zero rows matching `minio` for tenant tables (fail otherwise) and record
   pre/post index names in the implementation report; then apply down-migration,
   assert prior name + values restored. Failure → rollback trigger §8.3.
4. **Pre-migration backup step** documented in the runbook
   (`pg_dump` of `core.tenants` or volume snapshot) before prod apply.
5. **Rollback trigger**: migration does not apply cleanly on the seeded
   DB, values differ post-migration, or `migrate status` is dirty →
   stop, execute §8.3 rollback (down-migration + server/volume restore,
   ≤ 5 steps total), report.

Volume mechanics (not a DB migration but data safety, FR-010): prod
one-time `docker volume` rename/copy (`minio_data` → `storage_data`),
`.minio.sys` reused unchanged natively by the new server; dev/CI use
fresh ephemeral `storage_data`; rollback = repin prior digest +
restore/copy back, per §8.3 / ADR-034.

## 4. API Endpoints

Client SDK surface is frozen (`bucketExists`, `createBucket`/`makeBucket`,
`deleteBucket`/`removeBucket` with 1000-batch erasure, `listObjects`,
`removeObjects`, `putObject`, `presignedGetObject` 3600 s + `us-east-1`
region pin, `listBuckets` ping). REST endpoints for profile avatar, tenant
branding/logo, and marketplace assets keep identical contracts. The
**admin tenant contract changes** (breaking, IN scope per FR-013):

### 4.1 POST `/admin/tenants`

- **Description**: Provision tenant; response field renamed.
- **Auth**: Required (admin).
- **Change**: Response `201: { tenantId, slug, schemaName, realmName, minioBucket, tempPassword }` → **`storageBucket` replaces `minioBucket`**. No alias; stale consumers fail loudly via contract tests.
- **Errors**: unchanged.

### 4.2 GET admin tenant-detail

- **Description**: Tenant detail response field renamed.
- **Auth**: Required (admin).
- **Change**: `minioBucket` field → **`storageBucket`** (`packages/api-types` admin tenant types renamed in the same change; admin UI `tenant-detail-info-tab` / `provision-step-result`, admin E2E helpers `api-client-types.ts` / `deletion-infrastructure.ts` incl. `storageBucketExists`, and deletion specs aligned atomically).

Health probe path kept unless the server renames it (spec edge #3); any
change recorded as scope break. The admin health service key follows the
neutral rename (`minio` → `storage`) — grep for service-key consumers in
Phase 2.

### 4.3 GET admin health response

- **Description**: Health response service-key rename (spec §9 addition).
- **Auth**: Required (super-admin).
- **Change**: Service key `minio` → `storage`; contract-test snapshot in
  `apps/admin/src/lib/playwright-contract.test.ts` updated accordingly
  (traceable via FR-007).

## 5. Component Design

### 5.1 Compose storage service (rename + repin + key indirection)

- **Purpose**: Run the new server under the neutral `storage` identity with FR-003 indirection.
- **Location**: `infra/compose/docker-compose.platform-services.yml`
- **Design**: service `minio:` → `storage:`; image → §2 pin;
  volume `minio_data:/data` → `storage_data:/data` (+ top-level
  `volumes:`); ports `'${MINIO_PORT:-9000}:9000'` →
  `'${STORAGE_PORT:-9000}:9000'` (same for console 9001 →
  `STORAGE_CONSOLE_PORT`); host env → `STORAGE_ENDPOINT` /
  `STORAGE_PUBLIC_ENDPOINT` / `STORAGE_ACCESS_KEY` / `STORAGE_SECRET_KEY`;
  **container keys `MINIO_ROOT_USER: ${STORAGE_ACCESS_KEY:-…}` and
  `MINIO_ROOT_PASSWORD: ${STORAGE_SECRET_KEY:-…}` KEPT as LHS mapping
  targets only (E3)** — our code/scripts/CI/docs never read
  `MINIO_ROOT_*`. `command:` and healthcheck carried over verbatim,
  then re-verified (Phase 1).
- **Compose secret defaults (report gate):** the implementation report MUST
  record the actual `:-` defaults rendered by `docker compose config` for
  `STORAGE_ACCESS_KEY`/`STORAGE_SECRET_KEY` (and their `MINIO_ROOT_*`
  mapping targets) and assert no weak/hardcoded secret ships (no
  `minioadmin`/`changeme`-class sentinel in committed compose/` .env.example`);
  production relies on generated secrets (CI `generate-ci-runtime-secrets.sh`
  24/32-byte hex rules), never on defaults.

### 5.2 Config + dual fail-fast guard (new module; config.ts stays ≤ 200)

- **Purpose**: Read `STORAGE_*`, reject stale `MINIO_*` AND stale `SILO_*` with migration errors.
- **Location**: `services/core-api/src/lib/config.ts` (+ new
  `services/core-api/src/lib/storage-env-guard.ts`)
- **Design**: Zod schema `MINIO_*` → `STORAGE_*` (endpoint, public
  endpoint, access/secret); stale-env rejection lives in
  `storage-env-guard.ts`
  (`assertNoStaleStorageEnv(environment)` — iterates a
  `STALE → STORAGE_*` map covering both `MINIO_*` and `SILO_*` keys,
  throws listing each stale key → its `STORAGE_*` replacement), called
  at the top of `parseConfig` (+1 line in `config.ts`).
- **Canonical stale-key list (FINAL, mirrored VERBATIM from spec FR-004 — no additions, no subtractions):**
  `MINIO_ENDPOINT` → `STORAGE_ENDPOINT`, `MINIO_PUBLIC_ENDPOINT` → `STORAGE_PUBLIC_ENDPOINT`,
  `MINIO_ACCESS_KEY` → `STORAGE_ACCESS_KEY`, `MINIO_SECRET_KEY` → `STORAGE_SECRET_KEY`,
  `MINIO_PORT` → `STORAGE_PORT`, `MINIO_CONSOLE_PORT` → `STORAGE_CONSOLE_PORT`,
  `MINIO_HOST_URL` → `STORAGE_HOST_URL`, plus exact `SILO_*` mirrors
  `SILO_ENDPOINT` → `STORAGE_ENDPOINT`, `SILO_PUBLIC_ENDPOINT` → `STORAGE_PUBLIC_ENDPOINT`,
  `SILO_ACCESS_KEY` → `STORAGE_ACCESS_KEY`, `SILO_SECRET_KEY` → `STORAGE_SECRET_KEY`,
  `SILO_PORT` → `STORAGE_PORT`, `SILO_CONSOLE_PORT` → `STORAGE_CONSOLE_PORT`,
  `SILO_HOST_URL` → `STORAGE_HOST_URL`.
  **Explicitly EXCLUDED from the guard:** `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` —
  these exist ONLY as compose left-hand-side mapping targets valued from neutral host vars
  (allowlist E3, FR-003) and MUST NOT trigger a guard error when present.
- **Negative tests (US-002 gate, block Phase-2 merge):**
  (a) stale `MINIO_ENDPOINT` set → startup fails with error naming `STORAGE_ENDPOINT`;
  (b) stale `SILO_ACCESS_KEY` set → startup fails with error naming `STORAGE_ACCESS_KEY`;
  (c) `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` present as compose mapping targets → NO guard error.
- **Why a separate module**: `config.ts` is at **198/200 lines** (Rule 4
  — verified 2026-09-16). Inlining the dual guard would breach the
  limit; the guard module is ≈30 lines, `config.ts` stays ≤ 200.
  `RuntimeConfig.MINIO_ENDPOINT` in `ci-runtime-contract.ts` →
  `STORAGE_ENDPOINT` + host-loopback error message update.

### 5.3 Storage client wrapper (file rename, frozen surface)

- **Purpose**: Same bucket/avatar/logo/presigned/ping operations, neutrally named.
- **Location**: `services/core-api/src/lib/minio-client.ts` →
  `services/core-api/src/lib/storage-client.ts` (170 lines, rename-neutral)
- **Design**: `config.MINIO_*` → `config.STORAGE_*`;
  `createMinioClient` → `createStorageClient`, `minio` singleton →
  `storage`, `publicMinio` → `publicStorage`, `pingMinio` →
  `pingStorage`, `minioBucket` locals/params → `storageBucket`; log
  strings "MinIO bucket …" → "Storage bucket …"; comments reworded.
  **Kept**: `import { Client as MinioClient } from 'minio'` (E2 — SDK
  kept), `region: 'us-east-1'` pin, 3600 s TTL, 1000-batch erasure,
  `listBuckets` ping. Import-site updates in: `marketplace.routes.ts`,
  `tenant-provisioning.ts`, `service-branding.ts`, `service.ts`
  (`minioUploadAvatar` alias → `storageUploadAvatar`),
  `health-check-storage.ts`, `health-checker.service.ts`,
  `tenant-provision.service.ts`, `db-storage.helpers.ts`, all `*.test.ts`
  import sites (§6 file map).

### 5.4 Health probe (file + registration rename)

- **Purpose**: Same `listBuckets` ping under the neutral identity.
- **Location**: `services/core-api/src/modules/admin/services/health-check-minio.ts` → `health-check-storage.ts`; registration in `health-checker.service.ts`
- **Design**: `probeMinio` → `probeStorage`, `makeProbe('minio', …)` →
  `makeProbe('storage', …)`, `withProbeTimeout(pingStorage())`.
- **Contract note**: admin health response service key changes
  `minio` → `storage` (neutral rename; contract-test snapshot in
  `apps/admin/src/lib/playwright-contract.test.ts` updated accordingly —
  traceable via FR-007). Update admin E2E `005-09-health-check.spec.ts`
  `EXPECTED_SERVICES` accordingly.

### 5.5 Smoke test (file rename, frozen assertions)

- **Purpose**: Bucket CRUD proof against the new server.
- **Location**: `services/core-api/src/__tests__/smoke-minio.test.ts` →
  `smoke-storage.test.ts` (78 lines)
- **Design**: `config.MINIO_*` → `config.STORAGE_*`, describe-block +
  comments reworded; bucket/object CRUD assertions byte-identical.
  `reachability.helpers.ts` + `tenant-provisioning.test.ts`: config-key
  rename only — the `'/minio/health/live'` path string is server-owned
  (server-observed, recorded in report — never adopted as our identifier).

### 5.6 Persisted-field rename (FR-013 readers/writers)

- **Purpose**: `storageBucket` end-to-end, no alias.
- **Location**: `schema.prisma`, `packages/api-types/src/admin/tenant.ts`,
  `tenant-provisioning.ts`, `tenant-provision.service.ts` (incl.
  provision-conflict check message `MinIO bucket '…'` → neutral),
  `tenant-schema.ts`, `deletion-context.service.ts`,
  `deletion-step-gdpr-purge.ts`, `tenant-detail.service.ts`,
  `cli/create-tenant.ts` output, `tenant-provisioning.test.ts`,
  deletion specs, admin UI (`tenant-detail-info-tab.tsx`,
  `provision-step-result.tsx`), admin E2E helpers
  (`api-client-types.ts`, `deletion-infrastructure.ts` incl.
  `minioBucketExists` → `storageBucketExists`).
- **Design**: pure identifier rename of params/vars/selects/messages;
  no logic change. Migration + down-migration per §3.4.

## 6. File Map

> All paths relative to project root. Old → new names listed explicitly.

### 6.1 Files to Create

| Path | Purpose | Size |
| --- | --- | --- |
| `services/core-api/src/lib/storage-env-guard.ts` | Dual fail-fast guard (canonical FR-004 stale-key list: `MINIO_*` + `SILO_*` → `STORAGE_*` errors; `MINIO_ROOT_*` excluded) used by `parseConfig` (≈30 lines) | S |
| `services/core-api/src/__tests__/tenant-bucket-migration.int.test.ts` | Canonical migration tests (seeded up+down: populated values + uniqueness + down-restore + `pg_indexes` zero-`minio` assertion; cross-ref Phase 3 task 2 + gates §8.2/§8.4) | S |
| `services/core-api/prisma/migrations/NNN_rename_minio_bucket_to_storage_bucket/migration.sql` | Up-migration `RENAME COLUMN minio_bucket → storage_bucket` + index rename (number = next free after `010_…`) | S |
| `.forge/knowledge/adr/adr-034-silo-object-storage.md` (amended, not new) | Rule-5 ADR: swap + neutral rename + DB/API rename, pin table, #77 exception, rollback | M (done — this pass) |

### 6.2 Files to Modify — renames (old → new) + import updates

| Old path | New path | Change |
| --- | --- | --- |
| `services/core-api/src/lib/minio-client.ts` | `services/core-api/src/lib/storage-client.ts` | §5.3 (env plumbing + symbols; npm `minio` import kept E2) |
| `services/core-api/src/modules/admin/services/health-check-minio.ts` | `services/core-api/src/modules/admin/services/health-check-storage.ts` | §5.4 |
| `services/core-api/src/__tests__/smoke-minio.test.ts` | `services/core-api/src/__tests__/smoke-storage.test.ts` | §5.5 (setup env rename only) |
| (superseded, never shipped) `silo-env-guard.ts` / `SILO_*` names in prior plan | `services/core-api/src/lib/storage-env-guard.ts` / `STORAGE_*` | Dual guard per §5.2 |

### 6.3 Files to Modify — code + runtime contract + tests + DB/API rename

| Path | Section | Change | Effort |
| --- | --- | --- | --- |
| `infra/compose/docker-compose.platform-services.yml` | `minio:` block + `volumes:` | §5.1 (repin + rename + FR-003 indirection; E1/E3 allowlisted strings only) | S |
| `services/core-api/prisma/schema.prisma` | `Tenant` model (~L29) | `minioBucket @map("minio_bucket")` → `storageBucket @map("storage_bucket")` | S |
| `packages/api-types/src/admin/tenant.ts` | L47/L68 | admin tenant field `minioBucket` → `storageBucket` (breaking) | S |
| `services/core-api/src/lib/config.ts` | `// MinIO` block + `parseConfig` head | §5.2 (schema rename + 1-line guard call; stays ≤ 200 lines) | S |
| `services/core-api/src/lib/ci-runtime-contract.ts` | `RuntimeConfig` iface + host error | `MINIO_ENDPOINT` → `STORAGE_ENDPOINT`, message update | S |
| `services/core-api/src/lib/ci-runtime-env-config.ts` | Audit only (verified 2026-09-16: 21 lines, no storage keys present — no `MINIO_*`/`SILO_*`/`STORAGE_*`; no change required) | Audited, no change | S |
| `services/core-api/src/modules/admin/services/health-checker.service.ts` | import + registry | import path, `{ name: 'storage', run: probeStorage }` | S |
| `services/core-api/src/__tests__/helpers/db-storage.helpers.ts` | dynamic imports | `storage-client.js` path | S |
| `services/core-api/src/__tests__/helpers/reachability.helpers.ts` | config key | config key only (`/minio/health/live` path kept) | S |
| `services/core-api/src/__tests__/tenant-provisioning.test.ts` | imports + `result.minioBucket` assertion | import path + `storageBucket` assertion + config key | S |
| `services/core-api/src/__tests__/admin/tenant-{provision,delete,suspend,reactivate}.routes.int.test.ts` | `minio-client.js` imports | path only | S |
| `services/core-api/src/__tests__/unit/config-security.test.ts` | fixture | `STORAGE_*` keys | S |
| `services/core-api/src/__tests__/unit/config-tenant-db-cache.test.ts` | fixture | `STORAGE_*` keys | S |
| `services/core-api/src/__tests__/unit/ci-runtime-contract-fixtures.ts` | keys + container DNS | `STORAGE_*`; `http://minio:9000` → `http://storage:9000` | S |
| `services/core-api/src/__tests__/unit/ci-runtime-host-contract.test.ts` | R10 block | describe text + `STORAGE_ENDPOINT` keys/messages | S |
| `services/core-api/src/modules/plugin/routes/marketplace.routes.ts` | import | path only | S |
| `services/core-api/src/modules/tenant/tenant-provisioning.ts` | imports + `minioBucket` params/vars/logs | path + `storageBucket` throughout (FR-013) | S |
| `services/core-api/src/modules/user-profile/service.ts` | import | path + `minioUploadAvatar` alias → `storageUploadAvatar` | S |
| `services/core-api/src/modules/tenant-settings/service-branding.ts` | import | path only | S |
| `services/core-api/src/modules/admin/services/tenant-provision.service.ts` | imports + `minioBucket` const/conflict check | import path; `storageBucket` vars; conflict message neutral | S |
| `services/core-api/src/modules/admin/services/deletion-step-bucket-delete.ts` | comments + import | import path; comments neutral | S |
| `services/core-api/src/lib/tenant-schema.ts` | `minioBucket` params | `storageBucket` params (FR-013) | S |
| `services/core-api/src/modules/admin/services/deletion-context.service.ts` | select + `tenant.minioBucket` | `storageBucket` select/fallback (FR-013) | S |
| `services/core-api/src/modules/admin/services/deletion-step-gdpr-purge.ts` | `minioBucket: null` | `storageBucket: null` (FR-013) | S |
| `services/core-api/src/modules/admin/services/tenant-detail.service.ts` | select + type + mapping | `storageBucket` throughout (FR-013) | S |
| `services/core-api/src/cli/create-tenant.ts` | output line | `MinIO bucket:` → neutral `Storage bucket:` + `result.storageBucket` | S |

### 6.4 Files to Modify — CI / scripts / e2e / env / docs

| Path | Change | Effort |
| --- | --- | --- |
| `docker-compose.ci.yml` | `minio:` service entry → `storage:` | S |
| `.github/actions/docker-infra/action.yml` | inputs `minio-access-key`/`minio-secret-key` → `storage-*`; all access/secret env mappings → `STORAGE_*`; neutral descriptions | S |
| `.github/workflows/ci.yml` | `minio-access-key:`/`minio-secret-key:` input names → `storage-*`; `env.MINIO_*` refs → `env.STORAGE_*` | S |
| `.github/actions/docker-infra/scripts/ci-runtime-compose.sh` | guards, `MINIO_HOST_URL`/`MINIO_ENDPOINT`/`MINIO_PUBLIC_ENDPOINT`/`MINIO_ACCESS_KEY` keys (+ any `SILO_*` if introduced) → `STORAGE_*`; container DNS `http://storage:9000`; error strings | S |
| `.github/actions/docker-infra/scripts/ci-runtime-env.sh` | `MINIO_HOST_URL` key + `MINIO_ENDPOINT` export → `STORAGE_*` | S |
| `.github/actions/docker-infra/scripts/ci-test-env-guard.sh` | secret-name list → `STORAGE_ACCESS_KEY STORAGE_SECRET_KEY` | S |
| `.github/actions/docker-infra/scripts/generate-ci-runtime-secrets.sh` | key names → `STORAGE_*` (24/32-byte hex rules identical) | S |
| `.github/actions/docker-infra/scripts/publish-plugin-assets.sh` | comments, `MINIO_*` guards/exports, `ps -q minio` → `ps -q storage`, error strings → `STORAGE_*` | S |
| `.github/actions/docker-infra/scripts/verify-concurrent-ci-runtime.sh` | shell var names, comment, exports → `STORAGE_*` (entropy rules identical) | S |
| `.github/actions/docker-infra/scripts/wait-services.sh` + `start-services.sh` + `verify-health.sh` | service-name args `minio` → `storage` | S |
| `*.test.sh` under `.github/actions/docker-infra/scripts/` | `MINIO_*`/`SILO_*` fixtures/assertions/`changeme`+`minioadmin` guards → `STORAGE_*` (format rules identical) | S |
| `services/core-api/scripts/check-test-env.sh` | `MINIO_` grep pattern, strict `required_env`, endpoint var + probe block → `STORAGE_*`/neutral (`/minio/health/live` path kept unless Phase-1 probe change) | S |
| `scripts/run-web-e2e-production.sh` | `MINIO_*` exports + `VITE_PLUGIN_ASSET_ORIGIN` source → `STORAGE_*`; default access-key value `minioadmin` → `storageadmin` | S |
| `scripts/e2e-production-assets.sh` | guards → `STORAGE_*` | S |
| `scripts/upload-crm-ui-assets.sh` | guards/args → `STORAGE_*` | S |
| `e2e/playwright-base.ts` | defaults → `STORAGE_*` (default access value → `storageadmin`) | S |
| `e2e/ci-runtime-manifest.ts` | `MINIO_HOST_URL` schema key → `STORAGE_HOST_URL` | S |
| `e2e/keycloak/admin-api.test.ts` | `MINIO_HOST_URL` fixture → `STORAGE_HOST_URL` | S |
| `apps/web/src/lib/ci-runtime-manifest.test.ts` + `playwright-contract.test.ts` + `keycloak-admin-api-manifest.test.ts` | `MINIO_HOST_URL` fixtures/snapshots → `STORAGE_HOST_URL` | S |
| `apps/admin/e2e/helpers/deletion-infrastructure.ts` | `MINIO_ENDPOINT`/`MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY` → `STORAGE_*`; `minioBucketExists` → `storageBucketExists`; `minioBucket` selects → `storageBucket` | S |
| `apps/admin/e2e/helpers/api-client-types.ts` | `minioBucket` fields → `storageBucket` | S |
| `apps/admin/e2e/005-07-deletion.spec.ts` | `minioBucketExists`/`result.minioBucket` → `storageBucket*` | S |
| `apps/admin/e2e/005-09-health-check.spec.ts` | `EXPECTED_SERVICES` `'minio'` → `'storage'` | S |
| `apps/admin/src/lib/playwright-contract.test.ts` | host.env snapshot `MINIO_HOST_URL` → `STORAGE_HOST_URL` | S |
| `apps/admin/src/components/tenants/tenant-detail-info-tab.tsx` | `t.minioBucket` binding → `t.storageBucket`; neutral label | S |
| `apps/admin/src/components/tenants/provision-step-result.tsx` | `data.minioBucket` → `data.storageBucket`; neutral label | S |
| `.env.example` | Object-storage section → neutral `STORAGE_*` keys + FR-003 indirection note; zero `MINIO_*`/`SILO_*`; default access key neutral (`storageadmin`) | S |
| `README.md` | MinIO refs → neutral storage (+ `docker compose … storage …` service names; image ref only where required) | S |
| `AGENTS.md` | stack row + env table → neutral storage rows (`STORAGE_*`) | S |
| `.forge/constitution.md` | storage row → neutral wording **only if touched**; via amendment entry (do not edit article text directly) | S |
| `pnpm-workspace.yaml` | L36-38 override comment refresh only: new-server context, client unchanged, re-evaluated 2026-09-16, review expiry 2027-03-16; override values untouched | S |

### 6.5 Explicitly NOT touched

| Path / item | Reason |
| --- | --- |
| `services/core-api/package.json` `"minio": "^8.0.0"` + lockfile | SDK kept (E2, binding NG-1) |
| `import … from 'minio'` inside `storage-client.ts` | E2 allowlist |
| Compose LHS `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` (+ valued-from `${STORAGE_*}`) | E3 allowlist — server-consumed mapping targets |
| `pgsty/silo:tag@digest` image ref (compose `image:` + ADR/pin table + report pin table) | E1 allowlist |
| `/minio/health/live` path strings, `minio_*` metric names, `.minio.sys` marker | Server-owned/server-observed, unchanged upstream (scope break if renamed; observed, recorded in report — never adopted as identifiers) |
| `.forge/specs/009-…/tech-spec.md` pin table + old plans/tasks/sprints/reviews, `docs/archive/*`, this spec's mapping tables, ADR change log | History is not rewritten (spec US-002 exemption; excluded from the zero-match gate) |
| `docs/01-SPECIFICHE.md` / `docs/02-ARCHITETTURA.md` MinIO mentions | Italian product docs, not setup/operator instructions; update only trivially safe bucket-lifecycle wording, else file follow-up and cite in report |
| `.forge/architecture/architecture.md` MinIO references (context diagram + §1.2 external-deps row + §5.5 MinIO section + §8.1 infra boxes + §1.3 trust note) | FOLLOW-UP (docs debt, not this PR): update to neutral storage references or file a docs-debt item with owner + date; record the choice in the implementation report |
| `dist/**` build output | Generated |

### 6.6 Files to Delete — none. Files to Reference — constitution, spec 011, ADR-034, spec-009 pin table (historical context only).

## 7. Dependencies

### 7.1 New — none. (`pgsty/silo` is a container image, not a package dependency; `minio@8.0.7` stays; Prisma migration uses the existing toolchain.)

### 7.2 Internal — storage client consumers (§6.3 import sites); Prisma migration toolchain; `@plexica/api-types` admin tenant contract (breaking — coordinated admin frontend release, see §8.5); CI docker-infra action + workflow; e2e manifest/playwright-base chain; admin health + deletion E2E.

## 8. Implementation Phases

### Phase 1: Repin + verify server behavior (prove the foundation first)

**Objective**: New server running locally with argv/healthcheck verified before any rename.

**Modify**: `infra/compose/docker-compose.platform-services.yml` — image line ONLY (keep `minio` names temporarily).
**Tasks**:
1. [ ] Set image to the §2 pin; `docker compose config` renders valid (US-001). Digest reused from prior resolution; re-confirm tag+digest at implementation time per spec Q-2.
2. [ ] `docker compose up -d storage…/minio`; verify `command: server /data --console-address ":9001"` boots under the new binary (log check).
3. [ ] Verify `mc ready local` passes via bundled alias; if missing, adopt fallback server-native probe NOW and record (compose healthcheck + `check-test-env.sh` must match).
4. [ ] Record argv/healthcheck findings for the ADR implementation report. **Rollback trigger**: image fails to boot or neither probe works → stop, roll back image line, report.

### Phase 2: Core rename (compose + config + guard + client + probe + smoke)

**Objective**: API + storage stack fully neutrally named with dual fail-fast guard.

**Create**: `services/core-api/src/lib/storage-env-guard.ts`.
**Modify**: compose (§5.1 full rename + FR-003 indirection), `config.ts`, `ci-runtime-contract.ts`, `minio-client.ts`→`storage-client.ts`, `health-check-minio.ts`→`health-check-storage.ts`, `health-checker.service.ts`, `smoke-minio.test.ts`→`smoke-storage.test.ts`, all §6.3 core/test import + fixture sites.
**Tasks**:
1. [ ] Compose full rename + indirection; `docker compose config` valid; fresh ephemeral `storage_data` boots locally.
2. [ ] Config schema + dual guard; assert `config.ts` ≤ 200 lines (`wc -l`); negative tests: set stale `MINIO_ENDPOINT` → fail-fast naming `STORAGE_ENDPOINT`; set stale `SILO_ACCESS_KEY` → fail-fast naming `STORAGE_ACCESS_KEY`. No shim.
3. [ ] Client/probe/smoke renames; `tsc` + lint green.
4. [ ] Run `smoke-storage.test.ts` green against local server. **Rollback trigger**: smoke red after forward-fix attempt → §8.3 rollback.
5. [ ] Zero-match gate (draft — canonical 3 scriptable searches, run after
    implementation over own code/config/scripts/docs, excluding history
    paths `ARCHIVE/**`, `.forge/specs/**`, `.forge/sprints/**/archive/**`,
    `.forge/knowledge/adr/**` change-log/mapping-table sections):
    (1) `MINIO_|SILO_` (case-sensitive stale host-var/vendor-prefix sweep;
    justifications: E1 image ref, E3 compose-LHS mapping targets, history-path excludes);
    (2) `minioBucket|minio_bucket|minioadmin` (case-sensitive persisted-field/default-key sweep;
    `minioadmin` covered only by the `storageadmin` replacement + history excludes;
    `minioBucket` has NO allowlist cover — must be zero);
    (3) case-insensitive `minio|silo` (broad residual sweep incl. `minio/` routes,
    `minio_data`, `silo_data`, `siloadmin`; justifications: E1 image ref, E2 npm `minio`
    import + `package.json`/lockfile entries, E3 compose-LHS keys, server-observed runtime
    strings observed, recorded in report, history-path excludes).
    → matches only E1–E3 + history + server-observed strings (each justified in report;
    wording unified to "observed, recorded in report").

### Phase 3: DB/API rename — migration + contract + readers/writers (breaking)

**Objective**: `storageBucket` end-to-end with tested rollback.

**Create**: Prisma migration dir (§3.4).
**Modify**: `schema.prisma`, `packages/api-types/src/admin/tenant.ts`, all §5.6 readers/writers, admin UI components, admin E2E helpers/specs, `tenant-provisioning.test.ts`, `create-tenant` CLI.
**Tasks**:
1. [ ] Write up-migration + down-migration (§3.4); `prisma validate` clean.
2. [ ] Migration tests at canonical `services/core-api/src/__tests__/tenant-bucket-migration.int.test.ts` green on seeded DB (values intact 1:1, uniqueness carried over, `pg_indexes` zero-`minio` assertion with pre/post names recorded, `migrate status` clean); down-migration restores prior name + values.
3. [ ] Rename all readers/writers + admin UI + E2E helpers; `tsc` green; grep `minioBucket|minio_bucket|minioadmin` → zero matches outside history + E1–E3 (which do not cover `minioBucket`).
4. [ ] **Smoke re-run gate (binding, spec US-003/NFR-001):** AFTER the readers/writers rename, re-run `smoke-storage` PLUS the provisioning/lifecycle integration suites green; on red, roll back per §8.3 (≤ 5-step procedure).
5. [ ] **Deploy-ordering sign-off (human, required before merge — see §8.5)**: coordinated API + admin-frontend release agreed; no alias per edge #12. **Rollback trigger**: migration-test red, smoke re-run red, or ordering unsigned → stop, do not merge.

### Phase 4: CI plumbing + scripts + E2E helpers + docs

**Objective**: CI runtime contract end-to-end `STORAGE_*`; no stale name outside history-excluded + server-observed zones (observed, recorded in report).

**Modify**: `docker-compose.ci.yml`, `action.yml`, `.github/workflows/ci.yml`, all `.github/actions/docker-infra/scripts/*.sh` + `*.test.sh`, `scripts/*.sh`, `check-test-env.sh`, `e2e/*`, `apps/*/e2e + contract tests`, `.env.example`, `README.md`, `AGENTS.md`, constitution row (+ amendment entry), `pnpm-workspace.yaml` comment.
**Tasks**:
1. [ ] Rename keys/inputs/service names; container DNS `http://storage:9000`; secret entropy rules unchanged; `storageadmin` default sentinel.
2. [ ] Run every `*.test.sh` green locally; `verify-concurrent-ci-runtime` semantically unchanged.
3. [ ] Host/container manifest round-trip produces `STORAGE_*` keys both sides.
4. [ ] Final zero-match gate (§Phase 2.5) repeated over the full tree + `minioBucket` gate from Phase 3.
5. [ ] Fresh-`docker compose up` from docs: service healthy, `check-test-env.sh` passes (US-004).

### Phase 5: Proof + report (no new tests unless a gap is found)

**Objective**: S3-compat certified; #77 exception recorded.

**Tasks**:
1. [ ] Proof in order (§8.2 — incl. post-Phase-3 smoke + provisioning/lifecycle re-run at §8.2 steps 2–3); any red step → forward-fix once, else rollback (§8.3).
2. [ ] Implementation report: tag/digest/verification table (§2), argv+`mc`-alias findings, E1–E3 inventory, canonical 3-search zero-match gate evidence (`MINIO_|SILO_`, `minioBucket|minio_bucket|minioadmin`, case-insensitive `minio|silo`; history-path excludes; E1–E3 + server-observed justifications, wording "observed, recorded in report"), pre/post `pg_indexes` names, suite results (smoke re-run post-Phase-3 + provisioning/lifecycle integration + E2E + canonical migration tests at `services/core-api/src/__tests__/tenant-bucket-migration.int.test.ts`), old-vs-new P95 table or absolute < 200ms per endpoint (§8.2 step 5), actual compose `:-` secret defaults + no-weak-secret assertion, #77 NOT-fixed statement + expiry 2027-03-16, `architecture.md` drift follow-up choice, deploy-ordering + maintenance-window sign-off record.
3. [ ] Confirm Dependabot #77 still open (or closed only as documented exception).

## 8. Testing Strategy (Proof Strategy)

### 8.1 Unit Tests (existing, renamed fixtures — no new files except migration tests)

| Component | Test Focus |
| --- | --- |
| `parseConfig` + `storage-env-guard` | `STORAGE_*` parse OK; each stale `MINIO_*` → startup error naming the `STORAGE_*` replacement; each stale `SILO_*` → same |
| `validateCiRuntimeContract` | `STORAGE_ENDPOINT` strict-loopback host rule; container DNS `http://storage:9000` accepted |
| Contract/manifest suites | `STORAGE_HOST_URL` keys round-trip (`apps/web`, `apps/admin` contract tests, `keycloak-admin-api-manifest`) |
| `*.test.sh` CI script suites | Renamed secret-name assertions, identical entropy/format rules |
| Prisma migration tests (new, §3.4, canonical `services/core-api/src/__tests__/tenant-bucket-migration.int.test.ts`) | Seeded DB: values intact 1:1, uniqueness carryover, `pg_indexes` zero-`minio` + pre/post names recorded, `migrate status` clean, down-migration restores |

### 8.2 Proof order (each gate must pass before the next starts)

1. Prisma migration tests green at canonical `services/core-api/src/__tests__/tenant-bucket-migration.int.test.ts` (seeded DB up + down, §3.4 incl. `pg_indexes` zero-`minio` assertion).
2. `services/core-api/src/__tests__/smoke-storage.test.ts` — bucket CRUD (`bucketExists`/`makeBucket`/`putObject`/`listObjects`/`removeObject`) vs local new server; **re-run green AFTER the Phase-3 readers/writers rename (binding per spec US-003/NFR-001); on red, roll back per §8.3**.
3. Core-API integration: tenant bucket lifecycle incl. GDPR erasure batching (`tenant-delete.routes.int.test.ts`, provisioning/tenant-settings logo suites), avatar/logo upload + presigned reads (`tenant-settings-logo-upload`, marketplace routes) — **re-run green post-Phase-3 alongside the smoke re-run**.
4. E2E storage flows: `apps/web/e2e/user-profile.spec.ts` (avatar), `apps/web/e2e/tenant-settings.spec.ts` (branding/logo), marketplace presigned-asset reads covered by `apps/web/e2e/marketplace-assets.spec.ts` — **that spec does not exist as of 2026-09-16; if it still does not exist or does not cover presigned reads, the gap is explicitly recorded as an accepted gap in the implementation report with rationale (mirrored from spec US-003/NFR-001), not silently assumed covered** — admin `005-07-deletion` (bucket gone) + `005-09-health-check` (`storage` card green).
5. Full CI (unit + integration + E2E) green = merge gate (Rule 2). P95 minimal procedure (mirrored from spec NFR-002): reuse the covered-endpoint timings (avatar/logo upload, presigned-URL issue, bucket-lifecycle endpoints) from the same suite run old-server vs new-server, and publish either an old-vs-new comparison table (ΔP95 within ±10%) or absolute P95 < 200ms per endpoint in the implementation report.

### 8.3 Rollback trigger (≤ 5 steps, incl. DB)

Rollback trigger: any proof step in §8.2 red without a forward fix inside the implementing PR → execute ADR-034's 5-step rollback and report which gate fired (in particular: migration-test failure, **post-Phase-3 smoke re-run red**, provisioning/lifecycle re-run red, E2E storage-flow failure, or `mc ready local` + fallback probe both failing):

1. Repin the storage service image to the prior `minio/minio:RELEASE.2024-01-16T16-07-38Z@sha256:4c4a…` digest.
2. Restore/rename the volume back (`storage_data` → `minio_data`, reverse of the rename/copy — `.minio.sys` is readable by both).
3. Apply the DB down-migration (`storage_bucket` → `minio_bucket`, values intact) — combined into this sequence; total procedure stays ≤ 5 steps (down-migration + repin + volume restore + revert commit + smoke green).
4. Restore the pre-change compose/env/scripts/code from version control (single revert commit) and `docker compose up -d --wait storage…/minio` (service name per the restored file); confirm readiness probe passes.
5. Run migration tests + `smoke-storage…/smoke-minio` (per restored tree) green → rollback complete; report which proof step triggered the rollback.

Prod volume step is one-time rename/copy with restore documented; dev/CI volumes are disposable. Rollback is smoke-verified in CI or documented as verified (US-006).

### 8.4 Gates summary

| Gate | Command / check | Blocks |
| --- | --- | --- |
| `config.ts` ≤ 200 lines | `wc -l services/core-api/src/lib/config.ts` | Phase 2 merge |
| Dual fail-fast negative tests (a)(b)(c) | (a) stale `MINIO_ENDPOINT` → error naming `STORAGE_ENDPOINT`; (b) stale `SILO_ACCESS_KEY` → error naming `STORAGE_ACCESS_KEY`; (c) `MINIO_ROOT_*` as compose targets → NO error | Phase 2 merge |
| Zero-match gate (canonical 3 searches) | (1) `MINIO_\|SILO_`; (2) `minioBucket\|minio_bucket\|minioadmin`; (3) case-insensitive `minio\|silo` → only E1–E3 + history excludes + server-observed (observed, recorded in report) | Phase 4 merge |
| Migration tests (canonical path) | `services/core-api/src/__tests__/tenant-bucket-migration.int.test.ts`: seeded up + down, values intact, `pg_indexes` zero-`minio`, status clean | Phase 3 merge |
| Smoke re-run post-Phase-3 | `smoke-storage` + provisioning/lifecycle integration re-run green AFTER readers/writers rename; rollback on red | Phase 3 merge |
| Full CI green | unit + integration + E2E (§8.2) | Merge (Rule 2) |

### 8.5 Deploy ordering (breaking admin API + DB column — human sign-off required)

**Binding deploy rule (mirrored VERBATIM from spec edge #10 / US-006 — not task order advice):**
the API MUST be STOPPED during the column migration (maintenance window);
rolling mixed-version operation (old code on `minio_bucket` alongside new code
on `storage_bucket`) is FORBIDDEN. Phases 1–4 land as ONE atomic PR
(phases = task order, not merge units); Phase-3 merge is BLOCKED without
deploy-ordering + maintenance-window sign-off.

The `minioBucket` → `storageBucket` admin-contract rename is breaking with **no alias** (edge #12). Required coordination:

- API + admin frontend ship in the **same coordinated release** (backend response change + `packages/api-types` + admin UI + E2E helpers are one atomic change).
- Deploy order (proposed, needs human confirmation): migrate DB → deploy API → deploy admin frontend → run deletion/health E2E; stale consumers surface via contract-test failure, never silent.
- **Remaining human sign-off**: confirm (or amend) this ordering before merge. Record the decision in the implementation report. Do not merge Phase 3 without it.

## 9. Architectural Decisions

| ADR | Decision | Status |
| --- | --- | --- |
| ADR-034 | Neutral-vocabulary swap (`pgsty/silo` pinned, E1–E3) + FR-003 indirection + dual fail-fast + FR-013 DB/API rename with Rule-5 data-model coverage; SDK kept; AWS-SDK migration rejected; #77 documented exception to 2027-03-16 | Proposed (this plan implements it; human accept pending) |

## 10. Requirement Traceability

| Requirement | Plan Section | Implementation Path |
| --- | --- | --- |
| FR-001 (pinned `pgsty/silo`, no `minio/minio` in compose) | §2, §5.1, Phase 1 | compose repin + `config` render check |
| FR-002 (neutral rename: service/volume/env/files/symbols) | §5.1–5.5, §6.2–6.4, Phases 2+4 | compose + `STORAGE_*` + `storage_data` (+ `storageadmin` default) |
| FR-003 (container-key indirection `MINIO_ROOT_*` ← `${STORAGE_*}`) | §5.1, §6.2–6.4 | compose LHS mapping targets; code never reads `MINIO_ROOT_*`; documented in `.env.example` + ADR |
| FR-004 (config/client/probe/guard/contract `STORAGE_*` + dual fail-fast, frozen surface) | §5.2–5.4, Phase 2 | `storage-env-guard.ts`, `storage-client.ts`, `health-check-storage.ts` |
| FR-005 (CI scripts + action.yml → `STORAGE_*`) | §6.4, Phase 4 | docker-infra scripts + `*.test.sh` + workflow |
| FR-006 (shell scripts incl. probe path) | §6.4, Phase 4 | `scripts/*.sh`, `check-test-env.sh` |
| FR-007 (e2e helpers/manifests/snapshots + `storageBucket`) | §5.6, §6.4, Phases 3–4 | `e2e/*`, admin helpers, contract tests |
| FR-008 (`.env.example`/README/AGENTS/constitution neutral) | §6.4, Phase 4 | docs + amendment entry |
| FR-009 (healthcheck/argv verified) | §2, Phase 1 | `mc`-alias + argv verification w/ fallback |
| FR-010 (volume rename/copy + ≤5-step rollback) | §3, §8.3, ADR-034 | one-time prod step, ephemeral dev/CI |
| FR-011 (ADR coverage swap + data model, Rule 5) | §9, ADR-034 (amended) | done in this pass (Proposed; human accept pending) |
| FR-012 (#77 re-evaluation) | §6.4, Phase 5 | workspace comment + report, expiry 2027-03-16 |
| FR-013 (Prisma migration `minio_bucket` → `storage_bucket` + contract + readers/writers) | §3, §4, §5.6, Phase 3 | migration + down-migration + atomic rename |
| NFR-001 (suites 100% green + migration tests) | §8.1–8.2 | proof order gates |
| NFR-002 (P95 parity) | §8.2(5) | baseline-or-absolute report |
| NFR-003 (secrets/TTL/isolation/erasure frozen) | §3, §5.3 | no-change verification + GDPR suites green |
| NFR-004 (digest pin + healthcheck + rollback) | §2, §5.1, §8.3 | pin table, probe parity, 5-step rollback incl. DB |
| NFR-005 (mechanical, ≤200 lines) | §5.2 (guard split), Phase 2 gate | `wc -l` check on `config.ts` (198-line constraint) + new guard module |
| NFR-006 (#77 expiry ≤6 months) | §6.4, Phase 5 | 2026-09-16 → 2027-03-16 |
| NFR-007 (data safety: values preserved, transactional rename, backup, down-migration) | §3.4, §8.1–8.3 | seeded-DB tests + backup step + verified rollback |

## 11. Constitution Compliance

Re-checked 2026-09-16 against Constitution v1.1 (last amendment Aug 2026: Confluent Kafka client). Articles below are the actual 6 Rules + Tech Stack + Architecture + Quality + Security.

| Article | Status | Notes |
| --- | --- | --- |
| Rule 1 — E2E for every feature | COMPLIANT | No new E2E: avatar (`user-profile.spec.ts`), logo (`tenant-settings.spec.ts`), marketplace presigned reads, tenant lifecycle/GDPR erasure, admin deletion/health already cover storage; migration tests (not E2E) cover FR-013; new spec only if a gap is found (§8.2). |
| Rule 2 — No merge without green CI | COMPLIANT | §8.2 gates (migration tests + smoke + integration + E2E) are the merge condition; §8.3 rollback trigger on any red gate. |
| Rule 3 — One pattern per operation | COMPLIANT | Single SDK client wrapper preserved (neutral filename/symbols); no `@aws-sdk/client-s3`, no new storage abstraction. |
| Rule 4 — No file above 200 lines | COMPLIANT (with constraint) | Rename is line-neutral everywhere; `config.ts` (198/200, verified this pass) gets +1 line only — the dual fail-fast guard is a new ≈30-line module `storage-env-guard.ts` (§5.2). Phase-2 `wc -l` gate enforces. All other touched code files far below the limit (client 170, probe 10, smoke 78, contract 123). |
| Rule 5 — ADR for significant decisions | COMPLIANT | ADR-034 amended in this pass: covers infra swap + neutral rename + FR-013 data-model change (no new core dep since SDK kept). Status Proposed until human accepts. |
| Rule 6 — English commit messages | COMPLIANT | Process requirement on the implementing PR; unchanged. This pass makes no commits. |
| Tech Stack (Object Storage row) | AMENDED | Storage row `MinIO ^8` → neutral server + kept minio SDK via constitutional amendment entry (§6.4). |
| Architecture (monolith, no new infra pattern) | COMPLIANT | Compose-only swap; no new service type, no microservice, no Helm/operator (NG-3). |
| Quality (coverage ≥80%, P95 <200ms) | COMPLIANT | Existing suites reused (coverage intact) + migration tests added; P95 parity reported per §8.2(5). |
| Security 1–6 | COMPLIANT | Tenant isolation (bucket-per-tenant), Keycloak auth, parameterized queries (incl. raw `RENAME COLUMN` DDL with static identifiers — no interpolation), Zod validation (extended by dual fail-fast guard), env-only secrets, no PII in logs — all frozen/preserved; secret entropy rules unchanged; presigned TTL 3600 s preserved. |

## 12. Risk Table (deltas vs superseded plan marked ◆)

| # | Risk | Likelihood / Impact | Mitigation |
| --- | --- | --- | --- |
| R-1 | Prod volume rename loses data or orphans `.minio.sys` | Low / Critical | One-time rename/copy (not recreate); new server reads `.minio.sys` natively (upstream contract); rollback = repin + volume restore; dev/CI never migrate (fresh volumes). |
| R-2 | New-server binary rejects `server /data` argv | Low / High | Argv contains no binary name; upstream keeps the same server command; Phase-1 boot verification before any rename; fallback = explicit `command:` update recorded in report. |
| R-3 | `mc ready local` alias missing in pinned image | Low / High | Upstream ships `mcli` + `mc` alias in the classic image (distroless deliberately NOT chosen); Phase-1 verification; fallback = server-native probe in compose + `check-test-env.sh` consistently. |
| R-4 | Stale developer `.env` (`MINIO_*` or `SILO_*`) silently misconfigures | Medium / Medium | Dual fail-fast guard (§5.2) with migration errors naming `STORAGE_*` replacements; no shim (would violate US-002). ◆ expanded: `SILO_*` from the superseded plan also rejected. |
| R-5 | Server renames `/minio/*` routes or `minio_*` metrics | Very low / High | Server-owned/server-observed (§6.5); observed, recorded in report — never adopted as identifiers; any change = scope break → stop + re-review (spec edge #6). |
| R-6 | Missed `MINIO_*`/`SILO_*` in CI/e2e breaks a pipeline path | Medium / Medium | Phase-2/4 zero-match gates with explicit E1–E3 + history exemption list; `*.test.sh` suites + manifest round-trip in Phase 4; full CI green is the merge gate. ◆ expanded to dual-vocabulary search. |
| R-7 | `config.ts` breaches 200 lines via the guard | Low / Medium | Guard lives in its own module (§5.2); Phase-2 `wc -l` gate. ◆ tightened: dual-map guard is larger — extra reason it must NOT be inlined (198-line constraint re-verified this pass). |
| R-8 | Health service-key rename (`minio`→`storage`) breaks a dashboard/alert consumer | Low / Medium | Single known consumer (admin health UI + `005-09` spec) updated in the same change; grep for service-key consumers in Phase 2. ◆ renamed target is now `storage`. |
| R-9 ◆ NEW | DB migration fails on populated DBs or loses values | Low / Critical | Transactional `RENAME COLUMN` (no rewrite); seeded-DB migration tests (values 1:1, uniqueness, status clean); pre-migration backup; tested down-migration; deploy in maintenance window or document ordering (spec edge #10). |
| R-10 ◆ NEW | Alias-less breaking rename strands admin consumers (`minioBucket`) | Medium / High | No alias by order (edge #12); coordinated API+frontend release; contract tests fail loudly on stale usage; human deploy-ordering sign-off required before merge (§8.5). |
| R-11 ◆ NEW | Key indirection (`MINIO_ROOT_*` ← `${STORAGE_*}`) misconfigured | Low / High | Compose LHS mapping is the only `MINIO_ROOT_*` occurrence; code never reads `MINIO_ROOT_*` (grep-gated); documented in `.env.example` + ADR; `docker compose config` render check in Phase 2. |
| R-12 | #77 misread as "fixed by server swap" | Low / Medium | Report states NOT-fixed; alert stays open; comment carries re-evaluation 2026-09-16 + expiry 2027-03-16 (Phase 5 gate). |

---

## Cross-References

| Document | Path |
| --- | --- |
| Spec | `.forge/specs/011-silo-object-storage/spec.md` (binding scope change 2026-09-16 — this plan aligns to it) |
| Architecture | `.forge/architecture/architecture.md` |
| Tasks | <!-- Created by /forge-tasks --> |
| Constitution | `.forge/constitution.md` (v1.1) |
| ADRs | `.forge/knowledge/adr/adr-034-silo-object-storage.md` (amended — neutral + Rule-5 data-model coverage) |
| Upstream compat | silo.pgsty.cc, `pgsty/silo` README, Docker Hub `pgsty/silo` (read 2026-09-16) |
| Issues | #175 (storage-server swap), #77 (stream-json exception, NOT fixed) |
