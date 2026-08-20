// playwright.config.ts — Playwright configuration for apps/web E2E tests.
// Chromium only. CI uses the preinstalled Google Chrome channel on GitHub
// runners to avoid flaky Playwright browser downloads.
//
// Env loading strategy:
//   Local dev  — dotenv.config() reads the monorepo-root .env. No-ops if absent.
//   CI         — env vars come from the GitHub Actions job-level `env:` block.
//                dotenv.config() silently no-ops (no .env file in CI workspace).
//
// Shared config head/helpers live in ../../e2e/playwright-base.ts. This suite
// intentionally diverges from apps/admin: it runs the PRODUCTION build
// (vite build + preview) with the plugin runtime env and verify-full plugin
// DB TLS. Do not align those parts with admin — see the base file's comment.
//
// Stable PLAYWRIGHT_* defaults are set during config evaluation. Per-run secrets
// are generated later by global setup and propagated to worker environments.

import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

import {
  baseE2eConfig,
  browserChannelUse,
  coreApiEnv,
  keycloakUrl,
  MONOREPO_ROOT_ENV_PATH,
  requiredRunValue,
  setDefault,
} from '../../e2e/playwright-base.js';

// Load .env from the monorepo root for local dev. No-ops in CI (file absent).
dotenv.config({ path: MONOREPO_ROOT_ENV_PATH });

const RUN_HINT = 'Use "pnpm --filter web test:e2e:production" for an isolated run.';
const credentialPepper = requiredRunValue('PLUGIN_CREDENTIAL_PEPPER', RUN_HINT);
const eventEncryptionKey = requiredRunValue('EVENT_KEY_ENCRYPTION_KEY', RUN_HINT);
const pluginDbEncryptionKey = requiredRunValue('PLUGIN_DB_ENCRYPTION_KEY', RUN_HINT);
const pluginDbCaPath = requiredRunValue('PLUGIN_DB_SSL_ROOT_CERT_PATH', RUN_HINT);

// ── Hardcoded E2E defaults ────────────────────────────────────────────────────
// These values match what global-setup.ts provisions. Setting them here (not in
// globalSetup) ensures test workers read them from process.env. Inline defaults
// in test files (e.g. `?? ''`) then evaluate to these values, making hasKeycloak
// always true and ensuring Constitution Rule 1 is enforced (no silent skips).

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

// ── webServer commands ────────────────────────────────────────────────────────
// Always build and start compiled output so local and CI exercise production
// branches (this is the web suite's intentional divergence from admin).
const coreApiCommand = 'pnpm --filter core-api build && pnpm --filter core-api start';
const webCommand =
  'VITE_E2E=true NODE_ENV=production pnpm --filter web build && pnpm --filter web preview';

export default defineConfig({
  ...baseE2eConfig,
  use: {
    ...baseE2eConfig.use,
    baseURL: process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://e2e.localhost:3000',
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
  // CRM is installed by the production API flow and launched by DockerContainerManager.
  webServer: [
    {
      // Core-api backend — required for tenant resolution and auth
      command: coreApiCommand,
      url: 'http://localhost:3001/health',
      reuseExistingServer: false,
      timeout: 60_000,
      env: coreApiEnv({
        // Forward all infra env vars so core-api can connect to services
        NODE_ENV: 'production',
        PORT: '3001',
        NODE_OPTIONS: '--trace-warnings',
        EVENT_KEY_ENCRYPTION_KEY: eventEncryptionKey,
        PLUGIN_DB_ENCRYPTION_KEY: pluginDbEncryptionKey,
        PLUGIN_DB_SSL_MODE: 'verify-full',
        PLUGIN_DB_SSL_ROOT_CERT_PATH: pluginDbCaPath,
        PLUGIN_DB_HOST: process.env['PLUGIN_DB_HOST'] ?? 'postgres',
        PLUGIN_DB_PORT: process.env['PLUGIN_DB_PORT'] ?? '5432',
        PLUGIN_DOCKER_NETWORK: requiredRunValue('PLUGIN_DOCKER_NETWORK', RUN_HINT),
        PLUGIN_CORE_API_URL:
          process.env['PLUGIN_CORE_API_URL'] ?? 'http://host.docker.internal:3001',
        PLUGIN_RUNTIME_SCOPE: requiredRunValue('PLUGIN_RUNTIME_SCOPE', RUN_HINT),
        PLUGIN_CREDENTIAL_PEPPER: credentialPepper,
        APP_URL: 'http://e2e.localhost:3000',
        // Feature tests use isolated proxy IPs, while this high global ceiling
        // prevents unrelated direct API setup calls sharing one CI socket from
        // exhausting the generic budget. Resolve keeps its dedicated limit.
        RATE_LIMIT_MAX: process.env['PLAYWRIGHT_GENERAL_RATE_LIMIT_MAX'] ?? '10000',
        ADMIN_RATE_LIMIT_MAX: process.env['PLAYWRIGHT_GENERAL_RATE_LIMIT_MAX'] ?? '10000',
        RATE_LIMIT_RESOLVE_MAX: process.env['PLAYWRIGHT_RATE_LIMIT_RESOLVE_MAX'] ?? '30',
        // fastify 5.12+ fails closed on numeric hop counts, so '1' no longer
        // trusts the immediate peer. Trust loopback only: the E2E stack runs on
        // the host, so every request's direct peer is localhost and the
        // feature tests' isolated X-Forwarded-For IPs are honoured again.
        TRUST_PROXY: '127.0.0.1,::1,::ffff:127.0.0.1',
        LOKI_URL: process.env['LOKI_URL'] ?? 'http://localhost:3100',
      }),
    },
    {
      // Vite frontend
      command: webCommand,
      url: 'http://localhost:3000',
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        VITE_KEYCLOAK_URL: keycloakUrl(),
        VITE_PLUGIN_ASSET_ORIGIN: requiredRunValue('VITE_PLUGIN_ASSET_ORIGIN', RUN_HINT),
      },
    },
  ],
});
