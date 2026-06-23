// rbac-permissions.spec.ts
// E2E-06: Role-based access control enforcement (Spec 003, Phase 20.6).
// Tests that non-tenant-admin users are restricted by ABAC.
// Viewer and member users exist in Keycloak but do NOT have the tenant_admin role.
// Skips when Keycloak credentials are absent or the stack is not running.

import { expect, test } from './helpers/base-fixture.js';
import {
  hasKeycloak,
  loginAsAdmin,
  loginAsMember,
  loginAsViewer,
  requireKeycloakInCI,
  uniqueName,
} from './helpers/admin-login.js';
import { API_BASE } from './helpers/api-check.js';
import { ADMIN_TENANT_SLUG } from './helpers/admin-login.js';

test.describe('E2E-06: RBAC — viewer restrictions', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak (PLAYWRIGHT_KEYCLOAK_* env vars)');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test('viewer can log in and see the workspace list page', async ({ page }) => {
    await loginAsViewer(page);
    await page.goto('/workspaces');
    // Viewer should see the page heading
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
  });

  test('viewer: create workspace API returns 403', async ({ page }) => {
    await loginAsViewer(page);
    // Wait for the page to load so session storage is populated
    await page.goto('/workspaces');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });

    const accessToken = await page.evaluate(() => {
      const stored = sessionStorage.getItem('plexica-auth');
      if (!stored) return '';
      const parsed = JSON.parse(stored) as { state?: { accessToken?: string } };
      return parsed.state?.accessToken ?? '';
    });

    expect(accessToken).not.toBe('');

    const res = await page.request.post(`${API_BASE}/api/v1/workspaces`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Tenant-Slug': ADMIN_TENANT_SLUG,
        'Content-Type': 'application/json',
      },
      data: JSON.stringify({ name: uniqueName('viewer-attempt') }),
    });
    expect(res.status()).toBe(403);
  });

  test('viewer: admin-only API endpoints return 403', async ({ page }) => {
    await loginAsViewer(page);
    await page.goto('/workspaces');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });

    const accessToken = await page.evaluate(() => {
      const stored = sessionStorage.getItem('plexica-auth');
      if (!stored) return '';
      const parsed = JSON.parse(stored) as { state?: { accessToken?: string } };
      return parsed.state?.accessToken ?? '';
    });

    // Audit log is tenant-level action → 403 for non-admin
    const auditRes = await page.request.get(`${API_BASE}/api/v1/tenant/audit-log`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Tenant-Slug': ADMIN_TENANT_SLUG,
      },
    });
    expect(auditRes.status()).toBe(403);
  });
});

test.describe('E2E-06: RBAC — member restrictions', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak (PLAYWRIGHT_KEYCLOAK_* env vars)');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test('member can log in and see the workspace list', async ({ page }) => {
    await loginAsMember(page);
    await page.goto('/workspaces');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
  });

  test('member: tenant admin API endpoints return 403', async ({ page }) => {
    await loginAsMember(page);
    await page.goto('/workspaces');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });

    const accessToken = await page.evaluate(() => {
      const stored = sessionStorage.getItem('plexica-auth');
      if (!stored) return '';
      const parsed = JSON.parse(stored) as { state?: { accessToken?: string } };
      return parsed.state?.accessToken ?? '';
    });

    // User management is tenant-admin only
    const usersRes = await page.request.get(`${API_BASE}/api/v1/users`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Tenant-Slug': ADMIN_TENANT_SLUG,
      },
    });
    expect(usersRes.status()).toBe(403);

    // Workspace creation is tenant-admin only
    const createRes = await page.request.post(`${API_BASE}/api/v1/workspaces`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Tenant-Slug': ADMIN_TENANT_SLUG,
        'Content-Type': 'application/json',
      },
      data: JSON.stringify({ name: uniqueName('member-attempt') }),
    });
    expect(createRes.status()).toBe(403);
  });
});

test.describe('E2E-06: RBAC — tenant admin access', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak (PLAYWRIGHT_KEYCLOAK_* env vars)');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test('tenant admin can create workspaces and access all pages', async ({ page }) => {
    await loginAsAdmin(page);

    // Can create workspace
    const wsName = uniqueName('rbac-admin-ws');
    const accessToken = await page.evaluate(() => {
      const stored = sessionStorage.getItem('plexica-auth');
      if (!stored) return '';
      const parsed = JSON.parse(stored) as { state?: { accessToken?: string } };
      return parsed.state?.accessToken ?? '';
    });

    const createRes = await page.request.post(`${API_BASE}/api/v1/workspaces`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Tenant-Slug': ADMIN_TENANT_SLUG,
        'Content-Type': 'application/json',
      },
      data: JSON.stringify({ name: wsName }),
    });
    expect(createRes.status()).toBe(201);

    // Can access audit log
    const auditRes = await page.request.get(`${API_BASE}/api/v1/tenant/audit-log`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Tenant-Slug': ADMIN_TENANT_SLUG,
      },
    });
    expect(auditRes.status()).toBe(200);

    // Can access user management
    const usersRes = await page.request.get(`${API_BASE}/api/v1/users`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Tenant-Slug': ADMIN_TENANT_SLUG,
      },
    });
    expect(usersRes.status()).toBe(200);
  });
});
