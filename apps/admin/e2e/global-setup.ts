// global-setup.ts
// Playwright globalSetup for the admin app E2E suite.
//
// Runs ONCE before any test worker starts (and before webServers start).
// Responsibilities:
//   1. Wait for Keycloak readiness (master realm endpoint).
//   2. Call Keycloak admin REST API to ensure:
//      a. The admin user is assigned the `super_admin` realm-level role.
//      b. The `plexica-web` OIDC public client exists in the master realm.
//      c. The built-in `account` client has directAccessGrantsEnabled.
//   3. Obtain a token via the `account` client (which includes
//      realm_access.roles because it has the "roles" default client scope).
//      Store it as PLAYWRIGHT_ADMIN_API_TOKEN for test workers.
//   4. Provision a dedicated E2E tenant via the core-api CLI.
//
// NOTE: process.env mutations from globalSetup DO propagate to Playwright
// test workers, but we use a file-based fallback (e2e-auth-token.json) for
// robustness across process boundaries.

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const KEYCLOAK_URL = process.env['KEYCLOAK_URL'] ?? 'http://localhost:8080';
const ADMIN_USER = process.env['KEYCLOAK_ADMIN_USER'] ?? 'admin';
const ADMIN_PASSWORD = process.env['KEYCLOAK_ADMIN_PASSWORD'] ?? 'changeme';

const TENANT_SLUG = process.env['PLAYWRIGHT_ADMIN_E2E_TENANT_SLUG'] ?? 'e2e-admin';
const TENANT_NAME = process.env['PLAYWRIGHT_ADMIN_E2E_TENANT_NAME'] ?? 'E2E Admin';
const TENANT_EMAIL = process.env['PLAYWRIGHT_ADMIN_E2E_TENANT_EMAIL'] ?? 'admin@e2e-admin.local';

// File path for token sharing across processes.
const TOKEN_FILE = path.resolve(__dirname, 'e2e-auth-token.json');

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
 * Creates the `super_admin` realm-level role and assigns it to the user.
 */
async function ensureSuperAdminForUser(
  adminToken: string,
  realm: string,
  username: string,
): Promise<void> {
  const createRoleRes = await adminFetch(
    adminToken,
    `/admin/realms/${realm}/roles`,
    'POST',
    { name: 'super_admin', description: 'Super administrator — full platform access' },
  );
  if (!createRoleRes.ok && createRoleRes.status !== 409) {
    process.stderr.write(`Warning: could not create super_admin role in ${realm}: ${createRoleRes.status}\n`);
    return;
  }

  const lookupRes = await adminFetch(
    adminToken,
    `/admin/realms/${realm}/users?username=${encodeURIComponent(username)}&exact=true`,
    'GET',
  );
  if (!lookupRes.ok) return;
  const users = (await lookupRes.json()) as Array<{ id: string }>;
  const userId = users[0]?.id;
  if (userId === undefined) return;

  const roleRes = await adminFetch(
    adminToken,
    `/admin/realms/${realm}/roles/super_admin`,
    'GET',
  );
  if (!roleRes.ok) return;
  const role = (await roleRes.json()) as { id: string; name: string };

  const mapRes = await adminFetch(
    adminToken,
    `/admin/realms/${realm}/users/${userId}/role-mappings/realm`,
    'POST',
    [{ id: role.id, name: role.name }],
  );
  if (mapRes.ok || mapRes.status === 204) {
    process.stdout.write(`[admin global-setup] super_admin role assigned to ${username} in ${realm}.\n`);
  }
}

// ---- Tenant provisioning ---------------------------------------------------

function provisionE2eTenant(): void {
  process.stdout.write(`[admin global-setup] Provisioning E2E tenant (slug: ${TENANT_SLUG})…\n`);
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
    stderr.includes('already exists') || stderr.includes('P2002') ||
    stderr.includes('unique constraint') || stdout.includes('already exists') || stdout.includes('P2002')
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

  // Step 1: Get a Keycloak admin token (via admin-cli) for admin API calls.
  process.stdout.write('[admin global-setup] Obtaining Keycloak admin token…\n');
  const adminToken = await getKeycloakAdminToken();

  // Step 2: Ensure plexica-web client exists in master realm.
  await ensurePlexicaWebClient(adminToken);

  // Step 3: Ensure the admin user has the super_admin realm-level role.
  await ensureSuperAdminForUser(adminToken, 'master', ADMIN_USER);

  // Step 4: Create `e2e-admin-api` client with fullScopeAllowed: true.
  //   This is the ONLY configuration we found where the token includes
  //   realm_access.roles (including super_admin) for the Keycloak master
  //   realm. The fullScopeAllowed: true setting causes the token to carry
  //   all realm roles. It also injects all realm client IDs as audience
  //   values, but jose v6 does NOT validate audience when the audience
  //   option is not provided (which is the case for master realm tokens).
  process.stdout.write('[admin global-setup] Creating e2e-admin-api client with fullScopeAllowed: true\n');
  try {
    await adminFetch(adminToken, '/admin/realms/master/clients', 'POST', {
      clientId: 'e2e-admin-api',
      protocol: 'openid-connect',
      publicClient: true,
      standardFlowEnabled: false,
      directAccessGrantsEnabled: true,
      fullScopeAllowed: true,
      redirectUris: [],
      webOrigins: [],
    });
  } catch {
    // 409 is OK — client already exists
  }

  // Step 5: Get a fresh API token via e2e-admin-api client.
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

  // Set token for test workers via process.env AND persist to file.
  process.env['PLAYWRIGHT_ADMIN_API_TOKEN'] = apiToken;
  fs.writeFileSync(TOKEN_FILE, JSON.stringify({ token: apiToken }), 'utf8');
  process.stdout.write(`[admin global-setup] Token persisted to ${TOKEN_FILE}\n`);

  // DEBUG: decode and log the JWT payload.
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