/**
 * Unit tests for UserSyncConsumer (Task 5.3)
 *
 * Tests the Redpanda consumer for Keycloak user lifecycle events:
 * - Constructor and lifecycle (start/stop)
 * - handleUserCreated: Create user in tenant DB
 * - handleUserUpdated: Update user with changed fields
 * - handleUserDeleted: Soft-delete user
 * - getTenantContextWithRetry: Edge Case #2 retry logic
 * - Idempotency guard (Redis deduplication)
 * - Event routing and error handling
 *
 * Coverage Target: ≥90%
 * Constitution Compliance: Articles 3.2, 5.3, 6.3, 8.2
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Logger } from 'pino';
import { UserSyncConsumer } from '../../../services/user-sync.consumer.js';
import type {
  EventBusService,
  DomainEvent,
  UserCreatedData,
  UserUpdatedData,
  UserDeletedData,
} from '@plexica/event-bus';
import type { UserRepository } from '../../../repositories/user.repository.js';
import type { TenantService } from '../../../services/tenant.service.js';
import type { TenantContext } from '../../../middleware/tenant-context.js';
import type { Tenant } from '@plexica/database';

// Mock redis module
vi.mock('../../../lib/redis.js', () => ({
  redis: {
    exists: vi.fn(),
    setex: vi.fn(),
  },
}));

import { redis } from '../../../lib/redis.js';

// Test helpers
function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as Logger;
}

function createMockEventBus(): EventBusService {
  return {
    subscribe: vi.fn().mockResolvedValue('subscription-123'),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn(),
  } as unknown as EventBusService;
}

function createMockUserRepository(): UserRepository {
  return {
    create: vi.fn().mockResolvedValue({ id: 'user-123', keycloakId: 'keycloak-user-123' }),
    update: vi.fn().mockResolvedValue({ id: 'user-123', keycloakId: 'keycloak-user-123' }),
    softDelete: vi.fn().mockResolvedValue(undefined),
    findByKeycloakId: vi.fn(),
    upsert: vi.fn(),
  } as unknown as UserRepository;
}

function createMockTenantService(): TenantService {
  return {
    getTenantBySlug: vi.fn().mockResolvedValue({
      id: 'tenant-123',
      name: 'Acme Corp',
      slug: 'acme-corp',
      schemaName: 'tenant_acme_corp',
      status: 'ACTIVE',
      settings: {},
      theme: {},
      translationOverrides: {},
      defaultLocale: 'en',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    } as Tenant),
  } as unknown as TenantService;
}

function createMockEvent<T>(
  type: string,
  data: T,
  overrides?: Partial<DomainEvent<T>>
): DomainEvent<T> {
  return {
    id: 'event-123e4567-e89b-12d3-a456-426614174000',
    type,
    tenantId: 'tenant-123',
    timestamp: new Date('2024-01-15T10:00:00Z'),
    data,
    metadata: {
      source: 'keycloak',
      version: '1.0',
    },
    ...overrides,
  };
}

function createMockTenantContext(): TenantContext {
  return {
    tenantId: 'tenant-123',
    tenantSlug: 'acme-corp',
    schemaName: 'tenant_acme_corp',
  };
}

describe('UserSyncConsumer', () => {
  let consumer: UserSyncConsumer;
  let mockEventBus: EventBusService;
  let mockLogger: Logger;
  let mockUserRepo: UserRepository;
  let mockTenantService: TenantService;

  beforeEach(() => {
    // Create fresh mocks for each test
    mockEventBus = createMockEventBus();
    mockLogger = createMockLogger();
    mockUserRepo = createMockUserRepository();
    mockTenantService = createMockTenantService();

    // Reset redis mocks
    vi.mocked(redis.exists).mockResolvedValue(0);
    vi.mocked(redis.setex).mockResolvedValue('OK');

    // Create consumer instance with options object API
    consumer = new UserSyncConsumer(mockEventBus, {
      logger: mockLogger,
      userRepository: mockUserRepo,
      tenantService: mockTenantService,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor & Lifecycle', () => {
    it('should initialize with provided dependencies', () => {
      expect(consumer).toBeDefined();
      expect(consumer.isConsumerRunning()).toBe(false);
      expect(consumer.getSubscriptionId()).toBeNull();
    });

    it('should use default dependencies when not provided', () => {
      const consumerWithDefaults = new UserSyncConsumer(mockEventBus, {});
      expect(consumerWithDefaults).toBeDefined();
    });

    it('should start successfully and subscribe to topic', async () => {
      await consumer.start();

      expect(mockEventBus.subscribe).toHaveBeenCalledWith(
        'plexica.auth.user.lifecycle',
        expect.any(Function),
        {
          groupId: 'plexica-user-sync',
          fromBeginning: true,
          autoCommit: true,
        }
      );
      expect(consumer.isConsumerRunning()).toBe(true);
      expect(consumer.getSubscriptionId()).toBe('subscription-123');
      expect(mockLogger.info).toHaveBeenCalledWith('Starting UserSyncConsumer...');
      expect(mockLogger.info).toHaveBeenCalledWith(
        { subscriptionId: 'subscription-123', groupId: 'plexica-user-sync', fromBeginning: true },
        'UserSyncConsumer started successfully'
      );
    });

    it('should throw error if already running', async () => {
      await consumer.start();
      await expect(consumer.start()).rejects.toThrow('UserSyncConsumer is already running');
    });

    it('should stop successfully and unsubscribe', async () => {
      await consumer.start();
      await consumer.stop();

      expect(mockEventBus.unsubscribe).toHaveBeenCalledWith('subscription-123');
      expect(consumer.isConsumerRunning()).toBe(false);
      expect(consumer.getSubscriptionId()).toBeNull();
      expect(mockLogger.info).toHaveBeenCalledWith('UserSyncConsumer stopped successfully');
    });

    it('should log warning if stop called when not running', async () => {
      await consumer.stop();

      expect(mockLogger.warn).toHaveBeenCalledWith('UserSyncConsumer is not running');
      expect(mockEventBus.unsubscribe).not.toHaveBeenCalled();
    });
  });

  describe('handleUserCreated()', () => {
    const validUserCreatedEvent = createMockEvent<UserCreatedData>('USER_CREATED', {
      keycloakId: '123e4567-e89b-12d3-a456-426614174000',
      realmName: 'acme-corp',
      email: 'john.doe@example.com',
      firstName: 'John',
      lastName: 'Doe',
    });

    it('should create user in tenant database on valid event', async () => {
      await consumer.handleUserCreated(validUserCreatedEvent);

      expect(mockTenantService.getTenantBySlug).toHaveBeenCalledWith('acme-corp');
      expect(mockUserRepo.create).toHaveBeenCalledWith(
        {
          keycloakId: '123e4567-e89b-12d3-a456-426614174000',
          email: 'john.doe@example.com',
          firstName: 'John',
          lastName: 'Doe',
          status: 'ACTIVE',
        },
        createMockTenantContext()
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        { keycloakId: '123e4567-e89b-12d3-a456-426614174000', realmName: 'acme-corp' },
        'Processing USER_CREATED event'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        {
          keycloakId: '123e4567-e89b-12d3-a456-426614174000',
          email: 'john.doe@example.com',
          schemaName: 'tenant_acme_corp',
        },
        'User created successfully in tenant database'
      );
    });

    it('should create user without optional fields (firstName, lastName)', async () => {
      const minimalEvent = createMockEvent<UserCreatedData>('USER_CREATED', {
        keycloakId: '123e4567-e89b-12d3-a456-426614174000',
        realmName: 'acme-corp',
        email: 'minimal@example.com',
      });

      await consumer.handleUserCreated(minimalEvent);

      expect(mockUserRepo.create).toHaveBeenCalledWith(
        {
          keycloakId: '123e4567-e89b-12d3-a456-426614174000',
          email: 'minimal@example.com',
          firstName: undefined,
          lastName: undefined,
          status: 'ACTIVE',
        },
        createMockTenantContext()
      );
    });

    it('should throw error on Zod validation failure (invalid email)', async () => {
      const invalidEvent = createMockEvent<UserCreatedData>('USER_CREATED', {
        keycloakId: '123e4567-e89b-12d3-a456-426614174000',
        realmName: 'acme-corp',
        email: 'not-an-email',
      });

      await expect(consumer.handleUserCreated(invalidEvent)).rejects.toThrow();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should throw error on Zod validation failure (invalid keycloakId)', async () => {
      const invalidEvent = createMockEvent<UserCreatedData>('USER_CREATED', {
        keycloakId: 'not-a-uuid',
        realmName: 'acme-corp',
        email: 'test@example.com',
      });

      await expect(consumer.handleUserCreated(invalidEvent)).rejects.toThrow();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should skip gracefully when tenant not found (permanent error)', async () => {
      vi.mocked(mockTenantService.getTenantBySlug).mockRejectedValue(
        new Error('Tenant not found: acme-corp')
      );

      // Should NOT throw - consumer skips events for non-existent tenants
      await consumer.handleUserCreated(validUserCreatedEvent);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        {
          keycloakId: '123e4567-e89b-12d3-a456-426614174000',
          realmName: 'acme-corp',
        },
        'Skipping USER_CREATED event - tenant does not exist (may be old test data)'
      );
      // User should NOT be created since tenant doesn't exist
      expect(mockUserRepo.create).not.toHaveBeenCalled();
    });

    it('should throw error when UserRepository.create fails', async () => {
      vi.mocked(mockUserRepo.create).mockRejectedValue(new Error('Database connection failed'));

      await expect(consumer.handleUserCreated(validUserCreatedEvent)).rejects.toThrow(
        'Database connection failed'
      );
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should log error with full context and re-throw', async () => {
      const dbError = new Error('Unique constraint violation');
      vi.mocked(mockUserRepo.create).mockRejectedValue(dbError);

      await expect(consumer.handleUserCreated(validUserCreatedEvent)).rejects.toThrow(
        'Unique constraint violation'
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          keycloakId: '123e4567-e89b-12d3-a456-426614174000',
          realmName: 'acme-corp',
          error: 'Unique constraint violation',
        }),
        'Failed to handle USER_CREATED event'
      );
    });
  });

  describe('handleUserUpdated()', () => {
    const validUserUpdatedEvent = createMockEvent<UserUpdatedData>('USER_UPDATED', {
      keycloakId: '123e4567-e89b-12d3-a456-426614174000',
      realmName: 'acme-corp',
      email: 'newemail@example.com',
      firstName: 'Jane',
    });

    it('should update user with changed fields only', async () => {
      await consumer.handleUserUpdated(validUserUpdatedEvent);

      expect(mockTenantService.getTenantBySlug).toHaveBeenCalledWith('acme-corp');
      expect(mockUserRepo.update).toHaveBeenCalledWith(
        '123e4567-e89b-12d3-a456-426614174000',
        {
          email: 'newemail@example.com',
          firstName: 'Jane',
        },
        createMockTenantContext()
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        {
          keycloakId: '123e4567-e89b-12d3-a456-426614174000',
          fieldsUpdated: ['email', 'firstName'],
          schemaName: 'tenant_acme_corp',
        },
        'User updated successfully in tenant database'
      );
    });

    it('should update only email if only email changed', async () => {
      const emailOnlyEvent = createMockEvent<UserUpdatedData>('USER_UPDATED', {
        keycloakId: '123e4567-e89b-12d3-a456-426614174000',
        realmName: 'acme-corp',
        email: 'updated@example.com',
      });

      await consumer.handleUserUpdated(emailOnlyEvent);

      expect(mockUserRepo.update).toHaveBeenCalledWith(
        '123e4567-e89b-12d3-a456-426614174000',
        { email: 'updated@example.com' },
        createMockTenantContext()
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ fieldsUpdated: ['email'] }),
        'User updated successfully in tenant database'
      );
    });

    it('should update all fields when all changed', async () => {
      const allFieldsEvent = createMockEvent<UserUpdatedData>('USER_UPDATED', {
        keycloakId: '123e4567-e89b-12d3-a456-426614174000',
        realmName: 'acme-corp',
        email: 'new@example.com',
        firstName: 'Updated',
        lastName: 'Name',
      });

      await consumer.handleUserUpdated(allFieldsEvent);

      expect(mockUserRepo.update).toHaveBeenCalledWith(
        '123e4567-e89b-12d3-a456-426614174000',
        {
          email: 'new@example.com',
          firstName: 'Updated',
          lastName: 'Name',
        },
        createMockTenantContext()
      );
    });

    it('should throw error on Zod validation failure', async () => {
      const invalidEvent = createMockEvent<UserUpdatedData>('USER_UPDATED', {
        keycloakId: 'not-a-uuid',
        realmName: 'acme-corp',
      });

      await expect(consumer.handleUserUpdated(invalidEvent)).rejects.toThrow();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should skip gracefully when tenant not found (permanent error)', async () => {
      vi.mocked(mockTenantService.getTenantBySlug).mockRejectedValue(new Error('Tenant not found'));

      // Should NOT throw - consumer skips events for non-existent tenants
      await consumer.handleUserUpdated(validUserUpdatedEvent);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        {
          keycloakId: '123e4567-e89b-12d3-a456-426614174000',
          realmName: 'acme-corp',
        },
        'Skipping USER_UPDATED event - tenant does not exist (may be old test data)'
      );
      expect(mockUserRepo.update).not.toHaveBeenCalled();
    });

    it('should throw error when UserRepository.update fails (user not found)', async () => {
      vi.mocked(mockUserRepo.update).mockRejectedValue(new Error('User not found'));

      await expect(consumer.handleUserUpdated(validUserUpdatedEvent)).rejects.toThrow(
        'User not found'
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          keycloakId: '123e4567-e89b-12d3-a456-426614174000',
          realmName: 'acme-corp',
        }),
        'Failed to handle USER_UPDATED event'
      );
    });

    it('should log error with full context and re-throw', async () => {
      const error = new Error('Database error');
      vi.mocked(mockUserRepo.update).mockRejectedValue(error);

      await expect(consumer.handleUserUpdated(validUserUpdatedEvent)).rejects.toThrow(
        'Database error'
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Database error' }),
        'Failed to handle USER_UPDATED event'
      );
    });
  });

  describe('handleUserDeleted()', () => {
    const validUserDeletedEvent = createMockEvent<UserDeletedData>('USER_DELETED', {
      keycloakId: '123e4567-e89b-12d3-a456-426614174000',
      realmName: 'acme-corp',
    });

    it('should soft-delete user in tenant database', async () => {
      await consumer.handleUserDeleted(validUserDeletedEvent);

      expect(mockTenantService.getTenantBySlug).toHaveBeenCalledWith('acme-corp');
      expect(mockUserRepo.softDelete).toHaveBeenCalledWith(
        '123e4567-e89b-12d3-a456-426614174000',
        createMockTenantContext()
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        { keycloakId: '123e4567-e89b-12d3-a456-426614174000', realmName: 'acme-corp' },
        'Processing USER_DELETED event'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        {
          keycloakId: '123e4567-e89b-12d3-a456-426614174000',
          schemaName: 'tenant_acme_corp',
        },
        'User soft-deleted successfully in tenant database'
      );
    });

    it('should throw error on Zod validation failure (invalid keycloakId)', async () => {
      const invalidEvent = createMockEvent<UserDeletedData>('USER_DELETED', {
        keycloakId: 'not-a-uuid',
        realmName: 'acme-corp',
      });

      await expect(consumer.handleUserDeleted(invalidEvent)).rejects.toThrow();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should throw error on Zod validation failure (missing realmName)', async () => {
      const invalidEvent = createMockEvent<any>('USER_DELETED', {
        keycloakId: '123e4567-e89b-12d3-a456-426614174000',
      });

      await expect(consumer.handleUserDeleted(invalidEvent)).rejects.toThrow();
    });

    it('should skip gracefully when tenant not found (permanent error)', async () => {
      vi.mocked(mockTenantService.getTenantBySlug).mockRejectedValue(new Error('Tenant not found'));

      // Should NOT throw - consumer skips events for non-existent tenants
      await consumer.handleUserDeleted(validUserDeletedEvent);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        {
          keycloakId: '123e4567-e89b-12d3-a456-426614174000',
          realmName: 'acme-corp',
        },
        'Skipping USER_DELETED event - tenant does not exist (may be old test data)'
      );
      expect(mockUserRepo.softDelete).not.toHaveBeenCalled();
    });

    it('should throw error when UserRepository.softDelete fails', async () => {
      vi.mocked(mockUserRepo.softDelete).mockRejectedValue(new Error('User not found'));

      await expect(consumer.handleUserDeleted(validUserDeletedEvent)).rejects.toThrow(
        'User not found'
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          keycloakId: '123e4567-e89b-12d3-a456-426614174000',
          realmName: 'acme-corp',
        }),
        'Failed to handle USER_DELETED event'
      );
    });

    it('should log error with full context and re-throw', async () => {
      const error = new Error('Database error');
      vi.mocked(mockUserRepo.softDelete).mockRejectedValue(error);

      await expect(consumer.handleUserDeleted(validUserDeletedEvent)).rejects.toThrow(
        'Database error'
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Database error' }),
        'Failed to handle USER_DELETED event'
      );
    });
  });

  describe('getTenantContextWithRetry() - Edge Case #2', () => {
    // Use fake timers for tests with retry delays to avoid 48+ second test runs
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return tenant context on first attempt', async () => {
      const event = createMockEvent<UserCreatedData>('USER_CREATED', {
        keycloakId: '123e4567-e89b-12d3-a456-426614174000',
        realmName: 'acme-corp',
        email: 'test@example.com',
      });

      await consumer.handleUserCreated(event);

      expect(mockTenantService.getTenantBySlug).toHaveBeenCalledTimes(1);
      expect(mockTenantService.getTenantBySlug).toHaveBeenCalledWith('acme-corp');
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should retry and succeed on 2nd attempt (Edge Case #2)', async () => {
      vi.mocked(mockTenantService.getTenantBySlug)
        .mockRejectedValueOnce(new Error("Tenant 'acme-corp' found but schema not provisioned yet"))
        .mockResolvedValueOnce({
          id: 'tenant-123',
          name: 'Acme Corp',
          slug: 'acme-corp',
          schemaName: 'tenant_acme_corp',
          status: 'ACTIVE',
          settings: {},
          theme: {},
          translationOverrides: {},
          defaultLocale: 'en',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        } as Tenant);

      const event = createMockEvent<UserCreatedData>('USER_CREATED', {
        keycloakId: '123e4567-e89b-12d3-a456-426614174000',
        realmName: 'acme-corp',
        email: 'test@example.com',
      });

      // Start the async operation
      const promise = consumer.handleUserCreated(event);

      // Advance timers to skip the 1s retry delay
      await vi.advanceTimersByTimeAsync(1000);

      await promise;

      expect(mockTenantService.getTenantBySlug).toHaveBeenCalledTimes(2);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          realmName: 'acme-corp',
          attempt: 1,
          maxAttempts: 5,
          delayMs: 1000,
        }),
        'Tenant lookup failed, retrying after delay (Edge Case #2)'
      );
    });

    it('should retry 5 times and throw error after exhaustion', async () => {
      vi.mocked(mockTenantService.getTenantBySlug).mockRejectedValue(
        new Error("Tenant 'acme-corp' found but schema not provisioned yet")
      );

      const event = createMockEvent<UserCreatedData>('USER_CREATED', {
        keycloakId: '123e4567-e89b-12d3-a456-426614174000',
        realmName: 'acme-corp',
        email: 'test@example.com',
      });

      // Start the async operation and attach rejection handler to prevent unhandled rejection
      let caughtError: Error | undefined;
      const promise = consumer.handleUserCreated(event).catch((err) => {
        caughtError = err;
      });

      // Advance timers through all retry delays (1s + 2s + 5s + 10s = 18s total)
      // Note: 5th attempt has no delay
      await vi.advanceTimersByTimeAsync(1000); // 1st retry
      await vi.advanceTimersByTimeAsync(2000); // 2nd retry
      await vi.advanceTimersByTimeAsync(5000); // 3rd retry
      await vi.advanceTimersByTimeAsync(10000); // 4th retry

      await promise;

      expect(caughtError).toBeDefined();
      expect(caughtError!.message).toContain("Tenant 'acme-corp' not provisioned after 5 attempts");

      expect(mockTenantService.getTenantBySlug).toHaveBeenCalledTimes(5);
      expect(mockLogger.warn).toHaveBeenCalledTimes(5); // 5 warn logs (one per attempt)
      expect(mockLogger.error).toHaveBeenCalledWith(
        { realmName: 'acme-corp', attempts: 5 },
        'Failed to get tenant context after all retry attempts'
      );
    });

    it('should skip gracefully on permanent error (tenant not found)', async () => {
      vi.mocked(mockTenantService.getTenantBySlug).mockRejectedValue(
        new Error('Tenant not found: acme-corp')
      );

      const event = createMockEvent<UserCreatedData>('USER_CREATED', {
        keycloakId: '123e4567-e89b-12d3-a456-426614174000',
        realmName: 'acme-corp',
        email: 'test@example.com',
      });

      // Should NOT throw - consumer skips events for non-existent tenants
      await consumer.handleUserCreated(event);

      // Should not retry - permanent error
      expect(mockTenantService.getTenantBySlug).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        {
          keycloakId: '123e4567-e89b-12d3-a456-426614174000',
          realmName: 'acme-corp',
        },
        'Skipping USER_CREATED event - tenant does not exist (may be old test data)'
      );
    });

    it('should warn but proceed when tenant status is PROVISIONING', async () => {
      vi.mocked(mockTenantService.getTenantBySlug).mockResolvedValue({
        id: 'tenant-123',
        slug: 'acme-corp',
        schemaName: null,
        status: 'PROVISIONING',
      } as any);

      const event = createMockEvent<UserCreatedData>('USER_CREATED', {
        keycloakId: '123e4567-e89b-12d3-a456-426614174000',
        realmName: 'acme-corp',
        email: 'test@example.com',
      });

      // Consumer computes schemaName from slug, so it proceeds even if tenant.schemaName is null
      await consumer.handleUserCreated(event);

      expect(mockTenantService.getTenantBySlug).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        { realmName: 'acme-corp', status: 'PROVISIONING' },
        'Tenant exists but status is not ACTIVE - processing anyway'
      );
      expect(mockUserRepo.create).toHaveBeenCalled(); // Processing continues
    });

    it('should warn if tenant status is not ACTIVE', async () => {
      vi.mocked(mockTenantService.getTenantBySlug).mockResolvedValue({
        id: 'tenant-123',
        name: 'Acme Corp',
        slug: 'acme-corp',
        schemaName: 'tenant_acme_corp',
        status: 'SUSPENDED',
        settings: {},
        theme: {},
        translationOverrides: {},
        defaultLocale: 'en',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      } as Tenant);

      const event = createMockEvent<UserCreatedData>('USER_CREATED', {
        keycloakId: '123e4567-e89b-12d3-a456-426614174000',
        realmName: 'acme-corp',
        email: 'test@example.com',
      });

      await consumer.handleUserCreated(event);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        { realmName: 'acme-corp', status: 'SUSPENDED' },
        'Tenant exists but status is not ACTIVE - processing anyway'
      );
      expect(mockUserRepo.create).toHaveBeenCalled(); // Processing continues
    });

    it('should use exponential backoff delays (1s, 2s, 5s, 10s, 30s)', async () => {
      vi.mocked(mockTenantService.getTenantBySlug)
        .mockRejectedValueOnce(new Error('Schema not provisioned'))
        .mockRejectedValueOnce(new Error('Schema not provisioned'))
        .mockRejectedValueOnce(new Error('Schema not provisioned'))
        .mockResolvedValueOnce({
          id: 'tenant-123',
          name: 'Acme Corp',
          slug: 'acme-corp',
          schemaName: 'tenant_acme_corp',
          status: 'ACTIVE',
          settings: {},
          theme: {},
          translationOverrides: {},
          defaultLocale: 'en',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        } as Tenant);

      const event = createMockEvent<UserCreatedData>('USER_CREATED', {
        keycloakId: '123e4567-e89b-12d3-a456-426614174000',
        realmName: 'acme-corp',
        email: 'test@example.com',
      });

      // Start the async operation
      const promise = consumer.handleUserCreated(event);

      // Advance timers through retry delays
      await vi.advanceTimersByTimeAsync(1000); // 1st retry
      await vi.advanceTimersByTimeAsync(2000); // 2nd retry
      await vi.advanceTimersByTimeAsync(5000); // 3rd retry

      await promise;

      const warnCalls = vi.mocked(mockLogger.warn).mock.calls;
      expect(warnCalls[0][0]).toMatchObject({ delayMs: 1000 }); // 1st retry: 1s
      expect(warnCalls[1][0]).toMatchObject({ delayMs: 2000 }); // 2nd retry: 2s
      expect(warnCalls[2][0]).toMatchObject({ delayMs: 5000 }); // 3rd retry: 5s
    });

    it('should log each retry attempt with full context', async () => {
      vi.mocked(mockTenantService.getTenantBySlug)
        .mockRejectedValueOnce(new Error('Schema not provisioned'))
        .mockResolvedValueOnce({
          id: 'tenant-123',
          name: 'Acme Corp',
          slug: 'acme-corp',
          schemaName: 'tenant_acme_corp',
          status: 'ACTIVE',
          settings: {},
          theme: {},
          translationOverrides: {},
          defaultLocale: 'en',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        } as Tenant);

      const event = createMockEvent<UserCreatedData>('USER_CREATED', {
        keycloakId: '123e4567-e89b-12d3-a456-426614174000',
        realmName: 'acme-corp',
        email: 'test@example.com',
      });

      // Start the async operation
      const promise = consumer.handleUserCreated(event);

      // Advance timer through the 1s delay
      await vi.advanceTimersByTimeAsync(1000);

      await promise;

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          realmName: 'acme-corp',
          attempt: 1,
          maxAttempts: 5,
          delayMs: 1000,
          error: 'Schema not provisioned',
        }),
        'Tenant lookup failed, retrying after delay (Edge Case #2)'
      );
    });
  });

  describe('Idempotency Guard', () => {
    it('should return true if event already processed', async () => {
      vi.mocked(redis.exists).mockResolvedValue(1);

      const event = createMockEvent<UserCreatedData>('USER_CREATED', {
        keycloakId: '123e4567-e89b-12d3-a456-426614174000',
        realmName: 'acme-corp',
        email: 'test@example.com',
      });

      // Use handleUserLifecycleEvent to test idempotency guard
      const handler = (consumer as any).handleUserLifecycleEvent.bind(consumer);
      await handler(event);

      expect(redis.exists).toHaveBeenCalledWith(
        'user-sync:event:event-123e4567-e89b-12d3-a456-426614174000'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        { eventId: event.id, eventType: 'USER_CREATED' },
        'Skipping duplicate event (already processed)'
      );
      expect(mockUserRepo.create).not.toHaveBeenCalled();
    });

    it('should return false if event not yet processed', async () => {
      vi.mocked(redis.exists).mockResolvedValue(0);

      const event = createMockEvent<UserCreatedData>('USER_CREATED', {
        keycloakId: '123e4567-e89b-12d3-a456-426614174000',
        realmName: 'acme-corp',
        email: 'test@example.com',
      });

      const handler = (consumer as any).handleUserLifecycleEvent.bind(consumer);
      await handler(event);

      expect(redis.exists).toHaveBeenCalled();
      expect(mockUserRepo.create).toHaveBeenCalled(); // Processing continues
    });

    it('should return false on Redis error (fail-open)', async () => {
      vi.mocked(redis.exists).mockRejectedValue(new Error('Redis connection failed'));

      const event = createMockEvent<UserCreatedData>('USER_CREATED', {
        keycloakId: '123e4567-e89b-12d3-a456-426614174000',
        realmName: 'acme-corp',
        email: 'test@example.com',
      });

      const handler = (consumer as any).handleUserLifecycleEvent.bind(consumer);
      await handler(event);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: event.id,
          error: 'Redis connection failed',
        }),
        'Failed to check idempotency in Redis'
      );
      expect(mockUserRepo.create).toHaveBeenCalled(); // Processing continues (fail-open)
    });

    it('should mark event as processed with 24h TTL', async () => {
      vi.mocked(redis.exists).mockResolvedValue(0);

      const event = createMockEvent<UserCreatedData>('USER_CREATED', {
        keycloakId: '123e4567-e89b-12d3-a456-426614174000',
        realmName: 'acme-corp',
        email: 'test@example.com',
      });

      const handler = (consumer as any).handleUserLifecycleEvent.bind(consumer);
      await handler(event);

      expect(redis.setex).toHaveBeenCalledWith(
        'user-sync:event:event-123e4567-e89b-12d3-a456-426614174000',
        86400, // 24 hours
        '1'
      );
    });

    it('should log error but not throw if markEventProcessed fails', async () => {
      vi.mocked(redis.exists).mockResolvedValue(0);
      vi.mocked(redis.setex).mockRejectedValue(new Error('Redis write failed'));

      const event = createMockEvent<UserCreatedData>('USER_CREATED', {
        keycloakId: '123e4567-e89b-12d3-a456-426614174000',
        realmName: 'acme-corp',
        email: 'test@example.com',
      });

      const handler = (consumer as any).handleUserLifecycleEvent.bind(consumer);
      await handler(event); // Should not throw

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: event.id,
          error: 'Redis write failed',
        }),
        'Failed to mark event as processed in Redis'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'USER_CREATED' }),
        'User lifecycle event processed successfully'
      );
    });

    it('should skip duplicate events in handleUserLifecycleEvent', async () => {
      vi.mocked(redis.exists).mockResolvedValue(1); // Event already processed

      const event = createMockEvent<UserCreatedData>('USER_CREATED', {
        keycloakId: '123e4567-e89b-12d3-a456-426614174000',
        realmName: 'acme-corp',
        email: 'test@example.com',
      });

      const handler = (consumer as any).handleUserLifecycleEvent.bind(consumer);
      await handler(event);

      expect(mockTenantService.getTenantBySlug).not.toHaveBeenCalled();
      expect(mockUserRepo.create).not.toHaveBeenCalled();
      expect(redis.setex).not.toHaveBeenCalled(); // Don't mark again
    });
  });

  describe('Event Routing', () => {
    it('should route USER_CREATED to handleUserCreated', async () => {
      vi.mocked(redis.exists).mockResolvedValue(0);

      const event = createMockEvent<UserCreatedData>('USER_CREATED', {
        keycloakId: '123e4567-e89b-12d3-a456-426614174000',
        realmName: 'acme-corp',
        email: 'test@example.com',
      });

      const handler = (consumer as any).handleUserLifecycleEvent.bind(consumer);
      await handler(event);

      expect(mockUserRepo.create).toHaveBeenCalled();
      expect(mockUserRepo.update).not.toHaveBeenCalled();
      expect(mockUserRepo.softDelete).not.toHaveBeenCalled();
    });

    it('should route USER_UPDATED to handleUserUpdated', async () => {
      vi.mocked(redis.exists).mockResolvedValue(0);

      const event = createMockEvent<UserUpdatedData>('USER_UPDATED', {
        keycloakId: '123e4567-e89b-12d3-a456-426614174000',
        realmName: 'acme-corp',
        email: 'new@example.com',
      });

      const handler = (consumer as any).handleUserLifecycleEvent.bind(consumer);
      await handler(event);

      expect(mockUserRepo.update).toHaveBeenCalled();
      expect(mockUserRepo.create).not.toHaveBeenCalled();
      expect(mockUserRepo.softDelete).not.toHaveBeenCalled();
    });

    it('should route USER_DELETED to handleUserDeleted', async () => {
      vi.mocked(redis.exists).mockResolvedValue(0);

      const event = createMockEvent<UserDeletedData>('USER_DELETED', {
        keycloakId: '123e4567-e89b-12d3-a456-426614174000',
        realmName: 'acme-corp',
      });

      const handler = (consumer as any).handleUserLifecycleEvent.bind(consumer);
      await handler(event);

      expect(mockUserRepo.softDelete).toHaveBeenCalled();
      expect(mockUserRepo.create).not.toHaveBeenCalled();
      expect(mockUserRepo.update).not.toHaveBeenCalled();
    });

    it('should log warning for unknown event type', async () => {
      vi.mocked(redis.exists).mockResolvedValue(0);

      const event = createMockEvent<any>('UNKNOWN_EVENT_TYPE', {});

      const handler = (consumer as any).handleUserLifecycleEvent.bind(consumer);
      await handler(event);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        { eventId: event.id, eventType: 'UNKNOWN_EVENT_TYPE' },
        'Unknown user lifecycle event type, skipping'
      );
      expect(mockUserRepo.create).not.toHaveBeenCalled();
      expect(redis.setex).not.toHaveBeenCalled(); // Don't mark unknown events
    });

    it('should mark event as processed after successful handling', async () => {
      vi.mocked(redis.exists).mockResolvedValue(0);

      const event = createMockEvent<UserCreatedData>('USER_CREATED', {
        keycloakId: '123e4567-e89b-12d3-a456-426614174000',
        realmName: 'acme-corp',
        email: 'test@example.com',
      });

      const handler = (consumer as any).handleUserLifecycleEvent.bind(consumer);
      await handler(event);

      expect(redis.setex).toHaveBeenCalledWith(
        'user-sync:event:event-123e4567-e89b-12d3-a456-426614174000',
        86400,
        '1'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        { eventId: event.id, eventType: 'USER_CREATED' },
        'User lifecycle event processed successfully'
      );
    });
  });

  describe('Error Handling', () => {
    it('should re-throw errors to trigger Redpanda retry/DLQ', async () => {
      vi.mocked(redis.exists).mockResolvedValue(0);
      vi.mocked(mockUserRepo.create).mockRejectedValue(new Error('Database error'));

      const event = createMockEvent<UserCreatedData>('USER_CREATED', {
        keycloakId: '123e4567-e89b-12d3-a456-426614174000',
        realmName: 'acme-corp',
        email: 'test@example.com',
      });

      const handler = (consumer as any).handleUserLifecycleEvent.bind(consumer);
      await expect(handler(event)).rejects.toThrow('Database error');
    });

    it('should log errors with full context (eventId, eventType, error, stack)', async () => {
      vi.mocked(redis.exists).mockResolvedValue(0);
      const error = new Error('Processing failed');
      vi.mocked(mockUserRepo.create).mockRejectedValue(error);

      const event = createMockEvent<UserCreatedData>('USER_CREATED', {
        keycloakId: '123e4567-e89b-12d3-a456-426614174000',
        realmName: 'acme-corp',
        email: 'test@example.com',
      });

      const handler = (consumer as any).handleUserLifecycleEvent.bind(consumer);
      await expect(handler(event)).rejects.toThrow('Processing failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: event.id,
          eventType: 'USER_CREATED',
          error: 'Processing failed',
          stack: expect.any(String),
        }),
        'Failed to process user lifecycle event'
      );
    });

    it('should not mark event as processed on error', async () => {
      vi.mocked(redis.exists).mockResolvedValue(0);
      vi.mocked(mockUserRepo.create).mockRejectedValue(new Error('Database error'));

      const event = createMockEvent<UserCreatedData>('USER_CREATED', {
        keycloakId: '123e4567-e89b-12d3-a456-426614174000',
        realmName: 'acme-corp',
        email: 'test@example.com',
      });

      const handler = (consumer as any).handleUserLifecycleEvent.bind(consumer);
      await expect(handler(event)).rejects.toThrow('Database error');

      expect(redis.setex).not.toHaveBeenCalled(); // Don't mark failed events
    });
  });
});
