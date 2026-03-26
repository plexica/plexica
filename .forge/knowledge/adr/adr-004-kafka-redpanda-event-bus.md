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
