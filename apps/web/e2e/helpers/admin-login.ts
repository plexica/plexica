// admin-login.ts
// Tenant admin credentials and login helpers for Spec 003 E2E tests.
// Admin users have the tenant-admin role in Keycloak (full workspace management).

import {
  hasKeycloak,
  KEYCLOAK_PASSWORD,
  KEYCLOAK_USERNAME,
  loginViaKeycloak,
  requireKeycloakInCI,
  TENANT_SLUG,
} from './keycloak-login.js';

import type { Page } from '@playwright/test';


// ---------------------------------------------------------------------------
// Admin credentials
// The admin user is the same as the regular test user in global-setup.ts
// (test@e2e.local) because the E2E tenant provisioning makes that user a
// tenant admin. Override with the PLAYWRIGHT_ADMIN_* env vars when a
// dedicated admin account is configured.
// ---------------------------------------------------------------------------
export const ADMIN_USERNAME = process.env['PLAYWRIGHT_ADMIN_USER'] ?? KEYCLOAK_USERNAME;
export const ADMIN_PASSWORD = process.env['PLAYWRIGHT_ADMIN_PASS'] ?? KEYCLOAK_PASSWORD;
export const ADMIN_TENANT_SLUG = process.env['PLAYWRIGHT_TENANT_SLUG'] ?? TENANT_SLUG;

// A second user for member/viewer tests — must exist in the tenant realm.
export const MEMBER_USERNAME = process.env['PLAYWRIGHT_MEMBER_USER'] ?? 'member@e2e.local';
export const MEMBER_PASSWORD = process.env['PLAYWRIGHT_MEMBER_PASS'] ?? 'PlexicaE2e!1';

// A viewer-role user — must exist in the tenant realm.
export const VIEWER_USERNAME = process.env['PLAYWRIGHT_VIEWER_USER'] ?? 'viewer@e2e.local';
export const VIEWER_PASSWORD = process.env['PLAYWRIGHT_VIEWER_PASS'] ?? 'PlexicaE2e!1';

// Re-export so callers only need one import.
export { hasKeycloak, requireKeycloakInCI, TENANT_SLUG };

/**
 * Logs in as the tenant admin and waits for /dashboard.
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  await loginViaKeycloak(page, {
    tenantSlug: ADMIN_TENANT_SLUG,
    username: ADMIN_USERNAME,
    password: ADMIN_PASSWORD,
  });
}

/**
 * Logs in as a member-role user and waits for /dashboard.
 */
export async function loginAsMember(page: Page): Promise<void> {
  await loginViaKeycloak(page, {
    tenantSlug: ADMIN_TENANT_SLUG,
    username: MEMBER_USERNAME,
    password: MEMBER_PASSWORD,
  });
}

/**
 * Logs in as a viewer-role user and waits for /dashboard.
 */
export async function loginAsViewer(page: Page): Promise<void> {
  await loginViaKeycloak(page, {
    tenantSlug: ADMIN_TENANT_SLUG,
    username: VIEWER_USERNAME,
    password: VIEWER_PASSWORD,
  });
}

/**
 * Generates a unique name with a timestamp suffix.
 * Prevents test pollution between runs.
 */
export function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}
