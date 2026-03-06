// apps/web/src/__tests__/admin/admin-api.test.ts
//
// T010-27: Unit tests for api/admin.ts (lines 259–419).
// These functions are thin wrappers around adminApiClient — they delegate to
// raw().get/post/patch/delete. We test that:
//   1. The correct HTTP method and URL are called.
//   2. Parameters/DTOs are forwarded.
//   3. URLSearchParams logic for getTenantAuditLogs works correctly.
//
// Constitution Art. 8.1 — unit tests for all business logic.
// Constitution Art. 8.2 — deterministic, independent, AAA pattern.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock adminApiClient so no real HTTP calls are made.
// The raw() helper in admin.ts casts adminApiClient to { get, post, patch, delete }.
// We mock those four methods directly on the exported singleton.
//
// vi.hoisted() ensures the mock references are available when vi.mock() factory
// runs (vi.mock is hoisted to the top of the file by Vitest's transform).
// ---------------------------------------------------------------------------

const { mockGet, mockPost, mockPatch, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockPatch: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  adminApiClient: {
    get: mockGet,
    post: mockPost,
    patch: mockPatch,
    delete: mockDelete,
  },
}));

// Import after mock setup
import {
  getTenantDashboard,
  getTenantUsers,
  inviteTenantUser,
  updateTenantUser,
  deactivateTenantUser,
  reactivateTenantUser,
  getTenantTeams,
  createTenantTeam,
  updateTenantTeam,
  deleteTenantTeam,
  addTeamMember,
  removeTeamMember,
  getTenantRoles,
  createTenantRole,
  updateTenantRole,
  deleteTenantRole,
  getTenantPermissions,
  getTenantSettings,
  updateTenantSettings,
  getTenantAuditLogs,
  exportTenantAuditLogs,
} from '@/api/admin';

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

describe('getTenantDashboard', () => {
  it('calls GET /api/v1/tenant/dashboard and returns the response', async () => {
    const dashboard = { totalUsers: 10, activeUsers: 8, pendingInvitations: 2 };
    mockGet.mockResolvedValueOnce(dashboard);

    const result = await getTenantDashboard();

    expect(mockGet).toHaveBeenCalledWith('/api/v1/tenant/dashboard');
    expect(result).toEqual(dashboard);
  });
});

// ---------------------------------------------------------------------------
// User management
// ---------------------------------------------------------------------------

describe('getTenantUsers', () => {
  it('calls GET /api/v1/tenant/users without params', async () => {
    mockGet.mockResolvedValueOnce({ data: [], pagination: {} });

    await getTenantUsers();

    expect(mockGet).toHaveBeenCalledWith('/api/v1/tenant/users', undefined);
  });

  it('forwards search/status/page/limit params', async () => {
    mockGet.mockResolvedValueOnce({ data: [], pagination: {} });
    const params = { search: 'alice', status: 'active' as const, page: 2, limit: 25 };

    await getTenantUsers(params);

    expect(mockGet).toHaveBeenCalledWith('/api/v1/tenant/users', params);
  });
});

describe('inviteTenantUser', () => {
  it('calls POST /api/v1/tenant/users/invite with the DTO', async () => {
    const dto = { email: 'alice@example.com', roleId: 'role-1', teamIds: ['t-1'] };
    const created = { id: 'u-1', ...dto, status: 'invited' };
    mockPost.mockResolvedValueOnce(created);

    const result = await inviteTenantUser(dto);

    expect(mockPost).toHaveBeenCalledWith('/api/v1/tenant/users/invite', dto);
    expect(result).toEqual(created);
  });
});

describe('updateTenantUser', () => {
  it('calls PATCH /api/v1/tenant/users/:id with the DTO', async () => {
    const dto = { roleId: 'role-admin' };
    mockPatch.mockResolvedValueOnce({ id: 'u-1', ...dto });

    await updateTenantUser('u-1', dto);

    expect(mockPatch).toHaveBeenCalledWith('/api/v1/tenant/users/u-1', dto);
  });
});

describe('deactivateTenantUser', () => {
  it('calls POST /api/v1/tenant/users/:id/deactivate', async () => {
    mockPost.mockResolvedValueOnce({ id: 'u-1', status: 'inactive' });

    await deactivateTenantUser('u-1');

    expect(mockPost).toHaveBeenCalledWith('/api/v1/tenant/users/u-1/deactivate');
  });
});

describe('reactivateTenantUser', () => {
  it('calls POST /api/v1/tenant/users/:id/reactivate', async () => {
    mockPost.mockResolvedValueOnce({ id: 'u-1', status: 'active' });

    await reactivateTenantUser('u-1');

    expect(mockPost).toHaveBeenCalledWith('/api/v1/tenant/users/u-1/reactivate');
  });
});

// ---------------------------------------------------------------------------
// Team management
// ---------------------------------------------------------------------------

describe('getTenantTeams', () => {
  it('calls GET /api/v1/tenant/teams without params', async () => {
    mockGet.mockResolvedValueOnce({ data: [], pagination: {} });

    await getTenantTeams();

    expect(mockGet).toHaveBeenCalledWith('/api/v1/tenant/teams', undefined);
  });

  it('forwards search/page/limit params', async () => {
    mockGet.mockResolvedValueOnce({ data: [], pagination: {} });
    const params = { search: 'eng', page: 1, limit: 10 };

    await getTenantTeams(params);

    expect(mockGet).toHaveBeenCalledWith('/api/v1/tenant/teams', params);
  });
});

describe('createTenantTeam', () => {
  it('calls POST /api/v1/tenant/teams with the DTO', async () => {
    const dto = { name: 'Engineering', description: 'Core eng' };
    mockPost.mockResolvedValueOnce({ id: 't-1', ...dto });

    await createTenantTeam(dto);

    expect(mockPost).toHaveBeenCalledWith('/api/v1/tenant/teams', dto);
  });
});

describe('updateTenantTeam', () => {
  it('calls PATCH /api/v1/tenant/teams/:teamId with the DTO', async () => {
    const dto = { name: 'Platform Eng' };
    mockPatch.mockResolvedValueOnce({ id: 't-1', ...dto });

    await updateTenantTeam('t-1', dto);

    expect(mockPatch).toHaveBeenCalledWith('/api/v1/tenant/teams/t-1', dto);
  });
});

describe('deleteTenantTeam', () => {
  it('calls DELETE /api/v1/tenant/teams/:teamId', async () => {
    mockDelete.mockResolvedValueOnce({ message: 'Team deleted' });

    await deleteTenantTeam('t-1');

    expect(mockDelete).toHaveBeenCalledWith('/api/v1/tenant/teams/t-1');
  });
});

describe('addTeamMember', () => {
  it('calls POST /api/v1/tenant/teams/:teamId/members with the DTO', async () => {
    const dto = { userId: 'u-2', role: 'MEMBER' as const };
    mockPost.mockResolvedValueOnce({ userId: 'u-2', role: 'MEMBER' });

    await addTeamMember('t-1', dto);

    expect(mockPost).toHaveBeenCalledWith('/api/v1/tenant/teams/t-1/members', dto);
  });
});

describe('removeTeamMember', () => {
  it('calls DELETE /api/v1/tenant/teams/:teamId/members/:userId', async () => {
    mockDelete.mockResolvedValueOnce({ message: 'Member removed' });

    await removeTeamMember('t-1', 'u-2');

    expect(mockDelete).toHaveBeenCalledWith('/api/v1/tenant/teams/t-1/members/u-2');
  });
});

// ---------------------------------------------------------------------------
// Roles & Permissions
// ---------------------------------------------------------------------------

describe('getTenantRoles', () => {
  it('calls GET /api/v1/tenant/roles', async () => {
    mockGet.mockResolvedValueOnce([]);

    await getTenantRoles();

    expect(mockGet).toHaveBeenCalledWith('/api/v1/tenant/roles');
  });
});

describe('createTenantRole', () => {
  it('calls POST /api/v1/tenant/roles with the DTO', async () => {
    const dto = { name: 'viewer', permissions: ['perm-1'] };
    mockPost.mockResolvedValueOnce({ id: 'r-1', ...dto });

    await createTenantRole(dto);

    expect(mockPost).toHaveBeenCalledWith('/api/v1/tenant/roles', dto);
  });
});

describe('updateTenantRole', () => {
  it('calls PATCH /api/v1/tenant/roles/:roleId with the DTO', async () => {
    const dto = { permissions: ['perm-1', 'perm-2'] };
    mockPatch.mockResolvedValueOnce({ id: 'r-1', ...dto });

    await updateTenantRole('r-1', dto);

    expect(mockPatch).toHaveBeenCalledWith('/api/v1/tenant/roles/r-1', dto);
  });
});

describe('deleteTenantRole', () => {
  it('calls DELETE /api/v1/tenant/roles/:roleId', async () => {
    mockDelete.mockResolvedValueOnce({ message: 'Role deleted' });

    await deleteTenantRole('r-1');

    expect(mockDelete).toHaveBeenCalledWith('/api/v1/tenant/roles/r-1');
  });
});

describe('getTenantPermissions', () => {
  it('calls GET /api/v1/tenant/permissions', async () => {
    mockGet.mockResolvedValueOnce([]);

    await getTenantPermissions();

    expect(mockGet).toHaveBeenCalledWith('/api/v1/tenant/permissions');
  });
});

// ---------------------------------------------------------------------------
// Tenant Settings
// ---------------------------------------------------------------------------

describe('getTenantSettings', () => {
  it('calls GET /api/v1/tenant/settings', async () => {
    mockGet.mockResolvedValueOnce({ sharingEnabled: true });

    await getTenantSettings();

    expect(mockGet).toHaveBeenCalledWith('/api/v1/tenant/settings');
  });
});

describe('updateTenantSettings', () => {
  it('calls PATCH /api/v1/tenant/settings with the DTO', async () => {
    const dto: import('@/api/admin').UpdateTenantSettingsDto = {
      preferences: { defaultLocale: 'it' },
    };
    mockPatch.mockResolvedValueOnce({ preferences: { defaultLocale: 'it' } });

    await updateTenantSettings(dto);

    expect(mockPatch).toHaveBeenCalledWith('/api/v1/tenant/settings', dto);
  });
});

// ---------------------------------------------------------------------------
// Audit Logs — URLSearchParams logic (lines 403–413)
// ---------------------------------------------------------------------------

describe('getTenantAuditLogs', () => {
  it('calls GET /api/v1/tenant/audit-logs without filters (no query string)', async () => {
    mockGet.mockResolvedValueOnce({ data: [], pagination: {} });

    await getTenantAuditLogs();

    expect(mockGet).toHaveBeenCalledWith('/api/v1/tenant/audit-logs');
  });

  it('appends userId filter to URL', async () => {
    mockGet.mockResolvedValueOnce({ data: [], pagination: {} });

    await getTenantAuditLogs({ userId: 'u-1' });

    const url = mockGet.mock.calls[0][0] as string;
    expect(url).toContain('userId=u-1');
  });

  it('appends action filter to URL', async () => {
    mockGet.mockResolvedValueOnce({ data: [], pagination: {} });

    await getTenantAuditLogs({ action: 'USER_INVITED' });

    const url = mockGet.mock.calls[0][0] as string;
    expect(url).toContain('action=USER_INVITED');
  });

  it('appends resourceType filter to URL', async () => {
    mockGet.mockResolvedValueOnce({ data: [], pagination: {} });

    await getTenantAuditLogs({ resourceType: 'workspace' });

    const url = mockGet.mock.calls[0][0] as string;
    expect(url).toContain('resourceType=workspace');
  });

  it('appends startDate and endDate filters', async () => {
    mockGet.mockResolvedValueOnce({ data: [], pagination: {} });

    await getTenantAuditLogs({ startDate: '2026-01-01', endDate: '2026-01-31' });

    const url = mockGet.mock.calls[0][0] as string;
    expect(url).toContain('startDate=2026-01-01');
    expect(url).toContain('endDate=2026-01-31');
  });

  it('appends page and limit filters', async () => {
    mockGet.mockResolvedValueOnce({ data: [], pagination: {} });

    await getTenantAuditLogs({ page: 2, limit: 50 });

    const url = mockGet.mock.calls[0][0] as string;
    expect(url).toContain('page=2');
    expect(url).toContain('limit=50');
  });

  it('omits undefined filter keys from query string', async () => {
    mockGet.mockResolvedValueOnce({ data: [], pagination: {} });

    // Only action provided — others should be absent
    await getTenantAuditLogs({ action: 'LOGIN' });

    const url = mockGet.mock.calls[0][0] as string;
    expect(url).not.toContain('userId=');
    expect(url).not.toContain('resourceType=');
    expect(url).toContain('action=LOGIN');
  });

  it('combines multiple filters into a single query string', async () => {
    mockGet.mockResolvedValueOnce({ data: [], pagination: {} });

    await getTenantAuditLogs({ userId: 'u-1', action: 'TEAM_CREATED', page: 1, limit: 20 });

    const url = mockGet.mock.calls[0][0] as string;
    expect(url).toContain('userId=u-1');
    expect(url).toContain('action=TEAM_CREATED');
    expect(url).toContain('page=1');
    expect(url).toContain('limit=20');
  });
});

describe('exportTenantAuditLogs', () => {
  it('calls POST /api/v1/tenant/audit-logs/export with the DTO', async () => {
    const dto = { format: 'csv' as const, filters: { action: 'LOGIN' } };
    mockPost.mockResolvedValueOnce({ jobId: 'job-abc' });

    const result = await exportTenantAuditLogs(dto);

    expect(mockPost).toHaveBeenCalledWith('/api/v1/tenant/audit-logs/export', dto);
    expect(result).toEqual({ jobId: 'job-abc' });
  });
});
