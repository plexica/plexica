// 005-09-health-check.spec.ts — System health E2E (Feature 005-09).
// Super admin → /health → 5 service status cards (postgres, redis, keycloak,
// kafka, minio). Each card shows a status word + latency. Asserts all 5 render
// with a green/amber/red status and a numeric latency value.

import { expect, test } from './helpers/base-fixture.js';
import { loginAsAdmin, hasKeycloak, requireKeycloakInCI } from './helpers/admin-login.js';

const EXPECTED_SERVICES = ['postgres', 'redis', 'keycloak', 'kafka', 'minio'] as const;

test.describe('005-09 System health', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak');
  test.beforeAll(() => requireKeycloakInCI());

  test('health page renders one status card per infrastructure service', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/health');
    await expect(page.getByRole('heading', { level: 1, name: 'System Health' })).toBeVisible();

    // Each service is a <figure> with the service name in its <figcaption>.
    // Wait for the loading skeletons to be replaced by the cards grid.
    const cards = page.getByRole('figure');
    await expect(cards.first()).toBeVisible({ timeout: 15_000 });
    expect(await cards.count()).toBe(EXPECTED_SERVICES.length);

    for (const name of EXPECTED_SERVICES) {
      const card = cards.filter({ hasText: name });
      await expect(card).toBeVisible();
      // Status word (Healthy / Degraded / Down) is rendered in the card.
      await expect(card.getByText(/^(Healthy|Degraded|Down)$/)).toBeVisible();
      // Latency is rendered as "{ms} ms".
      await expect(card.getByText(/\d+ ms/)).toBeVisible();
    }
  });
});
