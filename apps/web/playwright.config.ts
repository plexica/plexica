// playwright.config.ts — Playwright configuration for apps/web E2E tests.
// Chromium only (CI installs only Chromium to keep pipeline fast).
//
// Env loading strategy:
//   Local dev  — dotenv.config() reads ../../.env (monorepo root). No-ops if absent.
//   CI         — env vars come from the GitHub Actions job-level `env:` block.
//                dotenv.config() silently no-ops (no .env file in CI workspace).
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
// These values match what global-setup.ts provisions. Setting them here (not in
// globalSetup) ensures test workers read them from process.env. Inline defaults
// in test files (e.g. `?? ''`) then evaluate to these values, making hasKeycloak
// always true and ensuring Constitution Rule 1 is enforced (no silent skips).

function setDefault(key: string, value: string): void {
  if (process.env[key] === undefined || process.env[key] === '') {
    process.env[key] = value;
  }
}

setDefault('PLAYWRIGHT_KEYCLOAK_URL', 'http://localhost:8080');
setDefault('PLAYWRIGHT_TENANT_SLUG', 'e2e');
setDefault('PLAYWRIGHT_KEYCLOAK_USER', 'test@e2e.local');
setDefault('PLAYWRIGHT_KEYCLOAK_PASS', 'PlexicaE2e!1');
setDefault('PLAYWRIGHT_USER_FIRST_NAME', 'E2E');
setDefault('PLAYWRIGHT_TENANT_A_SLUG', 'e2e');
setDefault('PLAYWRIGHT_TENANT_B_SLUG', 'e2e-b');
setDefault('PLAYWRIGHT_TEST_USER', 'test@e2e.local');
setDefault('PLAYWRIGHT_TEST_PASSWORD', 'PlexicaE2e!1');
setDefault('PLAYWRIGHT_FORCE_PASSWORD_USER', 'force-pwd@e2e.local');
setDefault('PLAYWRIGHT_FORCE_PASSWORD_PASS', 'ForcePwd!1');
setDefault('PLAYWRIGHT_FORCE_PROFILE_USER', 'force-profile@e2e.local');
setDefault('PLAYWRIGHT_FORCE_PROFILE_PASS', 'ForceProfile!1');

const keycloakUrl = process.env['PLAYWRIGHT_KEYCLOAK_URL'] ?? 'http://localhost:8080';

// ── Core-api webServer command ─────────────────────────────────────────────────
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
    baseURL: process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    navigationTimeout: 30_000,
    actionTimeout: 10_000,
    // Simulate tenant slug header for dev mode (avoids subdomain requirement)
    extraHTTPHeaders: {
      'X-Tenant-Slug': process.env['PLAYWRIGHT_TENANT_SLUG'] ?? 'e2e',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Two webServers: core-api (backend) and Vite frontend.
  // Playwright starts them in array order and waits for each URL to respond.
  // globalSetup runs BEFORE webServers start, so tenant provisioning (which
  // calls the CLI directly) does not need the HTTP server to be up.
  webServer: [
    {
      // Core-api backend — required for tenant resolution and auth
      command: coreApiCommand,
      url: 'http://localhost:3001/health',
      reuseExistingServer: !isCi,
      timeout: 60_000,
      env: {
        // Forward all infra env vars so core-api can connect to services
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
      // Vite frontend
      command: 'pnpm --filter web dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !isCi,
      timeout: 30_000,
      env: {
        PLAYWRIGHT_KEYCLOAK_URL: keycloakUrl,
      },
    },
  ],
});
