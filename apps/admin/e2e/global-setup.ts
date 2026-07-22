import { getAdminToken, waitForKeycloak } from '../../../e2e/keycloak/admin-api.js';
import { createEphemeralE2eClient } from '../../../e2e/keycloak/ephemeral-client.js';
import {
  assertPlexicaAdminPasswordGrantRejected,
  reconcilePlexicaAdminClient,
} from '../../../e2e/keycloak/plexica-admin-client.js';
import { ensureSuperAdminForUser } from '../../../e2e/keycloak/realm-role.js';
import {
  ensureCrmMarketplaceFixture,
  resetPluginReviewFixture,
} from '../../../e2e/fixtures/core-fixtures.js';

import { provisionAdminTestData } from './provisioning-helpers.js';

export default async function setup(): Promise<void> {
  process.stdout.write('[admin global-setup] Starting E2E provisioning.\n');
  await waitForKeycloak();

  let adminToken = await getAdminToken();
  await reconcilePlexicaAdminClient(adminToken);
  await assertPlexicaAdminPasswordGrantRejected();

  const adminUsername = process.env['KEYCLOAK_ADMIN_USER'] ?? 'admin';
  const superAdminRole = await ensureSuperAdminForUser(adminToken, adminUsername);
  provisionAdminTestData();
  await ensureCrmMarketplaceFixture();
  await resetPluginReviewFixture();

  // Do not rely on a globally extended realm TTL for setup credentials.
  adminToken = await getAdminToken();
  await createEphemeralE2eClient(adminToken, 'admin', superAdminRole);
  process.stdout.write('[admin global-setup] E2E provisioning complete.\n');
}
