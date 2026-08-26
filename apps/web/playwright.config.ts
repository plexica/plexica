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
  ciRuntimeManifest,
  isCiRuntimeContract,
  MONOREPO_ROOT_ENV_PATH,
  requiredRunValue,
  setFromManifest,
  setDefault,
} from '../../e2e/playwright-base.js';

import { ciRuntimeTenantBase } from './e2e/helpers/tenant-hosts.js';

// Load .env from the monorepo root for local dev. No-ops in CI (file absent).
dotenv.config({ path: MONOREPO_ROOT_ENV_PATH });
const CI_RUNTIME = isCiRuntimeContract();
const RUNTIME_MANIFEST = CI_RUNTIME ? ciRuntimeManifest() : undefined;
const ciValue = (value: string | undefined): string => {
  if (!value) throw new Error('CI runtime manifest is incomplete');
  return value;
};
// Contract-mode bases: manifest ports, canonical tenant host shape. Relative
// navigations, direct API calls and the seeded Keycloak client origin must
// agree on this host (see ciRuntimeTenantBase) — the raw manifest entries
// would break tenant routing (org-error page / INVALID_TENANT_CONTEXT).
const CONTRACT_WEB_BASE = CI_RUNTIME
  ? ciRuntimeTenantBase(ciValue(RUNTIME_MANIFEST?.WEB_E2E_PUBLIC_BASE))
  : undefined;
const CONTRACT_API_BASE = CI_RUNTIME
  ? ciRuntimeTenantBase(ciValue(RUNTIME_MANIFEST?.CORE_API_PUBLIC_BASE))
  : undefined;

const RUN_HINT = 'Use "pnpm --filter web test:e2e:production" for an isolated run.';
const CREDENTIAL_PEPPER = requiredRunValue('PLUGIN_CREDENTIAL_PEPPER', RUN_HINT);
const EVENT_ENCRYPTION_KEY = requiredRunValue('EVENT_KEY_ENCRYPTION_KEY', RUN_HINT);
const PLUGIN_DB_ENCRYPTION_VALUE = requiredRunValue('PLUGIN_DB_ENCRYPTION_KEY', RUN_HINT);
// Trust never comes from the host system bundle: CI-runtime host processes use
// the NODE_EXTRA_CA_CERTS / SSL_CERT_FILE exports, and Core runs containerized
// with the project CA mounted at CI_RUNTIME_CA_FILE (see ci-runtime-env.sh).
const PLUGIN_DB_CA_PATH = CI_RUNTIME
  ? process.env['PLUGIN_DB_SSL_ROOT_CERT_PATH'] ??
    (process.env['E2E_POSTGRES_TLS_SOURCE']
      ? `${process.env['E2E_POSTGRES_TLS_SOURCE']}/postgres-ca.crt`
      : '')
  : requiredRunValue('PLUGIN_DB_SSL_ROOT_CERT_PATH', RUN_HINT);

// ── Hardcoded E2E defaults ────────────────────────────────────────────────────
// These values match what global-setup.ts provisions. Setting them here (not in
// globalSetup) ensures test workers read them from process.env. Inline defaults
// in test files (e.g. `?? ''`) then evaluate to these values, making hasKeycloak
// always true and ensuring Constitution Rule 1 is enforced (no silent skips).

// Global setup runs provisioning CLIs before web servers. Share run-scoped
// secrets with those CLIs; the core webServer still overrides TLS mode below.
setDefault('EVENT_KEY_ENCRYPTION_KEY', EVENT_ENCRYPTION_KEY);
setDefault('PLUGIN_DB_ENCRYPTION_KEY', PLUGIN_DB_ENCRYPTION_VALUE);
setDefault('PLUGIN_CREDENTIAL_PEPPER', CREDENTIAL_PEPPER);
setDefault('PLUGIN_DB_SSL_MODE', 'verify-full');
if (CI_RUNTIME) {
  setFromManifest('PLAYWRIGHT_KEYCLOAK_URL', ciValue(RUNTIME_MANIFEST?.KEYCLOAK_HOST_ADMIN_BASE));
  setFromManifest('PLAYWRIGHT_BASE_URL', CONTRACT_WEB_BASE ?? '');
  setFromManifest('PLAYWRIGHT_API_URL', CONTRACT_API_BASE ?? '');
  setFromManifest('PLAYWRIGHT_LOKI_URL', ciValue(RUNTIME_MANIFEST?.LOKI_HOST_URL));
  setFromManifest('PLAYWRIGHT_MAILPIT_URL', ciValue(RUNTIME_MANIFEST?.MAILPIT_UI_BASE));
} else {
  setDefault('PLAYWRIGHT_KEYCLOAK_URL', 'http://localhost:8080');
  setDefault('PLAYWRIGHT_BASE_URL', 'http://e2e.localhost:3000');
  setDefault('PLAYWRIGHT_API_URL', 'http://e2e.localhost:3001');
  setDefault('PLAYWRIGHT_LOKI_URL', 'http://localhost:3100');
  setDefault('PLAYWRIGHT_MAILPIT_URL', 'http://localhost:8025');
}
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
    baseURL: CI_RUNTIME ? CONTRACT_WEB_BASE : process.env['PLAYWRIGHT_BASE_URL'],
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
  webServer: CI_RUNTIME ? [] : [
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
        EVENT_KEY_ENCRYPTION_KEY: EVENT_ENCRYPTION_KEY,
        PLUGIN_DB_ENCRYPTION_KEY: PLUGIN_DB_ENCRYPTION_VALUE,
        PLUGIN_DB_SSL_MODE: 'verify-full',
        PLUGIN_DB_SSL_ROOT_CERT_PATH: PLUGIN_DB_CA_PATH,
        PLUGIN_DB_HOST: process.env['PLUGIN_DB_HOST'] ?? 'postgres',
        PLUGIN_DB_PORT: process.env['PLUGIN_DB_PORT'] ?? '5432',
        PLUGIN_DOCKER_NETWORK: requiredRunValue('PLUGIN_DOCKER_NETWORK', RUN_HINT),
        PLUGIN_CORE_API_URL:
          process.env['PLUGIN_CORE_API_URL'] ?? 'http://host.docker.internal:3001',
        PLUGIN_RUNTIME_SCOPE: requiredRunValue('PLUGIN_RUNTIME_SCOPE', RUN_HINT),
        PLUGIN_CREDENTIAL_PEPPER: CREDENTIAL_PEPPER,
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
