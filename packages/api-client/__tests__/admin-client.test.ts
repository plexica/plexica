// File: packages/api-client/__tests__/admin-client.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import { AdminApiClient } from '../src/admin-client.js';

describe('AdminApiClient', () => {
  let client: AdminApiClient;
  let mock: MockAdapter;

  beforeEach(() => {
    client = new AdminApiClient({ baseUrl: 'http://localhost:3000' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mock = new MockAdapter((client as any).axios);
  });

  afterEach(() => {
    mock.restore();
  });

  // ---------------------------------------------------------------------------
  // Header stripping
  // ---------------------------------------------------------------------------

  describe('Admin header isolation', () => {
    it('should strip X-Tenant-Slug and X-Workspace-ID headers', async () => {
      mock.onGet('/api/admin/tenants').reply((config) => {
        // These headers should never be present in admin requests
        expect(config.headers?.['X-Tenant-Slug']).toBeUndefined();
        expect(config.headers?.['X-Workspace-ID']).toBeUndefined();
        return [200, { data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } }];
      });

      await client.getTenants();
    });
  });

  // ---------------------------------------------------------------------------
  // Tenant management
  // ---------------------------------------------------------------------------

  describe('Tenant management', () => {
    it('getTenants should GET /api/admin/tenants with params', async () => {
      const response = {
        data: [{ id: 't1', name: 'Acme', slug: 'acme' }],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      };
      mock.onGet('/api/admin/tenants').reply(200, response);

      const result = await client.getTenants({ search: 'acme' });
      expect(result.data).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
    });

    it('getTenant should GET /api/admin/tenants/:id', async () => {
      mock.onGet('/api/admin/tenants/t1').reply(200, { id: 't1', name: 'Acme' });

      const result = await client.getTenant('t1');
      expect(result.name).toBe('Acme');
    });

    it('createTenant should POST /api/admin/tenants', async () => {
      mock.onPost('/api/admin/tenants').reply(201, { id: 't2', name: 'Beta', slug: 'beta' });

      const result = await client.createTenant({ name: 'Beta', slug: 'beta' });
      expect(result.slug).toBe('beta');
    });

    it('updateTenant should PATCH /api/admin/tenants/:id', async () => {
      mock.onPatch('/api/admin/tenants/t1').reply(200, { id: 't1', name: 'Updated' });

      const result = await client.updateTenant('t1', { name: 'Updated' });
      expect(result.name).toBe('Updated');
    });

    it('deleteTenant should DELETE /api/admin/tenants/:id', async () => {
      mock.onDelete('/api/admin/tenants/t1').reply(200, { message: 'deleted' });

      const result = await client.deleteTenant('t1');
      expect(result.message).toBe('deleted');
    });

    it('suspendTenant should POST /api/admin/tenants/:id/suspend', async () => {
      mock.onPost('/api/admin/tenants/t1/suspend').reply(200, { id: 't1', status: 'SUSPENDED' });

      const result = await client.suspendTenant('t1');
      expect(result.status).toBe('SUSPENDED');
    });

    it('activateTenant should POST /api/admin/tenants/:id/activate', async () => {
      mock.onPost('/api/admin/tenants/t1/activate').reply(200, { id: 't1', status: 'ACTIVE' });

      const result = await client.activateTenant('t1');
      expect(result.status).toBe('ACTIVE');
    });
  });

  // ---------------------------------------------------------------------------
  // Plugin management
  // ---------------------------------------------------------------------------

  describe('Plugin management', () => {
    it('getPlugins should GET /api/admin/plugins', async () => {
      const response = {
        data: [{ id: 'p1', name: 'CRM' }],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      };
      mock.onGet('/api/admin/plugins').reply(200, response);

      const result = await client.getPlugins({ category: 'crm' });
      expect(result.data).toHaveLength(1);
    });

    it('getPlugin should GET /api/admin/plugins/:id', async () => {
      mock.onGet('/api/admin/plugins/p1').reply(200, { id: 'p1', name: 'CRM' });

      const result = await client.getPlugin('p1');
      expect(result.name).toBe('CRM');
    });

    it('createPlugin should POST /api/admin/plugins', async () => {
      mock.onPost('/api/admin/plugins').reply(201, { id: 'p2', name: 'Analytics' });

      const result = await client.createPlugin({
        name: 'Analytics',
        version: '1.0.0',
        description: 'Analytics plugin',
        category: 'analytics',
        author: 'Plexica',
      });
      expect(result.name).toBe('Analytics');
    });

    it('updatePlugin should PATCH /api/admin/plugins/:id', async () => {
      mock.onPatch('/api/admin/plugins/p1').reply(200, { id: 'p1', version: '2.0.0' });

      const result = await client.updatePlugin('p1', { version: '2.0.0' });
      expect(result.version).toBe('2.0.0');
    });

    it('deletePlugin should DELETE /api/admin/plugins/:id', async () => {
      mock.onDelete('/api/admin/plugins/p1').reply(200, { message: 'deleted' });

      const result = await client.deletePlugin('p1');
      expect(result.message).toBe('deleted');
    });
  });

  // ---------------------------------------------------------------------------
  // Marketplace
  // ---------------------------------------------------------------------------

  describe('Marketplace', () => {
    it('searchMarketplace should GET /api/marketplace/plugins', async () => {
      const response = {
        data: [{ id: 'p1', name: 'CRM' }],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      };
      mock.onGet('/api/marketplace/plugins').reply(200, response);

      const result = await client.searchMarketplace({ query: 'crm' });
      expect(result.data).toHaveLength(1);
    });

    it('getMarketplacePlugin should GET /api/marketplace/plugins/:id', async () => {
      mock.onGet('/api/marketplace/plugins/p1').reply(200, { id: 'p1', name: 'CRM' });

      const result = await client.getMarketplacePlugin('p1');
      expect(result.name).toBe('CRM');
    });

    it('getMarketplaceStats should GET /api/marketplace/stats', async () => {
      mock.onGet('/api/marketplace/stats').reply(200, { totalPlugins: 10, publishedPlugins: 8 });

      const result = await client.getMarketplaceStats();
      expect(result.totalPlugins).toBe(10);
    });

    it('reviewPlugin should POST review', async () => {
      mock
        .onPost('/api/marketplace/plugins/p1/review')
        .reply(200, { id: 'p1', status: 'PUBLISHED' });

      const result = await client.reviewPlugin('p1', { action: 'approve' });
      expect(result.status).toBe('PUBLISHED');
    });

    it('deprecatePlugin should POST deprecate', async () => {
      mock
        .onPost('/api/marketplace/plugins/p1/deprecate')
        .reply(200, { id: 'p1', status: 'DEPRECATED' });

      const result = await client.deprecatePlugin('p1');
      expect(result.status).toBe('DEPRECATED');
    });
  });

  // ---------------------------------------------------------------------------
  // Users
  // ---------------------------------------------------------------------------

  describe('User management', () => {
    it('getUsers should GET /api/admin/users', async () => {
      mock.onGet('/api/admin/users').reply(200, {
        data: [{ id: 'u1', email: 'a@b.c' }],
        pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
      });

      const result = await client.getUsers({ search: 'a@b' });
      expect(result.data).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
    });

    it('getUser should GET /api/admin/users/:id', async () => {
      mock.onGet('/api/admin/users/u1').reply(200, { id: 'u1', email: 'a@b.c' });

      const result = await client.getUser('u1');
      expect(result.email).toBe('a@b.c');
    });
  });

  // ---------------------------------------------------------------------------
  // Analytics
  // ---------------------------------------------------------------------------

  describe('Analytics', () => {
    it('getAnalyticsOverview should GET /api/admin/analytics/overview', async () => {
      mock.onGet('/api/admin/analytics/overview').reply(200, { totalTenants: 5, activeTenants: 4 });

      const result = await client.getAnalyticsOverview();
      expect(result.totalTenants).toBe(5);
    });

    it('getAnalyticsTenants should GET /api/admin/analytics/tenants', async () => {
      mock
        .onGet('/api/admin/analytics/tenants')
        .reply(200, [{ date: '2026-01-01', totalTenants: 5, newTenants: 1, activeTenants: 4 }]);

      const result = await client.getAnalyticsTenants({ period: '30d' });
      expect(result).toHaveLength(1);
    });

    it('getAnalyticsPlugins should GET /api/admin/analytics/plugins', async () => {
      mock.onGet('/api/admin/analytics/plugins').reply(200, [{ pluginId: 'p1', installCount: 10 }]);

      const result = await client.getAnalyticsPlugins();
      expect(result).toHaveLength(1);
    });

    it('getAnalyticsApiCalls should GET /api/admin/analytics/api-calls', async () => {
      mock
        .onGet('/api/admin/analytics/api-calls')
        .reply(200, [{ date: '2026-01-01', totalCalls: 100 }]);

      const result = await client.getAnalyticsApiCalls({ hours: 24 });
      expect(result).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Health check
  // ---------------------------------------------------------------------------

  describe('healthCheck', () => {
    it('should GET /health', async () => {
      mock.onGet('/health').reply(200, { status: 'ok' });

      const result = await client.healthCheck();
      expect(result.status).toBe('ok');
    });
  });
});
