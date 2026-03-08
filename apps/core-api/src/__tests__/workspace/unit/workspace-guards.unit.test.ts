import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports that pull in the mocked modules
// ---------------------------------------------------------------------------

vi.mock('../../../modules/workspace/workspace.service.js', () => ({
  workspaceService: {
    checkAccessAndGetMembership: vi.fn(),
  },
}));

// Hoist the shared isAncestorAdmin mock so it can be referenced both inside
// the vi.mock factory AND in the test assertions, without going through
// `mock.results` (which gets cleared by vi.clearAllMocks).
const mockIsAncestorAdmin = vi.hoisted(() => vi.fn());

vi.mock('../../../modules/workspace/workspace-hierarchy.service.js', () => {
  // Use a regular function (not an arrow function) so `new WorkspaceHierarchyService()`
  // works — arrow functions cannot be constructors (Vitest requirement).
  function WorkspaceHierarchyService() {
    return { isAncestorAdmin: mockIsAncestorAdmin };
  }
  return { WorkspaceHierarchyService: vi.fn(WorkspaceHierarchyService) };
});

vi.mock('../../../middleware/tenant-context.js', () => ({
  getWorkspaceIdOrThrow: vi.fn(),
  getWorkspaceId: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Subject under test (imported AFTER mocks are in place)
// ---------------------------------------------------------------------------

import { workspaceGuard } from '../../../modules/workspace/guards/workspace.guard.js';
import {
  workspaceRoleGuard,
  workspaceAdminGuard,
  workspaceMemberGuard,
  workspaceAnyMemberGuard,
} from '../../../modules/workspace/guards/workspace-role.guard.js';
import {
  WorkspaceRepositoryBase,
  ExampleContactRepository,
} from '../../../modules/workspace/guards/workspace.repository.base.js';
import { workspaceService } from '../../../modules/workspace/workspace.service.js';
import { getWorkspaceIdOrThrow, getWorkspaceId } from '../../../middleware/tenant-context.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockReply() {
  const reply = {
    code: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  return reply as unknown as FastifyReply;
}

function makeMockRequest(overrides: Partial<FastifyRequest> = {}): FastifyRequest {
  return {
    headers: {},
    params: {},
    query: {},
    body: null,
    log: { error: vi.fn(), warn: vi.fn() },
    ...overrides,
  } as unknown as FastifyRequest;
}

const mockTenantContext = {
  tenantId: 'tenant-1',
  tenantSlug: 'acme',
  schemaName: 'tenant_acme',
};

// ---------------------------------------------------------------------------
// workspaceGuard
// ---------------------------------------------------------------------------

describe('workspaceGuard', () => {
  const mockCheckAccess = vi.mocked(workspaceService.checkAccessAndGetMembership);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('tenant context validation', () => {
    it('should return 401 when tenant context is missing', async () => {
      const request = makeMockRequest({ tenant: undefined });
      const reply = makeMockReply();

      await workspaceGuard(request, reply);

      expect(reply.code).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({
        error: { code: 'UNAUTHORIZED', message: 'Tenant context not found' },
      });
    });
  });

  describe('user authentication validation', () => {
    it('should return 401 when user is not authenticated', async () => {
      const request = makeMockRequest({
        tenant: mockTenantContext as unknown as FastifyRequest['tenant'],
        user: undefined,
      });
      const reply = makeMockReply();

      await workspaceGuard(request, reply);

      expect(reply.code).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
      });
    });

    it('should return 401 when user has no id', async () => {
      const request = makeMockRequest({
        tenant: mockTenantContext as unknown as FastifyRequest['tenant'],
        user: { id: undefined } as unknown as FastifyRequest['user'],
      });
      const reply = makeMockReply();

      await workspaceGuard(request, reply);

      expect(reply.code).toHaveBeenCalledWith(401);
    });
  });

  describe('workspace ID extraction', () => {
    it('should return 400 when no workspace ID is provided', async () => {
      const request = makeMockRequest({
        tenant: mockTenantContext as unknown as FastifyRequest['tenant'],
        user: { id: 'user-1' } as unknown as FastifyRequest['user'],
        headers: {},
        params: {},
        query: {},
        body: null,
      });
      const reply = makeMockReply();

      await workspaceGuard(request, reply);

      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({
        error: {
          code: 'BAD_REQUEST',
          message: expect.stringContaining('Workspace ID required'),
        },
      });
    });

    it('should extract workspace ID from X-Workspace-ID header (highest priority)', async () => {
      mockCheckAccess.mockResolvedValue({
        exists: true,
        membership: {
          workspaceId: 'ws-header',
          userId: 'user-1',
          role: 'ADMIN',
          invitedBy: 'system',
          joinedAt: new Date(),
        },
        workspaceRow: { id: 'ws-header', path: 'ws-header' },
      });

      const request = makeMockRequest({
        tenant: mockTenantContext as unknown as FastifyRequest['tenant'],
        user: { id: 'user-1' } as unknown as FastifyRequest['user'],
        headers: { 'x-workspace-id': 'ws-header' },
        params: { workspaceId: 'ws-param' } as unknown as Record<string, string>,
      });
      const reply = makeMockReply();

      await workspaceGuard(request, reply);

      expect(mockCheckAccess).toHaveBeenCalledWith('ws-header', 'user-1', mockTenantContext);
    });

    it('should extract workspace ID from path param when header is absent', async () => {
      mockCheckAccess.mockResolvedValue({
        exists: true,
        membership: {
          workspaceId: 'ws-param',
          userId: 'user-1',
          role: 'MEMBER',
          invitedBy: 'admin',
          joinedAt: new Date(),
        },
        workspaceRow: { id: 'ws-param', path: 'ws-param' },
      });

      const request = makeMockRequest({
        tenant: mockTenantContext as unknown as FastifyRequest['tenant'],
        user: { id: 'user-1' } as unknown as FastifyRequest['user'],
        headers: {},
        params: { workspaceId: 'ws-param' } as unknown as Record<string, string>,
      });
      const reply = makeMockReply();

      await workspaceGuard(request, reply);

      expect(mockCheckAccess).toHaveBeenCalledWith('ws-param', 'user-1', mockTenantContext);
    });

    it('should extract workspace ID from query string when header and param are absent', async () => {
      mockCheckAccess.mockResolvedValue({
        exists: true,
        membership: {
          workspaceId: 'ws-query',
          userId: 'user-1',
          role: 'VIEWER',
          invitedBy: 'admin',
          joinedAt: new Date(),
        },
        workspaceRow: { id: 'ws-query', path: 'ws-query' },
      });

      const request = makeMockRequest({
        tenant: mockTenantContext as unknown as FastifyRequest['tenant'],
        user: { id: 'user-1' } as unknown as FastifyRequest['user'],
        headers: {},
        params: {} as unknown as Record<string, string>,
        query: { workspaceId: 'ws-query' } as unknown as Record<string, string>,
      });
      const reply = makeMockReply();

      await workspaceGuard(request, reply);

      expect(mockCheckAccess).toHaveBeenCalledWith('ws-query', 'user-1', mockTenantContext);
    });

    it('should extract workspace ID from body when all other sources are absent', async () => {
      mockCheckAccess.mockResolvedValue({
        exists: true,
        membership: {
          workspaceId: 'ws-body',
          userId: 'user-1',
          role: 'MEMBER',
          invitedBy: 'admin',
          joinedAt: new Date(),
        },
        workspaceRow: { id: 'ws-body', path: 'ws-body' },
      });

      const request = makeMockRequest({
        tenant: mockTenantContext as unknown as FastifyRequest['tenant'],
        user: { id: 'user-1' } as unknown as FastifyRequest['user'],
        headers: {},
        params: {} as unknown as Record<string, string>,
        query: {} as unknown as Record<string, string>,
        body: { workspaceId: 'ws-body' },
      });
      const reply = makeMockReply();

      await workspaceGuard(request, reply);

      expect(mockCheckAccess).toHaveBeenCalledWith('ws-body', 'user-1', mockTenantContext);
    });
  });

  describe('workspace existence and access checks', () => {
    it('should return 404 when workspace does not exist', async () => {
      mockCheckAccess.mockResolvedValue({
        exists: false,
        membership: null,
        workspaceRow: null,
      });

      const request = makeMockRequest({
        tenant: mockTenantContext as unknown as FastifyRequest['tenant'],
        user: { id: 'user-1' } as unknown as FastifyRequest['user'],
        headers: { 'x-workspace-id': 'ws-missing' },
      });
      const reply = makeMockReply();

      await workspaceGuard(request, reply);

      expect(reply.code).toHaveBeenCalledWith(404);
      expect(reply.send).toHaveBeenCalledWith({
        error: {
          code: 'WORKSPACE_NOT_FOUND',
          message: expect.stringContaining('Workspace not found'),
        },
      });
    });

    it('should attach workspaceMembership and workspaceAccess for direct members', async () => {
      const joinedAt = new Date('2025-01-01');
      mockCheckAccess.mockResolvedValue({
        exists: true,
        membership: {
          workspaceId: 'ws-1',
          userId: 'user-1',
          role: 'ADMIN',
          invitedBy: 'system',
          joinedAt,
        },
        workspaceRow: { id: 'ws-1', path: 'ws-1' },
      });

      const request = makeMockRequest({
        tenant: mockTenantContext as unknown as FastifyRequest['tenant'],
        user: { id: 'user-1' } as unknown as FastifyRequest['user'],
        headers: { 'x-workspace-id': 'ws-1' },
      });
      const reply = makeMockReply();

      await workspaceGuard(request, reply);

      expect(request.workspaceMembership).toEqual({
        workspaceId: 'ws-1',
        userId: 'user-1',
        role: 'ADMIN',
        invitedBy: 'system',
        joinedAt,
      });
      expect(request.workspaceAccess).toEqual({
        workspaceId: 'ws-1',
        userId: 'user-1',
        role: 'ADMIN',
        accessType: 'direct',
      });
      expect(reply.code).not.toHaveBeenCalled();
    });

    it('should attach MEMBER role correctly for direct member', async () => {
      mockCheckAccess.mockResolvedValue({
        exists: true,
        membership: {
          workspaceId: 'ws-1',
          userId: 'user-1',
          role: 'MEMBER',
          invitedBy: 'admin',
          joinedAt: new Date(),
        },
        workspaceRow: { id: 'ws-1', path: 'ws-1' },
      });

      const request = makeMockRequest({
        tenant: mockTenantContext as unknown as FastifyRequest['tenant'],
        user: { id: 'user-1' } as unknown as FastifyRequest['user'],
        headers: { 'x-workspace-id': 'ws-1' },
      });
      const reply = makeMockReply();

      await workspaceGuard(request, reply);

      expect(request.workspaceAccess?.role).toBe('MEMBER');
      expect(request.workspaceAccess?.accessType).toBe('direct');
    });
  });

  describe('hierarchical access fallback', () => {
    it('should grant HIERARCHICAL_READER access when user is ancestor admin', async () => {
      mockCheckAccess.mockResolvedValue({
        exists: true,
        membership: null,
        workspaceRow: { id: 'ws-child', path: 'ws-root/ws-child' },
      });
      mockIsAncestorAdmin.mockResolvedValue(true);

      const request = makeMockRequest({
        tenant: mockTenantContext as unknown as FastifyRequest['tenant'],
        user: { id: 'user-ancestor' } as unknown as FastifyRequest['user'],
        headers: { 'x-workspace-id': 'ws-child' },
      });
      const reply = makeMockReply();

      await workspaceGuard(request, reply);

      expect(request.workspaceAccess).toEqual({
        workspaceId: 'ws-child',
        userId: 'user-ancestor',
        role: 'HIERARCHICAL_READER',
        accessType: 'ancestor_admin',
      });
      expect(reply.code).not.toHaveBeenCalled();
    });

    it('should return 403 when user is not an ancestor admin', async () => {
      mockCheckAccess.mockResolvedValue({
        exists: true,
        membership: null,
        workspaceRow: { id: 'ws-child', path: 'ws-root/ws-child' },
      });
      mockIsAncestorAdmin.mockResolvedValue(false);

      const request = makeMockRequest({
        tenant: mockTenantContext as unknown as FastifyRequest['tenant'],
        user: { id: 'user-stranger' } as unknown as FastifyRequest['user'],
        headers: { 'x-workspace-id': 'ws-child' },
      });
      const reply = makeMockReply();

      await workspaceGuard(request, reply);

      expect(reply.code).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith({
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: expect.stringContaining('do not have access'),
        },
      });
    });

    it('should return 403 without calling hierarchy check when workspace has no ancestors (root workspace)', async () => {
      mockCheckAccess.mockResolvedValue({
        exists: true,
        membership: null,
        workspaceRow: { id: 'ws-root', path: 'ws-root' }, // no slash → root
      });

      const request = makeMockRequest({
        tenant: mockTenantContext as unknown as FastifyRequest['tenant'],
        user: { id: 'user-1' } as unknown as FastifyRequest['user'],
        headers: { 'x-workspace-id': 'ws-root' },
      });
      const reply = makeMockReply();

      await workspaceGuard(request, reply);

      expect(mockIsAncestorAdmin).not.toHaveBeenCalled();
      expect(reply.code).toHaveBeenCalledWith(403);
    });

    it('should return 403 without hierarchy check when workspaceRow has no path', async () => {
      mockCheckAccess.mockResolvedValue({
        exists: true,
        membership: null,
        workspaceRow: null,
      });

      const request = makeMockRequest({
        tenant: mockTenantContext as unknown as FastifyRequest['tenant'],
        user: { id: 'user-1' } as unknown as FastifyRequest['user'],
        headers: { 'x-workspace-id': 'ws-1' },
      });
      const reply = makeMockReply();

      await workspaceGuard(request, reply);

      expect(mockIsAncestorAdmin).not.toHaveBeenCalled();
      expect(reply.code).toHaveBeenCalledWith(403);
    });
  });

  describe('error handling', () => {
    it('should return 500 when checkAccessAndGetMembership throws', async () => {
      mockCheckAccess.mockRejectedValue(new Error('DB connection failed'));

      const request = makeMockRequest({
        tenant: mockTenantContext as unknown as FastifyRequest['tenant'],
        user: { id: 'user-1' } as unknown as FastifyRequest['user'],
        headers: { 'x-workspace-id': 'ws-1' },
      });
      const reply = makeMockReply();

      await workspaceGuard(request, reply);

      expect(reply.code).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith({
        error: {
          code: 'INTERNAL_ERROR',
          message: expect.stringContaining('Failed to validate'),
        },
      });
    });

    it('should return 500 when isAncestorAdmin throws', async () => {
      mockCheckAccess.mockResolvedValue({
        exists: true,
        membership: null,
        workspaceRow: { id: 'ws-child', path: 'ws-root/ws-child' },
      });
      mockIsAncestorAdmin.mockRejectedValue(new Error('Redis timeout'));

      const request = makeMockRequest({
        tenant: mockTenantContext as unknown as FastifyRequest['tenant'],
        user: { id: 'user-1' } as unknown as FastifyRequest['user'],
        headers: { 'x-workspace-id': 'ws-child' },
      });
      const reply = makeMockReply();

      await workspaceGuard(request, reply);

      expect(reply.code).toHaveBeenCalledWith(500);
    });
  });
});

// ---------------------------------------------------------------------------
// workspaceRoleGuard
// ---------------------------------------------------------------------------

describe('workspaceRoleGuard', () => {
  describe('factory function', () => {
    it('should return a middleware function', () => {
      const guard = workspaceRoleGuard(['ADMIN']);
      expect(typeof guard).toBe('function');
    });
  });

  describe('membership validation', () => {
    it('should return 403 when workspaceMembership is not set on request', async () => {
      const guard = workspaceRoleGuard(['ADMIN']);
      const request = makeMockRequest({ workspaceMembership: undefined });
      const reply = makeMockReply();

      await guard(request, reply);

      expect(reply.code).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith({
        error: expect.objectContaining({ code: 'MISSING_WORKSPACE_MEMBERSHIP' }),
      });
    });
  });

  describe('role enforcement', () => {
    it('should allow request when user has the required role (ADMIN)', async () => {
      const guard = workspaceRoleGuard(['ADMIN']);
      const request = makeMockRequest({
        workspaceMembership: {
          workspaceId: 'ws-1',
          userId: 'user-1',
          role: 'ADMIN',
          invitedBy: 'system',
          joinedAt: new Date(),
        },
      });
      const reply = makeMockReply();

      await guard(request, reply);

      expect(reply.code).not.toHaveBeenCalled();
      expect(reply.send).not.toHaveBeenCalled();
    });

    it('should allow request when user has one of multiple allowed roles', async () => {
      const guard = workspaceRoleGuard(['ADMIN', 'MEMBER']);
      const request = makeMockRequest({
        workspaceMembership: {
          workspaceId: 'ws-1',
          userId: 'user-1',
          role: 'MEMBER',
          invitedBy: 'admin',
          joinedAt: new Date(),
        },
      });
      const reply = makeMockReply();

      await guard(request, reply);

      expect(reply.code).not.toHaveBeenCalled();
    });

    it('should return 403 when user role is not in required roles list', async () => {
      const guard = workspaceRoleGuard(['ADMIN']);
      const request = makeMockRequest({
        workspaceMembership: {
          workspaceId: 'ws-1',
          userId: 'user-1',
          role: 'MEMBER',
          invitedBy: 'admin',
          joinedAt: new Date(),
        },
      });
      const reply = makeMockReply();

      await guard(request, reply);

      expect(reply.code).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith({
        error: expect.objectContaining({ code: 'INSUFFICIENT_PERMISSIONS' }),
      });
    });

    it('should return 403 for VIEWER trying admin-only route', async () => {
      const guard = workspaceRoleGuard(['ADMIN']);
      const request = makeMockRequest({
        workspaceMembership: {
          workspaceId: 'ws-1',
          userId: 'user-viewer',
          role: 'VIEWER',
          invitedBy: 'admin',
          joinedAt: new Date(),
        },
      });
      const reply = makeMockReply();

      await guard(request, reply);

      expect(reply.code).toHaveBeenCalledWith(403);
    });

    it('should allow VIEWER on an any-member route', async () => {
      const guard = workspaceRoleGuard(['ADMIN', 'MEMBER', 'VIEWER']);
      const request = makeMockRequest({
        workspaceMembership: {
          workspaceId: 'ws-1',
          userId: 'user-viewer',
          role: 'VIEWER',
          invitedBy: 'admin',
          joinedAt: new Date(),
        },
      });
      const reply = makeMockReply();

      await guard(request, reply);

      expect(reply.code).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should return 500 when an unexpected error is thrown', async () => {
      // Simulate log.error not existing by triggering an error during role check
      const guard = workspaceRoleGuard(['ADMIN']);
      const request = {
        // Intentionally broken: membership is a getter that throws
        get workspaceMembership(): never {
          throw new Error('unexpected error');
        },
        log: { error: vi.fn() },
      } as unknown as FastifyRequest;
      const reply = makeMockReply();

      await guard(request, reply);

      expect(reply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('pre-built guard helpers', () => {
    it('workspaceAdminGuard should only allow ADMIN', async () => {
      const adminReq = makeMockRequest({
        workspaceMembership: {
          workspaceId: 'ws-1',
          userId: 'u1',
          role: 'ADMIN',
          invitedBy: 'system',
          joinedAt: new Date(),
        },
      });
      const memberReq = makeMockRequest({
        workspaceMembership: {
          workspaceId: 'ws-1',
          userId: 'u2',
          role: 'MEMBER',
          invitedBy: 'admin',
          joinedAt: new Date(),
        },
      });
      const adminReply = makeMockReply();
      const memberReply = makeMockReply();

      await workspaceAdminGuard(adminReq, adminReply);
      await workspaceAdminGuard(memberReq, memberReply);

      expect(adminReply.code).not.toHaveBeenCalled();
      expect(memberReply.code).toHaveBeenCalledWith(403);
    });

    it('workspaceMemberGuard should allow ADMIN and MEMBER but not VIEWER', async () => {
      const roles: Array<'ADMIN' | 'MEMBER' | 'VIEWER'> = ['ADMIN', 'MEMBER', 'VIEWER'];
      const results: boolean[] = [];

      for (const role of roles) {
        const req = makeMockRequest({
          workspaceMembership: {
            workspaceId: 'ws-1',
            userId: 'u1',
            role,
            invitedBy: 'admin',
            joinedAt: new Date(),
          },
        });
        const rep = makeMockReply();
        await workspaceMemberGuard(req, rep);
        results.push(vi.mocked(rep.code).mock.calls.length === 0); // true = allowed
      }

      expect(results).toEqual([true, true, false]);
    });

    it('workspaceAnyMemberGuard should allow all roles', async () => {
      const roles: Array<'ADMIN' | 'MEMBER' | 'VIEWER'> = ['ADMIN', 'MEMBER', 'VIEWER'];

      for (const role of roles) {
        const req = makeMockRequest({
          workspaceMembership: {
            workspaceId: 'ws-1',
            userId: 'u1',
            role,
            invitedBy: 'admin',
            joinedAt: new Date(),
          },
        });
        const rep = makeMockReply();
        await workspaceAnyMemberGuard(req, rep);
        expect(rep.code).not.toHaveBeenCalled();
      }
    });
  });
});

// ---------------------------------------------------------------------------
// WorkspaceRepositoryBase
// ---------------------------------------------------------------------------

describe('WorkspaceRepositoryBase', () => {
  const mockGetWorkspaceIdOrThrow = vi.mocked(getWorkspaceIdOrThrow);
  const mockGetWorkspaceId = vi.mocked(getWorkspaceId);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Concrete subclass for testing the abstract base
   */
  class TestRepository extends WorkspaceRepositoryBase {
    publicGetWorkspaceId() {
      return this.getWorkspaceId();
    }

    publicGetWorkspaceIdOptional() {
      return this.getWorkspaceIdOptional();
    }

    publicApplyWorkspaceFilter<T extends object>(query: T) {
      return this.applyWorkspaceFilter(query);
    }

    publicApplyWorkspaceFilterOptional<T extends object>(query: T) {
      return this.applyWorkspaceFilterOptional(query);
    }

    publicHasWorkspaceContext() {
      return this.hasWorkspaceContext();
    }
  }

  describe('getWorkspaceId (required)', () => {
    it('should return workspace ID from context', () => {
      mockGetWorkspaceIdOrThrow.mockReturnValue('ws-123');
      const repo = new TestRepository();

      const result = repo.publicGetWorkspaceId();

      expect(result).toBe('ws-123');
      expect(mockGetWorkspaceIdOrThrow).toHaveBeenCalledOnce();
    });

    it('should propagate error when no workspace context is set', () => {
      mockGetWorkspaceIdOrThrow.mockImplementation(() => {
        throw new Error('No workspace context available');
      });
      const repo = new TestRepository();

      expect(() => repo.publicGetWorkspaceId()).toThrow('No workspace context available');
    });
  });

  describe('getWorkspaceIdOptional', () => {
    it('should return workspace ID when context is available', () => {
      mockGetWorkspaceId.mockReturnValue('ws-456');
      const repo = new TestRepository();

      expect(repo.publicGetWorkspaceIdOptional()).toBe('ws-456');
    });

    it('should return undefined when no workspace context is set', () => {
      mockGetWorkspaceId.mockReturnValue(undefined);
      const repo = new TestRepository();

      expect(repo.publicGetWorkspaceIdOptional()).toBeUndefined();
    });
  });

  describe('applyWorkspaceFilter', () => {
    it('should merge workspace ID into empty query', () => {
      mockGetWorkspaceIdOrThrow.mockReturnValue('ws-789');
      const repo = new TestRepository();

      const result = repo.publicApplyWorkspaceFilter({});

      expect(result).toEqual({ workspaceId: 'ws-789' });
    });

    it('should merge workspace ID with existing query fields', () => {
      mockGetWorkspaceIdOrThrow.mockReturnValue('ws-789');
      const repo = new TestRepository();

      const result = repo.publicApplyWorkspaceFilter({ status: 'active', priority: 'high' });

      expect(result).toEqual({ status: 'active', priority: 'high', workspaceId: 'ws-789' });
    });

    it('should override workspaceId if already present in query (context takes precedence)', () => {
      mockGetWorkspaceIdOrThrow.mockReturnValue('ws-context');
      const repo = new TestRepository();

      const result = repo.publicApplyWorkspaceFilter({ workspaceId: 'ws-old' });

      expect(result.workspaceId).toBe('ws-context');
    });
  });

  describe('applyWorkspaceFilterOptional', () => {
    it('should add workspace ID when context is available', () => {
      mockGetWorkspaceId.mockReturnValue('ws-opt');
      const repo = new TestRepository();

      const result = repo.publicApplyWorkspaceFilterOptional({ name: 'test' });

      expect(result).toEqual({ name: 'test', workspaceId: 'ws-opt' });
    });

    it('should return query unchanged when no workspace context', () => {
      mockGetWorkspaceId.mockReturnValue(undefined);
      const repo = new TestRepository();

      const originalQuery = { name: 'test' };
      const result = repo.publicApplyWorkspaceFilterOptional(originalQuery);

      expect(result).toEqual({ name: 'test' });
      // Should not have workspaceId key
      expect('workspaceId' in result).toBe(false);
    });
  });

  describe('hasWorkspaceContext', () => {
    it('should return true when workspace context is set', () => {
      mockGetWorkspaceId.mockReturnValue('ws-1');
      const repo = new TestRepository();

      expect(repo.publicHasWorkspaceContext()).toBe(true);
    });

    it('should return false when no workspace context', () => {
      mockGetWorkspaceId.mockReturnValue(undefined);
      const repo = new TestRepository();

      expect(repo.publicHasWorkspaceContext()).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// ExampleContactRepository (illustrative class in repository.base.ts)
// ---------------------------------------------------------------------------

describe('ExampleContactRepository', () => {
  const mockGetWorkspaceIdOrThrow = vi.mocked(getWorkspaceIdOrThrow);

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetWorkspaceIdOrThrow.mockReturnValue('ws-contact');
  });

  function makePrismaClient() {
    return {
      contact: {
        findMany: vi.fn().mockResolvedValue([{ id: 'c1' }]),
        findUnique: vi.fn().mockResolvedValue({ id: 'c1' }),
        create: vi.fn().mockResolvedValue({ id: 'c2', workspaceId: 'ws-contact' }),
        update: vi.fn().mockResolvedValue({ id: 'c1', name: 'updated' }),
        delete: vi.fn().mockResolvedValue({ id: 'c1' }),
      },
    };
  }

  it('findAll should query with workspace filter', async () => {
    const repo = new ExampleContactRepository();
    const client = makePrismaClient();

    await repo.findAll(client);

    expect(client.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: 'ws-contact' } })
    );
  });

  it('findById should query with workspace filter and id', async () => {
    const repo = new ExampleContactRepository();
    const client = makePrismaClient();

    await repo.findById(client, 'c1');

    expect(client.contact.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c1', workspaceId: 'ws-contact' } })
    );
  });

  it('create should inject workspace ID into data', async () => {
    const repo = new ExampleContactRepository();
    const client = makePrismaClient();

    await repo.create(client, { name: 'Alice' });

    expect(client.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: 'Alice', workspaceId: 'ws-contact' } })
    );
  });

  it('update should scope to workspace', async () => {
    const repo = new ExampleContactRepository();
    const client = makePrismaClient();

    await repo.update(client, 'c1', { name: 'Bob' });

    expect(client.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1', workspaceId: 'ws-contact' },
        data: { name: 'Bob' },
      })
    );
  });

  it('delete should scope to workspace', async () => {
    const repo = new ExampleContactRepository();
    const client = makePrismaClient();

    await repo.delete(client, 'c1');

    expect(client.contact.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c1', workspaceId: 'ws-contact' } })
    );
  });
});
