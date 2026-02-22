/**
 * DeletionScheduler — T001-06
 *
 * Runs every 6 hours, finds tenants with status=PENDING_DELETION where
 * deletionScheduledAt <= NOW(), and hard-deletes them via TenantService.hardDeleteTenant.
 *
 * Constitution Compliance:
 * - Article 1.2: Multi-Tenancy Isolation (deletes all tenant data)
 * - Article 6.3: Structured logging
 * - Article 9.1: Graceful shutdown (clears interval on stop())
 */
import { PrismaClient, TenantStatus } from '@plexica/database';
import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { TenantService } from './tenant.service.js';

export const DELETION_SCHEDULER_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

export class DeletionScheduler {
  private db: PrismaClient;
  private tenantService: TenantService;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private intervalMs: number;

  constructor(
    dbClient?: PrismaClient,
    tenantSvc?: TenantService,
    intervalMs: number = DELETION_SCHEDULER_INTERVAL_MS
  ) {
    this.db = dbClient ?? db;
    this.tenantService = tenantSvc ?? new TenantService(this.db);
    this.intervalMs = intervalMs;
  }

  /**
   * Start the scheduler. Also runs an immediate first pass.
   */
  start(): void {
    if (this.intervalHandle !== null) {
      logger.warn('DeletionScheduler already running — ignoring duplicate start()');
      return;
    }

    logger.info({ intervalMs: this.intervalMs }, 'DeletionScheduler started');

    // Run an initial pass immediately, then on interval
    this.processExpired().catch((err) => {
      logger.error({ error: err }, 'DeletionScheduler: initial processExpired failed');
    });

    this.intervalHandle = setInterval(() => {
      this.processExpired().catch((err) => {
        logger.error({ error: err }, 'DeletionScheduler: processExpired failed (interval)');
      });
    }, this.intervalMs);
  }

  /**
   * Stop the scheduler. Clears the interval.
   */
  stop(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      logger.info('DeletionScheduler stopped');
    }
  }

  /**
   * Query for tenants with PENDING_DELETION whose deletionScheduledAt <= NOW()
   * and hard-delete each one. Errors per-tenant are logged but do not stop
   * processing the remaining tenants.
   */
  async processExpired(): Promise<void> {
    logger.info('DeletionScheduler: processing expired tenants');

    let expiredTenants: { id: string; slug: string }[];

    try {
      expiredTenants = await this.db.tenant.findMany({
        where: {
          status: TenantStatus.PENDING_DELETION,
          deletionScheduledAt: {
            lte: new Date(),
          },
        },
        select: { id: true, slug: true },
      });
    } catch (err) {
      logger.error({ error: err }, 'DeletionScheduler: failed to query expired tenants');
      return;
    }

    if (expiredTenants.length === 0) {
      logger.info('DeletionScheduler: no expired tenants found');
      return;
    }

    logger.info(
      { count: expiredTenants.length },
      'DeletionScheduler: hard-deleting expired tenants'
    );

    for (const tenant of expiredTenants) {
      try {
        await this.tenantService.hardDeleteTenant(tenant.id);
        logger.info(
          { tenantId: tenant.id, tenantSlug: tenant.slug },
          'DeletionScheduler: tenant hard-deleted'
        );
      } catch (err) {
        // Log error and continue — do not crash the scheduler for one failure
        logger.error(
          { tenantId: tenant.id, tenantSlug: tenant.slug, error: err },
          'DeletionScheduler: failed to hard-delete tenant (continuing)'
        );
      }
    }
  }

  /** Returns true if the scheduler is currently running. */
  isRunning(): boolean {
    return this.intervalHandle !== null;
  }
}

// Singleton instance for use in index.ts
export const deletionScheduler = new DeletionScheduler();
