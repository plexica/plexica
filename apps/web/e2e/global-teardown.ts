import { getAdminToken } from '../../../e2e/keycloak/admin-api.js';
import { deleteEphemeralE2eClient } from '../../../e2e/keycloak/ephemeral-client.js';
import { deleteDlqFixture } from '../../../e2e/fixtures/core-fixtures.js';

export default async function teardown(): Promise<void> {
  const token = await getAdminToken();
  try {
    await deleteEphemeralE2eClient(token);
  } finally {
    await deleteDlqFixture();
  }
  process.stdout.write('[global-teardown] Ephemeral web E2E Keycloak client deleted.\n');
}
