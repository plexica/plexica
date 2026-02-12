/**
 * API Mock Utilities for Web App E2E Tests
 *
 * Uses Playwright's page.route() to intercept API calls and return mock data.
 * No real backend needed — all responses are mocked at the network level.
 */

import { Page } from '@playwright/test';
import {
  mockTenant,
  mockWorkspaces,
  mockWorkspaceMembers,
  mockTeams,
  mockTenantPlugins,
  mockMarketplacePlugins,
} from '../fixtures/test-data';

// ---------------------------------------------------------------------------
// Individual API mock functions
// ---------------------------------------------------------------------------

/**
 * Mock tenant API endpoints
 */
export async function mockTenantApi(page: Page) {
  // GET /api/tenants/slug/:slug
  await page.route('**/api/tenants/slug/*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockTenant),
    });
  });

  // GET /api/tenants/current
  await page.route('**/api/tenants/current', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockTenant),
    });
  });
}

/**
 * Mock workspace API endpoints
 */
export async function mockWorkspacesApi(page: Page) {
  // GET /api/workspaces
  await page.route('**/api/workspaces', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockWorkspaces),
      });
    } else if (route.request().method() === 'POST') {
      // Create workspace
      const body = route.request().postDataJSON();
      const newWorkspace = {
        id: 'ws-new',
        name: body?.name || 'New Workspace',
        slug: body?.slug || 'new-workspace',
        description: body?.description || '',
        tenantId: 'mock-tenant-id',
        ownerId: 'mock-tenant-user-id',
        memberRole: 'ADMIN',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(newWorkspace),
      });
    } else {
      await route.continue();
    }
  });

  // GET/PUT/DELETE /api/workspaces/:id
  await page.route('**/api/workspaces/ws-*', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    // Skip if this is a sub-resource (members, teams)
    if (url.includes('/members') || url.includes('/teams')) {
      await route.continue();
      return;
    }

    if (method === 'GET') {
      const wsId = url.split('/api/workspaces/')[1]?.split('?')[0];
      const ws = mockWorkspaces.find((w) => w.id === wsId) || mockWorkspaces[0];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ws),
      });
    } else if (method === 'PUT') {
      const body = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...mockWorkspaces[0], ...body }),
      });
    } else if (method === 'DELETE') {
      await route.fulfill({ status: 204 });
    } else {
      await route.continue();
    }
  });
}

/**
 * Mock workspace members API endpoints
 */
export async function mockWorkspaceMembersApi(page: Page) {
  // GET /api/workspaces/:id/members
  await page.route('**/api/workspaces/*/members', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockWorkspaceMembers),
      });
    } else if (method === 'POST') {
      // Add member
      const body = route.request().postDataJSON();
      const newMember = {
        id: 'member-new',
        userId: 'user-new',
        workspaceId: 'ws-1',
        role: body?.role || 'MEMBER',
        user: { id: 'user-new', email: body?.email || 'new@example.com', name: 'New Member' },
        createdAt: new Date().toISOString(),
      };
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(newMember),
      });
    } else {
      await route.continue();
    }
  });

  // PUT/DELETE /api/workspaces/:id/members/:userId
  await page.route('**/api/workspaces/*/members/*', async (route) => {
    const method = route.request().method();
    if (method === 'PUT') {
      const body = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...mockWorkspaceMembers[1], role: body?.role || 'MEMBER' }),
      });
    } else if (method === 'DELETE') {
      await route.fulfill({ status: 204 });
    } else {
      await route.continue();
    }
  });
}

/**
 * Mock workspace teams API endpoints
 */
export async function mockWorkspaceTeamsApi(page: Page) {
  // GET /api/workspaces/:id/teams
  await page.route('**/api/workspaces/*/teams', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockTeams),
      });
    } else if (method === 'POST') {
      const body = route.request().postDataJSON();
      const newTeam = {
        id: 'team-new',
        name: body?.name || 'New Team',
        description: body?.description || '',
        workspaceId: 'ws-1',
        memberCount: 0,
        createdAt: new Date().toISOString(),
      };
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(newTeam),
      });
    } else {
      await route.continue();
    }
  });
}

/**
 * Mock plugin API endpoints (tenant-scoped)
 *
 * Actual API paths used by TenantApiClient:
 *   GET    /api/tenants/{tenantId}/plugins                    → getTenantPlugins()
 *   POST   /api/tenants/{tenantId}/plugins/{pluginId}/install → installPlugin()
 *   POST   /api/tenants/{tenantId}/plugins/{pluginId}/activate → activatePlugin()
 *   POST   /api/tenants/{tenantId}/plugins/{pluginId}/deactivate → deactivatePlugin()
 *   DELETE /api/tenants/{tenantId}/plugins/{pluginId}          → uninstallPlugin()
 */
export async function mockPluginsApi(page: Page) {
  // POST /api/tenants/{tenantId}/plugins/{pluginId}/install
  await page.route('**/api/tenants/*/plugins/*/install', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    });
  });

  // POST /api/tenants/{tenantId}/plugins/{pluginId}/activate
  await page.route('**/api/tenants/*/plugins/*/activate', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    });
  });

  // POST /api/tenants/{tenantId}/plugins/{pluginId}/deactivate
  await page.route('**/api/tenants/*/plugins/*/deactivate', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    });
  });

  // GET /api/tenants/{tenantId}/plugins — tenant-scoped installed plugins
  // DELETE /api/tenants/{tenantId}/plugins/{pluginId} — uninstall
  // NOTE: This catch-all is registered AFTER the more-specific routes above.
  // Playwright matches routes in reverse registration order (last registered first),
  // so the specific /install, /activate, /deactivate routes take priority.
  await page.route('**/api/tenants/*/plugins', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockTenantPlugins),
      });
    } else {
      await route.continue();
    }
  });

  await page.route('**/api/tenants/*/plugins/*', async (route) => {
    // Skip if already handled by more specific routes (install/activate/deactivate)
    const url = route.request().url();
    if (url.endsWith('/install') || url.endsWith('/activate') || url.endsWith('/deactivate')) {
      await route.continue();
      return;
    }

    if (route.request().method() === 'DELETE') {
      await route.fulfill({ status: 204 });
    } else {
      await route.continue();
    }
  });
}

/**
 * Mock marketplace API endpoints
 *
 * Actual API paths used by TenantApiClient:
 *   GET /api/plugins          → getPlugins() (marketplace catalog)
 *   GET /api/plugins/{id}     → getPlugin() (plugin detail)
 */
export async function mockMarketplaceApi(page: Page) {
  // GET /api/plugins — marketplace catalog (with optional query params like ?search=)
  await page.route(/\/api\/plugins(\?.*)?$/, async (route) => {
    // Skip tenant-scoped plugin routes (those contain /api/tenants/)
    if (route.request().url().includes('/api/tenants/')) {
      await route.continue();
      return;
    }
    if (route.request().method() === 'GET') {
      // Filter by search param if present
      const url = new URL(route.request().url());
      const search = url.searchParams.get('search')?.toLowerCase();
      const filtered = search
        ? mockMarketplacePlugins.filter(
            (p) =>
              p.name.toLowerCase().includes(search) || p.description.toLowerCase().includes(search)
          )
        : mockMarketplacePlugins;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(filtered),
      });
    } else {
      await route.continue();
    }
  });

  // GET /api/plugins/:id — plugin detail
  await page.route('**/api/plugins/*', async (route) => {
    // Skip tenant-scoped plugin routes
    if (route.request().url().includes('/api/tenants/')) {
      await route.continue();
      return;
    }
    const url = route.request().url();
    const pluginId = url.split('/api/plugins/')[1]?.split('?')[0];
    const plugin =
      mockMarketplacePlugins.find((p) => p.id === pluginId) || mockMarketplacePlugins[0];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(plugin),
    });
  });
}

/**
 * Mock user API endpoint
 */
export async function mockUserApi(page: Page) {
  await page.route('**/api/users/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'mock-tenant-user-id',
        email: 'user@acme-corp.plexica.local',
        name: 'Test User (E2E)',
        tenantId: 'mock-tenant-id',
        roles: ['admin', 'member'],
      }),
    });
  });
}

// ---------------------------------------------------------------------------
// Convenience: Set up ALL mocks at once
// ---------------------------------------------------------------------------

/**
 * Set up all API mocks for a standard authenticated test session.
 * Call this in beforeEach() to ensure all API calls return mock data.
 */
export async function mockAllApis(page: Page) {
  await mockTenantApi(page);
  await mockWorkspacesApi(page);
  await mockWorkspaceMembersApi(page);
  await mockWorkspaceTeamsApi(page);
  await mockPluginsApi(page);
  await mockMarketplaceApi(page);
  await mockUserApi(page);
}
