/**
 * Test Helpers for Marketplace E2E Tests
 *
 * Common functions and utilities for E2E testing.
 */

import { Page, expect } from '@playwright/test';

/**
 * Authentication Helpers
 */
export class AuthHelpers {
  constructor(private page: Page) {}

  /**
   * Login as super-admin
   * Note: This assumes Keycloak is properly configured
   * You may need to adjust based on your auth flow
   */
  async loginAsSuperAdmin(username: string, password: string) {
    await this.page.goto('/');

    // Wait for redirect to Keycloak or direct to app if already logged in
    await this.page.waitForLoadState('networkidle');

    // If redirected to Keycloak login
    if (this.page.url().includes('keycloak') || this.page.url().includes('auth')) {
      await this.page.fill('input[name="username"]', username);
      await this.page.fill('input[name="password"]', password);
      await this.page.click('input[type="submit"]');

      // Wait for redirect back to app
      await this.page.waitForURL('**/plugins', { timeout: 10000 });
    }

    // Verify we're logged in
    await expect(this.page).toHaveURL(/\/plugins/);
  }

  async logout() {
    // Assuming there's a logout button in the header
    await this.page.click('[data-testid="user-menu"]');
    await this.page.click('text=Logout');
    await this.page.waitForLoadState('networkidle');
  }
}

/**
 * Navigation Helpers
 */
export class NavigationHelpers {
  constructor(private page: Page) {}

  /**
   * Navigate to plugins page
   * @param plugins - Optional array of plugins to mock in the list API response
   */
  async goToPluginsPage(plugins: any[] = []) {
    // Listen for console messages to help debug blank pages
    this.page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.log('Browser console error:', msg.text());
      } else {
        // Also log info/log messages that contain keywords we care about
        const text = msg.text();
        if (
          text.includes('Debug') ||
          text.includes('E2E') ||
          text.includes('Mock') ||
          text.includes('Keycloak')
        ) {
          console.log(`Browser console [${msg.type()}]:`, text);
        }
      }
    });

    // Mock the plugins list API call that happens on page load
    await this.page.route('**/api/admin/plugins*', async (route) => {
      console.log('Mocking plugins API:', route.request().url());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          plugins: plugins,
          total: plugins.length,
        }),
      });
    });

    // Also mock tenants API to prevent errors
    await this.page.route('**/api/admin/tenants*', async (route) => {
      console.log('Mocking tenants API:', route.request().url());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tenants: [],
          total: 0,
        }),
      });
    });

    // Alternative approach: go to root first, then click sidebar link
    // This works better with client-side routing
    const currentUrl = this.page.url();
    console.log('Current URL before navigation:', currentUrl);

    // If we're at the root or a non-plugins page, navigate via sidebar
    if (!currentUrl.endsWith('/plugins')) {
      // If URL is empty/root, go to /tenants first to load the app shell
      if (currentUrl.endsWith('/') || !currentUrl.includes('localhost:3002')) {
        console.log('Going to /tenants first to load app...');
        await this.page.goto('/tenants');
        await this.page.waitForURL('**/tenants', { timeout: 5000 });
      }

      // Now click the Plugins link in the sidebar
      console.log('Clicking Plugins link in sidebar...');
      const pluginsLink = this.page.locator('a[href="/plugins"]');
      await pluginsLink.waitFor({ state: 'visible', timeout: 5000 });
      await pluginsLink.click();
      await this.page.waitForURL('**/plugins', { timeout: 10000 });
    }

    console.log('URL confirmed:', this.page.url());

    // Wait for the page content to load
    await this.page.waitForSelector('text=Plugin Marketplace', { timeout: 5000 }).catch(() => {
      console.log('Warning: Plugin Marketplace heading not found');
    });
  }

  async goToReviewQueue() {
    await this.goToPluginsPage();
    await this.page.click('button:has-text("Review Queue")');
    await this.page.waitForTimeout(500); // Wait for tab switch
  }

  async openPluginDetail(pluginName: string) {
    await this.page.click(`text=${pluginName}`);
    await this.page.waitForLoadState('networkidle');
  }
}

/**
 * Modal Helpers
 */
export class ModalHelpers {
  constructor(private page: Page) {}

  async waitForModalOpen(modalTitle: string) {
    await this.page.waitForSelector(`h2:has-text("${modalTitle}")`, { timeout: 5000 });
  }

  async closeModal() {
    await this.page.click('[aria-label="Close modal"], button:has-text("Close")');
    await this.page.waitForTimeout(300);
  }

  async clickModalButton(buttonText: string) {
    await this.page.click(`button:has-text("${buttonText}")`);
  }
}

/**
 * Form Helpers
 */
export class FormHelpers {
  constructor(private page: Page) {}

  async fillInput(label: string, value: string) {
    const input = this.page.locator(`label:has-text("${label}")`).locator('..').locator('input');
    await input.fill(value);
  }

  async fillTextarea(label: string, value: string) {
    const textarea = this.page
      .locator(`label:has-text("${label}")`)
      .locator('..')
      .locator('textarea');
    await textarea.fill(value);
  }

  async selectOption(label: string, value: string) {
    const select = this.page.locator(`label:has-text("${label}")`).locator('..').locator('select');
    await select.selectOption(value);
  }

  async checkCheckbox(label: string) {
    await this.page.check(
      `input[type="checkbox"]#${label}, label:has-text("${label}") input[type="checkbox"]`
    );
  }

  async uncheckCheckbox(label: string) {
    await this.page.uncheck(
      `input[type="checkbox"]#${label}, label:has-text("${label}") input[type="checkbox"]`
    );
  }
}

/**
 * API Mock Helpers
 */
export class ApiMockHelpers {
  constructor(private page: Page) {}

  async mockMarketplaceSearch(response: any) {
    await this.page.route('**/api/marketplace/plugins*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(response),
      });
    });
  }

  async mockPluginAnalytics(pluginId: string, analyticsData: any) {
    await this.page.route(`**/api/marketplace/plugins/${pluginId}/analytics*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(analyticsData),
      });
    });
  }

  async mockPluginReview(pluginId: string, success = true) {
    await this.page.route(`**/api/marketplace/plugins/${pluginId}/review`, async (route) => {
      if (success) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, status: 'PUBLISHED' }),
        });
      } else {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Review failed' }),
        });
      }
    });
  }

  async mockGetPendingPlugins(plugins: any[]) {
    await this.page.route('**/api/v1/marketplace/admin/review*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ plugins }),
      });
    });
  }

  async mockApprovePlugin(pluginId: string, updatedPlugin: any) {
    await this.page.route(
      `**/api/v1/marketplace/admin/review/${pluginId}/approve`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(updatedPlugin),
        });
      }
    );
  }

  async mockRejectPlugin(pluginId: string, updatedPlugin: any) {
    await this.page.route(
      `**/api/v1/marketplace/admin/review/${pluginId}/reject`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(updatedPlugin),
        });
      }
    );
  }

  async clearMocks() {
    await this.page.unroute('**/*');
  }
}

/**
 * Assertion Helpers
 */
export class AssertionHelpers {
  constructor(private page: Page) {}

  async expectToastMessage(message: string) {
    // Sonner toasts appear in the DOM
    const toast = this.page.locator('[data-sonner-toast]').filter({ hasText: message });
    await expect(toast).toBeVisible({ timeout: 5000 });
  }

  async expectPluginInList(pluginName: string) {
    const plugin = this.page.locator(`text=${pluginName}`);
    await expect(plugin).toBeVisible();
  }

  async expectPluginNotInList(pluginName: string) {
    const plugin = this.page.locator(`text=${pluginName}`);
    await expect(plugin).not.toBeVisible();
  }

  async expectBadgeStatus(status: string) {
    const badge = this.page.locator(`[class*="badge"]:has-text("${status}")`);
    await expect(badge).toBeVisible();
  }

  async expectModalOpen(title: string) {
    const modal = this.page.locator(`h2:has-text("${title}")`);
    await expect(modal).toBeVisible();
  }

  async expectModalClosed(title: string) {
    const modal = this.page.locator(`h2:has-text("${title}")`);
    await expect(modal).not.toBeVisible();
  }
}

/**
 * Wait Helpers
 */
export class WaitHelpers {
  constructor(private page: Page) {}

  async waitForNetworkIdle() {
    await this.page.waitForLoadState('networkidle');
  }

  async forNetworkIdle() {
    await this.waitForNetworkIdle();
  }

  async waitForApiCall(endpoint: string) {
    await this.page.waitForResponse(
      (response) => response.url().includes(endpoint) && response.status() === 200
    );
  }

  async forApiCall(endpoint: string) {
    await this.waitForApiCall(endpoint);
  }

  async waitForToastDisappear() {
    await this.page.waitForTimeout(4500); // Default Sonner toast duration is 4000ms
  }

  async forToastDisappear() {
    await this.waitForToastDisappear();
  }
}

/**
 * Screenshot Helpers
 */
export class ScreenshotHelpers {
  constructor(private page: Page) {}

  async takeFullPage(name: string) {
    await this.page.screenshot({
      path: `tests/e2e/screenshots/${name}.png`,
      fullPage: true,
    });
  }

  async takeFullPageScreenshot(name: string) {
    await this.takeFullPage(name);
  }

  async takeModal(name: string) {
    const modal = this.page.locator('[role="dialog"], .modal, [class*="modal"]').first();
    await modal.screenshot({
      path: `tests/e2e/screenshots/${name}.png`,
    });
  }

  async takeModalScreenshot(name: string) {
    await this.takeModal(name);
  }
}

/**
 * Combined Helper Class
 * Provides access to all helpers from a single instance
 */
export class TestHelpers {
  auth: AuthHelpers;
  nav: NavigationHelpers;
  modal: ModalHelpers;
  form: FormHelpers;
  apiMock: ApiMockHelpers;
  api: ApiMockHelpers; // Alias for apiMock
  assert: AssertionHelpers;
  wait: WaitHelpers;
  screenshot: ScreenshotHelpers;

  constructor(page: Page) {
    this.auth = new AuthHelpers(page);
    this.nav = new NavigationHelpers(page);
    this.modal = new ModalHelpers(page);
    this.form = new FormHelpers(page);
    this.apiMock = new ApiMockHelpers(page);
    this.api = this.apiMock; // Alias for easier access
    this.assert = new AssertionHelpers(page);
    this.wait = new WaitHelpers(page);
    this.screenshot = new ScreenshotHelpers(page);
  }
}
