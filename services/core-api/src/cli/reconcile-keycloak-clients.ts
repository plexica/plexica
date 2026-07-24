import { reconcileAdminClient } from '../lib/keycloak-admin-client.js';
import { reconcileAllTenantWebClients } from '../lib/keycloak-tenant-client.js';

try {
  const nodeEnv = process.env['NODE_ENV'] ?? 'development';
  const adminOrigin =
    process.env['KEYCLOAK_ADMIN_ORIGIN'] ??
    (nodeEnv === 'production' ? undefined : 'http://localhost:3002');
  if (adminOrigin === undefined) {
    throw new Error('KEYCLOAK_ADMIN_ORIGIN is required in production');
  }
  await reconcileAdminClient(adminOrigin, nodeEnv);
  const count = await reconcileAllTenantWebClients();
  process.stdout.write(`Reconciled plexica-admin and plexica-web in ${count} tenant realm(s).\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Keycloak client reconciliation failed: ${message}\n`);
  process.exitCode = 1;
}
