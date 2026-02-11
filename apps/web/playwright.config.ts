import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for Web App E2E Tests
 *
 * Test Environment:
 * - Web App: http://localhost:3001
 * - Core API: mocked via page.route() (no real backend needed)
 * - Auth: MockAuthProvider (VITE_E2E_TEST_MODE=true)
 *
 * Run: pnpm test:e2e
 */
export default defineConfig({
  testDir: './tests/e2e',

  // Only match .spec.ts files as tests (exclude helpers, fixtures, setup)
  testMatch: '**/*.spec.ts',

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
    baseURL: 'http://localhost:3001',

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
  ],

  // Run your local dev server before starting the tests
  // IMPORTANT: --mode test loads .env.test which enables MockAuthProvider
  webServer: {
    command: 'pnpm dev --mode test',
    url: 'http://localhost:3001',
    reuseExistingServer: false,
    timeout: 120 * 1000,
  },
});
