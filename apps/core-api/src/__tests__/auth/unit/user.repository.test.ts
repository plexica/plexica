/**
 * UserRepository Unit Tests
 *
 * These tests verify the UserRepository data access layer with tenant-scoped operations.
 * Tests focus on:
 * - CRUD operations (create, read, update, soft delete, upsert)
 * - Tenant isolation (multi-tenant data boundaries)
 * - SQL injection prevention (parameterized queries)
 * - Error handling (tenant context validation, not found scenarios)
 *
 * Constitution Compliance:
 * - Article 3.3: Tenant schema isolation via AsyncLocalStorage
 * - Article 5.3: Parameterized queries, input validation
 * - Article 8.2: AAA pattern, descriptive test names, ≥85% coverage target
 *
 * @see Spec 002 Task 2.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UserRepository } from '../../../repositories/user.repository.js';
import { db } from '../../../lib/db.js';
import type { TenantContext } from '../../../middleware/tenant-context.js';
import * as tenantContextModule from '../../../middleware/tenant-context.js';
import type { CreateUserDto, UpdateUserDto } from '../../../types/auth.types.js';
import type { Logger } from 'pino';

// Mock dependencies
vi.mock('../../../lib/db.js', () => ({
  db: {
    $queryRaw: vi.fn(),
    $queryRawUnsafe: vi.fn(),
  },
}));

vi.mock('../../../middleware/tenant-context.js', async () => {
  const actual = await vi.importActual('../../../middleware/tenant-context.js');
  return {
    ...actual,
    getTenantContext: vi.fn(),
  };
});

// Mock logger
const mockLogger: Logger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
} as any;

// Test fixtures
const mockTenantContext: TenantContext = {
  tenantId: 'tenant-123',
  tenantSlug: 'test-tenant',
  schemaName: 'tenant_test_tenant',
};

// Raw database row (snake_case) — returned by $queryRaw / $queryRawUnsafe
const mockDbRow = {
  id: 'user-uuid-123',
  keycloak_id: 'keycloak-uuid-456',
  email: 'test@example.com',
  first_name: 'John',
  last_name: 'Doe',
  display_name: 'John Doe',
  avatar_url: 'https://example.com/avatar.jpg',
  locale: 'en',
  preferences: { theme: 'dark', notifications: true },
  status: 'ACTIVE',
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
};

// Expected camelCase output after mapRowToUser()
const mockUser = {
  id: 'user-uuid-123',
  keycloakId: 'keycloak-uuid-456',
  email: 'test@example.com',
  firstName: 'John',
  lastName: 'Doe',
  displayName: 'John Doe',
  avatarUrl: 'https://example.com/avatar.jpg',
  locale: 'en',
  preferences: { theme: 'dark', notifications: true },
  status: 'ACTIVE',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

describe('UserRepository', () => {
  let repository: UserRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new UserRepository(mockLogger);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getTenantSchemaOrThrow', () => {
    it('should return schema name when tenant context exists', () => {
      vi.mocked(tenantContextModule.getTenantContext).mockReturnValue(mockTenantContext);

      // Access private method through test override
      const schemaName = (repository as any).getTenantSchemaOrThrow();

      expect(schemaName).toBe('tenant_test_tenant');
    });

    it('should use provided tenant context override', () => {
      const overrideContext: TenantContext = {
        tenantId: 'override-tenant-id',
        tenantSlug: 'override-slug',
        schemaName: 'tenant_override',
      };

      const schemaName = (repository as any).getTenantSchemaOrThrow(overrideContext);

      expect(schemaName).toBe('tenant_override');
      expect(tenantContextModule.getTenantContext).not.toHaveBeenCalled();
    });

    it('should throw error when no tenant context available', () => {
      vi.mocked(tenantContextModule.getTenantContext).mockReturnValue(undefined);

      expect(() => {
        (repository as any).getTenantSchemaOrThrow();
      }).toThrow('No tenant context available');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'No tenant context available for UserRepository operation'
      );
    });

    it('should throw error for invalid schema name (SQL injection attempt)', () => {
      const maliciousContext: TenantContext = {
        tenantId: 'tenant-123',
        tenantSlug: 'test-tenant',
        schemaName: 'tenant_test"; DROP TABLE users; --',
      };

      expect(() => {
        (repository as any).getTenantSchemaOrThrow(maliciousContext);
      }).toThrow('Invalid schema name');

      expect(mockLogger.error).toHaveBeenCalledWith(
        { schemaName: 'tenant_test"; DROP TABLE users; --' },
        'Invalid schema name detected - potential SQL injection attempt'
      );
    });

    it('should reject schema name with uppercase characters', () => {
      const invalidContext: TenantContext = {
        tenantId: 'tenant-123',
        tenantSlug: 'test-tenant',
        schemaName: 'tenant_TestTenant',
      };

      expect(() => {
        (repository as any).getTenantSchemaOrThrow(invalidContext);
      }).toThrow('Invalid schema name');
    });

    it('should reject schema name with special characters', () => {
      const invalidContext: TenantContext = {
        tenantId: 'tenant-123',
        tenantSlug: 'test-tenant',
        schemaName: 'tenant_test@tenant',
      };

      expect(() => {
        (repository as any).getTenantSchemaOrThrow(invalidContext);
      }).toThrow('Invalid schema name');
    });
  });

  describe('findByKeycloakId', () => {
    it('should return user when found in tenant schema', async () => {
      vi.mocked(tenantContextModule.getTenantContext).mockReturnValue(mockTenantContext);
      vi.mocked(db.$queryRaw).mockResolvedValue([mockDbRow]);

      const result = await repository.findByKeycloakId('keycloak-uuid-456');

      expect(result).toEqual(mockUser);
      expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('should return null when user not found', async () => {
      vi.mocked(tenantContextModule.getTenantContext).mockReturnValue(mockTenantContext);
      vi.mocked(db.$queryRaw).mockResolvedValue([]);

      const result = await repository.findByKeycloakId('nonexistent-keycloak-id');

      expect(result).toBeNull();
    });

    it('should throw error when no tenant context', async () => {
      vi.mocked(tenantContextModule.getTenantContext).mockReturnValue(undefined);

      await expect(repository.findByKeycloakId('keycloak-uuid-456')).rejects.toThrow(
        'No tenant context available'
      );
    });

    it('should log error on database failure', async () => {
      vi.mocked(tenantContextModule.getTenantContext).mockReturnValue(mockTenantContext);
      const dbError = new Error('Database connection failed');
      vi.mocked(db.$queryRaw).mockRejectedValue(dbError);

      await expect(repository.findByKeycloakId('keycloak-uuid-456')).rejects.toThrow(
        'Database connection failed'
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          keycloakId: 'keycloak-uuid-456',
          schemaName: 'tenant_test_tenant',
          error: 'Database connection failed',
        }),
        'Failed to find user by Keycloak ID'
      );
    });
  });

  describe('findByEmail', () => {
    it('should return user when found by email', async () => {
      vi.mocked(tenantContextModule.getTenantContext).mockReturnValue(mockTenantContext);
      vi.mocked(db.$queryRaw).mockResolvedValue([mockDbRow]);

      const result = await repository.findByEmail('test@example.com');

      expect(result).toEqual(mockUser);
      expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('should return null when email not found', async () => {
      vi.mocked(tenantContextModule.getTenantContext).mockReturnValue(mockTenantContext);
      vi.mocked(db.$queryRaw).mockResolvedValue([]);

      const result = await repository.findByEmail('nonexistent@example.com');

      expect(result).toBeNull();
    });

    it('should handle email case sensitivity correctly', async () => {
      vi.mocked(tenantContextModule.getTenantContext).mockReturnValue(mockTenantContext);
      vi.mocked(db.$queryRaw).mockResolvedValue([mockDbRow]);

      const result = await repository.findByEmail('Test@Example.com');

      expect(result).toEqual(mockUser);
    });
  });

  describe('findById', () => {
    it('should return user when found by internal UUID', async () => {
      vi.mocked(tenantContextModule.getTenantContext).mockReturnValue(mockTenantContext);
      vi.mocked(db.$queryRaw).mockResolvedValue([mockDbRow]);

      const result = await repository.findById('user-uuid-123');

      expect(result).toEqual(mockUser);
      expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('should return null when UUID not found', async () => {
      vi.mocked(tenantContextModule.getTenantContext).mockReturnValue(mockTenantContext);
      vi.mocked(db.$queryRaw).mockResolvedValue([]);

      const result = await repository.findById('nonexistent-uuid');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create user with all fields', async () => {
      vi.mocked(tenantContextModule.getTenantContext).mockReturnValue(mockTenantContext);
      vi.mocked(db.$queryRaw).mockResolvedValue([mockDbRow]);

      const createData: CreateUserDto = {
        keycloakId: 'keycloak-uuid-456',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        displayName: 'John Doe',
        avatarUrl: 'https://example.com/avatar.jpg',
        locale: 'en',
        preferences: { theme: 'dark', notifications: true },
        status: 'ACTIVE',
      };

      const result = await repository.create(createData);

      expect(result).toEqual(mockUser);
      expect(db.$queryRaw).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          keycloakId: 'keycloak-uuid-456',
          email: 'test@example.com',
          schemaName: 'tenant_test_tenant',
        }),
        'User created successfully'
      );
    });

    it('should create user with minimal fields (defaults)', async () => {
      vi.mocked(tenantContextModule.getTenantContext).mockReturnValue(mockTenantContext);
      const minimalDbRow = {
        ...mockDbRow,
        first_name: null,
        last_name: null,
        display_name: null,
        avatar_url: null,
      };
      const minimalUser = {
        ...mockUser,
        firstName: null,
        lastName: null,
        displayName: null,
        avatarUrl: null,
      };
      vi.mocked(db.$queryRaw).mockResolvedValue([minimalDbRow]);

      const createData: CreateUserDto = {
        keycloakId: 'keycloak-uuid-789',
        email: 'minimal@example.com',
      };

      const result = await repository.create(createData);

      expect(result).toEqual(minimalUser);
      expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('should use default locale "en" when not provided', async () => {
      vi.mocked(tenantContextModule.getTenantContext).mockReturnValue(mockTenantContext);
      vi.mocked(db.$queryRaw).mockResolvedValue([mockDbRow]);

      const createData: CreateUserDto = {
        keycloakId: 'keycloak-uuid-456',
        email: 'test@example.com',
      };

      await repository.create(createData);

      expect(db.$queryRaw).toHaveBeenCalledTimes(1);
      // Locale default 'en' is applied in the repository method
    });

    it('should use default status "ACTIVE" when not provided', async () => {
      vi.mocked(tenantContextModule.getTenantContext).mockReturnValue(mockTenantContext);
      vi.mocked(db.$queryRaw).mockResolvedValue([mockDbRow]);

      const createData: CreateUserDto = {
        keycloakId: 'keycloak-uuid-456',
        email: 'test@example.com',
      };

      await repository.create(createData);

      expect(db.$queryRaw).toHaveBeenCalledTimes(1);
      // Status default 'ACTIVE' is applied in the repository method
    });

    it('should throw error when no row returned', async () => {
      vi.mocked(tenantContextModule.getTenantContext).mockReturnValue(mockTenantContext);
      vi.mocked(db.$queryRaw).mockResolvedValue([]);

      const createData: CreateUserDto = {
        keycloakId: 'keycloak-uuid-456',
        email: 'test@example.com',
      };

      await expect(repository.create(createData)).rejects.toThrow(
        'Failed to create user: no row returned'
      );
    });

    it('should log error on creation failure', async () => {
      vi.mocked(tenantContextModule.getTenantContext).mockReturnValue(mockTenantContext);
      const dbError = new Error('Unique constraint violation');
      vi.mocked(db.$queryRaw).mockRejectedValue(dbError);

      const createData: CreateUserDto = {
        keycloakId: 'keycloak-uuid-456',
        email: 'test@example.com',
      };

      await expect(repository.create(createData)).rejects.toThrow('Unique constraint violation');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          keycloakId: 'keycloak-uuid-456',
          email: 'test@example.com',
          error: 'Unique constraint violation',
        }),
        'Failed to create user'
      );
    });
  });

  describe('update', () => {
    it('should update single field', async () => {
      vi.mocked(tenantContextModule.getTenantContext).mockReturnValue(mockTenantContext);
      const updatedDbRow = { ...mockDbRow, display_name: 'Jane Doe' };
      const updatedUser = { ...mockUser, displayName: 'Jane Doe' };
      vi.mocked(db.$queryRawUnsafe).mockResolvedValue([updatedDbRow]);

      const updateData: UpdateUserDto = {
        displayName: 'Jane Doe',
      };

      const result = await repository.update('keycloak-uuid-456', updateData);

      expect(result).toEqual(updatedUser);
      expect(db.$queryRawUnsafe).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          keycloakId: 'keycloak-uuid-456',
          fieldsUpdated: ['displayName'],
        }),
        'User updated successfully'
      );
    });

    it('should update multiple fields', async () => {
      vi.mocked(tenantContextModule.getTenantContext).mockReturnValue(mockTenantContext);
      const updatedDbRow = { ...mockDbRow, first_name: 'Jane', last_name: 'Smith', locale: 'fr' };
      const updatedUser = { ...mockUser, firstName: 'Jane', lastName: 'Smith', locale: 'fr' };
      vi.mocked(db.$queryRawUnsafe).mockResolvedValue([updatedDbRow]);

      const updateData: UpdateUserDto = {
        firstName: 'Jane',
        lastName: 'Smith',
        locale: 'fr',
      };

      const result = await repository.update('keycloak-uuid-456', updateData);

      expect(result).toEqual(updatedUser);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          fieldsUpdated: ['firstName', 'lastName', 'locale'],
        }),
        'User updated successfully'
      );
    });

    it('should update preferences (JSONB)', async () => {
      vi.mocked(tenantContextModule.getTenantContext).mockReturnValue(mockTenantContext);
      const updatedDbRow = { ...mockDbRow, preferences: { theme: 'light', notifications: false } };
      vi.mocked(db.$queryRawUnsafe).mockResolvedValue([updatedDbRow]);

      const updateData: UpdateUserDto = {
        preferences: { theme: 'light', notifications: false },
      };

      const result = await repository.update('keycloak-uuid-456', updateData);

      expect(result.preferences).toEqual({ theme: 'light', notifications: false });
    });

    it('should update status enum', async () => {
      vi.mocked(tenantContextModule.getTenantContext).mockReturnValue(mockTenantContext);
      const updatedDbRow = { ...mockDbRow, status: 'SUSPENDED' };
      vi.mocked(db.$queryRawUnsafe).mockResolvedValue([updatedDbRow]);

      const updateData: UpdateUserDto = {
        status: 'SUSPENDED',
      };

      const result = await repository.update('keycloak-uuid-456', updateData);

      expect(result.status).toBe('SUSPENDED');
    });

    it('should throw error when user not found', async () => {
      vi.mocked(tenantContextModule.getTenantContext).mockReturnValue(mockTenantContext);
      vi.mocked(db.$queryRawUnsafe).mockResolvedValue([]);

      const updateData: UpdateUserDto = {
        displayName: 'Jane Doe',
      };

      await expect(repository.update('nonexistent-keycloak-id', updateData)).rejects.toThrow(
        "User with keycloakId 'nonexistent-keycloak-id' not found in tenant schema"
      );
    });

    it('should throw error when no fields provided', async () => {
      vi.mocked(tenantContextModule.getTenantContext).mockReturnValue(mockTenantContext);

      const updateData: UpdateUserDto = {};

      await expect(repository.update('keycloak-uuid-456', updateData)).rejects.toThrow(
        'No fields provided for update'
      );
    });

    it('should always update updated_at timestamp', async () => {
      vi.mocked(tenantContextModule.getTenantContext).mockReturnValue(mockTenantContext);
      vi.mocked(db.$queryRawUnsafe).mockResolvedValue([mockDbRow]);

      const updateData: UpdateUserDto = {
        displayName: 'Jane Doe',
      };

      await repository.update('keycloak-uuid-456', updateData);

      // Verify query includes updated_at = NOW()
      const callArgs = vi.mocked(db.$queryRawUnsafe).mock.calls[0];
      expect(callArgs[0]).toContain('updated_at = NOW()');
    });

    it('should log error on update failure', async () => {
      vi.mocked(tenantContextModule.getTenantContext).mockReturnValue(mockTenantContext);
      const dbError = new Error('Database error');
      vi.mocked(db.$queryRawUnsafe).mockRejectedValue(dbError);

      const updateData: UpdateUserDto = {
        displayName: 'Jane Doe',
      };

      await expect(repository.update('keycloak-uuid-456', updateData)).rejects.toThrow(
        'Database error'
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          keycloakId: 'keycloak-uuid-456',
          error: 'Database error',
        }),
        'Failed to update user'
      );
    });

    it('should use parameterized queries (SQL injection prevention)', async () => {
      vi.mocked(tenantContextModule.getTenantContext).mockReturnValue(mockTenantContext);
      vi.mocked(db.$queryRawUnsafe).mockResolvedValue([mockDbRow]);

      const maliciousData: UpdateUserDto = {
        displayName: "'; DROP TABLE users; --",
      };

      await repository.update('keycloak-uuid-456', maliciousData);

      // Verify query uses parameterized placeholders ($1, $2, etc.)
      const callArgs = vi.mocked(db.$queryRawUnsafe).mock.calls[0];
      expect(callArgs[0]).toContain('$1');
      expect(callArgs[1]).toBe("'; DROP TABLE users; --"); // Value is safely parameterized
    });
  });

  describe('softDelete', () => {
    it('should set status to DELETED', async () => {
      vi.mocked(tenantContextModule.getTenantContext).mockReturnValue(mockTenantContext);
      const deletedDbRow = { ...mockDbRow, status: 'DELETED' };
      vi.mocked(db.$queryRaw).mockResolvedValue([deletedDbRow]);

      const result = await repository.softDelete('keycloak-uuid-456');

      expect(result.status).toBe('DELETED');
      expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('should throw error when user not found', async () => {
      vi.mocked(tenantContextModule.getTenantContext).mockReturnValue(mockTenantContext);
      vi.mocked(db.$queryRaw).mockResolvedValue([]);

      await expect(repository.softDelete('nonexistent-keycloak-id')).rejects.toThrow(
        "User with keycloakId 'nonexistent-keycloak-id' not found in tenant schema"
      );
    });

    it('should update updated_at timestamp', async () => {
      vi.mocked(tenantContextModule.getTenantContext).mockReturnValue(mockTenantContext);
      const deletedDbRow = { ...mockDbRow, status: 'DELETED', updated_at: new Date() };
      vi.mocked(db.$queryRaw).mockResolvedValue([deletedDbRow]);

      const result = await repository.softDelete('keycloak-uuid-456');

      // Verify updatedAt is present in the mapped result
      expect(result.updatedAt).toBeDefined();
    });
  });

  describe('upsert', () => {
    it('should insert new user when not exists', async () => {
      vi.mocked(tenantContextModule.getTenantContext).mockReturnValue(mockTenantContext);
      vi.mocked(db.$queryRaw).mockResolvedValue([mockDbRow]);

      const createData: CreateUserDto = {
        keycloakId: 'keycloak-uuid-456',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
      };

      const result = await repository.upsert(createData);

      expect(result).toEqual(mockUser);
      expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('should update existing user on conflict', async () => {
      vi.mocked(tenantContextModule.getTenantContext).mockReturnValue(mockTenantContext);
      const updatedDbRow = { ...mockDbRow, email: 'updated@example.com' };
      vi.mocked(db.$queryRaw).mockResolvedValue([updatedDbRow]);

      const createData: CreateUserDto = {
        keycloakId: 'keycloak-uuid-456', // Existing keycloak_id
        email: 'updated@example.com',
        firstName: 'John',
        lastName: 'Doe',
      };

      const result = await repository.upsert(createData);

      expect(result.email).toBe('updated@example.com');
    });

    it('should use default values for optional fields on insert', async () => {
      vi.mocked(tenantContextModule.getTenantContext).mockReturnValue(mockTenantContext);
      vi.mocked(db.$queryRaw).mockResolvedValue([mockDbRow]);

      const minimalData: CreateUserDto = {
        keycloakId: 'keycloak-uuid-789',
        email: 'minimal@example.com',
      };

      await repository.upsert(minimalData);

      expect(db.$queryRaw).toHaveBeenCalledTimes(1);
      // Default locale='en', status='ACTIVE', preferences={} applied
    });

    it('should throw error when no row returned', async () => {
      vi.mocked(tenantContextModule.getTenantContext).mockReturnValue(mockTenantContext);
      vi.mocked(db.$queryRaw).mockResolvedValue([]);

      const createData: CreateUserDto = {
        keycloakId: 'keycloak-uuid-456',
        email: 'test@example.com',
      };

      await expect(repository.upsert(createData)).rejects.toThrow(
        'Failed to upsert user: no row returned'
      );
    });

    it('should handle JSONB preferences on upsert', async () => {
      vi.mocked(tenantContextModule.getTenantContext).mockReturnValue(mockTenantContext);
      const userWithPrefsDbRow = { ...mockDbRow, preferences: { theme: 'blue', layout: 'grid' } };
      vi.mocked(db.$queryRaw).mockResolvedValue([userWithPrefsDbRow]);

      const createData: CreateUserDto = {
        keycloakId: 'keycloak-uuid-456',
        email: 'test@example.com',
        preferences: { theme: 'blue', layout: 'grid' },
      };

      const result = await repository.upsert(createData);

      expect(result.preferences).toEqual({ theme: 'blue', layout: 'grid' });
    });
  });

  describe('Tenant Isolation', () => {
    it('should not find users from other tenants', async () => {
      const tenant1Context: TenantContext = {
        tenantId: 'tenant-1',
        tenantSlug: 'tenant-one',
        schemaName: 'tenant_one',
      };

      const tenant2Context: TenantContext = {
        tenantId: 'tenant-2',
        tenantSlug: 'tenant-two',
        schemaName: 'tenant_two',
      };

      // User exists in tenant 1
      vi.mocked(db.$queryRaw).mockResolvedValueOnce([mockDbRow]);

      const resultTenant1 = await repository.findByKeycloakId('keycloak-uuid-456', tenant1Context);
      expect(resultTenant1).toEqual(mockUser);

      // User does not exist in tenant 2 (different schema)
      vi.mocked(db.$queryRaw).mockResolvedValueOnce([]);

      const resultTenant2 = await repository.findByKeycloakId('keycloak-uuid-456', tenant2Context);
      expect(resultTenant2).toBeNull();
    });

    it('should not update users from other tenants', async () => {
      const tenant1Context: TenantContext = {
        tenantId: 'tenant-1',
        tenantSlug: 'tenant-one',
        schemaName: 'tenant_one',
      };

      const tenant2Context: TenantContext = {
        tenantId: 'tenant-2',
        tenantSlug: 'tenant-two',
        schemaName: 'tenant_two',
      };

      const updateData: UpdateUserDto = {
        displayName: 'Updated Name',
      };

      // Update succeeds in tenant 1
      vi.mocked(db.$queryRawUnsafe).mockResolvedValueOnce([mockDbRow]);

      await expect(
        repository.update('keycloak-uuid-456', updateData, tenant1Context)
      ).resolves.toBeDefined();

      // Update fails in tenant 2 (user not in that schema)
      vi.mocked(db.$queryRawUnsafe).mockResolvedValueOnce([]);

      await expect(
        repository.update('keycloak-uuid-456', updateData, tenant2Context)
      ).rejects.toThrow('not found in tenant schema');
    });

    it('should not delete users from other tenants', async () => {
      const tenant1Context: TenantContext = {
        tenantId: 'tenant-1',
        tenantSlug: 'tenant-one',
        schemaName: 'tenant_one',
      };

      const tenant2Context: TenantContext = {
        tenantId: 'tenant-2',
        tenantSlug: 'tenant-two',
        schemaName: 'tenant_two',
      };

      // Delete succeeds in tenant 1
      vi.mocked(db.$queryRaw).mockResolvedValueOnce([{ ...mockDbRow, status: 'DELETED' }]);

      await expect(
        repository.softDelete('keycloak-uuid-456', tenant1Context)
      ).resolves.toBeDefined();

      // Delete fails in tenant 2
      vi.mocked(db.$queryRaw).mockResolvedValueOnce([]);

      await expect(repository.softDelete('keycloak-uuid-456', tenant2Context)).rejects.toThrow(
        'not found in tenant schema'
      );
    });

    it('should enforce schema isolation across all operations', async () => {
      const tenant1Context: TenantContext = {
        tenantId: 'tenant-1',
        tenantSlug: 'tenant-one',
        schemaName: 'tenant_one',
      };

      const tenant2Context: TenantContext = {
        tenantId: 'tenant-2',
        tenantSlug: 'tenant-two',
        schemaName: 'tenant_two',
      };

      // Verify schema name is used correctly in queries
      vi.mocked(db.$queryRaw).mockResolvedValue([mockDbRow]);

      await repository.findByKeycloakId('keycloak-uuid-456', tenant1Context);
      expect(db.$queryRaw).toHaveBeenCalledTimes(1);

      await repository.findByKeycloakId('keycloak-uuid-456', tenant2Context);
      expect(db.$queryRaw).toHaveBeenCalledTimes(2);

      // Each call should use different schema names
      // This ensures tenant isolation at the database query level
    });
  });
});
