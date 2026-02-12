/**
 * Test Helper Utilities for Web App E2E Tests
 *
 * Provides reusable helper functions for common test operations:
 * navigation, form interactions, assertions, and waiting.
 */

import { Page, expect, Locator } from '@playwright/test';
import { mockAllApis } from './api-mocks';

// ---------------------------------------------------------------------------
// Setup Helpers
// ---------------------------------------------------------------------------

/**
 * Standard page setup: mock all APIs, then navigate to the target URL.
 * Use this in beforeEach() or at the start of each test.
 */
export async function setupPage(page: Page, url = '/') {
  await mockAllApis(page);
  await page.goto(url);
}

/**
 * Wait for the app to finish loading (spinner disappears, content renders).
 */
export async function waitForAppReady(page: Page) {
  // Wait for the loading spinner to disappear
  await page.waitForFunction(
    () => {
      const spinners = document.querySelectorAll('.animate-spin');
      return spinners.length === 0;
    },
    { timeout: 10000 }
  );
}

// ---------------------------------------------------------------------------
// Navigation Helpers
// ---------------------------------------------------------------------------

/**
 * Navigate to a page and wait for it to be ready.
 */
export async function navigateTo(page: Page, path: string) {
  await page.goto(path);
  await waitForAppReady(page);
}

/**
 * Click a sidebar navigation link by its text.
 */
export async function clickSidebarLink(page: Page, linkText: string) {
  const link = page.getByRole('link', { name: linkText, exact: true });
  await link.click();
}

/**
 * Verify the current URL matches the expected path.
 */
export async function expectUrl(page: Page, path: string) {
  await expect(page).toHaveURL(new RegExp(`${path}$`));
}

// ---------------------------------------------------------------------------
// Form Helpers
// ---------------------------------------------------------------------------

/**
 * Fill an input field by its label text.
 */
export async function fillInput(page: Page, label: string, value: string) {
  const input = page.getByLabel(label);
  await input.clear();
  await input.fill(value);
}

/**
 * Click a button by its text content.
 */
export async function clickButton(page: Page, text: string) {
  await page.getByRole('button', { name: text, exact: true }).click();
}

/**
 * Select an option from a native <select> element by its label.
 */
export async function selectOption(page: Page, label: string, value: string) {
  const select = page.getByLabel(label);
  await select.selectOption(value);
}

// ---------------------------------------------------------------------------
// Assertion Helpers
// ---------------------------------------------------------------------------

/**
 * Assert that a heading with the given text is visible.
 */
export async function expectHeading(page: Page, text: string, level?: number) {
  if (level) {
    await expect(page.getByRole('heading', { name: text, level })).toBeVisible();
  } else {
    await expect(page.getByRole('heading', { name: text })).toBeVisible();
  }
}

/**
 * Assert that text is visible on the page.
 */
export async function expectText(page: Page, text: string) {
  await expect(page.getByText(text, { exact: false })).toBeVisible();
}

/**
 * Assert that an element with the given test ID is visible.
 */
export async function expectTestId(page: Page, testId: string) {
  await expect(page.getByTestId(testId)).toBeVisible();
}

/**
 * Assert that a link with the given text is visible.
 */
export async function expectLink(page: Page, text: string) {
  await expect(page.getByRole('link', { name: text })).toBeVisible();
}

/**
 * Assert count of elements matching a locator.
 */
export async function expectCount(locator: Locator, count: number) {
  await expect(locator).toHaveCount(count);
}

// ---------------------------------------------------------------------------
// Wait Helpers
// ---------------------------------------------------------------------------

/**
 * Wait for a specific text to appear on the page.
 */
export async function waitForText(page: Page, text: string, timeout = 5000) {
  await page.getByText(text, { exact: false }).waitFor({ timeout });
}

/**
 * Wait for navigation to complete after a click.
 */
export async function waitForNavigation(page: Page, urlPattern: string) {
  await page.waitForURL(urlPattern, { timeout: 10000 });
}

// ---------------------------------------------------------------------------
// Tab Helpers (for the settings page)
// ---------------------------------------------------------------------------

/**
 * Click a tab button by its text. Works with radix-style tab triggers.
 */
export async function clickTab(page: Page, tabName: string) {
  // Try role-based first (for accessible tabs)
  const tab = page.getByRole('tab', { name: tabName });
  if (await tab.isVisible().catch(() => false)) {
    await tab.click();
    return;
  }
  // Fallback: click button with the tab name
  await page.getByRole('button', { name: tabName, exact: true }).click();
}

// ---------------------------------------------------------------------------
// Dialog/Modal Helpers
// ---------------------------------------------------------------------------

/**
 * Wait for a dialog to appear and return its locator.
 */
export async function waitForDialog(page: Page) {
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ timeout: 5000 });
  return dialog;
}

/**
 * Close a dialog by clicking its close button or pressing Escape.
 */
export async function closeDialog(page: Page) {
  await page.keyboard.press('Escape');
}

// ---------------------------------------------------------------------------
// Toast Helpers
// ---------------------------------------------------------------------------

/**
 * Wait for a toast message to appear with the given text.
 */
export async function expectToast(page: Page, text: string) {
  // Sonner toasts use [data-sonner-toast] attribute
  const toast = page.locator('[data-sonner-toast]', { hasText: text });
  await toast.waitFor({ timeout: 5000 });
  await expect(toast).toBeVisible();
}
