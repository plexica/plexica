import { getAdminToken } from '../../../e2e/keycloak/admin-api.js';
import { deleteEphemeralE2eClient } from '../../../e2e/keycloak/ephemeral-client.js';
import { deletePluginReviewFixture } from '../../../e2e/fixtures/core-fixtures.js';

export default async function teardown(): Promise<void> {
  const token = await getAdminToken();
  try {
    await deleteEphemeralE2eClient(token);
  } finally {
    await deletePluginReviewFixture();
  }
  process.stdout.write('[admin global-teardown] Ephemeral Keycloak client deleted.\n');
}
