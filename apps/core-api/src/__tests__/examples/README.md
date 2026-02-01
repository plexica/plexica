# Test Examples

This directory contains example test files that demonstrate best practices and patterns for testing with the Plexica test infrastructure.

## Available Examples

### Event-Driven Testing with Redpanda

**File**: `redpanda-event-driven.example.test.ts`

Demonstrates how to test event-driven workflows using Redpanda (Kafka):

- **Creating topics** with specific configurations
- **Publishing events** (single and batch)
- **Consuming events** with consumer groups
- **Verifying event order** in single-partition topics
- **Tenant-specific topics** for multi-tenant isolation
- **Topic metadata** inspection
- **Health checks** for Redpanda connectivity

#### Key Patterns

1. **Basic Event Publishing and Consumption**:

```typescript
// Create topic
await testContext.redpanda.createTopic('events.tenant.lifecycle', {
  partitions: 3,
  replicationFactor: 1,
});

// Publish event
await testContext.redpanda.produceMessage('events.tenant.lifecycle', {
  key: tenantId,
  value: { eventType: 'TENANT_CREATED', ... },
  headers: { 'content-type': 'application/json' },
});

// Consume and verify
const messages = await testContext.redpanda.consumeMessages('events.tenant.lifecycle', {
  groupId: 'test-consumer',
  fromBeginning: true,
  timeout: 5000,
});
```

2. **Guaranteed Event Ordering**:

```typescript
// Use single partition for strict ordering
await testContext.redpanda.createTopic('events.ordered', {
  partitions: 1, // Single partition guarantees order
});

// Produce events sequentially
for (const event of events) {
  await testContext.redpanda.produceMessage('events.ordered', event);
}

// Verify order on consumption
const messages = await testContext.redpanda.consumeMessages(...);
expect(messages[0].value.eventType).toBe('FIRST_EVENT');
expect(messages[1].value.eventType).toBe('SECOND_EVENT');
```

3. **Tenant-Specific Topics**:

```typescript
// Create topic with tenant isolation
const topicName = await testContext.redpanda.createTenantTopic('my-tenant', 'user.actions', {
  partitions: 2,
});
// Creates: events.my-tenant.user.actions

// Cleanup all tenant topics
await testContext.redpanda.deleteTenantTopics('my-tenant');
```

4. **Batch Message Production**:

```typescript
const batchMessages = Array.from({ length: 10 }, (_, i) => ({
  key: `user-${i}`,
  value: { userId: `user-${i}`, action: 'PAGE_VIEW' },
}));

await testContext.redpanda.produceMessages('events.batch', batchMessages);
```

## Running Examples

These examples are actual test files and can be run like any other test:

```bash
# Run all examples
pnpm test apps/core-api/src/__tests__/examples

# Run specific example
pnpm test apps/core-api/src/__tests__/examples/redpanda-event-driven.example.test.ts

# Run with verbose output
pnpm test apps/core-api/src/__tests__/examples -- --reporter=verbose
```

## Prerequisites

Make sure the test infrastructure is running:

```bash
./test-infrastructure/scripts/test-setup.sh
```

This will start:

- PostgreSQL (port 5433)
- Keycloak (port 8081)
- Redis (port 6380)
- MinIO (port 9010)
- Redpanda (port 9095)
- Redpanda Console (port 8091)

## Debugging

### View Kafka Messages in Redpanda Console

Open http://localhost:8091 to:

- View all topics
- Inspect messages
- Monitor consumer groups
- View partition details

### Check Redpanda Health

```bash
# Via test helper
const isHealthy = await testContext.redpanda.healthCheck();

# Via Docker
docker exec plexica-redpanda-test rpk cluster health

# Via CLI
rpk --brokers localhost:9095 cluster health
```

### List Topics

```bash
# Via test helper
const topics = await testContext.redpanda.listTopics();

# Via Docker
docker exec plexica-redpanda-test rpk topic list

# Via CLI
rpk --brokers localhost:9095 topic list
```

## Best Practices

1. **Always use unique consumer group IDs** in tests to avoid conflicts
2. **Set reasonable timeouts** for message consumption (default 5000ms)
3. **Clean up topics** after tests with `testContext.resetAll()`
4. **Use single partition** when event order matters
5. **Use multiple partitions** for high-throughput scenarios
6. **Include headers** with metadata (content-type, version, etc.)
7. **Use tenant-specific topics** for multi-tenant isolation
8. **Test both success and error scenarios**

## Common Patterns

### Testing Event Publication from API

```typescript
it('should publish event when API endpoint is called', async () => {
  // 1. Create topic
  await testContext.redpanda.createTopic('events.api.actions');

  // 2. Call API endpoint that publishes event
  const response = await fetch('http://localhost:3000/api/tenants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: 'test', name: 'Test' }),
  });

  // 3. Consume and verify event
  const messages = await testContext.redpanda.consumeMessages('events.api.actions', {
    groupId: 'test-api-consumer',
    timeout: 5000,
  });

  expect(messages).toHaveLength(1);
  expect(messages[0].value.eventType).toBe('TENANT_CREATED');
});
```

### Testing Event Consumers

```typescript
it('should process events via consumer', async () => {
  // 1. Publish test event
  await testContext.redpanda.produceMessage('events.process', {
    value: { action: 'PROCESS_ME' },
  });

  // 2. Start your consumer (service that processes events)
  // ... start consumer service ...

  // 3. Verify side effects (database, logs, etc.)
  const result = await testContext.db.getPrisma().someTable.findFirst({
    where: { processed: true },
  });

  expect(result).toBeDefined();
});
```

## Contributing

When adding new examples:

1. Follow the existing naming convention: `{topic}.example.test.ts`
2. Include comprehensive JSDoc comments
3. Test both happy path and error cases
4. Document any special setup requirements
5. Update this README with the new example

## Resources

- [Redpanda Documentation](https://docs.redpanda.com/)
- [KafkaJS Documentation](https://kafka.js.org/)
- [Test Infrastructure README](../../../../../test-infrastructure/README.md)
- [Test Context Helper](../../../../../test-infrastructure/helpers/test-context.helper.ts)
- [Redpanda Helper](../../../../../test-infrastructure/helpers/test-redpanda.helper.ts)
