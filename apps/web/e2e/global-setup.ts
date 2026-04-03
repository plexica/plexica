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
//   3. Set the login theme to 'plexica' (falls back to '' if JAR not deployed).
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
import * as path from 'node:path';
import * as url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// Absolute path to the core-api source root (monorepo layout)
const CORE_API_DIR = path.resolve(__dirname, '../../../services/core-api');
// tsx binary lives in core-api's own node_modules (it's a devDependency there)
const TSX_BIN = path.resolve(CORE_API_DIR, 'node_modules/.bin/tsx');

const KEYCLOAK_URL = process.env['KEYCLOAK_URL'] ?? 'http://localhost:8080';
const KEYCLOAK_ADMIN_USER = process.env['KEYCLOAK_ADMIN_USER'] ?? 'admin';
const KEYCLOAK_ADMIN_PASSWORD = process.env['KEYCLOAK_ADMIN_PASSWORD'] ?? 'changeme';

// ---------------------------------------------------------------------------
// Keycloak Admin REST API helpers
// ---------------------------------------------------------------------------

interface AdminToken {
  access_token: string;
  expires_in: number;
}

async function getAdminToken(): Promise<string> {
  const res = await fetch(`${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: KEYCLOAK_ADMIN_USER,
      password: KEYCLOAK_ADMIN_PASSWORD,
    }).toString(),
  });
  if (!res.ok) {
    throw new Error(`Keycloak admin token fetch failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as AdminToken;
  return data.access_token;
}

async function adminFetch(
  token: string,
  path: string,
  method: string,
  body?: unknown
): Promise<Response> {
  return fetch(`${KEYCLOAK_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

interface KeycloakUser {
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  password: string;
  requiredActions?: string[];
}

/**
 * Creates (or resets the password of) a Keycloak user in the given realm.
 * Handles 409 (already exists) by looking up the existing user and resetting
 * their password — so the setup is idempotent and safe after volume wipes.
 */
async function upsertUser(token: string, realm: string, user: KeycloakUser): Promise<void> {
  const userPayload: Record<string, unknown> = {
    username: user.username,
    email: user.email,
    enabled: true,
    emailVerified: true,
    ...(user.firstName !== undefined ? { firstName: user.firstName } : {}),
    ...(user.lastName !== undefined ? { lastName: user.lastName } : {}),
    ...(user.requiredActions !== undefined ? { requiredActions: user.requiredActions } : {}),
    credentials: [{ type: 'password', value: user.password, temporary: false }],
  };

  const createRes = await adminFetch(token, `/admin/realms/${realm}/users`, 'POST', userPayload);

  if (createRes.status === 201) {
    // Created successfully
    return;
  }

  if (createRes.status === 409) {
    // User already exists — look up their ID and reset password
    const lookupRes = await adminFetch(
      token,
      `/admin/realms/${realm}/users?username=${encodeURIComponent(user.username)}&exact=true`,
      'GET'
    );
    if (!lookupRes.ok) {
      throw new Error(
        `Failed to look up existing user ${user.username} in realm ${realm}: ${lookupRes.status}`
      );
    }
    const users = (await lookupRes.json()) as Array<{ id: string }>;
    const userId = users[0]?.id;
    if (userId === undefined) {
      throw new Error(`User ${user.username} reported as 409 but not found in lookup`);
    }

    // Reset password to known value
    const resetRes = await adminFetch(
      token,
      `/admin/realms/${realm}/users/${userId}/reset-password`,
      'PUT',
      { type: 'password', value: user.password, temporary: false }
    );
    if (!resetRes.ok) {
      throw new Error(
        `Failed to reset password for ${user.username} in realm ${realm}: ${resetRes.status}`
      );
    }

    // Update profile fields (firstName, lastName) and re-apply required actions.
    // This ensures idempotency when the user was created in a previous run without
    // these fields (e.g. before lastName was added). Without lastName, Keycloak
    // shows the "Update Account Information" form after login, blocking OIDC redirect.
    const profileUpdate: Record<string, unknown> = {};
    if (user.firstName !== undefined) profileUpdate['firstName'] = user.firstName;
    if (user.lastName !== undefined) profileUpdate['lastName'] = user.lastName;
    if (user.requiredActions !== undefined) profileUpdate['requiredActions'] = user.requiredActions;

    if (Object.keys(profileUpdate).length > 0) {
      const updateRes = await adminFetch(
        token,
        `/admin/realms/${realm}/users/${userId}`,
        'PUT',
        profileUpdate
      );
      if (!updateRes.ok) {
        // Non-fatal — log but don't block
        process.stderr.write(
          `[global-setup] Warning: could not update profile for ${user.username}: ${updateRes.status}\n`
        );
      }
    }
    return;
  }

  throw new Error(
    `Failed to create user ${user.username} in realm ${realm}: ${createRes.status} ${await createRes.text()}`
  );
}

/**
 * Sets the Keycloak realm login theme to 'plexica' (the custom Plexica theme).
 * Falls back to '' (default Keycloak theme) if the Plexica theme is not available
 * (e.g. before the JAR is built in local dev) to ensure login tests still pass.
 *
 * keycloak-theme.spec.ts tests the custom theme's branded elements (.auth-card, etc.)
 * and only passes when the plexica theme is active. In CI, the theme is built before E2E.
 * Locally, run `pnpm --filter @plexica/keycloak-theme build` first.
 */
async function setRealmPlexicaTheme(token: string, realm: string): Promise<void> {
  // Try to set 'plexica' theme. Keycloak validates the theme name exists before accepting.
  const setRes = await adminFetch(token, `/admin/realms/${realm}`, 'PUT', {
    loginTheme: 'plexica',
  });
  if (setRes.ok) {
    process.stdout.write(`[global-setup] Realm ${realm}: loginTheme set to 'plexica'.\n`);
    return;
  }
  // Theme not available — Keycloak returns 400 if the theme name is unknown.
  // Fall back to the default theme so login tests can still run.
  process.stdout.write(
    `[global-setup] Warning: 'plexica' theme not available (${String(setRes.status)}), falling back to default theme for realm ${realm}.\n`
  );
  const fallbackRes = await adminFetch(token, `/admin/realms/${realm}`, 'PUT', {
    loginTheme: '',
  });
  if (!fallbackRes.ok) {
    process.stderr.write(
      `[global-setup] Warning: could not reset loginTheme for realm ${realm}: ${String(fallbackRes.status)}\n`
    );
  }
}

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

  // Exit code 0 = success; non-zero = failure
  // We treat a specific "already exists" message as idempotent success.
  // The CLI writes to stdout/stderr — check for the success marker.
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';

  if (result.status === 0) {
    process.stdout.write(`[global-setup] Tenant ${slug} provisioned successfully.\n`);
    return;
  }

  // Idempotency: if the tenant already exists (unique constraint violation),
  // treat as success — the tenant was already provisioned from a previous run.
  // Prisma / PostgreSQL will throw P2002 (unique constraint) or the slug will
  // already be in the core.tenants table.
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

  // Real failure
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
  // Tenant A: primary E2E tenant (used by most test suites)
  provisionTenant('e2e', 'E2E', 'admin@e2e.local');

  // Tenant B: secondary tenant (used only by cross-tenant isolation tests)
  provisionTenant('e2e-b', 'E2E-B', 'admin@e2e-b.local');

  // ── 2. Add test users via Keycloak Admin REST API ─────────────────────────
  process.stdout.write('[global-setup] Obtaining Keycloak admin token…\n');
  const token = await getAdminToken();

  // Realm names must match what tenant-provisioning.ts generates:
  //   toRealmName(slug) = "plexica-" + slug
  const REALM_A = 'plexica-e2e';
  const REALM_B = 'plexica-e2e-b';

  process.stdout.write(`[global-setup] Creating test users in realm ${REALM_A}…\n`);

  // Reset login theme to default — the 'plexica' theme set by tenant-provisioning.ts
  // may fail with a FreeMarker parse error if the theme JAR is not deployed or has
  // template errors. Use the default Keycloak theme so login tests pass reliably.
  // keycloak-theme.spec.ts tests the plexica theme specifically; those tests need
  // the JAR to be built and deployed (handled separately in CI).
  await setRealmPlexicaTheme(token, REALM_A);
  await setRealmPlexicaTheme(token, REALM_B);

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

  process.stdout.write(`[global-setup] Creating test users in realm ${REALM_B}…\n`);

  // Cross-tenant: same credentials in realm B so the isolation test
  // can log in as tenant A user and then try tenant B resources
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
