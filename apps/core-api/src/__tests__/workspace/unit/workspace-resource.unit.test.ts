/**
 * Workspace Resource Service Unit Tests
 *
 * Tests the WorkspaceResourceService for cross-workspace resource sharing:
 * - shareResource(): Create resource links with settings enforcement
 * - unshareResource(): Remove resource links
 * - listResources(): Query shared resources with pagination and filtering
 * - getResource(): Fetch specific resource link
 * - isResourceShared(): Check sharing status
 *
 * Spec Reference: Spec 009, Task 3 (Cross-Workspace Resource Sharing)
 * Constitution: Art. 1.2 (Multi-Tenancy Isolation), Art. 8.1 (Required Test Types)
 *
 * Strategy:
 * - Mock PrismaClient to simulate database operations and tenant-scoped transactions
 * - Mock EventBusService to capture published events
 * - Verify business logic, error handling, and event publishing
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { WORKSPACE_EVENTS } from '@plexica/event-bus';
import { WorkspaceResourceService } from '../../../modules/workspace/workspace-resource.service';
import type {
  ShareResourceDto,
  ListSharedResourcesDto,
} from '../../../modules/workspace/dto/index.js';

// ---------------------------------------------------------------------------
// Mock Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a mock PrismaClient for resource service operations.
 */
function createMockDb(overrides: { queryRawResults?: unknown[][]; executeRawResults?: number[] }): {
  _tx: { $executeRaw: Mock; $queryRaw: Mock };
  $transaction: Mock;
  $queryRaw: Mock;
  $executeRaw: Mock;
} {
  const queryRawResults = [...(overrides.queryRawResults ?? [])];
  const executeRawResults = [...(overrides.executeRawResults ?? [])];

  const queryRawImpl = () => Promise.resolve(queryRawResults.shift() ?? []);
  const executeRawImpl = () => Promise.resolve(executeRawResults.shift() ?? 1);

  const mockTx = {
    $executeRaw: vi.fn().mockImplementation(executeRawImpl),
    $queryRaw: vi.fn().mockImplementation(queryRawImpl),
  };

  const mockDb = {
    $transaction: vi.fn().mockImplementation(async (callback: (tx: typeof mockTx) => unknown) => {
      return callback(mockTx);
    }),
    $queryRaw: vi.fn().mockImplementation(queryRawImpl),
    $executeRaw: vi.fn().mockImplementation(executeRawImpl),
    _tx: mockTx,
  };

  return mockDb;
}

/**
 * Creates a mock EventBusService.
 */
function createMockEventBus() {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
    publishBatch: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue('sub-1'),
    shutdown: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Creates a mock Pino logger.
 */
function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
    level: 'info',
    silent: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Shared Constants
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-123-456';
const WORKSPACE_ID = 'ws-111-222-333';
const RESOURCE_ID = 'plugin-aaa-bbb-ccc';
const USER_ID = 'user-001';
const SCHEMA_NAME = 'tenant_acme';
const RESOURCE_LINK_ID = 'link-999-888-777';

const tenantCtx = {
  tenantId: TENANT_ID,
  tenantSlug: 'acme',
  schemaName: SCHEMA_NAME,
  userId: USER_ID,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkspaceResourceService', () => {
  let service: WorkspaceResourceService;
  let mockEventBus: ReturnType<typeof createMockEventBus>;
  let mockLogger: ReturnType<typeof createMockLogger>;

  describe('shareResource()', () => {
    describe('success cases', () => {
      beforeEach(() => {
        mockEventBus = createMockEventBus();
        mockLogger = createMockLogger();

        const mockDb = createMockDb({
          queryRawResults: [
            // Workspace settings check (allowCrossWorkspaceSharing: true)
            [{ id: WORKSPACE_ID, settings: { allowCrossWorkspaceSharing: true } }],
            // Duplicate check (no existing resource)
            [],
            // gen_random_uuid() for resource link ID
            [{ id: RESOURCE_LINK_ID }],
            // Fetch created resource
            [
              {
                id: RESOURCE_LINK_ID,
                workspace_id: WORKSPACE_ID,
                resource_type: 'plugin',
                resource_id: RESOURCE_ID,
                created_at: new Date('2026-02-17T10:00:00Z'),
              },
            ],
          ],
        });

        service = new WorkspaceResourceService(
          mockDb as any,
          mockEventBus as any,
          mockLogger as any
        );
      });

      it('should share a resource and publish RESOURCE_SHARED event', async () => {
        const dto: ShareResourceDto = {
          resourceType: 'plugin',
          resourceId: RESOURCE_ID,
        };

        const result = await service.shareResource(WORKSPACE_ID, dto, USER_ID, tenantCtx);

        // Verify result (service returns snake_case from database)
        expect(result.id).toBe(RESOURCE_LINK_ID);
        expect(result.workspace_id).toBe(WORKSPACE_ID);
        expect(result.resource_type).toBe('plugin');
        expect(result.resource_id).toBe(RESOURCE_ID);
        expect(result.created_at).toBeInstanceOf(Date);

        // Verify event published
        expect(mockEventBus.publish).toHaveBeenCalledWith(
          'plexica.workspace.lifecycle',
          WORKSPACE_EVENTS.RESOURCE_SHARED,
          {
            workspaceId: WORKSPACE_ID,
            resourceType: 'plugin',
            resourceId: RESOURCE_ID,
            sharedBy: USER_ID,
          },
          {
            tenantId: TENANT_ID,
            workspaceId: WORKSPACE_ID,
            userId: USER_ID,
          }
        );

        // Verify logging
        expect(mockLogger.info).toHaveBeenCalledWith(
          {
            workspaceId: WORKSPACE_ID,
            resourceType: 'plugin',
            resourceId: RESOURCE_ID,
            userId: USER_ID,
            tenantId: TENANT_ID,
          },
          expect.stringContaining('Shared resource')
        );
      });

      it('should handle event publishing failure gracefully (non-blocking)', async () => {
        mockEventBus.publish.mockRejectedValueOnce(new Error('Event bus unavailable'));

        const dto: ShareResourceDto = {
          resourceType: 'template',
          resourceId: RESOURCE_ID,
        };

        const result = await service.shareResource(WORKSPACE_ID, dto, USER_ID, tenantCtx);

        // Operation should succeed despite event failure
        expect(result.id).toBe(RESOURCE_LINK_ID);

        // Warning should be logged
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Error: Event bus unavailable',
          }),
          'Failed to publish RESOURCE_SHARED event'
        );
      });
    });

    describe('error cases', () => {
      it('should throw SHARING_DISABLED error when workspace disallows sharing', async () => {
        const mockDb = createMockDb({
          queryRawResults: [
            // Workspace settings check (allowCrossWorkspaceSharing: false)
            [{ id: WORKSPACE_ID, settings: { allowCrossWorkspaceSharing: false } }],
            // Second call - reset mock
            [{ id: WORKSPACE_ID, settings: { allowCrossWorkspaceSharing: false } }],
          ],
        });

        service = new WorkspaceResourceService(mockDb as any, undefined, mockLogger as any);

        const dto: ShareResourceDto = {
          resourceType: 'plugin',
          resourceId: RESOURCE_ID,
        };

        // Verify error is thrown
        await expect(service.shareResource(WORKSPACE_ID, dto, USER_ID, tenantCtx)).rejects.toThrow(
          'Cross-workspace sharing is disabled for this workspace'
        );

        // Verify error details by catching the error
        try {
          await service.shareResource(WORKSPACE_ID, dto, USER_ID, tenantCtx);
          // Should not reach here
          expect.fail('Expected error to be thrown');
        } catch (error: any) {
          expect(error.code).toBe('SHARING_DISABLED');
          expect(error.statusCode).toBe(403);
          expect(error.details).toEqual({
            workspaceId: WORKSPACE_ID,
            allowCrossWorkspaceSharing: false,
          });
        }
      });

      it('should throw SHARING_DISABLED when settings is missing (default false)', async () => {
        const mockDb = createMockDb({
          queryRawResults: [
            // Workspace settings check (no settings object)
            [{ id: WORKSPACE_ID, settings: null }],
          ],
        });

        service = new WorkspaceResourceService(mockDb as any, undefined, mockLogger as any);

        const dto: ShareResourceDto = {
          resourceType: 'dataset',
          resourceId: RESOURCE_ID,
        };

        await expect(service.shareResource(WORKSPACE_ID, dto, USER_ID, tenantCtx)).rejects.toThrow(
          'Cross-workspace sharing is disabled for this workspace'
        );
      });

      it('should throw error when workspace not found', async () => {
        const mockDb = createMockDb({
          queryRawResults: [
            // Workspace settings check (workspace not found)
            [],
          ],
        });

        service = new WorkspaceResourceService(mockDb as any, undefined, mockLogger as any);

        const dto: ShareResourceDto = {
          resourceType: 'plugin',
          resourceId: RESOURCE_ID,
        };

        await expect(service.shareResource(WORKSPACE_ID, dto, USER_ID, tenantCtx)).rejects.toThrow(
          'Workspace not found'
        );
      });

      it('should throw RESOURCE_ALREADY_SHARED when resource is already shared', async () => {
        const mockDb = createMockDb({
          queryRawResults: [
            // Workspace settings check (allowCrossWorkspaceSharing: true)
            [{ id: WORKSPACE_ID, settings: { allowCrossWorkspaceSharing: true } }],
            // Duplicate check (existing resource found)
            [{ id: 'existing-link-123' }],
          ],
        });

        service = new WorkspaceResourceService(mockDb as any, undefined, mockLogger as any);

        const dto: ShareResourceDto = {
          resourceType: 'plugin',
          resourceId: RESOURCE_ID,
        };

        // Verify error is thrown
        await expect(service.shareResource(WORKSPACE_ID, dto, USER_ID, tenantCtx)).rejects.toThrow(
          'already shared'
        );

        // Reset mock results for second call
        const mockDb2 = createMockDb({
          queryRawResults: [
            [{ id: WORKSPACE_ID, settings: { allowCrossWorkspaceSharing: true } }],
            [{ id: 'existing-link-123' }],
          ],
        });
        service = new WorkspaceResourceService(mockDb2 as any, undefined, mockLogger as any);

        // Verify error details by catching the error
        try {
          await service.shareResource(WORKSPACE_ID, dto, USER_ID, tenantCtx);
          // Should not reach here
          expect.fail('Expected error to be thrown');
        } catch (error: any) {
          expect(error.code).toBe('RESOURCE_ALREADY_SHARED');
          expect(error.statusCode).toBe(409);
          expect(error.details).toEqual({
            workspaceId: WORKSPACE_ID,
            resourceType: 'plugin',
            resourceId: RESOURCE_ID,
          });
        }
      });
    });
  });

  describe('unshareResource()', () => {
    describe('success cases', () => {
      beforeEach(() => {
        mockEventBus = createMockEventBus();
        mockLogger = createMockLogger();

        const mockDb = createMockDb({
          queryRawResults: [
            // Fetch resource before deletion
            [
              {
                id: RESOURCE_LINK_ID,
                workspace_id: WORKSPACE_ID,
                resource_type: 'plugin',
                resource_id: RESOURCE_ID,
                created_at: new Date('2026-02-17T10:00:00Z'),
              },
            ],
          ],
        });

        service = new WorkspaceResourceService(
          mockDb as any,
          mockEventBus as any,
          mockLogger as any
        );
      });

      it('should unshare a resource and publish RESOURCE_UNSHARED event', async () => {
        await service.unshareResource(WORKSPACE_ID, RESOURCE_LINK_ID, USER_ID, tenantCtx);

        // Verify event published
        expect(mockEventBus.publish).toHaveBeenCalledWith(
          'plexica.workspace.lifecycle',
          WORKSPACE_EVENTS.RESOURCE_UNSHARED,
          {
            workspaceId: WORKSPACE_ID,
            resourceType: 'plugin',
            resourceId: RESOURCE_ID,
            unsharedBy: USER_ID,
          },
          {
            tenantId: TENANT_ID,
            workspaceId: WORKSPACE_ID,
            userId: USER_ID,
          }
        );

        // Verify logging
        expect(mockLogger.info).toHaveBeenCalledWith(
          {
            workspaceId: WORKSPACE_ID,
            resourceType: 'plugin',
            resourceId: RESOURCE_ID,
            userId: USER_ID,
            tenantId: TENANT_ID,
          },
          expect.stringContaining('Unshared resource')
        );
      });

      it('should handle event publishing failure gracefully', async () => {
        mockEventBus.publish.mockRejectedValueOnce(new Error('Event bus down'));

        await service.unshareResource(WORKSPACE_ID, RESOURCE_LINK_ID, USER_ID, tenantCtx);

        // Warning should be logged
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Error: Event bus down',
          }),
          'Failed to publish RESOURCE_UNSHARED event'
        );
      });
    });

    describe('error cases', () => {
      it('should throw RESOURCE_NOT_FOUND when resource link does not exist', async () => {
        const mockDb = createMockDb({
          queryRawResults: [
            // Fetch resource before deletion (not found)
            [],
          ],
        });

        service = new WorkspaceResourceService(mockDb as any, undefined, mockLogger as any);

        await expect(
          service.unshareResource(WORKSPACE_ID, RESOURCE_LINK_ID, USER_ID, tenantCtx)
        ).rejects.toThrow('Resource link not found');

        // Verify error details
        try {
          await service.unshareResource(WORKSPACE_ID, RESOURCE_LINK_ID, USER_ID, tenantCtx);
        } catch (error: any) {
          expect(error.code).toBe('RESOURCE_NOT_FOUND');
          expect(error.statusCode).toBe(404);
          expect(error.details).toEqual({
            workspaceId: WORKSPACE_ID,
            resourceId: RESOURCE_LINK_ID,
          });
        }
      });
    });
  });

  describe('listResources()', () => {
    beforeEach(() => {
      mockLogger = createMockLogger();
    });

    it('should list all resources with pagination', async () => {
      const mockDb = createMockDb({
        queryRawResults: [
          // Query results (2 resources)
          [
            {
              id: 'link-1',
              workspace_id: WORKSPACE_ID,
              resource_type: 'plugin',
              resource_id: 'plugin-1',
              created_at: new Date('2026-02-17T10:00:00Z'),
            },
            {
              id: 'link-2',
              workspace_id: WORKSPACE_ID,
              resource_type: 'template',
              resource_id: 'template-1',
              created_at: new Date('2026-02-17T09:00:00Z'),
            },
          ],
          // Count result
          [{ count: 2 }],
        ],
      });

      service = new WorkspaceResourceService(mockDb as any, undefined, mockLogger as any);

      const dto: ListSharedResourcesDto = {
        limit: 50,
        offset: 0,
        resourceType: undefined,
      };

      const result = await service.listResources(WORKSPACE_ID, dto, tenantCtx);

      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toEqual({
        id: 'link-1',
        workspace_id: WORKSPACE_ID,
        resource_type: 'plugin',
        resource_id: 'plugin-1',
        created_at: expect.any(Date),
      });
      expect(result.pagination).toEqual({
        limit: 50,
        offset: 0,
        total: 2,
        hasMore: false,
      });

      // Verify logging
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          resultCount: 2,
          totalCount: 2,
        }),
        expect.stringContaining('Listed 2 resources')
      );
    });

    it('should filter resources by type', async () => {
      const mockDb = createMockDb({
        queryRawResults: [
          // Query results (1 plugin)
          [
            {
              id: 'link-1',
              workspace_id: WORKSPACE_ID,
              resource_type: 'plugin',
              resource_id: 'plugin-1',
              created_at: new Date('2026-02-17T10:00:00Z'),
            },
          ],
          // Count result
          [{ count: 1 }],
        ],
      });

      service = new WorkspaceResourceService(mockDb as any, undefined, mockLogger as any);

      const dto: ListSharedResourcesDto = {
        limit: 50,
        offset: 0,
        resourceType: 'plugin',
      };

      const result = await service.listResources(WORKSPACE_ID, dto, tenantCtx);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].resource_type).toBe('plugin');
      expect(result.pagination.total).toBe(1);
    });

    it('should support pagination (limit and offset)', async () => {
      const mockDb = createMockDb({
        queryRawResults: [
          // Query results (page 2: 1 resource)
          [
            {
              id: 'link-3',
              workspace_id: WORKSPACE_ID,
              resource_type: 'dataset',
              resource_id: 'dataset-1',
              created_at: new Date('2026-02-17T08:00:00Z'),
            },
          ],
          // Count result (5 total)
          [{ count: 5 }],
        ],
      });

      service = new WorkspaceResourceService(mockDb as any, undefined, mockLogger as any);

      const dto: ListSharedResourcesDto = {
        limit: 2,
        offset: 4,
        resourceType: undefined,
      };

      const result = await service.listResources(WORKSPACE_ID, dto, tenantCtx);

      expect(result.data).toHaveLength(1);
      expect(result.pagination).toEqual({
        limit: 2,
        offset: 4,
        total: 5,
        hasMore: false, // offset(4) + returned(1) = 5, no more
      });
    });

    it('should indicate hasMore when there are more pages', async () => {
      const mockDb = createMockDb({
        queryRawResults: [
          // Query results (page 1: 2 resources)
          [
            {
              id: 'link-1',
              workspace_id: WORKSPACE_ID,
              resource_type: 'plugin',
              resource_id: 'p1',
              created_at: new Date(),
            },
            {
              id: 'link-2',
              workspace_id: WORKSPACE_ID,
              resource_type: 'plugin',
              resource_id: 'p2',
              created_at: new Date(),
            },
          ],
          // Count result (5 total)
          [{ count: 5 }],
        ],
      });

      service = new WorkspaceResourceService(mockDb as any, undefined, mockLogger as any);

      const dto: ListSharedResourcesDto = {
        limit: 2,
        offset: 0,
        resourceType: undefined,
      };

      const result = await service.listResources(WORKSPACE_ID, dto, tenantCtx);

      expect(result.pagination.hasMore).toBe(true); // 0 + 2 < 5
    });
  });

  describe('getResource()', () => {
    beforeEach(() => {
      mockLogger = createMockLogger();
    });

    it('should return a specific resource link', async () => {
      const mockDb = createMockDb({
        queryRawResults: [
          // Query result (resource found)
          [
            {
              id: RESOURCE_LINK_ID,
              workspace_id: WORKSPACE_ID,
              resource_type: 'plugin',
              resource_id: RESOURCE_ID,
              created_at: new Date('2026-02-17T10:00:00Z'),
            },
          ],
        ],
      });

      service = new WorkspaceResourceService(mockDb as any, undefined, mockLogger as any);

      const result = await service.getResource(WORKSPACE_ID, RESOURCE_LINK_ID, tenantCtx);

      expect(result).toEqual({
        id: RESOURCE_LINK_ID,
        workspace_id: WORKSPACE_ID,
        resource_type: 'plugin',
        resource_id: RESOURCE_ID,
        created_at: expect.any(Date),
      });
    });

    it('should return null when resource link not found', async () => {
      const mockDb = createMockDb({
        queryRawResults: [
          // Query result (not found)
          [],
        ],
      });

      service = new WorkspaceResourceService(mockDb as any, undefined, mockLogger as any);

      const result = await service.getResource(WORKSPACE_ID, RESOURCE_LINK_ID, tenantCtx);

      expect(result).toBeNull();
    });
  });

  describe('isResourceShared()', () => {
    beforeEach(() => {
      mockLogger = createMockLogger();
    });

    it('should return true when resource is shared', async () => {
      const mockDb = createMockDb({
        queryRawResults: [
          // Query result (resource found)
          [{ id: RESOURCE_LINK_ID }],
        ],
      });

      service = new WorkspaceResourceService(mockDb as any, undefined, mockLogger as any);

      const result = await service.isResourceShared(WORKSPACE_ID, 'plugin', RESOURCE_ID, tenantCtx);

      expect(result).toBe(true);
    });

    it('should return false when resource is not shared', async () => {
      const mockDb = createMockDb({
        queryRawResults: [
          // Query result (not found)
          [],
        ],
      });

      service = new WorkspaceResourceService(mockDb as any, undefined, mockLogger as any);

      const result = await service.isResourceShared(
        WORKSPACE_ID,
        'template',
        RESOURCE_ID,
        tenantCtx
      );

      expect(result).toBe(false);
    });
  });
});
