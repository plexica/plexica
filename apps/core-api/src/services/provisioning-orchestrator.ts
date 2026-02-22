// File: apps/core-api/src/services/provisioning-orchestrator.ts
// Spec 001 T001-03: Provisioning state machine per ADR-015
//
// Runs 7 steps in sequence with 3× exponential backoff (1s/2s/4s).
// On terminal failure, performs reverse-order rollback of completed steps.
// Enforces a 90-second total timeout via AbortController.

import { PrismaClient } from '@plexica/database';
import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';

// ─── Step interface ────────────────────────────────────────────────────────────

export interface ProvisioningStep {
  /** Stable identifier stored in settings.provisioningState */
  readonly name: string;
  /** Run the step. Throw to trigger retry / rollback. */
  execute(signal?: AbortSignal): Promise<void>;
  /** Undo the step's effects as cleanly as possible. Must not throw. */
  rollback(): Promise<void>;
}

// ─── Provisioning context ─────────────────────────────────────────────────────

export interface ProvisioningContext {
  tenantId: string;
  tenantSlug: string;
  /** Optional — admin_user and invitation_sent steps are skipped when absent */
  adminEmail?: string;
  pluginIds?: string[];
}

// ─── Result types ─────────────────────────────────────────────────────────────

export interface ProvisioningResult {
  success: boolean;
  completedSteps: string[];
  failedStep?: string;
  error?: string;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

const RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const;
const TOTAL_TIMEOUT_MS = 90_000;

export class ProvisioningOrchestrator {
  private readonly db: PrismaClient;

  constructor(dbClient?: PrismaClient) {
    this.db = dbClient ?? db;
  }

  /**
   * Execute all provisioning steps for a tenant.
   * Updates tenant.settings.provisioningState after each step.
   * On failure: rolls back completed steps in reverse order.
   */
  async provision(
    context: ProvisioningContext,
    steps: ProvisioningStep[]
  ): Promise<ProvisioningResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TOTAL_TIMEOUT_MS);

    const completedSteps: string[] = [];

    try {
      for (const step of steps) {
        if (controller.signal.aborted) {
          throw new Error('Provisioning timed out (90 s limit exceeded)');
        }

        await this.runWithRetry(step, context, controller.signal);
        completedSteps.push(step.name);

        // Persist progress after each completed step
        await this.persistState(context.tenantId, {
          lastCompletedStep: step.name,
          completedSteps: [...completedSteps],
        });
      }

      clearTimeout(timer);
      return { success: true, completedSteps };
    } catch (error) {
      clearTimeout(timer);
      const message = error instanceof Error ? error.message : String(error);
      const failedStep = steps[completedSteps.length]?.name ?? 'unknown';

      logger.error(
        { tenantId: context.tenantId, tenantSlug: context.tenantSlug, failedStep, error: message },
        'Provisioning failed — beginning rollback'
      );

      // Persist the error so operators can diagnose without querying logs
      await this.persistError(context.tenantId, message, failedStep);

      // Rollback in reverse order
      await this.rollbackCompleted(context, completedSteps, steps);

      return { success: false, completedSteps, failedStep, error: message };
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async runWithRetry(
    step: ProvisioningStep,
    context: ProvisioningContext,
    signal: AbortSignal
  ): Promise<void> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < RETRY_DELAYS_MS.length + 1; attempt++) {
      if (signal.aborted) {
        throw new Error('Provisioning timed out');
      }

      try {
        await step.execute(signal);
        return; // success
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt < RETRY_DELAYS_MS.length) {
          const delayMs = RETRY_DELAYS_MS[attempt];
          logger.warn(
            {
              tenantId: context.tenantId,
              step: step.name,
              attempt: attempt + 1,
              retryInMs: delayMs,
              error: lastError.message,
            },
            'Provisioning step failed — will retry'
          );
          await this.delay(delayMs, signal);
        }
      }
    }

    throw lastError ?? new Error(`Step ${step.name} failed after all retries`);
  }

  private async rollbackCompleted(
    context: ProvisioningContext,
    completedSteps: string[],
    allSteps: ProvisioningStep[]
  ): Promise<void> {
    // Build a name→step map
    const stepByName = new Map(allSteps.map((s) => [s.name, s]));

    // Reverse order
    const toRollback = [...completedSteps].reverse();

    for (const stepName of toRollback) {
      const step = stepByName.get(stepName);
      if (!step) continue;

      try {
        await step.rollback();
        logger.info(
          { tenantId: context.tenantId, step: stepName },
          'Step rolled back successfully'
        );
      } catch (rollbackErr) {
        // Rollback failure must never mask the original error — log and continue
        logger.error(
          {
            tenantId: context.tenantId,
            step: stepName,
            error: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr),
          },
          'Rollback failed — manual cleanup may be required'
        );
      }
    }
  }

  private async persistState(
    tenantId: string,
    state: { lastCompletedStep: string; completedSteps: string[] }
  ): Promise<void> {
    try {
      // Use jsonb_set for a single atomic read-modify-write — avoids the double-query
      // race condition of the previous read-then-update pattern.
      await this.db.$executeRaw`
        UPDATE "tenants"
        SET settings = jsonb_set(
          COALESCE(settings, '{}'::jsonb),
          '{provisioningState}',
          ${JSON.stringify(state)}::jsonb,
          true
        )
        WHERE id = ${tenantId}
      `;
    } catch (err) {
      logger.warn({ tenantId, error: err }, 'Could not persist provisioning state');
    }
  }

  private async persistError(tenantId: string, message: string, failedStep: string): Promise<void> {
    try {
      // Atomic update via jsonb_set — no read-then-write race
      await this.db.$executeRaw`
        UPDATE "tenants"
        SET settings = jsonb_set(
          jsonb_set(
            COALESCE(settings, '{}'::jsonb),
            '{provisioningError}',
            ${JSON.stringify(message)}::jsonb,
            true
          ),
          '{provisioningFailedStep}',
          ${JSON.stringify(failedStep)}::jsonb,
          true
        )
        WHERE id = ${tenantId}
      `;
    } catch (err) {
      logger.warn({ tenantId, error: err }, 'Could not persist provisioning error');
    }
  }

  private delay(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error('Provisioning timed out'));
        return;
      }
      const t = setTimeout(resolve, ms);
      signal?.addEventListener('abort', () => {
        clearTimeout(t);
        reject(new Error('Provisioning timed out'));
      });
    });
  }
}

export const provisioningOrchestrator = new ProvisioningOrchestrator();
