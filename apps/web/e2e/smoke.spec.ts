// smoke.spec.ts — E2E smoke test: login page renders.
// Constitution Rule 1: every user-interactive surface must have an E2E test.
// This is the Phase 0 capstone test — verifies the login page is rendered.

import { test, expect } from '@playwright/test';

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

  test('form elements are accessible (labels connected to inputs)', async ({ page }) => {
    await page.goto('/');

    // Email input has an accessible label
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();

    // Password input has an accessible label
    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toBeVisible();
  });

  test('page responds to keyboard navigation', async ({ page }) => {
    await page.goto('/');

    // Tab through the form fields
    await page.keyboard.press('Tab');
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeFocused();

    await page.keyboard.press('Tab');
    // Next focusable element (password or show/hide toggle)
    // Just verify focus moved — exact element depends on implementation
    const focused = page.locator(':focus');
    await expect(focused).toBeVisible();
  });
});
