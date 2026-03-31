// playwright.config.ts — Playwright configuration for apps/web E2E tests.
// Chromium only (CI installs only Chromium to keep pipeline fast).

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: process.env['CI'] !== undefined,
  retries: process.env['CI'] !== undefined ? 1 : 0,
  workers: 1,
  timeout: 30_000,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    baseURL: process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
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
  },
});
