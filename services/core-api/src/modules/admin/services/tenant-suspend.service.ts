// services/tenant-suspend.service.ts
// Suspends an active tenant: status transition + Keycloak realm disable +
// tenant-context cache invalidation + platform audit log entry (S5-500).
//
// ADR-022 Decision 4: concurrent admin actions on the same tenant are
// serialized via the `version` column on core.tenants. withOptimisticLock
// performs an atomic conditional UPDATE; 0 rows affected → 409 CONFLICT.
//
// ADR-022 Decision 1: a suspended tenant's Keycloak realm is disabled so no
// new sessions can be issued. The in-memory tenant-context cache (60s TTL)
// is cleared so the new status propagates immediately (< 5s NFR), not after
// the TTL window expires.
//
// Security §6: metadata carries structural data only — no PII.

import type { PrismaClient, Prisma } from '@prisma/client';

import { withOptimisticLock } from '../lib/optimistic-lock.js';
import { writeAuditEntry } from './audit-log.service.js';
import { ConflictError } from '../../../lib/app-error.js';
import { setRealmEnabled } from '../../../lib/keycloak-admin-realm.js';
import { toRealmName } from '../../../lib/tenant-schema-helpers.js';
import { clearTenantCache } from '../../../middleware/tenant-context.js';
import { logger } from '../../../lib/logger.js';

export interface TenantStatusChangeResult {
  id: string;
  status: string;
  version: number;
}

/**
 * Suspends an active tenant.
 *
 * Flow:
 *   1. Optimistic-lock transaction: bump version (409 on mismatch), verify
 *      status is `active`, set `status = 'suspended'`.
 *   2. Disable the tenant's Keycloak realm (blocks new logins).
 *   3. Clear the in-memory tenant-context cache (immediate propagation).
 *   4. Write a `tenant.suspend` platform audit log entry.
 *
 * @throws {ConflictError} 409 if the expected version does not match, the
 *   tenant is missing, or the tenant is not in the `active` status.
 * @throws {KeycloakError} 502 if the Keycloak realm cannot be disabled. The
 *   DB status transition is already committed at this point; operators may
 *   retry the realm disable without re-running the suspension.
 */
export async function suspendTenant(
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

      if (tenant.status !== 'active') {
        throw new ConflictError(
          `Cannot suspend tenant in status '${tenant.status}' — only 'active' tenants can be suspended`
        );
      }

      await tx.tenant.update({
        where: { id: tenantId },
        data: { status: 'suspended' },
      });

      return { slug: tenant.slug };
    }
  );

  const { slug } = result;
  const realmName = toRealmName(slug);

  await setRealmEnabled(realmName, false);
  logger.info({ tenantId, realmName }, 'Keycloak realm disabled for suspended tenant');

  clearTenantCache();
  logger.debug({ tenantId, slug }, 'Tenant-context cache invalidated after suspension');

  await writeAuditEntry(prisma, {
    actorId,
    action: 'tenant.suspend',
    resourceType: 'tenant',
    resourceId: tenantId,
    metadata: { slug, previousVersion: expectedVersion, newVersion },
  });

  logger.info({ tenantId, slug, actorId, newVersion }, 'Tenant suspended + audit logged');

  return { id: tenantId, status: 'suspended', version: newVersion };
}
