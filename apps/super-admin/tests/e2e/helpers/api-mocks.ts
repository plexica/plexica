/**
 * Shared API Mock Utilities for E2E Tests
 *
 * Provides consistent mock responses that match the real API shapes
 * after the C3/C4 rewrites. All admin endpoints return PaginatedResponse<T>:
 *   { data: T[], pagination: { page, limit, total, totalPages } }
 *
 * Analytics endpoints return raw arrays (not wrapped).
 */

import { Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MockTenant {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  plugins?: { id: string; name: string }[];
  [key: string]: unknown;
}

export interface MockPlugin {
  id: string;
  name: string;
  version: string;
  status: string;
  description: string;
  category: string;
  author: string;
  averageRating?: number;
  installCount?: number;
  ratingCount?: number;
  createdAt: string;
  [key: string]: unknown;
}

export interface MockUser {
  id: string;
  email: string;
  name: string;
  firstName?: string;
  lastName?: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  roles: string[];
  createdAt: string;
}

export interface MockAnalyticsOverview {
  totalTenants: number;
  activeTenants: number;
  suspendedTenants?: number;
  provisioningTenants?: number;
  totalPlugins: number;
  totalPluginInstallations?: number;
  totalUsers: number;
  totalWorkspaces?: number;
  apiCalls24h?: number;
}

export interface MockTenantGrowthPoint {
  date: string;
  totalTenants: number;
  activeTenants?: number;
  newTenants?: number;
}

export interface MockPluginUsage {
  pluginId: string;
  pluginName: string;
  installCount: number;
  activeInstalls: number;
}

export interface MockApiCallMetrics {
  date: string;
  totalCalls: number;
  errorCalls: number;
  avgLatencyMs: number;
}

// ---------------------------------------------------------------------------
// Helper: Build a PaginatedResponse
// ---------------------------------------------------------------------------

function paginated<T>(data: T[], page = 1, limit = 50) {
  return {
    data,
    pagination: {
      page,
      limit,
      total: data.length,
      totalPages: Math.ceil(data.length / limit) || 1,
    },
  };
}

function paginatedWithTotal<T>(data: T[], total: number, page = 1, limit = 50) {
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

// ---------------------------------------------------------------------------
// Helper: Parse URL search params
// ---------------------------------------------------------------------------

function getUrlParams(url: string): URLSearchParams {
  try {
    return new URL(url).searchParams;
  } catch {
    // If URL doesn't parse (relative), try splitting on ?
    const queryString = url.split('?')[1] || '';
    return new URLSearchParams(queryString);
  }
}

// ---------------------------------------------------------------------------
// Tenant Mocks
// ---------------------------------------------------------------------------

/**
 * Mock the /api/admin/tenants endpoint with proper PaginatedResponse
 * and route discrimination for list vs stats vs detail requests.
 */
export async function mockTenantsApi(
  page: Page,
  tenants: MockTenant[],
  options?: {
    /** Handler for GET /tenants/:id — returns tenant detail */
    onGetDetail?: (tenantId: string) => unknown;
    /** Handler for POST /tenants/:id/suspend */
    onSuspend?: (tenantId: string) => unknown;
    /** Handler for POST /tenants/:id/activate */
    onActivate?: (tenantId: string) => unknown;
    /** Handler for DELETE /tenants/:id */
    onDelete?: (tenantId: string) => unknown;
  }
) {
  await page.route('**/api/admin/tenants**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    // POST /tenants/:id/suspend
    if (method === 'POST' && url.includes('/suspend')) {
      const tenantId = url.match(/\/tenants\/([^/]+)\/suspend/)?.[1] ?? '';
      const result = options?.onSuspend?.(tenantId) ?? {
        ...(tenants.find((t) => t.id === tenantId) ?? tenants[0]),
        status: 'SUSPENDED',
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(result),
      });
      return;
    }

    // POST /tenants/:id/activate
    if (method === 'POST' && url.includes('/activate')) {
      const tenantId = url.match(/\/tenants\/([^/]+)\/activate/)?.[1] ?? '';
      const result = options?.onActivate?.(tenantId) ?? {
        ...(tenants.find((t) => t.id === tenantId) ?? tenants[0]),
        status: 'ACTIVE',
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(result),
      });
      return;
    }

    // POST /tenants (create)
    if (method === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'tenant-new',
          name: 'New Tenant',
          slug: 'new-tenant',
          status: 'PROVISIONING',
          createdAt: new Date().toISOString(),
        }),
      });
      return;
    }

    // DELETE /tenants/:id
    if (method === 'DELETE') {
      const tenantId = url.split('/tenants/')[1]?.split('?')[0] ?? '';
      const result = options?.onDelete?.(tenantId) ?? { message: 'Tenant deleted' };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(result),
      });
      return;
    }

    // PATCH /tenants/:id
    if (method === 'PATCH') {
      const tenantId = url.split('/tenants/')[1]?.split('?')[0]?.split('/')[0] ?? '';
      const tenant = tenants.find((t) => t.id === tenantId) ?? tenants[0];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(tenant),
      });
      return;
    }

    // GET /tenants/:id (detail — has path segment after /tenants/)
    if (method === 'GET') {
      const detailMatch = url.match(/\/tenants\/([a-zA-Z0-9_-]+)(?:\?|$)/);
      // Only match if the segment is NOT empty and looks like a tenant ID
      // (not a query param starting)
      if (detailMatch && !url.match(/\/tenants\?/)) {
        const pathAfterTenants = url.split('/tenants/')[1]?.split('?')[0] ?? '';
        if (pathAfterTenants && !pathAfterTenants.includes('/')) {
          const tenantId = pathAfterTenants;
          if (options?.onGetDetail) {
            const result = options.onGetDetail(tenantId);
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify(result),
            });
          } else {
            const tenant = tenants.find((t) => t.id === tenantId);
            if (tenant) {
              await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                  ...tenant,
                  plugins: tenant.plugins ?? [
                    {
                      id: 'tp1',
                      plugin: { name: 'Plugin A', version: '1.0.0', category: 'general' },
                      status: 'ACTIVE',
                    },
                  ],
                }),
              });
            } else {
              await route.fulfill({ status: 404 });
            }
          }
          return;
        }
      }

      // GET /tenants (list or stats) — discriminate via query params
      const params = getUrlParams(url);
      const status = params.get('status');
      const search = params.get('search');
      const limit = parseInt(params.get('limit') ?? '50', 10);
      const reqPage = parseInt(params.get('page') ?? '1', 10);

      // Filter by status if specified
      let filtered = tenants;
      if (status) {
        filtered = filtered.filter((t) => t.status === status);
      }

      // Filter by search (match name or slug, case-insensitive)
      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter(
          (t) => t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q)
        );
      }

      // For stats queries (limit=1), return just the count via pagination.total
      // but with minimal data
      if (limit === 1) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(paginatedWithTotal(filtered.slice(0, 1), filtered.length, 1, 1)),
        });
        return;
      }

      // Regular list query
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(paginated(filtered, reqPage, limit)),
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Plugin Mocks
// ---------------------------------------------------------------------------

/**
 * Mock the /api/admin/plugins endpoint with proper PaginatedResponse
 * and route discrimination for list vs stats vs categories vs detail.
 */
export async function mockPluginsApi(
  page: Page,
  plugins: MockPlugin[],
  options?: {
    onGetDetail?: (pluginId: string) => unknown;
    onDeprecate?: (pluginId: string) => unknown;
    onDelete?: (pluginId: string) => unknown;
    onGetInstalls?: (pluginId: string) => unknown;
  }
) {
  await page.route('**/api/admin/plugins**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    // Skip analytics sub-routes — they're handled by separate mocks
    if (url.includes('/analytics')) {
      await route.continue().catch(() => {
        // If no upstream, fulfill with empty
        route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      });
      return;
    }

    // GET /plugins/:id/installs
    if (method === 'GET' && url.match(/\/plugins\/[^/]+\/installs/)) {
      const pluginId = url.match(/\/plugins\/([^/]+)\/installs/)?.[1] ?? '';
      const result = options?.onGetInstalls?.(pluginId) ?? [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(result),
      });
      return;
    }

    // DELETE /plugins/:id
    if (method === 'DELETE') {
      const pluginId = url.split('/plugins/')[1]?.split('?')[0]?.split('/')[0] ?? '';
      const result = options?.onDelete?.(pluginId) ?? {
        message: 'Plugin deleted successfully',
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(result),
      });
      return;
    }

    // PATCH /plugins/:id (deprecate or update)
    if (method === 'PATCH') {
      const pluginId = url.split('/plugins/')[1]?.split('?')[0]?.split('/')[0] ?? '';
      const result = options?.onDeprecate?.(pluginId) ?? {
        ...(plugins.find((p) => p.id === pluginId) ?? plugins[0]),
        status: 'DEPRECATED',
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(result),
      });
      return;
    }

    // GET /plugins/:id (detail — no query params path segment)
    if (method === 'GET') {
      const pathAfterPlugins = url.split('/plugins/')[1]?.split('?')[0] ?? '';
      if (pathAfterPlugins && !pathAfterPlugins.includes('/')) {
        const pluginId = pathAfterPlugins;
        if (options?.onGetDetail) {
          const result = options.onGetDetail(pluginId);
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(result),
          });
        } else {
          const plugin = plugins.find((p) => p.id === pluginId);
          if (plugin) {
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify(plugin),
            });
          } else {
            await route.fulfill({ status: 404 });
          }
        }
        return;
      }

      // GET /plugins (list, stats, or categories query)
      const params = getUrlParams(url);
      const status = params.get('status');
      const search = params.get('search');
      const limit = parseInt(params.get('limit') ?? '50', 10);
      const reqPage = parseInt(params.get('page') ?? '1', 10);
      const category = params.get('category');

      let filtered = plugins;

      // Filter by status
      if (status) {
        filtered = filtered.filter((p) => p.status === status);
      }

      // Filter by category
      if (category) {
        filtered = filtered.filter((p) => p.category === category);
      }

      // Filter by search (match name or description, case-insensitive)
      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter(
          (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
        );
      }

      // Stats query (limit=1) — return count only
      if (limit === 1) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(paginatedWithTotal(filtered.slice(0, 1), filtered.length, 1, 1)),
        });
        return;
      }

      // Categories query (limit=100) — return all plugins (for category extraction)
      if (limit === 100) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(paginated(plugins, 1, 100)),
        });
        return;
      }

      // Regular list query
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(paginated(filtered, reqPage, limit)),
      });
    }
  });
}

// ---------------------------------------------------------------------------
// User Mocks
// ---------------------------------------------------------------------------

/**
 * Mock the /api/admin/users endpoint with PaginatedResponse.
 */
export async function mockUsersApi(page: Page, users: MockUser[]) {
  await page.route('**/api/admin/users**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (method !== 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }

    // GET /users/:id
    const pathAfterUsers = url.split('/users/')[1]?.split('?')[0] ?? '';
    if (pathAfterUsers && !pathAfterUsers.includes('/')) {
      const user = users.find((u) => u.id === pathAfterUsers);
      if (user) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(user),
        });
      } else {
        await route.fulfill({ status: 404 });
      }
      return;
    }

    // GET /users (list)
    const params = getUrlParams(url);
    const tenantId = params.get('tenantId');
    let filtered = users;
    if (tenantId) {
      filtered = users.filter((u) => u.tenantId === tenantId);
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(paginated(filtered)),
    });
  });
}

// ---------------------------------------------------------------------------
// Analytics Mocks
// ---------------------------------------------------------------------------

/**
 * Mock all /api/admin/analytics/* endpoints.
 * The admin-client returns RAW data (not wrapped in { data: ... }).
 */
export async function mockAnalyticsApi(
  page: Page,
  data: {
    overview: MockAnalyticsOverview;
    tenantGrowth?: MockTenantGrowthPoint[];
    pluginUsage?: MockPluginUsage[];
    apiCalls?: MockApiCallMetrics[];
  }
) {
  // Overview
  await page.route('**/api/admin/analytics/overview**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(data.overview),
    });
  });

  // Tenant growth — returns TenantGrowthDataPoint[] directly
  await page.route('**/api/admin/analytics/tenants**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(data.tenantGrowth ?? []),
    });
  });

  // Plugin usage — returns PluginUsageData[] directly
  await page.route('**/api/admin/analytics/plugins**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(data.pluginUsage ?? []),
    });
  });

  // API calls — returns ApiCallMetrics[] directly
  await page.route('**/api/admin/analytics/api-calls**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(data.apiCalls ?? []),
    });
  });
}

// ---------------------------------------------------------------------------
// Marketplace Mocks
// ---------------------------------------------------------------------------

/**
 * Mock marketplace search: GET /api/marketplace/plugins
 * Supports status and search query params for filtering.
 * Must be registered BEFORE the marketplace catch-all.
 */
export async function mockMarketplaceSearch(
  page: Page,
  plugins: Record<string, unknown>[],
  options?: {
    /** If provided, only return plugins matching this status when the request includes ?status= */
    filterByStatus?: boolean;
  }
) {
  // Handler shared by both glob registrations
  const handler = async (route: any) => {
    const url = route.request().url();
    const method = route.request().method();

    if (method !== 'GET') {
      await route
        .continue()
        .catch(() => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
      return;
    }

    const params = getUrlParams(url);
    const status = params.get('status');
    const search = params.get('search') || params.get('query');

    let filtered = plugins;

    if (options?.filterByStatus !== false && status) {
      filtered = filtered.filter((p) => (p as any).status === status);
    }

    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          ((p as any).name || '').toLowerCase().includes(q) ||
          ((p as any).description || '').toLowerCase().includes(q)
      );
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(paginated(filtered)),
    });
  };

  // Register for both patterns: without query params and with query params.
  // Playwright glob `**/api/marketplace/plugins` does NOT match URLs that
  // include a query string (e.g. ?status=PENDING_REVIEW&...), so we need
  // a second registration with `?*` to cover those requests.
  await page.route('**/api/marketplace/plugins', handler);
  await page.route('**/api/marketplace/plugins?*', handler);
}

/**
 * Mock marketplace plugin detail: GET /api/marketplace/plugins/:id
 * Also matches ?includeAllVersions=true used by PluginVersionManager.
 * Must be registered BEFORE the marketplace catch-all.
 */
export async function mockMarketplacePluginDetail(
  page: Page,
  pluginId: string,
  pluginData: Record<string, unknown>
) {
  await page.route(`**/api/marketplace/plugins/${pluginId}**`, async (route) => {
    const url = route.request().url();

    // Skip sub-routes like /analytics, /ratings, /review, /versions
    const afterId = url.split(`/plugins/${pluginId}`)[1] || '';
    const subPath = afterId.split('?')[0];
    if (subPath && subPath !== '' && subPath !== '/') {
      await route.fallback();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(pluginData),
    });
  });
}

/**
 * Mock plugin analytics: GET /api/marketplace/plugins/:id/analytics
 */
export async function mockPluginAnalyticsEndpoint(
  page: Page,
  pluginId: string,
  analyticsData: Record<string, unknown>,
  options?: {
    /** If provided, return different data per time range */
    timeRangeHandler?: (timeRange: string) => Record<string, unknown>;
  }
) {
  await page.route(`**/api/marketplace/plugins/${pluginId}/analytics**`, async (route) => {
    if (options?.timeRangeHandler) {
      const params = getUrlParams(route.request().url());
      const tr = params.get('timeRange') || '30d';
      const data = options.timeRangeHandler(tr);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(data),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(analyticsData),
      });
    }
  });
}

/**
 * Mock plugin ratings: GET /api/marketplace/plugins/:id/ratings
 */
export async function mockPluginRatingsEndpoint(
  page: Page,
  pluginId: string,
  ratingsData: Record<string, unknown>
) {
  await page.route(`**/api/marketplace/plugins/${pluginId}/ratings**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ratingsData),
    });
  });
}

/**
 * Mock plugin review: POST /api/marketplace/plugins/:id/review
 */
export async function mockPluginReviewEndpoint(
  page: Page,
  pluginId: string,
  options?: { success?: boolean; error?: string }
) {
  await page.route(`**/api/marketplace/plugins/${pluginId}/review`, async (route) => {
    if (options?.success === false) {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: options.error ?? 'Review failed' }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, status: 'PUBLISHED' }),
      });
    }
  });
}

/**
 * Mock publish plugin: POST /api/marketplace/publish
 */
export async function mockPublishPluginEndpoint(
  page: Page,
  responsePlugin?: Record<string, unknown>,
  options?: { success?: boolean; error?: string }
) {
  await page.route('**/api/marketplace/publish', async (route) => {
    if (options?.success === false) {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: options.error ?? 'Publish failed' }),
      });
    } else {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(
          responsePlugin ?? { id: 'new-plugin', name: 'New Plugin', status: 'PUBLISHED' }
        ),
      });
    }
  });
}

/**
 * Mock publish version: POST /api/marketplace/plugins/:id/versions
 */
export async function mockPublishVersionEndpoint(
  page: Page,
  pluginId: string,
  options?: { success?: boolean; error?: string }
) {
  await page.route(`**/api/marketplace/plugins/${pluginId}/versions`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }

    if (options?.success === false) {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: options.error ?? 'Version publish failed' }),
      });
    } else {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    }
  });
}

/**
 * Marketplace catch-all: matches any remaining /api/marketplace/** routes.
 * Must be registered LAST so specific marketplace mocks take priority.
 */
export async function mockMarketplaceCatchAll(page: Page) {
  await page.route('**/api/marketplace/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });
}

/**
 * @deprecated Use mockMarketplaceCatchAll instead. Kept for backward compatibility.
 */
export const mockMarketplaceApi = mockMarketplaceCatchAll;

// ---------------------------------------------------------------------------
// Convenience: Mock ALL endpoints with sensible defaults
// ---------------------------------------------------------------------------

export interface MockAllOptions {
  tenants?: MockTenant[];
  plugins?: MockPlugin[];
  users?: MockUser[];
  overview?: MockAnalyticsOverview;
  tenantGrowth?: MockTenantGrowthPoint[];
  pluginUsage?: MockPluginUsage[];
  apiCalls?: MockApiCallMetrics[];
  tenantOptions?: Parameters<typeof mockTenantsApi>[2];
  pluginOptions?: Parameters<typeof mockPluginsApi>[2];
  /** Marketplace plugin data for search results. If omitted, returns empty list. */
  marketplacePlugins?: Record<string, unknown>[];
  /** Whether to filter marketplace search by status query param. Default true. */
  marketplaceFilterByStatus?: boolean;
}

const DEFAULT_OVERVIEW: MockAnalyticsOverview = {
  totalTenants: 0,
  activeTenants: 0,
  suspendedTenants: 0,
  provisioningTenants: 0,
  totalPlugins: 0,
  totalPluginInstallations: 0,
  totalUsers: 0,
  totalWorkspaces: 0,
};

/**
 * Set up mocks for ALL admin API endpoints.
 *
 * Registration order matters — Playwright matches routes in registration order
 * (first match wins), so more specific routes are registered first:
 *   1. Analytics (most specific path segments)
 *   2. Marketplace-specific routes (before catch-all)
 *   3. Entity endpoints (tenants, plugins, users)
 *   4. Marketplace catch-all (last)
 */
export async function mockAllApis(page: Page, opts: MockAllOptions = {}) {
  // 1. Analytics first (most specific paths)
  await mockAnalyticsApi(page, {
    overview: opts.overview ?? DEFAULT_OVERVIEW,
    tenantGrowth: opts.tenantGrowth,
    pluginUsage: opts.pluginUsage,
    apiCalls: opts.apiCalls,
  });

  // 2. Marketplace search (before catch-all)
  if (opts.marketplacePlugins) {
    await mockMarketplaceSearch(page, opts.marketplacePlugins, {
      filterByStatus: opts.marketplaceFilterByStatus ?? true,
    });
  }

  // 3. Entity endpoints
  await mockTenantsApi(page, opts.tenants ?? [], opts.tenantOptions);
  await mockPluginsApi(page, opts.plugins ?? [], opts.pluginOptions);
  await mockUsersApi(page, opts.users ?? []);

  // 4. Marketplace catch-all (last)
  await mockMarketplaceCatchAll(page);
}
