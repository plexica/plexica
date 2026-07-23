# PR #77 Security Remediation — Implementation Architecture Plan

| Field | Value |
| --- | --- |
| Status | Proposed — implementation-ready; ADR-024 acceptance is the governance gate |
| Author | forge-architect |
| Date | 2026-07-23 |
| Track | Monolithic Epic remediation |
| Scope | PR #77 confirmed review triage; no feature expansion |

## 1. Purpose and Boundaries

This plan remediates PR #77 as one ordered dependency chain. It preserves the
Fastify monolith, schema-per-tenant PostgreSQL, Keycloak multi-realm, ABAC,
Kafka/Redpanda, and current public API paths. It implements requirements from:

- Spec 002: 002-02, 002-07, 002-11, NFR-04;
- Spec 003: DR-05 invitation acceptance and the authenticated-by-default API;
- Spec 004: 004-03, 004-14—004-18, 004-20—004-21, AC-04, AC-06, AC-07,
  NFR-03, NFR-08;
- Spec 005: 005-05—005-07, AC 2—3, deletion/suspension edge cases.

The following are explicit non-goals: changing brokers, adding microservices or
a job-queue product, changing plugin topic names, redesigning UI, introducing a
KMS service, or broadening plugin permissions.

## 2. Decision Summary and Invariants

| Area | Binding decision | ADR |
| --- | --- | --- |
| Events | Canonical v1 envelope, `tenantId` Kafka key/filter, transactional outbox, stable UUID event ID, schema version, AES-GCM tenant payload encryption | ADR-004 amendment |
| DLQ | Mandatory tenant/install ownership, source-coordinate dedupe, targeted DB purge, cryptographic Kafka payload erasure | ADR-016 amendment |
| Plugin DB | Restricted role plus production `verify-full` TLS with dedicated CA; no copied privileged URL parameters | ADR-017 amendment |
| Migrations | `node-sql-parser` AST allowlist/serialization; no textual SQL splitting | ADR-007 amendment |
| Tenant lifecycle | Durable leased reconciliation; suspension immediate deny; reactivation remains denied until reconciliation succeeds | ADR-022 amendment |
| Deletion | `event_data_purge` is the first saga step and a completion gate | ADR-022 amendment |
| User JWT | Every master, tenant, and E2E token must contain resource audience `plexica-api` | ADR-023 amendment |
| Plugin service auth | Random opaque per-install credential, hash-only persistence, expiry/revoke/rotation, fixed namespace/scope | ADR-024 (Accepted 2026-07-23) |

### Non-negotiable invariants

1. A tenant mutation commits together with exactly one outbox row or neither
   commits. Kafka delivery is at least once; `eventId` is stable across retries.
2. Kafka message key and envelope `tenantId` are identical. An installation
   never receives an event whose `tenantId` differs from its tenant ID.
3. No unversioned or malformed event reaches a plugin backend.
4. No readable domain payload is written to Kafka. Routing metadata is limited
   to UUIDs, type, timestamps, versions, producer kind, and encryption metadata.
5. A DLQ row is uniquely owned by `tenantId + installId` and uniquely deduped by
   its original Kafka coordinates.
6. A plugin service credential authorizes one installation, one tenant, one
   plugin namespace, and `events:emit` only. Plaintext is never persisted.
7. Any tenant status other than `active` denies user API, plugin proxy, plugin
   service auth, event production, and event dispatch.
8. Suspension is effective from the committed DB transition even if Keycloak,
   Redis, Kafka, or a runtime is unavailable. Reactivation does not set `active`
   until all required side effects are confirmed.
9. Tenant deletion cannot become `deleted` until service credentials and
   tenant-owned outbox/DLQ rows are purged and all tenant event keys are
   destroyed. Kafka retention is not accepted as erasure.
10. Production plugin DB connections never downgrade below
    `sslmode=verify-full`.

## 3. Runtime Component Chain

```text
Tenant mutation / plugin emit
  -> PostgreSQL transaction
       -> domain write (when applicable)
       -> core.event_outbox (canonical v1 event)
  -> leased outbox publisher
       -> tenant-key encrypt payload
       -> Kafka key = tenantId
  -> installation consumer
       -> validate envelope + decrypt
       -> compare installation.tenantId == event.tenantId
       -> POST /_plexica/event
       -> on 3 failures publish encrypted DLQ with source coordinates
  -> DLQ bridge
       -> insert core.dead_letter_queue ON CONFLICT (dedupe_key) DO NOTHING

Tenant suspend/reactivate
  -> core tenant transaction + lifecycle reconciliation intent
  -> leased reconciler -> Keycloak + plugin runtime/consumer + Redis

Tenant delete
  -> pending_deletion
  -> event_data_purge -> schema_drop -> realm_delete -> bucket_delete
  -> deleted tombstone
```

The outbox publisher, DLQ bridge, lifecycle reconciler, and deletion executor
are in-process workers in the existing core API. All use PostgreSQL CAS leases
so multiple replicas can run them safely.

## 4. Data Model and Migrations

Apply additive migration `007_pr77_security_remediation_expand` after existing
migration 006. After legacy cleanup and verified backfill, apply
`008_pr77_security_remediation_contract` for new NOT NULL/unique/CHECK
enforcement. Do not use `prisma db push` in CI or rollout.

### 4.1 `core.event_outbox` (new)

| Column | PostgreSQL type | Constraints / purpose |
| --- | --- | --- |
| `event_id` | UUID | PK; canonical `eventId` |
| `tenant_id` | UUID | NOT NULL, FK `core.tenants(id)` |
| `topic` | VARCHAR(128) | NOT NULL |
| `event_type` | VARCHAR(128) | NOT NULL |
| `schema_version` | SMALLINT | NOT NULL, CHECK `= 1` |
| `payload` | JSONB | NOT NULL; plaintext only in PostgreSQL until publish/purge |
| `producer_kind` | VARCHAR(16) | CHECK `core|plugin` |
| `producer_id` | VARCHAR(64) | `core` or installation UUID |
| `correlation_id` | UUID | NOT NULL |
| `causation_id` | UUID | NULL |
| `occurred_at` | TIMESTAMPTZ | NOT NULL |
| `attempts` | INTEGER | NOT NULL DEFAULT 0 |
| `available_at` | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| `lease_token` | UUID | NULL |
| `lease_expires_at` | TIMESTAMPTZ | NULL |
| `last_error_code` | VARCHAR(64) | NULL; sanitized code only |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT now() |

Index `(available_at, created_at)` for unleased/expired claims and
`(tenant_id)` for deletion. Acknowledged rows are deleted. A crash after Kafka
ack and before delete produces a duplicate with the same `event_id`.

### 4.2 `core.tenant_event_keys` (new)

| Column | Type | Constraints / purpose |
| --- | --- | --- |
| `tenant_id` | UUID | FK `core.tenants(id)` |
| `key_version` | INTEGER | Version, starts at 1 |
| `status` | VARCHAR(16) | CHECK `active|destroyed` |
| `wrapped_key` | BYTEA | NULL only when destroyed |
| `wrap_iv` / `wrap_tag` | BYTEA | NULL only when destroyed |
| `created_at` / `destroyed_at` | TIMESTAMPTZ | lifecycle timestamps |

Primary key `(tenant_id, key_version)` and one partial unique active key per
tenant. `EVENT_KEY_ENCRYPTION_KEY` is production-required secret configuration;
there is no committed or production fallback. Destroying a key sets all wrapped
material to NULL in the same transaction that marks it destroyed.

### 4.3 `core.dead_letter_queue` (expand/normalize)

Add `tenant_id UUID`, `install_id UUID`, `event_id UUID`,
`schema_version SMALLINT`, `original_topic VARCHAR(128)`,
`original_partition INTEGER`, `original_offset BIGINT`, and
`dedupe_key CHAR(64)`. Make them NOT NULL after verified backfill. Add unique
`dedupe_key`, index `(tenant_id, status, failed_at)`, and status CHECK including
`pending`, `retrying`, `retried`, `dismissed`. Keep `plugin_id` for catalog
display only. `error_message` becomes bounded sanitized detail; no stack.

`dedupe_key` is SHA-256 of newline-delimited installation ID, original topic,
partition, and offset. The DB insert, not a read-before-create, is the arbiter.

### 4.4 `core.plugin_service_credentials` (new; ADR-024)

| Column | Type | Constraints / purpose |
| --- | --- | --- |
| `id` | UUID | PK; public credential lookup ID |
| `tenant_id` | UUID | NOT NULL, FK tenant; purge key |
| `install_id` | UUID | NOT NULL; tenant-schema installation ID |
| `plugin_id` | UUID | NOT NULL, FK `core.plugins(id)` |
| `plugin_slug` | VARCHAR(63) | NOT NULL; immutable namespace binding |
| `scope` | VARCHAR(32) | CHECK `events:emit` |
| `secret_digest` | BYTEA | NOT NULL; HMAC-SHA-256 only |
| `version` | INTEGER | NOT NULL |
| `status` | VARCHAR(16) | CHECK `pending|active|revoked|expired` |
| `expires_at` | TIMESTAMPTZ | NOT NULL |
| `created_at`, `activated_at`, `revoked_at` | TIMESTAMPTZ | lifecycle |

Unique `(install_id, version)` plus indexes on `(tenant_id)` and
`(install_id, status)`. Rotation may have two active rows for at most five
minutes; the worker revokes the old version after replacement health succeeds.
Never add plaintext/token columns.

### 4.5 `core.tenant_lifecycle_reconciliations` (new)

| Column | Type | Constraints / purpose |
| --- | --- | --- |
| `id` | UUID | PK |
| `tenant_id` | UUID | NOT NULL, FK tenant |
| `target_version` | INTEGER | NOT NULL |
| `desired_status` | tenant status enum | CHECK active/suspended |
| `status` | VARCHAR(16) | pending/in_progress/completed/failed |
| `attempts` | INTEGER | NOT NULL DEFAULT 0 |
| `available_at` | TIMESTAMPTZ | NOT NULL |
| `lease_token`, `lease_expires_at` | UUID, TIMESTAMPTZ | distributed lease |
| `last_error_code` | VARCHAR(64) | no raw external message |
| `created_at`, `updated_at`, `completed_at` | TIMESTAMPTZ | lifecycle |

Unique `(tenant_id, target_version)` and claim index
`(status, available_at, lease_expires_at)`.

### 4.6 Existing deletion model

Extend the deletion-step CHECK constraint and canonical order with
`event_data_purge` first. Backfill this step for every `pending_deletion` tenant.
Later completed steps do not permit bypass: the runner selects the first
non-done step in canonical order.

### 4.7 Backfill rules

- Create event keys for active/suspended tenants only; pending deletion gets no
  new key and must run `event_data_purge`.
- Migration 007 purges all legacy DLQ rows: the current schema never stored
  tenant ownership plus source partition/offset, so none can satisfy the new
  proof requirement without guessing. Migration 008 can then enforce NOT NULL
  and unique constraints in the same deploy sequence.
- Create pending `suspended` reconciliation rows for suspended tenants. Verify
  active tenant realm/runtime state before declaring rollout complete.
- Create plugin credentials during Phase 1 runtime rotation, not in SQL, because
  plaintext must be injected once and never stored.

## 5. Canonical Contracts

### 5.1 Kafka wire value

```json
{
  "eventId": "uuid",
  "type": "plugin.crm.contact.created",
  "schemaVersion": 1,
  "tenantId": "uuid",
  "occurredAt": "2026-07-23T12:00:00.000Z",
  "producer": { "kind": "plugin", "id": "installation-uuid" },
  "correlationId": "uuid",
  "causationId": null,
  "encryption": {
    "algorithm": "A256GCM",
    "keyVersion": 1,
    "iv": "base64url",
    "tag": "base64url"
  },
  "ciphertext": "base64url"
}
```

Kafka headers duplicate `event-id`, `tenant-id`, `schema-version`, and
`content-encoding=plexica-a256gcm-v1` for operations; the validated value is
authoritative. AES-GCM additional authenticated data is the canonical encoding
of all plaintext fields above except `encryption` and `ciphertext`.

The plugin HTTP delivery body is the decrypted canonical envelope with
`payload` restored. Existing `{type,payload,timestamp,correlationId}` delivery is
replaced atomically with v1; the CRM reference plugin and SDK contract update in
the same phase.

### 5.2 Plugin service authentication

`X-Plugin-Service-Token: plxsvc_<credential UUID>.<43-char base64url secret>`.
Validation order is: token Zod syntax -> core credential lookup -> digest
constant-time check -> active/unexpired/scope -> active tenant -> matching active
or degraded installation -> exact `plugin.{storedSlug}.*` event type. Any
failure denies without setting a caller-provided tenant context.

### 5.3 JWT resource audience

Core verifies RS256, exact issuer, and `aud` containing
`KEYCLOAK_API_AUDIENCE` (`plexica-api`) for all realms. Tenant requests still
require issuer realm == tenant realm; admin requests still require master realm
and `super_admin`. Keycloak reconcilers add the audience mapper to
`plexica-web`, `plexica-admin`, and each ephemeral E2E helper before enforcement.

### 5.4 Plugin DB URL policy

Generated production URL parameters are exactly encoded `options=-c
search_path=<validated-schema>`, `sslmode=verify-full`, and
`sslrootcert=<absolute dedicated CA mount>`. Unknown source parameters and
platform client certificates/keys are discarded. Non-production must explicitly
select `disable`; production cannot.

### 5.5 Lifecycle response compatibility

Suspend/reactivate returns the existing `200 { id, status, version }` when
inline reconciliation completes. Once durable intent is committed but an
external dependency prevents completion, return:

```json
{
  "operationId": "uuid",
  "id": "tenant-uuid",
  "status": "suspended",
  "version": 7,
  "reconciliation": "pending"
}
```

with `202 Accepted`. Reactivation never reports `active` in this response.
Validation/version conflicts remain 400/409 and create no operation.

## 6. Failure Semantics

| Failure | Required behavior |
| --- | --- |
| Domain transaction/outbox insert fails | Roll back domain mutation; return normal DB error envelope. |
| Kafka unavailable | Keep outbox row, release/expire lease, exponential retry with jitter; alert on age; never DLQ/drop. |
| Publisher crashes after send | Row is replayed with same event ID; consumer/plugin idempotency handles duplicate. |
| Missing/destroyed tenant key | Do not publish/decrypt; active tenant raises security alert, deleting tenant treats ciphertext as erased. |
| Malformed/legacy/cross-tenant event | Never dispatch. Cross-tenant valid events are committed as irrelevant; malformed v1 is quarantined by coordinates without copying readable payload. |
| Plugin fails three deliveries | Publish encrypted DLQ and commit source only after DLQ ack. |
| DLQ DB unavailable/bridge crashes | Do not commit DLQ offset; unique dedupe makes replay safe. |
| Credential DB unavailable | Fail closed with generic service-unavailable response; no event accepted. |
| Credential expired/revoked/namespace mismatch | Generic deny; no tenant/credential enumeration. |
| Suspension side effect fails | Tenant remains suspended; durable operation retries. |
| Reactivation side effect fails | Tenant remains suspended; durable operation retries; realm-enabled/API-denied intermediate state is safe. |
| Event purge partially fails | Deletion remains pending at `event_data_purge`; retry idempotently; later steps do not run. |
| Production DB TLS invalid | Plugin install/start/rotation fails or becomes degraded; never downgrade. |

## 7. Ordered Implementation Phases

### Phase 0 — Governance, migration, and enforceable baseline

1. Accept ADR-024; retain amendments to ADR-004/007/016/017/022/023.
2. Add migration 007 and Prisma models/constraints; prove fresh and 006->007
   upgrade paths with `prisma migrate deploy`.
3. Correct root Node engine to `>=24`; make CI use Node 24 only.
4. Add the source-file 200-line blocking gate and prohibit skip-on-missing-infra
   E2E behavior.
5. Replace CI `prisma db push` with `prisma migrate deploy` + migration status;
   start/health-check Loki for tests that claim log coverage.

**Exit gate**: migration deploy succeeds twice (idempotent) on fresh and upgraded
DB; Prisma generation/typecheck pass; line and Node gates fail on deliberate
negative fixtures.

### Phase 1 — Identity, dependency, and transport perimeter

1. Reconcile `plexica-api` audience into master, every tenant realm, and
   run-scoped E2E clients; then enforce it in core JWT validation.
2. Implement ADR-024 issue/verify/rotate/revoke and rotate every active plugin
   runtime; remove deterministic HMAC acceptance and insecure default.
3. Implement ADR-017 TLS URL policy and CA mount validation.
4. Finish ADR-007 AST validation/serialization; remove textual SQL splitting.

**Exit gate**: real Keycloak token matrix passes; old/missing/wrong audience is
401; service credential expiry/revoke/namespace/cross-tenant tests deny; no
plaintext credential exists in DB/runtime config records; production TLS
negative cases fail closed; parser corpus passes.

### Phase 2 — Event envelope, key lifecycle, and outbox

1. Add Zod wire/domain envelope schemas and AES-GCM key service.
2. Add leased outbox repository/publisher with oldest-age/attempt metrics.
3. Convert workspace creation, plugin installation, and plugin custom emission
   to same-transaction outbox writes; remove direct event publication.
4. Update SDK/OpenAPI and CRM event handler to consume decrypted v1 envelope and
   dedupe side effects by `eventId`.

**Exit gate**: kill/restart and Kafka-outage integration tests prove no committed
event loss, stable event IDs, tenant partition keys, encrypted broker payloads,
and no duplicate CRM pipeline.

### Phase 3 — Tenant-filtered consumers and durable DLQ

1. Pass Kafka topic/partition/offset through the installation consumer.
2. Validate/decrypt before dispatch and enforce installation tenant equality.
3. Publish encrypted DLQ only after three attempts; bridge with insert-on-
   conflict dedupe and commit-after-DB semantics.
4. Make retry/dismiss CAS-safe and preserve event identity/tenant key.

**Exit gate**: two-tenant event isolation, bridge crash replay, single DLQ row,
exact retry partition, concurrent retry/dismiss conflict, malformed event, and
DB/Kafka outage tests all pass on real services.

### Phase 4 — Durable suspension/reactivation reconciliation

1. Write reconciliation intent in the lifecycle transaction.
2. Add leased inline/startup/periodic reconciler for realm, tenant cache,
   plugin proxy/runtime, consumer state, and service-auth status.
3. Keep suspension DB-first and reactivation DB-last.
4. Expose only structural reconciliation status/error codes to admin flows and
   metrics. Preserve existing successful `200` contracts; after a committed
   intent that cannot reconcile inline, return `202` with operation ID, version,
   `status: suspended`, and `reconciliation: pending`.

**Exit gate**: real-stack tests stop Keycloak/Redis/core at every boundary,
restart replicas, and prove suspended requests/events remain denied and
reactivation becomes active only after convergence within Spec 005's <5s happy
path.

### Phase 5 — GDPR event purge and deletion completion

1. Add/backfill `event_data_purge` first in deletion order.
2. Stop tenant runtime/consumer paths, revoke credentials, delete outbox/DLQ
   rows by tenant ID, and destroy all wrapped keys.
3. Guard publisher/bridge against pending-deletion races.
4. Extend deletion status/UI test expectations to four ordered steps.

**Exit gate**: E2E seeds source and DLQ payloads, starts deletion, and before
`deleted` asserts credentials deny, DB rows are zero, broker ciphertext cannot
be decrypted, schema/realm/bucket are gone, and retries remain idempotent.

### Phase 6 — Confirmed implementation blockers and final production-mode gate

Complete the non-architectural work in Section 9, run both Playwright suites
against built production-mode services and real Postgres/Keycloak/Redis/
Redpanda/MinIO/Loki, and run the full CI gate. No `test.skip`/graceful infra skip,
test-only auth path, direct DB fixture import across service boundaries, or
development plugin route is permitted in this gate.

## 8. Implementation File Map

| Path | Purpose |
| --- | --- |
| `services/core-api/prisma/schema.prisma` | Core models and relations above |
| `services/core-api/prisma/migrations/007_pr77_security_remediation_expand/migration.sql` | Add nullable columns, tables, indexes, safe backfills |
| `services/core-api/prisma/migrations/008_pr77_security_remediation_contract/migration.sql` | Enforce ownership/dedupe NOT NULL, unique, and CHECK constraints after cutover |
| `services/core-api/src/events/event-envelope.ts` | Canonical domain/wire Zod schemas and v1 builder |
| `services/core-api/src/events/event-crypto.ts` | Key wrapping, AES-GCM AAD/encrypt/decrypt/destroy |
| `services/core-api/src/events/outbox-repository.ts` | Transaction-compatible outbox insert/claim/delete |
| `services/core-api/src/events/outbox-publisher.ts` | Leased Kafka publisher and metrics |
| `services/core-api/src/lib/kafka.ts` | Low-level send requiring explicit tenant key/headers; no domain shaping |
| `services/core-api/src/lib/config.ts`, `.env.example` | Zod config for API audience, event key, credential pepper, and plugin DB CA/TLS mode |
| `services/core-api/src/modules/plugin/events/consumer-manager.service.ts` | Source coordinates, validation/filtering, commit semantics |
| `services/core-api/src/modules/plugin/events/event-dispatcher.service.ts` | Decrypted v1 HTTP delivery only |
| `services/core-api/src/modules/plugin/events/dlq.service.ts` | Encrypted source-coordinate DLQ and CAS retry/dismiss |
| `services/core-api/src/modules/plugin/events/dlq-consumer.ts` | Validated bridge and atomic dedupe |
| `services/core-api/src/modules/plugin/services/service-credential.service.ts` | ADR-024 issue/hash/verify/rotate/revoke |
| `services/core-api/src/middleware/plugin-event-auth.ts` | Credential-bound tenant/install/scope authentication |
| `services/core-api/src/modules/plugin/routes/events.routes.ts` | Namespace-bound outbox emission |
| `services/core-api/src/modules/plugin/services/db-role.service.ts` | TLS-safe restricted connection URL |
| `services/core-api/src/modules/plugin/schema/migrations.ts` | Parser AST allowlist and serialization |
| `services/core-api/src/modules/admin/services/tenant-lifecycle-reconciler.ts` | Durable leased suspend/reactivate convergence |
| `services/core-api/src/modules/admin/services/tenant-suspend.service.ts` | DB-first suspended intent |
| `services/core-api/src/modules/admin/services/tenant-reactivate.service.ts` | Suspended-until-ready active intent |
| `services/core-api/src/modules/admin/services/deletion-step-event-data-purge.ts` | Credential/outbox/DLQ/key purge |
| `services/core-api/src/modules/admin/services/deletion-step-executor.ts` | Four-step order and leases |
| `services/core-api/src/middleware/auth-middleware.ts` | Universal API resource audience |
| `services/core-api/src/lib/keycloak-*-client*.ts` | Audience mapper reconciliation |
| `packages/sdk/openapi.yaml`, `packages/sdk/src/` | v1 envelope and credential header contract |
| `examples/plugins/crm/src/routes/events.ts` | Reference v1/idempotent consumer |

Every implementation file remains at or below 200 lines; split repositories,
workers, schemas, and crypto helpers rather than suppressing the gate.

## 9. Non-Architectural Blockers (Implementation Work, No New ADR)

| Blocker | Required implementation result | Primary paths | Phase |
| --- | --- | --- | --- |
| Public invitation route | Register token acceptance outside auth hooks, resolve and validate the active tenant from the request host through a dedicated public resolver, then look up the token in that tenant schema; keep all other invitation routes authenticated | `modules/invitation/routes.ts`, core route registration | 6 |
| Proxy lifecycle/visibility | Resolve workspace role from DB, deny absent membership/hidden/deactivated/suspended installs, keep GET/PATCH visibility response shape consistent, and unregister stale proxy/dev targets | plugin proxy/lifecycle/visibility services/routes | 4/6 |
| CI migrate deploy/Loki | Use migration deploy/status, provision Loki, wait for health, and make logs E2E fail rather than skip | `.github/workflows/ci.yml`, docker infra action | 0/6 |
| SQL splitting | Execute parser-produced approved statements; remove `.split(';')` and add comment/quoted-semicolon corpus | `modules/plugin/schema/migrations.ts`, migration executor | 1 |
| Production-mode E2E | Run built core/web/admin with production branches, TLS-enabled test PostgreSQL for plugin DB tests, real auth/Kafka/Loki, and no dev registration | Playwright configs/global setup, CI | 6 |
| 200-line gate | Blocking check for authored TS/TSX/JS/JSX files; generated/vendor/migration SQL exclusions only | ESLint/script + CI | 0 |
| Node 24 | Root `engines.node >=24`, local/CI image parity, Node 24 type definitions | root manifest/tooling | 0 |
| Logging | Pino only; structural IDs/reason codes; no token, secret, PII, raw payload, raw SQL, external error body, actor email/name, or `console.*` | logger config and touched services | all |

These items apply existing constitutional rules or repair contracts; they do not
change data/auth/infrastructure patterns beyond the ADRs already listed.

## 10. Exact Test and Release Gates

### Required focused tests

- **Unit**: envelope/AAD validation; key destruction; outbox lease; DLQ dedupe
  key; credential syntax/digest/expiry/revoke/rotation/namespace; audience
  options; TLS URL allowlist; parser corpus; lifecycle state machine; deletion
  step order.
- **Integration (real services)**: transaction+outbox; publisher crash/Kafka
  outage; two-tenant consumer filtering; DLQ bridge replay; credential DB and
  tenant binding; Keycloak audience matrix; suspend/reactivate dependency
  outages and restart; production TLS connection; targeted purge.
- **Web Playwright**: public invitation acceptance; CRM event and DB isolation;
  hidden/deactivated proxy denial; DLQ retry/dismiss; credential-backed plugin
  custom event; no graceful skips.
- **Admin Playwright**: PKCE/audience; suspension/reactivation convergence;
  four-step deletion with cryptographic event erasure; Loki filtering; no
  graceful skips.

### Blocking command sequence

Run under Node 24 with frozen lockfile and production-equivalent environment:

```text
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm --filter core-api db:generate
pnpm --filter core-api db:migrate
pnpm --filter core-api exec prisma migrate status
pnpm build
pnpm --filter core-api test
pnpm --filter web test:e2e
pnpm --filter @plexica/admin e2e
```

CI additionally runs: authored-file line gate; fresh DB migration; 006->007
expand upgrade; post-cleanup 007->008 contract upgrade; Keycloak client
reconciliation and audience smoke; broker payload ciphertext inspection;
no-skipped-test assertion; production-mode service startup; and
secret/console/PII log scans. Any failure blocks merge.

### Release acceptance

1. Old deterministic plugin tokens and wrong/missing API audiences are denied.
2. No direct domain `emitEvent` call remains outside outbox publisher/DLQ low-
   level infrastructure.
3. No Kafka source or DLQ domain payload is readable with broker access alone.
4. Outbox oldest pending age, reconciliation backlog/age, DLQ depth, credential
   rotation failures, and consumer lag are observable without payload/PII.
5. Fresh install, rolling upgrade, core crash, Kafka outage, Keycloak outage,
   tenant suspension, reactivation, and deletion all satisfy the invariants.

## 11. Rollout and Compatibility

1. **Preflight**: accept ADR-024; provision production event/credential secrets,
   plugin DB CA mounts, Node 24 images, TLS test DB, and healthy Loki.
2. **Expand**: deploy migration 007 and compatible readers/workers with new
   producers disabled.
3. **Auth first**: add Keycloak audience mappers and verify fresh token claims;
   deploy strict API audience. No dual-audience/master bypass window.
4. **Credential rotation**: issue one-time credentials and roll all plugin
   runtimes; then remove legacy HMAC globally. Failed installs are degraded,
   never granted fallback.
5. **Legacy event maintenance**: pause consumers; migration 007 purges legacy DB
   DLQ rows, then delete/truncate unversioned Kafka source/DLQ records. Records
   without proven tenant ownership are never replayed or copied.
6. **Event cutover**: enable v1 consumers/decrypt/filter, migrate all producers
   to outbox, then start publishers and DLQ bridge.
7. **Lifecycle/deletion cutover**: enable reconcilers, backfill suspended and
   pending-deletion work, then allow lifecycle routes.
8. **Contract**: after observation shows zero legacy records/tokens and healthy
   backlogs, enforce NOT NULL/check constraints and remove compatibility code.

Rollback stops new producers/workers and restores a compatible application
binary while preserving migration data. It must not restore plaintext Kafka,
legacy service tokens, audience bypasses, insecure TLS, or skip completed key
destruction.

## 12. Finding-to-Phase Matrix

| Confirmed finding | Phase(s) | Decision / gate |
| --- | --- | --- |
| Canonical tenant envelope, partition/filter, outbox, IDs/version | 0, 2, 3 | ADR-004; INV 1—4 |
| DLQ ownership, dedupe coordinates/key, targeted purge, Kafka erasure | 0, 3, 5 | ADR-016 + ADR-004 crypto |
| Installation service identity/secret/expiry/revoke/rotate/namespace | 0, 1, 5 | ADR-024 |
| Durable fail-closed suspension/reactivation | 0, 4 | ADR-022 |
| API JWT resource audience for master/tenant/E2E | 1 | ADR-023 |
| Production plugin DB TLS parameters | 1, 6 | ADR-017 |
| Missing `node-sql-parser` dependency decision | 1 | ADR-007 amendment |
| Public invitation route | 6 | Existing public-route pattern; E2E gate |
| Proxy lifecycle/visibility | 4, 6 | Existing ABAC/ADR-018 contract |
| CI migrate deploy and Loki | 0, 6 | Existing ADR-022/Rule 2 implementation |
| SQL splitting | 1 | ADR-007 implementation detail |
| Production-mode E2E | 6 | Rules 1—2/test standards |
| 200-line gate | 0, all | Rule 4 |
| Node 24 | 0 | Constitution backend stack |
| Logging | all | Security PII + Pino standards |

## 13. Constitution Compliance

| Constitution area | Status | Evidence / required gate |
| --- | --- | --- |
| Rule 1 — E2E per feature | Compliant by plan | Real-stack user, plugin, lifecycle, DLQ, invitation, and deletion flows are mandatory. |
| Rule 2 — green CI | Compliant by plan | Exact blocking command sequence; no skips or red checks. |
| Rule 3 — one pattern | Compliant | One envelope/outbox, one user JWT audience, one plugin credential pattern, one SQL parser. |
| Rule 4 — <=200 lines | Compliant by plan | Blocking authored-source gate and decomposed file map. |
| Rule 5 — ADRs | Compliant | ADR-004/007/016/017/022/023 amended; focused ADR-024 accepted. |
| Rule 6 — English commits | N/A in this phase | No commit is created; future commits must be English. |
| Prescribed stack | Compliant | Existing Node 24, TypeScript, Fastify, PostgreSQL, Redis, Kafka, Keycloak, MinIO; no new service. |
| Tenant isolation | Improved | DB schema, event tenant key/filter, credential binding, targeted purge. |
| Authentication | Improved | Universal resource audience and scoped plugin service auth. |
| SQL/input security | Improved | Zod external contracts, AST SQL allowlist, DB grants, parameterized purge. |
| Secrets/PII | Improved | Hash-only service secret, wrapped event keys, TLS, no payload/log exposure, cryptographic erasure. |
| Operations | Compliant | Durable leases, restart reconciliation, metrics, Loki, migration deploy. |

**Overall**: COMPLIANT. ADR-024 was accepted on 2026-07-23 before
implementation. No constitution amendment is required.

## 14. Cross-References

- `.forge/constitution.md`
- `.forge/specs/002-foundations/spec.md`
- `.forge/specs/003-core-features/spec.md`
- `.forge/specs/003-core-features/plan.md`
- `.forge/specs/004-plugin-system/spec.md`
- `.forge/specs/005-super-admin/spec.md`
- `.forge/specs/005-super-admin/plan.md`
- `.forge/knowledge/adr/adr-004-kafka-redpanda-event-bus.md`
- `.forge/knowledge/adr/adr-007-plugin-migrations-core-executed.md`
- `.forge/knowledge/adr/adr-016-two-tier-dead-letter-queue.md`
- `.forge/knowledge/adr/adr-017-plugin-db-access-restriction.md`
- `.forge/knowledge/adr/adr-018-two-level-plugin-visibility.md`
- `.forge/knowledge/adr/adr-022-super-admin-infra-and-data-model.md`
- `.forge/knowledge/adr/adr-023-admin-pkce-auth.md`
- `.forge/knowledge/adr/adr-024-plugin-installation-service-credentials.md`

## 15. Clarifications

No implementation choice remains ambiguous under the confirmed constraints.
The only pre-build action is governance acceptance of ADR-024; it does not
require redesign or additional product clarification.
