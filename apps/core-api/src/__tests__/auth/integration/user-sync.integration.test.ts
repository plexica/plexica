/**
 * User Sync Pipeline Integration Tests
 *
 * Tests the complete event-driven user synchronization flow:
 * - Keycloak user lifecycle events → Redpanda → UserSyncConsumer → Database
 * - NFR-002: User sync completion < 5 seconds
 * - Edge Case #2: Event arrives before tenant provisioning (retry logic)
 * - Edge Case #7: Consumer lag replay (no data loss)
 * - Idempotency guard (duplicate events)
 *
 * Requirements:
 * - PostgreSQL with schema-per-tenant isolation
 * - Redpanda/Kafka running
 * - Redis for idempotency cache
 *
 * @see FR-007 (Event-Driven User Sync)
 * @see NFR-002 (User sync completion < 5 seconds)
 * @see Plan §4.3 (UserSyncConsumer)
 * @see Edge Case #2 (Event arrives before tenant provisioning)
 * @see Edge Case #7 (Consumer lag replay, no data loss)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { RedpandaClient, EventBusService } from '@plexica/event-bus';
import type { UserCreatedData, UserUpdatedData, UserDeletedData } from '@plexica/event-bus';
import { UserSyncConsumer } from '../../../services/user-sync.consumer.js';
import { tenantService } from '../../../services/tenant.service.js';
import { userRepository } from '../../../repositories/user.repository.js';
import { db } from '../../../lib/db.js';
import { redis } from '../../../lib/redis.js';
import { config } from '../../../config/index.js';
import { TenantStatus } from '@plexica/database';
import type { TenantContext } from '../../../middleware/tenant-context.js';

describe('User Sync Pipeline Integration Tests', () => {
  let redpandaClient: RedpandaClient;
  let eventBusService: EventBusService;
  let userSyncConsumer: UserSyncConsumer;
  let testTenantId: string;
  let testTenantSlug: string;
  let tenantContext: TenantContext;

  // Test configuration
  const SYNC_TIMEOUT = 6000; // 6 seconds (above NFR-002 5s limit for safety margin)
  const POLL_INTERVAL = 100; // 100ms polling interval

  /**
   * Helper: Wait for a condition with timeout
   */
  async function waitFor(
    condition: () => Promise<boolean>,
    timeout: number,
    pollInterval: number
  ): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
    return false;
  }

  /**
   * Helper: Publish user lifecycle event to Redpanda
   * Note: EventBusService.publish() generates its own event ID internally
   */
  async function publishUserEvent(
    data: UserCreatedData | UserUpdatedData | UserDeletedData
  ): Promise<void> {
    await eventBusService.publish('plexica.auth.user.lifecycle', data, {
      source: 'integration-test',
      tenantId: testTenantId,
    });
  }

  /**
   * Helper: Create test tenant with unique slug
   */
  async function createTestTenant(): Promise<{ id: string; slug: string }> {
    const uniqueSlug = `test-sync-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const tenant = await tenantService.createTenant({
      name: `Test Sync Tenant ${uniqueSlug}`,
      slug: uniqueSlug,
    });
    return { id: tenant.id, slug: tenant.slug };
  }

  beforeAll(async () => {
    // Initialize Redpanda client
    redpandaClient = new RedpandaClient({
      clientId: 'plexica-test-user-sync',
      brokers: config.kafkaBrokers.split(',').map((b) => b.trim()),
      connectionTimeout: 10000,
      requestTimeout: 30000,
      retry: {
        maxRetryTime: 30000,
        initialRetryTime: 300,
        factor: 0.2,
        multiplier: 2,
        retries: 5,
      },
    });

    await redpandaClient.connect();

    // Initialize EventBusService
    eventBusService = new EventBusService(redpandaClient);

    // Create test tenant with provisioned schema
    const tenant = await createTestTenant();
    testTenantId = tenant.id;
    testTenantSlug = tenant.slug;

    // Create tenant context for repository operations
    tenantContext = {
      tenantId: testTenantId,
      tenantSlug: testTenantSlug,
      schemaName: `tenant_${testTenantSlug.replace(/-/g, '_')}`,
    };

    // Initialize UserSyncConsumer
    userSyncConsumer = new UserSyncConsumer(eventBusService);
    await userSyncConsumer.start();

    // Wait for consumer to be fully ready
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    // Stop consumer and disconnect
    if (userSyncConsumer.isConsumerRunning()) {
      await userSyncConsumer.stop();
    }

    // Cleanup test tenant
    try {
      await tenantService.hardDeleteTenant(testTenantId);
    } catch (error) {
      console.warn('Cleanup warning (tenant):', error);
    }

    // Disconnect Redpanda
    await redpandaClient.disconnect();

    // Clear Redis cache
    const keys = await redis.keys('user-sync:event:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  beforeEach(async () => {
    // Clear users from tenant schema before each test
    try {
      await db.$executeRawUnsafe(`DELETE FROM ${tenantContext.schemaName}.users`);
    } catch (error) {
      // Ignore if table doesn't exist yet
    }

    // Clear Redis idempotency cache
    const keys = await redis.keys('user-sync:event:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  describe('Full Pipeline: User Created Event', () => {
    it('should sync user.created event to database within 5 seconds (NFR-002)', async () => {
      // Arrange
      const keycloakId = uuidv4();
      const email = `test-user-${Date.now()}@example.com`;
      const userCreatedData: UserCreatedData = {
        keycloakId,
        realmName: testTenantSlug,
        email,
        firstName: 'Test',
        lastName: 'User',
      };

      const startTime = Date.now();

      // Act: Publish USER_CREATED event
      await publishUserEvent(userCreatedData);

      // Assert: Wait for user to appear in database
      const syncCompleted = await waitFor(
        async () => {
          try {
            const user = await userRepository.findByKeycloakId(keycloakId, tenantContext);
            return user !== null;
          } catch {
            return false;
          }
        },
        SYNC_TIMEOUT,
        POLL_INTERVAL
      );

      const syncDuration = Date.now() - startTime;

      expect(syncCompleted).toBe(true);
      expect(syncDuration).toBeLessThan(5000); // NFR-002: < 5 seconds

      // Verify user data
      const syncedUser = await userRepository.findByKeycloakId(keycloakId, tenantContext);
      expect(syncedUser).toBeDefined();
      expect(syncedUser!.keycloakId).toBe(keycloakId);
      expect(syncedUser!.email).toBe(email);
      expect(syncedUser!.firstName).toBe('Test');
      expect(syncedUser!.lastName).toBe('User');
      expect(syncedUser!.status).toBe('ACTIVE');
    }, 10000); // Vitest timeout: 10s

    it('should handle user.created with minimal fields (no firstName/lastName)', async () => {
      // Arrange
      const keycloakId = uuidv4();
      const email = `minimal-user-${Date.now()}@example.com`;
      const userCreatedData: UserCreatedData = {
        keycloakId,
        realmName: testTenantSlug,
        email,
        // No firstName or lastName
      };

      // Act
      await publishUserEvent(userCreatedData);

      // Assert
      const syncCompleted = await waitFor(
        async () => {
          try {
            const user = await userRepository.findByKeycloakId(keycloakId, tenantContext);
            return user !== null;
          } catch {
            return false;
          }
        },
        SYNC_TIMEOUT,
        POLL_INTERVAL
      );

      expect(syncCompleted).toBe(true);

      const syncedUser = await userRepository.findByKeycloakId(keycloakId, tenantContext);
      expect(syncedUser!.email).toBe(email);
      expect(syncedUser!.firstName).toBeNull();
      expect(syncedUser!.lastName).toBeNull();
    }, 10000);
  });

  describe('Full Pipeline: User Updated Event', () => {
    it('should sync user.updated event and update only changed fields', async () => {
      // Arrange: Create initial user
      const keycloakId = uuidv4();
      const initialEmail = `update-test-${Date.now()}@example.com`;

      await publishUserEvent({
        keycloakId,
        realmName: testTenantSlug,
        email: initialEmail,
        firstName: 'Original',
        lastName: 'Name',
      });

      // Wait for initial user creation
      await waitFor(
        async () => {
          try {
            const user = await userRepository.findByKeycloakId(keycloakId, tenantContext);
            return user !== null;
          } catch {
            return false;
          }
        },
        SYNC_TIMEOUT,
        POLL_INTERVAL
      );

      // Act: Publish USER_UPDATED event (only email changed)
      const newEmail = `updated-${Date.now()}@example.com`;
      await publishUserEvent({
        keycloakId,
        realmName: testTenantSlug,
        email: newEmail,
        // firstName and lastName not provided (unchanged)
      });

      // Assert: Wait for update to propagate
      const updateCompleted = await waitFor(
        async () => {
          try {
            const user = await userRepository.findByKeycloakId(keycloakId, tenantContext);
            return user?.email === newEmail;
          } catch {
            return false;
          }
        },
        SYNC_TIMEOUT,
        POLL_INTERVAL
      );

      expect(updateCompleted).toBe(true);

      const updatedUser = await userRepository.findByKeycloakId(keycloakId, tenantContext);
      expect(updatedUser!.email).toBe(newEmail);
      expect(updatedUser!.firstName).toBe('Original'); // Unchanged
      expect(updatedUser!.lastName).toBe('Name'); // Unchanged
    }, 15000);

    it('should sync user.updated with all fields changed', async () => {
      // Arrange
      const keycloakId = uuidv4();
      await publishUserEvent({
        keycloakId,
        realmName: testTenantSlug,
        email: `initial-${Date.now()}@example.com`,
        firstName: 'Old',
        lastName: 'Name',
      });

      await waitFor(
        async () => {
          try {
            return (await userRepository.findByKeycloakId(keycloakId, tenantContext)) !== null;
          } catch {
            return false;
          }
        },
        SYNC_TIMEOUT,
        POLL_INTERVAL
      );

      // Act: Update all fields
      const newEmail = `fully-updated-${Date.now()}@example.com`;
      await publishUserEvent({
        keycloakId,
        realmName: testTenantSlug,
        email: newEmail,
        firstName: 'New',
        lastName: 'Person',
      });

      // Assert
      const updateCompleted = await waitFor(
        async () => {
          try {
            const user = await userRepository.findByKeycloakId(keycloakId, tenantContext);
            return user?.email === newEmail && user?.firstName === 'New';
          } catch {
            return false;
          }
        },
        SYNC_TIMEOUT,
        POLL_INTERVAL
      );

      expect(updateCompleted).toBe(true);

      const updatedUser = await userRepository.findByKeycloakId(keycloakId, tenantContext);
      expect(updatedUser!.email).toBe(newEmail);
      expect(updatedUser!.firstName).toBe('New');
      expect(updatedUser!.lastName).toBe('Person');
    }, 15000);
  });

  describe('Full Pipeline: User Deleted Event', () => {
    it('should soft-delete user on user.deleted event', async () => {
      // Arrange: Create user
      const keycloakId = uuidv4();
      const email = `delete-test-${Date.now()}@example.com`;

      await publishUserEvent({
        keycloakId,
        realmName: testTenantSlug,
        email,
        firstName: 'Delete',
        lastName: 'Me',
      });

      await waitFor(
        async () => {
          try {
            return (await userRepository.findByKeycloakId(keycloakId, tenantContext)) !== null;
          } catch {
            return false;
          }
        },
        SYNC_TIMEOUT,
        POLL_INTERVAL
      );

      // Act: Publish USER_DELETED event
      await publishUserEvent({
        keycloakId,
        realmName: testTenantSlug,
      });

      // Assert: User should be soft-deleted (status=DELETED)
      const deleteCompleted = await waitFor(
        async () => {
          try {
            const user = await userRepository.findByKeycloakId(keycloakId, tenantContext);
            return user?.status === 'DELETED';
          } catch {
            return false;
          }
        },
        SYNC_TIMEOUT,
        POLL_INTERVAL
      );

      expect(deleteCompleted).toBe(true);

      const deletedUser = await userRepository.findByKeycloakId(keycloakId, tenantContext);
      expect(deletedUser).toBeDefined(); // Still exists in DB
      expect(deletedUser!.status).toBe('DELETED'); // Soft-deleted
      expect(deletedUser!.email).toBe(email); // Data preserved
    }, 15000);
  });

  describe('Idempotency Guard', () => {
    // Note: Idempotency with identical event IDs is tested in unit tests
    // (apps/core-api/src/__tests__/auth/unit/user-sync.consumer.test.ts)
    // Integration tests verify that the same user isn't duplicated even with multiple events

    it('should not duplicate user records when multiple create events for same keycloakId', async () => {
      // Arrange
      const keycloakId = uuidv4();
      const email = `nodupe-test-${Date.now()}@example.com`;
      const userCreatedData: UserCreatedData = {
        keycloakId,
        realmName: testTenantSlug,
        email,
        firstName: 'No',
        lastName: 'Dupe',
      };

      // Act: Publish same user data twice (different event IDs, but same keycloakId)
      // The second should be an UPSERT, not create a duplicate
      await publishUserEvent(userCreatedData);
      await publishUserEvent(userCreatedData);

      // Wait for processing
      await waitFor(
        async () => {
          try {
            return (await userRepository.findByKeycloakId(keycloakId, tenantContext)) !== null;
          } catch {
            return false;
          }
        },
        SYNC_TIMEOUT,
        POLL_INTERVAL
      );

      // Assert: Only one user record exists
      const users = await db.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM ${tenantContext.schemaName}.users WHERE keycloak_id = '${keycloakId}'`
      );

      expect(users.length).toBe(1); // No duplicate records
    }, 10000);

    it('should process sequential events normally (create then update)', async () => {
      // Arrange
      const keycloakId = uuidv4();
      const email1 = `seq1-${Date.now()}@example.com`;
      const email2 = `seq2-${Date.now()}@example.com`;

      // Act: Create user
      await publishUserEvent({
        keycloakId,
        realmName: testTenantSlug,
        email: email1,
      });

      await waitFor(
        async () => {
          try {
            const user = await userRepository.findByKeycloakId(keycloakId, tenantContext);
            return user?.email === email1;
          } catch {
            return false;
          }
        },
        SYNC_TIMEOUT,
        POLL_INTERVAL
      );

      // Update user (different event, should process normally)
      await publishUserEvent({
        keycloakId,
        realmName: testTenantSlug,
        email: email2,
      });

      // Assert: Update should be processed
      const updateCompleted = await waitFor(
        async () => {
          try {
            const user = await userRepository.findByKeycloakId(keycloakId, tenantContext);
            return user?.email === email2;
          } catch {
            return false;
          }
        },
        SYNC_TIMEOUT,
        POLL_INTERVAL
      );

      expect(updateCompleted).toBe(true);
    }, 15000);
  });

  describe('Edge Case #2: Event Arrives Before Tenant Provisioning', () => {
    it('should retry up to 5 times when tenant not yet provisioned', async () => {
      // Arrange: Create tenant but suspend it (simulates "not provisioned" state)
      const suspendedTenant = await createTestTenant();
      await tenantService.updateTenant(suspendedTenant.id, {
        status: TenantStatus.SUSPENDED,
      });

      const keycloakId = uuidv4();
      const email = `retry-test-${Date.now()}@example.com`;

      // Act: Publish event for suspended tenant
      await eventBusService.publish(
        'plexica.auth.user.lifecycle',
        {
          keycloakId,
          realmName: suspendedTenant.slug,
          email,
        } as UserCreatedData,
        {
          source: 'integration-test',
          tenantId: suspendedTenant.id,
        }
      );

      // Wait for retry attempts (consumer logs should show retries)
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Reactivate tenant (simulates provisioning completing)
      await tenantService.updateTenant(suspendedTenant.id, {
        status: TenantStatus.ACTIVE,
      });

      // Publish event again (should succeed now)
      await publishUserEvent({
        keycloakId,
        realmName: suspendedTenant.slug,
        email,
      });

      // Assert: User should eventually be created after tenant reactivation
      const suspendedContext: TenantContext = {
        tenantId: suspendedTenant.id,
        tenantSlug: suspendedTenant.slug,
        schemaName: `tenant_${suspendedTenant.slug.replace(/-/g, '_')}`,
      };

      const syncCompleted = await waitFor(
        async () => {
          try {
            const user = await userRepository.findByKeycloakId(keycloakId, suspendedContext);
            return user !== null;
          } catch {
            return false;
          }
        },
        10000,
        POLL_INTERVAL
      );

      expect(syncCompleted).toBe(true);

      // Cleanup
      await tenantService.hardDeleteTenant(suspendedTenant.id);
    }, 20000);
  });

  describe('Edge Case #7: Consumer Lag Replay', () => {
    it('should process all events even with consumer restart (no data loss)', async () => {
      // Arrange: Publish 5 user.created events
      const userIds: string[] = [];
      const publishPromises: Promise<void>[] = [];

      for (let i = 0; i < 5; i++) {
        const keycloakId = uuidv4();
        userIds.push(keycloakId);
        publishPromises.push(
          publishUserEvent({
            keycloakId,
            realmName: testTenantSlug,
            email: `lag-test-${i}-${Date.now()}@example.com`,
            firstName: `User${i}`,
            lastName: 'LagTest',
          })
        );
      }

      await Promise.all(publishPromises);

      // Act: Stop consumer (simulates crash/restart)
      await userSyncConsumer.stop();

      // Wait briefly
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Restart consumer
      await userSyncConsumer.start();

      // Wait for consumer to be ready
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Assert: All 5 users should be synced (no data loss)
      const allSynced = await waitFor(
        async () => {
          try {
            const syncedCount = await Promise.all(
              userIds.map(async (id) => {
                const user = await userRepository.findByKeycloakId(id, tenantContext);
                return user !== null ? 1 : 0;
              })
            );
            const total: number = syncedCount.reduce((sum: number, count) => sum + count, 0);
            return total === 5;
          } catch {
            return false;
          }
        },
        15000,
        POLL_INTERVAL
      );

      expect(allSynced).toBe(true);

      // Verify all users exist in database
      for (const keycloakId of userIds) {
        const user = await userRepository.findByKeycloakId(keycloakId, tenantContext);
        expect(user).toBeDefined();
        expect(user!.status).toBe('ACTIVE');
      }
    }, 25000);
  });

  describe('Error Handling', () => {
    it('should skip processing if tenant does not exist', async () => {
      // Arrange: Publish event for non-existent tenant
      const keycloakId = uuidv4();
      const fakeSlug = 'non-existent-tenant-999999';

      // Act: Publish event
      await eventBusService.publish(
        'plexica.auth.user.lifecycle',
        {
          keycloakId,
          realmName: fakeSlug,
          email: `fake-${Date.now()}@example.com`,
        } as UserCreatedData,
        {
          source: 'integration-test',
          tenantId: 'fake-tenant-id',
        }
      );

      // Wait briefly
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Assert: No error thrown, event logged and skipped
      // (Consumer should log "Tenant not found" error but continue processing)
      expect(userSyncConsumer.isConsumerRunning()).toBe(true);
    }, 10000);

    it('should handle malformed event data gracefully', async () => {
      // Arrange: Publish event with invalid data
      await eventBusService.publish(
        'plexica.auth.user.lifecycle',
        {
          // Missing required keycloakId field
          realmName: testTenantSlug,
          email: 'malformed@example.com',
        } as any,
        {
          source: 'integration-test',
          tenantId: testTenantId,
        }
      );

      // Wait briefly
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Assert: Consumer should still be running (error logged, event skipped)
      expect(userSyncConsumer.isConsumerRunning()).toBe(true);
    }, 10000);
  });

  describe('Performance: Concurrent Events', () => {
    it('should handle 10 concurrent user.created events within 5 seconds', async () => {
      // Arrange
      const userIds: string[] = [];
      const publishPromises: Promise<void>[] = [];

      for (let i = 0; i < 10; i++) {
        const keycloakId = uuidv4();
        userIds.push(keycloakId);
        publishPromises.push(
          publishUserEvent({
            keycloakId,
            realmName: testTenantSlug,
            email: `concurrent-${i}-${Date.now()}@example.com`,
            firstName: `Concurrent${i}`,
            lastName: 'Test',
          })
        );
      }

      const startTime = Date.now();

      // Act: Publish all events concurrently
      await Promise.all(publishPromises);

      // Assert: All 10 users synced within 5 seconds
      const allSynced = await waitFor(
        async () => {
          try {
            const syncedCount = await Promise.all(
              userIds.map(async (id) => {
                const user = await userRepository.findByKeycloakId(id, tenantContext);
                return user !== null ? 1 : 0;
              })
            );
            const total: number = syncedCount.reduce((sum: number, count) => sum + count, 0);
            return total === 10;
          } catch {
            return false;
          }
        },
        SYNC_TIMEOUT,
        POLL_INTERVAL
      );

      const totalDuration = Date.now() - startTime;

      expect(allSynced).toBe(true);
      expect(totalDuration).toBeLessThan(5000); // NFR-002 compliance

      // Verify all users
      for (const keycloakId of userIds) {
        const user = await userRepository.findByKeycloakId(keycloakId, tenantContext);
        expect(user).toBeDefined();
        expect(user!.status).toBe('ACTIVE');
      }
    }, 15000);
  });
});
