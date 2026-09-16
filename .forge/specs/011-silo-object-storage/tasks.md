# Tasks: 011 - Object Storage Server Swap (Solution-Agnostic Rename)

> Ordered task breakdown with parallelism markers and requirement traceability.
> Created by `forge-scrum` via `/forge-tasks`.

| Field   | Value |
| ------- | ----- |
| Status  | Pending |
| Author  | forge-scrum |
| Date    | 2026-09-16 |
| Spec    | `.forge/specs/011-silo-object-storage/spec.md` |
| Plan    | `.forge/specs/011-silo-object-storage/plan.md` |

> **Binding scope**: solution-agnostic neutral `storage` vocabulary. Neither
> `minio` nor `silo` in own code/config/scripts/docs. Allowlist E1–E3 only:
> E1 = `pgsty/silo:<tag>@sha256:<digest>` image ref; E2 = npm `minio` import
> inside the storage client; E3 = compose LHS `MINIO_ROOT_USER` /
> `MINIO_ROOT_PASSWORD` mapping targets valued from `${STORAGE_*}`.
> **Rule 4**: no file > 200 lines — `config.ts` (198/200) gets **+1 line only**
> (guard call); dual fail-fast lives in new `storage-env-guard.ts` (~30 lines).
> **Rule 6**: ALL commit messages in English (type/scope/subject/body/footer).
> A non-English commit must be rejected and rewritten before merge.
> No code, no commits in this pass — tasks only.

---

## Legend

- `[FR-NNN]` / `[NFR-NNN]` — Requirement implemented (traceability)
- `[P]` — Parallelizable with other `[P]` tasks in the same phase
- Status: `[ ]` pending · `[x]` done · `[-]` skipped
- **Size**: `[S]` <30min · `[M]` 30min–2h · `[L]` 2–4h · `[XL]` 4h+ (split — none present)
- Each task specifies: id, files, type, description, acceptance criteria,
  dependencies, size estimate.

---

## Phase 1: Repin + verify server behavior (prove the foundation first)

> Plan §2, §5.1, §8. Image line ONLY — keep `minio` names temporarily.
> Digest `sha256:b616a0cf8cb281e7e6bb3c9b1fb53875b4016a2878223925541c18f82d6c5ca3`
> is reused from the 2026-09-16 resolution and MUST be re-confirmed at
> implementation time per spec Q-2 (tag `RELEASE.2026-09-03T13-18-01Z` era,
> classic variant, non-`latest`).

- [ ] **1.1** `[FR-001]` `[NFR-004]` Re-confirm digest + set image pin
  - **File**: `infra/compose/docker-compose.platform-services.yml`
  - **Type**: Modify existing — `image:` line only
  - **Description**: Re-confirm tag+digest via registry (spec-009 style lookup),
    set `image: pgsty/silo:RELEASE.2026-09-03T13-18-01Z@sha256:b616a0cf8…`
    (digest is authority). Keep `minio` service/volume names temporarily.
  - **Spec Reference**: Spec US-001, FR-001; Plan §2
  - **Acceptance**: `image:` is `pgsty/silo:<RELEASE-tag>@sha256:<digest>`;
    no `minio/minio` image ref remains in any compose file; verification
    method recorded for the implementation report.
  - **Dependencies**: None
  - **Estimated**: `[S]` (~20min)

- [ ] **1.2** `[FR-001]` `[FR-009]` Verify boot argv + readiness probe under new binary
  - **File**: `infra/compose/docker-compose.platform-services.yml` (verify only; edit only if fallback needed)
  - **Type**: Verify (modify only on fallback)
  - **Description**: `docker compose up` the storage service; verify
    `command: server /data --console-address ":9001"` boots (log check) and
    `mc ready local` passes via bundled `mc` alias. If alias missing, adopt
    documented server-native probe NOW (compose healthcheck +
    `check-test-env.sh` must match) and record as scope-noted fallback.
  - **Spec Reference**: Spec FR-009, edge cases #2/#3; Plan §2, Phase 1
  - **Acceptance**: Boot log clean; readiness probe passes (either `mc ready
    local` via alias or recorded native equivalent); argv/healthcheck
    findings written down for ADR/report. Rollback trigger: neither probe
    works → stop, restore image line, report.
  - **Dependencies**: Task 1.1
  - **Estimated**: `[M]` (~1h)

- [ ] **1.3** `[FR-001]` `[NFR-004]` Compose render check + pin-table record
  - **File**: `infra/compose/docker-compose.platform-services.yml` (read); report artifact
  - **Type**: Verify
  - **Description**: Run `docker compose config` render check; record
    tag/digest/variant/per-arch/verification-method table (spec-009 style)
    for the ADR + implementation report.
  - **Spec Reference**: Spec US-001 AC-3; Plan §2, Phase 1
  - **Acceptance**: `docker compose config` renders validly with the
    replacement image; pin table complete (tag, manifest-list digest,
    per-arch digests, classic variant, verification method).
  - **Dependencies**: Task 1.2
  - **Estimated**: `[S]` (~20min)

---

## Phase 2: Neutral rename wave (service/volume/env/guard/files/scripts/docs)

> Plan §5.1–§5.5, §6.2–§6.4, Phase 2 + Phase 4 (CI/scripts/docs portion pulled
> forward per task order). Pure mechanical rename + FR-003 indirection +
> FR-004 dual fail-fast. SDK call surface, bucket layout, TTLs, port defaults,
> healthcheck semantics frozen. `config.ts` +1 line only (Rule 4).

- [ ] **2.1** `[FR-002]` `[FR-003]` Compose full rename + container-key indirection
  - **File**: `infra/compose/docker-compose.platform-services.yml`
  - **Type**: Modify existing — service block + `volumes:`
  - **Description**: Service `minio:` → `storage:`; volume
    `minio_data:/data` → `storage_data:/data` (+ top-level `volumes:`);
    ports → `${STORAGE_PORT:-9000}:9000` / `${STORAGE_CONSOLE_PORT:-9001}:9001`;
    host env → `STORAGE_ENDPOINT` / `STORAGE_PUBLIC_ENDPOINT` /
    `STORAGE_ACCESS_KEY` / `STORAGE_SECRET_KEY`. Keep container keys
    `MINIO_ROOT_USER: ${STORAGE_ACCESS_KEY:-…}` and
    `MINIO_ROOT_PASSWORD: ${STORAGE_SECRET_KEY:-…}` as LHS mapping targets
    ONLY (E3) — our code never reads `MINIO_ROOT_*`.
  - **Spec Reference**: Spec US-002, FR-002, FR-003; Plan §5.1
  - **Acceptance**: `docker compose config` valid; service `storage` boots
    with fresh ephemeral `storage_data`; zero `MINIO_*`/`SILO_*` as our
    interface (only E3 LHS keys + E1 image ref remain in this file);
    actual `:-` defaults for `STORAGE_ACCESS_KEY`/`STORAGE_SECRET_KEY`
    (and their `MINIO_ROOT_*` mapping targets) recorded from
    `docker compose config` render for the report (plan §5.1 compose-secret
    gate); no weak/hardcoded secret ships (no `minioadmin`/`changeme`-class
    sentinel in committed compose).
  - **Dependencies**: Phase 1 completion (1.3)
  - **Estimated**: `[M]` (~1h)

- [ ] **2.2** `[FR-004]` Create dual fail-fast guard module (canonical stale-key list)
  - **File**: `services/core-api/src/lib/storage-env-guard.ts` (NEW, ~30 lines)
  - **Type**: Create new file
  - **Description**: `assertNoStaleStorageEnv(environment)` iterating a
    `STALE → STORAGE_*` map covering the CANONICAL list (FINAL, mirrored
    verbatim from spec FR-004 / plan §5.2 — no additions, no subtractions):
    `MINIO_ENDPOINT` → `STORAGE_ENDPOINT`, `MINIO_PUBLIC_ENDPOINT` →
    `STORAGE_PUBLIC_ENDPOINT`, `MINIO_ACCESS_KEY` → `STORAGE_ACCESS_KEY`,
    `MINIO_SECRET_KEY` → `STORAGE_SECRET_KEY`, `MINIO_PORT` → `STORAGE_PORT`,
    `MINIO_CONSOLE_PORT` → `STORAGE_CONSOLE_PORT`, `MINIO_HOST_URL` →
    `STORAGE_HOST_URL`, plus exact `SILO_*` mirrors `SILO_ENDPOINT` →
    `STORAGE_ENDPOINT`, `SILO_PUBLIC_ENDPOINT` → `STORAGE_PUBLIC_ENDPOINT`,
    `SILO_ACCESS_KEY` → `STORAGE_ACCESS_KEY`, `SILO_SECRET_KEY` →
    `STORAGE_SECRET_KEY`, `SILO_PORT` → `STORAGE_PORT`, `SILO_CONSOLE_PORT`
    → `STORAGE_CONSOLE_PORT`, `SILO_HOST_URL` → `STORAGE_HOST_URL`.
    Explicitly EXCLUDED from the guard: `MINIO_ROOT_USER` /
    `MINIO_ROOT_PASSWORD` (compose LHS mapping targets only, allowlist E3,
    FR-003 — must NOT trigger a guard error). Throw a migration error naming
    the `STORAGE_*` replacement per stale key. No silent back-compat shim.
    Keeps `config.ts` ≤ 200 lines (Rule 4).
  - **Spec Reference**: Spec US-002, FR-004, edge #4/#5; Plan §5.2
  - **Acceptance**: Module ≤ 40 lines; canonical 14-key map present verbatim;
    `MINIO_ROOT_*` excluded (no error when present as compose targets);
    every stale key maps to its `STORAGE_*` replacement in the error text;
    unit-coverable in isolation.
  - **Dependencies**: Phase 1 completion
  - **Estimated**: `[S]` (~30min)

- [ ] **2.3** `[FR-004]` `[NFR-005]` Config schema rename + guard hookup (Rule 4: +1 line only)
  - **File**: `services/core-api/src/lib/config.ts`
  - **Type**: Modify existing — `// MinIO` block + `parseConfig` head
  - **Description**: Zod schema `MINIO_*` → `STORAGE_*` (endpoint, public
    endpoint, access/secret); add exactly **one line** calling
    `assertNoStaleStorageEnv` at the top of `parseConfig`. No other logic change.
  - **Spec Reference**: Spec FR-004; Plan §5.2 (198/200-line constraint)
  - **Acceptance**: `wc -l services/core-api/src/lib/config.ts` ≤ 200;
    `STORAGE_*` parses OK; negative tests (block Phase-2 merge):
    (a) stale `MINIO_ENDPOINT` set → startup fails naming `STORAGE_ENDPOINT`;
    (b) stale `SILO_ACCESS_KEY` set → startup fails naming
    `STORAGE_ACCESS_KEY`; (c) `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD`
    present as compose mapping targets → NO guard error.
  - **Dependencies**: Tasks 2.1, 2.2
  - **Estimated**: `[S]` (~30min)

- [ ] **2.4** `[FR-004]` `[P]` Runtime-contract rename
  - **File**: `services/core-api/src/lib/ci-runtime-contract.ts`
  - **Type**: Modify existing — `RuntimeConfig` iface + host error message
  - **Description**: `MINIO_ENDPOINT` → `STORAGE_ENDPOINT`; loopback-validation
    error message updated.
  - **Spec Reference**: Spec FR-004; Plan §5.2
  - **Acceptance**: `tsc` clean on this file; strict-loopback host rule intact
    under the new key name.
  - **Dependencies**: Task 2.2
  - **Estimated**: `[S]` (~20min)

- [ ] **2.5** `[FR-004]` Rename storage client wrapper (frozen surface)
  - **File**: `services/core-api/src/lib/minio-client.ts` → `services/core-api/src/lib/storage-client.ts`
  - **Type**: Rename (git mv) + modify
  - **Description**: `config.MINIO_*` → `config.STORAGE_*`;
    `createMinioClient` → `createStorageClient`, `minio` singleton →
    `storage`, `publicMinio` → `publicStorage`, `pingMinio` → `pingStorage`,
    `minioBucket` locals/params → `storageBucket`; log strings
    "MinIO bucket …" → "Storage bucket …". KEEP
    `import { Client as MinioClient } from 'minio'` (E2 — SDK kept),
    `region: 'us-east-1'` pin, 3600s TTL, 1000-batch erasure, `listBuckets` ping.
  - **Spec Reference**: Spec US-002/US-003, FR-004; Plan §5.3
  - **Acceptance**: File ~170 lines (≤ 200); `tsc` + lint green; SDK call
    surface byte-identical except env plumbing + symbol names.
  - **Dependencies**: Task 2.3
  - **Estimated**: `[M]` (~1h)

- [ ] **2.6** `[FR-004]` `[FR-007]` `[P]` Rename health probe + registration (service key `storage` + health-key row)
  - **File**: `services/core-api/src/modules/admin/services/health-check-minio.ts` → `health-check-storage.ts`; `services/core-api/src/modules/admin/services/health-checker.service.ts`; `apps/admin/e2e/005-09-health-check.spec.ts`; `apps/admin/src/lib/playwright-contract.test.ts` (snapshot — joint with 2.11)
  - **Type**: Rename + modify
  - **Description**: `probeMinio` → `probeStorage`,
    `makeProbe('minio', …)` → `makeProbe('storage', …)`,
    `withProbeTimeout(pingStorage())`; update `EXPECTED_SERVICES` `'minio'` →
    `'storage'`. Admin health response service-key row (spec §9 / plan §4.3):
    `minio` → `storage`; contract-test snapshot in
    `apps/admin/src/lib/playwright-contract.test.ts` updated accordingly
    (traceable via FR-007). Grep for any other service-key consumers.
  - **Spec Reference**: Spec FR-004, FR-007, §9; Plan §4.3, §5.4
  - **Acceptance**: Health response service key is `storage`; `005-09` spec
    expects `storage`; contract snapshot expects `storage` host key
    (`STORAGE_HOST_URL`); no `minio` service-key consumer remains.
  - **Dependencies**: Task 2.5
  - **Estimated**: `[S]` (~30min)

- [ ] **2.7** `[FR-004]` `[P]` Rename smoke test (frozen assertions)
  - **File**: `services/core-api/src/__tests__/smoke-minio.test.ts` → `services/core-api/src/__tests__/smoke-storage.test.ts`
  - **Type**: Rename (git mv) + modify setup only
  - **Description**: `config.MINIO_*` → `config.STORAGE_*`, describe-block +
    comments reworded; bucket/object CRUD assertions
    (`bucketExists`/`makeBucket`/`putObject`/`listObjects`/`removeObject`)
    byte-identical.
  - **Spec Reference**: Spec US-003; Plan §5.5
  - **Acceptance**: File ~78 lines; assertions unchanged; suite runs against
    new server (green verified in Phase 4, task 4.2).
  - **Dependencies**: Task 2.5
  - **Estimated**: `[S]` (~20min)

- [ ] **2.8** `[FR-004]` Core import-site + fixture update wave
  - **File**: `services/core-api/src/modules/plugin/routes/marketplace.routes.ts`, `services/core-api/src/modules/tenant/tenant-provisioning.ts` (import only in this task — field rename is Phase 3), `services/core-api/src/modules/user-profile/service.ts` (`minioUploadAvatar` alias → `storageUploadAvatar`), `services/core-api/src/modules/tenant-settings/service-branding.ts`, `services/core-api/src/modules/admin/services/tenant-provision.service.ts` (import only), `services/core-api/src/modules/admin/services/deletion-step-bucket-delete.ts`, `services/core-api/src/__tests__/helpers/db-storage.helpers.ts`, `services/core-api/src/__tests__/helpers/reachability.helpers.ts` (config key only — `/minio/health/live` path kept, server-owned), `services/core-api/src/__tests__/tenant-provisioning.test.ts` (import + config key), `services/core-api/src/__tests__/admin/tenant-{provision,delete,suspend,reactivate}.routes.int.test.ts`, `services/core-api/src/__tests__/unit/config-security.test.ts`, `services/core-api/src/__tests__/unit/config-tenant-db-cache.test.ts`, `services/core-api/src/__tests__/unit/ci-runtime-contract-fixtures.ts` (`http://minio:9000` → `http://storage:9000`), `services/core-api/src/__tests__/unit/ci-runtime-host-contract.test.ts`
  - **Type**: Modify existing — import paths / config keys / fixtures only
  - **Description**: Point every consumer at `storage-client.js`;
    `STORAGE_*` keys; container DNS `http://storage:9000`; neutral comments.
    No logic change. (`minioBucket` field renames are Phase 3, not here.)
  - **Spec Reference**: Spec FR-004; Plan §5.3, §6.3
  - **Acceptance**: `tsc` + lint green; grep over §6.3 core paths shows zero
    `MINIO_*`/`SILO_*` outside E2 import + server-observed `/minio/health/live`.
  - **Dependencies**: Tasks 2.5, 2.6, 2.7
  - **Estimated**: `[M]` (~1.5h)

- [ ] **2.9** `[FR-005]` `[P]` CI plumbing rename (docker-infra action + workflow + scripts)
  - **File**: `docker-compose.ci.yml`, `.github/actions/docker-infra/action.yml`, `.github/workflows/ci.yml`, `.github/actions/docker-infra/scripts/ci-runtime-compose.sh`, `ci-runtime-env.sh`, `ci-test-env-guard.sh`, `generate-ci-runtime-secrets.sh`, `publish-plugin-assets.sh`, `verify-concurrent-ci-runtime.sh`, `wait-services.sh`, `start-services.sh`, `verify-health.sh`, `*.test.sh` under `.github/actions/docker-infra/scripts/`
  - **Type**: Modify existing
  - **Description**: Service entry `minio:` → `storage:`; inputs
    `minio-access-key`/`minio-secret-key` → `storage-*`; all access/secret
    env mappings → `STORAGE_*` (incl. `MINIO_HOST_URL`/`SILO_HOST_URL` →
    `STORAGE_HOST_URL`); container DNS `http://storage:9000`; `ps -q minio` →
    `ps -q storage`; secret-format assertions renamed with identical
    entropy/format rules; default sentinel neutral (`storageadmin`).
  - **Spec Reference**: Spec FR-005, edge #8; Plan §6.4, Phase 4
  - **Acceptance**: Every `*.test.sh` green locally; manifest round-trip
    produces `STORAGE_*` keys both sides; no `MINIO_*`/`SILO_*` remains in
    these paths.
  - **Dependencies**: Task 2.1
  - **Estimated**: `[L]` (~2–3h)

- [ ] **2.10** `[FR-006]` `[P]` Shell-script rename (E2E + probe scripts)
  - **File**: `scripts/run-web-e2e-production.sh`, `scripts/e2e-production-assets.sh`, `scripts/upload-crm-ui-assets.sh`, `services/core-api/scripts/check-test-env.sh`
  - **Type**: Modify existing
  - **Description**: `MINIO_*`/`SILO_*` exports/guards → `STORAGE_*`;
    `VITE_PLUGIN_ASSET_ORIGIN` sourced from `STORAGE_*`; default access-key
    `minioadmin` → `storageadmin`; `check-test-env.sh`: `MINIO_` grep,
    `required_env`, endpoint var + probe block → `STORAGE_*`/neutral
    (`/minio/health/live` kept unless Phase-1 fallback changed it).
  - **Spec Reference**: Spec FR-006; Plan §6.4
  - **Acceptance**: Scripts executable and green in dry-run; fresh-stack
    `check-test-env.sh` passes (full verification in Phase 4, task 4.5).
  - **Dependencies**: Task 2.1
  - **Estimated**: `[M]` (~1h)

- [ ] **2.11** `[FR-007]` `[P]` E2E helper + manifest + contract-snapshot rename (non-bucket parts)
  - **File**: `e2e/playwright-base.ts`, `e2e/ci-runtime-manifest.ts`, `e2e/keycloak/admin-api.test.ts`, `apps/web/src/lib/ci-runtime-manifest.test.ts`, `apps/web/src/lib/playwright-contract.test.ts`, `apps/web/src/lib/keycloak-admin-api-manifest.test.ts`, `apps/admin/src/lib/playwright-contract.test.ts`
  - **Type**: Modify existing
  - **Description**: Defaults/fixtures/snapshots `MINIO_*`/`SILO_*` →
    `STORAGE_*` (incl. `MINIO_HOST_URL` → `STORAGE_HOST_URL`); default access
    value → `storageadmin`. Admin health-snapshot part is joint with 2.6
    (service key `minio` → `storage`, FR-007). (`minioBucket` helper renames
    are Phase 3.)
  - **Spec Reference**: Spec FR-007; Plan §6.4
  - **Acceptance**: Contract/manifest suites green with `STORAGE_HOST_URL`
    keys round-tripping host ↔ container.
  - **Dependencies**: Task 2.1
  - **Estimated**: `[M]` (~1h)

- [ ] **2.12** `[FR-008]` `[P]` Docs + env-example + constitution-row rename
  - **File**: `.env.example`, `README.md`, `AGENTS.md`, `.forge/constitution.md` (storage row + amendment entry ONLY if touched)
  - **Type**: Modify existing
  - **Description**: Object-storage section → neutral `STORAGE_*` keys
    (`STORAGE_PORT`/`STORAGE_CONSOLE_PORT`/`STORAGE_ENDPOINT`/
    `STORAGE_ACCESS_KEY`/`STORAGE_SECRET_KEY`, neutral default e.g.
    `storageadmin`) + FR-003 indirection note (`MINIO_ROOT_*` ← `STORAGE_*`);
    zero `MINIO_*`/`SILO_*` entries; README/AGENTS reference neutral vars and
    name the server product only at the image ref; constitution storage row
    via amendment entry (do not edit article text directly).
  - **Spec Reference**: Spec US-004, FR-008; Plan §6.4
  - **Acceptance**: `.env.example` has zero `MINIO_*`/`SILO_*`; docs describe
    setup neutrally; constitution change (if any) has an amendment-entry row.
  - **Dependencies**: Tasks 2.1, 2.3
  - **Estimated**: `[M]` (~1h)

- [ ] **2.13** `[FR-004]` `[P]` Audit `ci-runtime-env-config.ts` (no-change verification)
  - **File**: `services/core-api/src/lib/ci-runtime-env-config.ts` (audit only — no edit expected)
  - **Type**: Verify (modify only if a storage key is found)
  - **Description**: Audit result mirrored from plan §6.3 (verified 2026-09-16:
    21 lines, no `MINIO_*`/`SILO_*`/`STORAGE_*` keys present — no change
    required). Re-grep the file at implementation time; if clean, record
    "audited, no change" in the report; if a storage key appears, rename to
    `STORAGE_*` and note the delta.
  - **Spec Reference**: Plan §6.3 (`ci-runtime-env-config.ts` row)
  - **Acceptance**: File contains zero `MINIO_*`/`SILO_*` (or the rename is
    done); audit outcome recorded in the implementation report.
  - **Dependencies**: Task 2.3
  - **Estimated**: `[S]` (~15min)

- [ ] **2.14** `[FR-008]` `[P]` Architecture-docs drift follow-up (docs debt, not this PR)
  - **File**: `.forge/architecture/architecture.md` + `docs/01-SPECIFICHE.md` / `docs/02-ARCHITETTURA.md` (follow-up only); implementation report (record choice)
  - **Type**: Follow-up gate — file or fix, then record
  - **Description**: Per plan §6.5: `architecture.md` MinIO refs (context
    diagram + §1.2 external-deps row + §5.5 MinIO section + §8.1 infra boxes
    + §1.3 trust note) are FOLLOW-UP docs debt, not this PR — either update
    to neutral storage refs or file a docs-debt item with owner + date.
    Italian product docs (`docs/01-SPECIFICHE.md` / `docs/02-ARCHITETTURA.md`):
    update only trivially safe bucket-lifecycle wording, else file follow-up
    and cite in report. Record the choice in the implementation report.
  - **Spec Reference**: Plan §6.5; Spec §13 docs table
  - **Acceptance**: `architecture.md` either neutral OR a tracked docs-debt
    item (owner + date) exists; report records the choice; this PR does not
    silently leave the drift unrecorded.
  - **Dependencies**: Task 2.12
  - **Estimated**: `[S]` (~30min)

---

## Phase 3: DB + API rename (`storageBucket` end-to-end, breaking, no alias)

> Plan §3, §4, §5.6, §8.5, Phase 3. `minio_bucket` → `storage_bucket` via
> transactional `RENAME COLUMN` (no data rewrite). No back-compat alias per
> spec edge #12. Binding deploy rules (spec US-006 / edge #10, plan §8.5):
> API is STOPPED during the column migration (maintenance window); rolling
> mixed-version operation (old code on `minio_bucket` alongside new code on
> `storage_bucket`) is FORBIDDEN; Phases 1–4 land as ONE atomic PR (phases =
> task order, not merge units). Requires human deploy-ordering +
> maintenance-window sign-off before merge (3.7 blocks Phase-3 merge).

- [ ] **3.1** `[FR-013]` Prisma model rename
  - **File**: `services/core-api/prisma/schema.prisma` (~L29 `Tenant` model)
  - **Type**: Modify existing — one field
  - **Description**: `minioBucket String? @unique @map("minio_bucket")
    @db.VarChar(255)` → `storageBucket String? @unique
    @map("storage_bucket") @db.VarChar(255)`. No type/nullability/uniqueness
    change.
  - **Spec Reference**: Spec US-006, FR-013, §8; Plan §3.2
  - **Acceptance**: `prisma validate` clean; model exposes `storageBucket`
    only.
  - **Dependencies**: Phase 2 completion (2.8)
  - **Estimated**: `[S]` (~15min)

- [ ] **3.2** `[FR-013]` `[NFR-007]` Prisma up-migration + down-migration
  - **File**: `services/core-api/prisma/migrations/NNN_rename_minio_bucket_to_storage_bucket/migration.sql` (NEW; NNN = next free after `010_…` at implementation time) + documented down-migration (same dir or rollback runbook)
  - **Type**: Create new file(s)
  - **Description**: Up: `ALTER TABLE core.tenants RENAME COLUMN minio_bucket
    TO storage_bucket; ALTER INDEX IF EXISTS tenants_minio_bucket_key RENAME
    TO tenants_storage_bucket_key;` (verify actual index name via
    `pg_indexes` first; transactional DDL). Down reverses the rename.
  - **Spec Reference**: Spec US-006, FR-013, §8; Plan §3.4
  - **Acceptance**: `prisma validate` / `prisma migrate status` clean;
    up-migration preserves values 1:1 + unique constraint (proven in
    Phase 4, task 4.1); down-migration restores prior name + values.
  - **Dependencies**: Task 3.1
  - **Estimated**: `[M]` (~1h)

- [ ] **3.3** `[FR-013]` `[P]` Admin API contract rename (breaking)
  - **File**: `packages/api-types/src/admin/tenant.ts` (L47/L68)
  - **Type**: Modify existing — breaking field rename
  - **Description**: Admin tenant field `minioBucket` → `storageBucket`
    (provision `201` response + tenant-detail response). No alias.
  - **Spec Reference**: Spec US-006, FR-013, §9; Plan §4.1–§4.2
  - **Acceptance**: No `minioBucket` in request/response contracts; `tsc`
    green in `api-types`; stale consumers fail loudly via contract tests.
  - **Dependencies**: Task 3.1
  - **Estimated**: `[S]` (~20min)

- [ ] **3.4** `[FR-013]` Backend readers/writers rename
  - **File**: `services/core-api/src/modules/tenant/tenant-provisioning.ts`, `services/core-api/src/modules/admin/services/tenant-provision.service.ts` (incl. provision-conflict message `MinIO bucket '…'` → neutral), `services/core-api/src/lib/tenant-schema.ts`, `services/core-api/src/modules/admin/services/deletion-context.service.ts`, `services/core-api/src/modules/admin/services/deletion-step-gdpr-purge.ts`, `services/core-api/src/modules/admin/services/tenant-detail.service.ts`, `services/core-api/src/cli/create-tenant.ts` (`MinIO bucket:` → `Storage bucket:` + `result.storageBucket`), `services/core-api/src/__tests__/tenant-provisioning.test.ts` (`result.minioBucket` → `result.storageBucket`)
  - **Type**: Modify existing — params/vars/selects/messages only, no logic change
  - **Description**: Pure identifier rename `minioBucket` → `storageBucket`
    across provisioning (incl. rollback path), conflict check, schema,
    deletion context + GDPR purge step, detail service, CLI output, tests.
  - **Spec Reference**: Spec FR-013; Plan §5.6, §6.3
  - **Acceptance**: `tsc` green; grep `minioBucket|minio_bucket|minioadmin`
    (canonical gate search #2) → zero matches in own code outside history
    (allowlist E1–E3 does not cover `minioBucket`).
  - **Dependencies**: Tasks 3.1, 3.2, 3.3
  - **Estimated**: `[L]` (~2h)

- [ ] **3.5** `[FR-013]` `[P]` Admin UI rename
  - **File**: `apps/admin/src/components/tenants/tenant-detail-info-tab.tsx`, `apps/admin/src/components/tenants/provision-step-result.tsx`
  - **Type**: Modify existing — bindings + labels
  - **Description**: `t.minioBucket` → `t.storageBucket`;
    `data.minioBucket` → `data.storageBucket`; neutral labels (no vendor names).
  - **Spec Reference**: Spec FR-013, §9–§10; Plan §5.6, §6.4
  - **Acceptance**: Admin tenant-detail + provision-result render the neutral
    field; `tsc`/lint green; no UX change beyond labels.
  - **Dependencies**: Task 3.3
  - **Estimated**: `[S]` (~30min)

- [ ] **3.6** `[FR-007]` `[FR-013]` `[P]` Admin E2E helpers + deletion specs rename
  - **File**: `apps/admin/e2e/helpers/deletion-infrastructure.ts` (`minioBucketExists` → `storageBucketExists`, selects → `storageBucket`, `MINIO_*` → `STORAGE_*`), `apps/admin/e2e/helpers/api-client-types.ts` (`minioBucket` → `storageBucket`), `apps/admin/e2e/005-07-deletion.spec.ts` (`minioBucketExists`/`result.minioBucket` → `storageBucket*`)
  - **Type**: Modify existing
  - **Description**: Helpers, types, and deletion specs aligned atomically
    with the breaking contract rename.
  - **Spec Reference**: Spec FR-007, FR-013, §9; Plan §5.6, §6.4
  - **Acceptance**: Deletion E2E compiles against `storageBucket`; helper
    `storageBucketExists` used consistently.
  - **Dependencies**: Tasks 3.3, 3.4
  - **Estimated**: `[M]` (~1h)

- [ ] **3.7** `[FR-013]` Deploy-ordering + maintenance-window human sign-off gate (required before merge — blocks Phase-3 merge)
  - **File**: Implementation report (record decision); no code file
  - **Type**: Gate — human approval
  - **Description**: Confirm binding deploy rules (spec edge #10 / US-006,
    plan §8.5): API STOPPED during the column migration (maintenance window);
    rolling mixed-version operation FORBIDDEN; Phases 1–4 land as ONE atomic
    PR (phases = task order, not merge units). Confirm coordinated API +
    admin-frontend release ordering (proposed: migrate DB → deploy API →
    deploy admin frontend → run deletion/health E2E). No alias per edge #12.
    Record decision + sign-off in report.
  - **Spec Reference**: Spec §12 item 2, US-006, edge #10/#12; Plan §8.5
  - **Acceptance**: Written deploy-ordering + maintenance-window sign-off
    recorded; Phase 3 does NOT merge without it (atomic-PR rule acknowledged).
  - **Dependencies**: Tasks 3.1–3.6
  - **Estimated**: `[S]` (~15min, excludes wait time)

- [ ] **3.8** `[NFR-001]` Smoke + provisioning/lifecycle re-run AFTER readers/writers rename (binding gate)
  - **File**: `services/core-api/src/__tests__/smoke-storage.test.ts` + provisioning/lifecycle integration suites (`tenant-delete.routes.int.test.ts`, provisioning / tenant-settings logo suites per plan §8.2 step 3)
  - **Type**: Gate — re-run (no code change expected)
  - **Description**: Binding per spec US-003/NFR-001 + plan Phase 3 task 4 /
    §8.2 steps 2–3 / §8.4: AFTER the Phase-3 readers/writers rename (3.4),
    re-run `smoke-storage` PLUS the provisioning/lifecycle integration suites
    green. On red, roll back per the ≤ 5-step procedure (5.3 / plan §8.3).
  - **Spec Reference**: Spec US-003, NFR-001; Plan Phase 3 task 4, §8.2 steps 2–3, §8.4
  - **Acceptance**: Post-rename `smoke-storage` green AND provisioning/lifecycle
    integration green; red → rollback trigger, stop, do not merge.
  - **Dependencies**: Tasks 3.4, 3.5, 3.6
  - **Estimated**: `[M]` (~1h incl. env setup)

---

## Phase 4: Proof (migration tests, smoke, E2E flows, grep gates, frozen lockfile)

> Plan §8 (proof order §8.2, gates §8.4). Each gate must pass before the next
> starts. Any red step → forward-fix once, else §8.3 rollback (≤ 5 steps).
> Full CI green = merge gate (Rule 2).

- [ ] **4.1** `[FR-013]` `[NFR-007]` Migration tests at canonical path on seeded DB (up + down + `pg_indexes`)
  - **File**: `services/core-api/src/__tests__/tenant-bucket-migration.int.test.ts` (CANONICAL path — per spec US-006/§8 + plan §3.4/§6.1/§8.1)
  - **Type**: Create new test file
  - **Description**: Apply up-migration on seeded DB (populated bucket values
    + duplicate-`NULL` rows + uniqueness); assert every value intact 1:1,
    `prisma validate` / `prisma migrate status` clean, duplicate-non-null
    still rejected; assert `pg_indexes` contains zero rows matching `minio`
    for tenant tables (fail otherwise) and record pre/post index names in the
    implementation report; then apply down-migration, assert prior name +
    values restored. Pre-migration backup step (`pg_dump core.tenants` or
    snapshot) documented.
  - **Spec Reference**: Spec US-006, NFR-007, §8; Plan §3.4, §8.1–§8.2 step 1
  - **Acceptance**: Seeded up + down green at the canonical path; 0 rows
    lost/changed; `pg_indexes` zero-`minio` assertion passes with pre/post
    names recorded; status clean. Red → rollback trigger, stop, do not merge.
  - **Dependencies**: Phase 3 completion (3.7, 3.8)
  - **Estimated**: `[L]` (~2–3h)

- [ ] **4.2** `[NFR-001]` `smoke-storage` green against new server (post-Phase-3 re-run confirmation)
  - **File**: `services/core-api/src/__tests__/smoke-storage.test.ts`
  - **Type**: Run (no code change expected)
  - **Description**: Bucket CRUD (`bucketExists`/`makeBucket`/`putObject`/
    `listObjects`/`removeObject`) vs local new server. Confirms the binding
    3.8 post-rename re-run in the full proof order (plan §8.2 step 2).
  - **Spec Reference**: Spec US-003, NFR-001 (re-run AFTER Phase-3 rename); Plan §8.2 step 2
  - **Acceptance**: 100% cases pass post-rename; red after forward-fix → §8.3 rollback.
  - **Dependencies**: Task 4.1
  - **Estimated**: `[M]` (~30–60min incl. env setup)

- [ ] **4.3** `[NFR-001]` `[NFR-003]` Core-API integration suites (lifecycle/GDPR/avatar/logo/presigned — post-Phase-3 re-run)
  - **File**: `tenant-delete.routes.int.test.ts` (GDPR 1000-batch erasure), provisioning / tenant-settings logo suites, `tenant-settings-logo-upload`, marketplace routes (presigned reads, 3600s TTL, `us-east-1` pin)
  - **Type**: Run
  - **Description**: Tenant bucket lifecycle (`createBucket`/`deleteBucket`,
    `listObjects` + `removeObjects` batching, `listBuckets` ping), avatar/logo
    `putObject` at `avatars/{userId}`/`logo`, `presignedGetObject` reads.
    Re-run green post-Phase-3 alongside the smoke re-run (plan §8.2 step 3).
  - **Spec Reference**: Spec US-003, NFR-001/NFR-003; Plan §8.2 step 3
  - **Acceptance**: All listed integration suites green post-rename; GDPR/erasure 100%
    green; secrets/TTL/isolation frozen (0 secrets findings).
  - **Dependencies**: Task 4.2
  - **Estimated**: `[L]` (~2–4h incl. triage)

- [ ] **4.4** `[NFR-001]` `[NFR-002]` Existing E2E storage flows green (marketplace gap + P95 procedure)
  - **File**: `apps/web/e2e/user-profile.spec.ts` (avatar), `apps/web/e2e/tenant-settings.spec.ts` (branding/logo), marketplace presigned-asset reads (`apps/web/e2e/marketplace-assets.spec.ts`), `apps/admin/e2e/005-07-deletion.spec.ts` (bucket gone), `apps/admin/e2e/005-09-health-check.spec.ts` (`storage` card green)
  - **Type**: Run — no new E2E unless a gap is found (then record as new AC first)
  - **Description**: Full user flows against the new server. Marketplace gap
    rule (spec US-003/NFR-001, plan §8.2 step 4): that marketplace spec does
    NOT exist as of 2026-09-16 — if it still does not exist or does not cover
    presigned reads, the gap is explicitly recorded as an ACCEPTED gap in the
    implementation report with rationale, not silently assumed covered.
    P95 minimal procedure (spec NFR-002, plan §8.2 step 5): reuse the
    covered-endpoint timings (avatar/logo upload, presigned-URL issue,
    bucket-lifecycle endpoints) from the same suite run old-server vs
    new-server; publish either an old-vs-new comparison table (ΔP95 within
    ±10%) or absolute P95 < 200ms per endpoint in the report.
  - **Spec Reference**: Spec US-003, NFR-001/NFR-002, Art. 1; Plan §8.2 steps 4–5
  - **Acceptance**: All listed E2E green (or accepted marketplace gap recorded
    with rationale); 0 new failures vs baseline; P95 within ±10% or < 200ms
    absolute per covered endpoint.
  - **Dependencies**: Task 4.3
  - **Estimated**: `[L]` (~2–4h incl. triage)

- [ ] **4.5** `[FR-002]` `[FR-013]` Final zero-match grep gates — canonical scriptable 3-search gate (own tree only)
  - **File**: Repo-wide (own code/config/scripts/docs — excludes history + server-observed)
  - **Type**: Gate — search + justify (3 scriptable searches)
  - **Description**: Canonical gate (spec US-002 AC-2 + US-006 AC-4, plan Phase 2
    task 5 / §8.4), run after implementation over own code/config/scripts/docs,
    excluding history paths `ARCHIVE/**`, `.forge/specs/**`,
    `.forge/sprints/**/archive/**`, `.forge/knowledge/adr/**`
    change-log/mapping-table sections: (1) `MINIO_|SILO_` (case-sensitive
    stale host-var / vendor-prefix sweep; justifications: E1 image ref, E3
    compose-LHS mapping targets, history-path excludes); (2)
    `minioBucket|minio_bucket|minioadmin` (case-sensitive persisted-field /
    default-key sweep; `minioadmin` covered only by the `storageadmin`
    replacement + history excludes; `minioBucket` has NO allowlist cover —
    must be zero); (3) case-insensitive `minio|silo` (broad residual sweep
    incl. `minio/` routes, `minio_data`, `silo_data`, `siloadmin`;
    justifications: E1 image ref, E2 npm `minio` import + `package.json`/
    lockfile entries, E3 compose-LHS keys, server-observed runtime strings
    observed + recorded in report, history-path excludes). Wording unified to
    "observed, recorded in report" throughout (never adopted as identifiers).
  - **Spec Reference**: Spec US-002 AC-2, US-006 AC-4; Plan Phase 2 task 5, §8.4
  - **Acceptance**: Gate evidence pasted into the implementation report with
    each residual match justified (E1/E2/E3, history path, or
    observed-not-authored server string with "observed, recorded in report"
    wording).
  - **Dependencies**: Tasks 4.1–4.4 (run last among proof tasks)
  - **Estimated**: `[M]` (~1h)

- [ ] **4.6** `[NFR-005]` Frozen-lockfile + Rule-4 + full-CI gates
  - **File**: `services/core-api/package.json` + lockfile (verify only — must NOT change); `services/core-api/src/lib/config.ts` (`wc -l`); CI
  - **Type**: Gate — verify
  - **Description**: Confirm `minio@8.0.7` untouched in `package.json`/
    lockfile (only surrounding comment context neutral); `config.ts` ≤ 200
    lines; full CI (unit + integration + E2E) green = merge gate (Rule 2).
  - **Spec Reference**: Spec Art. 2/3/4, §11 (NG-1); Plan §6.5, §8.4
  - **Acceptance**: Lockfile diff empty for the client; `wc -l config.ts`
    ≤ 200; CI all-green or merge blocked.
  - **Dependencies**: Task 4.5
  - **Estimated**: `[M]` (~1h + CI wait)

---

## Phase 5: #77 re-evaluation + rollout/rollback docs + report

> Plan §6.4 (`pnpm-workspace.yaml`), §8.3, §8.5, Phase 5. Alert #77 is NOT
> fixed by this change — recorded as documented exception with expiry.
> **Rule 6 reminder**: implementing PR commits in English only.

- [ ] **5.1** `[FR-012]` `[NFR-006]` `pnpm-workspace.yaml` override-comment re-evaluation
  - **File**: `pnpm-workspace.yaml` (lines 36–38 comment ONLY)
  - **Type**: Modify existing — comment text only
  - **Description**: Refresh comment to new-server context (client unchanged:
    3.x is ESM-only, breaks minio CJS `jsonl/Parser.js`; client only uses
    `jsonl/Parser`, not the vulnerable filters); add re-evaluation date
    2026-09-16 + review expiry 2027-03-16 (≤ 6 months). Override values
    untouched.
  - **Spec Reference**: Spec US-005, FR-012; Plan §6.4, Phase 5
  - **Acceptance**: Comment carries both dates; expiry ≤ 6 months out;
    override values byte-identical.
  - **Dependencies**: Phase 4 completion
  - **Estimated**: `[S]` (~20min)

- [ ] **5.2** `[FR-012]` Dependabot #77 state verification
  - **File**: GitHub Dependabot alert #77 (verify only)
  - **Type**: Verify
  - **Description**: Confirm #77 (`stream-json` MEDIUM via `minio@8.0.7`)
    remains open — or is closed ONLY as documented-exception with expiry,
    never as "fixed by server swap".
  - **Spec Reference**: Spec US-005; Plan Risk R-12
  - **Acceptance**: Alert state + disposition recorded in the implementation
    report with explicit NOT-fixed statement + rationale + expiry.
  - **Dependencies**: Task 5.1
  - **Estimated**: `[S]` (~15min)

- [ ] **5.3** `[FR-010]` `[FR-013]` `[NFR-004]` Rollout + rollback runbook (≤ 5 steps, incl. DB)
  - **File**: ADR-034 runbook section + implementation report (docs only)
  - **Type**: Document
  - **Description**: Prod one-time `docker volume` rename/copy
    (`minio_data` → `storage_data`, `.minio.sys` reused natively; dev/CI
    fresh ephemeral); pre-migration backup; 5-step rollback: (1) repin prior
    `minio/minio:RELEASE.2024-01-16T16-07-38Z@sha256:4c4a…`, (2) volume
    restore/copy-back, (3) DB down-migration (`storage_bucket` →
    `minio_bucket`), (4) single revert commit + `up -d`, readiness probe
    passes, (5) migration tests + smoke green. Smoke-verified in CI or
    documented as verified.
  - **Spec Reference**: Spec FR-010, FR-013, US-006; Plan §3.4, §8.3
  - **Acceptance**: Procedure ≤ 5 steps total (server + volume + DB combined);
    `docker compose config` valid at each stage; trigger conditions named
    (which §8.2 gate fires → rollback).
  - **Dependencies**: Tasks 4.1–4.6 (evidence inputs)
  - **Estimated**: `[M]` (~1h)

- [ ] **5.4** `[ALL]` Implementation report (verification artifact)
  - **File**: Implementation report (plan-phase artifact — location per team convention)
  - **Type**: Document
  - **Description**: Per spec §13 docs table + plan Phase 5 task 2: tag/digest/
    verification-method table (§2, spec-009 style; digest re-confirmed per
    1.1); argv + `mc`-alias findings; E1–E3 inventory; canonical 3-search
    zero-match gate evidence (`MINIO_|SILO_`,
    `minioBucket|minio_bucket|minioadmin`, case-insensitive `minio|silo`;
    history-path excludes; E1–E3 + server-observed justifications with unified
    "observed, recorded in report" wording); pre/post `pg_indexes` names;
    suite results (smoke re-run post-Phase-3 per 3.8/4.2 + provisioning/
    lifecycle integration re-run per 4.3 + E2E per 4.4 + canonical migration
    tests at
    `services/core-api/src/__tests__/tenant-bucket-migration.int.test.ts`);
    old-vs-new P95 table (ΔP95 ±10%) or absolute P95 < 200ms per covered
    endpoint (4.4) + marketplace accepted-gap record if applicable; actual
    compose `:-` secret defaults + no-weak-secret assertion (2.1);
    `ci-runtime-env-config.ts` audit outcome (2.13); `architecture.md` drift
    follow-up choice (2.14); #77 NOT-fixed statement + rationale + expiry
    2027-03-16; deploy-ordering + maintenance-window sign-off record (3.7,
    atomic-PR rule); **Rule 6 note**: implementing PR commits in English.
  - **Spec Reference**: Spec §13 docs table, US-003/NFR-001/NFR-002, FR-011/FR-012; Plan Phase 5 task 2, §8.2 step 5
  - **Acceptance**: Every required section present; digests match pinned
    image; gate evidence reproducible.
  - **Dependencies**: Tasks 4.1–4.6, 5.1–5.3
  - **Estimated**: `[M]` (~1–2h)

- [ ] **5.5** `[ALL]` Adversarial + human review prep (no merge without green CI)
  - **File**: `.forge/specs/011-silo-object-storage/` (review target)
  - **Type**: Gate — review
  - **Description**: Run `/forge-review` (dual-model adversarial, 7
    dimensions); address all HIGH findings; request human review (≥ 1
    approval); merge only with CI green (Rule 2) + deploy-ordering +
    maintenance-window sign-off (3.7) + ADR-034 acceptance + Phases 1–4 as
    ONE atomic PR (plan §8.5). Commits in English (Rule 6).
  - **Spec Reference**: Constitution Rules 2 + 6; Plan §8.2 step 5
  - **Acceptance**: Review findings triaged; CI green; human approval recorded.
  - **Dependencies**: Task 5.4
  - **Estimated**: `[M]` (~1h + review wait)

---

## Summary

| Metric | Value |
| ------ | ----- |
| Total tasks | 36 (P1: 3 · P2: 14 · P3: 8 · P4: 6 · P5: 5) |
| Total phases | 5 |
| Parallelizable `[P]` tasks | 12 (2.4, 2.6, 2.7, 2.9, 2.10, 2.11, 2.12, 2.13, 2.14, 3.3, 3.5, 3.6) |
| Requirements covered | FR-001–FR-013 (all 13) + NFR-001–NFR-007 (all 7) |
| Size profile | `[S]` × 15, `[M]` × 16, `[L]` × 5, `[XL]` × 0 (no splits needed) |
| Est. total effort | ~26–36h (single implementer, excl. CI/review wait) |

> 36 checklist items total. No `[XL]` tasks — largest are
> `[L]` (2.9, 3.4, 4.1, 4.3, 4.4), each 2–4h and independently schedulable
> after their dependencies.

### Critical path (longest dependency chain, ~15–21h active + CI wait)

```
1.1 (pin) → 1.2 (boot/probe) → 1.3 (render)
  → 2.1 (compose rename) → 2.3 (config+guard) → 2.5 (client)
  → 2.8 (import wave) → 3.1 (model) → 3.2 (migrations)
  → 3.4 (readers/writers) → 3.8 (post-rename smoke+lifecycle re-run)
  → 3.7 (sign-off gate)
  → 4.1 (migration tests, canonical path + pg_indexes) → 4.2 (smoke)
  → 4.3 (integration) → 4.4 (E2E + marketplace-gap/P95) → 4.5 (3-search gate)
  → 4.6 (CI green) → 5.3 (runbook) → 5.4 (report) → 5.5 (review/merge)
```

- Off-critical-path (parallelizable any time after 2.1): 2.4, 2.6 (+ health-key
  snapshot joint with 2.11), 2.7 (after 2.5), 2.9, 2.10, 2.11, 2.12, 2.13
  (config-audit), 2.14 (arch-docs follow-up), 3.3, 3.5, 3.6, 5.1–5.2
  (draftable early, finalized after Phase 4 evidence).
- Highest-risk nodes on the path: **1.2** (argv/`mc`-alias fallback decision),
  **3.2/4.1** (populated-DB migration + down-migration + `pg_indexes`
  assertion at the canonical path), **3.7** (human deploy-ordering +
  maintenance-window sign-off — schedule early, it blocks Phase-3 merge;
  atomic-PR rule), **3.8** (binding post-rename re-run — red triggers
  ≤ 5-step rollback), **4.3/4.4** (E2E triage + marketplace-gap/P95
  procedure dominate wall-clock time).

### Suggested next step

Implementer starts Phase 1 (tasks 1.1–1.3), requests deploy-ordering sign-off
(3.7) in parallel-draft now to avoid merge blocking, then works the critical
path 2.1 → 2.5 → 2.8 → Phase 3. No commits from this task pass (Rule 6 applies
to the implementing PR).

---

## Cross-References

| Document | Path |
| -------- | ---- |
| Spec | `.forge/specs/011-silo-object-storage/spec.md` |
| Plan | `.forge/specs/011-silo-object-storage/plan.md` |
| ADR | `.forge/knowledge/adr/adr-034-silo-object-storage.md` (amended — Rule-5 coverage) |
| Constitution | `.forge/constitution.md` (Rules 4 + 6 constraining these tasks) |
| Issues | #175 (server swap), #77 (stream-json exception, NOT fixed) |
