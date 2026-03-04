/**
 * File: apps/web/tests/e2e/admin-a11y.spec.ts
 *
 * T008-63 — Playwright Accessibility Tests for Tenant Admin portal.
 * Validates WCAG 2.1 AA compliance for all 6 admin screens using
 * @axe-core/playwright as per ADR-022 (Accepted).
 *
 * Spec 008 Admin Interfaces — Phase 8 (Testing & QA)
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockAllApis } from './helpers/api-mocks';

// ---------------------------------------------------------------------------
// Admin pages to audit
// ---------------------------------------------------------------------------

const ADMIN_PAGES = [
  {
    name: 'Dashboard',
    url: '/admin/dashboard',
    heading: 'Dashboard',
  },
  {
    name: 'Users',
    url: '/admin/users',
    heading: 'Users',
  },
  {
    name: 'Teams',
    url: '/admin/teams',
    heading: 'Teams',
  },
  {
    name: 'Roles',
    url: '/admin/roles',
    heading: 'Roles',
  },
  {
    name: 'Settings',
    url: '/admin/settings',
    heading: 'Tenant Settings',
  },
  {
    name: 'Audit Log',
    url: '/admin/audit-logs',
    heading: 'Audit Log',
  },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Navigate to an admin page and wait until the expected heading is visible.
 * The 15 000 ms timeout accounts for route-level lazy loading.
 */
async function gotoAdminPage(
  page: Parameters<typeof mockAllApis>[0],
  url: string,
  heading: string
) {
  await page.goto(url);
  await expect(page.getByRole('heading', { name: heading })).toBeVisible({ timeout: 15_000 });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe('Tenant Admin — Accessibility (WCAG 2.1 AA)', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
  });

  // Generate one test per admin page
  for (const { name, url, heading } of ADMIN_PAGES) {
    test(`${name} page has no WCAG 2.1 AA violations`, async ({ page }) => {
      await gotoAdminPage(page, url, heading);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();

      expect(results.violations).toEqual([]);
    });
  }

  // ---------------------------------------------------------------------------
  // Interactive state: open dialogs / modals must also be accessible
  // ---------------------------------------------------------------------------

  test('Invite User dialog has no WCAG 2.1 AA violations', async ({ page }) => {
    await gotoAdminPage(page, '/admin/users', 'Users');

    // Open the invite dialog
    await page
      .getByRole('button', { name: /invite/i })
      .first()
      .click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      // Exclude the backdrop / overlay which may have low-contrast transparent bg
      .exclude('[data-radix-focus-guard]')
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('Create Team dialog has no WCAG 2.1 AA violations', async ({ page }) => {
    await gotoAdminPage(page, '/admin/teams', 'Teams');

    // Open the create team dialog
    await page
      .getByRole('button', { name: /create team/i })
      .first()
      .click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .exclude('[data-radix-focus-guard]')
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('Create Role dialog has no WCAG 2.1 AA violations', async ({ page }) => {
    await gotoAdminPage(page, '/admin/roles', 'Roles');

    // Open the create role dialog
    await page
      .getByRole('button', { name: /create role/i })
      .first()
      .click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .exclude('[data-radix-focus-guard]')
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
