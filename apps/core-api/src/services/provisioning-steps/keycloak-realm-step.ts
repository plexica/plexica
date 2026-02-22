// File: apps/core-api/src/services/provisioning-steps/keycloak-realm-step.ts
// Spec 001 T001-03: Create Keycloak realm provisioning step

import { keycloakService } from '../keycloak.service.js';
import { logger } from '../../lib/logger.js';
import type { ProvisioningStep } from '../provisioning-orchestrator.js';

export class KeycloakRealmStep implements ProvisioningStep {
  readonly name = 'keycloak_realm';

  constructor(
    private readonly slug: string,
    private readonly tenantName: string
  ) {}

  async execute(): Promise<void> {
    logger.info({ tenantSlug: this.slug }, 'Creating Keycloak realm');
    await keycloakService.createRealm(this.slug, this.tenantName);
  }

  async rollback(): Promise<void> {
    logger.info({ tenantSlug: this.slug }, 'Rolling back Keycloak realm');
    try {
      await keycloakService.deleteRealm(this.slug);
    } catch (err) {
      // Realm may not exist — swallow and log
      logger.warn(
        { tenantSlug: this.slug, error: err },
        'Keycloak realm rollback failed (ignored)'
      );
    }
  }
}
