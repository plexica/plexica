// services/tenant-reactivate.service.ts
// Reactivates a suspended tenant: status transition + Keycloak realm enable +
// tenant-context cache invalidation + platform audit log entry (S5-600).
//
// Reverse of tenant-suspend.service.ts. Same optimistic-lock + audit +
// cache-invalidation contract. Only `suspended` tenants can be reactivated:
// `active` → 409 (no-op), `pending_deletion` / `deleted` → 409 (terminal).
//
// Security §6: metadata carries structural data only — no PII.


import { withOptimisticLock } from '../lib/optimistic-lock.js';
import { ConflictError } from '../../../lib/app-error.js';
import { setRealmEnabled } from '../../../lib/keycloak-admin-realm.js';
import { toRealmName } from '../../../lib/tenant-schema-helpers.js';
import { clearTenantCache } from '../../../middleware/tenant-context.js';
import { logger } from '../../../lib/logger.js';

import { writeAuditEntry } from './audit-log.service.js';

import type { PrismaClient, Prisma } from '@prisma/client';
import type { TenantStatusChangeResult } from './tenant-suspend.service.js';

export { type TenantStatusChangeResult };

/**
 * Reactivates a suspended tenant.
 *
 * Flow:
 *   1. Optimistic-lock transaction: bump version (409 on mismatch), verify
 *      status is `suspended`, set `status = 'active'`.
 *   2. Enable the tenant's Keycloak realm (restores login capability).
 *   3. Clear the in-memory tenant-context cache (immediate propagation).
 *   4. Write a `tenant.reactivate` platform audit log entry.
 *
 * @throws {ConflictError} 409 if the expected version does not match, the
 *   tenant is missing, or the tenant is not in the `suspended` status
 *   (`active`, `pending_deletion`, `deleted` are all rejected).
 * @throws {KeycloakError} 502 if the Keycloak realm cannot be re-enabled.
 */
export async function reactivateTenant(
  prisma: PrismaClient,
  tenantId: string,
  expectedVersion: number,
  actorId: string
): Promise<TenantStatusChangeResult> {
  const { result, newVersion } = await withOptimisticLock(
    prisma,
    tenantId,
    expectedVersion,
    async (tx: Prisma.TransactionClient) => {
      const tenant = await tx.tenant.findUnique({
        where: { id: tenantId },
        select: { slug: true, status: true },
      });

      if (tenant === null) {
        throw new ConflictError(`Tenant ${tenantId} not found`);
      }

      if (tenant.status !== 'suspended') {
        throw new ConflictError(
          `Cannot reactivate tenant in status '${tenant.status}' — only 'suspended' tenants can be reactivated`
        );
      }

      await tx.tenant.update({
        where: { id: tenantId },
        data: { status: 'active' },
      });

      return { slug: tenant.slug };
    }
  );

  const { slug } = result;
  const realmName = toRealmName(slug);

  await setRealmEnabled(realmName, true);
  logger.info({ tenantId, realmName }, 'Keycloak realm enabled for reactivated tenant');

  clearTenantCache();
  logger.debug({ tenantId, slug }, 'Tenant-context cache invalidated after reactivation');

  await writeAuditEntry(prisma, {
    actorId,
    action: 'tenant.reactivate',
    resourceType: 'tenant',
    resourceId: tenantId,
    metadata: { slug, previousVersion: expectedVersion, newVersion },
  });

  logger.info({ tenantId, slug, actorId, newVersion }, 'Tenant reactivated + audit logged');

  return { id: tenantId, status: 'active', version: newVersion };
}
