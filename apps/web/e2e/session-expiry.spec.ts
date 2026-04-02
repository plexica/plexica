// session-expiry.spec.ts
// E2E test: session expiry flow — EC-05.
// Verifies that when the refresh token is invalid, the frontend shows the
// "session expired" toast and redirects to Keycloak login.
//
// M-5 fix: this test was missing entirely. AC-4 from spec 002 requires that
// expired sessions are detected and handled gracefully without a blank screen.

import { expect, test } from '@playwright/test';

const TENANT_SLUG = process.env['PLAYWRIGHT_TENANT_SLUG'] ?? 'test-tenant';

test.describe('Session expiry (EC-05 / AC-4)', () => {
  test('session expired toast appears and redirects to login after stale token', async ({
    page,
  }) => {
    // Step 1: go to app and wait for tenant resolution (or redirect to org-error)
    await page.goto('/');

    // Step 2: inject a stale auth state into sessionStorage directly.
    // This simulates what happens when a user returns with an expired session.
    // We set status='authenticated' with tokens that the backend will reject.
    await page.evaluate((tenantSlug) => {
      const staleState = {
        state: {
          accessToken: 'stale-access-token',
          refreshToken: 'stale-refresh-token',
          idToken: 'stale-id-token',
          userProfile: {
            id: 'stale-user',
            email: 'test@example.com',
            firstName: 'Test',
            lastName: 'User',
            realm: `plexica-${tenantSlug}`,
            roles: [],
          },
          status: 'authenticated',
          isAuthenticated: true,
          tenantSlug,
          realm: `plexica-${tenantSlug}`,
        },
        version: 0,
      };
      sessionStorage.setItem('plexica-auth', JSON.stringify(staleState));
    }, TENANT_SLUG);

    // Step 3: intercept all API calls to return 401 (simulates backend rejecting stale token)
    await page.route('/api/**', (route) => {
      void route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Token expired' } }),
      });
    });

    // Step 4: intercept the Keycloak token refresh to also fail (invalid_grant)
    await page.route('**/protocol/openid-connect/token', (route) => {
      void route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'invalid_grant' }),
      });
    });

    // Step 5: navigate to dashboard — this triggers /api/me which returns 401,
    // then the api-client attempts a refresh (also 401), then setSessionExpired() is called
    await page.goto('/dashboard');

    // Step 6: the SessionExpiredHandler should show a role="alert" toast
    const toast = page.locator('[role="alert"]');
    await expect(toast).toBeVisible({ timeout: 8_000 });
    await expect(toast).toContainText(/expired/i);

    // Step 7: after REDIRECT_DELAY_MS (3 seconds), should redirect to Keycloak login
    await page.waitForURL(/\/realms\/.*\/protocol\/openid-connect\/auth/, { timeout: 10_000 });
    // Confirm we're on a Keycloak login page
    await expect(page).toHaveURL(/realms/);
  });

  test('session expired page does not show a blank screen (AC-4)', async ({ page }) => {
    // Even if the redirect hasn't happened yet, the page should show something meaningful
    await page.goto('/');

    await page.evaluate((tenantSlug) => {
      sessionStorage.setItem(
        'plexica-auth',
        JSON.stringify({
          state: {
            accessToken: null,
            refreshToken: null,
            idToken: null,
            userProfile: null,
            status: 'expired',
            isAuthenticated: false,
            tenantSlug,
            realm: `plexica-${tenantSlug}`,
          },
          version: 0,
        })
      );
    }, TENANT_SLUG);

    await page.goto('/dashboard');

    // There should be visible content — not a blank page
    const bodyText = (await page.locator('body').textContent()) ?? '';
    expect(bodyText.trim().length).toBeGreaterThan(10);

    // Session expired toast or a redirect to Keycloak — either is acceptable
    const hasToast = await page
      .locator('[role="alert"]')
      .isVisible()
      .catch(() => false);
    const isOnKeycloak = page.url().includes('realms');
    expect(hasToast || isOnKeycloak, 'Should show toast or redirect to Keycloak').toBe(true);
  });
});
