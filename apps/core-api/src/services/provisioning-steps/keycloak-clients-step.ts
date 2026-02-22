// File: apps/core-api/src/services/provisioning-steps/keycloak-clients-step.ts
// Spec 001 T001-03: Provision Keycloak clients step

import { keycloakService } from '../keycloak.service.js';
import { logger } from '../../lib/logger.js';
import type { ProvisioningStep } from '../provisioning-orchestrator.js';

export class KeycloakClientsStep implements ProvisioningStep {
  readonly name = 'keycloak_clients';

  constructor(private readonly slug: string) {}

  async execute(): Promise<void> {
    logger.info({ tenantSlug: this.slug }, 'Provisioning Keycloak clients');
    await keycloakService.provisionRealmClients(this.slug);
  }

  async rollback(): Promise<void> {
    // Realm deletion (KeycloakRealmStep rollback) will cascade-remove clients.
    // No independent rollback needed.
    logger.info(
      { tenantSlug: this.slug },
      'KeycloakClientsStep rollback is a no-op (realm deletion handles it)'
    );
  }
}
