# Plan: 008 - Kafka JavaScript Client Migration

> Technical implementation plan for the Epic track. Created by `forge-architect` via `/forge-plan`, then revised by adversarial analysis.

| Field  | Value                                                                  |
| ------ | ---------------------------------------------------------------------- |
| Status | Conditionally approved — Phase 1 spike blocks all functional migration |
| Author | forge-architect                                                        |
| Date   | 2026-08-27                                                             |
| Track  | Epic                                                                   |
| Spec   | [008 Kafka JavaScript Client Migration](./spec.md)                     |

---

## 1. Overview and Boundaries

After a blocking deployment spike passes, replace the Core API's single Kafka transport dependency with exact `@confluentinc/kafka-javascript` `1.10.0`, using only its `KafkaJS` promisified compatibility namespace. Both that namespace and the callback-based `RdKafka` API require the same native addon and bundled librdkafka; the selected compatibility API is not a pure-JavaScript escape from deployment risk. Preserve the Kafka/Redpanda topology, canonical encrypted v1 envelope, tenant key, outbox, manual consumer offsets, two-tier DLQ, health/status response schemas, SDK HTTP contracts, and shutdown ownership. There is no production dual-client period or runtime fallback.

This plan implements the accepted 2026-08-27 ADR-004 amendment and same-day conditional-spike clarification. The package, exact version, and compatibility API remain user-approved; adoption and all functional migration are conditional on Phase 1 PASS. A FAIL pauses this plan for a user decision and subsequent ADR/constitution amendment. There are **no database migrations, public API changes, UI changes, topic changes, or new environment variables**.

### 1.1 Implementation invariants

1. An awaited, successful Confluent delivery report is the only producer acknowledgement boundary; outbox deletion remains later and transactional in PostgreSQL.
2. `tenantId` remains the Kafka key. The value and existing headers remain byte-for-byte equivalent JSON content; DLQ replay retains the explicit original partition.
3. Every consumer uses `autoCommit: false`; only `offset + 1` is committed after the required dispatch, intentional skip, permanent poison decision, or acknowledged DLQ/bridge write.
4. Revocation never commits in-flight work. A completed-but-uncommitted record may replay, which is permitted by at-least-once delivery.
5. Consumer assignment, not a sleep or `run()` resolution, is the readiness gate.
6. Shutdown first closes admission to new work, disconnects plugin consumers, stops DLQ/outbox workers, settles owned producer sends, and then disconnects the producer before PostgreSQL/Redis.
7. Client logs/errors are normalized to stable platform codes and allowlisted coordinates. Raw messages, objects, payloads, headers, keys, endpoints, credentials, and domain-data stacks are never logged.
8. The compatibility worker stores a successful `eachMessage` offset internally even with auto-commit disabled. Therefore a stale generation/assignment or failed explicit commit must throw from the handler so the client seeks the record instead of treating it as processed.
9. Health retains its 200 ms response contract. A timed-out native connect cannot be synchronously cancelled; its observed operation/cleanup is owned until settlement and is awaited during shutdown.
10. Phase 1 is a hard predecessor of every functional task. A temporary Confluent import may coexist with KafkaJS only in the uncommitted verification worktree; KafkaJS remains the sole production client until PASS, and no dual-client/fallback production path may be authored or shipped.

## 2. Current-State Inventory and Mismatch Resolution

### 2.1 Every direct KafkaJS import

Repository enumeration found exactly three runtime/test/script imports of the `kafkajs` package:

| File                                                     | Current import                           | Required replacement                                                                                                              |
| -------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `services/core-api/src/lib/kafka-client.ts`              | `Kafka`, `logLevel`                      | `import { KafkaJS } from '@confluentinc/kafka-javascript'`; use `KafkaJS.Kafka`, `KafkaJS.logLevel`, and compatibility types only |
| `services/core-api/src/__tests__/smoke-redpanda.test.ts` | `Kafka`, `Admin`, `Producer`, `Consumer` | Same `KafkaJS` namespace and `KafkaJS.Admin/Producer/Consumer` types                                                              |
| `services/core-api/scripts/verify-kafka-roundtrip.mjs`   | `Kafka`                                  | `import { KafkaJS } ...`; destructure `Kafka` from that namespace                                                                 |

No direct Kafka client import exists in `packages/sdk`, `packages/cli`, or `examples/plugins/crm`.

### 2.2 Every current semantic Kafka API use

| File                                                                 | Actual semantic use today                                                                                                                              | Planned mapping                                                                                                                                                                       |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/kafka-client.ts`                                            | `new Kafka`, common brokers/client ID/log level/retry; derives producer/consumer/admin types                                                           | `new Kafka({ kafkaJS: {...} })`; validated brokers; Pino bridge; compatibility types                                                                                                  |
| `src/lib/kafka-producer.ts`                                          | `producer({allowAutoTopicCreation})`, `connect`, failed-connect `disconnect`, shutdown `disconnect`                                                    | Producer `kafkaJS` block with explicit acks/retry/auto-create plus outer `linger.ms`; tracked sends and terminal teardown                                                             |
| `src/lib/kafka.ts`                                                   | `producer.send`; `consumer(...)`; `consumer.on('consumer.crash')`; `admin()`                                                                           | Await and validate delivery report; managed consumer/rebalance helpers; remove unsupported instrumentation listener; fresh compatibility admin                                        |
| `modules/plugin/events/consumer-manager.service.ts`                  | `connect`, repeated `subscribe({topic,fromBeginning})`, `run({autoCommit,eachMessage})`, `commitOffsets`, `pause`, `resume`, `disconnect`              | Constructor-level offset options; one `subscribe({topics})`; concurrency 1; assignment gate; generation-guarded manual commit; pause/resume only while assigned; disconnect-only stop |
| `modules/plugin/events/dlq-consumer.ts`                              | `connect`, `subscribe`, `run({autoCommit})`, manual commit, `disconnect`                                                                               | Same managed manual-commit path and readiness/rebalance rules as installation consumers                                                                                               |
| `modules/plugin/events/lag-metrics.service.ts`                       | transient admin `connect`, `fetchOffsets`, `disconnect`                                                                                                | Shared transient-admin owner; normalize group offsets and topic high watermarks; always disconnect                                                                                    |
| `modules/admin/services/health-check-kafka.ts`                       | transient admin `connect`, `listTopics`, duplicate-path `disconnect`                                                                                   | Bounded `listTopics({timeout})` through `withKafkaAdmin`; one `finally` cleanup                                                                                                       |
| `scripts/verify-kafka-roundtrip.mjs`                                 | admin `connect/describeCluster/createTopics/deleteTopics/disconnect`; producer `connect/send/disconnect`; consumer `connect/subscribe/run/disconnect`  | Replace unavailable `describeCluster`; poll topic metadata/leaders; assignment readiness; complete `finally` cleanup                                                                  |
| `src/__tests__/smoke-redpanda.test.ts`                               | admin `connect/listTopics/createTopics/fetchTopicMetadata/disconnect`; producer `connect/send/disconnect`; consumer `connect/subscribe/run/disconnect` | Real Confluent/Redpanda coverage, no skip, temporary topic, leader/assignment gates, deterministic cleanup                                                                            |
| `src/__tests__/event-pipeline.test.ts`                               | wrapper consumer `connect/subscribe/run/disconnect`                                                                                                    | Remove per-subscribe offset option and await actual assignment before outbox publication                                                                                              |
| `apps/web/e2e/plugin-system/ac-06-dlq.spec.ts`                       | wrapper consumer `connect/subscribe/run/disconnect`                                                                                                    | Await assignment before triggering source/DLQ/replay events; bounded cleanup in `finally`                                                                                             |
| `apps/admin/e2e/helpers/deletion-event-infrastructure.ts`            | wrapper `sendKafkaEnvelope`                                                                                                                            | No call-shape change; verifies the migrated producer through the existing wrapper                                                                                                     |
| `events/outbox-publisher.ts`, `modules/plugin/events/dlq.service.ts` | wrapper `sendKafkaEnvelope`                                                                                                                            | No domain call-shape change; inherit acknowledged send and closed-producer behavior                                                                                                   |
| `events/event-key-service.ts`, `installation-message-processor.ts`   | key lookup/unwrap/decrypt failures currently collapse into broad catches                                                                               | Introduce stable internal failure classes so transient key/DB availability never commits while permanent poison follows the acknowledged-DLQ rule                                     |
| plugin lifecycle route/services                                      | pause/resume/delete and tenant lifecycle call consumer-manager methods                                                                                 | Keep call shapes where possible; make the consumer entry own lag start/stop so every lifecycle path is covered                                                                        |

There is no current `assignment()`, `rebalance_cb`, `fetchTopicOffsets()`, or supported consumer `stop()` use. The only instrumentation API is `consumer.on('consumer.crash')`; it must be removed rather than emulated.

### 2.3 Explicit mismatches and resolutions

| Mismatch                                                                                         | Resolution in this feature                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manifest/lock still use patched KafkaJS although ADR-004 and Constitution v1.1 select Confluent  | Replace dependency and remove every patch/lock reference before code migration is considered complete                                                                                                                       |
| `fromBeginning` is passed to `subscribe`, and `autoCommit` to `run`; Confluent 1.10 rejects both | Put both in the consumer constructor `kafkaJS` block                                                                                                                                                                        |
| Producer relies on defaults and does not track sends racing teardown                             | Set explicit acks/retries/backoff/linger and track all owned send promises                                                                                                                                                  |
| Consumers have no assignment/rebalance state and tests use fixed sleeps                          | Add `rebalance_cb`, assignment generation, bounded readiness helper, and remove sleeps                                                                                                                                      |
| Current crash listener is client-specific and unsupported                                        | Use the sanitized logger, rebalance callback, assignment state, and stable failure logs                                                                                                                                     |
| CI verifier uses unavailable `describeCluster()` and implicit leader waiting                     | Poll `fetchTopicMetadata({topics:[temporaryTopic]})`; inspect partition `leaderNode`; never pass `waitForLeaders`                                                                                                           |
| Health timeout can race a second disconnect; script setup failures can leak clients/topic        | Centralize ownership in `finally`; script cleanup starts immediately after allocation                                                                                                                                       |
| A 200 ms health result conflicts with waiting for an uncancellable native connect and disconnect | Race the public result at 200 ms, but retain an observed cleanup promise in a probe-owner registry; shutdown awaits that registry. Never claim the client is disconnected before the health response returns                |
| Compatibility `fetchTopicMetadata()` returns `ITopicMetadata[]`, not KafkaJS `{ topics: [...] }` | Normalize the array explicitly; tests compile against 1.10.0 types and assert `partitionId`, `leader`, and optional `leaderNode`                                                                                            |
| The verifier receives the comma-separated `KAFKA_BROKERS` contract but treats it as one broker   | Parse all entries, bootstrap with the array, and accept a leader advertised at any configured endpoint; use a UUID-suffixed topic so cleanup cannot delete another run's topic                                              |
| Installation and bridge code collapse transient key lookup with permanent decrypt poison         | Add typed internal key/decrypt outcomes and fault tests; transient DB/key availability rethrows without DLQ/commit, while permanent authenticated poison follows existing sanitized DLQ/commit rules                        |
| Lag helper sums committed offsets rather than lag and is never started                           | Preserve the response schema/timer interval but compute `max(0, high - committed)` and start/stop monitoring with the consumer lifecycle. This is the minimum KJM-014 compatibility correction, not a Kafka-status redesign |
| Event worker stop order is not the documented reverse of startup                                 | Stop DLQ consumer before outbox publisher; both finish before producer teardown                                                                                                                                             |
| Real Redpanda smoke test conditionally skips                                                     | Remove reachability skip; unavailable Redpanda is a blocking integration failure                                                                                                                                            |
| Architecture/docs contain stale envelope/group/client guidance                                   | Update only active Kafka guidance; historical ADR/spec/review records remain historical                                                                                                                                     |
| `consumer-manager.service.ts` is already 193 lines and SDK test is 199 lines                     | Decompose before adding behavior; every authored code/test file remains at most 200 lines                                                                                                                                   |
| `.github/workflows/ci.yml` is already 194 lines and the coverage action is not invoked           | Put native/coverage logic in composite actions and add only short `uses:` steps; prove the workflow remains <=200 lines                                                                                                     |
| New 190-195 line estimates leave no maintenance headroom                                         | Split consumer state/commit and integration fixtures; target <=160 lines for new authored files rather than treating 200 as a design target                                                                                 |

## 3. Data Model and Public API

### 3.1 Data model

No tables, columns, constraints, indexes, Prisma models, SQL migrations, event schemas, topic settings, partitions, or retention values change. Existing `core.event_outbox`, `core.tenant_event_keys`, and `core.dead_letter_queue` semantics remain authoritative.

### 3.2 HTTP and SDK API

No endpoint, method, authentication rule, status code, request/response schema, or UI contract changes. `/health`, `GET /api/v1/admin/system/kafka`, and DLQ endpoints continue to validate existing schemas. `PluginSDK.onEvent`, `dispatchEvent`, `emitEvent`, and HTTP event delivery remain unchanged; deprecated `PluginConfig.kafkaBrokers?: string` remains accepted and ignored.

## 4. Post-PASS Compatibility API and Component Design

### 4.1 Common client configuration

Only after Phase 1 PASS, `kafka-client.ts` uses this exact API mode:

```ts
import { KafkaJS } from '@confluentinc/kafka-javascript';
const { Kafka, logLevel } = KafkaJS;
new Kafka({ kafkaJS: { brokers, clientId: 'plexica-core', logLevel: logLevel.ERROR, logger } });
```

No symbol is imported from `RdKafka`, no root callback client is constructed, and no native fallback exists. `parseKafkaBrokers()` splits the sole `KAFKA_BROKERS` contract, trims each segment, rejects empty segments/schemes/missing or out-of-range ports with `KAFKA_BROKERS_INVALID`, and never includes broker values in errors/logs. Hostnames such as `redpanda:9092` and host listeners such as `127.0.0.1:19092` remain valid.

### 4.2 Producer configuration, acknowledgements, and lifecycle

Construct the singleton producer as:

```ts
kafkaClient.producer({
  kafkaJS: {
    allowAutoTopicCreation: true,
    acks: -1,
    retry: { retries: 3, initialRetryTime: 100 },
  },
  'linger.ms': 0,
});
```

The common retry block also states `initialRetryTime: 100` and `retries: 3`; producer-local values make the Produce ceiling unambiguous. Do not enable idempotence/transactions or alter topic creation.

`sendKafkaEnvelope()` retains key/value/headers/partition shaping. It awaits `Producer.send()`, requires a non-empty delivery report for the one record, and requires every report's numeric `errorCode` to equal `KafkaJS.ErrorCodes.ERR_NO_ERROR`. A throw, missing/failed report, connection failure, or closed state becomes a sanitized internal `KafkaSendError` with code `KAFKA_SEND_FAILED`; terminal shutdown remains `KafkaProducerClosedError`/`KAFKA_PRODUCER_CLOSED`. Client messages are not copied into either error.

The lifecycle state machine adds an in-flight operation set. Registration occurs synchronously **before** awaiting `getProducer()` so shutdown cannot miss a send waiting on connect. After `closed=true`, no caller can acquire an operation slot. Teardown is memoized and uses one 30 s deadline: invalidate connecting generations; settle connect/sends until the deadline reserves the client's 5 s disconnect budget; disconnect the active/orphan producer; then settle resulting rejections. No timeout path reports success. Failed-connect instances are best-effort disconnected and discarded; the next pre-shutdown send may create a fresh instance. An admitted pre-shutdown send may acknowledge; a send admitted after close always fails. Outbox rows are deleted only after this acknowledgement and existing lease acknowledgement.

### 4.3 Consumer factory, rebalance, readiness, and offsets

Move consumer-specific behavior to `kafka-consumer.ts`. Constructor mapping:

```ts
kafkaClient.consumer({
  kafkaJS: {
    groupId,
    sessionTimeout: 30_000,
    heartbeatInterval: 3_000,
    fromBeginning: false,
    autoCommit: false,
  },
  rebalance_cb,
});
```

Test-only callers that need earliest reset pass `fromBeginning: true` at construction; production plugin and DLQ groups always use false. The required startup sequence is `connect()` -> one `subscribe({ topics })` -> `run()` -> `waitForConsumerAssignment()`, because assignment cannot occur before polling starts. Every `run()` sets `partitionsConsumedConcurrently: 1` and never includes `autoCommit`. Never call compatibility `stop()`; use `disconnect()`.

Maintain per-consumer state in a `WeakMap`: current assignment set, monotonically increasing rebalance generation, readiness deferred/poll state, closing flag, completed-next-offset map, and owned handler promises. `rebalance_cb(error, assignment)` checks numeric `ERR__ASSIGN_PARTITIONS`/`ERR__REVOKE_PARTITIONS`; assignment updates readiness, revoke increments the generation and removes revoked completion state. It does not commit from the callback. Unexpected/fatal codes log only stable code/category and force retry/disconnect handling.

`waitForConsumerAssignment(consumer, timeoutMs)` succeeds only when `consumer.assignment()` is non-empty for the current generation. Default bounded startup timeout is 15 seconds. On timeout/failure, the creator disconnects the partial consumer before propagating `KAFKA_CONSUMER_NOT_READY`.

`processAndCommitMessage()` captures assignment generation, awaits the existing application handler, records `offset + 1` as completed, then commits that exact coordinate only if the partition is still assigned in the same generation. Stale generation/assignment must throw rather than return, because v1.10 stores successful handler offsets internally even when `autoCommit:false`. Handler/DLQ/DB/transient-key errors, revoke, and commit errors therefore cause the compatibility worker to seek/replay. A broker generation may change while the JavaScript rebalance callback is delayed until the blocked handler returns; the commit can then fail despite an unchanged local generation, so commit failure is an independent no-loss boundary and must be exercised against real Redpanda. Cross-tenant and inactive-tenant skips return successfully and therefore commit without key access. With concurrency 1, no later record in a partition can finalize ahead of the current record; different consumer groups remain independent.

Key/decrypt handling is explicit at both source and DLQ bridge boundaries. Database/key-row lookup and unwrap availability are transient and rethrow without source commit. A wire/schema/authentication failure proven with an available key is permanent and follows the existing sanitized encrypted-DLQ or bridge-poison decision. Tenant status is rechecked before either decision. No broad `catch` may convert an unknown key/DB failure into an acknowledged poison record.

Pause/resume first require a live assignment and mutate `isRunning` only after the synchronous compatibility call succeeds. Delete/shutdown marks the entry closing, disconnects, and awaits its owned handler set. Creation failure always removes `pendingConsumers` and disconnects. Active-group reporting includes only assigned, non-closing entries.

### 4.4 Admin, metadata, health, and lag

`kafka-admin.ts` owns these normalized helpers:

| Helper                                          | Contract                                                                                                                                                                                                                    |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `withKafkaAdmin(operation)`                     | Create/connect one admin, run operation, disconnect once in `finally`; cleanup failure is sanitized and does not hide the primary failure                                                                                   |
| `waitForTopicLeaders(admin, topics, timeoutMs)` | Poll `fetchTopicMetadata({topics, timeout})`, normalize its direct `ITopicMetadata[]` result, and wait until every partition has non-negative `leader` and a `leaderNode`; bounded retry, no fixed sleep as readiness proof |
| `getConsumerGroupLag(admin, groupId, topics)`   | Read `fetchOffsets({groupId,topics})` plus `fetchTopicOffsets(topic)`; sum `max(0, high - committed)` per partition, treating an unset/negative committed offset as the low/start position                                  |
| `probeKafkaAdmin(timeoutMs)`                    | Bounded `listTopics({timeout})`; return stable success/timeout/client-failure outcome                                                                                                                                       |

The CI script replaces `describeCluster()` by creating a UUID-suffixed temporary topic, waiting for leaders, and checking each partition's `leaderNode` host/port against any endpoint parsed from the comma-separated manifest broker list. `createTopics()` has no `waitForLeaders`. The script records whether it created the topic and deletes only its unique topic. It allocates resources inside one outer `try/finally`; cleanup order is consumer, producer, topic deletion, admin disconnect, with `Promise.allSettled` only for secondary cleanup after preserving the primary error.

Health retains the 200 ms classification: timeout is `degraded`, hard client errors are `down`, and response fields do not change. The public probe does **not** wait for an uncancellable connect to settle after timeout. Instead, an owner registry observes the operation, performs one eventual disconnect, suppresses no primary error, and is awaited by process shutdown. Lag polling performs an immediate first sample and then retains the 30-second interval and stable API fields, but logs only install ID, stable code, and error category; pause/delete stops the timer and resume restarts it.

### 4.5 Pino bridge and error normalization

`kafka-logger.ts` implements the Confluent `KafkaJS.Logger` methods (`debug/info/warn/error`, `namespace`, `setLogLevel`). Because client-generated text/extra objects can contain broker coordinates or record/error data, the bridge does **not** forward them. It emits a fixed message with allowlisted `{ code, component, level }`; namespaces are mapped to a fixed known component or `unknown`. Explicit platform logs cover connect/disconnect, rebalance assignment/revoke, send failure, lag failure, DLQ bridge failure, and shutdown.

`kafka-errors.ts` uses `KafkaJS.isKafkaJSError`, numeric `KafkaJS.ErrorCodes`, and `fatal`; it never classifies by `name`, `type`, or message. Numeric groups map to stable categories (`timeout`, `transport`, `authentication`, `authorization`, `rebalance`, `state`, `unknown`) and platform outcomes:

| Boundary                                               | Platform outcome                                                           |
| ------------------------------------------------------ | -------------------------------------------------------------------------- |
| Producer closed                                        | `KAFKA_PRODUCER_CLOSED`, retryable by durable outbox after process restart |
| Any unacknowledged/failed delivery                     | `KAFKA_SEND_FAILED`, outbox/DLQ source offset retained                     |
| Consumer transport/rebalance/commit failure            | `KAFKA_CONSUMER_RETRY`, source offset retained                             |
| Existing schema/identity/decrypt poison classification | Existing bounded `DLQ_*`/event code, no raw client error                   |
| Health timeout                                         | `degraded`                                                                 |
| Fatal/auth/authorization/unreachable health error      | `down`                                                                     |

Use named `ErrorCodes` constants (including timeout/transport/all-brokers-down/auth/authorization/state/assign/revoke codes), not copied numeric literals. Aggregate errors are flattened only to numeric codes/fatal flags. Public Fastify responses remain generic and never expose Confluent exceptions.

## 5. Dependencies, Lockfile, and Native Install

The following repository changes are post-PASS migration changes; Phase 1 uses
temporary uncommitted equivalents and restores them after evidence capture.

| File                              | Required change                                                                                                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `services/core-api/package.json`  | Replace `"kafkajs": "^2.2.4"` with exact `"@confluentinc/kafka-javascript": "1.10.0"`                                                                                                       |
| `package.json`                    | Add `@confluentinc/kafka-javascript` to `pnpm.onlyBuiltDependencies`; remove the entire now-empty `patchedDependencies` object                                                              |
| `pnpm-lock.yaml`                  | Regenerate with pnpm 10.33.0; add exact Confluent/native transitive graph; remove patchedDependencies metadata, importer entry, package snapshot, patch hash, and all KafkaJS graph entries |
| `patches/kafkajs@2.2.4.patch`     | Delete                                                                                                                                                                                      |
| `pnpm-workspace.yaml`             | Replace stale single-workspace dependency comment                                                                                                                                           |
| `examples/plugins/crm/Dockerfile` | Remove `COPY patches/`, patch explanation, and builder-only manifest mutation; filtered deploy must succeed without a patch declaration                                                     |

The root allowlist must be edited before install so pnpm permits the package's `node-pre-gyp install --fallback-to-build` script, but source fallback is a gate failure, not an installation strategy. No compiler/build toolchain or system librdkafka may be installed to make the package succeed. The expected runtime reports bundled `librdkafkaVersion === '2.15.0'`. Unsupported runner/runtime combinations block adoption rather than adding native setup. If production requires only Alpine/musl or any runtime not proven by the gate, this plan fails even if a musl release asset exists.

### 5.1 Blocking Phase 1 native-deployment gate

Phase 1 runs before committed dependency replacement or functional source
migration. It uses an isolated, **uncommitted** worktree on the actual default
self-hosted CI runner. Temporary manifest, allowlist, lockfile, and
verification-only import/script edits are permitted solely to exercise the
candidate while KafkaJS remains the production client. Capture evidence
externally, then restore the worktree. Nothing from the spike may create a
production import, dual-client selector, fallback, or deployable mixed-client
artifact.

Run the complete gate independently in both targets; host success does not
substitute for container success:

| Target       | Required identity                                                                                                                                                                                                                                                                        |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CI host      | The actual default `self-hosted` runner used by `.github/workflows/ci.yml`; capture runner/run identity, `uname`, `process.version`, `process.versions.modules`, `process.arch`, and `process.report` glibc runtime.                                                                     |
| Core runtime | A fresh container from `node:24-bookworm@sha256:934240a162082fd8b8a2f90cd5114446443f1eba1c5378f6687167ca405e6584`, the `core-api-e2e` image in `infra/compose/docker-compose.ci-runtime-services.yml`; verify the pulled image ID/digest and capture the same Node/ABI/arch/glibc facts. |

For **each** target, all checks below are mandatory:

| Gate ID | Exact PASS condition                                                                                                                                                                                                                                                                                                                                                                                                                 | Required retained evidence                                                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| KJM-G01 | Use Node 24 and exact pnpm 10.33.0. Start with absent `node_modules` and a new empty target-specific pnpm store; after the temporary lock is prepared, `pnpm install --frozen-lockfile --store-dir <empty-store>` succeeds.                                                                                                                                                                                                          | Version/runtime facts, empty-store path/proof, command line, exit code, complete append-only install log.                                                 |
| KJM-G02 | The resolved npm package is exactly `@confluentinc/kafka-javascript` 1.10.0 and its npm tarball integrity matches the temporary frozen lock. No other version is accepted automatically.                                                                                                                                                                                                                                             | Manifest/lock excerpts, `pnpm list` result, package metadata, lock integrity verification.                                                                |
| KJM-G03 | `node-pre-gyp` selects and downloads `confluent-kafka-javascript-v1.10.0-node-v${process.versions.modules}-linux-glibc-${process.arch}.tar.gz`; install contains no source compilation, `node-gyp`, `make`, C/C++ compiler, CMake, or source-fallback execution. The package's configured `--fallback-to-build` option may appear in the command line, but any actual fallback/source-build path is FAIL even if install exits zero. | Selected asset URL/name and full install/process log with explicit negative scan for source-build execution.                                              |
| KJM-G04 | The downloaded asset SHA-256 equals the digest returned for that exact asset by the GitHub v1.10.0 release API. For Node ABI 137, expected published digests are x64 `ccc2a8b2fcf89e01c7dd6895ddfc2ad5599aff32bf090d6b9e02854f64e66358` and arm64 `5f057e2c67eaed9ba31260e5a449d86dadb6fa5823e5d1fc7df2ebed1628efd8`; another ABI must have its exact API-published digest captured and matched.                                     | Release API response, HTTPS download URL, asset name/size, published digest, locally computed SHA-256, equality result. Missing or `null` digest is FAIL. |
| KJM-G05 | Importing the package loads the native addon without flags or library-path workarounds; package version is 1.10.0 and exported `librdkafkaVersion` is exactly 2.15.0. Loading either JavaScript API surface is recorded as loading the same mandatory native addon; functional smoke remains compatibility-API-only.                                                                                                                 | Import/load transcript, resolved addon path, versions, process exit code.                                                                                 |
| KJM-G06 | `file`/ELF inspection matches the target architecture and glibc; `ldd` on the loaded `.node` addon reports no `not found` or unresolved shared library, and the addon loads in the pinned Bookworm runtime without host-only libraries or `LD_LIBRARY_PATH`.                                                                                                                                                                         | `file`, `readelf`/glibc requirement, and full `ldd` outputs from each target.                                                                             |
| KJM-G07 | Against the real project Redpanda, a compatibility-API admin creates a unique temporary topic and observes leader metadata; a ready assigned consumer with `autoCommit:false` receives a keyed record from an acknowledged producer send; processing explicitly commits exactly `offset + 1`; admin reads the resulting group/topic offsets; cleanup deletes the topic.                                                              | Sanitized operation/assignment/delivery/offset/admin transcript and Redpanda identity; no fixed sleep as readiness proof.                                 |
| KJM-G08 | Success and injected failure paths disconnect consumer, producer, and admin in ownership order; the smoke process exits naturally within its bound without `process.exit()`/forced kill and leaves zero Kafka-owned sockets, timers, clients, or unresolved promises/handles.                                                                                                                                                        | Shutdown timeline, before/after handle report, natural-exit status/duration, timeout supervisor result.                                                   |
| KJM-G09 | No step installs or links a system librdkafka, compiler, or build toolchain. No `apt`, `apk`, `dnf`, `yum`, Homebrew, source-build flag, or hidden fallback setup is used.                                                                                                                                                                                                                                                           | Commands/process log and package-manager negative audit.                                                                                                  |
| KJM-G10 | The required deployment target remains the proven Node 24 Bookworm Linux glibc architecture. Adoption is not justified solely by Alpine/musl assets or a developer-only platform.                                                                                                                                                                                                                                                    | Production-runtime declaration/review and explicit supported-target result.                                                                               |

Evidence is one immutable CI artifact named
`kafka-native-spike-${run_id}-${run_attempt}` containing separate `runner/` and
`core-runtime/` records plus a summary with KJM-G01—G10 PASS/FAIL. Logs must be
sanitized under KJM-013 and must not contain credentials, payloads, broker
secrets, or PII.

### 5.2 Decision boundary

- **GO / PASS** requires KJM-G01 through KJM-G10 to pass in **both** targets and
  the evidence artifact to be reviewable. Then Phase 2 may commit exact 1.10.0
  and proceed through the full migration.
- **NO-GO / FAIL** is any missing evidence or failed check, including source
  compilation, checksum mismatch/absence, ABI/libc/link/load failure, wrong
  version, Redpanda semantic failure, leaked handle, or an Alpine/musl-only or
  unsupported required production runtime. Restore the spike worktree, keep
  KafkaJS as production, and pause all later phases.
- After FAIL, the user must choose either to stay on KafkaJS or to evaluate
  pure-JavaScript alternatives. The selected next step requires the matching
  ADR and constitution amendment. Do not silently change the Confluent version,
  switch APIs, install native prerequisites, or continue migration.

`packages/sdk/package.json`, `packages/cli/package.json`, and `examples/plugins/crm/package.json` remain unchanged and contain no Kafka dependency. A repository dependency/import audit and SDK event tests prove transport independence.

## 6. File Map

### 6.1 Files to create

| Path                                                                     | Purpose                                                           | Estimate      |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------- | ------------- |
| `services/core-api/src/lib/kafka-logger.ts`                              | Sanitized Confluent logger adapter                                | 80-120 lines  |
| `services/core-api/src/lib/kafka-errors.ts`                              | Numeric client error classification and stable platform errors    | 100-150 lines |
| `services/core-api/src/lib/kafka-consumer.ts`                            | Consumer construction, rebalance state, readiness, guarded commit | 150-190 lines |
| `services/core-api/src/lib/kafka-admin.ts`                               | Transient admin ownership, leader polling, lag normalization      | 130-180 lines |
| `services/core-api/src/modules/plugin/events/consumer-topic-patterns.ts` | Extract current topic constants/pattern resolution                | 50-80 lines   |
| `services/core-api/src/modules/plugin/events/consumer-group-registry.ts` | Extract group-name parsing and registry state                     | 90-140 lines  |
| `services/core-api/src/__tests__/unit/kafka-client-config.test.ts`       | Import/config/broker parsing/error mapping                        | 120-170 lines |
| `services/core-api/src/__tests__/unit/kafka-producer-lifecycle.test.ts`  | Connect/send/ack/close races and cleanup                          | 160-195 lines |
| `services/core-api/src/__tests__/unit/kafka-consumer-semantics.test.ts`  | Assignment, revoke, commits, pause/order                          | 160-195 lines |
| `services/core-api/src/__tests__/unit/kafka-admin.test.ts`               | Leader polling, lag shapes, all-path cleanup                      | 140-190 lines |
| `services/core-api/src/__tests__/unit/kafka-logger.test.ts`              | Sanitization/no raw payload or broker data                        | 80-130 lines  |
| `services/core-api/src/__tests__/unit/bootstrap-shutdown-order.test.ts`  | Idempotent reverse ownership ordering                             | 100-150 lines |
| `services/core-api/src/__tests__/kafka-rebalance.int.test.ts`            | Real Redpanda incomplete-work replay on rebalance                 | 150-195 lines |
| `services/core-api/src/__tests__/kafka-outbox-performance.int.test.ts`   | Real outbox-to-Redpanda latency over 100 events                   | 150-195 lines |
| `packages/sdk/__tests__/sdk-events.test.ts`                              | Moved event tests plus deprecated-config compatibility            | 120-180 lines |

### 6.2 Files to modify

| Path                                                                                      | Change                                                                                                           |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `package.json`, `services/core-api/package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` | Dependency/native-build replacement                                                                              |
| `.github/workflows/ci.yml`                                                                | Add explicit package version/librdkafka runtime-load check after frozen install; existing real-stack jobs remain |
| `examples/plugins/crm/Dockerfile`                                                         | Remove patch-only build workaround                                                                               |
| `services/core-api/src/lib/kafka-client.ts`                                               | Compatibility namespace, validated config, Pino adapter, exact types                                             |
| `services/core-api/src/lib/kafka-producer.ts`                                             | Explicit producer config, in-flight sends, terminal teardown, sanitized logs                                     |
| `services/core-api/src/lib/kafka.ts`                                                      | Keep facade/wire contract; use delivery reports and new consumer/admin helpers                                   |
| `services/core-api/src/modules/plugin/events/consumer-manager.service.ts`                 | Decomposed coordinator; readiness, guarded commits, owned teardown, lag lifecycle                                |
| `services/core-api/src/modules/plugin/events/dlq-consumer.ts`                             | Shared manual-commit/readiness path; sanitized transient handling                                                |
| `services/core-api/src/modules/plugin/events/lag-metrics.service.ts`                      | Shared admin lag helper and deterministic timer cleanup                                                          |
| `services/core-api/src/modules/plugin/services/runtime-recovery.service.ts`               | Pass plugin slug needed by lag ownership; sanitize Kafka startup failure                                         |
| `services/core-api/src/modules/plugin/services/dev-registration.service.ts`               | Pass plugin slug through unchanged internal consumer creation contract                                           |
| `services/core-api/src/events/event-workers.ts`                                           | Reverse DLQ/outbox stop order and await both                                                                     |
| `services/core-api/src/bootstrap.ts`                                                      | Keep order; remove raw error object from shutdown-step logging                                                   |
| `services/core-api/scripts/verify-kafka-roundtrip.mjs`                                    | Confluent API, leader/assignment gates, comprehensive cleanup                                                    |
| `services/core-api/src/__tests__/smoke-redpanda.test.ts`                                  | Blocking real broker tests, temporary topic, 100-event P95 and cleanup                                           |
| `services/core-api/src/__tests__/event-pipeline.test.ts`                                  | Assignment readiness before publication                                                                          |
| `apps/web/e2e/plugin-system/ac-06-dlq.spec.ts`                                            | Deterministic topic probes and `finally` disconnect                                                              |
| `packages/sdk/__tests__/sdk.test.ts`                                                      | Remove stale client comment and move event cases to keep files below 200 lines                                   |
| `.forge/architecture/architecture.md` §5.2, §7.1-7.3                                      | Exact client/API mode; canonical encrypted envelope, actual group IDs, offset/log/lifecycle rules                |
| `docs/01-SPECIFICHE.md`, `docs/02-ARCHITETTURA.md`                                        | Replace stale active-client wording and correct tenant-key/group guidance                                        |

### 6.3 Files to delete

| Path                          | Reason                                               |
| ----------------------------- | ---------------------------------------------------- |
| `patches/kafkajs@2.2.4.patch` | Removed client patch; no replacement patch permitted |

### 6.4 Read-only compatibility evidence

`packages/sdk/src/index.ts`, `packages/sdk/src/types.ts`, `packages/sdk/src/http.ts`, CLI templates, example CRM backend sources, API type schemas, Prisma files/migrations, topic scripts, Compose files, and public routes are verification-only unless analysis discovers a direct stale client reference. Historical accepted ADRs, archived reviews, and completed spec/task artifacts are not rewritten; ADR-004's amendment supplies precedence.

## 7. Implementation Phases

### Phase 1: Dependency and install contract

1. On the actual self-hosted runner, create the isolated uncommitted spike worktree; temporarily add exact 1.10.0/allowlist/lock and verification-only import while leaving all production Kafka paths on KafkaJS.
2. Execute KJM-G01—G10 independently on the runner and fresh digest-pinned Core runtime, including both real-Redpanda smokes and no-handle natural exits.
3. Publish and review the immutable evidence artifact; restore all temporary spike edits.
4. Record one outcome only: PASS releases Phase 2; FAIL pauses the Epic for the user decision in §5.2. Do not create or start Phase 2—5 implementation tasks before PASS.

### Phase 2: Transport primitives

1. Only after PASS, commit exact 1.10.0 and the native allowlist/lock changes; remove KafkaJS, its patch declaration/file, and the CRM workaround atomically with the migrated transport.
2. Implement broker parsing, Pino bridge, numeric error mapping, and compatibility client.
3. Implement explicit producer configuration, delivery-report validation, send ownership, and terminal teardown.
4. Implement managed consumer configuration, rebalance generation, assignment wait, and guarded offset commit.
5. Implement transient admin, metadata leader, health, and lag helpers.
6. Convert the proven Phase 1 checks into a permanent blocking CI gate without adding a second client path.
7. Keep each new/existing authored file at or below 200 lines before proceeding.

### Phase 3: Production consumers and lifecycle

1. Decompose consumer manager, retain group/topic formats, and adopt managed consumers.
2. Adopt the same commit/rebalance semantics in the system DLQ bridge.
3. Wire lag timer ownership to create/delete/disconnect-all paths without changing response schemas.
4. Preserve three total plugin handler attempts and existing application delay values; do not add client-level handler retries.
5. Correct event-worker reverse stop order and verify bootstrap ownership.

### Phase 4: Admin and deterministic real-broker verification

1. Migrate the health probe and lag poller to normalized admin helpers.
2. Rewrite the CI verifier around temporary-topic leader metadata and consumer assignment.
3. Migrate the blocking Redpanda smoke test; remove conditional infrastructure skips/fixed readiness sleeps.
4. Update event-pipeline and Playwright topic probes to wait for assignment before causing events.

### Phase 5: Regression/security coverage and guidance

1. Add lifecycle, ack, error, logger, offset, rebalance, admin, shutdown, and real-broker tests.
2. Run existing encrypted outbox, two-tenant consumer, DLQ durability/retry/dedupe, and deletion-erasure tests unchanged or with readiness-only updates.
3. Split SDK event tests and prove deprecated config/source compatibility with no transport dependency.
4. Refresh active architecture/docs and run a final repository client/patch audit.

## 8. Testing and Verification Strategy

### 8.1 Updated tests

| Test                                                  | Update and preserved assertion                                                                                                         |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `src/__tests__/smoke-redpanda.test.ts`                | Direct Confluent import; no skip; core-topic metadata; temporary-topic create/leader/assignment/send/consume/delete; all clients close |
| `src/__tests__/event-pipeline.test.ts`                | Assignment before outbox publish; tenant key/header, ciphertext, decryptability, and row deletion unchanged                            |
| `src/__tests__/outbox-publisher.int.test.ts`          | Add a closed/unacknowledged send case; assert stable ID, incremented attempt, cleared lease, and retained row                          |
| `src/__tests__/unit/event-consumer-security.test.ts`  | Retain pre-decrypt cross-tenant/inactive gates; add explicit no-key-read/no-DLQ assertions where needed                                |
| `src/__tests__/unit/dlq-durability.test.ts`           | Retain ack-before-source-commit seam, stable coordinates, partition replay, dedupe/CAS behavior                                        |
| `src/__tests__/admin/health.routes.int.test.ts`       | Retain schema and real healthy Redpanda result; no public client detail                                                                |
| `src/__tests__/admin/kafka-status.routes.int.test.ts` | Retain `KafkaStatusResponseSchema`; normalized lag tests live below 200 lines in new admin unit test                                   |
| `apps/web/e2e/plugin-system/ac-06-dlq.spec.ts`        | Assignment-ready probes; three attempts, encrypted DLQ, durable DB bridge, stable replay identity                                      |
| `apps/admin/e2e/005-07-deletion.spec.ts`              | Existing event key/outbox/DLQ erasure remains a blocking migrated-producer proof                                                       |
| `packages/sdk/__tests__/sdk.test.ts`                  | Move event cases; retain all non-event SDK behavior                                                                                    |

### 8.2 Newly added tests

| Test                                        | Required scenarios                                                                                                                                                                                                   |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unit/kafka-client-config.test.ts`          | Exact compatibility config; trimmed valid brokers; empty/malformed segment rejection; no alternate env/client; numeric error categories                                                                              |
| `unit/kafka-producer-lifecycle.test.ts`     | Concurrent connect dedupe; failed-connect disconnect/recovery; acks/report boundary; three retry config; shutdown during connect; pre-close in-flight settlement; post-close rejection; idempotent disconnect        |
| `unit/kafka-consumer-semantics.test.ts`     | Constructor-level options; no run/subscribe offset options; next-offset only; no commit on handler/DLQ failure or revoke; skips commit; per-partition order; assignment-gated pause/resume; disconnect-only shutdown |
| `unit/kafka-admin.test.ts`                  | Leader polling; no `describeCluster`/`waitForLeaders`; group/topic offset normalization; success/timeout/failure cleanup                                                                                             |
| `unit/kafka-logger.test.ts`                 | Payload/ciphertext/header/key/broker/credential/raw error and stack markers never reach Pino; stable codes remain                                                                                                    |
| `unit/bootstrap-shutdown-order.test.ts`     | Plugin consumers -> lifecycle -> DLQ/outbox -> producer -> DB -> Redis; repeated shutdown is harmless; failures do not halt later cleanup                                                                            |
| `kafka-rebalance.int.test.ts`               | Real two-consumer same-group rebalance while first handler is blocked; no premature commit; replay allowed; later partition record cannot finalize first; bounded teardown                                           |
| `kafka-outbox-performance.int.test.ts`      | Enqueue 100 real encrypted outbox events, wrap the real send to timestamp each publication start, consume from a ready temporary-topic group, and assert P95 start-to-observation <1,000 ms                          |
| `packages/sdk/__tests__/sdk-events.test.ts` | `onEvent`/`dispatchEvent` and HTTP `emitEvent`; deprecated `kafkaBrokers` accepted but unused; no client package import                                                                                              |

### 8.3 Commands and staged gates

#### 8.3.1 Phase 1 gate — first and blocking

Execute the KJM-G01—G10 matrix in §5.1 on the actual self-hosted runner and the
fresh pinned Core runtime. The temporary lock must be generated before the two
independent clean-store frozen installs; both installs then use exact pnpm
10.33.0 and separate empty stores. Run the real Redpanda smoke once from each
target. No Phase 2 command below is authorized until the evidence summary is
PASS/PASS. The worktree must be restored after evidence capture regardless of
outcome.

#### 8.3.2 Post-PASS full migration gates

After PASS and committed migration changes, run in this order; do not use skip
flags:

```bash
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm --filter core-api exec node -e "const k = require('@confluentinc/kafka-javascript'); if (k.librdkafkaVersion !== '2.15.0') process.exit(1)"
pnpm typecheck
pnpm --filter core-api build
pnpm --filter core-api test:unit
pnpm --filter @plexica/sdk test
pnpm --filter create-plexica-plugin test
pnpm lint
pnpm test:line-gate && pnpm check:lines
```

With the project Compose/CI manifest running and `KAFKA_BROKERS` sourced:

```bash
pnpm --filter core-api test:int
pnpm --filter core-api exec vitest run --coverage
pnpm --filter core-api exec node scripts/verify-kafka-roundtrip.mjs "$KAFKA_BROKERS" "kjm-local"
pnpm --filter web exec playwright test e2e/plugin-system/ac-06-dlq.spec.ts
pnpm --filter @plexica/admin exec playwright test e2e/005-07-deletion.spec.ts e2e/005-11-kafka-status.spec.ts
pnpm test
pnpm build
```

Final audits must show no active client residue:

```bash
rg -n "from ['\"]kafkajs['\"]|require\(['\"]kafkajs['\"]\)" --glob '!node_modules/**' .
rg -n "kafkajs@2\.2\.4|patches/kafkajs|patchedDependencies" package.json pnpm-lock.yaml pnpm-workspace.yaml services packages apps examples .github
pnpm why kafkajs
rg -n "@confluentinc/kafka-javascript" services/core-api/package.json packages/*/package.json examples/plugins/*/package.json pnpm-lock.yaml
```

Expected results: first three audits have no active match/dependency; Confluent appears only in Core API's direct manifest and lock graph. Historical ADR/spec/archive text may still describe superseded decisions and is excluded from runtime-residue acceptance.

The combined Core unit+integration coverage run is the KJM evidence run, not the existing unit-only ADR-030 report. Its line result and the workspace coverage artifact must satisfy the constitutional `>=80%` target before merge. ADR-030 records a pre-existing approximately 23% unit-only baseline and no threshold; if combined coverage remains below 80%, the migration must not absorb unrelated test work or silently waive the target. Record it as a pre-existing governance/release blocker for human resolution before merge.

## 9. Rollout and Rollback

### 9.1 Rollout

1. Complete the uncommitted Phase 1 KJM-G01—G10 spike in both targets and obtain PASS/PASS; on FAIL stop here.
2. After PASS, complete committed install/type/unit gates before any functional broker test.
3. Run isolated real-Redpanda round trip and admin metadata checks.
4. Run Core integration tests, then encrypted event/DLQ/deletion Playwright flows.
5. Deploy first to staging against the supported three-node topology; observe stable codes for connect/rebalance/send/lag and outbox pending age.
6. Promote only with no leaked clients/open handles and no plaintext/cross-tenant evidence.

### 9.2 Rollback

Rollback is an atomic application+manifest+lock revert to the last known-good release, never a dual-client switch. Stop plugin consumers and event workers before replacing the process. Kafka wire records, topics, group IDs, and database rows are unchanged, so the previous release can resume from committed offsets. Unacknowledged outbox/DLQ work remains pending; duplicate acknowledged-but-not-deleted events retain the same `eventId`. Rollback may restore the previous dependency from the prior commit, but must not restore direct domain publication, plaintext payloads, producer DLQ, or retention-only erasure. No database rollback is needed.

Before migration, Phase 1 FAIL is not rollback: temporary edits are restored and KafkaJS remains the production client. Release is blocked rather than rolled forward if the native prebuilt/checksum evidence is unavailable, pnpm requires an unplanned source toolchain, load/link/ABI compatibility fails, Redpanda compatibility fails, shutdown leaves handles, or production requires only Alpine/musl or another unsupported runtime. The user then decides whether to retain KafkaJS or evaluate pure-JavaScript alternatives under amended governance.

## 10. Requirement Traceability

| Requirement | Plan sections   | Concrete implementation/tests                                                                       |
| ----------- | --------------- | --------------------------------------------------------------------------------------------------- |
| KJM-001     | 2.1-2.2, 4.1, 5 | `kafka-client.ts`, smoke test, verifier, manifests; final import audit                              |
| KJM-002     | 1, 4.4, 8       | existing Compose/Redpanda; smoke/verifier/rebalance integration                                     |
| KJM-003     | 1.1, 4.2, 8.1   | `kafka.ts`; event pipeline, DLQ durability, AC-06                                                   |
| KJM-004     | 4.2, 8.1        | `outbox-publisher.ts`; outbox integration + event pipeline                                          |
| KJM-005     | 4.2, 8.2        | `kafka-producer.ts`; producer lifecycle tests                                                       |
| KJM-006     | 4.2             | `kafka-client.ts`, `kafka-producer.ts`; config/lifecycle tests                                      |
| KJM-007     | 4.3, 6.2        | consumer manager/pattern/registry; consumer semantics + group-name tests                            |
| KJM-008     | 4.3             | consumer manager, DLQ consumer; consumer semantics, security, DLQ tests                             |
| KJM-009     | 4.3, 8.2        | assignment generation/guarded commit; real rebalance integration                                    |
| KJM-010     | 1.1, 8.1        | unchanged processor/DLQ service; DLQ durability, AC-06, deletion E2E                                |
| KJM-011     | 4.3, 8.1        | installation processor; two-tenant security and deletion tests                                      |
| KJM-012     | 4.5             | `kafka-errors.ts`, facade, health; client-config/producer/consumer/admin tests                      |
| KJM-013     | 4.5             | `kafka-logger.ts` and Kafka-specific logs; logger test                                              |
| KJM-014     | 4.4             | `kafka-admin.ts`, health, lag, verifier; admin + smoke tests                                        |
| KJM-015     | 4.2-4.3, 6.2    | `event-workers.ts`, `bootstrap.ts`; shutdown-order test                                             |
| KJM-016     | 4.1             | broker parser using only `KAFKA_BROKERS`; config tests                                              |
| KJM-017     | 5, 6            | manifests/lock/patch/Dockerfile/docs; frozen install and audits                                     |
| KJM-018     | 3.2, 5, 8.2     | SDK/CLI/example manifests read-only; SDK event compatibility tests/audit                            |
| KJM-019     | 8               | all listed unit/integration/Playwright tests; no Redpanda skip                                      |
| KJM-020     | 1, 11           | accepted ADR-004 amendment/Constitution v1.1; architecture guidance update                          |
| KJM-021     | 4.3             | concurrency 1 + guarded commit; unit ordering and real rebalance tests                              |
| KJM-022     | 4.3-4.4, 8      | assignment/leader gates and all-path cleanup in verifier/smoke/E2E probes                           |
| KJM-023     | 5.1-5.2, 7, 8.3 | uncommitted dual-target native spike; KJM-G01—G10 evidence and explicit PASS/FAIL                   |
| KJM-NFR-001 | 4.2-4.3, 8      | outbox, manual offset, fault/rebalance tests; zero premature commits                                |
| KJM-NFR-002 | 8.2             | `kafka-outbox-performance.int.test.ts` controlled 100-event real-outbox P95 assertion               |
| KJM-NFR-003 | 1.1, 4.5, 8.1   | event pipeline, two-tenant security, logger and AC-06 ciphertext tests                              |
| KJM-NFR-004 | 8.1             | existing `005-07-deletion.spec.ts` event-data proof                                                 |
| KJM-NFR-005 | 4.2-4.3, 8.2    | bounded 30 s teardown assertions and no owned handles                                               |
| KJM-NFR-006 | 3.2, 4.4, 8.1   | 200 ms health classification and unchanged Kafka status schema                                      |
| KJM-NFR-007 | 5, 8.3          | dual-target clean-store frozen install, checksum/load/link/smoke proof, no KafkaJS graph after PASS |
| KJM-NFR-008 | 6, 8.3          | lint/type/build/unit/int/E2E/coverage gates and <=200-line decomposition                            |

## 11. Architectural Decisions and Constitution Compliance

### 11.1 Decisions

| ADR                                              | Applicable decision                                                                                       | Status                                                        |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| ADR-004 + 2026-07-23 amendment                   | Kafka/Redpanda, tenant partition key, encrypted v1 envelope, transactional outbox                         | Accepted                                                      |
| ADR-004 + 2026-08-27 amendment and clarification | Exact Confluent 1.10.0 and compatibility API, conditionally adopted only after the mandatory native spike | Accepted / Phase 1 PASS (run 33081239038 PASS/PASS, reviewed) |
| ADR-016 + 2026-07-23 amendment                   | Encrypted two-tier DLQ, ack-before-commit, stable dedupe/ownership/replay                                 | Accepted                                                      |
| ADR-022 + 2026-07-23 amendment                   | Event purge first, active-tenant rechecks, key destruction before deletion                                | Accepted                                                      |

Phase 1 native spike is PASS (run 33081239038 PASS/PASS, reviewed) — functional migration is now authorized under the existing conditional approval (see native-spike-artifact-analysis.md). No new ADR is required for the 1.10.0 migration; any further attempt to add another dependency, use the native callback API in production, change retries/delivery guarantees, or alter data/auth/infrastructure must still stop and amend the architecture first. A FAIL would have created a user decision point: retaining KafkaJS or evaluating a pure-JavaScript alternative would have required the corresponding ADR and constitution amendment before further implementation.

### 11.2 Constitution compliance report

**Overall status: COMPLIANT BY PLAN, PHASE 1 PASS (run 33081239038 PASS/PASS, reviewed), WITH A PRE-EXISTING COVERAGE GATE** (coverage >=80% still required).

| Article                      | Status               | Plan evidence                                                                                                                                                    |
| ---------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Art. 1 / Rule 1              | Compliant            | Existing Playwright DLQ/deletion/status flows are blocking and updated for readiness; no infrastructure skip                                                     |
| Art. 2 / Rule 2              | Compliant by gate    | Dual-target frozen install/native/real-Redpanda Phase 1 proof blocks functional migration; all later CI/test/build gates block release                           |
| Art. 3 / Rule 3              | Compliant            | One production client and one compatibility API, no fallback/mixed transport; narrow uncommitted spike coexistence cannot ship; SDK remains HTTP-backed          |
| Art. 4 / Rule 4              | Compliant            | Explicit decomposition of 193/199-line files; all new authored files budgeted below 200 lines                                                                    |
| Art. 5 / Rule 5              | Compliant            | ADR-004 records the exact dependency, mandatory native nature of both APIs, conditional Phase 1 adoption, and governed FAIL decision before implementation       |
| Art. 6 / Rule 6              | Compliant by process | Implementation commits must use English Conventional Commit messages                                                                                             |
| Art. 7 / Architecture        | Compliant            | Fastify monolith and Kafka/Redpanda/outbox/DLQ design remain unchanged                                                                                           |
| Art. 8 / Quality/testing     | Compliant by gate    | Unit, real integration, and Playwright coverage includes faults, races, security, performance, lifecycle; combined line coverage must prove >=80% or block merge |
| Art. 9 / Security/operations | Compliant by gate    | Native integrity/load/link and no-handle checks block adoption; tenant prefilter/encryption/erasure and stable operations remain mandatory                       |

**Tensions:** (1) Constitution v1.1 names the conditionally approved Confluent client; Phase 1 is now PASS (run 33081239038 PASS/PASS, reviewed, see native-spike-artifact-analysis.md) so migration is authorized and KafkaJS removal is pending implementation (tracked by KJM-017/import audit), not a blocked mixed state. A FAIL would have required user choice and constitution amendment. (2) ADR-030 documents that current coverage reporting is unit-only, approximately 23%, and not gated. KJM-NFR-008 does not authorize an exception: this plan adds combined evidence and blocks merge below 80%, while avoiding unrelated test expansion. Implementation is not complete until dependency/import/patch audits are clean, coverage is evidenced at >=80%, and CI is green.

## 12. Estimates, Risks, and Readiness

### 12.1 Estimates

- **Impacted files:** approximately 24 modified, 15 created (including tests/decomposition), 1 deleted, plus generated `pnpm-lock.yaml`.
- **Implementation tasks:** approximately 34 tasks across five ordered phases.
- **No-change verification surface:** SDK/CLI/example manifests and sources, API schemas/routes, Prisma schema/migrations, broker/Compose topology.

### 12.2 Principal risks

| Risk                                                              | Mitigation / release signal                                                                                               |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Experimental pnpm/native binary installation                      | Root build allowlist, frozen install, explicit package/librdkafka load; source fallback blocks release                    |
| Compatibility API mistaken for pure JavaScript                    | ADR and Phase 1 explicitly require the same native addon/librdkafka for both JavaScript API surfaces                      |
| Prebuilt asset tampering/wrong target selection                   | Match exact asset URL/name and locally computed SHA-256 to GitHub release API digest in both targets                      |
| Host success masks production runtime failure                     | Independent clean-store install/load/link/Redpanda/no-handle gate in the pinned Core Bookworm image                       |
| Silent offset advance during revoke                               | Constructor auto-commit false, generation guard, conservative no-commit revoke, real rebalance test                       |
| Producer disconnect before delivery report                        | Owned send set; terminal admission; outbox retained on every unacknowledged path                                          |
| False readiness and missed CI events                              | Assignment/leader polling with bounded timeout; no fixed sleep proof                                                      |
| PII or broker/client object leakage                               | Logger drops client text/extra; numeric mapping; marker-based sanitization tests                                          |
| Admin client/topic/socket leak on timeout                         | Single ownership helper and outer script `finally`; open-handle/shutdown assertions                                       |
| Lag shape drift or accidental status redesign                     | Public schema unchanged; calculation isolated and tested; no UI/API edits                                                 |
| File-size regression from consumer complexity                     | Mandatory decomposition before behavior changes; line gate runs before full integration                                   |
| Current unit-only coverage is far below the constitutional target | Run combined coverage; block merge and escalate the pre-existing baseline rather than waive it or add unrelated refactors |

### 12.3 Readiness

The plan is complete against KJM-001 through KJM-023 and KJM-NFR-001 through KJM-NFR-008. It is **ready only for a Phase 1 blocker-task breakdown and execution**. Phase 2—5 implementation tasks must not be created or started until KJM-G01—G10 produce reviewed PASS/PASS evidence. PASS makes the existing full migration plan actionable without changing package 1.10.0; FAIL pauses Spec 008 for the user's governed KafkaJS-versus-pure-JavaScript decision.

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
| Tasks                         | Not created; only Phase 1 gate tasks may be generated before PASS                       |
