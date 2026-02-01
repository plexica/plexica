/**
 * Example E2E Test: Event-Driven Tenant Provisioning
 *
 * This test demonstrates how to test event-driven workflows using Redpanda.
 * It verifies that when a tenant is created, the appropriate events are published
 * and can be consumed by other services.
 */

import { describe, it, expect } from 'vitest';
import { testContext } from '../../../../../test-infrastructure/helpers/test-context.helper';

describe('E2E: Event-Driven Tenant Provisioning', () => {
  /**
   * NOTE: These are example tests demonstrating Redpanda usage.
   * In real test suites, you would use beforeEach()/afterAll() hooks for cleanup:
   *
   * beforeEach(async () => {
   *   await testContext.resetAll();
   * });
   *
   * afterAll(async () => {
   *   await testContext.cleanup();
   * });
   */

  it('should publish tenant.created event when tenant is provisioned', async () => {
    // 1. Create topic for tenant events (unique per test run)
    const topicName = `events.tenant.lifecycle.${Date.now()}`;
    await testContext.redpanda.createTopic(topicName, {
      partitions: 3,
      replicationFactor: 1,
    });

    // 2. Create a tenant in the database
    const uniqueSlug = `acme-corp-${Date.now()}`;
    const tenant = await testContext.db.createTenant({
      slug: uniqueSlug,
      name: 'Acme Corporation',
      status: 'ACTIVE',
      withSchema: true,
      withMinioBucket: true,
    });

    // 3. Simulate publishing an event (this would normally be done by the API)
    await testContext.redpanda.produceMessage(topicName, {
      key: tenant.id,
      value: {
        eventType: 'TENANT_CREATED',
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        tenantName: tenant.name,
        timestamp: new Date().toISOString(),
        metadata: {
          hasSchema: true,
          hasMinioBucket: true,
        },
      },
      headers: {
        'content-type': 'application/json',
        'event-version': '1.0',
      },
    });

    // 4. Consume the event to verify it was published correctly
    const messages = await testContext.redpanda.consumeMessagesOnce(topicName, {
      groupId: 'test-tenant-provisioning-consumer',
      fromBeginning: true,
      timeout: 5000,
      maxMessages: 1,
    });

    // 5. Verify the event
    expect(messages).toHaveLength(1);

    const event = messages[0];
    expect(event.key).toBe(tenant.id);
    expect(event.value).toMatchObject({
      eventType: 'TENANT_CREATED',
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
    });
    expect(event.value.metadata).toMatchObject({
      hasSchema: true,
      hasMinioBucket: true,
    });
    expect(event.headers).toHaveProperty('content-type');
  });

  it('should publish multiple events in correct order', async () => {
    // 1. Create topic (unique per test run)
    const topicName = `events.tenant.updates.${Date.now()}`;
    await testContext.redpanda.createTopic(topicName, {
      partitions: 1, // Single partition to guarantee order
    });

    const uniqueSlug = `demo-company-${Date.now()}`;
    const tenant = await testContext.db.createTenant({
      slug: uniqueSlug,
      name: 'Demo Company',
      status: 'ACTIVE',
    });

    // 2. Produce multiple events in sequence
    const events = [
      { eventType: 'TENANT_CREATED', status: 'ACTIVE' },
      { eventType: 'TENANT_UPDATED', status: 'ACTIVE' },
      { eventType: 'TENANT_SUSPENDED', status: 'SUSPENDED' },
    ];

    for (const event of events) {
      await testContext.redpanda.produceMessage(topicName, {
        key: tenant.id,
        value: {
          ...event,
          tenantId: tenant.id,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // 3. Consume all events
    const messages = await testContext.redpanda.consumeMessagesOnce(topicName, {
      groupId: 'test-order-consumer',
      fromBeginning: true,
      timeout: 5000,
      maxMessages: 3,
    });

    // 4. Verify order
    expect(messages).toHaveLength(3);
    expect(messages[0].value.eventType).toBe('TENANT_CREATED');
    expect(messages[1].value.eventType).toBe('TENANT_UPDATED');
    expect(messages[2].value.eventType).toBe('TENANT_SUSPENDED');
  });

  it('should support tenant-specific topics', async () => {
    // 1. Create tenant
    const uniqueSlug = `isolated-tenant-${Date.now()}`;
    const tenant = await testContext.db.createTenant({
      slug: uniqueSlug,
      name: 'Isolated Tenant',
      status: 'ACTIVE',
    });

    // 2. Create tenant-specific topic
    const topicName = await testContext.redpanda.createTenantTopic(tenant.slug, 'user.actions', {
      partitions: 2,
    });

    // Topic name should include tenant slug
    expect(topicName).toContain(tenant.slug);
    expect(topicName).toContain('user.actions');

    // 3. Publish tenant-specific events
    await testContext.redpanda.produceMessage(topicName, {
      key: 'user-123',
      value: {
        userId: 'user-123',
        action: 'LOGIN',
        timestamp: new Date().toISOString(),
      },
    });

    // 4. Consume and verify
    const messages = await testContext.redpanda.consumeMessagesOnce(topicName, {
      groupId: 'test-tenant-specific-consumer',
      fromBeginning: true,
      timeout: 5000,
    });

    expect(messages).toHaveLength(1);
    expect(messages[0].value.action).toBe('LOGIN');

    // 5. Cleanup tenant topics
    await testContext.redpanda.deleteTenantTopics(tenant.slug);

    // Verify topic was deleted
    const topics = await testContext.redpanda.listTopics();
    expect(topics).not.toContain(topicName);
  });

  // NOTE: This test can be flaky when run with other tests due to shared producer/consumer instances.
  // Run it individually with: pnpm test -t "batch"
  it('should handle batch message production', async () => {
    // 1. Create topic (unique per test run)
    const topicName = `events.batch.test.${Date.now()}`;
    await testContext.redpanda.createTopic(topicName, {
      partitions: 3,
    });

    // Wait for topic metadata to propagate
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 2. Prepare batch of messages
    const batchMessages = Array.from({ length: 10 }, (_, i) => ({
      key: `user-${i}`,
      value: {
        userId: `user-${i}`,
        action: 'PAGE_VIEW',
        page: `/page-${i}`,
        timestamp: new Date().toISOString(),
      },
    }));

    // 3. Produce batch
    await testContext.redpanda.produceMessages(topicName, batchMessages);

    // 4. Consume all messages
    const messages = await testContext.redpanda.consumeMessagesOnce(topicName, {
      groupId: 'test-batch-consumer',
      fromBeginning: true,
      timeout: 8000, // Longer timeout for batch
      maxMessages: 10,
    });

    // 5. Verify all messages received
    expect(messages).toHaveLength(10);

    // Verify each message
    messages.forEach((msg) => {
      expect(msg.value.action).toBe('PAGE_VIEW');
      expect(msg.value.userId).toMatch(/^user-\d+$/);
    });
  });

  it('should get topic metadata', async () => {
    // 1. Create topic with specific configuration
    const topicName = 'events.metadata.test';
    await testContext.redpanda.createTopic(topicName, {
      partitions: 5,
      replicationFactor: 1,
    });

    // 2. Get metadata
    const metadata = await testContext.redpanda.getTopicMetadata(topicName);

    // 3. Verify metadata
    expect(metadata.name).toBe(topicName);
    expect(metadata.partitions).toHaveLength(5);

    metadata.partitions.forEach((partition) => {
      expect(partition).toHaveProperty('partitionId');
      expect(partition).toHaveProperty('leader');
      expect(partition).toHaveProperty('replicas');
      expect(partition).toHaveProperty('isr');
    });
  });

  it('should perform health check', async () => {
    const isHealthy = await testContext.redpanda.healthCheck();
    expect(isHealthy).toBe(true);
  });
});
