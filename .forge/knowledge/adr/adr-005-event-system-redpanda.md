# ADR-005: Event System (Redpanda)

**Date**: 2025-01-13  
**Status**: Accepted  
**Deciders**: Backend Team  
**Context**: Message broker selection for event-driven plugin communication

## Context and Problem Statement

Plexica plugins need to communicate asynchronously via events (e.g., CRM emits `crm.deal.won`, Billing plugin subscribes to create an invoice). We need a high-performance, reliable message broker that supports topic-based pub/sub with consumer groups, dead letter queues, and tenant-aware event routing.

## Decision Drivers

- High throughput (>1,000 events/sec design target)
- Low latency (<100ms p95 event delivery)
- Kafka-compatible API (ecosystem, tooling, KafkaJS client)
- Operational simplicity (minimal dependencies)
- Resource efficiency (smaller footprint than Kafka)

## Considered Options

1. **Redpanda (Kafka-compatible)** (chosen)
2. **Apache Kafka**
3. **RabbitMQ**
4. **Redis Streams**

## Decision Outcome

**Chosen option**: Redpanda — provides Kafka-compatible API with simpler operations (no Zookeeper), better performance, and smaller resource footprint. Uses KafkaJS client library for seamless integration.

### Positive Consequences

- Kafka-compatible API (full ecosystem access, KafkaJS client)
- Simpler setup (no Zookeeper dependency)
- Better performance than Kafka for similar workloads
- Smaller resource footprint (single binary)
- Self-balancing partitions
- Redpanda Console for monitoring

### Negative Consequences

- Less mature than Apache Kafka (smaller community)
- Fewer battle-tested production deployments at massive scale
- Some advanced Kafka features may lag behind

## Implementation Notes

- EventBus service: `packages/event-bus` (580+ lines)
- Dead Letter Queue service with Redpanda + REST API (460+ lines)
- SDK decorators: `@EventHandler`, `@EventPublisher`
- Topic naming: `plexica.{tenant}.{plugin}.{event}` pattern
- 3-node HA cluster configuration for production
- Prometheus metrics integration for monitoring
- Completed in Milestone 2.1 (January 23, 2026) — 27 test cases
- Per Constitution Article 2.1: KafkaJS ^2.2 is the approved client

## Related Decisions

- ADR-003: Plugin Language Support (TypeScript SDK with event decorators)
- ADR-006: Fastify Framework (async event handling)
- Constitution Article 2.1: Approved technology stack

## References

- Source: `planning/DECISIONS.md` (ADR-005)
- `specs/TECHNICAL_SPECIFICATIONS.md` Section 5: Event System
- `specs/FUNCTIONAL_SPECIFICATIONS.md` Section 7.4: Plugin Communication
- `planning/ROADMAP.md` Milestone 2.1: Event System (completed)
