import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for Super-Admin E2E Tests
 *
 * Test Environment:
 * - Super-Admin App: http://localhost:3002
 * - Core API: http://localhost:3000
 * - Keycloak: http://localhost:8080
 *
 * Prerequisites:
 * - Infrastructure running (pnpm infra:start)
 * - Database migrated and seeded
 * - Core API running (cd apps/core-api && pnpm dev)
 * - Super-Admin running (cd apps/super-admin && pnpm dev)
 */
export default defineConfig({
  testDir: './tests/e2e',

  // Only match .spec.ts files as tests (exclude helpers, fixtures, setup)
  testMatch: '**/*.spec.ts',

  // Global setup: NOT needed in E2E test mode (mock auth is always authenticated)
  // globalSetup: './tests/e2e/global-setup.ts',

  // Maximum time one test can run for
  timeout: 30 * 1000,

  // Run tests in files in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Opt out of parallel tests on CI
  workers: process.env.CI ? 1 : undefined,

  // Reporter to use
  reporter: [['html', { outputFolder: 'playwright-report' }], ['list']],

  // Shared settings for all the projects below
  use: {
    // Base URL to use in actions like `await page.goto('/')`
    baseURL: 'http://localhost:3002',

    // No need for storageState in E2E test mode (mock auth is always authenticated)
    // storageState: './tests/e2e/.auth/user.json',

    // Collect trace when retrying the failed test
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on failure
    video: 'retain-on-failure',

    // Emulate locale and timezone
    locale: 'en-US',
    timezoneId: 'America/New_York',
  },

  // Configure projects for major browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    // Uncomment to test on Firefox
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },

    // Uncomment to test on WebKit
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },

    // Test against mobile viewports
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
  ],

  // Run your local dev server before starting the tests
  // IMPORTANT: Enable E2E test mode to use mock authentication
  webServer: {
    command: 'pnpm dev --mode test',
    url: 'http://localhost:3002',
    reuseExistingServer: false, // Always restart to ensure test mode is active
    timeout: 120 * 1000,
  },
});
