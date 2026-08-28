# Plan: 008 - Kafka JavaScript Client Migration

| Field  | Value                                                                  |
| ------ | ---------------------------------------------------------------------- |
| Status | Conditionally approved — Phase 1 spike blocks all functional migration |
| Author | forge-architect                                                        |
| Date   | 2026-08-27                                                             |
| Track  | Epic                                                                   |
| Spec   | [008 Kafka JavaScript Client Migration](./spec.md)                     |

---

## 1. Overview and Boundaries

Replace the Core API's single Kafka transport dependency with exact `@confluentinc/kafka-javascript` `1.10.0`, using only its `KafkaJS` promisified compatibility namespace (same mandatory native addon/bundled librdkafka as the callback-based `RdKafka` API — not a pure-JavaScript escape). Preserve the Kafka/Redpanda topology, encrypted v1 envelope, tenant key, outbox, manual consumer offsets, two-tier DLQ, health/status schemas, SDK HTTP contracts, and shutdown ownership; no production dual-client period or runtime fallback. The plan implements the accepted 2026-08-27 ADR-004 amendment and same-day conditional-spike clarification, and makes **no database migrations, public API changes, UI changes, topic changes, or new environment variables**.

### 1.1 Implementation invariants

The ten implementation invariants are in [plan-appendices-traceability.md §17].

## 2. Current-State Inventory and Mismatch Resolution

Per-file semantic API uses and the mismatch/resolution table: see [plan-appendices.md §1] and [plan-appendices.md §2].

### 2.1 Every direct KafkaJS import

| File                                                     | Current import                           | Required replacement                                                         |
| -------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------- |
| `services/core-api/src/lib/kafka-client.ts`              | `Kafka`, `logLevel`                      | `import { KafkaJS } ...`; `KafkaJS.Kafka`/`logLevel` and compatibility types |
| `services/core-api/src/__tests__/smoke-redpanda.test.ts` | `Kafka`, `Admin`, `Producer`, `Consumer` | Same `KafkaJS` namespace and `KafkaJS.Admin/Producer/Consumer` types         |
| `services/core-api/scripts/verify-kafka-roundtrip.mjs`   | `Kafka`                                  | `import { KafkaJS } ...`; destructure `Kafka` from that namespace            |

No direct Kafka client import exists in `packages/sdk`, `packages/cli`, or `examples/plugins/crm`.

### 2.2 Every current semantic Kafka API use

The repository uses no `assignment()`, `rebalance_cb`, `fetchTopicOffsets()`, or supported consumer `stop()`; the only instrumentation API is `consumer.on('consumer.crash')`, which must be removed rather than emulated.

## 3. Data Model and Public API

### 3.1 Data model

No tables, columns, constraints, indexes, Prisma models, SQL migrations, event schemas, topic settings, partitions, or retention values change; `core.event_outbox`, `core.tenant_event_keys`, and `core.dead_letter_queue` semantics remain authoritative.

### 3.2 HTTP and SDK API

No endpoint, method, authentication rule, status code, request/response schema, or UI contract changes; `PluginSDK.onEvent`, `dispatchEvent`, `emitEvent`, and HTTP event delivery remain unchanged, and deprecated `PluginConfig.kafkaBrokers?: string` stays accepted and ignored.

## 4. Post-PASS Compatibility API and Component Design

### 4.1 Common client configuration

Exact API mode is in [plan-appendices-traceability.md §13]; no `RdKafka` symbol, root callback client, or native fallback exists, and `parseKafkaBrokers()` rejects invalid `KAFKA_BROKERS` segments with `KAFKA_BROKERS_INVALID` without ever logging broker values.

### 4.2 Producer configuration, acknowledgements, and lifecycle

Exact producer config is in [plan-appendices-traceability.md §13]. `sendKafkaEnvelope()` awaits `Producer.send()`, requires a non-empty delivery report and every report's numeric `errorCode` to equal `KafkaJS.ErrorCodes.ERR_NO_ERROR`; failures become a sanitized `KafkaSendError` (`KAFKA_SEND_FAILED`), terminal shutdown stays `KafkaProducerClosedError`/`KAFKA_PRODUCER_CLOSED`. Registration occurs synchronously **before** awaiting `getProducer()`; teardown is memoized with one 30 s deadline, reserves the client's 5 s disconnect budget, never reports success on timeout, and deletes outbox rows only after acknowledgement.

### 4.3 Consumer factory, rebalance, readiness, and offsets

Exact consumer config is in [plan-appendices-traceability.md §13]. Startup is `connect()` -> one `subscribe({ topics })` -> `run()` -> `waitForConsumerAssignment()`; every `run()` sets `partitionsConsumedConcurrently: 1`, never includes `autoCommit`, and shutdown uses `disconnect()` (compatibility `stop()` is unsupported). A `WeakMap` holds assignment, rebalance generation, readiness, closing flag, completed offsets, and owned handlers; `rebalance_cb` checks numeric assign/revoke codes and never commits from the callback, while `processAndCommitMessage()` commits only `offset + 1` in the same generation. Stale generation/assignment, handler/DLQ/DB/transient-key errors, revoke, and commit errors seek/replay; cross-tenant and inactive-tenant skips commit without key access.

### 4.4 Admin, metadata, health, and lag

Normalized `kafka-admin.ts` helpers and the CI verifier rules are in [plan-appendices-traceability.md §15]. Health retains the 200 ms classification (timeout `degraded`, hard errors `down`); the public probe does **not** wait for an uncancellable connect, but an owner registry observes the operation, performs one eventual disconnect, and is awaited by shutdown. Lag polls immediately then every 30 s, logging only install ID, stable code, and category.

### 4.5 Pino bridge and error normalization

Bridge behavior and boundary tables are in [plan-appendices-traceability.md §16]: `kafka-logger.ts` does **not** forward client text/extra, and `kafka-errors.ts` uses `KafkaJS.isKafkaJSError`, numeric `KafkaJS.ErrorCodes`, and `fatal` — never `name`/`type`/message. Public Fastify responses never expose Confluent exceptions.

## 5. Dependencies, Lockfile, and Native Install

Dependency/lock/native-install changes are in [plan-appendices-traceability.md §14] (Phase 1 uses temporary uncommitted equivalents). The root allowlist must permit the package's `node-pre-gyp install --fallback-to-build` script, but source fallback is a gate failure — no compiler/toolchain/system librdkafka may be installed, and the runtime must report bundled `librdkafkaVersion === '2.15.0'`.

### 5.1 Blocking Phase 1 native-deployment gate

Phase 1 runs before committed dependency replacement, in an isolated **uncommitted** worktree on the actual default self-hosted CI runner; temporary manifest/allowlist/lockfile and verification-only import edits are permitted solely to exercise the candidate while KafkaJS remains the production client. Capture evidence externally, then restore the worktree; nothing from the spike may create a production import, dual-client selector, fallback, or mixed-client artifact. Target identities and the KJM-G01—G10 matrix with retained-evidence list are in [plan-appendices.md §3] and [plan-appendices.md §4].

### 5.2 Decision boundary

- **GO / PASS** requires KJM-G01 through KJM-G10 in **both** targets plus a reviewable evidence artifact; then Phase 2 may commit exact 1.10.0.
- **NO-GO / FAIL** is any missing evidence or failed check (source compilation, checksum mismatch, ABI/libc/link/load failure, wrong version, Redpanda semantic failure, leaked handle, Alpine/musl-only or unsupported runtime). After FAIL the user must choose KafkaJS or a pure-JavaScript alternative; the selected path requires a matching ADR and constitution amendment. `packages/sdk`, `packages/cli`, and `examples/plugins/crm` manifests remain unchanged.

## 6. File Map

- Files to create: see [plan-appendices.md §5].
- Files to modify: see [plan-appendices.md §6].
- Files to delete: `patches/kafkajs@2.2.4.patch` — removed client patch, no replacement patch permitted.
- Read-only evidence: SDK/CLI/CRM sources, API type schemas, Prisma files/migrations, topic scripts, Compose files, and public routes are verification-only; historical accepted ADRs, archived reviews, and completed spec/task artifacts are not rewritten.

## 7. Implementation Phases

### Phase 1: Dependency and install contract

1. Create the isolated uncommitted spike worktree on the actual self-hosted runner; temporarily add exact 1.10.0/allowlist/lock and a verification-only import while production Kafka paths stay on KafkaJS.
2. Execute KJM-G01—G10 independently on the runner and fresh digest-pinned Core runtime (real-Redpanda smokes, no-handle exits); publish/review the evidence artifact, then restore all temporary edits. Record one outcome only: PASS releases Phase 2; FAIL pauses the Epic for the user decision in §5.2. Do not start Phase 2—5 before PASS.

### Phase 2: Transport primitives

1. Only after PASS, commit exact 1.10.0 and the native allowlist/lock changes; remove KafkaJS, its patch/file, and the CRM workaround atomically with the migrated transport.
2. Implement broker parsing, Pino bridge, error mapping, compatibility client, producer ownership/teardown, consumer rebalance/assignment/guarded commit, and admin/leader/lag helpers. Convert the proven Phase 1 checks into a permanent blocking CI gate; keep every authored file at or below 200 lines.

### Phase 3: Production consumers and lifecycle

1. Decompose consumer manager, adopt managed consumers, and extend the same commit/rebalance semantics to the system DLQ bridge; wire lag timer ownership to create/delete/disconnect-all paths without changing response schemas; preserve three plugin handler attempts; correct event-worker reverse stop order.

### Phase 4: Admin and deterministic real-broker verification

1. Migrate the health probe and lag poller to normalized admin helpers; rewrite the CI verifier around temporary-topic leader metadata and consumer assignment; migrate the blocking Redpanda smoke test (remove conditional skips/fixed readiness sleeps) and update event-pipeline and Playwright probes to wait for assignment before causing events.

### Phase 5: Regression/security coverage and guidance

1. Add lifecycle, ack, error, logger, offset, rebalance, admin, shutdown, and real-broker tests; run existing outbox/two-tenant/DLQ/deletion tests unchanged or with readiness-only updates. Split SDK event tests and prove deprecated config compatibility with no transport dependency; refresh active architecture/docs and run a final client/patch audit.

## 8. Testing and Verification Strategy

### 8.1 Updated tests

See [plan-appendices.md §7].

### 8.2 Newly added tests

See [plan-appendices.md §8].

### 8.3 Commands and staged gates

#### 8.3.1 Phase 1 gate — first and blocking

Execute the KJM-G01—G10 matrix in §5.1 on the actual self-hosted runner and the fresh pinned Core runtime; generate the temporary lock before the two independent clean-store frozen installs (exact pnpm 10.33.0, separate empty stores) and run the real Redpanda smoke once per target. No Phase 2 command is authorized until the evidence summary is PASS/PASS; restore the worktree after evidence capture regardless of outcome.

#### 8.3.2 Post-PASS full migration gates

After PASS, run the ordered command gates in [plan-appendices-traceability.md §13]; do not use skip flags. Final audits must show no active client residue (`rg` on `kafkajs` imports, patch/lock references, `pnpm why kafkajs`); Confluent appears only in Core API's direct manifest and lock graph. The combined Core unit+integration coverage run is the KJM evidence run, not the unit-only ADR-030 report, and must satisfy the constitutional `>=80%` target before merge; otherwise record it as a pre-existing governance/release blocker for human resolution.

## 9. Rollout and Rollback

### 9.1 Rollout

1. Complete the uncommitted Phase 1 KJM-G01—G10 spike in both targets (PASS/PASS); on FAIL stop here.
2. After PASS, complete committed install/type/unit gates, then isolated real-Redpanda round-trip and admin metadata checks; run Core integration tests, then encrypted event/DLQ/deletion Playwright flows.
3. Deploy first to staging against the supported three-node topology; promote only with no leaked clients/open handles and no plaintext/cross-tenant evidence.

### 9.2 Rollback

Rollback is an atomic application+manifest+lock revert to the last known-good release, never a dual-client switch; stop plugin consumers and event workers before replacing the process. Kafka wire records, topics, group IDs, and database rows are unchanged, so the previous release resumes from committed offsets; unacknowledged outbox/DLQ work remains pending and duplicate acknowledged-but-not-deleted events retain the same `eventId`. Rollback may restore the previous dependency but must not restore direct domain publication, plaintext payloads, producer DLQ, or retention-only erasure; no database rollback is needed. Before migration, Phase 1 FAIL is not rollback — release is blocked rather than rolled forward on any native/checksum/ABI/Redpanda/handle/runtime failure.

## 10. Requirement Traceability

See [plan-appendices-traceability.md §9] for the KJM-001—KJM-023 / KJM-NFR-001—KJM-NFR-008 traceability table.

## 11. Architectural Decisions and Constitution Compliance

### 11.1 Decisions

| ADR                                              | Applicable decision                                                                                       | Status                                                        |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| ADR-004 + 2026-07-23 amendment                   | Kafka/Redpanda, tenant partition key, encrypted v1 envelope, transactional outbox                         | Accepted                                                      |
| ADR-004 + 2026-08-27 amendment and clarification | Exact Confluent 1.10.0 and compatibility API, conditionally adopted only after the mandatory native spike | Accepted / Phase 1 PASS (run 33081239038 PASS/PASS, reviewed) |
| ADR-016 + 2026-07-23 amendment                   | Encrypted two-tier DLQ, ack-before-commit, stable dedupe/ownership/replay                                 | Accepted                                                      |
| ADR-022 + 2026-07-23 amendment                   | Event purge first, active-tenant rechecks, key destruction before deletion                                | Accepted                                                      |

Phase 1 native spike is PASS (run 33081239038 PASS/PASS, reviewed) — functional migration is authorized under the existing conditional approval (see native-spike-artifact-analysis.md); any attempt to add another dependency, use the native callback API in production, change retries/delivery guarantees, or alter data/auth/infrastructure must stop and amend the architecture first.

### 11.2 Constitution compliance report

**Overall status: COMPLIANT BY PLAN, PHASE 1 PASS (run 33081239038 PASS/PASS, reviewed), WITH A PRE-EXISTING COVERAGE GATE** (coverage >=80% still required).

See [plan-appendices-traceability.md §10] for the per-article compliance table.

**Tensions:** Constitution v1.1 names the conditionally approved Confluent client (migration authorized, KafkaJS removal tracked by KJM-017/import audit); ADR-030 documents unit-only coverage at approximately 23% with no gate, so this plan adds combined evidence and blocks merge below 80% while avoiding unrelated test expansion. Implementation is not complete until dependency/import/patch audits are clean, coverage is evidenced at >=80%, and CI is green.

## 12. Estimates, Risks, and Readiness

### 12.1 Estimates

Approximately 24 files modified, 15 created (including tests/decomposition), 1 deleted, plus generated `pnpm-lock.yaml`; approximately 34 tasks across five ordered phases. No-change surface: SDK/CLI/example manifests and sources, API schemas/routes, Prisma schema/migrations, broker/Compose topology.

### 12.2 Principal risks

See [plan-appendices-traceability.md §12].

### 12.3 Readiness

The plan is complete against KJM-001 through KJM-023 and KJM-NFR-001 through KJM-NFR-008. It is **ready only for a Phase 1 blocker-task breakdown and execution**; Phase 2—5 tasks must not be created or started until KJM-G01—G10 produce reviewed PASS/PASS evidence. PASS makes the migration plan actionable without changing package 1.10.0; FAIL pauses Spec 008 for the user's governed KafkaJS-versus-pure-JavaScript decision.

---

## Cross-References

| Document                      | Path                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| Approved spec                 | `.forge/specs/008-kafka-javascript-migration/spec.md`                                   |
| Constitution v1.1             | `.forge/constitution.md`                                                                |
| Architecture                  | `.forge/architecture/architecture.md` §5.2, §6.3, §7.1-7.3                              |
| Event bus/client decision     | `.forge/knowledge/adr/adr-004-kafka-redpanda-event-bus.md`                              |
| DLQ decision                  | `.forge/knowledge/adr/adr-016-two-tier-dead-letter-queue.md`                            |
| Tenant event purge            | `.forge/knowledge/adr/adr-022-super-admin-infra-and-data-model.md` amendment 2026-07-23 |
| Coverage reporting constraint | `.forge/knowledge/adr/adr-030-vitest-coverage-v8.md`                                    |
| Plan appendices               | `.forge/specs/008-kafka-javascript-migration/plan-appendices.md`                        |
| Plan appendices (traceability) | `.forge/specs/008-kafka-javascript-migration/plan-appendices-traceability.md`          |
