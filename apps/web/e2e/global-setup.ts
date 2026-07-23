// global-setup.ts
// Playwright globalSetup — provisions E2E test tenants and Keycloak users.
//
// Runs ONCE before any test worker starts (and before webServers start).
// Strategy:
//   1. Invoke the core-api CLI directly via `spawnSync tsx` to create each tenant.
//   2. Call the Keycloak Admin REST API directly (fetch) to add test users.
//   3. Set the login theme to 'plexica' and verify that it renders.
//
// Idempotent: 409 responses are treated as "already exists" and the password
// is reset to the known test value so re-runs after partial failures are safe.
//
// Users provisioned:
//   Tenant e2e  (realm plexica-e2e):
//     test@e2e.local          / PlexicaE2e!1   tenant_admin role
//     member@e2e.local        / PlexicaE2e!1   no role (RBAC tests)
//     viewer@e2e.local        / PlexicaE2e!1   no role (RBAC tests)
//     force-pwd@e2e.local     / ForcePwd!1     (UPDATE_PASSWORD required action)
//     force-profile@e2e.local / ForceProfile!1 (UPDATE_PROFILE required action)
//
//   Tenant e2e-b (realm plexica-e2e-b):
//     test@e2e.local          / PlexicaE2e!1   (for cross-tenant isolation tests)

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';

import { getAdminToken, waitForKeycloak } from '../../../e2e/keycloak/admin-api.js';
import { createEphemeralE2eClient } from '../../../e2e/keycloak/ephemeral-client.js';
import { ensureSuperAdminRole } from '../../../e2e/keycloak/realm-role.js';
import {
  createRunScopedSuperAdmin,
  deleteRunScopedSuperAdmin,
} from '../../../e2e/keycloak/run-super-admin.js';

import {
  setRealmPlexicaTheme,
  setTenantClientOrigin,
  upsertUser,
} from './keycloak-admin-client.js';
import {
  provisionTenant,
  migrateTenantSchemas,
  seedPluginCatalog,
} from './tenant-provisioning-helpers.js';
import { isLocalThemeFallbackAllowed } from './theme-fallback-policy.js';
import { tenantWebUrl } from './helpers/tenant-hosts.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// Marker file: '1' = Plexica theme active, '0' = explicit local fallback.
const THEME_MARKER_PATH = path.resolve(__dirname, '.e2e-plexica-theme-active');

async function setup(): Promise<void> {
  process.stdout.write('[global-setup] Starting E2E environment provisioning…\n');
  isLocalThemeFallbackAllowed();
  fs.rmSync(THEME_MARKER_PATH, { force: true });

  // ── 0. Wait for Keycloak readiness ────────────────────────────────────────
  await waitForKeycloak();

  // ── 1. Provision tenants ──────────────────────────────────────────────────
  provisionTenant('e2e', 'E2E', 'admin@e2e.local');
  provisionTenant('e2e-b', 'E2E-B', 'admin@e2e-b.local');
  // The 'admin' slug maps to the master realm (super-admin login) — provision
  // it so tenant resolution returns exists:true. The create-tenant CLI creates
  // a plexica-admin realm, but the frontend resolver overrides to 'master'.
  provisionTenant('admin', 'Super Admin', 'admin@plexica.local');

  // ── 1b. Apply tenant DDL migrations ──────────────────────────────────────
  migrateTenantSchemas();

  // Seed installable CRM marketplace data; admin review uses a separate fixture.
  seedPluginCatalog();

  // ── 2. Add test users via Keycloak Admin REST API ─────────────────────────
  process.stdout.write('[global-setup] Obtaining Keycloak admin token…\n');
  const token = await getAdminToken();

  const REALM_A = 'plexica-e2e';
  const REALM_B = 'plexica-e2e-b';

  process.stdout.write('[global-setup] Configuring realms and creating test users…\n');

  await setTenantClientOrigin(token, REALM_A, new URL(tenantWebUrl('e2e')).origin);
  await setTenantClientOrigin(token, REALM_B, new URL(tenantWebUrl('e2e-b')).origin);

  // Activation and rendering must succeed; fallback is explicit and local-only.
  const themeActiveA = await setRealmPlexicaTheme(token, REALM_A);
  const themeActiveB = await setRealmPlexicaTheme(token, REALM_B);
  const plexicaThemeActive = themeActiveA && themeActiveB;

  fs.writeFileSync(THEME_MARKER_PATH, plexicaThemeActive ? '1' : '0', 'utf8');
  process.stdout.write(
    `[global-setup] Plexica theme active: ${String(plexicaThemeActive)} (marker written).\n`
  );

  // Tenant admin (used by most E2E tests — workspace CRUD, audit log, etc.)
  await upsertUser(token, REALM_A, {
    username: 'test@e2e.local',
    email: 'test@e2e.local',
    firstName: 'E2E',
    lastName: 'User',
    password: 'PlexicaE2e!1',
    realmRoles: ['tenant_admin'],
  });

  // Member-role user (used by rbac-permissions.spec.ts — no tenant_admin role).
  await upsertUser(token, REALM_A, {
    username: 'member@e2e.local',
    email: 'member@e2e.local',
    firstName: 'Member',
    lastName: 'User',
    password: 'PlexicaE2e!1',
  });

  // Viewer-role user (used by rbac-permissions.spec.ts — no tenant_admin role).
  await upsertUser(token, REALM_A, {
    username: 'viewer@e2e.local',
    email: 'viewer@e2e.local',
    firstName: 'Viewer',
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
    realmRoles: ['tenant_admin'],
  });

  // ── 3. Set up a distinct, run-scoped master-realm identity ────────────────
  const superAdminRole = await ensureSuperAdminRole(token);
  await createRunScopedSuperAdmin(token, 'web', superAdminRole);
  try {
    await createEphemeralE2eClient(token, 'web', superAdminRole);
  } catch (error) {
    await deleteRunScopedSuperAdmin(token).catch(() => undefined);
    throw error;
  }

  process.stdout.write('[global-setup] E2E environment provisioning complete.\n');
}

export default setup;
