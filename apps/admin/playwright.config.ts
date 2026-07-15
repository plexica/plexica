// playwright.config.ts — Playwright configuration for apps/admin E2E tests.
// Chromium only (desktop). The admin app is an internal tool — no mobile.
//
// Env loading strategy mirrors apps/web/playwright.config.ts:
//   Local dev  — dotenv.config() reads ../../.env (monorepo root). No-ops if absent.
//   CI         — env vars come from the GitHub Actions job-level `env:` block.
//
// PLAYWRIGHT_* defaults are set here (in the main process) so they are inherited
// by test worker processes. Setting them only in globalSetup is insufficient —
// globalSetup runs in a separate context whose process.env mutations do not
// propagate to workers.

import * as path from 'path';
import { fileURLToPath } from 'url';

import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from the monorepo root for local dev. No-ops in CI (file absent).
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// ── Hardcoded E2E defaults ────────────────────────────────────────────────────
// These match what global-setup.ts expects. Setting them here (not in
// globalSetup) ensures test workers read them from process.env.

function setDefault(key: string, value: string): void {
  if (process.env[key] === undefined || process.env[key] === '') {
    process.env[key] = value;
  }
}

setDefault('PLAYWRIGHT_KEYCLOAK_URL', 'http://localhost:8080');
setDefault('PLAYWRIGHT_SUPER_ADMIN_USER', 'admin');
setDefault('PLAYWRIGHT_SUPER_ADMIN_PASS', 'changeme');
setDefault('PLAYWRIGHT_ADMIN_E2E_TENANT_SLUG', 'e2e-admin');
setDefault('PLAYWRIGHT_ADMIN_E2E_TENANT_NAME', 'E2E Admin');
setDefault('PLAYWRIGHT_ADMIN_E2E_TENANT_EMAIL', 'admin@e2e-admin.local');

const keycloakUrl = process.env['PLAYWRIGHT_KEYCLOAK_URL'] ?? 'http://localhost:8080';
const playwrightBrowserChannel = process.env['PLAYWRIGHT_BROWSER_CHANNEL'];

// ── webServer commands ────────────────────────────────────────────────────────
// CI: after `pnpm build`, start the compiled output directly (no tsx / dotenv wrapper).
// Local: use the dev script (which loads .env via dotenv-cli and runs tsx watch).
const isCi = process.env['CI'] !== undefined;
const coreApiCommand = isCi ? 'pnpm --filter core-api start' : 'pnpm --filter core-api dev';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  workers: 1,
  timeout: 30_000,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],

  globalSetup: './e2e/global-setup.ts',

  use: {
    baseURL: process.env['PLAYWRIGHT_ADMIN_BASE_URL'] ?? 'http://localhost:3002',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    navigationTimeout: 30_000,
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(playwrightBrowserChannel === undefined ? {} : { channel: playwrightBrowserChannel }),
      },
    },
  ],
  // Two webServers: core-api (backend, admin API) and the admin Vite frontend.
  // Playwright starts them in array order and waits for each URL to respond.
  // globalSetup runs BEFORE webServers start, so token fetching (which hits
  // Keycloak directly) does not need the HTTP servers to be up.
  webServer: [
    {
      // Core-api backend — serves the /api/v1/admin/* endpoints.
      command: coreApiCommand,
      url: 'http://localhost:3001/health',
      reuseExistingServer: !isCi,
      timeout: 60_000,
      env: {
        NODE_ENV: process.env['NODE_ENV'] ?? 'test',
        DATABASE_URL:
          process.env['DATABASE_URL'] ?? 'postgresql://plexica:changeme@localhost:5432/plexica',
        KEYCLOAK_URL: keycloakUrl,
        KEYCLOAK_ADMIN_USER: process.env['KEYCLOAK_ADMIN_USER'] ?? 'admin',
        KEYCLOAK_ADMIN_PASSWORD: process.env['KEYCLOAK_ADMIN_PASSWORD'] ?? 'changeme',
        REDIS_URL: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
        MINIO_ENDPOINT: process.env['MINIO_ENDPOINT'] ?? 'http://localhost:9000',
        MINIO_ACCESS_KEY: process.env['MINIO_ACCESS_KEY'] ?? 'minioadmin',
        MINIO_SECRET_KEY: process.env['MINIO_SECRET_KEY'] ?? 'changeme',
        KAFKA_BROKERS: process.env['KAFKA_BROKERS'] ?? 'localhost:19092',
      },
    },
    {
      // Admin Vite frontend.
      command: 'pnpm --filter @plexica/admin dev',
      url: 'http://localhost:3002',
      reuseExistingServer: !isCi,
      timeout: 30_000,
      env: {
        PLAYWRIGHT_KEYCLOAK_URL: keycloakUrl,
      },
    },
  ],
});
