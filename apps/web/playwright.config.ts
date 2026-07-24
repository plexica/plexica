// playwright.config.ts — Playwright configuration for apps/web E2E tests.
// Chromium only. CI uses the preinstalled Google Chrome channel on GitHub
// runners to avoid flaky Playwright browser downloads.
//
// Env loading strategy:
//   Local dev  — dotenv.config() reads ../../.env (monorepo root). No-ops if absent.
//   CI         — env vars come from the GitHub Actions job-level `env:` block.
//                dotenv.config() silently no-ops (no .env file in CI workspace).
//
// Stable PLAYWRIGHT_* defaults are set during config evaluation. Per-run secrets
// are generated later by global setup and propagated to worker environments.

import * as path from 'path';
import { fileURLToPath } from 'url';

import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from the monorepo root for local dev. No-ops in CI (file absent).
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function requiredRunValue(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `${key} is required. Use "pnpm --filter web test:e2e:production" for an isolated run.`
    );
  }
  return value;
}

const credentialPepper = requiredRunValue('PLUGIN_CREDENTIAL_PEPPER');
const eventEncryptionKey = requiredRunValue('EVENT_KEY_ENCRYPTION_KEY');
const pluginDbEncryptionKey = requiredRunValue('PLUGIN_DB_ENCRYPTION_KEY');
const pluginDbCaPath = requiredRunValue('PLUGIN_DB_SSL_ROOT_CERT_PATH');

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

// Global setup runs provisioning CLIs before web servers. Share run-scoped
// secrets with those CLIs; the core webServer still overrides TLS mode below.
setDefault('EVENT_KEY_ENCRYPTION_KEY', eventEncryptionKey);
setDefault('PLUGIN_DB_ENCRYPTION_KEY', pluginDbEncryptionKey);
setDefault('PLUGIN_CREDENTIAL_PEPPER', credentialPepper);
setDefault('PLUGIN_DB_SSL_MODE', 'verify-full');
setDefault('PLAYWRIGHT_KEYCLOAK_URL', 'http://localhost:8080');
setDefault('PLAYWRIGHT_E2E', 'true');
setDefault('PLAYWRIGHT_RATE_LIMIT_RESOLVE_MAX', '30');
setDefault('PLAYWRIGHT_GENERAL_RATE_LIMIT_MAX', '10000');
setDefault('PLAYWRIGHT_TENANT_SLUG', 'e2e');
setDefault('PLAYWRIGHT_KEYCLOAK_USER', 'test@e2e.local');
setDefault('PLAYWRIGHT_KEYCLOAK_PASS', 'PlexicaE2e!1');
setDefault('PLAYWRIGHT_USER_FIRST_NAME', 'E2E');
setDefault('PLAYWRIGHT_TENANT_A_SLUG', 'e2e');
setDefault('PLAYWRIGHT_TENANT_B_SLUG', 'e2e-b');
setDefault('PLAYWRIGHT_TENANT_DOMAIN', 'localhost');
setDefault('PLAYWRIGHT_BASE_URL', 'http://e2e.localhost:3000');
setDefault('PLAYWRIGHT_API_URL', 'http://e2e.localhost:3001');
setDefault('PLAYWRIGHT_TEST_USER', 'test@e2e.local');
setDefault('PLAYWRIGHT_TEST_PASSWORD', 'PlexicaE2e!1');
setDefault('PLAYWRIGHT_FORCE_PASSWORD_USER', 'force-pwd@e2e.local');
setDefault('PLAYWRIGHT_FORCE_PASSWORD_PASS', 'ForcePwd!1');
setDefault('PLAYWRIGHT_FORCE_PROFILE_USER', 'force-profile@e2e.local');
setDefault('PLAYWRIGHT_FORCE_PROFILE_PASS', 'ForceProfile!1');

const keycloakUrl = process.env['PLAYWRIGHT_KEYCLOAK_URL'] ?? 'http://localhost:8080';
const playwrightBrowserChannel = process.env['PLAYWRIGHT_BROWSER_CHANNEL'];
const databaseUrl =
  process.env['DATABASE_URL'] ?? 'postgresql://plexica:changeme@localhost:5432/plexica';

// ── Core-api webServer command ─────────────────────────────────────────────────
// Always build and start compiled output so local and CI exercise production branches.
const isCi = process.env['CI'] !== undefined;
const coreApiCommand = 'pnpm --filter core-api build && pnpm --filter core-api start';
const webCommand =
  'VITE_E2E=true NODE_ENV=production pnpm --filter web build && pnpm --filter web preview';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  workers: 1,
  timeout: 30_000,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],

  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',

  use: {
    baseURL: process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://e2e.localhost:3000',
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
  // CRM is installed by the production API flow and launched by DockerContainerManager.
  webServer: [
    {
      // Core-api backend — required for tenant resolution and auth
      command: coreApiCommand,
      url: 'http://localhost:3001/health',
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        // Forward all infra env vars so core-api can connect to services
        NODE_ENV: 'production',
        PORT: '3001',
        DATABASE_URL: databaseUrl,
        KEYCLOAK_URL: keycloakUrl,
        KEYCLOAK_ADMIN_USER: process.env['KEYCLOAK_ADMIN_USER'] ?? 'admin',
        KEYCLOAK_ADMIN_PASSWORD: process.env['KEYCLOAK_ADMIN_PASSWORD'] ?? 'changeme',
        REDIS_URL: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
        MINIO_ENDPOINT: process.env['MINIO_ENDPOINT'] ?? 'http://localhost:9000',
        MINIO_ACCESS_KEY: process.env['MINIO_ACCESS_KEY'] ?? 'minioadmin',
        MINIO_SECRET_KEY: process.env['MINIO_SECRET_KEY'] ?? 'changeme',
        KAFKA_BROKERS: process.env['KAFKA_BROKERS'] ?? 'localhost:19092',
        EVENT_KEY_ENCRYPTION_KEY: eventEncryptionKey,
        PLUGIN_DB_ENCRYPTION_KEY: pluginDbEncryptionKey,
        PLUGIN_DB_SSL_MODE: 'verify-full',
        PLUGIN_DB_SSL_ROOT_CERT_PATH: pluginDbCaPath,
        PLUGIN_DB_HOST: process.env['PLUGIN_DB_HOST'] ?? 'postgres',
        PLUGIN_DB_PORT: process.env['PLUGIN_DB_PORT'] ?? '5432',
        PLUGIN_DOCKER_NETWORK: requiredRunValue('PLUGIN_DOCKER_NETWORK'),
        PLUGIN_CORE_API_URL:
          process.env['PLUGIN_CORE_API_URL'] ?? 'http://host.docker.internal:3001',
        PLUGIN_RUNTIME_SCOPE: requiredRunValue('PLUGIN_RUNTIME_SCOPE'),
        PLUGIN_CREDENTIAL_PEPPER: credentialPepper,
        APP_URL: 'http://e2e.localhost:3000',
        // Feature tests use isolated proxy IPs, while this high global ceiling
        // prevents unrelated direct API setup calls sharing one CI socket from
        // exhausting the generic budget. Resolve keeps its dedicated limit.
        RATE_LIMIT_MAX: process.env['PLAYWRIGHT_GENERAL_RATE_LIMIT_MAX'] ?? '10000',
        ADMIN_RATE_LIMIT_MAX: process.env['PLAYWRIGHT_GENERAL_RATE_LIMIT_MAX'] ?? '10000',
        RATE_LIMIT_RESOLVE_MAX: process.env['PLAYWRIGHT_RATE_LIMIT_RESOLVE_MAX'] ?? '30',
        TRUST_PROXY: '1',
        LOKI_URL: process.env['LOKI_URL'] ?? 'http://localhost:3100',
      },
    },
    {
      // Vite frontend
      command: webCommand,
      url: 'http://localhost:3000',
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        VITE_KEYCLOAK_URL: keycloakUrl,
        VITE_PLUGIN_ASSET_ORIGIN: requiredRunValue('VITE_PLUGIN_ASSET_ORIGIN'),
      },
    },
  ],
});
