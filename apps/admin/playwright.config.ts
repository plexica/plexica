// playwright.config.ts — Playwright configuration for apps/admin E2E tests.
// Chromium only (desktop). The admin app is an internal tool — no mobile.
//
// Env loading strategy mirrors apps/web/playwright.config.ts:
//   Local dev  — dotenv.config() reads the monorepo-root .env. No-ops if absent.
//   CI         — env vars come from the GitHub Actions job-level `env:` block.
//
// Shared config head/helpers live in ../../e2e/playwright-base.ts. This suite
// intentionally diverges from apps/web: it runs the DEV servers (vite dev,
// core-api via tsx watch locally) and disables plugin DB TLS. Do not align
// those parts with web — see the base file's comment.
//
// Stable PLAYWRIGHT_* defaults are set during config evaluation. Per-run secrets
// are generated later by global setup and propagated to worker environments.

import { randomBytes } from 'node:crypto';

import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

import {
  baseE2eConfig,
  browserChannelUse,
  coreApiEnv,
  keycloakUrl,
  MONOREPO_ROOT_ENV_PATH,
  setDefault,
} from '../../e2e/playwright-base.js';

// Load .env from the monorepo root for local dev. No-ops in CI (file absent).
dotenv.config({ path: MONOREPO_ROOT_ENV_PATH });

// ── Hardcoded E2E defaults ────────────────────────────────────────────────────
// These match what global-setup.ts expects. Setting them here (not in
// globalSetup) ensures test workers read them from process.env.

setDefault('PLAYWRIGHT_KEYCLOAK_URL', 'http://localhost:8080');
setDefault('PLAYWRIGHT_E2E', 'true');
setDefault('PLAYWRIGHT_ADMIN_E2E_TENANT_SLUG', 'e2e-admin');
setDefault('PLAYWRIGHT_ADMIN_E2E_TENANT_NAME', 'E2E Admin');
setDefault('PLAYWRIGHT_ADMIN_E2E_TENANT_EMAIL', 'admin@e2e-admin.local');
setDefault('PLAYWRIGHT_LOKI_URL', 'http://localhost:3100');

const credentialPepper =
  process.env['PLUGIN_CREDENTIAL_PEPPER'] ?? randomBytes(32).toString('base64url');

// ── webServer commands ────────────────────────────────────────────────────────
// CI: after `pnpm build`, start the compiled output directly (no tsx / dotenv wrapper).
// Local: use the dev script (which loads .env via dotenv-cli and runs tsx watch).
const isCi = process.env['CI'] !== undefined;
const coreApiCommand = isCi ? 'pnpm --filter core-api start' : 'pnpm --filter core-api dev';

export default defineConfig({
  ...baseE2eConfig,
  use: {
    ...baseE2eConfig.use,
    baseURL: process.env['PLAYWRIGHT_ADMIN_BASE_URL'] ?? 'http://localhost:3002',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...browserChannelUse(),
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
      env: coreApiEnv({
        NODE_ENV: process.env['NODE_ENV'] ?? 'test',
        PLUGIN_DB_SSL_MODE: 'disable',
        PLUGIN_CREDENTIAL_PEPPER: credentialPepper,
        LOKI_URL: process.env['PLAYWRIGHT_LOKI_URL'] ?? 'http://localhost:3100',
        RATE_LIMIT_MAX: process.env['RATE_LIMIT_MAX'] ?? '100',
        ADMIN_RATE_LIMIT_MAX: process.env['ADMIN_RATE_LIMIT_MAX'] ?? '200',
      }),
    },
    {
      // Admin Vite frontend.
      command: 'pnpm --filter @plexica/admin dev',
      url: 'http://localhost:3002',
      reuseExistingServer: !isCi,
      timeout: 30_000,
      env: {
        PLAYWRIGHT_KEYCLOAK_URL: keycloakUrl(),
      },
    },
  ],
});
