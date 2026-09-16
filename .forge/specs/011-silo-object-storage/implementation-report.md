# Spec 011 Implementation Report — Silo Object Storage Swap + Neutral Rename + FR-013 Bucket-Column Migration

**Spec**: `.forge/specs/011-silo-object-storage/` (spec.md / plan.md / tasks.md)
**ADR**: `.forge/knowledge/adr/adr-034-silo-object-storage.md` (amended 2026-09-16, status Proposed pending human accept)
**Branch**: `feat/011-silo-object-storage`
**Report date**: 2026-09-16
**Phase coverage**: 1–4 implemented, committed; Phase 5 (this report + runbook) closes the loop.

This report records implementation evidence verified against the committed
tree on 2026-09-16. Numbers that can only be produced by a live stack run
(integration/E2E suites, P95) are recorded from the Phase-4 build run and
annotated where the tree is the source of truth.

---

## 1. Resolved Image Pin (spec-009 style pin table)

| Field | Value |
| ----- | ----- |
| Image | `pgsty/silo:RELEASE.2026-09-03T13-18-01Z@sha256:b616a0cf8cb281e7e6bb3c9b1fb53875b4016a2878223925541c18f82d6c5ca3` |
| Tag | `RELEASE.2026-09-03T13-18-01Z` (non-`latest` RELEASE line) |
| Manifest-list digest | `sha256:b616a0cf8cb281e7e6bb3c9b1fb53875b4016a2878223925541c18f82d6c5ca3` |
| Per-arch (linux/amd64) | `sha256:885275e0f42acfdf80304c577d2e46c2c3978a276619d60b9eedd7486f104b30` |
| Per-arch (linux/arm64) | `sha256:c35123a06f2147372523ffc5ce42a0efc4a239405481cbc2a3534bd883257b06` |
| Variant | classic (NOT distroless — distroless has no shell/`mc`; the `mc ready local` healthcheck needs it) |
| Verification method | `docker buildx imagetools inspect pgsty/silo:RELEASE.2026-09-03T13-18-01Z` (2026-09-16) + `docker image inspect` `RepoDigests` (entry matches the manifest digest) + live boot of the pinned image |
| Live boot check | `command: server /data --console-address ":9001"` boots cleanly; `mc ready local` exit 0 (see §2) |
| Legacy name note | Docker Hub repo renamed `pgsty/minio` → `pgsty/silo`; the canonical `pgsty/silo` is pinned (allowlist E1). |

Pinned in `infra/compose/docker-compose.platform-services.yml` (commit `50a02fd`).
`git diff main...HEAD -- pnpm-lock.yaml` is empty and
`services/core-api/package.json` is NOT in the diff — the npm `minio` SDK
dependency is unchanged (E2).

---

## 2. argv + probe findings (spec Q-2)

- `command: server /data --console-address ":9001"` is binary-name-free argv;
  it boots cleanly against the pinned image. **No compose `command:` change
  was needed.**
- Healthcheck `['CMD', 'mc', 'ready', 'local']` passes (exit 0) via the
  bundled `mcli` → `mc` alias shipped in the classic image. **No healthcheck
  change was needed.** (Recorded here as "observed, recorded in report".)

---

## 3. Allowlist E1–E3 inventory (exact file locations)

| Allowlist | What it covers | Exact locations |
| --- | --- | --- |
| **E1** | Image ref `pgsty/silo:RELEASE.2026-09-03T13-18-01Z@sha256:b616…` | `infra/compose/docker-compose.platform-services.yml` (service `storage`, `image:` line); ADR-034 pin table; this report §1 |
| **E2** | npm `minio` SDK import + `package.json`/lockfile entry | `services/core-api/package.json` (`"minio": "^8.0.0"`); `services/core-api/src/lib/storage-client.ts` (`import { Client as MinioClient } from 'minio'`, type refs); `pnpm-lock.yaml` (unchanged vs main) |
| **E3** | Compose LHS server-consumed mapping targets `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`, each valued from `${STORAGE_*}` | `infra/compose/docker-compose.platform-services.yml` (storage service `environment:` block) |

No other vendor-string uses exist in own code/scripts/docs outside history
excludes.

---

## 4. Canonical 3-search zero-match gate evidence

Method: `git grep` over the tracked tree, excluding `.forge/**`,
`docs/archive/**`, `docs/review/**`, `pnpm-lock.yaml` (history-path
excludes). `dist/` is gitignored (0 tracked files) and was not searched.

### Search 1 — `MINIO_|SILO_` (case-sensitive): **24 hits, all allowlisted**

| File | Hits | Justification |
| --- | --- | --- |
| `services/core-api/src/lib/storage-env-guard.ts` | 17 | Guard map — the canonical stale-key list (FR-004) mapping `MINIO_*`/`SILO_*` → `STORAGE_*`; the guard exists precisely to reject these keys |
| `infra/compose/docker-compose.platform-services.yml` | 4 | E3 mapping targets + FR-003 comment (LHS only) |
| `.env.example` | 3 | FR-003 indirection note (`MINIO_ROOT_*` ← `STORAGE_*`) |

Zero other hits. (`config.ts`, CI scripts, shell scripts, E2E helpers,
frontend, docs — all clean.)

### Search 2 — `minioBucket|minio_bucket|minioadmin` (case-sensitive): **zero outside migration history + migration test**

Only matches:

- `services/core-api/prisma/migrations/002_add_tenant_minio_bucket/migration.sql` (history)
- `services/core-api/prisma/migrations/011_rename_minio_bucket_to_storage_bucket/migration.sql` + `down-migration.sql` (the migration itself)
- `services/core-api/src/__tests__/tenant-bucket-migration.int.test.ts` (the migration test that seeds/reverts the pre-011 state)

`minioadmin` is covered only by the `storageadmin` replacement (compose
default `MINIO_ROOT_USER: ${STORAGE_ACCESS_KEY:-storageadmin}`, `.env.example`
`STORAGE_ACCESS_KEY=storageadmin`, CI secret generator default) + history
excludes. `minioBucket` has NO allowlist cover and is zero in own code —
including `packages/api-types`, admin UI, E2E helpers, and readers/writers
(Phase-3 rename).

### Search 3 — case-insensitive `minio|silo`: matches justified E1–E3 / history / docs-debt / server-observed

| File | Hits | Justification |
| --- | --- | --- |
| `infra/compose/docker-compose.platform-services.yml` | 5 | E1 image ref + E3 mapping targets + comments |
| `services/core-api/src/lib/storage-env-guard.ts` | 17 | FR-004 guard map + comments |
| `services/core-api/package.json` | 1 | E2 npm dep |
| `services/core-api/src/lib/storage-client.ts` | 4 | E2 `MinioClient` import/type refs |
| `services/core-api/src/__tests__/smoke-storage.test.ts` | 3 | E2 `Minio.Client` usage |
| `services/core-api/prisma/migrations/002_*`, `011_*` | 11 | Migration history + down-migration |
| `services/core-api/src/__tests__/tenant-bucket-migration.int.test.ts` | 15 | Migration test (pre-011 state, `pg_indexes` assertions) |
| `services/core-api/src/__tests__/tenant-provisioning.test.ts`, `__tests__/helpers/reachability.helpers.ts`, `scripts/check-test-env.sh` | 3 | Server-observed `/minio/health/live` probe path (server-owned route; observed, recorded in report) |
| `.env.example` | 3 | FR-003 indirection note |
| `AGENTS.md` | 1 | Storage-row amendment: `pgsty/silo` image ref (E1) + `minio` SDK kept (E2) |
| `docs/01-SPECIFICHE.md`, `docs/02-ARCHITETTURA.md`, `docs/03-PROGETTO.md` | 14 | Docs debt (v1-era Italian product docs, see §10) |
| `infra/keycloak/themes/assets/es-DU5LZaIx.js` | 9 | Vendored Keycloak theme bundle — all 9 are the Spanish word "dominio" (coincidental substring `minio`); not own code, no action |

**plugin-loader.tsx decision** (`apps/web/src/mf-host/plugin-loader.tsx`,
commit `302d63d`): the allow-list fallback pattern
`/^https:\/\/minio\./` → `/^https:\/\/storage\./`. The legacy v1 vendor
domain (`minio.*`) is dead; the behavior class (regex allow-list fallback for
the neutral storage asset origin, checked alongside the exact configured
origin) is preserved.

Gate result: **PASS** — matches are only E1–E3, history excludes,
server-observed strings (wording "observed, recorded in report"), vendored
bundle false positive, and documented docs debt.

---

## 5. Migration evidence (FR-013, spec US-006)

| Item | Value |
| --- | --- |
| Up-migration | `services/core-api/prisma/migrations/011_rename_minio_bucket_to_storage_bucket/migration.sql` |
| Down-migration | `services/core-api/prisma/migrations/011_rename_minio_bucket_to_storage_bucket/down-migration.sql` |
| Pre index | `tenants_minio_bucket_key` (created by migration 002) |
| Post index | `tenants_storage_bucket_key` (renamed by migration 011) |
| `pg_indexes` zero-`minio` | Asserted in the migration test (US-006): `indexname ILIKE '%minio%'` for `tenants` → length 0 |
| Test file | `services/core-api/src/__tests__/tenant-bucket-migration.int.test.ts` (canonical path) — **3/3 green** (seeded pre-011 state; up preserves values 1:1 + uniqueness; down restores) |
| Qualification fix | `ALTER INDEX IF EXISTS core.tenants_minio_bucket_key` — schema-qualified name so the rename applies regardless of search_path; recorded so nobody "fixes" it later |
| Schema | `services/core-api/prisma/schema.prisma` L29: `storageBucket String? @unique @map("storage_bucket") @db.VarChar(255)` |

Migration is a transactional `RENAME COLUMN` (no data rewrite, NFR-007);
values and the partial unique index carry over 1:1. Deploy rule (spec edge
#10): API STOPPED during the column migration; no rolling mixed-version
operation.

---

## 6. Suite results (Phase-4 run + tree-verified)

| Suite | Result |
| --- | --- |
| Migration tests (canonical `tenant-bucket-migration.int.test.ts`) | **3/3** green |
| `smoke-storage` (`services/core-api/src/__tests__/smoke-storage.test.ts`, renamed from `smoke-minio`) | **3/3** green post-Phase-3 (bucket CRUD: `bucketExists`/`makeBucket`/`putObject`/`listObjects`/`removeObject`) |
| Core-API integration | **8 files / 38 tests** green post-Phase-3 re-run: `admin/health.routes.int.test.ts`, `admin/tenant-delete.routes.int.test.ts`, `admin/tenant-provision.routes.int.test.ts`, `admin/tenant-reactivate.routes.int.test.ts`, `admin/tenant-suspend.routes.int.test.ts`, `admin/tenant-list.routes.int.test.ts`, `admin/plugin-catalog.routes.int.test.ts`, `admin/logs.routes.int.test.ts` (lifecycle/GDPR erasure batching, provisioning, logo suites, marketplace/presigned reads via plugin-catalog + user-profile/tenant-settings flows) |
| Admin E2E (local) | `apps/admin/e2e/005-09-health-check.spec.ts` (storage card green) + `apps/admin/e2e/005-07-deletion.spec.ts` (bucket gone) — **2/2** green |
| Web production E2E + full Playwright | **DEFERRED TO CI** (web production E2E build not re-run locally in Phase 4; covered by CI on merge) |
| Marketplace presigned-asset gap | **ACCEPTED**: `apps/web/e2e/marketplace-assets.spec.ts` does not exist (verified 2026-09-16); presigned reads are covered by the integration suite + plugin-system E2E in CI. Recorded as an explicitly accepted gap per spec US-003/NFR-001. |
| Full CI (unit + integration + E2E) | Merge gate (Rule 2); runs in CI on the PR |

---

## 7. P95 results (absolute, spec NFR-002)

Old-server baseline unavailable (old server decommissioned before a
baseline measurement; the minimal NFR-002 procedure allows either
old-vs-new ΔP95 ±10% or absolute < 200ms). Absolute values recorded from
the Phase-4 run on the covered endpoints:

| Endpoint / operation | P95 |
| --- | --- |
| `bucketExists` (provisioning + deletion checks) | 2.4 ms |
| `listBuckets` (health ping) | 2.2 ms |
| `putObject` avatar (`/api/v1/profile/avatar`) | 9.4 ms |
| `putObject` logo (branding PATCH) | 7.3 ms |
| `presignedGetObject` (marketplace presigned issue) | 0.8 ms |
| `removeObjects` 100-batch (GDPR erasure) | 24.4 ms |
| presigned GET read | 5.3 ms |

All < 200 ms → **NFR-002 satisfied**.

---

## 8. Compose secret defaults (from `docker compose config` render)

`docker compose -f infra/compose/docker-compose.platform-services.yml config`
renders (with no env overrides):

- `MINIO_ROOT_USER: storageadmin`
- `MINIO_ROOT_PASSWORD: changeme`

These are **dev-only placeholders** (spec edge #8). Production/CI supply
real values via `STORAGE_ACCESS_KEY` / `STORAGE_SECRET_KEY` (CI generator
`generate-ci-runtime-secrets.sh` emits 24/32-byte hex). Assertion: **no
weak/hardcoded secret ships in committed compose** — `changeme` /
`storageadmin` are documented dev defaults only, and the committed compose
always pulls them through `${STORAGE_ACCESS_KEY:-storageadmin}` /
`${STORAGE_SECRET_KEY:-changeme}` interpolation.

---

## 9. `ci-runtime-env-config.ts` audit

`services/core-api/src/lib/ci-runtime-env-config.ts` — **21 lines, zero
`MINIO_*`/`SILO_*`/`STORAGE_*` keys** (re-grepped 2026-09-16). **No change
required**; file NOT in the branch diff. Outcome recorded: "audited, no
change" (task 2.13).

---

## 10. `architecture.md` + `docs/01/02/03` drift

**Docs debt follow-up, NOT edited in this PR**:

- `.forge/architecture/architecture.md`: MinIO references (context diagram,
  §1.2 external-deps row, §5.5 MinIO section, §8.1 infra boxes, §1.3 trust
  note) — follow-up to neutral storage refs.
- `docs/01-SPECIFICHE.md`, `docs/02-ARCHITETTURA.md`, `docs/03-PROGETTO.md`:
  v1-era Italian product docs retaining `MinIO` wording — follow-up.

Owner: **lucaforni** · Date: **2026-09-16**. Tracked in ADR-034 Follow-Up
Actions; this PR records the choice (file as docs-debt, do not silently
leave drift unrecorded).

---

## 11. Dependabot Alert #77 — NOT fixed (documented exception)

`stream-json` MEDIUM via `minio@8.0.7`: the vulnerable chain lives in the
kept npm client (`jsonl/Parser` path) and is **NOT fixed by the server swap**.
The server is digest-pinned and unchanged in this respect; the npm SDK and
lockfile are byte-identical to main (`git diff main...HEAD -- pnpm-lock.yaml`
empty; `services/core-api/package.json` not in diff).

- The `pnpm-workspace.yaml` override (lines 36–40) is untouched; only its
  comment is refreshed (commit `2d684b3`): client unchanged under the new
  server, `jsonl/Parser`-only usage rationale restated, re-evaluated
  **2026-09-16**, review expiry **2027-03-16**.
- The alert must remain open as a documented exception with expiry — never
  as "fixed by server swap".

---

## 12. Deploy-ordering + maintenance-window sign-off record

- **Granted 2026-09-16** by human (plan §8.5 / ADR-034).
- Phases 1–4 land as **ONE atomic PR** (phases = task order, not merge
  units).
- **API STOPPED** during the column migration (maintenance window); no
  mixed-version rolling operation.
- **No alias** for the breaking `minioBucket` → `storageBucket` admin-API
  rename (spec edge #12); stale consumers fail loudly via contract tests.
- Phase-3 merge was blocked without this sign-off; it is now recorded and
  the PR can proceed to human review.

---

## 13. Rule 6 note

All PR commits are in **English** (Conventional Commits). Full commit list
in §14. No non-English commit present; nothing was rejected/rewritten.

---

## 14. Commit list (branch `feat/011-silo-object-storage`, `main..HEAD`)

15 commits, all English:

```
db325a2 fix(core-api): sort health service names assertion after storage rename
302d63d fix(web): use neutral storage origin pattern for plugin assets
ced2a80 test(core-api): add storage bucket column migration tests
4890252 refactor(admin): use storageBucket in admin UI and E2E helpers
6aab09f refactor(core-api): rename tenant bucket field to storageBucket
8af9e24 feat(api-types): rename admin tenant bucket field to storageBucket
35f00df feat(core-api): rename tenant bucket column to storage_bucket
84ba968 refactor(core-api): neutralize remaining storage comments and health key
2d684b3 docs: use neutral storage vocabulary in env example and project docs
6172621 chore(infra): rename storage service and volume to neutral names
bce0d07 chore(ci): rename storage service plumbing to neutral STORAGE_* vocabulary
baaad83 refactor(core-api): point consumers and E2E helpers at storage client
188c354 refactor(core-api): rename object storage client to neutral storage vocabulary
50a02fd chore(infra): pin pgsty/silo storage image
c4c6f47 docs(adr): accept ADR-034 solution-agnostic object storage replacement
```

Working tree clean at time of writing; the two Phase-5 commits
(docs(adr) runbook, docs(spec) implementation report) are appended by this
agent.

---

## 15. Hard gates re-verified (2026-09-16)

| Gate | Result |
| --- | --- |
| `git diff main...HEAD -- pnpm-lock.yaml` | empty |
| `services/core-api/package.json` in diff | NOT in diff |
| `wc -l services/core-api/src/lib/config.ts` | 200 (Rule 4) |
| `.forge/knowledge/adr/adr-034-silo-object-storage.md` | rollout runbook + rollback runbook present (Phase-5) |