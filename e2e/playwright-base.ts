// e2e/playwright-base.ts — Shared Playwright configuration for the apps/web
// and apps/admin E2E suites.
//
// SHARED (defined here, do not duplicate in the app configs):
//   - monorepo-root .env path and the setDefault/requiredRunValue helpers
//   - defineConfig() head: testDir, parallelism, retries, workers, timeout,
//     reporter, global setup/teardown
//   - shared `use` options (trace/screenshot/video/timeouts)
//   - PLAYWRIGHT_BROWSER_CHANNEL handling for the chromium project
//   - coreApiEnv(): infra env forwarded to the core-api webServer
//     (DATABASE_URL, Keycloak, Redis, MinIO, Kafka)
//
// INTENTIONALLY PER-APP (defined in each app's playwright.config.ts):
//   - apps/web runs the PRODUCTION build (vite build + preview,
//     NODE_ENV=production, plugin runtime env, verify-full plugin DB TLS);
//     apps/admin runs the DEV server (vite dev, core-api via tsx watch
//     locally). The two suites exercise different code paths — do NOT align.
//   - use.baseURL, webServer commands and reuseExistingServer, rate limits.
//
// This file must NOT import external packages (@playwright/test, dotenv):
// the root e2e/ directory has no node_modules, so external imports would fail
// to resolve from here. Those imports stay in each app's config file (dotenv,
// defineConfig, devices); type-checking of the merged config happens at the
// defineConfig() call sites. Values below therefore use structural types
// (ReporterEntry, `as const` literals) instead of @playwright/test types.

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const e2eDir = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path of the monorepo-root .env (loaded by each app config via dotenv). */
export const MONOREPO_ROOT_ENV_PATH = path.resolve(e2eDir, '../.env');

/** Set an env var only when it is unset or empty. */
export function setDefault(key: string, value: string): void {
  if (process.env[key] === undefined || process.env[key] === '') {
    process.env[key] = value;
  }
}

/** Read a mandatory run-scoped env var, failing fast with an actionable hint. */
export function requiredRunValue(key: string, hint?: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(hint === undefined ? `${key} is required.` : `${key} is required. ${hint}`);
  }
  return value;
}

/** Keycloak URL shared by both suites. Call after the setDefault() block. */
export function keycloakUrl(): string {
  return process.env['PLAYWRIGHT_KEYCLOAK_URL'] ?? 'http://localhost:8080';
}

/**
 * Env forwarded to the core-api webServer so it can reach infra services.
 * `overrides` carries the app-specific extras (NODE_ENV/PORT, plugin runtime,
 * rate limits, TLS mode) that must stay divergent between web and admin.
 */
export function coreApiEnv(overrides: Record<string, string>): Record<string, string> {
  return {
    DATABASE_URL:
      process.env['DATABASE_URL'] ?? 'postgresql://plexica:changeme@localhost:5432/plexica',
    KEYCLOAK_URL: keycloakUrl(),
    KEYCLOAK_ADMIN_USER: process.env['KEYCLOAK_ADMIN_USER'] ?? 'admin',
    KEYCLOAK_ADMIN_PASSWORD: process.env['KEYCLOAK_ADMIN_PASSWORD'] ?? 'changeme',
    REDIS_URL: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
    MINIO_ENDPOINT: process.env['MINIO_ENDPOINT'] ?? 'http://localhost:9000',
    MINIO_ACCESS_KEY: process.env['MINIO_ACCESS_KEY'] ?? 'minioadmin',
    MINIO_SECRET_KEY: process.env['MINIO_SECRET_KEY'] ?? 'changeme',
    KAFKA_BROKERS: process.env['KAFKA_BROKERS'] ?? 'localhost:19092',
    ...overrides,
  };
}

/** PLAYWRIGHT_BROWSER_CHANNEL override for the chromium project (CI uses Chrome). */
export function browserChannelUse(): { channel?: string } {
  const channel = process.env['PLAYWRIGHT_BROWSER_CHANNEL'];
  return channel === undefined ? {} : { channel };
}

// Structural stand-in for @playwright/test ReporterDescription (see header).
type ReporterEntry = [string] | [string, Record<string, unknown>];

const isCi = process.env['CI'] !== undefined;

/**
 * Shared defineConfig() head. Each app spreads this and adds its own
 * use.baseURL, projects (with `devices` from @playwright/test) and webServer
 * blocks — see the header comment for what intentionally stays per-app.
 */
export const baseE2eConfig = {
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  // Decision 10 (2026-08-19): read-only spec files opt into parallel mode via
  // test.describe.configure({ mode: 'parallel' }) — intra-file parallelism only.
  // workers default to 1: files would race on the shared tenant/DB/realm state.
  // Override via PLAYWRIGHT_WORKERS env when per-worker tenant isolation is in
  // place (Decision 10's deferred gate — see global-setup.ts provisionPerWorker).
  workers: process.env['PLAYWRIGHT_WORKERS'] ? Number(process.env['PLAYWRIGHT_WORKERS']) : 1,
  timeout: 30_000,
  // Stop the suite early after N failures instead of grinding through the
  // remaining ~150 tests when a systemic failure (timeout, auth outage, etc.)
  // is detected. 10 failures in CI is conclusive — no need to waste the budget.
  maxFailures: isCi ? 10 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ] as ReporterEntry[],
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    trace: 'on-first-retry' as const,
    screenshot: 'only-on-failure' as const,
    video: 'on-first-retry' as const,
    navigationTimeout: 30_000,
    actionTimeout: 10_000,
  },
};
