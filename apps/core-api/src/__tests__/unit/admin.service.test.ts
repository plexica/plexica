// apps/core-api/src/__tests__/unit/admin.service.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the entire @plexica/database package to avoid DATABASE_URL requirement
vi.mock('@plexica/database', () => ({
  PrismaClient: class MockPrismaClient {},
  TenantStatus: {
    PROVISIONING: 'PROVISIONING',
    ACTIVE: 'ACTIVE',
    SUSPENDED: 'SUSPENDED',
    PENDING_DELETION: 'PENDING_DELETION',
    DELETED: 'DELETED',
  },
}));

// Mock the database module
vi.mock('../../lib/db.js', () => ({
  db: {},
}));

import type { PrismaClient } from '@plexica/database';
import { AdminService } from '../../services/admin.service';

describe('AdminService - listUsers', () => {
  let adminService: AdminService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      tenant: {
        findMany: vi.fn(),
      },
      $queryRaw: vi.fn(),
      $queryRawUnsafe: vi.fn(),
    };

    adminService = new AdminService(mockPrisma as unknown as PrismaClient);
  });

  it('should return empty result when no tenants exist', async () => {
    mockPrisma.tenant.findMany.mockResolvedValue([]);

    const result = await adminService.listUsers();

    expect(result).toEqual({
      users: [],
      total: 0,
      page: 1,
      limit: 50,
      totalPages: 0,
    });
    expect(mockPrisma.tenant.findMany).toHaveBeenCalled();
  });

  it('should query users from multiple tenant schemas', async () => {
    const tenants = [
      { id: 'tenant-1', slug: 'acme-corp', name: 'Acme Corp' },
      { id: 'tenant-2', slug: 'globex-inc', name: 'Globex Inc' },
    ];

    mockPrisma.tenant.findMany.mockResolvedValue(tenants);

    // Schema existence check — both schemas exist
    mockPrisma.$queryRaw.mockResolvedValue([{ exists: true }]);

    // Users from first tenant
    const acmeUsers = [
      {
        id: 'user-1',
        email: 'alice@acme.com',
        first_name: 'Alice',
        last_name: 'Smith',
        created_at: new Date('2026-01-01T00:00:00Z'),
        roles: 'admin,member',
      },
    ];

    // Users from second tenant
    const globexUsers = [
      {
        id: 'user-2',
        email: 'bob@globex.com',
        first_name: 'Bob',
        last_name: null,
        created_at: new Date('2026-01-15T00:00:00Z'),
        roles: 'member',
      },
    ];

    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce(acmeUsers).mockResolvedValueOnce(globexUsers);

    const result = await adminService.listUsers();

    expect(result.users).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.totalPages).toBe(1);

    // Verify users are sorted by createdAt desc (Bob is newer)
    expect(result.users[0].email).toBe('bob@globex.com');
    expect(result.users[1].email).toBe('alice@acme.com');

    // Verify user shape
    expect(result.users[0]).toEqual(
      expect.objectContaining({
        id: 'user-2',
        email: 'bob@globex.com',
        name: 'Bob',
        firstName: 'Bob',
        lastName: null,
        tenantId: 'tenant-2',
        tenantName: 'Globex Inc',
        tenantSlug: 'globex-inc',
        roles: ['member'],
      })
    );

    expect(result.users[1]).toEqual(
      expect.objectContaining({
        id: 'user-1',
        email: 'alice@acme.com',
        name: 'Alice Smith',
        firstName: 'Alice',
        lastName: 'Smith',
        tenantId: 'tenant-1',
        tenantName: 'Acme Corp',
        tenantSlug: 'acme-corp',
        roles: ['admin', 'member'],
      })
    );
  });

  it('should apply search filter on name, email, and tenant name', async () => {
    const tenants = [{ id: 'tenant-1', slug: 'acme-corp', name: 'Acme Corp' }];

    mockPrisma.tenant.findMany.mockResolvedValue(tenants);
    mockPrisma.$queryRaw.mockResolvedValue([{ exists: true }]);

    const users = [
      {
        id: 'user-1',
        email: 'alice@acme.com',
        first_name: 'Alice',
        last_name: 'Smith',
        created_at: new Date('2026-01-01T00:00:00Z'),
        roles: 'admin',
      },
      {
        id: 'user-2',
        email: 'bob@acme.com',
        first_name: 'Bob',
        last_name: 'Jones',
        created_at: new Date('2026-01-02T00:00:00Z'),
        roles: 'member',
      },
    ];

    mockPrisma.$queryRawUnsafe.mockResolvedValue(users);

    const result = await adminService.listUsers({ search: 'alice' });

    expect(result.users).toHaveLength(1);
    expect(result.users[0].email).toBe('alice@acme.com');
    expect(result.total).toBe(1);
  });

  it('should apply role filter', async () => {
    const tenants = [{ id: 'tenant-1', slug: 'acme-corp', name: 'Acme Corp' }];

    mockPrisma.tenant.findMany.mockResolvedValue(tenants);
    mockPrisma.$queryRaw.mockResolvedValue([{ exists: true }]);

    const users = [
      {
        id: 'user-1',
        email: 'alice@acme.com',
        first_name: 'Alice',
        last_name: 'Smith',
        created_at: new Date('2026-01-01T00:00:00Z'),
        roles: 'admin,member',
      },
      {
        id: 'user-2',
        email: 'bob@acme.com',
        first_name: 'Bob',
        last_name: 'Jones',
        created_at: new Date('2026-01-02T00:00:00Z'),
        roles: 'member',
      },
    ];

    mockPrisma.$queryRawUnsafe.mockResolvedValue(users);

    const result = await adminService.listUsers({ role: 'admin' });

    expect(result.users).toHaveLength(1);
    expect(result.users[0].email).toBe('alice@acme.com');
    expect(result.users[0].roles).toContain('admin');
  });

  it('should handle pagination correctly', async () => {
    const tenants = [{ id: 'tenant-1', slug: 'test-tenant', name: 'Test Tenant' }];

    mockPrisma.tenant.findMany.mockResolvedValue(tenants);
    mockPrisma.$queryRaw.mockResolvedValue([{ exists: true }]);

    // Create 5 users
    const users = Array.from({ length: 5 }, (_, i) => ({
      id: `user-${i}`,
      email: `user${i}@test.com`,
      first_name: `User`,
      last_name: `${i}`,
      created_at: new Date(`2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`),
      roles: 'member',
    }));

    mockPrisma.$queryRawUnsafe.mockResolvedValue(users);

    // Request page 2 with limit 2
    const result = await adminService.listUsers({ page: 2, limit: 2 });

    expect(result.users).toHaveLength(2);
    expect(result.total).toBe(5);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(2);
    expect(result.totalPages).toBe(3);
  });

  it('should skip tenant schemas that do not exist', async () => {
    const tenants = [
      { id: 'tenant-1', slug: 'real-tenant', name: 'Real Tenant' },
      { id: 'tenant-2', slug: 'ghost-tenant', name: 'Ghost Tenant' },
    ];

    mockPrisma.tenant.findMany.mockResolvedValue(tenants);

    // First schema exists, second does not
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([{ exists: true }])
      .mockResolvedValueOnce([{ exists: false }]);

    const users = [
      {
        id: 'user-1',
        email: 'alice@real.com',
        first_name: 'Alice',
        last_name: null,
        created_at: new Date('2026-01-01T00:00:00Z'),
        roles: null,
      },
    ];

    mockPrisma.$queryRawUnsafe.mockResolvedValue(users);

    const result = await adminService.listUsers();

    // Only users from the existing schema
    expect(result.users).toHaveLength(1);
    expect(result.users[0].tenantName).toBe('Real Tenant');
    // $queryRawUnsafe should only be called once (for the existing schema)
    expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
  });

  it('should handle users with null roles gracefully', async () => {
    const tenants = [{ id: 'tenant-1', slug: 'test-tenant', name: 'Test Tenant' }];

    mockPrisma.tenant.findMany.mockResolvedValue(tenants);
    mockPrisma.$queryRaw.mockResolvedValue([{ exists: true }]);

    const users = [
      {
        id: 'user-1',
        email: 'noroles@test.com',
        first_name: null,
        last_name: null,
        created_at: new Date('2026-01-01T00:00:00Z'),
        roles: null,
      },
    ];

    mockPrisma.$queryRawUnsafe.mockResolvedValue(users);

    const result = await adminService.listUsers();

    expect(result.users).toHaveLength(1);
    expect(result.users[0].roles).toEqual([]);
    // Name should fall back to email when first_name and last_name are null
    expect(result.users[0].name).toBe('noroles@test.com');
  });

  it('should filter by tenantId when provided', async () => {
    mockPrisma.tenant.findMany.mockResolvedValue([{ id: 'tenant-1', slug: 'acme', name: 'Acme' }]);
    mockPrisma.$queryRaw.mockResolvedValue([{ exists: true }]);
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

    await adminService.listUsers({ tenantId: 'tenant-1' });

    expect(mockPrisma.tenant.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'tenant-1',
      }),
      select: { id: true, slug: true, name: true },
    });
  });

  it('should continue processing if a tenant schema query fails', async () => {
    const tenants = [
      { id: 'tenant-1', slug: 'good-tenant', name: 'Good Tenant' },
      { id: 'tenant-2', slug: 'bad-tenant', name: 'Bad Tenant' },
    ];

    mockPrisma.tenant.findMany.mockResolvedValue(tenants);
    mockPrisma.$queryRaw.mockResolvedValue([{ exists: true }]);

    // First tenant query succeeds, second fails
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([
        {
          id: 'user-1',
          email: 'alice@good.com',
          first_name: 'Alice',
          last_name: null,
          created_at: new Date('2026-01-01T00:00:00Z'),
          roles: 'member',
        },
      ])
      .mockRejectedValueOnce(new Error('Schema query error'));

    // Suppress console.warn from the service
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await adminService.listUsers();

    expect(result.users).toHaveLength(1);
    expect(result.users[0].email).toBe('alice@good.com');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to query users from tenant schema'),
      expect.any(String)
    );

    warnSpy.mockRestore();
  });

  it('should use default pagination values', async () => {
    mockPrisma.tenant.findMany.mockResolvedValue([]);

    const result = await adminService.listUsers();

    expect(result.page).toBe(1);
    expect(result.limit).toBe(50);
  });
});

describe('AdminService - getUserById', () => {
  let adminService: AdminService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      tenant: {
        findMany: vi.fn(),
      },
      $queryRaw: vi.fn(),
      $queryRawUnsafe: vi.fn(),
    };

    adminService = new AdminService(mockPrisma as unknown as PrismaClient);
  });

  it('should find user in the first tenant schema', async () => {
    const tenants = [{ id: 'tenant-1', slug: 'acme-corp', name: 'Acme Corp' }];

    mockPrisma.tenant.findMany.mockResolvedValue(tenants);
    mockPrisma.$queryRaw.mockResolvedValue([{ exists: true }]);

    // User found
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([
        {
          id: 'user-1',
          email: 'alice@acme.com',
          first_name: 'Alice',
          last_name: 'Smith',
          created_at: new Date('2026-01-01T00:00:00Z'),
          roles: 'admin,member',
        },
      ])
      // Workspace memberships
      .mockResolvedValueOnce([
        {
          id: 'ws-1',
          name: 'Engineering',
          slug: 'engineering',
          role: 'owner',
        },
        {
          id: 'ws-2',
          name: 'Marketing',
          slug: 'marketing',
          role: 'member',
        },
      ]);

    const result = await adminService.getUserById('user-1');

    expect(result).toEqual(
      expect.objectContaining({
        id: 'user-1',
        email: 'alice@acme.com',
        name: 'Alice Smith',
        firstName: 'Alice',
        lastName: 'Smith',
        tenantId: 'tenant-1',
        tenantName: 'Acme Corp',
        tenantSlug: 'acme-corp',
        roles: ['admin', 'member'],
      })
    );

    expect(result.workspaces).toHaveLength(2);
    expect(result.workspaces[0]).toEqual({
      id: 'ws-1',
      name: 'Engineering',
      slug: 'engineering',
      role: 'owner',
    });
  });

  it('should find user in the second tenant schema when not in first', async () => {
    const tenants = [
      { id: 'tenant-1', slug: 'acme-corp', name: 'Acme Corp' },
      { id: 'tenant-2', slug: 'globex-inc', name: 'Globex Inc' },
    ];

    mockPrisma.tenant.findMany.mockResolvedValue(tenants);
    mockPrisma.$queryRaw.mockResolvedValue([{ exists: true }]);

    // First tenant: user not found
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([]) // No user in acme
      .mockResolvedValueOnce([
        // User found in globex
        {
          id: 'user-2',
          email: 'bob@globex.com',
          first_name: 'Bob',
          last_name: 'Jones',
          created_at: new Date('2026-01-15T00:00:00Z'),
          roles: 'member',
        },
      ])
      .mockResolvedValueOnce([]); // No workspaces

    const result = await adminService.getUserById('user-2');

    expect(result.id).toBe('user-2');
    expect(result.tenantId).toBe('tenant-2');
    expect(result.tenantName).toBe('Globex Inc');
    expect(result.workspaces).toEqual([]);
  });

  it('should throw error when user is not found in any tenant', async () => {
    const tenants = [{ id: 'tenant-1', slug: 'acme-corp', name: 'Acme Corp' }];

    mockPrisma.tenant.findMany.mockResolvedValue(tenants);
    mockPrisma.$queryRaw.mockResolvedValue([{ exists: true }]);
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]); // User not found

    await expect(adminService.getUserById('nonexistent-user')).rejects.toThrow(
      "User 'nonexistent-user' not found"
    );
  });

  it('should throw error when no tenants exist', async () => {
    mockPrisma.tenant.findMany.mockResolvedValue([]);

    await expect(adminService.getUserById('user-1')).rejects.toThrow("User 'user-1' not found");
  });

  it('should skip schemas that do not exist', async () => {
    const tenants = [
      { id: 'tenant-1', slug: 'ghost-tenant', name: 'Ghost Tenant' },
      { id: 'tenant-2', slug: 'real-tenant', name: 'Real Tenant' },
    ];

    mockPrisma.tenant.findMany.mockResolvedValue(tenants);

    // First schema doesn't exist, second does
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([{ exists: false }])
      .mockResolvedValueOnce([{ exists: true }]);

    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([
        {
          id: 'user-1',
          email: 'alice@real.com',
          first_name: 'Alice',
          last_name: null,
          created_at: new Date('2026-01-01T00:00:00Z'),
          roles: null,
        },
      ])
      .mockResolvedValueOnce([]); // No workspaces

    const result = await adminService.getUserById('user-1');

    expect(result.tenantName).toBe('Real Tenant');
    expect(result.roles).toEqual([]);
  });

  it('should handle workspace query failure gracefully', async () => {
    const tenants = [{ id: 'tenant-1', slug: 'acme-corp', name: 'Acme Corp' }];

    mockPrisma.tenant.findMany.mockResolvedValue(tenants);
    mockPrisma.$queryRaw.mockResolvedValue([{ exists: true }]);

    // User found, workspace query fails
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([
        {
          id: 'user-1',
          email: 'alice@acme.com',
          first_name: 'Alice',
          last_name: null,
          created_at: new Date('2026-01-01T00:00:00Z'),
          roles: 'admin',
        },
      ])
      .mockRejectedValueOnce(new Error('Workspace tables not found'));

    const result = await adminService.getUserById('user-1');

    expect(result.id).toBe('user-1');
    expect(result.workspaces).toEqual([]);
  });

  it('should continue searching if a tenant schema query errors out', async () => {
    const tenants = [
      { id: 'tenant-1', slug: 'bad-tenant', name: 'Bad Tenant' },
      { id: 'tenant-2', slug: 'good-tenant', name: 'Good Tenant' },
    ];

    mockPrisma.tenant.findMany.mockResolvedValue(tenants);
    mockPrisma.$queryRaw.mockResolvedValue([{ exists: true }]);

    // First tenant query fails entirely, second succeeds
    mockPrisma.$queryRawUnsafe
      .mockRejectedValueOnce(new Error('Connection error'))
      .mockResolvedValueOnce([
        {
          id: 'user-1',
          email: 'alice@good.com',
          first_name: 'Alice',
          last_name: null,
          created_at: new Date('2026-01-01T00:00:00Z'),
          roles: 'member',
        },
      ])
      .mockResolvedValueOnce([]); // Workspaces

    const result = await adminService.getUserById('user-1');

    expect(result.tenantName).toBe('Good Tenant');
  });
});

describe('AdminService - slug validation', () => {
  let adminService: AdminService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      tenant: {
        findMany: vi.fn(),
      },
      $queryRaw: vi.fn(),
      $queryRawUnsafe: vi.fn(),
    };

    adminService = new AdminService(mockPrisma as unknown as PrismaClient);
  });

  it('should reject tenant slugs with invalid characters', async () => {
    // When a tenant has an invalid slug (e.g., uppercase, underscores),
    // validateSlug throws before the try/catch block in listUsers,
    // so the entire call fails.
    const tenants = [{ id: 'tenant-1', slug: 'INVALID_SLUG', name: 'Invalid' }];

    mockPrisma.tenant.findMany.mockResolvedValue(tenants);

    await expect(adminService.listUsers()).rejects.toThrow('Invalid tenant slug format');
  });

  it('should correctly convert slug to schema name', async () => {
    const tenants = [{ id: 'tenant-1', slug: 'acme-corp', name: 'Acme' }];

    mockPrisma.tenant.findMany.mockResolvedValue(tenants);
    mockPrisma.$queryRaw.mockResolvedValue([{ exists: true }]);
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

    await adminService.listUsers();

    // Verify the query uses the correct schema name (hyphens → underscores)
    const queryCall = mockPrisma.$queryRawUnsafe.mock.calls[0][0];
    expect(queryCall).toContain('tenant_acme_corp');
  });
});

describe('AdminService - constructor', () => {
  it('should accept a custom PrismaClient for testability', () => {
    const mockPrisma = {
      tenant: { findMany: vi.fn().mockResolvedValue([]) },
      $queryRaw: vi.fn(),
      $queryRawUnsafe: vi.fn(),
    };

    const service = new AdminService(mockPrisma as unknown as PrismaClient);

    // Verify the service can be instantiated with mock
    expect(service).toBeInstanceOf(AdminService);
  });
});
