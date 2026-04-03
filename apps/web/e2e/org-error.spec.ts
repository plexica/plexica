// org-error.spec.ts
// E2E test: organization error page variants.
// Verifies the right page is shown for no-subdomain and unknown org.

import { expect, test } from './helpers/base-fixture.js';

test.describe('Organization error pages', () => {
  test('unknown tenant slug shows org not found page', async ({ page }) => {
    // Navigate with a slug that does not exist in the API
    await page.goto('/?tenant=this-org-does-not-exist-xyz123');

    // Should redirect to /org-error with reason=unknown
    await page.waitForURL(/\/org-error/, { timeout: 10_000 });

    // Should show the org not found variant
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/not found|organization/i);

    // Must NOT reveal any valid tenant information
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).not.toContain('realm');
    expect(bodyText).not.toContain('schema');
  });

  test('no-subdomain variant shows "which organization?" page', async ({ page }) => {
    await page.goto('/org-error?reason=no-subdomain');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/organization|which/i);
    // Should show address example
    await expect(page.locator('body')).toContainText(/plexica\.io/i);
  });

  test('error page does not expose valid tenant slugs', async ({ page }) => {
    await page.goto('/org-error?reason=unknown');

    // The error page body must not contain any SQL/schema identifiers
    const bodyText = (await page.locator('body').textContent()) ?? '';
    expect(bodyText).not.toMatch(/tenant_/);
    expect(bodyText).not.toMatch(/plexica-[a-z]/);
  });
});
