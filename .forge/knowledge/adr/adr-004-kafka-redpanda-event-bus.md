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
