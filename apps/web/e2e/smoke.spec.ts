// smoke.spec.ts — E2E smoke test: login page renders.
// Constitution Rule 1: every user-interactive surface must have an E2E test.
// This is the Phase 0 capstone test — verifies the login page is rendered.

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('Login page smoke test', () => {
  test('login page renders with all required form elements', async ({ page }) => {
    await page.goto('/');

    // Page must load without errors
    await expect(page).toHaveTitle(/Plexica/i);

    // Email input must be present and visible
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();

    // Password input must be present and visible
    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toBeVisible();

    // Submit button must be present, visible, and enabled
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toBeEnabled();
  });

  test('page passes axe-core accessibility check (no critical violations)', async ({ page }) => {
    await page.goto('/');

    // Run axe-core against the full page — fulfills task 001-T30 DoD
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test('form labels are programmatically associated with inputs', async ({ page }) => {
    await page.goto('/');

    // getByLabel verifies the htmlFor/id association, not just visibility.
    // This checks that screen readers can correctly announce the field purpose.
    const emailInput = page.getByLabel(/email/i);
    await expect(emailInput).toBeVisible();

    const passwordInput = page.getByLabel(/password/i);
    await expect(passwordInput).toBeVisible();
  });

  test('page responds to keyboard navigation in expected tab order', async ({ page }) => {
    await page.goto('/');

    // First Tab: email field receives focus
    await page.keyboard.press('Tab');
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeFocused();

    // Second Tab: password field or show/hide toggle is next in tab order
    await page.keyboard.press('Tab');
    const passwordInput = page.locator('input[type="password"]');
    const showHideToggle = page.locator('button[aria-label*="password" i]');
    const focusedIsPasswordOrToggle =
      (await passwordInput.evaluate((el) => el === document.activeElement)) ||
      (await showHideToggle.count() > 0 &&
        await showHideToggle.evaluate((el) => el === document.activeElement));
    expect(focusedIsPasswordOrToggle).toBe(true);
  });
});
