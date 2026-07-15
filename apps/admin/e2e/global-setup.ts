// global-setup.ts
// Playwright globalSetup for the admin app E2E suite.
//
// Runs ONCE before any test worker starts (and before webServers start).
// Responsibilities:
//   1. Wait for Keycloak readiness (master realm endpoint).
//   2. Call Keycloak admin REST API to ensure:
//      a. The `e2e-admin-api` dedicated public client exists in the master realm
//         (directAccessGrantsEnabled + fullScopeAllowed for role-bearing tokens).
//      b. The `super_admin` realm-level role exists in the master realm.
//      c. The admin user is assigned the `super_admin` role.
//   3. Obtain a token via `e2e-admin-api` client (includes realm_access.roles
//      with `super_admin`). Store it as PLAYWRIGHT_ADMIN_API_TOKEN.
//   4. Also ensure `plexica-web` client exists (for the web E2E suite that
//      runs before admin tests in the same CI job).
//   5. Provision a dedicated E2E tenant via the core-api CLI.
//
// NOTE: We use a dedicated `e2e-admin-api` client (not `admin-cli`) because
// `admin-cli` does not include `realm_access.roles` in its tokens even when
// users have realm roles assigned (a Keycloak built-in behavior). Custom
// public clients with directAccessGrantsEnabled + fullScopeAllowed include
// realm roles through Keycloak's default "roles" client scope mappers.

import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import * as url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const KEYCLOAK_URL = process.env['KEYCLOAK_URL'] ?? 'http://localhost:8080';
const ADMIN_USER = process.env['KEYCLOAK_ADMIN_USER'] ?? 'admin';
const ADMIN_PASSWORD = process.env['KEYCLOAK_ADMIN_PASSWORD'] ?? 'changeme';

const TENANT_SLUG = process.env['PLAYWRIGHT_ADMIN_E2E_TENANT_SLUG'] ?? 'e2e-admin';
const TENANT_NAME = process.env['PLAYWRIGHT_ADMIN_E2E_TENANT_NAME'] ?? 'E2E Admin';
const TENANT_EMAIL = process.env['PLAYWRIGHT_ADMIN_E2E_TENANT_EMAIL'] ?? 'admin@e2e-admin.local';

// Absolute path to the core-api source root (monorepo layout).
const CORE_API_DIR = path.resolve(__dirname, '../../../services/core-api');
const TSX_BIN = path.resolve(CORE_API_DIR, 'node_modules/.bin/tsx');

// ---- Helpers ---------------------------------------------------------------

async function waitForKeycloak(retries = 30, delayMs = 2000): Promise<void> {
  const probeUrl = `${KEYCLOAK_URL}/realms/master`;
  for (let i = 1; i <= retries; i++) {
    try {
      const res = await fetch(probeUrl, { signal: AbortSignal.timeout(5000) });
      if (res.ok) return;
    } catch {
      /* not ready yet */
    }
    process.stdout.write(
      `[admin global-setup] Waiting for Keycloak at ${KEYCLOAK_URL} (attempt ${i}/${retries})…\n`
    );
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`Keycloak at ${KEYCLOAK_URL} not ready after ${retries} retries`);
}

/**
 * Gets a Keycloak admin token via the built-in `admin-cli` client.
 * This token is used ONLY for Keycloak admin REST API calls (creating clients,
 * roles, assigning roles). It is NOT used as a bearer token for core-api
 * admin endpoints because `admin-cli` tokens lack `realm_access.roles`.
 */
async function getKeycloakAdminToken(): Promise<string> {
  const res = await fetch(`${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: ADMIN_USER,
      password: ADMIN_PASSWORD,
    }).toString(),
  });
  if (!res.ok) {
    throw new Error(`Keycloak admin token fetch failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function adminFetch(
  token: string,
  apiPath: string,
  method: string,
  body?: unknown
): Promise<Response> {
  return fetch(`${KEYCLOAK_URL}${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

/**
 * Ensures the `plexica-web` OIDC public client exists in the master realm.
 * This client must have `directAccessGrantsEnabled: true` so that password
 * grant tokens include `realm_access.roles`. Idempotent: 409 is success.
 */
async function ensurePlexicaWebClient(token: string): Promise<void> {
  const res = await adminFetch(token, '/admin/realms/master/clients', 'POST', {
    clientId: 'plexica-web',
    protocol: 'openid-connect',
    publicClient: true,
    standardFlowEnabled: true,
    directAccessGrantsEnabled: true,
    redirectUris: ['http://localhost:3000/*'],
    webOrigins: ['http://localhost:3000'],
  });
  if (res.ok || res.status === 409) {
    process.stdout.write('[admin global-setup] plexica-web client ensured in master realm.\n');
  } else {
    process.stderr.write(
      `[admin global-setup] Warning: could not create plexica-web client in master realm: ${res.status}\n`
    );
  }
}

/**
 * Creates the `super_admin` realm-level role in the given realm (idempotent)
 * and assigns it to the specified user. The requireSuperAdmin middleware
 * checks `user.roles.includes('super_admin')`, which reads from the JWT's
 * `realm_access.roles` claim. This only works if the user has a realm-level
 * role, not a client-level role.
 */
async function ensureSuperAdminForUser(
  adminToken: string,
  realm: string,
  username: string,
): Promise<void> {
  // 1. Create the super_admin realm role if it doesn't exist.
  const createRoleRes = await adminFetch(
    adminToken,
    `/admin/realms/${realm}/roles`,
    'POST',
    { name: 'super_admin', description: 'Super administrator — full platform access' },
  );
  if (!createRoleRes.ok && createRoleRes.status !== 409) {
    process.stderr.write(
      `[admin global-setup] Warning: could not create super_admin role in ${realm}: ${createRoleRes.status}\n`
    );
    return;
  }

  // 2. Find the user.
  const lookupRes = await adminFetch(
    adminToken,
    `/admin/realms/${realm}/users?username=${encodeURIComponent(username)}&exact=true`,
    'GET',
  );
  if (!lookupRes.ok) {
    process.stderr.write(
      `[admin global-setup] Warning: could not look up user ${username} in ${realm}: ${lookupRes.status}\n`
    );
    return;
  }
  const users = (await lookupRes.json()) as Array<{ id: string }>;
  const userId = users[0]?.id;
  if (userId === undefined) {
    process.stderr.write(`[admin global-setup] Warning: user ${username} not found in ${realm}\n`);
    return;
  }

  // 3. Resolve the role representation for the role-mapping POST.
  const roleRes = await adminFetch(
    adminToken,
    `/admin/realms/${realm}/roles/super_admin`,
    'GET',
  );
  if (!roleRes.ok) {
    process.stderr.write(
      `[admin global-setup] Warning: super_admin role not found after creation: ${roleRes.status}\n`
    );
    return;
  }
  const role = (await roleRes.json()) as { id: string; name: string };

  // 4. Assign the super_admin role to the user (idempotent).
  const mapRes = await adminFetch(
    adminToken,
    `/admin/realms/${realm}/users/${userId}/role-mappings/realm`,
    'POST',
    [{ id: role.id, name: role.name }],
  );
  if (mapRes.ok || mapRes.status === 204) {
    process.stdout.write(
      `[admin global-setup] super_admin role assigned to ${username} in ${realm}.\n`
    );
  } else {
    process.stderr.write(
      `[admin global-setup] Warning: could not assign super_admin to ${username}: ${mapRes.status}\n`
    );
  }
}

// ---- Tenant provisioning ---------------------------------------------------

/**
 * Provisions the E2E tenant via the core-api CLI. Idempotent — 409 / unique
 * constraint violations are treated as success so re-runs are safe.
 */
function provisionE2eTenant(): void {
  process.stdout.write(
    `[admin global-setup] Provisioning E2E tenant (slug: ${TENANT_SLUG})…\n`
  );
  const result = spawnSync(
    TSX_BIN,
    ['src/cli/create-tenant.ts', '--slug', TENANT_SLUG, '--name', TENANT_NAME, '--admin-email', TENANT_EMAIL],
    { cwd: CORE_API_DIR, env: process.env, encoding: 'utf8', timeout: 60_000 }
  );
  if (result.error !== undefined) {
    throw new Error(`Failed to spawn tsx for tenant ${TENANT_SLUG}: ${String(result.error)}`);
  }
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  if (result.status === 0) {
    process.stdout.write(`[admin global-setup] Tenant ${TENANT_SLUG} provisioned.\n`);
    return;
  }
  if (
    stderr.includes('already exists') ||
    stderr.includes('P2002') ||
    stderr.includes('unique constraint') ||
    stdout.includes('already exists') ||
    stdout.includes('P2002')
  ) {
    process.stdout.write(`[admin global-setup] Tenant ${TENANT_SLUG} already exists — skipping.\n`);
    return;
  }
  process.stderr.write(`[admin global-setup] stdout: ${stdout}\n`);
  process.stderr.write(`[admin global-setup] stderr: ${stderr}\n`);
  throw new Error(`Tenant provisioning failed for ${TENANT_SLUG} (exit ${String(result.status)})`);
}

// ---- Setup entry point -----------------------------------------------------

async function setup(): Promise<void> {
  process.stdout.write('[admin global-setup] Starting admin E2E provisioning…\n');

  await waitForKeycloak();

  // Step 1: Get a Keycloak admin token (via admin-cli) for Keycloak admin API calls.
  process.stdout.write('[admin global-setup] Obtaining Keycloak admin token…\n');
  const adminToken = await getKeycloakAdminToken();

  // Step 2: Ensure plexica-web client exists in master realm.
  await ensurePlexicaWebClient(adminToken);

  // Step 3: Ensure the admin user has the super_admin realm-level role.
  await ensureSuperAdminForUser(adminToken, 'master', ADMIN_USER);

  // Step 4: Create (or skip) a dedicated `e2e-admin-api` client in master realm.
  //   We cannot use `admin-cli` tokens because they don't include
  //   `realm_access.roles` (even with fullScopeAllowed: true). A custom public
  //   client with directAccessGrantsEnabled: true includes realm roles by
  //   default through Keycloak's "roles" client scope protocol mappers.
  process.stdout.write('[admin global-setup] Creating e2e-admin-api client…\n');
  const createRes = await adminFetch(
    adminToken, '/admin/realms/master/clients', 'POST', {
      clientId: 'e2e-admin-api',
      protocol: 'openid-connect',
      publicClient: true,
      standardFlowEnabled: false,
      directAccessGrantsEnabled: true,
      fullScopeAllowed: true,
      redirectUris: [],
      webOrigins: [],
    },
  );
  if (createRes.ok || createRes.status === 409) {
    process.stdout.write('[admin global-setup] e2e-admin-api client ready.\n');
  } else {
    process.stderr.write(
      `[admin global-setup] Warning: could not create e2e-admin-api client: ${createRes.status}\n`
    );
  }

  // Step 5: Get a fresh API token via e2e-admin-api client.
  //   This token should include realm_access.roles: ["super_admin"] because
  //   it's a public client with directAccessGrantsEnabled: true and
  //   fullScopeAllowed: true.
  process.stdout.write('[admin global-setup] Obtaining fresh API token via e2e-admin-api…\n');
  const apiRes = await fetch(`${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'e2e-admin-api',
      username: ADMIN_USER,
      password: ADMIN_PASSWORD,
    }).toString(),
  });
  if (!apiRes.ok) {
    throw new Error(`API token fetch failed: ${apiRes.status} ${await apiRes.text()}`);
  }
  const apiData = (await apiRes.json()) as { access_token: string };
  const apiToken = apiData.access_token;
  process.env['PLAYWRIGHT_ADMIN_API_TOKEN'] = apiToken;

  // DEBUG: decode the JWT to verify its contents.
  try {
    const parts = apiToken.split('.');
    const payload = JSON.parse(Buffer.from(parts[1] ?? '', 'base64url').toString('utf8'));
    process.stdout.write(
      `[admin global-setup] DEBUG: token iss=${String(payload['iss'])} aud=${JSON.stringify(payload['aud'])} realm=${String(payload['iss'] ?? '').match(/\/realms\/([^/]+)$/)?.[1] ?? 'unknown'} roles=${JSON.stringify((payload['realm_access'] as { roles?: string[] } | undefined)?.roles ?? [])}\n`
    );
  } catch (e) {
    process.stderr.write(`[admin global-setup] DEBUG: failed to decode JWT: ${String(e)}\n`);
  }

  // Step 6: Provision the E2E tenant for test data.
  provisionE2eTenant();

  process.stdout.write('[admin global-setup] Admin E2E provisioning complete.\n');
}

export default setup;
