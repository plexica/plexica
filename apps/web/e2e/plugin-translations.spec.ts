// plugin-translations.spec.ts
// E2E 006-09: plugin i18n bundles render through the same react-intl pipeline.
// The shell reads the CRM manifest `i18n.bundles`, fetches `i18n/{locale}.json`
// from the MF remote asset base, and merges it under `plugin.crm.` keys
// (D-8). Switching the UI language flips the plugin UI strings — proving the
// bundle actually loads (defaultMessage would stay English).

import { expect, test } from './helpers/base-fixture.js';
import { loginAsAdmin, requireKeycloakInCI, uniqueName } from './helpers/admin-login.js';
import { isApiReachable } from './helpers/api-check.js';
import { ensureCrmInstalled } from './helpers/crm-plugin-fixture.js';
import { createWorkspaceFixture, getBrowserToken } from './helpers/plugin-fixtures.js';
import { setProfileLanguage, switchLocaleViaUi } from './helpers/i18n-locale.js';

let stackReady = false;

test.describe('E2E 006-09: plugin i18n bundles', () => {
  test.beforeAll(async () => {
    requireKeycloakInCI();
    stackReady = await isApiReachable();
    if (!stackReady) {
      throw new Error('Requires live core-api for the CRM i18n bundle flow.');
    }
  });

  test('CRM plugin renders EN then IT bundle strings through the react-intl pipeline', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await loginAsAdmin(page);
    await setProfileLanguage(page, 'en');

    const token = await getBrowserToken(page);
    await ensureCrmInstalled(page, token);
    const workspaceId = await createWorkspaceFixture(page, token, uniqueName('plugin-i18n'));

    await page.goto(`/workspaces/${workspaceId}`);

    // EN: rendered either from the merged bundle or the defaultMessage.
    await expect(
      page.getByRole('heading', { name: 'Contacts' }),
      'CRM plugin must render in English initially'
    ).toBeVisible({ timeout: 20_000 });

    // EN→IT switch: the IT bundle (`i18n/it.json` → plugin.crm.*) must drive
    // the plugin UI — not the EN defaultMessage fallback.
    await switchLocaleViaUi(page, 'it');
    await expect(
      page.getByRole('heading', { name: 'Contatti' }),
      'CRM plugin must render the Italian bundle string after the switch'
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Contacts' })).toBeHidden();

    // Restore EN for later suites (admin profile language is shared state).
    await setProfileLanguage(page, 'en');
  });
});