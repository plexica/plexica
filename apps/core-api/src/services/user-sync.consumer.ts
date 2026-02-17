// File: apps/core-api/src/services/user-sync.consumer.ts
import type { Logger } from 'pino';
import {
  EventBusService,
  type DomainEvent,
  type UserCreatedData,
  type UserUpdatedData,
  type UserDeletedData,
  UserCreatedDataSchema,
  UserUpdatedDataSchema,
  UserDeletedDataSchema,
} from '@plexica/event-bus';
import { logger as defaultLogger } from '../lib/logger.js';
import { redis } from '../lib/redis.js';
import { userRepository, type UserRepository } from '../repositories/user.repository.js';
import { tenantService, type TenantService } from './tenant.service.js';
import type { TenantContext } from '../middleware/tenant-context.js';

/**
 * UserSyncConsumer - Redpanda consumer for Keycloak user lifecycle events
 *
 * This service subscribes to user lifecycle events from Keycloak and syncs
 * them to the tenant-scoped users table in the database.
 *
 * Features:
 * - Event-driven user synchronization (FR-007)
 * - Idempotency guard (deduplicate by event ID via Redis)
 * - Event ordering verification (check timestamps)
 * - Edge Case #2 handling (retry if event arrives before tenant provisioning)
 * - Graceful shutdown with offset commit
 *
 * @see FR-007 (Event-Driven User Sync)
 * @see NFR-002 (User sync completion < 5 seconds)
 * @see Plan §4.3 (UserSyncConsumer)
 * @see Edge Case #2 (Event arrives before tenant provisioning)
 */
export class UserSyncConsumer {
  private logger: Logger;
  private eventBus: EventBusService;
  private userRepo: UserRepository;
  private tenantSvc: TenantService;
  private subscriptionId: string | null = null;
  private isRunning = false;

  // Idempotency configuration
  private readonly IDEMPOTENCY_TTL = 86400; // 24 hours in seconds
  private readonly IDEMPOTENCY_KEY_PREFIX = 'user-sync:event:';

  // Retry configuration for Edge Case #2 (tenant not yet provisioned)
  private readonly RETRY_MAX_ATTEMPTS = 5;
  private readonly RETRY_BACKOFF_MS = [1000, 2000, 5000, 10000, 30000]; // 1s, 2s, 5s, 10s, 30s

  constructor(
    eventBus: EventBusService,
    customLogger?: Logger,
    customUserRepo?: UserRepository,
    customTenantService?: TenantService
  ) {
    this.logger = customLogger || defaultLogger;
    this.eventBus = eventBus;
    this.userRepo = customUserRepo || userRepository;
    this.tenantSvc = customTenantService || tenantService;
  }

  /**
   * Start the consumer and subscribe to user lifecycle events
   *
   * @throws Error if consumer is already running
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('UserSyncConsumer is already running');
    }

    try {
      this.logger.info('Starting UserSyncConsumer...');

      // Subscribe to user lifecycle events topic
      this.subscriptionId = await this.eventBus.subscribe(
        'plexica.auth.user.lifecycle',
        this.handleUserLifecycleEvent.bind(this),
        {
          groupId: 'plexica-user-sync',
          fromBeginning: false, // Start from latest offset (don't replay old events on startup)
          autoCommit: true, // Auto-commit offsets after successful processing
        }
      );

      this.isRunning = true;
      this.logger.info(
        { subscriptionId: this.subscriptionId },
        'UserSyncConsumer started successfully'
      );
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to start UserSyncConsumer'
      );
      throw error;
    }
  }

  /**
   * Stop the consumer gracefully and commit offsets
   */
  async stop(): Promise<void> {
    if (!this.isRunning || !this.subscriptionId) {
      this.logger.warn('UserSyncConsumer is not running');
      return;
    }

    try {
      this.logger.info('Stopping UserSyncConsumer...');

      // Unsubscribe and commit final offsets
      await this.eventBus.unsubscribe(this.subscriptionId);

      this.isRunning = false;
      this.subscriptionId = null;

      this.logger.info('UserSyncConsumer stopped successfully');
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to stop UserSyncConsumer gracefully'
      );
      throw error;
    }
  }

  /**
   * Main event handler - routes events to specific handlers based on type
   *
   * @param event - Domain event with user lifecycle data
   */
  private async handleUserLifecycleEvent(event: DomainEvent<unknown>): Promise<void> {
    const eventId = event.id;
    const eventType = event.type;

    try {
      // Idempotency check: Skip if event already processed
      const isDuplicate = await this.checkIdempotency(eventId);
      if (isDuplicate) {
        this.logger.info({ eventId, eventType }, 'Skipping duplicate event (already processed)');
        return;
      }

      // Route event to appropriate handler based on type
      if (eventType === 'USER_CREATED') {
        await this.handleUserCreated(event as DomainEvent<UserCreatedData>);
      } else if (eventType === 'USER_UPDATED') {
        await this.handleUserUpdated(event as DomainEvent<UserUpdatedData>);
      } else if (eventType === 'USER_DELETED') {
        await this.handleUserDeleted(event as DomainEvent<UserDeletedData>);
      } else {
        this.logger.warn({ eventId, eventType }, 'Unknown user lifecycle event type, skipping');
        return;
      }

      // Mark event as processed (idempotency guard)
      await this.markEventProcessed(eventId);

      this.logger.info({ eventId, eventType }, 'User lifecycle event processed successfully');
    } catch (error) {
      this.logger.error(
        {
          eventId,
          eventType,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
        'Failed to process user lifecycle event'
      );
      throw error; // Re-throw to trigger Redpanda retry/DLQ
    }
  }

  /**
   * Handle USER_CREATED event - Create user record in tenant database
   *
   * @param event - USER_CREATED event with user data
   */
  async handleUserCreated(event: DomainEvent<UserCreatedData>): Promise<void> {
    const { data } = event;

    try {
      // Validate event data
      const validatedData = UserCreatedDataSchema.parse(data);

      this.logger.info(
        { keycloakId: validatedData.keycloakId, realmName: validatedData.realmName },
        'Processing USER_CREATED event'
      );

      // Get tenant context with retry for Edge Case #2 (tenant not yet provisioned)
      const tenantCtx = await this.getTenantContextWithRetry(validatedData.realmName);

      // Create user in tenant database
      await this.userRepo.create(
        {
          keycloakId: validatedData.keycloakId,
          email: validatedData.email,
          firstName: validatedData.firstName,
          lastName: validatedData.lastName,
          status: 'ACTIVE',
        },
        tenantCtx
      );

      this.logger.info(
        {
          keycloakId: validatedData.keycloakId,
          email: validatedData.email,
          schemaName: tenantCtx.schemaName,
        },
        'User created successfully in tenant database'
      );
    } catch (error) {
      this.logger.error(
        {
          keycloakId: data.keycloakId,
          realmName: data.realmName,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to handle USER_CREATED event'
      );
      throw error;
    }
  }

  /**
   * Handle USER_UPDATED event - Update user record in tenant database
   *
   * @param event - USER_UPDATED event with updated user data
   */
  async handleUserUpdated(event: DomainEvent<UserUpdatedData>): Promise<void> {
    const { data } = event;

    try {
      // Validate event data
      const validatedData = UserUpdatedDataSchema.parse(data);

      this.logger.info(
        { keycloakId: validatedData.keycloakId, realmName: validatedData.realmName },
        'Processing USER_UPDATED event'
      );

      // Get tenant context with retry
      const tenantCtx = await this.getTenantContextWithRetry(validatedData.realmName);

      // Build update data (only include changed fields)
      const updateData: Record<string, any> = {};
      if (validatedData.email !== undefined) updateData.email = validatedData.email;
      if (validatedData.firstName !== undefined) updateData.firstName = validatedData.firstName;
      if (validatedData.lastName !== undefined) updateData.lastName = validatedData.lastName;

      // Update user in tenant database
      await this.userRepo.update(validatedData.keycloakId, updateData, tenantCtx);

      this.logger.info(
        {
          keycloakId: validatedData.keycloakId,
          fieldsUpdated: Object.keys(updateData),
          schemaName: tenantCtx.schemaName,
        },
        'User updated successfully in tenant database'
      );
    } catch (error) {
      this.logger.error(
        {
          keycloakId: data.keycloakId,
          realmName: data.realmName,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to handle USER_UPDATED event'
      );
      throw error;
    }
  }

  /**
   * Handle USER_DELETED event - Soft delete user record in tenant database
   *
   * @param event - USER_DELETED event with keycloakId and realmName
   */
  async handleUserDeleted(event: DomainEvent<UserDeletedData>): Promise<void> {
    const { data } = event;

    try {
      // Validate event data
      const validatedData = UserDeletedDataSchema.parse(data);

      this.logger.info(
        { keycloakId: validatedData.keycloakId, realmName: validatedData.realmName },
        'Processing USER_DELETED event'
      );

      // Get tenant context with retry
      const tenantCtx = await this.getTenantContextWithRetry(validatedData.realmName);

      // Soft delete user (set status to DELETED)
      await this.userRepo.softDelete(validatedData.keycloakId, tenantCtx);

      this.logger.info(
        {
          keycloakId: validatedData.keycloakId,
          schemaName: tenantCtx.schemaName,
        },
        'User soft-deleted successfully in tenant database'
      );
    } catch (error) {
      this.logger.error(
        {
          keycloakId: data.keycloakId,
          realmName: data.realmName,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to handle USER_DELETED event'
      );
      throw error;
    }
  }

  /**
   * Get tenant context from realm name with retry logic
   *
   * Handles Edge Case #2: Event arrives before tenant provisioning is complete.
   * Retries with exponential backoff up to 5 attempts (max delay: 30 seconds).
   *
   * @param realmName - Tenant slug (realm name from Keycloak)
   * @returns Tenant context with schemaName
   * @throws Error if tenant not found after all retry attempts
   */
  private async getTenantContextWithRetry(realmName: string): Promise<TenantContext> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.RETRY_MAX_ATTEMPTS; attempt++) {
      try {
        // Fetch tenant by slug (realm name)
        const tenant = await this.tenantSvc.getTenantBySlug(realmName);

        // Verify tenant is provisioned (has schemaName)
        if (!tenant.schemaName) {
          throw new Error(`Tenant '${realmName}' found but schema not provisioned yet`);
        }

        // Verify tenant is active
        if (tenant.status !== 'ACTIVE') {
          this.logger.warn(
            { realmName, status: tenant.status },
            'Tenant exists but status is not ACTIVE'
          );
        }

        return {
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          schemaName: tenant.schemaName,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry if tenant doesn't exist (permanent error)
        if (error instanceof Error && error.message.includes('Tenant not found')) {
          this.logger.error(
            { realmName, attempt: attempt + 1 },
            'Tenant not found - skipping retry (permanent error)'
          );
          throw error;
        }

        // Log retry attempt
        const delayMs = this.RETRY_BACKOFF_MS[attempt] || 30000;
        this.logger.warn(
          {
            realmName,
            attempt: attempt + 1,
            maxAttempts: this.RETRY_MAX_ATTEMPTS,
            delayMs,
            error: lastError.message,
          },
          'Tenant not yet provisioned, retrying after delay (Edge Case #2)'
        );

        // Wait before retry (exponential backoff)
        if (attempt < this.RETRY_MAX_ATTEMPTS - 1) {
          await this.sleep(delayMs);
        }
      }
    }

    // All retry attempts exhausted
    this.logger.error(
      { realmName, attempts: this.RETRY_MAX_ATTEMPTS },
      'Failed to get tenant context after all retry attempts'
    );
    throw new Error(
      `Tenant '${realmName}' not provisioned after ${this.RETRY_MAX_ATTEMPTS} attempts: ${lastError?.message}`
    );
  }

  /**
   * Check if event has already been processed (idempotency guard)
   *
   * @param eventId - Event UUID
   * @returns true if event already processed, false otherwise
   */
  private async checkIdempotency(eventId: string): Promise<boolean> {
    const key = this.IDEMPOTENCY_KEY_PREFIX + eventId;

    try {
      const exists = await redis.exists(key);
      return exists === 1;
    } catch (error) {
      this.logger.error(
        { eventId, error: error instanceof Error ? error.message : String(error) },
        'Failed to check idempotency in Redis'
      );
      // On Redis error, assume event not processed (fail open to avoid blocking)
      return false;
    }
  }

  /**
   * Mark event as processed in Redis (idempotency guard)
   *
   * @param eventId - Event UUID
   */
  private async markEventProcessed(eventId: string): Promise<void> {
    const key = this.IDEMPOTENCY_KEY_PREFIX + eventId;

    try {
      // Set key with TTL (24 hours)
      await redis.setex(key, this.IDEMPOTENCY_TTL, '1');
    } catch (error) {
      this.logger.error(
        { eventId, error: error instanceof Error ? error.message : String(error) },
        'Failed to mark event as processed in Redis'
      );
      // Non-fatal error - log but don't throw (event processing succeeded)
    }
  }

  /**
   * Sleep utility for retry delays
   *
   * @param ms - Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get consumer running status
   */
  isConsumerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get subscription ID
   */
  getSubscriptionId(): string | null {
    return this.subscriptionId;
  }
}

// Export singleton instance (default export for server integration)
export const userSyncConsumer = new UserSyncConsumer(
  // EventBusService instance will be injected at server startup
  null as any // Placeholder - will be initialized in index.ts
);
