// File: apps/core-api/src/services/provisioning-steps/keycloak-roles-step.ts
// Spec 001 T001-03: Provision Keycloak roles + refresh token rotation step

import { keycloakService } from '../keycloak.service.js';
import { logger } from '../../lib/logger.js';
import type { ProvisioningStep } from '../provisioning-orchestrator.js';

export class KeycloakRolesStep implements ProvisioningStep {
  readonly name = 'keycloak_roles';

  constructor(private readonly slug: string) {}

  async execute(): Promise<void> {
    logger.info(
      { tenantSlug: this.slug },
      'Provisioning Keycloak roles and refresh token rotation'
    );
    await keycloakService.provisionRealmRoles(this.slug);
    await keycloakService.configureRefreshTokenRotation(this.slug);
  }

  async rollback(): Promise<void> {
    // Realm deletion (KeycloakRealmStep rollback) will remove all roles.
    logger.info(
      { tenantSlug: this.slug },
      'KeycloakRolesStep rollback is a no-op (realm deletion handles it)'
    );
  }
}
