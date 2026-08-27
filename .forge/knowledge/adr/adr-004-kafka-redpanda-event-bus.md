# ADR-004: Kafka/Redpanda Event Bus

**Date**: March 2026
**Status**: Accepted
**Deciders**: Plexica Team

## Context

Plexica v2 plugins need to subscribe to CRUD events on core entities (tenant created, workspace updated, member added, etc.). The platform requires a reliable event bus for async communication between core and plugins. Plugin backends are polyglot (TypeScript, Rust, Python), so the eventing protocol must have broad language support.

## Decision

Use the Kafka protocol via Redpanda as the event bus for all async communication between core and plugins.

- **Development**: Single-node Redpanda in Docker Compose. No ZooKeeper, no JVM, under 100MB RAM, instant startup.
- **Staging/Production**: 3-node Redpanda cluster (or managed Kafka if preferred by the operator).
- **Topic naming**: `plexica.{entity}.{action}` (e.g., `plexica.workspace.created`, `plexica.member.added`).
- **Partitioning**: Partition by `tenantId` to guarantee per-tenant ordering.
- **Schema evolution**: All event payloads use versioned schemas (`v1`, `v2`) to allow backward-compatible changes.

Core services publish domain events to topics. Plugin backends subscribe via standard Kafka consumer groups. Plugins that go offline accumulate events and catch up on restart — no messages are lost.

## Consequences

### Positive

- Reliable delivery with at-least-once semantics and offset-based replay capability.
- Polyglot consumer support — every major language has a mature Kafka client library.
- Decoupled architecture — plugins can be deployed, restarted, or scaled independently without affecting core.
- Redpanda eliminates JVM overhead for development, cutting local resource usage and startup time.
- Consumer groups enable horizontal scaling of plugin event processing.

### Negative

- Infrastructure dependency — requires a running Redpanda/Kafka cluster in all environments.
- Eventual consistency — plugins observe events with a small delay (typically milliseconds, but unbounded under load).
- Topic and consumer group management adds operational overhead.

### Risks

- **Message ordering**: Only guaranteed within a partition. Mitigated by partitioning on `tenantId` so all events for a tenant are ordered.
- **Consumer lag**: A slow or crashed plugin consumer can fall behind. Mitigated by lag monitoring and alerting.
- **Schema evolution**: Changing event payloads can break consumers. Mitigated by versioned schemas and backward-compatible changes only.

## Alternatives Considered

### Redis Pub/Sub

- Fire-and-forget messaging with no persistence or replay.
- If a consumer is offline when an event is published, the message is lost permanently.
- Rejected: unacceptable for reliable plugin eventing.

### RabbitMQ

- Strong task queue semantics with acknowledgments and dead-letter queues.
- Smaller polyglot ecosystem compared to Kafka protocol. Less suited to event sourcing and replay patterns.
- Rejected: Kafka protocol is a better fit for domain event streaming.

### Webhooks (HTTP Callbacks)

- Requires plugin backends to be always-online to receive events.
- No built-in retry queue or replay. Retry logic must be implemented by core.
- Rejected: fragile at scale, poor offline tolerance.

### PostgreSQL LISTEN/NOTIFY

- No message persistence — notifications are lost if no listener is connected.
- Limited throughput and not designed for cross-service eventing.
- Rejected: insufficient durability and scalability.

---

## Amendment — 2026-07-23: Tenant Envelope, Transactional Outbox, and Payload Erasure

**Status**: Accepted (amends the accepted decision above)
**Driver**: PR #77 security remediation; Spec 004 `004-14`—`004-18`, NFR-03,
NFR-08; Spec 005 `005-05`—`005-07`
**Precedence**: This amendment controls where the original direct-publish or
unencrypted-payload wording is less specific.

### Context

Direct, fire-and-forget publication can commit a tenant mutation and then lose
its event. The current payload shape does not require tenant ownership, a stable
event ID, or a schema version, so a plugin consumer can receive another
tenant's event and retries cannot be deduplicated reliably. Retention alone also
does not erase readable tenant data from Kafka when a tenant is deleted.

### Decision

1. Every domain event uses canonical envelope version 1:

   ```json
   {
     "eventId": "uuid",
     "type": "plexica.workspace.created",
     "schemaVersion": 1,
     "tenantId": "uuid",
     "occurredAt": "RFC3339 timestamp",
     "producer": { "kind": "core|plugin", "id": "core|installation UUID" },
     "correlationId": "uuid",
     "causationId": "uuid or null",
     "payload": {}
   }
   ```

   `eventId`, `tenantId`, `type`, and `schemaVersion` are mandatory and
   immutable. Plaintext routing metadata contains no tenant slug, user name,
   email, or domain payload.
2. Kafka message key is always `tenantId`. Producers may not select another
   key. Plugin consumers validate the envelope and dispatch only when
   `envelope.tenantId` equals the installation's tenant ID; mismatch is skipped
   and committed, never delivered or placed in that installation's DLQ.
3. Tenant mutations and `core.event_outbox` inserts occur in the same
   PostgreSQL transaction. A leased publisher sends pending rows and deletes a
   row only after Kafka acknowledges it. A crash after send but before delete
   can duplicate an event; the stable `eventId` makes this explicit
   at-least-once delivery. No domain service publishes directly to Kafka.
4. Kafka carries an encrypted `payload` using AES-256-GCM and a per-tenant data
   encryption key. The routing fields above are authenticated as additional
   data. The envelope includes only `keyVersion`, IV, tag, and ciphertext in
   place of readable payload data. Keys are wrapped by a production-required
   platform key supplied through environment/secret management.
5. `core.tenant_event_keys` holds wrapped per-tenant keys. Tenant deletion
   first stops new publication, purges outbox/DLQ rows, and irreversibly clears
   every wrapped tenant key. Retained Kafka records then contain ciphertext
   that the running platform cannot decrypt. Broker retention remains an
   operational cleanup mechanism, not the GDPR erasure mechanism.
6. Producer failure is handled by the durable outbox, not by a second
   fire-and-forget DLQ path. Rows are never silently dropped after a retry
   count; repeated failures remain pending and are alerted.

### Consequences

**Positive**

- A committed mutation cannot lose its event between PostgreSQL and Kafka.
- Tenant ordering and filtering are enforced from one canonical field.
- Retries and DLQ records have stable event identity.
- Deletion makes live Kafka payloads unreadable before completion rather than
  waiting for retention.

**Negative**

- The core API owns an outbox publisher and tenant-key lifecycle.
- At-least-once publication still permits duplicates; consumers must use
  `eventId` for idempotency.
- Payload inspection requires an authorized decrypting core path.

**Neutral**

- Topic names and Kafka/Redpanda remain unchanged.
- Minimal routing metadata (`tenantId`, type, event ID, timestamps, versions)
  remains readable until Kafka retention deletes the physical record.

### Migration and Rollout

1. Apply the additive outbox/key migration and provision keys for active and
   suspended tenants.
2. Deploy envelope validation, decryption, and tenant filtering before any v1
   producer is enabled.
3. Pause plugin consumers and delete/truncate legacy unversioned records from
   affected core and DLQ topics during the remediation maintenance window.
   Legacy records without tenant ownership must never be dispatched.
4. Migrate each producer to transactional outbox writes, then disable direct
   domain publication.
5. Start the leased publisher and alert on oldest pending age and attempts.
6. Rollback may stop the publisher and application release, but must not restore
   direct publication or plaintext Kafka payloads.

### Security and GDPR

- Envelope and Kafka headers are Zod-validated before use.
- AES-GCM authentication prevents payload/routing substitution.
- Per-tenant key destruction, targeted outbox/DLQ purge, and credential
  revocation are required before `core.tenants.status = deleted`.
- Keys, plaintext payloads, and encryption errors are never logged.

### Constitution Alignment

| Article | Status | Notes |
| --- | --- | --- |
| Rule 1 / Testing | Compliant | Requires real PostgreSQL, Kafka, two-tenant, crash-recovery, and deletion E2E gates. |
| Rule 5 / ADR | Compliant | Records data-model and event infrastructure changes. |
| Architecture: Events | Compliant | Retains Kafka/Redpanda and tenant-key partitioning. |
| Security: tenant isolation | Improved | Mandatory ownership filter blocks cross-tenant dispatch. |
| Security: secrets/PII | Improved | Wrapped keys and cryptographic payload erasure replace readable retention. |

---

## Amendment — 2026-08-27: Confluent JavaScript Client

**Status**: Accepted (amends the accepted client decision above)
**Driver**: Spec 008 (`KJM-001`—`KJM-022`); explicit user approval to replace
KafkaJS with `@confluentinc/kafka-javascript`
**Precedence**: This amendment supersedes KafkaJS client references. It does not
change Redpanda/Kafka, topics, envelopes, delivery guarantees, or the 2026-07-23
security amendment.

### Context and Evidence

The current Core API is promise-based and depends on KafkaJS producer, consumer,
manual-offset, and admin shapes. A native callback rewrite would add delivery
report, polling, and event-emitter adapters at the same time as the client swap.

As of this decision, npm marks `1.10.0` as latest stable. Its package metadata
requires Node >=18, bundles librdkafka 2.15.0, and installs through
`node-pre-gyp` with source-build fallback. Confluent documents Node 24 prebuilt
binaries on the project's Linux targets, but calls pnpm support experimental.
The v1.10 migration guide documents the KafkaJS compatibility differences used
below. Evidence: [v1.10 README](https://github.com/confluentinc/confluent-kafka-javascript/blob/v1.10.0/README.md),
[package metadata](https://github.com/confluentinc/confluent-kafka-javascript/blob/v1.10.0/package.json),
and [migration guide](https://github.com/confluentinc/confluent-kafka-javascript/blob/v1.10.0/MIGRATION.md).

### Decision

1. Use only `@confluentinc/kafka-javascript` **1.10.0, exactly pinned**, as the
   Core API Kafka client. Do not add it to the SDK, CLI, or plugins. Upgrades
   require release-note, native-artifact, Node 24, pnpm 10, and real-Redpanda
   verification; a major-version or API-mode change requires another amendment.
2. Use the package's `KafkaJS` **promisified compatibility API** and `kafkaJS`
   configuration blocks. The root callback-based `RdKafka` API, KafkaJS runtime,
   dual-client paths, and fallback switching are prohibited. This minimizes the
   migration surface while retaining librdkafka underneath. Top-level
   librdkafka keys are allowed only for documented controls unavailable in the
   compatibility block; they do not permit use of the native client API.
3. Apply these explicit mappings rather than relying on changed defaults:

   | Concern | Required mapping |
   | --- | --- |
   | Common | Trim and validate `KAFKA_BROKERS`; `clientId: plexica-core`; Pino adapter; client log level ERROR. |
   | Producer | `acks: -1`, `allowAutoTopicCreation: true`, three Produce retries, 100 ms initial backoff, and native `linger.ms: 0`; an awaited `send()` delivery report is the acknowledgement boundary. |
   | Consumer | `groupId`, 30 s session timeout, 3 s heartbeat, `fromBeginning: false`, and `autoCommit: false` are constructor settings; `run()` sets `partitionsConsumedConcurrently: 1`. |
   | Admin | Preserve list/create/delete topics, topic metadata, group offsets, topic offsets, and bounded health operations; normalize client-specific shapes and disconnect every transient client in `finally`. |

4. Commit only `offset + 1`, and only after the existing dispatch, intentional
   skip, poison-record, or acknowledged-DLQ decision. Handler or commit failure
   must replay. A `rebalance_cb` tracks assign/revoke and readiness; revoke never
   commits in-flight work and may commit only already-completed tracked offsets.
   Startup and CI wait, with a bounded timeout, until `assignment()` is
   non-empty. Pause/resume occurs only after assignment; shutdown uses
   `disconnect()` because compatibility `stop()` is unsupported.
5. Keep one lazy producer and the existing terminal shutdown state. Deduplicate
   concurrent connects, discard and best-effort disconnect a failed instance,
   reject new sends once closing starts, settle owned in-flight sends, then
   disconnect. Consumers and event workers stop before the producer.
6. Map Confluent errors by stable numeric `ErrorCodes` plus `fatal`, never by
   client message/name. Platform boundaries retain `KAFKA_SEND_FAILED`,
   `KAFKA_PRODUCER_CLOSED`, retryable-consumer, sanitized permanent-DLQ, and
   health outcomes. Replace KafkaJS instrumentation listeners with sanitized
   Pino adapter logs, `rebalance_cb`, assignment state, and admin lag polling;
   default console logging and raw client/error/payload objects are prohibited.
7. Compatibility Admin has no `describeCluster()` and does not implement
   `createTopics({ waitForLeaders })` in v1.10. Topic creation must poll
   `fetchTopicMetadata()` with a bounded timeout until leaders exist. The CI
   broker advertisement check then inspects that temporary topic's leader-node
   coordinates. This preserves both checks without mixing in the native API;
   application response contracts do not expose the old method shapes.
8. The implementation must authorize the package install script in pnpm's
   `onlyBuiltDependencies`, use a Confluent-supported Node 24 OS/architecture,
   prove a frozen pnpm 10 install and runtime load, and verify librdkafka 2.15.0
   against the real project Redpanda without enabling Confluent-only broker
   features. Unsupported platforms or an unplanned source-build toolchain block
   release; no manual system librdkafka is allowed.

### Alternatives Considered

- **Native callback-based `RdKafka` API**: strongest direct access to metadata,
  statistics, and delivery reports, but requires new polling/callback/lifecycle
  abstractions and creates the highest offset and shutdown regression risk.
  Rejected for this semantics-preserving migration.
- **KafkaJS compatibility API (selected)**: preserves async interfaces and offers
  manual commits, assignment/rebalance hooks, producer delivery reports, and the
  required admin subset. Its documented differences are contained in one adapter.
- **Retain KafkaJS or run both clients**: lowest immediate effort, but contradicts
  the approved replacement and leaves two retry/lifecycle semantics. Rejected.

### Consequences and Constitution Alignment

- **Positive**: limited code churn, librdkafka reliability/performance, explicit
  readiness and offset behavior, and no change to ADR-004/ADR-016 guarantees.
- **Negative**: native binary installation, experimental pnpm support, exact-pin
  maintenance, and loss of KafkaJS instrumentation events.
- **Neutral**: at-least-once duplicates remain possible and are handled by stable
  event identity, outbox retry, and DLQ dedupe.

| Article | Status | Notes |
| --- | --- | --- |
| Rules 1—2 / Testing and CI | Compliant | Node 24 install plus real Redpanda, race, offset, security, and lifecycle tests are blocking. |
| Rule 3 / One pattern | Compliant | One client and one API mode; no fallback. |
| Rule 4 / File size | Compliant | Client, lifecycle, consumer, logger, and admin adapters remain decomposed. |
| Rule 5 / ADR | Compliant | Records the new core dependency before implementation. |
| Architecture / Security / Operations | Compliant | Broker design and encrypted tenant flows remain; stable Pino/error/lifecycle contracts are mandatory. |

### Same-day clarification — mandatory native deployment spike

**Status**: Accepted (amends the 2026-08-27 decision above)
**Driver**: Explicit user approval of the recommended native-dependency spike
**Precedence**: This clarification preserves the selected package, version, and
compatibility API, but supersedes any wording above that treats adoption or
functional migration as unconditional.

The package's promisified `KafkaJS` compatibility API and callback-based
`RdKafka` API are two JavaScript surfaces over the **same mandatory native
addon and bundled librdkafka**. Neither API is pure JavaScript, and selecting
the compatibility API does not avoid librdkafka deployment, ABI, libc, shared
library, installation, or shutdown risk.

Adoption of exact `@confluentinc/kafka-javascript` 1.10.0 remains the approved
choice, but it is **conditional on a blocking Phase 1 deployment spike**. No
functional producer, consumer, admin, lifecycle, test, or documentation
migration may begin until the spike passes in both of these actual targets:

1. the default self-hosted CI runner used by `.github/workflows/ci.yml`; and
2. the digest-pinned Core Node 24 Bookworm runtime,
   `node:24-bookworm@sha256:934240a162082fd8b8a2f90cd5114446443f1eba1c5378f6687167ca405e6584`,
   used by `core-api-e2e`.

Each target must independently prove all of the following from a clean pnpm
store and frozen lockfile:

- exact npm package 1.10.0 and bundled `librdkafkaVersion` 2.15.0;
- selection and download of the expected Node 24 ABI, Linux glibc, and target
  architecture prebuilt, with no source compilation or `node-gyp` fallback;
- native-addon load, ELF architecture/glibc compatibility, and no unresolved
  shared libraries;
- downloaded release-asset SHA-256 equality with the digest published by the
  GitHub v1.10.0 release API, plus retained URL, asset name, digest, and install
  log evidence; and
- a real Redpanda compatibility-API smoke covering producer acknowledgement,
  consumer assignment and consumption, manual next-offset commit, admin/topic
  operations, ordered disconnect/shutdown, natural process exit, and zero
  leaked Kafka handles or timers.

The spike must not install a compiler, build toolchain, system librdkafka, or
other package intended to make source fallback succeed. A temporary
verification-only package/import while KafkaJS still backs production is
allowed only in the **uncommitted Phase 1 spike worktree** and must be removed
after evidence capture. It is not a dual-client rollout: no production path may
load, select, fall back between, or ship both clients.

**Go/no-go outcome**:

- **PASS**: all checks pass in both targets. Full migration may start with the
  exact approved package/version and compatibility API.
- **FAIL**: any missing prebuilt/checksum evidence, source build, load/link/ABI
  failure, Redpanda semantic failure, leaked handle, Alpine/musl-only production
  requirement, or other unsupported required production runtime pauses Spec
  008. KafkaJS remains the production client. The user must decide whether to
  stay on KafkaJS or evaluate pure-JavaScript alternatives; either path requires
  the corresponding ADR and constitution amendment before implementation.

A failed gate does not authorize an automatic Confluent version change, native
API switch, compiler installation, system librdkafka installation, or fallback.
