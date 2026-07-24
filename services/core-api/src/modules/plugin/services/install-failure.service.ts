import { logger } from '../../../lib/logger.js';
import { withTenantDb } from '../../../lib/tenant-database.js';

import { dropPluginRole, grantCreateOnSchema, revokeCreateOnSchema } from './db-role.service.js';

import type { TenantContext } from '../../../lib/tenant-context-store.js';

export async function cleanupFailedInstallation(
  installId: string,
  context: TenantContext,
  cause: unknown,
): Promise<void> {
  logger.error(
    { err: cause instanceof Error ? cause.message : String(cause), installId },
    'Plugin migration security phase failed',
  );
  await withTenantDb(async (tx) => {
    await tx.pluginInstallation.update({ where: { id: installId }, data: { status: 'failed' } });
    await tx.pluginContainerConfig.deleteMany({ where: { installId } });
  }, context).catch((error: unknown) => {
    logger.error({ err: (error as Error)?.message, installId }, 'Failed to persist failed plugin installation');
  });
  await dropPluginRole(installId, context.slug).catch((error: unknown) => {
    logger.error({ err: (error as Error)?.message, installId }, 'Failed to drop role for failed plugin installation');
  });
}

export async function runMigrationSecurityPhase(
  installId: string,
  context: TenantContext,
  migrate: () => Promise<void>,
): Promise<void> {
  try {
    await grantCreateOnSchema(installId, context.slug);
    await migrate();
    await revokeCreateOnSchema(installId, context.slug);
  } catch (error) {
    await cleanupFailedInstallation(installId, context, error);
    throw error;
  }
}
