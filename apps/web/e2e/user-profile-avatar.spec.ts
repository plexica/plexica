// user-profile-avatar.spec.ts
// E2E 006-12: avatar source — payload contract (avatarSource/keycloakAccountUrl)
// plus header + profile rendering of the uploaded avatar. Split from
// user-profile.spec.ts to honor the 200-line gate (Rule 4); the upload-source
// branch is live here, the Keycloak `picture` branch at service level (INT).

import { expect, test } from './helpers/base-fixture.js';
import { expectResponseTo } from './helpers/api-response.js';
import {
  ADMIN_TENANT_SLUG,
  hasKeycloak,
  loginAsAdmin,
  requireKeycloakInCI,
} from './helpers/admin-login.js';
import { PNG_1X1 } from './helpers/settings-fixtures.js';
import { freshBearer } from './helpers/session-token.js';
import { tenantApiUrl } from './helpers/tenant-hosts.js';

const PROFILE_PATH = '/api/v1/profile';
const AVATAR_PATH = '/api/v1/profile/avatar';

test.describe('E2E 006-12: Profile avatar source', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak (PLAYWRIGHT_KEYCLOAK_* env vars)');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('profile payload carries avatarSource + keycloakAccountUrl', async ({ page }) => {
    const res = await page.request.get(tenantApiUrl(ADMIN_TENANT_SLUG, PROFILE_PATH), {
      headers: { ...(await freshBearer(page)), 'X-Tenant-Slug': ADMIN_TENANT_SLUG },
    });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      avatarSource: string;
      keycloakAccountUrl: string;
    };
    // plexica-web has no `picture` protocol mapper, so the upload source is
    // active; the Keycloak-source branch is covered at service level (INT).
    expect(body.avatarSource).toBe('upload');
    expect(body.keycloakAccountUrl).toMatch(/\/realms\/.+\/account/);
  });

  test('header and profile show the uploaded avatar image', async ({ page }) => {
    await page.goto('/profile');

    const fileInput = page.locator('input[type="file"]');
    await expectResponseTo(page, AVATAR_PATH, 'POST', async () => {
      await fileInput.setInputFiles({
        name: 'avatar.png',
        mimeType: 'image/png',
        buffer: PNG_1X1,
      });
    });

    // Reload drops the client-side blob preview — every <img> below can only
    // render from the server-resolved avatarUrl (upload source, no `picture`
    // claim on E2E tokens).
    await page.reload();
    const headerImg = page.getByTestId('user-menu-trigger').getByRole('img');
    await expect(headerImg).toBeVisible({ timeout: 15_000 });
    await expect(headerImg).toHaveAttribute('src', /^https?:\/\//);
    await expect(page.getByTestId('profile-avatar-header').getByRole('img')).toBeVisible({
      timeout: 15_000,
    });
  });
});
