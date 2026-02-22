// File: apps/core-api/src/services/provisioning-steps/admin-user-step.ts
// Spec 001 T001-05: Create tenant admin user in Keycloak

import { keycloakService } from '../keycloak.service.js';
import { logger } from '../../lib/logger.js';
import type { ProvisioningStep } from '../provisioning-orchestrator.js';

export class AdminUserStep implements ProvisioningStep {
  readonly name = 'admin_user';

  /** Keycloak user ID created during execute — used for rollback */
  private createdUserId: string | undefined;

  constructor(
    private readonly slug: string,
    private readonly adminEmail: string
  ) {}

  async execute(): Promise<void> {
    logger.info(
      { tenantSlug: this.slug, adminEmail: this.adminEmail },
      'Creating tenant admin user'
    );

    const username = this.adminEmail.toLowerCase().split('@')[0] ?? 'admin';

    const user = await keycloakService.createUser(this.slug, {
      username,
      email: this.adminEmail,
      enabled: true,
      emailVerified: false,
    });

    this.createdUserId = user.id;

    // Assign the tenant_admin realm role
    await keycloakService.assignRealmRoleToUser(this.slug, user.id, 'tenant_admin');

    logger.info(
      { tenantSlug: this.slug, userId: user.id, adminEmail: this.adminEmail },
      'Tenant admin user created and role assigned'
    );
  }

  async rollback(): Promise<void> {
    if (!this.createdUserId) return;

    logger.info({ tenantSlug: this.slug, userId: this.createdUserId }, 'Rolling back admin user');
    try {
      await keycloakService.deleteUser(this.slug, this.createdUserId);
    } catch (err) {
      logger.warn(
        { tenantSlug: this.slug, userId: this.createdUserId, error: err },
        'Admin user rollback failed (ignored)'
      );
    }
  }
}
