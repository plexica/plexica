// global-setup.ts
// Playwright globalSetup — provisions E2E test tenants and Keycloak users.
//
// Runs ONCE before any test worker starts (and before webServers start).
// Strategy:
//   1. Invoke the core-api CLI directly via `spawnSync tsx` to create each tenant.
//      Using tsx directly (not pnpm exec) avoids the dotenv-cli wrapper that
//      requires a .env file — env vars come from process.env, which is already
//      populated by CI (job-level `env:` block) or by dotenv.config() in
//      playwright.config.ts (local dev).
//   2. Call the Keycloak Admin REST API directly (fetch) to add test users.
//      This does not require the core-api HTTP server to be running yet.
//   3. Set the login theme to 'plexica' with a render probe fallback — if the
//      JAR is not deployed or the FTL template crashes, falls back to default.
//      Build the JAR first: pnpm --filter @plexica/keycloak-theme build
//
// Idempotent: 409 responses are treated as "already exists" and the password
// is reset to the known test value so re-runs after partial failures are safe.
//
// Users provisioned:
//   Tenant e2e  (realm plexica-e2e):
//     test@e2e.local          / PlexicaE2e!1   firstName=E2E lastName=User  (regular user)
//     force-pwd@e2e.local     / ForcePwd!1     (UPDATE_PASSWORD required action)
//     force-profile@e2e.local / ForceProfile!1 (UPDATE_PROFILE required action)
//
//   Tenant e2e-b (realm plexica-e2e-b):
//     test@e2e.local          / PlexicaE2e!1   (for cross-tenant isolation tests)

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';

import { getAdminToken, upsertUser, setRealmPlexicaTheme } from './keycloak-admin-client.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// Marker file written after theme probe — read by theme spec files to skip
// tests that require the Plexica custom theme when it is not active.
// Path: apps/web/e2e/.e2e-plexica-theme-active ('1' = active, '0' = fallback)
const THEME_MARKER_PATH = path.resolve(__dirname, '.e2e-plexica-theme-active');

// Absolute path to the core-api source root (monorepo layout)
const CORE_API_DIR = path.resolve(__dirname, '../../../services/core-api');
// tsx binary lives in core-api's own node_modules (it's a devDependency there)
const TSX_BIN = path.resolve(CORE_API_DIR, 'node_modules/.bin/tsx');

// ---------------------------------------------------------------------------
// Tenant provisioning via CLI
// ---------------------------------------------------------------------------

function provisionTenant(slug: string, name: string, adminEmail: string): void {
  process.stdout.write(`[global-setup] Provisioning tenant "${name}" (slug: ${slug})…\n`);

  const result = spawnSync(
    TSX_BIN,
    ['src/cli/create-tenant.ts', '--slug', slug, '--name', name, '--admin-email', adminEmail],
    {
      cwd: CORE_API_DIR,
      env: process.env,
      encoding: 'utf8',
      // 60s is generous — schema creation + Keycloak realm + MinIO bucket
      timeout: 60_000,
    }
  );

  if (result.error !== undefined) {
    throw new Error(`Failed to spawn tsx for tenant ${slug}: ${String(result.error)}`);
  }

  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';

  if (result.status === 0) {
    process.stdout.write(`[global-setup] Tenant ${slug} provisioned successfully.\n`);
    return;
  }

  // Idempotency: if the tenant already exists (unique constraint violation),
  // treat as success — the tenant was already provisioned from a previous run.
  if (
    stderr.includes('already exists') ||
    stderr.includes('P2002') ||
    stderr.includes('unique constraint') ||
    stdout.includes('already exists') ||
    stdout.includes('P2002')
  ) {
    process.stdout.write(`[global-setup] Tenant ${slug} already exists — skipping.\n`);
    return;
  }

  process.stderr.write(`[global-setup] stdout: ${stdout}\n`);
  process.stderr.write(`[global-setup] stderr: ${stderr}\n`);
  throw new Error(`Tenant provisioning failed for ${slug} (exit ${String(result.status)})`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function setup(): Promise<void> {
  process.stdout.write('[global-setup] Starting E2E environment provisioning…\n');

  // ── 1. Provision tenants ──────────────────────────────────────────────────
  provisionTenant('e2e', 'E2E', 'admin@e2e.local');
  provisionTenant('e2e-b', 'E2E-B', 'admin@e2e-b.local');

  // ── 2. Add test users via Keycloak Admin REST API ─────────────────────────
  process.stdout.write('[global-setup] Obtaining Keycloak admin token…\n');
  const token = await getAdminToken();

  // Realm names must match what tenant-provisioning.ts generates:
  //   toRealmName(slug) = "plexica-" + slug
  const REALM_A = 'plexica-e2e';
  const REALM_B = 'plexica-e2e-b';

  process.stdout.write(`[global-setup] Configuring realms and creating test users…\n`);

  // Set login theme with render-probe fallback (see keycloak-admin-client.ts).
  // The 'plexica' theme may crash at render time in CI if the JAR was built with
  // a different Keycloak data model. The probe detects this and uses the default.
  // Both realms must agree — theme is active only if it works on both.
  const themeActiveA = await setRealmPlexicaTheme(token, REALM_A);
  const themeActiveB = await setRealmPlexicaTheme(token, REALM_B);
  const plexicaThemeActive = themeActiveA && themeActiveB;

  // Write marker file so spec files can skip theme-specific tests instantly
  // instead of waiting for each assertion to time out at 10 s.
  fs.writeFileSync(THEME_MARKER_PATH, plexicaThemeActive ? '1' : '0', 'utf8');
  process.stdout.write(
    `[global-setup] Plexica theme active: ${String(plexicaThemeActive)} (marker written).\n`
  );

  // Regular test user (used by login-flow, logout, shell-a11y, sidebar-drawer,
  // error-boundary, session-expiry, keycloak-theme branding tests)
  await upsertUser(token, REALM_A, {
    username: 'test@e2e.local',
    email: 'test@e2e.local',
    firstName: 'E2E',
    lastName: 'User',
    password: 'PlexicaE2e!1',
  });

  // Force-password user (used by keycloak-theme UPDATE_PASSWORD tests)
  await upsertUser(token, REALM_A, {
    username: 'force-pwd@e2e.local',
    email: 'force-pwd@e2e.local',
    password: 'ForcePwd!1',
    requiredActions: ['UPDATE_PASSWORD'],
  });

  // Force-profile user (used by keycloak-theme UPDATE_PROFILE tests)
  await upsertUser(token, REALM_A, {
    username: 'force-profile@e2e.local',
    email: 'force-profile@e2e.local',
    password: 'ForceProfile!1',
    requiredActions: ['UPDATE_PROFILE'],
  });

  // Cross-tenant: same credentials in realm B for isolation tests
  await upsertUser(token, REALM_B, {
    username: 'test@e2e.local',
    email: 'test@e2e.local',
    firstName: 'E2E',
    lastName: 'User',
    password: 'PlexicaE2e!1',
  });

  process.stdout.write('[global-setup] E2E environment provisioning complete.\n');
}

export default setup;
