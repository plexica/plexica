# ADR-034: Replace Object-Storage Server (Solution-Agnostic Rename + storageBucket Migration, SDK Kept)

> Architectural Decision Record. Created by `forge-architect` via `/forge-plan` (spec 011).
> Amended 2026-09-16 to the binding solution-agnostic scope (see Supersession Note).

| Field    | Value                          |
| -------- | ------------------------------ |
| Status   | Accepted                       |
| Author   | forge-architect                |
| Date     | 2026-09-16 (amended)           |
| Deciders | Plexica team + human-ordered binding scope change 2026-09-16 (not re-litigated); accepted by human 2026-09-16 |
| Spec     | `.forge/specs/011-silo-object-storage/spec.md` |
| Issue    | #175 (Replace MinIO with Silo fork, lucaforni, 2026-09-14) |

---

## Supersession Note (2026-09-16 — read first)

The 2026-09-16 human-ordered scope change **supersedes the silo-naming
proposal** recorded in every prior revision of this ADR wherever they
conflict: service `silo`, volume `silo_data`, `SILO_*` env vars,
`silo-client.ts` / `health-check-silo.ts` / `smoke-silo.test.ts` /
`silo-env-guard.ts`, `siloadmin` default, the keep-`MINIO_ROOT`-as-host-var
decision, and the `minioBucket` grandfathering (§Decision "Explicitly NOT
renamed" item 4). Neutral replacements govern: service `storage`, volume
`storage_data`, `STORAGE_*` host env, `storage-client.ts` /
`health-check-storage.ts` / `smoke-storage.test.ts` /
`storage-env-guard.ts`, `storageadmin` default, FR-003 compose-level
`MINIO_ROOT_*` ← `${STORAGE_*}` indirection, FR-004 dual fail-fast (stale
`MINIO_*` AND stale `SILO_*`), and the FR-013 `minioBucket` →
`storageBucket` DB/API rename **IN scope** (including the Prisma
data-model migration — this amended ADR is the Rule-5 record for it).
Prior-revision rationale for silo-naming is retained in git history only;
this document is the authority. Status stays **Proposed** until a human
accepts the amended decision.

## Context

The platform's object-storage server is pinned to
`minio/minio:RELEASE.2024-01-16T16-07-38Z` (January 2024, digest-pinned per
spec 009 convention in `infra/compose/docker-compose.platform-services.yml`).
That upstream line is unmaintained: MinIO ended community distribution
(stopped shipping binaries, gutted the OSS console, archived security
updates), so the storage layer has no upgrade path and accumulates
unpatched CVEs with no maintained release line to move to.

The replacement (`pgsty/silo`, AGPL-3.0, published by Pigsty) is a
community-maintained fork of the open-source MinIO server that exists
precisely to continue that line (Pigsty runs it in production as its
PostgreSQL backup repository). Its published compatibility contract —
verified against upstream docs on 2026-09-16 (silo.pgsty.cc, `pgsty/silo`
README, Docker Hub `pgsty/silo` overview) — is: **delivery surfaces
renamed, protocol and data untouched**. Preserved: S3 API, `MINIO_*`
environment variables, `minio_*` Prometheus metrics, `x-minio-*` headers,
`/minio/*` routes, `github.com/minio/*` import paths, and the on-disk
format including `.minio.sys` (held by a CI compatibility check).
Renamed: the `silo` executable, package, service, Helm chart, and
`pgsty/silo` container image — **no `minio` binary alias is installed**
in native artifacts. The container image bundles the client as `mcli`
**with an `mc` compatibility alias**. Note: the Docker Hub repository
was renamed `pgsty/minio` → `pgsty/silo`; `pgsty/minio` is the legacy
name, `pgsty/silo` is canonical — this ADR pins `pgsty/silo` (the image
reference is allowlist entry E1: the only place the vendor name appears
in own config/docs besides history).

Forces:

- Staying on the 2024 MinIO binary means running an unmaintained storage
  server indefinitely (no CVE fixes, no upgrade path).
- Any replacement must preserve S3 wire behavior exactly: the `minio@8.0.7`
  npm SDK, presigned URLs (3600 s TTL, `us-east-1` region pin),
  bucket-per-tenant layout, and GDPR 1000-batch erasure all depend on it.
- The binding scope change orders three things: keep the `minio` npm SDK
  (no new core dependency), **solution-agnostic** naming (neither `minio`
  nor `silo` in own identifiers — the earlier full-rename-to-`silo` call
  is superseded), and the `minioBucket` → `storageBucket` DB/API rename
  **in scope** including the Prisma migration (Rule-5 data-model
  coverage lives in this amended ADR). The only questions left to this
  ADR are *which server image at which pin, why agnostic over
  silo-naming, why the SDK stays, and how the migration + rollback work*.

## Options Considered

### Option A: Swap server to `pgsty/silo`, keep `minio@8.0.7` SDK, solution-agnostic rename + DB/API rename (chosen)

- **Description**: Pin `pgsty/silo:<RELEASE-tag>@sha256:<digest>`
  (classic, non-distroless variant; E1) in compose; rename service
  `minio` → `storage`, volume `minio_data` → `storage_data`, all own
  host env → `STORAGE_*` (endpoint, public endpoint, access/secret,
  ports `STORAGE_PORT`/`STORAGE_CONSOLE_PORT`, CI contract
  `STORAGE_HOST_URL`); compose sets the server-consumed container keys
  `MINIO_ROOT_USER: ${STORAGE_ACCESS_KEY:-…}` /
  `MINIO_ROOT_PASSWORD: ${STORAGE_SECRET_KEY:-…}` as LHS mapping targets
  only (E3 — never read by our code); rename wrapper/probe/smoke files
  to `storage-client.ts` / `health-check-storage.ts` /
  `smoke-storage.test.ts` plus new `storage-env-guard.ts` with dual
  fail-fast on stale `MINIO_*` AND stale `SILO_*`; migrate every CI
  script, shell script, e2e helper, `.env.example`, README/AGENTS.md,
  and the constitution storage row; rename the persisted field
  `Tenant.minioBucket @map("minio_bucket")` →
  `Tenant.storageBucket @map("storage_bucket")` via `RENAME COLUMN`
  migration + down-migration, plus the `@plexica/api-types` admin
  tenant field and every reader/writer (provisioning, conflict check,
  detail, deletion/GDPR purge, `tenant-schema.ts`, `create-tenant` CLI,
  admin UI, E2E helpers) with no alias.
- **Pros**: Maintained release line + full console + CVE fixes; zero
  wire change (S3 invariant holds, existing suites are the proof);
  identifiers describe no vendor, so the *next* server swap is
  identifier-free; stale naming (both vocabularies) fails fast with
  migration errors; no new dependency; data model and admin contract
  carry no vendor naming.
- **Cons**: Large mechanical diff across CI/e2e/docs; one-time prod
  volume rename step; breaking admin API field rename requires a
  coordinated admin-frontend release with human deploy-ordering
  sign-off; real Prisma migration needs seeded-DB testing +
  backup + maintenance-window consideration.
- **Effort**: Medium (mechanical + one transactional column rename,
  suite-verified).

### Option B: Full rename to `silo` vocabulary (superseded — rejected by scope change)

- **Description**: The prior revision's proposal: everything Option A
  does, but named after the replacement product (`silo` service,
  `silo_data`, `SILO_*`, `silo-client.ts`, `siloadmin`, keep
  `MINIO_ROOT_*` host vars, `minioBucket` retained-as-history-only — now renamed per FR-013).
- **Pros**: Identifiers would have described the running server.
- **Cons**: **Rejected by binding human order.** Naming our identifiers
  after the replacement product repeats the original mistake with a new
  vendor: a future server swap re-opens the entire rename. The
  solution-agnostic vocabulary (Option A) survives any server product,
  and the `MINIO_*`-as-interface plus `minioBucket` grandfathering
  would have left vendor names in our interface and data model
  indefinitely. `SILO_*` values from that proposal are now treated as
  stale input (dual fail-fast) so the superseded vocabulary can never
  silently configure the system.
- **Effort**: Medium (sunk — design work reused; direction abandoned).

### Option C: Image-only swap (`pgsty/silo` image, keep all `minio` names)

- **Description**: Change only the `image:` line; leave service,
  volume, env vars, field names, and docs named `minio`.
- **Pros**: Smallest diff; no migration, no breaking API change.
- **Cons**: **Rejected.** Every `MINIO_*`/service/volume/`minioBucket`
  name would permanently misdescribe the running server *and* the data
  model; future maintainers would reason about the wrong upstream
  (e.g. file CVEs against MinIO, pull the wrong release notes). The
  spec's zero-match invariant exists precisely to prevent this drift.
  No behavior is saved by keeping the names — the compat contract
  lives in the server, not in our identifiers.
- **Effort**: Low (rejected on maintainability grounds, not effort).

### Option D: Migrate the client to `@aws-sdk/client-s3` alongside the swap (keep-SDK alternative — rejected)

- **Description**: Replace the `minio@8.0.7` npm SDK with the AWS SDK
  while swapping the server (would also remove the E2 allowlist entry
  and fix alert #77 for real).
- **Pros**: Removes Dependabot alert #77 (`stream-json` via the minio
  client chain) for real instead of by exception; drops the last
  `minio` string (the npm import) entirely.
- **Cons**: **Rejected.** Couples two independent risks (server swap +
  client rewrite: presigning semantics, region resolution, streaming
  upload paths, GDPR batching all re-verified from scratch); adds a new
  core dependency (second ADR, new audit surface); the AWS SDK is a
  larger, differently-shaped client for a server that already speaks
  the exact dialect the minio SDK speaks. #77 stays open as a
  documented, time-boxed exception instead (see below). The kept
  `import … from 'minio'` is explicitly allowlisted (E2), not a rename
  miss.
- **Effort**: High (rejected on risk grounds).

## Decision

**Chosen option**: Option A.

**Rationale**: The server line must stay maintained (rules out the
status quo); the S3 wire contract is proven unchanged by upstream's
CI-held compatibility audit (rules out the client rewrite — nothing the
SDK depends on moves); identifiers must describe *no* vendor so the
next swap is free (rules out both the image-only swap and the
superseded silo-naming — agnostic wins because it is the only
vocabulary with zero expected churn across future server products);
and the persisted `minioBucket` name is a vendor name in the data
model + admin contract, so it moves in scope with a transactional
rename rather than living on as retained history-only debt. One amended ADR
covers swap + neutral rename + data-model change because no new core
dependency is introduced (SDK kept) — this satisfies Constitution
Rule 5 for both the infrastructure change and the data-model change.

**Resolved image pin (digest is the authority, tag is the human label —
reused from the 2026-09-16 resolution; not re-queried in this doc-only
pass; implementer re-confirms at implementation time per spec Q-2):**

| Field | Value |
| ----- | ----- |
| Image | `pgsty/silo:RELEASE.2026-09-03T13-18-01Z@sha256:b616a0cf8cb281e7e6bb3c9b1fb53875b4016a2878223925541c18f82d6c5ca3` |
| Tag | `RELEASE.2026-09-03T13-18-01Z` (non-`latest` RELEASE line, spec-009 style) |
| Manifest-list digest | `sha256:b616a0cf8cb281e7e6bb3c9b1fb53875b4016a2878223925541c18f82d6c5ca3` |
| Arch | `linux/amd64` (`sha256:885275e0…`), `linux/arm64` (`sha256:c35123a0…`) |
| Variant | classic (non-distroless) — the distroless variant has no shell/`mc`, which the `mc ready local` healthcheck needs |
| Verification method | Docker Hub Registry API v2 live query, 2026-09-16 (prior revision); carried over — re-confirm at implementation time |
| No fallback used (prior) | network was available; no fallback method was needed |

**Neutral-vocabulary decision (binding):** service, volume, own host
env vars, `config.ts` Zod schema + dual fail-fast on stale `MINIO_*`
AND stale `SILO_*` (errors name the `STORAGE_*` replacement; no shim),
`minio-client.ts` → `storage-client.ts`
(`createStorageClient`, `pingStorage`, `storageBucket` locals),
`health-check-minio.ts` → `health-check-storage.ts` (incl. probe
registration name `minio` → `storage` and the admin health API service
key), `smoke-minio.test.ts` → `smoke-storage.test.ts`, new
`storage-env-guard.ts` (so `config.ts`, at 198/200 lines, gains only
+1 call line), `ci-runtime-contract.ts` keys/messages, `action.yml`
inputs, all `.github/actions/docker-infra/scripts/*.sh` (+ `*.test.sh`
assertions), `scripts/*.sh`, `check-test-env.sh`,
`docker-compose.ci.yml` service entry, `.github/workflows/ci.yml`
input names, e2e helpers/manifests/snapshots, all unit-test fixtures
referencing `MINIO_*`/`SILO_*`, `.env.example` (with FR-003
indirection note), README/dev docs, AGENTS.md env table + stack row,
constitution storage row, `pnpm-workspace.yaml` #77 comment refresh.
Fresh-install default access key is neutral (`storageadmin`). See
plan.md §6 for the file-by-file table.

**Canonical stale-key list (FINAL, mirrored VERBATIM from spec FR-004 — no additions, no subtractions):**
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
Negative-test ACs (US-002 gate, mirrored into plan §5.2/§8.4):
(a) stale `MINIO_ENDPOINT` set → startup fails with error naming `STORAGE_ENDPOINT`;
(b) stale `SILO_ACCESS_KEY` set → startup fails with error naming `STORAGE_ACCESS_KEY`;
(c) `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` present as compose mapping targets → NO guard error.

**Mapping-indirection decision (FR-003, replaces the prior
keep-`MINIO_ROOT`-host-var call):** compose sets the server-consumed
keys `MINIO_ROOT_USER: ${STORAGE_ACCESS_KEY:-…}` and
`MINIO_ROOT_PASSWORD: ${STORAGE_SECRET_KEY:-…}` (allowlist E3 —
left-hand side only). Our code, scripts, CI, and docs NEVER read
`MINIO_ROOT_*` as interface vars (grep-gated); the indirection is
documented in `.env.example` + plan. Rationale: the server binary only
understands `MINIO_ROOT_*`, but our interface stays vendor-neutral —
the mapping is the single seam where the vendor contract pokes
through, explicitly allowlisted instead of smeared across our env.

**DB/API rename decision (FR-013, Rule-5 data-model coverage):**
`Tenant.minioBucket String? @unique @map("minio_bucket")` →
`Tenant.storageBucket String? @unique @map("storage_bucket")`;
up-migration `ALTER TABLE core.tenants RENAME COLUMN minio_bucket TO
storage_bucket` (+ index rename `tenants_minio_bucket_key` →
`tenants_storage_bucket_key`, values preserved 1:1, transactional
DDL, no rewrite) with pre-migration backup and seeded-DB migration
tests at canonical `services/core-api/src/__tests__/tenant-bucket-migration.int.test.ts`
(populated values + uniqueness + down-migration restore + `pg_indexes`
zero-`minio` assertion with pre/post index names recorded in the report); down-migration reverses the rename (values intact); the
`@plexica/api-types` admin tenant field and every reader/writer are
renamed atomically (tenant provisioning incl. rollback path,
provision-conflict check, tenant detail, provision result view,
deletion context + GDPR purge step, `tenant-schema.ts`,
`create-tenant` CLI output, provisioning tests, deletion specs, admin
UI, E2E helpers incl. `storageBucketExists`); **no `minioBucket`
alias** (an alias would perpetuate the vendor name in the contract —
spec edge #12); coordinated admin-frontend release with human
deploy-ordering sign-off before merge (plan §8.5).

**Explicitly NOT renamed (allowlist E1–E3 + server-observed + history-excluded, each with
justification recorded in the implementation report; wording unified to "observed, recorded in report"):**

1. (E1) The container image reference
   `pgsty/silo:<tag>@sha256:<digest>` (compose `image:` + this ADR's
   pin table + implementation report pin table) — forced third-party
   string; the server product is named only here.
2. (E2) The npm `minio` package import inside the storage client
   (`import … from 'minio'`, `"minio"` in `package.json`/lockfile) —
   the SDK is kept by binding decision (Option D rejected).
3. (E3) The compose mapping targets `MINIO_ROOT_USER` /
   `MINIO_ROOT_PASSWORD` as left-hand-side keys only, each valued from
   a neutral host var — server-consumed keys with no neutral
   equivalent; never read by our code.
4. The `/minio/health/live` probe path and `minio_*` metric names —
   server-owned routes/metrics, unchanged upstream; any upstream rename
   is a scope break (spec edge #6). Server-emitted runtime strings are
   observed, recorded in the implementation report — never adopted as
   our identifiers.
5. Historical records (this spec's mapping tables, this ADR's
   Supersession Note, old specs/plans/sprint archives) — history is not
   rewritten and is excluded from the zero-match gate. `docs/01-SPECIFICHE.md` /
   `docs/02-ARCHITETTURA.md` product-doc mentions follow plan.md §6.5.

**Zero-match gate (canonical 3 scriptable searches, mirrored from spec US-002 — plan §8.4):**
(1) `MINIO_|SILO_` (case-sensitive stale host-var/vendor-prefix sweep;
justifications: E1 image ref, E3 compose-LHS mapping targets, history-path excludes
`ARCHIVE/**`, `.forge/specs/**`, `.forge/sprints/**/archive/**`,
`.forge/knowledge/adr/**` change-log/mapping-table sections);
(2) `minioBucket|minio_bucket|minioadmin` (case-sensitive persisted-field/default-key sweep;
`minioBucket` has NO allowlist cover — must be zero);
(3) case-insensitive `minio|silo` (broad residual sweep; justifications: E1 image ref,
E2 npm `minio` import + `package.json`/lockfile entries, E3 compose-LHS keys,
server-observed runtime strings observed, recorded in report, history-path excludes).

**Admin health service key (spec §9 addition):** admin health response service key
`minio` → `storage`; contract-test snapshot in
`apps/admin/src/lib/playwright-contract.test.ts` updated accordingly (traceable via FR-007).

**Audited, no-change file:** `services/core-api/src/lib/ci-runtime-env-config.ts`
(21 lines, verified 2026-09-16 — no `MINIO_*`/`SILO_*`/`STORAGE_*` keys present; no change required).

**Compose secret defaults (report gate):** the implementation report MUST record the actual
`:-` defaults rendered by `docker compose config` for `STORAGE_ACCESS_KEY`/`STORAGE_SECRET_KEY`
(and their `MINIO_ROOT_*` mapping targets) and assert no weak/hardcoded secret ships;
production relies on generated secrets (CI 24/32-byte hex rules), never on defaults.

## Consequences

### Positive

- Storage server returns to a maintained, CVE-patched release line with
  the full admin console restored.
- S3 wire compatibility is contractual (upstream CI audit) *and* proven
  (migration tests + smoke + integration + E2E suites green, see
  plan.md §8).
- Identifier honesty at zero future cost: no `minio`/`silo` name
  survives in own code/config/docs where it would describe (or
  outlive) the running server; the data model and admin contract are
  vendor-neutral too.
- Stale `.env` files from EITHER vocabulary fail fast with a migration
  error naming the `STORAGE_*` replacement instead of silently
  misconfiguring — including `SILO_*` values anyone adopted from the
  superseded plan.
- No new dependency, no new abstraction (Rule 3 preserved).

### Negative

- Large mechanical diff touches CI plumbing end-to-end; any missed
  `MINIO_*`/`SILO_*` breaks that path loudly (mitigated by the
  repo-wide zero-match gate + dual fail-fast guard).
- One-time prod volume rename/copy step with a (short, documented)
  rollback procedure.
- **Breaking admin API field rename** (`minioBucket` → `storageBucket`,
  no alias): requires a coordinated API + admin-frontend release and
  human deploy-ordering sign-off before merge; stale consumers fail via
  contract tests, never silently. This is ordered scope growth over the
  original mechanical-rename plan (spec §1.1).
- **Real data-model migration**: `RENAME COLUMN` on populated DBs needs
  seeded-DB verification (canonical
  `services/core-api/src/__tests__/tenant-bucket-migration.int.test.ts`
  incl. `pg_indexes` zero-`minio` assertion), a pre-migration backup, and a
  **maintenance window with the API STOPPED — rolling mixed-version operation
  (old code on `minio_bucket` alongside new code on `storage_bucket`) is FORBIDDEN
  (spec edge #10)**; rollback includes the down-migration. **Phases 1–4 land as
  ONE atomic PR (phases = task order, not merge units); Phase-3 merge is BLOCKED
  without deploy-ordering + maintenance-window sign-off (plan §8.5).**
- Fresh-install default access-key value changes (existing secrets are
  carried over by renaming the *variable*, not the value).

### Neutral

- `mc ready local` healthcheck is expected to keep working via the
  bundled `mcli` → `mc` alias, and `command: server /data
  --console-address ":9001"` is argv (no binary name in it), so neither
  needs to change — **but both are re-verified at implementation time**,
  with documented fallbacks (server-native probe; explicit `command:`
  update). No `mc` alias assumption beyond the healthcheck.
- Server config-dir behavior for *new* server state (e.g. `.silo.sys`
  vs `.minio.sys`): existing volumes reuse `.minio.sys` natively;
  fresh volumes may create whichever marker the server chooses — opaque
  to us and not referenced anywhere in our code. Prod volume step is a
  rename/copy reusing on-disk format unchanged. Recorded here so nobody
  "fixes" it later.

## Rollback Plan (≤ 5 steps, smoke-verified, incl. DB)

1. Repin the storage service image to the prior
   `minio/minio:RELEASE.2024-01-16T16-07-38Z@sha256:4c4a48…` digest.
2. Restore/rename the volume back (`storage_data` → `minio_data`,
   reverse of the rename/copy — `.minio.sys` is readable by both).
3. Apply the DB down-migration (`storage_bucket` → `minio_bucket`,
   values intact) — combined into this sequence; the whole procedure
   stays ≤ 5 steps together with the server/volume revert
   (down-migration + repin + volume restore + revert commit + smoke
   green).
4. Restore the pre-change compose/env/scripts/code from version control
   (single revert commit); `docker compose up -d --wait` (service name
   per the restored file) and confirm the readiness probe passes.
5. Run migration tests + `smoke-storage…/smoke-minio` (per restored
   tree) green → rollback complete; report which proof step triggered
   the rollback (see plan.md §8.3).

Rollback trigger: any proof step in plan.md §8 fails and cannot be
fixed forward within the implementing PR (in particular: migration-test
failure, **post-Phase-3 `smoke-storage` re-run red** (binding per spec US-003/NFR-001 —
smoke PLUS provisioning/lifecycle integration re-run green AFTER the readers/writers
rename, rollback on red), provisioning/lifecycle re-run red, E2E storage-flow failure, or
`mc ready local` + fallback probe both failing). Marketplace presigned-asset proof cites
`apps/web/e2e/marketplace-assets.spec.ts` (absent as of 2026-09-16 — record as an explicitly
accepted gap with rationale if uncovered, per spec US-003/NFR-001); P95 follows the minimal
procedure in plan §8.2 step 5 (old-vs-new ΔP95 ±10% table or absolute < 200ms per endpoint).

## Dependabot Alert #77 Re-evaluation (documented exception, NOT fixed — unchanged in substance)

Alert #77 (`stream-json` MEDIUM via `minio@8.0.7`) is **unchanged by this
server-only swap** — the vulnerable chain lives in the kept npm client.
Per spec US-005:

- The `pnpm-workspace.yaml` override (lines 36-38) is **untouched**; only
  its comment is refreshed: client unchanged under the new server,
  `jsonl/Parser`-only usage rationale restated, re-evaluation date
  **2026-09-16**, review expiry **2027-03-16** (≤ 6 months).
- The implementation report states explicitly that #77 is NOT fixed, and
  the alert must remain open (closed only as documented-exception with
  expiry — never as "fixed by server swap").

## Constitution Alignment

| Article | Alignment | Notes |
| ------- | --------- | ----- |
| Rule 1 (E2E) | Aligned | No new E2E; existing avatar/logo/presigned/lifecycle flows are the proof vehicle (cited in spec US-003); migration tests (not E2E) cover FR-013. |
| Rule 2 (green CI) | Aligned | Acceptance = migration tests + listed suites green against the new server; merge blocked otherwise. |
| Rule 3 (one pattern) | Aligned | Single SDK client wrapper preserved under a neutral filename; no `@aws-sdk/client-s3`, no new abstraction. |
| Rule 4 (200 lines) | Aligned with constraint | Rename is line-neutral; the dual fail-fast guard MUST NOT push `config.ts` (198/200 lines, re-verified this pass) over the limit — implemented as separate `storage-env-guard.ts` (≈30 lines; `config.ts` gains +1 call line). Phase-2 `wc -l` gate enforces. |
| Rule 5 (ADR) | Aligned | This amended ADR *is* the Rule-5 record for BOTH the infra replacement + neutral rename AND the FR-013 data-model change (flagged in spec FR-011, closed here). No new core dep (SDK kept). Status Proposed until human accepts. |
| Rule 6 (English commits) | Aligned | Process requirement on the implementing PR, unchanged. This pass makes no commits. |
| Security | Aligned | Env-only secrets, 3600 s presigned TTL, bucket-per-tenant isolation, 1000-batch GDPR erasure — all frozen; raw `RENAME COLUMN` DDL uses static identifiers (no interpolation); guard errors carry key names only, no secret values (no-PII). |
| Tech stack | Amended | Constitution storage row `Object Storage \| MinIO \| ^8` → neutral server + kept minio SDK via amendment entry (plan.md §6.4). |

## Follow-Up Actions

- [ ] Human: **accept this amended ADR** (status stays Proposed until then).
- [ ] Human: **sign off the breaking-API deploy ordering + maintenance window** (plan §8.5 — coordinated API + admin-frontend release, no alias; API STOPPED during column migration, no mixed-version rolling; Phases 1–4 as ONE atomic PR; Phase-3 merge blocked without sign-off).
- [ ] Implement per `.forge/specs/011-silo-object-storage/plan.md`, phases 1-5.
- [ ] Verify `mc ready local` + `server /data` argv against the pinned image (re-confirm tag+digest per spec Q-2); record results in the implementation report.
- [ ] Constitution amendment entry for the storage row + AGENTS.md/README updates.
- [ ] `architecture.md` drift follow-up: update MinIO → neutral storage references (context diagram, §1.2 row, §5.5, §8.1 boxes, §1.3 note) or file a docs-debt item with owner + date; record the choice in the implementation report.
- [ ] Implementation report: tag/digest/verification table, E1–E3 inventory, canonical 3-search zero-match gate evidence (wording "observed, recorded in report"), pre/post `pg_indexes` names, migration test results (canonical path), smoke re-run post-Phase-3 + suite results, old-vs-new P95 table or absolute < 200ms, actual compose `:-` secret defaults + no-weak-secret assertion, #77 exception record with expiry 2027-03-16, deploy-ordering + maintenance-window sign-off record.

---

## Lifecycle

```
Proposed  -->  Accepted  -->  [Deprecated | Superseded by ADR-NNN]
```

*Status stays **Proposed** until a human accepts the amended decision
(silo-naming → agnostic supersession + DB/API rename).*

*ADR numbering note: two `adr-033-*` files exist (`adr-033-f2-dev-registration-auth.md`,
`adr-033-publish-plugin-developer-packages.md`); 034 is the next free number.*
