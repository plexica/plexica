// File: apps/core-api/src/services/provisioning-steps/invitation-step.ts
// Spec 001 T001-05: Send invitation email to tenant admin
//
// This step is NON-BLOCKING per spec Edge Case #10:
// If email sending fails after 3 retries, provisioning still succeeds.
// Failure is logged and stored in tenant settings as invitationStatus: 'failed'.

import { keycloakService } from '../keycloak.service.js';
import { logger } from '../../lib/logger.js';
import type { ProvisioningStep } from '../provisioning-orchestrator.js';
import { PrismaClient } from '@plexica/database';
import { db } from '../../lib/db.js';

const MAX_INVITE_ATTEMPTS = 3;
const INVITE_RETRY_DELAY_MS = [1_000, 2_000, 4_000] as const;

export class InvitationStep implements ProvisioningStep {
  readonly name = 'invitation_sent';

  constructor(
    private readonly slug: string,
    private readonly adminEmail: string | undefined,
    private readonly tenantId: string,
    private readonly dbClient: PrismaClient = db
  ) {}

  /**
   * Non-blocking: executes the Keycloak "execute actions email" for password setup.
   * Never throws — failure is stored in tenant settings and logged.
   */
  async execute(): Promise<void> {
    if (!this.adminEmail) {
      logger.info({ tenantSlug: this.slug }, 'InvitationStep skipped — no adminEmail provided');
      return;
    }

    logger.info(
      { tenantSlug: this.slug, adminEmail: this.adminEmail },
      'Sending invitation email to tenant admin'
    );

    let lastError: Error | undefined;

    for (let attempt = 0; attempt < MAX_INVITE_ATTEMPTS; attempt++) {
      try {
        // Fetch the admin user from Keycloak by email
        const users = await keycloakService.listUsers(this.slug, {
          search: this.adminEmail,
          max: 1,
        });
        const adminUser = users.find((u) => u.email === this.adminEmail);

        if (!adminUser?.id) {
          throw new Error(`Admin user with email '${this.adminEmail}' not found in realm`);
        }

        // Trigger Keycloak's "Update Password" required-action email
        await keycloakService.sendRequiredActionEmail(this.slug, adminUser.id, ['UPDATE_PASSWORD']);

        await this.persistInvitationStatus('sent');
        logger.info(
          { tenantSlug: this.slug, adminEmail: this.adminEmail },
          'Invitation email sent'
        );
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt < MAX_INVITE_ATTEMPTS - 1) {
          const delayMs = INVITE_RETRY_DELAY_MS[attempt];
          logger.warn(
            { tenantSlug: this.slug, attempt: attempt + 1, retryInMs: delayMs },
            'Invitation email attempt failed — retrying'
          );
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
    }

    // All retries exhausted — non-blocking: log, persist, and continue
    logger.warn(
      { tenantSlug: this.slug, adminEmail: this.adminEmail, error: lastError?.message },
      'Invitation email failed after all retries — provisioning continues (non-blocking)'
    );
    await this.persistInvitationStatus('failed', lastError?.message);
  }

  /** No rollback — email is fire-and-forget */
  async rollback(): Promise<void> {
    logger.info({ tenantSlug: this.slug }, 'InvitationStep rollback is a no-op');
  }

  private async persistInvitationStatus(status: 'sent' | 'failed', error?: string): Promise<void> {
    try {
      const tenant = await this.dbClient.tenant.findUnique({
        where: { id: this.tenantId },
        select: { settings: true },
      });
      if (!tenant) return;

      const existing = (tenant.settings as Record<string, unknown>) ?? {};
      await this.dbClient.tenant.update({
        where: { id: this.tenantId },
        data: {
          settings: {
            ...existing,
            invitationStatus: status,
            ...(error ? { invitationError: error } : {}),
          },
        },
      });
    } catch (err) {
      logger.warn({ tenantId: this.tenantId, error: err }, 'Could not persist invitation status');
    }
  }
}
