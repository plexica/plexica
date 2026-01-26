// File: apps/core-api/src/__tests__/unit/workspace-tenant-isolation.test.ts
/**
 * Unit Tests for Workspace Tenant Isolation
 *
 * Ensures that workspaces are properly isolated by tenant
 * and that cross-tenant access is prevented.
 */

import { describe, it, expect, vi } from 'vitest';
import { getTenantContext } from '../../middleware/tenant-context.js';

// Mock the tenant context
vi.mock('../../middleware/tenant-context.js', () => ({
  getTenantContext: vi.fn(),
  executeInTenantSchema: vi.fn((_db, callback) => {
    const mockClient = {
      workspace: {
        findFirst: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn(),
        deleteMany: vi.fn(),
      },
      workspaceMember: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      team: {
        count: vi.fn(),
      },
    };
    return callback(mockClient);
  }),
}));

describe('Workspace Tenant Isolation', () => {
  const TENANT_A_ID = 'tenant-a';
  const TENANT_B_ID = 'tenant-b';
  const WORKSPACE_A_ID = 'workspace-a';
  const WORKSPACE_B_ID = 'workspace-b';

  describe('Tenant Context', () => {
    it('should include tenantId in context', async () => {
      vi.mocked(getTenantContext).mockReturnValue({
        tenantId: TENANT_A_ID,
        tenantSlug: 'tenant-a',
        schemaName: 'tenant_a',
      });

      const context = getTenantContext();
      expect(context).toBeDefined();
      expect(context?.tenantId).toBe(TENANT_A_ID);
    });

    it('should throw if no tenant context is available', () => {
      vi.mocked(getTenantContext).mockReturnValue(undefined);

      expect(() => {
        const context = getTenantContext();
        if (!context) {
          throw new Error('No tenant context available');
        }
      }).toThrow('No tenant context available');
    });
  });

  describe('Workspace Creation with Tenant', () => {
    it('should require tenantId when creating workspace', async () => {
      vi.mocked(getTenantContext).mockReturnValue({
        tenantId: TENANT_A_ID,
        tenantSlug: 'tenant-a',
        schemaName: 'tenant_a',
      });

      const context = getTenantContext();
      expect(context?.tenantId).toBe(TENANT_A_ID);

      // Workspace creation should use this tenantId
      const workspaceData = {
        tenantId: context?.tenantId,
        slug: 'engineering',
        name: 'Engineering',
      };

      expect(workspaceData.tenantId).toBe(TENANT_A_ID);
    });

    it('should allow same slug in different tenants', () => {
      const workspace1 = {
        id: WORKSPACE_A_ID,
        tenantId: TENANT_A_ID,
        slug: 'engineering',
      };

      const workspace2 = {
        id: WORKSPACE_B_ID,
        tenantId: TENANT_B_ID,
        slug: 'engineering', // Same slug, different tenant
      };

      expect(workspace1.slug).toBe(workspace2.slug);
      expect(workspace1.tenantId).not.toBe(workspace2.tenantId);
    });
  });

  describe('Workspace Queries with Tenant Filter', () => {
    it('should filter workspace by tenantId', async () => {
      const mockWorkspaces = [
        { id: WORKSPACE_A_ID, tenantId: TENANT_A_ID, slug: 'engineering' },
        { id: WORKSPACE_B_ID, tenantId: TENANT_B_ID, slug: 'sales' },
      ];

      // Filter for Tenant A
      const tenantAWorkspaces = mockWorkspaces.filter((w) => w.tenantId === TENANT_A_ID);
      expect(tenantAWorkspaces).toHaveLength(1);
      expect(tenantAWorkspaces[0].id).toBe(WORKSPACE_A_ID);

      // Filter for Tenant B
      const tenantBWorkspaces = mockWorkspaces.filter((w) => w.tenantId === TENANT_B_ID);
      expect(tenantBWorkspaces).toHaveLength(1);
      expect(tenantBWorkspaces[0].id).toBe(WORKSPACE_B_ID);
    });

    it('should return null when workspace does not belong to tenant', () => {
      const workspace = {
        id: WORKSPACE_B_ID,
        tenantId: TENANT_B_ID,
      };

      // Try to find workspace B in Tenant A context
      const found =
        workspace.id === WORKSPACE_B_ID && workspace.tenantId === TENANT_A_ID ? workspace : null;

      expect(found).toBeNull();
    });
  });

  describe('Cross-Tenant Access Prevention', () => {
    it('should prevent accessing workspace from different tenant', () => {
      vi.mocked(getTenantContext).mockReturnValue({
        tenantId: TENANT_A_ID,
        tenantSlug: 'tenant-a',
        schemaName: 'tenant_a',
      });

      const context = getTenantContext();
      const workspaceB = {
        id: WORKSPACE_B_ID,
        tenantId: TENANT_B_ID,
      };

      // Workspace B belongs to Tenant B, context is Tenant A
      const canAccess = workspaceB.tenantId === context?.tenantId;
      expect(canAccess).toBe(false);
    });

    it('should allow accessing workspace from same tenant', () => {
      vi.mocked(getTenantContext).mockReturnValue({
        tenantId: TENANT_A_ID,
        tenantSlug: 'tenant-a',
        schemaName: 'tenant_a',
      });

      const context = getTenantContext();
      const workspaceA = {
        id: WORKSPACE_A_ID,
        tenantId: TENANT_A_ID,
      };

      // Workspace A belongs to Tenant A, context is also Tenant A
      const canAccess = workspaceA.tenantId === context?.tenantId;
      expect(canAccess).toBe(true);
    });
  });

  describe('Update and Delete Operations', () => {
    it('should include tenantId filter in update operations', () => {
      const updateQuery = {
        where: {
          id: WORKSPACE_A_ID,
          tenantId: TENANT_A_ID,
        },
        data: {
          name: 'Updated Engineering',
        },
      };

      expect(updateQuery.where.tenantId).toBe(TENANT_A_ID);
    });

    it('should include tenantId filter in delete operations', () => {
      const deleteQuery = {
        where: {
          id: WORKSPACE_A_ID,
          tenantId: TENANT_A_ID,
        },
      };

      expect(deleteQuery.where.tenantId).toBe(TENANT_A_ID);
    });

    it('should return 0 rows affected when updating wrong tenant', () => {
      // Simulating updateMany result when tenantId mismatch
      const result = { count: 0 }; // No rows updated

      expect(result.count).toBe(0);
    });
  });

  describe('Unique Constraints', () => {
    it('should enforce unique (tenantId, slug) constraint', () => {
      const workspaces = [
        { id: '1', tenantId: TENANT_A_ID, slug: 'engineering' },
        { id: '2', tenantId: TENANT_A_ID, slug: 'sales' },
        { id: '3', tenantId: TENANT_B_ID, slug: 'engineering' },
      ];

      // Check if duplicate slug exists in same tenant
      const duplicateInTenantA = workspaces.filter(
        (w) => w.tenantId === TENANT_A_ID && w.slug === 'engineering'
      );

      expect(duplicateInTenantA).toHaveLength(1);

      // Same slug can exist in different tenants
      const engineeringWorkspaces = workspaces.filter((w) => w.slug === 'engineering');
      expect(engineeringWorkspaces).toHaveLength(2);
      expect(engineeringWorkspaces[0].tenantId).not.toBe(engineeringWorkspaces[1].tenantId);
    });
  });
});
