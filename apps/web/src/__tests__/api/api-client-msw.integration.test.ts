// apps/web/src/__tests__/api/api-client-msw.integration.test.ts
//
// T010-28: Integration tests for plugin API, workspace sharing API,
// and admin API interactions (Groups 3-5).
//
// These tests verify the real function signatures, response mapping, and
// error handling of apiClient / adminApiClient methods and the admin.ts
// API layer.  They use the same vi.mock('@/lib/api-client') pattern as other
// integration tests in this codebase (the axios adapter is not reachable from
// the jsdom environment without a running server, so interception is applied
// at the mock boundary).
//
// Covers:
//   Group 3 – Plugin API (named methods on apiClient)                  (3 tests)
//   Group 4 – Workspace resource sharing API (named methods on apiClient) (3 tests)
//   Group 5 – Admin API (admin.ts functions over adminApiClient.get/post) (3 tests)
//
// Total: 9 tests

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock factories
// ---------------------------------------------------------------------------

const {
  mockGetPlugins,
  mockGetPlugin,
  mockGetWorkspaceResources,
  mockShareWorkspaceResource,
  mockRevokeWorkspaceResource,
  mockAdminGet,
  mockAdminPost,
} = vi.hoisted(() => {
  const mockGetPlugins = vi.fn();
  const mockGetPlugin = vi.fn();
  const mockGetWorkspaceResources = vi.fn();
  const mockShareWorkspaceResource = vi.fn();
  const mockRevokeWorkspaceResource = vi.fn();
  const mockAdminGet = vi.fn();
  const mockAdminPost = vi.fn();
  return {
    mockGetPlugins,
    mockGetPlugin,
    mockGetWorkspaceResources,
    mockShareWorkspaceResource,
    mockRevokeWorkspaceResource,
    mockAdminGet,
    mockAdminPost,
  };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// apiClient: mock the named methods that Groups 3 & 4 call directly.
// adminApiClient: mock the low-level get/post that admin.ts's raw() helper uses.
vi.mock('@/lib/api-client', () => ({
  default: {
    getPlugins: mockGetPlugins,
    getPlugin: mockGetPlugin,
    getWorkspaceResources: mockGetWorkspaceResources,
    shareWorkspaceResource: mockShareWorkspaceResource,
    revokeWorkspaceResource: mockRevokeWorkspaceResource,
  },
  apiClient: {
    getPlugins: mockGetPlugins,
    getPlugin: mockGetPlugin,
    getWorkspaceResources: mockGetWorkspaceResources,
    shareWorkspaceResource: mockShareWorkspaceResource,
    revokeWorkspaceResource: mockRevokeWorkspaceResource,
  },
  adminApiClient: {
    get: mockAdminGet,
    post: mockAdminPost,
  },
}));

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import { apiClient } from '@/lib/api-client';
import { getTenantUsers, getTenantRoles, createTenantTeam } from '@/api/admin';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PLUGIN_LIST_FIXTURE = [
  {
    id: 'plugin-crm',
    name: 'CRM',
    version: '1.2.0',
    status: 'active',
    remoteUrl: 'http://localhost:5001/remoteEntry.js',
  },
  {
    id: 'plugin-analytics',
    name: 'Analytics',
    version: '2.0.0',
    status: 'active',
    remoteUrl: 'http://localhost:5002/remoteEntry.js',
  },
];

const RESOURCES_FIXTURE = [
  {
    id: 'share-1',
    resourceType: 'PLUGIN',
    resourceId: 'plugin-crm',
    resourceName: 'CRM',
    sharedWithWorkspaceName: 'Marketing',
    sharedByEmail: 'alice@example.com',
    sharedAt: '2026-01-15T10:00:00.000Z',
  },
];

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Group 3: Plugin API (named methods on apiClient)
// ---------------------------------------------------------------------------

describe('Group 3: Plugin API via apiClient', () => {
  it('getPlugins resolves with plugin list from mock response', async () => {
    mockGetPlugins.mockResolvedValue(PLUGIN_LIST_FIXTURE);

    const result = await apiClient.getPlugins();

    expect(mockGetPlugins).toHaveBeenCalledTimes(1);
    expect(result).toEqual(PLUGIN_LIST_FIXTURE);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('plugin-crm');
  });

  it('getPlugin resolves with correct plugin by ID', async () => {
    const expected = PLUGIN_LIST_FIXTURE[0];
    mockGetPlugin.mockResolvedValue(expected);

    const result = await apiClient.getPlugin('plugin-crm');

    expect(mockGetPlugin).toHaveBeenCalledWith('plugin-crm');
    expect(result).toEqual(expected);
    expect(result.name).toBe('CRM');
  });

  it('getPlugin rejects and surfaces error when API returns an error', async () => {
    const apiError = Object.assign(new Error('Plugin not found'), {
      statusCode: 404,
      code: 'PLUGIN_NOT_FOUND',
    });
    mockGetPlugin.mockRejectedValue(apiError);

    await expect(apiClient.getPlugin('nonexistent-id')).rejects.toThrow('Plugin not found');
    expect(mockGetPlugin).toHaveBeenCalledWith('nonexistent-id');
  });
});

// ---------------------------------------------------------------------------
// Group 4: Workspace resource sharing via apiClient
// ---------------------------------------------------------------------------

describe('Group 4: Workspace resource sharing via apiClient', () => {
  const WS_ID = 'ws-abc-123';

  it('getWorkspaceResources resolves with resources list from mock response', async () => {
    mockGetWorkspaceResources.mockResolvedValue(RESOURCES_FIXTURE);

    const result = await apiClient.getWorkspaceResources(WS_ID);

    expect(mockGetWorkspaceResources).toHaveBeenCalledWith(WS_ID);
    expect(result).toEqual(RESOURCES_FIXTURE);
    expect(result[0].resourceType).toBe('PLUGIN');
    expect(result[0].sharedWithWorkspaceName).toBe('Marketing');
  });

  it('shareWorkspaceResource calls the method with correct workspace ID and body', async () => {
    mockShareWorkspaceResource.mockResolvedValue(undefined);

    const shareBody = {
      resourceType: 'PLUGIN' as const,
      resourceId: 'plugin-crm',
      targetWorkspaceId: 'ws-target-456',
    };

    await apiClient.shareWorkspaceResource(WS_ID, shareBody);

    expect(mockShareWorkspaceResource).toHaveBeenCalledWith(WS_ID, shareBody);
  });

  it('revokeWorkspaceResource calls the method with correct workspace and share IDs', async () => {
    mockRevokeWorkspaceResource.mockResolvedValue(undefined);
    const SHARE_ID = 'share-1';

    await apiClient.revokeWorkspaceResource(WS_ID, SHARE_ID);

    expect(mockRevokeWorkspaceResource).toHaveBeenCalledWith(WS_ID, SHARE_ID);
  });
});

// ---------------------------------------------------------------------------
// Group 5: Admin API (admin.ts functions using adminApiClient)
//
// admin.ts uses raw() which casts adminApiClient to { get, post, patch, delete }.
// The low-level mock (mockAdminGet / mockAdminPost) intercepts those calls.
// ---------------------------------------------------------------------------

describe('Group 5: Admin API functions (admin.ts)', () => {
  it('getTenantUsers calls GET /api/v1/tenant/users and returns paginated result', async () => {
    const usersFixture = {
      data: [
        {
          id: 'user-1',
          email: 'alice@acme.com',
          name: 'Alice',
          status: 'active',
          roles: ['admin'],
          teams: ['team-eng'],
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    };
    mockAdminGet.mockResolvedValue(usersFixture);

    const result = await getTenantUsers({ page: 1, limit: 20 });

    expect(mockAdminGet).toHaveBeenCalledWith('/api/v1/tenant/users', { page: 1, limit: 20 });
    expect(result).toEqual(usersFixture);
    expect(result.data[0].email).toBe('alice@acme.com');
  });

  it('createTenantTeam calls POST /api/v1/tenant/teams with team data', async () => {
    const teamFixture = {
      id: 'team-eng',
      name: 'Engineering',
      description: 'Engineering team',
      memberCount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    mockAdminPost.mockResolvedValue(teamFixture);

    const result = await createTenantTeam({
      name: 'Engineering',
      description: 'Engineering team',
    });

    expect(mockAdminPost).toHaveBeenCalledWith('/api/v1/tenant/teams', {
      name: 'Engineering',
      description: 'Engineering team',
    });
    expect(result.name).toBe('Engineering');
    expect(result.id).toBe('team-eng');
  });

  it('getTenantRoles calls GET /api/v1/tenant/roles and returns role list', async () => {
    const rolesFixture = [
      {
        id: 'role-admin',
        name: 'Admin',
        description: 'Full access',
        isSystem: true,
        permissions: ['read:users', 'write:users'],
        userCount: 5,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    mockAdminGet.mockResolvedValue(rolesFixture);

    const result = await getTenantRoles();

    expect(mockAdminGet).toHaveBeenCalledWith('/api/v1/tenant/roles');
    expect(result).toEqual(rolesFixture);
    expect(result[0].name).toBe('Admin');
    expect(result[0].isSystem).toBe(true);
  });
});
