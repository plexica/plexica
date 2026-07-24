# ADR-016: Two-Tier Dead Letter Queue

**Status**: Accepted
**Date**: 2026-06-26
**Driver**: DR-17 from Spec 004 (Plugin System) — Plugin Event Delivery Failure Handling
**Extends**: ADR-004 (Kafka/Redpanda Event Bus)
**Deciders**: TBD

## Context

Plugin event handlers can fail. A plugin may crash mid-processing, encounter a
bug, or hit a transient error (e.g., database connection timeout). When the core
publishes a domain event (`plexica.workspace.created`, `plexica.member.added`)
to Kafka, the plugin consumer group must process and acknowledge it.

ADR-004 established Kafka as the event bus with at-least-once delivery and
consumer group offset tracking. If a plugin consumer consistently fails to
process an event, the consumer group gets stuck — it cannot advance the offset
past the poison message, blocking all subsequent events for that partition.

A Dead Letter Queue (DLQ) is needed. The question is: how should the DLQ be
implemented?

1. **Kafka-only DLQ**: Failed events are published to a dedicated Kafka topic
   (`plexica.plugin.dlq`). Durable, streaming-native, but no management UI.
2. **DB-only DLQ**: Failed events are stored in a PostgreSQL table. Rich query
   and management UI, but lacks streaming durability at ingestion time.
3. **Two-tier DLQ**: Kafka for durable ingestion, DB for management UI. Best of
   both, but introduces an additional system consumer.

## Decision

**Two-tier Dead Letter Queue — Kafka for durability, PostgreSQL for management.**

### Tier 1: Kafka DLQ Topic

Failed events (after all retries are exhausted) are published to
`plexica.plugin.dlq`, a dedicated Kafka topic:

```
Topic: plexica.plugin.dlq
Partitions: 3 (matches core event topic partition count)
Retention: 7 days
Compaction: disabled (every message is a unique failure event)
```

Each DLQ message carries:
- **Original event payload** (unchanged from the source topic)
- **Headers**:
  - `original-topic` — source topic (e.g., `plexica.workspace.created`)
  - `original-partition` — source partition
  - `original-offset` — source offset
  - `plugin-install-id` — the plugin installation that failed
  - `failure-reason` — error message or stack trace (truncated to 4 KB)
  - `failure-timestamp` — ISO 8601 timestamp of the final failure
  - `retry-count` — number of retry attempts before DLQ (starts at 0 for DLQ retries)
  - `event-type` — `plexica.workspace.created`, etc.

The Kafka DLQ provides:
- Durable storage even if the database is temporarily unavailable
- A replay source for retry operations
- Kafka-native tooling compatibility (lag monitoring, offset inspection)

### Tier 2: Database Management Table

A system consumer group (`plexica-system-dlq-processor`) reads from
`plexica.plugin.dlq` and inserts deserialized records into the core database:

```sql
CREATE TABLE core.dead_letter_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      VARCHAR(128) NOT NULL,
  payload         JSONB NOT NULL,
  plugin_id       UUID NOT NULL REFERENCES core.plugins(id),
  install_id      UUID,
  error_message   JSONB,                -- { message, stack?, code? }
  retry_count     INTEGER NOT NULL DEFAULT 0,
  original_topic  VARCHAR(128),
  original_offset BIGINT,
  status          VARCHAR(32) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'retried', 'dismissed')),
  failed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID,                 -- user_id of super admin who resolved
  CONSTRAINT fk_plugin FOREIGN KEY (plugin_id) REFERENCES core.plugins(id)
);

CREATE INDEX idx_dlq_status ON core.dead_letter_queue(status, failed_at);
CREATE INDEX idx_dlq_plugin ON core.dead_letter_queue(plugin_id, status);
```

### Retry Flow

1. Core publishes event to topic `plexica.workspace.created`
2. Plugin consumer receives event, attempts processing
3. **Failure**: Plugin returns HTTP 500 from `POST /_plexica/event` or consumer
   times out
4. **Retry**: Core retries up to 3 times with exponential backoff:
   - 1st retry: 1 second delay
   - 2nd retry: 4 seconds delay
   - 3rd retry: 16 seconds delay
5. **Exhausted**: After 3 failures, core publishes to `plexica.plugin.dlq` with
   failure headers
6. **System consumer**: `plexica-system-dlq-processor` reads from DLQ topic,
   inserts into `core.dead_letter_queue`
7. **Super admin UI**: Lists DLQ entries with filtering by plugin, status,
   date range. Actions: **Retry** (re-publish to original topic → reset offset
   if successful), **Dismiss** (mark as dismissed with reason)

### Super Admin UI Features

- **List view**: Paginated (50 per page), sortable by `failed_at`, filterable
  by `plugin_id`, `status`, `event_type`
- **Detail view**: Full payload (JSON viewer), error message, retry history,
  original Kafka coordinates (topic/partition/offset)
- **Retry action**: Validates plugin is still installed and container is healthy;
  re-publishes to original topic with `X-DLQ-Retry: true` header; increments
  `retry_count`; on success, updates status to `retried` and `resolved_at`
- **Dismiss action**: Requires a reason (text); updates status to `dismissed`
  and `resolved_at`; event is permanently discarded
- **Bulk actions**: Select multiple DLQ entries for batch retry or dismiss

### Cleanup

- **Kafka retention**: 7 days (topic-level config). Messages are automatically
  deleted by Kafka. This is sufficient for operational recovery; beyond 7 days,
  the database record is the source of truth.
- **DB TTL cleanup**: A cron job runs daily, deleting rows where `failed_at <
  NOW() - INTERVAL '30 days'`. Dismissed entries can be cleaned earlier (7 days)
  since they represent intentionally discarded events.

## Consequences

### Positive
- **No silent data loss**: Every failed event is captured in two durable stores
  (Kafka + PostgreSQL). Super admins can review and act on every failure.
- **Management UI without Kafka expertise**: The database table provides a SQL-queryable,
  paginated view that any admin tooling can consume. No need for Kafka CLI tools
  to inspect the DLQ.
- **Replay capability**: Retry operations re-publish to the original Kafka topic,
  maintaining ordering guarantees (same partition key) and allowing the plugin
  consumer to process the event normally.
- **Audit trail**: Status transitions (`pending` → `retried`/`dismissed`) with
  `resolved_by` and `resolved_at` provide an audit trail for compliance.
- **Kafka-native durability**: If PostgreSQL is temporarily unavailable, the
  Kafka DLQ still captures failures — the system consumer catches up when the
  database is back.

### Negative
- **Two stores to manage**: Both the Kafka DLQ topic and the database table
  must be monitored and maintained. Mitigated by the TTL cleanup policies
  (7 days Kafka, 30 days DB) and monitoring of consumer lag on the system
  consumer group.
- **System consumer is a single point of ingestion**: If `plexica-system-dlq-processor`
  goes down, DLQ messages accumulate in Kafka but don't appear in the admin UI.
  Mitigated by consumer group health monitoring and alerting on lag > 100.
- **PII in DLQ**: Failed event payloads may contain PII. The DLQ table stores
  the full payload as JSONB. Mitigated by: (1) DLQ access restricted to super
  admin role only, (2) 30-day TTL cleanup, (3) PII redaction in `error_message`
  (stack traces are truncated).

### Neutral
- **Additional database table**: `core.dead_letter_queue` is a new table in the
  core schema. This is consistent with the schema-per-tenant model — the DLQ is
  a cross-cutting concern, not tenant-specific.

## Alternatives Considered

| Alternative | Description | Pros | Cons | Verdict |
|---|---|---|---|---|
| **Kafka-only DLQ** | Failed events published to a DLQ topic; no database table | No new DB schema; Kafka-native | No management UI; requires Kafka CLI or third-party tools for inspection and retry; no audit trail for resolved events | Rejected — super admins need a UI for operational management |
| **DB-only DLQ** | Failed events written directly to PostgreSQL | Rich query and UI; single store | If DB is unavailable during failure, the DLQ write also fails — event is lost; no streaming durability at ingestion time | Rejected — violates NFR-05 (no silent data loss) |
| **Kafka Connect Sink** | Use Kafka Connect to sink DLQ messages to PostgreSQL | Declarative, no custom system consumer | Adds Kafka Connect as an infrastructure dependency; requires connector configuration and maintenance; overkill for a single consumer use case | Rejected — unnecessary infrastructure complexity |

## Constitution Compliance

| Article | Status | Notes |
|---|---|---|
| Rule 5: ADR for infrastructure | **COMPLIANT** | This ADR documents the DLQ architecture, a new infrastructure component and database table. |
| Security §5: Secrets | **COMPLIANT** | No secrets in DLQ payloads. Event payloads are domain data, not credentials. |
| Security §6: PII | **COMPLIANT** | DLQ access restricted to super admin. 30-day TTL limits PII exposure window. Stack traces truncated to avoid leaking PII in error messages. |
| Architecture: Event Bus | **COMPLIANT** | Extends ADR-004 with a DLQ. Kafka remains the event bus; the DLQ topic is a standard Kafka consumer pattern. |
| Quality: Performance | **COMPLIANT** | DLQ publishing is asynchronous (fire-and-forget to Kafka topic). No latency impact on the happy path. |

## Related Decisions

- **ADR-004: Kafka/Redpanda Event Bus** — Defines the core event bus. The DLQ
  topic and system consumer extend this with failure handling.
- **ADR-013: Container Hosting Model** — Plugin container health monitoring
  (circuit breaker) feeds into DLQ decisions — if the container is unhealthy,
  events are routed to DLQ faster.
- **ADR-017: Plugin DB Access Restriction** — The system consumer (`plexica-system-dlq-processor`)
  writes to core tables, not plugin tables. Plugin DB access restrictions do
  not apply to system consumers.

---

## Amendment — 2026-07-23: Tenant Ownership, Stable Dedupe, and Erasure

**Status**: Accepted (amends the accepted decision above)
**Driver**: PR #77 security remediation; Spec 004 DR-17 and AC-06; Spec 005
005-07
**Extends**: ADR-004 amendment dated 2026-07-23

### Context

The original table does not make tenant ownership mandatory and its proposed
dedupe fields are not stable across retries. A timestamp/correlation tuple can
create duplicate rows after a bridge crash. The original retention policy also
leaves readable payloads in Kafka after tenant deletion and does not support a
targeted database purge.

### Decision

1. Every DLQ record owns these immutable source coordinates:
   `tenantId`, `installId`, `eventId`, `originalTopic`, `originalPartition`, and
   `originalOffset`. `pluginId` remains catalog metadata, not ownership.
2. `dedupeKey = SHA-256(installId + "\n" + originalTopic + "\n" +
   originalPartition + "\n" + originalOffset)` and is protected by a unique
   database constraint. The bridge performs an insert-on-conflict no-op and
   commits the Kafka DLQ offset only after that transaction succeeds.
3. Source consumers commit the original offset only after the encrypted DLQ
   publication is acknowledged. If DLQ publication is unavailable, the source
   event remains uncommitted and is retried; it is not silently discarded.
4. The Kafka DLQ stores the original event and bounded structural error data as
   a tenant-key-encrypted payload under ADR-004. Stack traces, credentials, and
   raw database/client errors are prohibited.
5. `core.dead_letter_queue` stores the decrypted payload for the authorized
   super-admin UI and adds `tenant_id` plus the source coordinates above.
   Tenant deletion executes `DELETE ... WHERE tenant_id = $1` before completion.
6. Retry preserves `eventId`, `tenantId`, original event type, schema version,
   and tenant partition key; it adds retry metadata without changing ownership.
   Retry/dismiss uses a leased/CAS status transition (`pending -> retrying ->
   retried` or `pending -> dismissed`).
7. Kafka retention remains seven days for operational recovery. It is not the
   erasure control: destroying the tenant event key makes every retained source
   and DLQ payload unreadable before deletion completes.

### Consequences

- **Positive**: bridge replay is idempotent, tenant purge is exact, and no
  readable Kafka domain payload survives logical tenant deletion.
- **Negative**: DLQ production must carry Kafka source coordinates and the UI
  database remains sensitive until targeted purge.
- **Neutral**: the two-tier Kafka + PostgreSQL architecture and super-admin
  retry/dismiss UX remain unchanged.

### Migration and Rollout

Add nullable columns, then purge existing DB rows because the legacy schema did
not persist tenant ownership plus source partition/offset and therefore cannot
prove any stable coordinates. Enforce `NOT NULL` and the unique dedupe
constraint after that deterministic purge. Legacy Kafka DLQ records are purged
during the ADR-004 maintenance window rather than guessed. Deploy the bridge
before producers, then enable strict validation. Rollback must retain the new
columns and may not resume timestamp-based dedupe or plaintext DLQ publication.

### Security and GDPR

- All list, retry, dismiss, and purge queries use the stored `tenant_id`; payload
  inspection remains super-admin-only.
- Error fields contain codes and bounded sanitized text, never stack traces or
  PII.
- Database purge plus tenant-key destruction is a deletion completion gate;
  retention alone is explicitly insufficient.

### Constitution Alignment

| Article | Status | Notes |
| --- | --- | --- |
| Rule 1 / Testing | Compliant | Requires bridge-crash dedupe, two-tenant isolation, retry, and deletion E2E tests. |
| Rule 5 / ADR | Compliant | Documents DLQ schema and security changes. |
| Security: tenant isolation | Improved | Ownership is mandatory and queryable. |
| Security: PII | Improved | Targeted purge and cryptographic erasure replace retention-only mitigation. |
