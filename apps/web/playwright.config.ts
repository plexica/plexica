// playwright.config.ts — Playwright configuration for apps/web E2E tests.
// Chromium only (CI installs only Chromium to keep pipeline fast).

import { defineConfig, devices } from '@playwright/test';

const keycloakUrl = process.env['PLAYWRIGHT_KEYCLOAK_URL'] ?? 'http://localhost:8080';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: process.env['CI'] !== undefined,
  retries: process.env['CI'] !== undefined ? 1 : 0,
  workers: 1,
  timeout: 30_000,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    // Simulate tenant slug header for dev mode (avoids subdomain requirement)
    extraHTTPHeaders: {
      'X-Tenant-Slug': process.env['PLAYWRIGHT_TENANT_SLUG'] ?? 'test-tenant',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Start the Vite dev server before running tests
  webServer: {
    command: 'pnpm --filter web dev',
    url: 'http://localhost:3000',
    reuseExistingServer: process.env['CI'] === undefined,
    timeout: 30_000,
    env: {
      PLAYWRIGHT_KEYCLOAK_URL: keycloakUrl,
    },
  },
});
