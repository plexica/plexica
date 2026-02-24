/**
 * Workspace Event Publishing Integration Tests
 *
 * Tests that WorkspaceService correctly publishes domain events via
 * EventBusService after successful database transactions.
 *
 * Spec Reference: Spec 009, Task 1 (Event Publishing System)
 * Constitution: Art. 3.1 (Event-Driven Architecture), Art. 8.1 (Required Test Types)
 *
 * Strategy:
 * - Mock PrismaClient to simulate database operations
 * - Mock EventBusService to capture published events
 * - Verify event type, data payload, metadata, and non-blocking behavior
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { WorkspaceRole } from '@plexica/database';
import { WORKSPACE_EVENTS } from '@plexica/event-bus';
import { WorkspaceService } from '../../../modules/workspace/workspace.service';

// ---------------------------------------------------------------------------
// Mock Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a mock PrismaClient that simulates the raw SQL transaction pattern
 * used by WorkspaceService. The $transaction callback receives a mock tx
 * whose $executeRaw/$queryRaw are pre-configured per test.
 */
function createMockDb(overrides: {
  queryRawResults?: unknown[][];
  executeRawResults?: number[];
  userFindUnique?: unknown;
}): {
  _tx: { $executeRaw: Mock; $queryRaw: Mock };
  $transaction: Mock;
  $queryRaw: Mock;
  $executeRaw: Mock;
  user: { findUnique: Mock };
} {
  const queryRawResults = [...(overrides.queryRawResults ?? [])];
  const executeRawResults = [...(overrides.executeRawResults ?? [])];

  // Shared implementation that consumes from the result queues.
  // Both db-level and tx-level calls share the same queue so that
  // pre-transaction calls (e.g. slug uniqueness check in create())
  // consume the first result and tx-internal calls consume the rest.
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
    // Top-level query methods (used by create() for slug uniqueness check
    // before entering the transaction)
    $queryRaw: vi.fn().mockImplementation(queryRawImpl),
    $executeRaw: vi.fn().mockImplementation(executeRawImpl),
    user: {
      findUnique: vi.fn().mockResolvedValue(overrides.userFindUnique ?? null),
    },
    // Required by PluginHookService.getHookSubscribers (Phase 3)
    tenantPlugin: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    // Expose tx mock for assertions
    _tx: mockTx,
  };

  return mockDb;
}

/**
 * Creates a mock EventBusService with a spied publish method.
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

const TENANT_ID = 'tenant-aaa-bbb-ccc';
const WORKSPACE_ID = 'ws-111-222-333';
const TEAM_ID = 'team-444-555-666';
const CREATOR_ID = 'user-creator-001';
const MEMBER_USER_ID = 'user-member-002';
const SCHEMA_NAME = 'tenant_acme';

const tenantCtx = {
  tenantId: TENANT_ID,
  schemaName: SCHEMA_NAME,
  userId: CREATOR_ID,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkspaceService Event Publishing', () => {
  let service: WorkspaceService;
  let mockEventBus: ReturnType<typeof createMockEventBus>;
  let mockLogger: ReturnType<typeof createMockLogger>;

  describe('create() — WORKSPACE_EVENTS.CREATED', () => {
    beforeEach(() => {
      mockEventBus = createMockEventBus();
      mockLogger = createMockLogger();

      const mockDb = createMockDb({
        queryRawResults: [
          // gen_random_uuid() result (inside transaction)
          [{ id: WORKSPACE_ID }],
          // Fetch created workspace with relations
          [
            {
              id: WORKSPACE_ID,
              tenant_id: TENANT_ID,
              slug: 'engineering',
              name: 'Engineering',
              description: null,
              settings: {},
              created_at: new Date(),
              updated_at: new Date(),
              members: [],
              member_count: 1,
              team_count: 0,
            },
          ],
        ],
        executeRawResults: [
          1, // SET LOCAL search_path
          1, // INSERT workspace
          1, // INSERT workspace_member
        ],
      });

      service = new WorkspaceService(
        mockDb as any,
        mockEventBus as any,
        undefined,
        mockLogger as any
      );
    });

    it('should publish CREATED event after successful workspace creation', async () => {
      await service.create(
        { slug: 'engineering', name: 'Engineering' },
        CREATOR_ID,
        tenantCtx as any
      );

      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        'plexica.workspace.lifecycle',
        WORKSPACE_EVENTS.CREATED,
        expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          slug: 'engineering',
          name: 'Engineering',
          creatorId: CREATOR_ID,
        }),
        expect.objectContaining({
          tenantId: TENANT_ID,
          workspaceId: WORKSPACE_ID,
          source: 'core',
        })
      );
    });

    it('should include userId in event metadata', async () => {
      await service.create(
        { slug: 'engineering', name: 'Engineering' },
        CREATOR_ID,
        tenantCtx as any
      );

      const publishCall = (mockEventBus.publish as Mock).mock.calls[0];
      const metadata = publishCall[3];
      expect(metadata.userId).toBe(CREATOR_ID);
    });

    it('should include correlationId in event metadata', async () => {
      await service.create(
        { slug: 'engineering', name: 'Engineering' },
        CREATOR_ID,
        tenantCtx as any
      );

      const publishCall = (mockEventBus.publish as Mock).mock.calls[0];
      const metadata = publishCall[3];
      expect(metadata.correlationId).toBeDefined();
      expect(typeof metadata.correlationId).toBe('string');
      expect(metadata.correlationId.length).toBeGreaterThan(0);
    });
  });

  describe('update() — WORKSPACE_EVENTS.UPDATED', () => {
    beforeEach(() => {
      mockEventBus = createMockEventBus();
      mockLogger = createMockLogger();

      const mockDb = createMockDb({
        queryRawResults: [
          // Fetch updated workspace
          [
            {
              id: WORKSPACE_ID,
              tenant_id: TENANT_ID,
              slug: 'engineering',
              name: 'Engineering v2',
              description: 'Updated description',
              settings: {},
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        ],
        executeRawResults: [
          1, // SET LOCAL search_path
          1, // UPDATE workspace
        ],
      });

      service = new WorkspaceService(
        mockDb as any,
        mockEventBus as any,
        undefined,
        mockLogger as any
      );
    });

    it('should publish UPDATED event with changes object', async () => {
      await service.update(
        WORKSPACE_ID,
        { name: 'Engineering v2', description: 'Updated description' },
        tenantCtx as any
      );

      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        'plexica.workspace.lifecycle',
        WORKSPACE_EVENTS.UPDATED,
        expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          changes: {
            name: 'Engineering v2',
            description: 'Updated description',
          },
        }),
        expect.objectContaining({
          tenantId: TENANT_ID,
          source: 'core',
        })
      );
    });
  });

  describe('delete() — WORKSPACE_EVENTS.DELETED', () => {
    beforeEach(() => {
      mockEventBus = createMockEventBus();
      mockLogger = createMockLogger();

      const mockDb = createMockDb({
        queryRawResults: [
          // Workspace existence check (inside transaction)
          [{ id: WORKSPACE_ID }],
          // Child count check — no children
          [{ count: 0 }],
          // Team count check — no teams
          [{ count: 0 }],
        ],
        executeRawResults: [
          1, // SET LOCAL search_path
          1, // SELECT FOR UPDATE (lock parent row)
          1, // DELETE workspace
        ],
      });

      service = new WorkspaceService(
        mockDb as any,
        mockEventBus as any,
        undefined,
        mockLogger as any
      );
    });

    it('should publish DELETED event after successful deletion', async () => {
      await service.delete(WORKSPACE_ID, tenantCtx as any);

      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        'plexica.workspace.lifecycle',
        WORKSPACE_EVENTS.DELETED,
        expect.objectContaining({
          workspaceId: WORKSPACE_ID,
        }),
        expect.objectContaining({
          tenantId: TENANT_ID,
          source: 'core',
        })
      );
    });

    it('should use tenantContext userId as actor', async () => {
      await service.delete(WORKSPACE_ID, tenantCtx as any);

      const publishCall = (mockEventBus.publish as Mock).mock.calls[0];
      const metadata = publishCall[3];
      expect(metadata.userId).toBe(CREATOR_ID);
    });
  });

  describe('addMember() — WORKSPACE_EVENTS.MEMBER_ADDED', () => {
    beforeEach(() => {
      mockEventBus = createMockEventBus();
      mockLogger = createMockLogger();

      const mockDb = createMockDb({
        queryRawResults: [
          // Workspace exists check
          [{ id: WORKSPACE_ID }],
          // User already member check — not a member
          [],
          // Fetch created member with user info
          [
            {
              workspace_id: WORKSPACE_ID,
              user_id: MEMBER_USER_ID,
              role: 'MEMBER',
              invited_by: CREATOR_ID,
              joined_at: new Date(),
              user_email: 'member@test.com',
              user_first_name: 'Test',
              user_last_name: 'Member',
            },
          ],
        ],
        executeRawResults: [
          1, // SET LOCAL search_path
          1, // UPSERT user to tenant schema
          1, // INSERT workspace_member
        ],
        userFindUnique: {
          id: MEMBER_USER_ID,
          keycloakId: 'kc-member',
          email: 'member@test.com',
          firstName: 'Test',
          lastName: 'Member',
        },
      });

      service = new WorkspaceService(
        mockDb as any,
        mockEventBus as any,
        undefined,
        mockLogger as any
      );
    });

    it('should publish MEMBER_ADDED event after adding a member', async () => {
      await service.addMember(
        WORKSPACE_ID,
        { userId: MEMBER_USER_ID, role: WorkspaceRole.MEMBER },
        CREATOR_ID,
        tenantCtx as any
      );

      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        'plexica.workspace.lifecycle',
        WORKSPACE_EVENTS.MEMBER_ADDED,
        expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          userId: MEMBER_USER_ID,
          role: 'MEMBER',
          invitedBy: CREATOR_ID,
        }),
        expect.objectContaining({
          tenantId: TENANT_ID,
          workspaceId: WORKSPACE_ID,
          source: 'core',
        })
      );
    });
  });

  describe('updateMemberRole() — WORKSPACE_EVENTS.MEMBER_ROLE_UPDATED', () => {
    beforeEach(() => {
      mockEventBus = createMockEventBus();
      mockLogger = createMockLogger();

      const mockDb = createMockDb({
        queryRawResults: [
          // Current member — role is MEMBER
          [
            {
              workspace_id: WORKSPACE_ID,
              user_id: MEMBER_USER_ID,
              role: 'MEMBER',
              invited_by: CREATOR_ID,
              joined_at: new Date(),
            },
          ],
          // Updated member — role is now ADMIN
          [
            {
              workspace_id: WORKSPACE_ID,
              user_id: MEMBER_USER_ID,
              role: 'ADMIN',
              invited_by: CREATOR_ID,
              joined_at: new Date(),
            },
          ],
        ],
        executeRawResults: [
          1, // SET LOCAL search_path
          1, // UPDATE member role
        ],
      });

      service = new WorkspaceService(
        mockDb as any,
        mockEventBus as any,
        undefined,
        mockLogger as any
      );
    });

    it('should publish MEMBER_ROLE_UPDATED event with old and new roles', async () => {
      await service.updateMemberRole(
        WORKSPACE_ID,
        MEMBER_USER_ID,
        WorkspaceRole.ADMIN,
        tenantCtx as any
      );

      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        'plexica.workspace.lifecycle',
        WORKSPACE_EVENTS.MEMBER_ROLE_UPDATED,
        expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          userId: MEMBER_USER_ID,
          oldRole: 'MEMBER',
          newRole: 'ADMIN',
        }),
        expect.objectContaining({
          tenantId: TENANT_ID,
          workspaceId: WORKSPACE_ID,
          source: 'core',
        })
      );
    });
  });

  describe('removeMember() — WORKSPACE_EVENTS.MEMBER_REMOVED', () => {
    beforeEach(() => {
      mockEventBus = createMockEventBus();
      mockLogger = createMockLogger();

      const mockDb = createMockDb({
        queryRawResults: [
          // Admin count — 2 admins (safe to remove one)
          [{ count: 2 }],
          // Member to remove
          [
            {
              workspace_id: WORKSPACE_ID,
              user_id: MEMBER_USER_ID,
              role: 'MEMBER',
              invited_by: CREATOR_ID,
              joined_at: new Date(),
            },
          ],
        ],
        executeRawResults: [
          1, // SET LOCAL search_path
          0, // DELETE team memberships
          1, // DELETE workspace member
        ],
      });

      service = new WorkspaceService(
        mockDb as any,
        mockEventBus as any,
        undefined,
        mockLogger as any
      );
    });

    it('should publish MEMBER_REMOVED event after removing a member', async () => {
      await service.removeMember(WORKSPACE_ID, MEMBER_USER_ID, tenantCtx as any);

      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        'plexica.workspace.lifecycle',
        WORKSPACE_EVENTS.MEMBER_REMOVED,
        expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          userId: MEMBER_USER_ID,
        }),
        expect.objectContaining({
          tenantId: TENANT_ID,
          workspaceId: WORKSPACE_ID,
          source: 'core',
        })
      );
    });
  });

  describe('createTeam() — WORKSPACE_EVENTS.TEAM_CREATED', () => {
    beforeEach(() => {
      mockEventBus = createMockEventBus();
      mockLogger = createMockLogger();

      const mockDb = createMockDb({
        queryRawResults: [
          // Workspace exists check
          [{ id: WORKSPACE_ID }],
          // Fetch created team with owner info
          [
            {
              id: TEAM_ID,
              workspace_id: WORKSPACE_ID,
              name: 'Backend Team',
              description: 'Backend engineers',
              owner_id: CREATOR_ID,
              created_at: new Date(),
              updated_at: new Date(),
              owner_user_id: CREATOR_ID,
              owner_email: 'creator@test.com',
              owner_first_name: 'Test',
              owner_last_name: 'Creator',
            },
          ],
        ],
        executeRawResults: [
          1, // SET LOCAL search_path
          1, // INSERT team
        ],
      });

      service = new WorkspaceService(
        mockDb as any,
        mockEventBus as any,
        undefined,
        mockLogger as any
      );
    });

    it('should publish TEAM_CREATED event after creating a team', async () => {
      await service.createTeam(
        WORKSPACE_ID,
        { name: 'Backend Team', description: 'Backend engineers', ownerId: CREATOR_ID },
        tenantCtx as any
      );

      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        'plexica.workspace.lifecycle',
        WORKSPACE_EVENTS.TEAM_CREATED,
        expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          teamId: TEAM_ID,
          name: 'Backend Team',
          ownerId: CREATOR_ID,
        }),
        expect.objectContaining({
          tenantId: TENANT_ID,
          workspaceId: WORKSPACE_ID,
          source: 'core',
        })
      );
    });
  });

  describe('Non-blocking event publishing (FR-033)', () => {
    it('should not throw when event publishing fails on create()', async () => {
      mockEventBus = createMockEventBus();
      mockEventBus.publish = vi.fn().mockRejectedValue(new Error('Kafka connection lost'));
      mockLogger = createMockLogger();

      const mockDb = createMockDb({
        queryRawResults: [
          [{ id: WORKSPACE_ID }],
          [
            {
              id: WORKSPACE_ID,
              tenant_id: TENANT_ID,
              slug: 'eng',
              name: 'Eng',
              description: null,
              settings: {},
              created_at: new Date(),
              updated_at: new Date(),
              members: [],
              member_count: 1,
              team_count: 0,
            },
          ],
        ],
        executeRawResults: [1, 1, 1],
      });

      service = new WorkspaceService(
        mockDb as any,
        mockEventBus as any,
        undefined,
        mockLogger as any
      );

      // Should NOT throw despite event bus failure
      const result = await service.create(
        { slug: 'eng', name: 'Eng' },
        CREATOR_ID,
        tenantCtx as any
      );

      expect(result).toBeDefined();
      expect(result.id).toBe(WORKSPACE_ID);
    });

    it('should log warning when event publishing fails', async () => {
      mockEventBus = createMockEventBus();
      mockEventBus.publish = vi.fn().mockRejectedValue(new Error('Kafka connection lost'));
      mockLogger = createMockLogger();

      const mockDb = createMockDb({
        queryRawResults: [
          [{ id: WORKSPACE_ID }],
          [
            {
              id: WORKSPACE_ID,
              tenant_id: TENANT_ID,
              slug: 'eng',
              name: 'Eng',
              description: null,
              settings: {},
              created_at: new Date(),
              updated_at: new Date(),
              members: [],
              member_count: 1,
              team_count: 0,
            },
          ],
        ],
        executeRawResults: [1, 1, 1],
      });

      service = new WorkspaceService(
        mockDb as any,
        mockEventBus as any,
        undefined,
        mockLogger as any
      );

      await service.create({ slug: 'eng', name: 'Eng' }, CREATOR_ID, tenantCtx as any);

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          eventType: WORKSPACE_EVENTS.CREATED,
          error: expect.stringContaining('Kafka connection lost'),
        }),
        expect.stringContaining('Failed to publish')
      );
    });

    it('should not throw when event publishing fails on delete()', async () => {
      mockEventBus = createMockEventBus();
      mockEventBus.publish = vi.fn().mockRejectedValue(new Error('Broker unreachable'));
      mockLogger = createMockLogger();

      const mockDb = createMockDb({
        queryRawResults: [
          // Workspace existence check (inside transaction)
          [{ id: WORKSPACE_ID }],
          // Child count check — no children
          [{ count: 0 }],
          // Team count check — no teams
          [{ count: 0 }],
        ],
        executeRawResults: [1, 1, 1],
      });

      service = new WorkspaceService(
        mockDb as any,
        mockEventBus as any,
        undefined,
        mockLogger as any
      );

      // Should NOT throw
      await expect(service.delete(WORKSPACE_ID, tenantCtx as any)).resolves.toBeUndefined();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: WORKSPACE_EVENTS.DELETED,
        }),
        expect.stringContaining('Failed to publish')
      );
    });
  });

  describe('No eventBus — backward compatibility', () => {
    it('should not publish events when eventBus is not provided', async () => {
      mockLogger = createMockLogger();

      const mockDb = createMockDb({
        queryRawResults: [
          [{ id: WORKSPACE_ID }],
          [
            {
              id: WORKSPACE_ID,
              tenant_id: TENANT_ID,
              slug: 'eng',
              name: 'Eng',
              description: null,
              settings: {},
              created_at: new Date(),
              updated_at: new Date(),
              members: [],
              member_count: 1,
              team_count: 0,
            },
          ],
        ],
        executeRawResults: [1, 1, 1],
      });

      // No eventBus passed — undefined
      service = new WorkspaceService(mockDb as any, undefined, undefined, mockLogger as any);

      const result = await service.create(
        { slug: 'eng', name: 'Eng' },
        CREATOR_ID,
        tenantCtx as any
      );

      expect(result).toBeDefined();
      expect(result.id).toBe(WORKSPACE_ID);
      // No warnings logged since eventBus was never called
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });
});
