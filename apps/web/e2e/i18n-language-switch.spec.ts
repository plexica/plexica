// i18n-language-switch.spec.ts
// E2E 006-07/08 (NFR-006-3): switching the UI language EN→IT updates the full
// UI IN PLACE in under 500 ms with NO page reload, persists the choice, syncs
// the profile `language` (source of truth), and locale-aware date formatting
// changes.

import { expect, test } from './helpers/base-fixture.js';
import {
  hasKeycloak,
  loginAsAdmin,
  requireKeycloakInCI,
} from './helpers/admin-login.js';
import { isApiReachable } from './helpers/api-check.js';
import {
  createAuditRow,
  readProfileLanguage,
  readStoreLocale,
  setProfileLanguage,
  switchLocaleViaUi,
} from './helpers/i18n-locale.js';

let stackReady = false;

test.describe('E2E 006-07/08: i18n language switch', () => {
  test.beforeAll(async () => {
    requireKeycloakInCI();
    stackReady = hasKeycloak && (await isApiReachable());
    if (!stackReady) {
      throw new Error('Requires live Keycloak + core-api for the language switch flow.');
    }
  });

  test('EN→IT switch: full UI updates in place < 500ms, no reload, profile synced, date format changes', async ({
    page,
  }) => {
    await loginAsAdmin(page);

    // Deterministic EN baseline: the profile language is the source of truth.
    await setProfileLanguage(page, 'en');
    await page.goto('/dashboard');
    await expect(page.getByText('Audit Log', { exact: true })).toBeVisible();

    // A fresh audit row guarantees the date cell renders (locale-aware format).
    await createAuditRow(page);
    await page.goto('/audit-log');
    const dateCell = page.locator('table tbody tr').first().locator('td').nth(3);
    await expect(dateCell).toBeVisible({ timeout: 15_000 });
    const enDateText = await dateCell.textContent();

    // Measure the EN→IT switch against the NFR: < 500 ms.
    const elapsed = await switchLocaleViaUi(page, 'it');
    expect(elapsed, `full UI update after switch took ${String(elapsed)}ms`).toBeLessThan(500);

    // Full UI updated in place: sidebar labels flipped.
    await expect(page.getByText('Utenti', { exact: true })).toBeVisible();
    await expect(page.getByText('Users', { exact: true })).toBeHidden();

    // Locale-aware date format actually changed on the rendered audit row.
    await expect(dateCell).not.toHaveText(enDateText ?? '', { timeout: 10_000 });
    const itDateText = await dateCell.textContent();
    expect(itDateText).not.toBe(enDateText);

    // Persisted choice + profile source of truth.
    expect(await readStoreLocale(page)).toBe('it');
    expect(await readProfileLanguage(page)).toBe('it');

    // Restore EN so later suites start from the default UI language.
    await setProfileLanguage(page, 'en');
  });

  test('switch IT→EN back and forth stays consistent after reload (persisted)', async ({ page }) => {
    await loginAsAdmin(page);
    await setProfileLanguage(page, 'en');

    await switchLocaleViaUi(page, 'it');
    await page.reload();
    await expect(page.getByText('Registro di controllo', { exact: true })).toBeVisible();
    expect(await readStoreLocale(page)).toBe('it');

    await switchLocaleViaUi(page, 'en');
    await expect(page.getByText('Audit Log', { exact: true })).toBeVisible();
  });
});