// deletion-step-realm-delete.ts
// Deletion saga step handler: delete Keycloak realm (ADR-022 Decision 1).
// Removes the tenant's Keycloak realm `plexica-<slug>`. deleteRealm treats
// 404 as success (idempotent). Throws on any other failure.

import { deleteRealm } from '../../../lib/keycloak-admin.js';
import { logger } from '../../../lib/logger.js';

/**
 * Deletes the Keycloak realm for the given tenant slug.
 * Realm name is `plexica-<slug>` (ADR-002). Idempotent — a missing realm
 * (404) is treated as success. Throws on Keycloak service errors.
 */
export async function executeRealmDelete(tenantId: string, realmName: string): Promise<void> {
  logger.info({ tenantId }, 'Deleting tenant identity realm');

  await deleteRealm(realmName);

  logger.info({ tenantId }, 'Tenant identity realm deletion step complete');
}
