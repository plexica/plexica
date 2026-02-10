// File: packages/api-client/__tests__/tenant-client.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import { TenantApiClient } from '../src/tenant-client.js';

describe('TenantApiClient', () => {
  let client: TenantApiClient;
  let mock: MockAdapter;

  beforeEach(() => {
    client = new TenantApiClient({
      baseUrl: 'http://localhost:3000',
      tenantSlug: 'acme',
      workspaceId: 'ws-1',
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mock = new MockAdapter((client as any).axios);
  });

  afterEach(() => {
    mock.restore();
  });

  // ---------------------------------------------------------------------------
  // Header injection
  // ---------------------------------------------------------------------------

  describe('Tenant/workspace header injection', () => {
    it('should inject X-Tenant-Slug and X-Workspace-ID headers', async () => {
      mock.onGet('/api/workspaces').reply((config) => {
        expect(config.headers?.['X-Tenant-Slug']).toBe('acme');
        expect(config.headers?.['X-Workspace-ID']).toBe('ws-1');
        return [200, []];
      });

      await client.getWorkspaces();
    });

    it('should update headers when tenant slug changes', async () => {
      client.setTenantSlug('newcorp');

      mock.onGet('/api/workspaces').reply((config) => {
        expect(config.headers?.['X-Tenant-Slug']).toBe('newcorp');
        return [200, []];
      });

      await client.getWorkspaces();
    });

    it('should update headers when workspace ID changes', async () => {
      client.setWorkspaceId('ws-99');

      mock.onGet('/api/workspaces').reply((config) => {
        expect(config.headers?.['X-Workspace-ID']).toBe('ws-99');
        return [200, []];
      });

      await client.getWorkspaces();
    });

    it('should not inject workspace header when workspace is null', async () => {
      client.setWorkspaceId(null);

      mock.onGet('/api/workspaces').reply((config) => {
        expect(config.headers?.['X-Tenant-Slug']).toBe('acme');
        // When workspaceId is null, the header should not be set
        // axios-mock-adapter may show undefined for missing headers
        expect(config.headers?.['X-Workspace-ID']).toBeFalsy();
        return [200, []];
      });

      await client.getWorkspaces();
    });

    it('should not inject tenant header when no slug configured', async () => {
      const noSlugClient = new TenantApiClient({ baseUrl: 'http://localhost:3000' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const noSlugMock = new MockAdapter((noSlugClient as any).axios);

      noSlugMock.onGet('/api/workspaces').reply((config) => {
        expect(config.headers?.['X-Tenant-Slug']).toBeFalsy();
        return [200, []];
      });

      await noSlugClient.getWorkspaces();
      noSlugMock.restore();
    });
  });

  // ---------------------------------------------------------------------------
  // Context getters/setters
  // ---------------------------------------------------------------------------

  describe('Context management', () => {
    it('should return tenant slug via getter', () => {
      expect(client.getTenantSlug()).toBe('acme');
    });

    it('should return workspace ID via getter', () => {
      expect(client.getWorkspaceId()).toBe('ws-1');
    });

    it('should clear all context', () => {
      client.clearContext();
      expect(client.getTenantSlug()).toBeNull();
      expect(client.getWorkspaceId()).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Auth endpoints
  // ---------------------------------------------------------------------------

  describe('Auth endpoints', () => {
    it('login should POST to /api/auth/login', async () => {
      mock
        .onPost('/api/auth/login', { email: 'a@b.c', password: 'pass' })
        .reply(200, { token: 'jwt', user: { id: '1' } });

      const result = await client.login('a@b.c', 'pass');
      expect(result.token).toBe('jwt');
    });

    it('logout should POST to /api/auth/logout', async () => {
      mock.onPost('/api/auth/logout').reply(200, { message: 'ok' });

      const result = await client.logout();
      expect(result.message).toBe('ok');
    });

    it('getCurrentUser should GET /api/auth/me', async () => {
      mock.onGet('/api/auth/me').reply(200, { id: '1', email: 'a@b.c', name: 'Test' });

      const result = await client.getCurrentUser();
      expect(result.id).toBe('1');
    });
  });

  // ---------------------------------------------------------------------------
  // Workspace endpoints
  // ---------------------------------------------------------------------------

  describe('Workspace endpoints', () => {
    it('getWorkspaces should GET /api/workspaces', async () => {
      mock.onGet('/api/workspaces').reply(200, [{ id: 'ws-1', name: 'Default' }]);

      const result = await client.getWorkspaces();
      expect(result).toHaveLength(1);
    });

    it('getWorkspace should GET /api/workspaces/:id', async () => {
      mock.onGet('/api/workspaces/ws-1').reply(200, { id: 'ws-1', name: 'Default' });

      const result = await client.getWorkspace('ws-1');
      expect(result.id).toBe('ws-1');
    });

    it('createWorkspace should POST /api/workspaces', async () => {
      mock.onPost('/api/workspaces').reply(201, { id: 'ws-2', name: 'New', slug: 'new' });

      const result = await client.createWorkspace({ slug: 'new', name: 'New' });
      expect(result.slug).toBe('new');
    });

    it('updateWorkspace should PATCH /api/workspaces/:id', async () => {
      mock.onPatch('/api/workspaces/ws-1').reply(200, { id: 'ws-1', name: 'Updated' });

      const result = await client.updateWorkspace('ws-1', { name: 'Updated' });
      expect(result.name).toBe('Updated');
    });

    it('deleteWorkspace should DELETE /api/workspaces/:id', async () => {
      mock.onDelete('/api/workspaces/ws-1').reply(200, { message: 'deleted' });

      const result = await client.deleteWorkspace('ws-1');
      expect(result.message).toBe('deleted');
    });
  });

  // ---------------------------------------------------------------------------
  // Workspace member endpoints
  // ---------------------------------------------------------------------------

  describe('Workspace member endpoints', () => {
    it('getWorkspaceMembers should GET /api/workspaces/:id/members', async () => {
      mock.onGet('/api/workspaces/ws-1/members').reply(200, [{ userId: 'u1', role: 'ADMIN' }]);

      const result = await client.getWorkspaceMembers('ws-1');
      expect(result).toHaveLength(1);
    });

    it('addWorkspaceMember should POST /api/workspaces/:id/members', async () => {
      mock.onPost('/api/workspaces/ws-1/members').reply(201, { userId: 'u2', role: 'MEMBER' });

      const result = await client.addWorkspaceMember('ws-1', { userId: 'u2', role: 'MEMBER' });
      expect(result.userId).toBe('u2');
    });

    it('updateWorkspaceMemberRole should PATCH /api/workspaces/:id/members/:userId', async () => {
      mock.onPatch('/api/workspaces/ws-1/members/u2').reply(200, { userId: 'u2', role: 'ADMIN' });

      const result = await client.updateWorkspaceMemberRole('ws-1', 'u2', { role: 'ADMIN' });
      expect(result.role).toBe('ADMIN');
    });

    it('removeWorkspaceMember should DELETE /api/workspaces/:id/members/:userId', async () => {
      mock.onDelete('/api/workspaces/ws-1/members/u2').reply(200, { message: 'removed' });

      const result = await client.removeWorkspaceMember('ws-1', 'u2');
      expect(result.message).toBe('removed');
    });
  });

  // ---------------------------------------------------------------------------
  // Plugin endpoints
  // ---------------------------------------------------------------------------

  describe('Plugin endpoints', () => {
    it('getPlugins should GET /api/plugins with params', async () => {
      mock.onGet('/api/plugins').reply(200, [{ id: 'p1', name: 'CRM' }]);

      const result = await client.getPlugins({ category: 'crm' });
      expect(result).toHaveLength(1);
    });

    it('installPlugin should POST to install endpoint', async () => {
      mock.onPost('/api/tenants/t1/plugins/p1/install').reply(200, { id: 'tp1', status: 'ACTIVE' });

      const result = await client.installPlugin('t1', 'p1', { apiKey: '123' });
      expect(result.status).toBe('ACTIVE');
    });

    it('activatePlugin should POST to activate endpoint', async () => {
      mock.onPost('/api/tenants/t1/plugins/p1/activate').reply(200, { status: 'ACTIVE' });

      const result = await client.activatePlugin('t1', 'p1');
      expect(result.status).toBe('ACTIVE');
    });

    it('deactivatePlugin should POST to deactivate endpoint', async () => {
      mock.onPost('/api/tenants/t1/plugins/p1/deactivate').reply(200, { status: 'INACTIVE' });

      const result = await client.deactivatePlugin('t1', 'p1');
      expect(result.status).toBe('INACTIVE');
    });

    it('uninstallPlugin should DELETE tenant plugin', async () => {
      mock.onDelete('/api/tenants/t1/plugins/p1').reply(200, { message: 'uninstalled' });

      const result = await client.uninstallPlugin('t1', 'p1');
      expect(result.message).toBe('uninstalled');
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
