// global-setup.ts
// Playwright globalSetup for the admin app E2E suite.
//
// Runs ONCE before any test worker starts (and before webServers start).
// Responsibilities:
//   1. Wait for Keycloak readiness (master realm endpoint).
//   2. Obtain a super-admin token from the Keycloak master realm via the
//      `admin-cli` direct password grant. Store it in process.env so test
//      workers (and api-client.ts) can read it.
//   3. Provision a dedicated E2E tenant via the core-api CLI so admin
//      tenant-lifecycle / list / detail tests have stable data. Idempotent.
//
// The admin app authenticates against the master realm (no tenant realm), so
// no per-tenant Keycloak user provisioning is needed here — the master realm
// admin user is provisioned by the Keycloak container bootstrap.

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

async function waitForKeycloak(retries = 30, delayMs = 2000): Promise<void> {
  // Keycloak 26+ does not expose /health on the main port (8080). The most
  // reliable readiness signal on 8080 is the master realm endpoint, which
  // returns 200 only once the server is fully booted and serving.
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

async function getMasterAdminToken(): Promise<string> {
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
    throw new Error(`Master realm admin token fetch failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

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

async function setup(): Promise<void> {
  process.stdout.write('[admin global-setup] Starting admin E2E provisioning…\n');

  await waitForKeycloak();

  process.stdout.write('[admin global-setup] Obtaining master realm super-admin token…\n');
  const token = await getMasterAdminToken();
  // Expose the token to test workers via process.env. api-client.ts reads this
  // as the default bearer token when no explicit token is passed.
  process.env['PLAYWRIGHT_ADMIN_API_TOKEN'] = token;

  provisionE2eTenant();

  process.stdout.write('[admin global-setup] Admin E2E provisioning complete.\n');
}

export default setup;
