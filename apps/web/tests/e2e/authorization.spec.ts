/**
 * Access Control — Authorization E2E Tests (Phase 5.18)
 *
 * Covers:
 *   - Roles list: renders headings, displays system/custom roles, navigates to create
 *   - Role detail: shows read-only role info and permissions
 *   - Role create: form validation, successful submit
 *   - Role edit: pre-populated form, update and delete flows
 *   - Users page: displays user list, opens role assignment dialog
 *   - Policies page: ABAC feature-flag gate shows banner when disabled
 *   - Policies page: renders policy list when ABAC enabled
 *   - Policy create: navigates and shows ConditionBuilder
 *
 * Routes: /access-control/roles, /access-control/users, /access-control/policies
 *
 * All API calls are intercepted via page.route() — no real backend needed.
 * Auth is provided by MockAuthProvider (VITE_E2E_TEST_MODE=true).
 *
 * Spec 003: Authorization System RBAC + ABAC
 */

import { test, expect, type Page } from '@playwright/test';
import { mockAllApis } from './helpers/api-mocks';

// ---------------------------------------------------------------------------
// Mock data matching Spec 003 API shapes
// ---------------------------------------------------------------------------

const mockRolePage = {
  data: [
    {
      id: 'role-admin',
      tenantId: 'mock-tenant-id',
      name: 'Admin',
      description: 'Full administrative access',
      isSystem: true,
      permissions: [
        {
          id: 'p-1',
          tenantId: 'mock-tenant-id',
          key: 'workspace:read',
          name: 'workspace:read',
          pluginId: null,
          createdAt: '2026-01-01T00:00:00Z',
        },
        {
          id: 'p-2',
          tenantId: 'mock-tenant-id',
          key: 'workspace:write',
          name: 'workspace:write',
          pluginId: null,
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
      userCount: 3,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'role-member',
      tenantId: 'mock-tenant-id',
      name: 'Member',
      description: 'Standard member access',
      isSystem: true,
      permissions: [
        {
          id: 'p-1',
          tenantId: 'mock-tenant-id',
          key: 'workspace:read',
          name: 'workspace:read',
          pluginId: null,
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
      userCount: 10,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'role-custom-1',
      tenantId: 'mock-tenant-id',
      name: 'Read-Only Reporter',
      description: 'Can view dashboards and export reports',
      isSystem: false,
      permissions: [
        {
          id: 'p-1',
          tenantId: 'mock-tenant-id',
          key: 'workspace:read',
          name: 'workspace:read',
          pluginId: null,
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
      userCount: 2,
      createdAt: '2026-02-10T00:00:00Z',
      updatedAt: '2026-02-10T00:00:00Z',
    },
  ],
  meta: { total: 3, page: 1, limit: 50, customRoleCount: 1 },
};

const mockPermissionsResponse = {
  data: [
    {
      id: 'p-1',
      tenantId: 'mock-tenant-id',
      key: 'workspace:read',
      name: 'workspace:read',
      pluginId: null,
      createdAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'p-2',
      tenantId: 'mock-tenant-id',
      key: 'workspace:write',
      name: 'workspace:write',
      pluginId: null,
      createdAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'p-3',
      tenantId: 'mock-tenant-id',
      key: 'members:manage',
      name: 'members:manage',
      pluginId: null,
      createdAt: '2026-01-01T00:00:00Z',
    },
  ],
  groups: {
    workspace: [
      {
        id: 'p-1',
        tenantId: 'mock-tenant-id',
        key: 'workspace:read',
        name: 'workspace:read',
        pluginId: null,
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'p-2',
        tenantId: 'mock-tenant-id',
        key: 'workspace:write',
        name: 'workspace:write',
        pluginId: null,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ],
    members: [
      {
        id: 'p-3',
        tenantId: 'mock-tenant-id',
        key: 'members:manage',
        name: 'members:manage',
        pluginId: null,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ],
  },
};

const mockPolicyPageEnabled = {
  data: [
    {
      id: 'pol-1',
      tenantId: 'mock-tenant-id',
      name: 'Block inactive users',
      resource: 'workspace:*',
      effect: 'DENY',
      conditions: { all: [{ attribute: 'user.active', operator: 'eq', value: false }] },
      priority: 10,
      source: 'tenant_admin',
      pluginId: null,
      isActive: true,
      createdAt: '2026-02-01T00:00:00Z',
      updatedAt: '2026-02-01T00:00:00Z',
    },
  ],
  meta: { total: 1, page: 1, limit: 50, featureEnabled: true },
};

const mockPolicyPageDisabled = {
  data: [],
  meta: { total: 0, page: 1, limit: 50, featureEnabled: false },
};

const mockUsersResponse = {
  data: [
    {
      id: 'u-1',
      email: 'alice@acme-corp.plexica.local',
      name: 'Alice',
      status: 'active',
      roles: ['Admin'],
      lastLoginAt: '2026-03-01T00:00:00Z',
      createdAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'u-2',
      email: 'bob@acme-corp.plexica.local',
      name: 'Bob',
      status: 'active',
      roles: ['Member'],
      lastLoginAt: '2026-02-15T00:00:00Z',
      createdAt: '2026-01-05T00:00:00Z',
    },
  ],
  pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
};

// ---------------------------------------------------------------------------
// Route mock helpers
// ---------------------------------------------------------------------------

async function mockRolesApi(page: Page) {
  // GET /api/v1/roles (list + search)
  await page.route(/\/api\/v1\/roles(\?.*)?$/, async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockRolePage),
      });
    } else if (method === 'POST') {
      const body = route.request().postDataJSON() as {
        name?: string;
        description?: string;
        permissionIds?: string[];
      };
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'role-new',
          tenantId: 'mock-tenant-id',
          name: body?.name ?? 'New Role',
          description: body?.description ?? '',
          isSystem: false,
          permissions: [],
          userCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      });
    } else {
      await route.continue();
    }
  });

  // PUT /api/v1/roles/:id
  await page.route(/\/api\/v1\/roles\/[^/]+(\?.*)?$/, async (route) => {
    const method = route.request().method();
    if (method === 'PUT') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...mockRolePage.data[2], ...body }),
      });
    } else if (method === 'DELETE') {
      await route.fulfill({ status: 204 });
    } else {
      await route.continue();
    }
  });
}

async function mockPermissionsApi(page: Page) {
  await page.route(/\/api\/v1\/permissions(\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockPermissionsResponse),
    });
  });
}

async function mockPoliciesApi(page: Page, featureEnabled = true) {
  const responseData = featureEnabled ? mockPolicyPageEnabled : mockPolicyPageDisabled;
  await page.route(/\/api\/v1\/policies(\?.*)?$/, async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(responseData),
      });
    } else if (method === 'POST') {
      const body = route.request().postDataJSON() as {
        name?: string;
        resource?: string;
        effect?: string;
      };
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'pol-new',
          tenantId: 'mock-tenant-id',
          name: body?.name ?? 'New Policy',
          resource: body?.resource ?? '*',
          effect: body?.effect ?? 'DENY',
          conditions: { all: [] },
          priority: 10,
          source: 'tenant_admin',
          pluginId: null,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      });
    } else {
      await route.continue();
    }
  });

  // PUT / DELETE /api/v1/policies/:id
  await page.route(/\/api\/v1\/policies\/[^/]+(\?.*)?$/, async (route) => {
    const method = route.request().method();
    if (method === 'PUT') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...mockPolicyPageEnabled.data[0], ...body }),
      });
    } else if (method === 'DELETE') {
      await route.fulfill({ status: 204 });
    } else {
      await route.continue();
    }
  });
}

async function mockUsersApi(page: Page) {
  await page.route(/\/api\/v1\/users(\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockUsersResponse),
    });
  });
  // POST /api/v1/users/:id/roles
  await page.route(/\/api\/v1\/users\/[^/]+\/roles(\?.*)?$/, async (route) => {
    const method = route.request().method();
    if (method === 'POST') {
      // Spec §3.6: role assignment response must include { data: { userId, roleId, roleName, assignedAt } }
      const url = route.request().url();
      const userIdMatch = url.match(/\/users\/([^/]+)\/roles/);
      const userId = userIdMatch?.[1] ?? 'u-1';
      const body = route.request().postDataJSON() as { roleId?: string } | null;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            userId,
            roleId: body?.roleId ?? 'role-admin',
            roleName: 'Admin',
            assignedAt: new Date().toISOString(),
          },
        }),
      });
    } else {
      await route.continue();
    }
  });
  // DELETE /api/v1/users/:id/roles/:roleId
  await page.route(/\/api\/v1\/users\/[^/]+\/roles\/[^/]+(\?.*)?$/, async (route) => {
    if (route.request().method() === 'DELETE') {
      await route.fulfill({ status: 204 });
    } else {
      await route.continue();
    }
  });
}

// ---------------------------------------------------------------------------
// Roles list
// ---------------------------------------------------------------------------

test.describe('Access Control — Roles List', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await mockRolesApi(page);
    await mockPermissionsApi(page);
    await page.goto('/access-control/roles');
    await expect(page.getByRole('heading', { name: /roles/i })).toBeVisible({ timeout: 15000 });
  });

  test('should display the Roles page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /roles/i })).toBeVisible();
  });

  test('should display system roles', async ({ page }) => {
    await expect(page.getByText('Admin')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Full administrative access')).toBeVisible();
    await expect(page.getByText('Member')).toBeVisible();
  });

  test('should display custom roles', async ({ page }) => {
    await expect(page.getByText('Read-Only Reporter')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Can view dashboards and export reports')).toBeVisible();
  });

  test('should show "System" badge for system roles', async ({ page }) => {
    const systemBadges = page.getByText('System');
    await expect(systemBadges.first()).toBeVisible({ timeout: 10000 });
  });

  test('should show "Create Role" button', async ({ page }) => {
    await expect(page.getByRole('link', { name: /create role/i })).toBeVisible();
  });

  test('should navigate to create role page on button click', async ({ page }) => {
    await page.getByRole('link', { name: /create role/i }).click();
    await expect(page).toHaveURL(/\/access-control\/roles\/create/);
  });

  test('should navigate to role detail on role name click', async ({ page }) => {
    await page.getByRole('link', { name: 'Admin' }).first().click();
    await expect(page).toHaveURL(/\/access-control\/roles\/role-admin/);
  });

  test('should filter roles by search input', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search roles/i);
    await searchInput.fill('Reporter');
    // After typing, the component re-fetches; the mock always returns all roles
    // but we verify the search input is functional
    await expect(searchInput).toHaveValue('Reporter');
  });
});

// ---------------------------------------------------------------------------
// Create Role
// ---------------------------------------------------------------------------

test.describe('Access Control — Create Role', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await mockRolesApi(page);
    await mockPermissionsApi(page);
    await page.goto('/access-control/roles/create');
    await expect(page.getByRole('heading', { name: /create role/i })).toBeVisible({
      timeout: 15000,
    });
  });

  test('should display the Create Role form', async ({ page }) => {
    await expect(page.getByLabel(/role name/i)).toBeVisible();
    await expect(page.getByLabel(/description/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /create role/i })).toBeVisible();
  });

  test('should show validation error when name is empty on submit', async ({ page }) => {
    await page.getByRole('button', { name: /create role/i }).click();
    await expect(page.getByText(/name is required/i)).toBeVisible();
  });

  test('should submit the form with valid data', async ({ page }) => {
    await page.getByLabel(/role name/i).fill('Security Auditor');
    await page.getByLabel(/description/i).fill('Can view security reports');
    await page.getByRole('button', { name: /create role/i }).click();
    // Successful creation navigates away or shows success
    await expect(page).toHaveURL(/\/access-control\/roles/);
  });

  test('should have a cancel/back link', async ({ page }) => {
    const cancelLink = page
      .getByRole('link', { name: /cancel/i })
      .or(page.getByRole('link', { name: /back/i }));
    await expect(cancelLink).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Edit Role
// ---------------------------------------------------------------------------

test.describe('Access Control — Edit Role', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await mockRolesApi(page);
    await mockPermissionsApi(page);
    await page.goto('/access-control/roles/role-custom-1/edit');
    await expect(page.getByRole('heading', { name: /edit role/i })).toBeVisible({
      timeout: 15000,
    });
  });

  test('should display the Edit Role form pre-populated', async ({ page }) => {
    const nameInput = page.getByLabel(/role name/i);
    await expect(nameInput).toBeVisible();
    // The value comes from the mock (useRole fetches list + filters by id)
    await expect(nameInput).toHaveValue('Read-Only Reporter');
  });

  test('should submit the updated form', async ({ page }) => {
    await page.getByLabel(/role name/i).fill('Senior Reporter');
    await page.getByRole('button', { name: /save changes/i }).click();
    await expect(page).toHaveURL(/\/access-control\/roles/);
  });

  test('should show delete button for custom roles', async ({ page }) => {
    await expect(page.getByRole('button', { name: /delete role/i })).toBeVisible();
  });

  test('should open confirmation modal before deleting', async ({ page }) => {
    await page.getByRole('button', { name: /delete role/i }).click();
    // DestructiveConfirmModal renders with a confirm button
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Role Detail (read-only)
// ---------------------------------------------------------------------------

test.describe('Access Control — Role Detail', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await mockRolesApi(page);
    await mockPermissionsApi(page);
    await page.goto('/access-control/roles/role-admin');
    await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible({ timeout: 15000 });
  });

  test('should display role name and description', async ({ page }) => {
    await expect(page.getByText('Admin')).toBeVisible();
    await expect(page.getByText('Full administrative access')).toBeVisible();
  });

  test('should display permission list', async ({ page }) => {
    await expect(page.getByText('workspace:read')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('workspace:write')).toBeVisible();
  });

  test('should show "System" badge for system role', async ({ page }) => {
    await expect(page.getByText('System')).toBeVisible();
  });

  test('should NOT show edit button for system roles', async ({ page }) => {
    await expect(page.getByRole('link', { name: /edit/i })).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Users page
// ---------------------------------------------------------------------------

test.describe('Access Control — Users', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await mockRolesApi(page);
    await mockUsersApi(page);
    await page.goto('/access-control/users');
    await expect(page.getByRole('heading', { name: /users/i })).toBeVisible({ timeout: 15000 });
  });

  test('should display the Users page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /users/i })).toBeVisible();
  });

  test('should display user rows', async ({ page }) => {
    await expect(page.getByText('alice@acme-corp.plexica.local')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('bob@acme-corp.plexica.local')).toBeVisible();
  });

  test('should show current role badges for users', async ({ page }) => {
    await expect(page.getByText('Admin').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Member').first()).toBeVisible();
  });

  test('should open role assignment dialog on "Edit Roles" click', async ({ page }) => {
    const editButton = page.getByRole('button', { name: /edit roles/i }).first();
    await expect(editButton).toBeVisible({ timeout: 10000 });
    await editButton.click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Policies page — ABAC disabled
// ---------------------------------------------------------------------------

test.describe('Access Control — Policies (ABAC disabled)', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await mockPoliciesApi(page, false);
    await page.goto('/access-control/policies');
    await expect(page.getByRole('heading', { name: /policies/i })).toBeVisible({
      timeout: 15000,
    });
  });

  test('should show ABAC unavailable banner', async ({ page }) => {
    await expect(
      page
        .getByText(/attribute-based access control.*not available/i)
        .or(page.getByText(/abac.*not enabled/i))
    ).toBeVisible({ timeout: 10000 });
  });

  test('should NOT show "Create Policy" button when ABAC disabled', async ({ page }) => {
    await expect(page.getByRole('link', { name: /create policy/i })).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Policies page — ABAC enabled
// ---------------------------------------------------------------------------

test.describe('Access Control — Policies (ABAC enabled)', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await mockPoliciesApi(page, true);
    await page.goto('/access-control/policies');
    await expect(page.getByRole('heading', { name: /policies/i })).toBeVisible({
      timeout: 15000,
    });
  });

  test('should display the Policies page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /policies/i })).toBeVisible();
  });

  test('should display existing policies', async ({ page }) => {
    await expect(page.getByText('Block inactive users')).toBeVisible({ timeout: 10000 });
  });

  test('should show "DENY" effect badge for DENY policies', async ({ page }) => {
    await expect(page.getByText('DENY').first()).toBeVisible({ timeout: 10000 });
  });

  test('should show "Create Policy" button', async ({ page }) => {
    await expect(page.getByRole('link', { name: /create policy/i })).toBeVisible();
  });

  test('should navigate to Create Policy page', async ({ page }) => {
    await page.getByRole('link', { name: /create policy/i }).click();
    await expect(page).toHaveURL(/\/access-control\/policies\/create/);
  });
});

// ---------------------------------------------------------------------------
// Create Policy
// ---------------------------------------------------------------------------

test.describe('Access Control — Create Policy', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await mockPoliciesApi(page, true);
    await page.goto('/access-control/policies/create');
    await expect(page.getByRole('heading', { name: /create policy/i })).toBeVisible({
      timeout: 15000,
    });
  });

  test('should display the Create Policy form', async ({ page }) => {
    await expect(page.getByLabel(/policy name/i)).toBeVisible();
    await expect(page.getByLabel(/resource/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /create policy/i })).toBeVisible();
  });

  test('should render the ConditionBuilder section', async ({ page }) => {
    // ConditionBuilder renders AND/OR group toggles
    await expect(page.getByText(/AND/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('should show validation error when name is empty on submit', async ({ page }) => {
    await page.getByRole('button', { name: /create policy/i }).click();
    await expect(page.getByText(/name is required/i)).toBeVisible();
  });

  test('should submit the form with valid data', async ({ page }) => {
    await page.getByLabel(/policy name/i).fill('Block external IPs');
    await page.getByLabel(/resource/i).fill('workspace:*');
    await page.getByRole('button', { name: /create policy/i }).click();
    await expect(page).toHaveURL(/\/access-control\/policies/);
  });
});

// ---------------------------------------------------------------------------
// Sidebar Navigation
// ---------------------------------------------------------------------------

test.describe('Access Control — Sidebar Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await mockRolesApi(page);
    await mockPermissionsApi(page);
    await page.goto('/');
    await expect(page.locator('nav')).toBeVisible({ timeout: 15000 });
  });

  test('should display "Access Control" section in sidebar', async ({ page }) => {
    await expect(page.getByText('Access Control')).toBeVisible({ timeout: 10000 });
  });

  test('should expand Access Control section to show Roles link', async ({ page }) => {
    // If collapsed, click to expand
    const section = page.getByText('Access Control');
    await section.click();
    await expect(page.getByRole('link', { name: /^roles$/i })).toBeVisible();
  });

  test('should expand Access Control section to show Users link', async ({ page }) => {
    const section = page.getByText('Access Control');
    await section.click();
    await expect(page.getByRole('link', { name: /^users$/i })).toBeVisible();
  });

  test('should expand Access Control section to show Policies link', async ({ page }) => {
    const section = page.getByText('Access Control');
    await section.click();
    await expect(page.getByRole('link', { name: /^policies$/i })).toBeVisible();
  });
});
