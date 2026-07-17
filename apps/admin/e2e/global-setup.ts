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
// test workers automatically — no file-based fallback needed.

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

  // Step 4: Ensure plexica-admin client is configured correctly and has
  //   fullScopeAllowed: true so its tokens include realm roles.
  process.stdout.write('[admin global-setup] Ensuring plexica-admin client config…\n');
  try {
    const lookupRes = await adminFetch(
      adminToken, '/admin/realms/master/clients?clientId=plexica-admin', 'GET'
    );
    if (!lookupRes.ok) {
      process.stderr.write(`plexica-admin lookup failed: ${lookupRes.status}\n`);
    } else {
      const clients = (await lookupRes.json()) as Array<{ id: string }>;
      const clientUuid = clients[0]?.id;
      if (clientUuid === undefined) {
        // Create the client if it doesn't exist
        const postRes = await adminFetch(adminToken, '/admin/realms/master/clients', 'POST', {
          clientId: 'plexica-admin', protocol: 'openid-connect',
          publicClient: true, directAccessGrantsEnabled: true,
          standardFlowEnabled: false, fullScopeAllowed: true,
          attributes: { 'access.token.lifespan': '86400' },
          redirectUris: ['http://localhost:3002/*'], webOrigins: ['http://localhost:3002'],
        });
        if (!postRes.ok && postRes.status !== 409) {
          throw new Error(`plexica-admin client creation failed: ${postRes.status}`);
        }
      } else {
        const putRes = await adminFetch(adminToken, `/admin/realms/master/clients/${clientUuid}`, 'PUT', {
          publicClient: true, directAccessGrantsEnabled: true,
          standardFlowEnabled: false, fullScopeAllowed: true,
          attributes: { 'access.token.lifespan': '86400' },
          webOrigins: ['http://localhost:3002'], redirectUris: ['http://localhost:3002/*'],
        });
        if (!putRes.ok) {
          throw new Error(`plexica-admin client update failed: ${putRes.status}`);
        }
      }
      process.stdout.write('[admin global-setup] plexica-admin client configured.\n');
    }
  } catch (e) {
    throw new Error(`plexica-admin configuration failed: ${String(e)}`);
  }

  // Step 4.5: Raise the master realm's access token TTL to 24h.
  //   Default is 5 min (300s) which is too short for E2E — the token is
  //   obtained once by globalSetup and shared across all test specs via
  //   process.env. A 5-min TTL causes JWTExpired on later specs.
  process.stdout.write('[admin global-setup] Setting master realm accessTokenLifespan to 86400s…\n');
  try {
    const realmRes = await adminFetch(adminToken, '/admin/realms/master', 'PUT', {
      accessTokenLifespan: 86400,
    });
    if (!realmRes.ok) {
      process.stderr.write(`[admin global-setup] Warning: realm update failed: ${realmRes.status}\n`);
    } else {
      process.stdout.write('[admin global-setup] Master realm accessTokenLifespan set to 86400s.\n');
    }
  } catch (e) {
    process.stderr.write(`[admin global-setup] Warning: could not update realm: ${String(e)}\n`);
  }

  // Step 5: Get the API token via plexica-admin client (which has
  //   fullScopeAllowed: true from the step above, so token includes roles).
  process.stdout.write('[admin global-setup] Obtaining API token via plexica-admin…\n');
  const apiRes = await fetch(`${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'plexica-admin',
      username: ADMIN_USER,
      password: ADMIN_PASSWORD,
    }).toString(),
  });
  if (!apiRes.ok) {
    throw new Error(`API token fetch failed: ${apiRes.status} ${await apiRes.text()}`);
  }
  const apiData = (await apiRes.json()) as { access_token: string };
  const apiToken = apiData.access_token;

  // Set token for test workers via process.env. Playwright propagates env
  // mutations from globalSetup to worker processes automatically.
  process.env['PLAYWRIGHT_ADMIN_API_TOKEN'] = apiToken;

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