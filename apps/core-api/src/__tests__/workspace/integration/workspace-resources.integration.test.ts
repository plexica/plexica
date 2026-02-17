/**
 * Integration tests for Workspace Resource Sharing API endpoints
 *
 * Tests the 3 new API routes:
 * - POST /api/workspaces/:workspaceId/resources/share
 * - GET /api/workspaces/:workspaceId/resources
 * - DELETE /api/workspaces/:workspaceId/resources/:resourceId
 *
 * Spec 009 Task 3: Cross-Workspace Resource Sharing
 * Constitution Art. 4.1 (Test Coverage ≥80%)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { workspaceRoutes } from '../../../routes/workspace.js';
import { db } from '../../../lib/db.js';
import { v4 as uuidv4 } from 'uuid';
import { testAuth } from '../../../../../../test-infrastructure/helpers/test-auth.helper.js';

describe('Workspace Resource Sharing Integration Tests', () => {
  let app: FastifyInstance;
  let testTenantId: string;
  let testTenantSlug: string;
  let testSchemaName: string;
  let testWorkspaceId: string;
  let testPluginId: string;
  let authToken: string;

  beforeEach(async () => {
    // Create Fastify app
    app = Fastify();

    // Register workspace routes
    await app.register(workspaceRoutes, { prefix: '/api' });

    // Generate test IDs
    testTenantId = uuidv4();
    testTenantSlug = `test-tenant-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    testSchemaName = `tenant_${testTenantSlug.replace(/-/g, '_')}`;
    testWorkspaceId = uuidv4();
    testPluginId = uuidv4();

    // Create tenant record in core schema (required for authMiddleware validation)
    await db.$executeRawUnsafe(`
      INSERT INTO core.tenants (id, slug, name, status, created_at, updated_at)
      VALUES (
        '${testTenantId}',
        '${testTenantSlug}',
        'Test Tenant',
        'ACTIVE',
        NOW(),
        NOW()
      )
    `);

    // Generate valid JWT token with tenant context
    const token = testAuth.createMockToken({
      sub: 'test-user-id',
      email: 'test@example.com',
      preferred_username: 'testuser',
      tenant_id: testTenantSlug,
      realm_access: {
        roles: ['workspace-admin'],
      },
    });
    authToken = `Bearer ${token}`;

    // Create test schema (multi-tenant isolation)
    await db.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${testSchemaName}"`);

    // Create workspaces table in tenant schema
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "${testSchemaName}"."workspaces" (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL,
        slug VARCHAR(50) NOT NULL,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create workspace_resources table in tenant schema
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "${testSchemaName}"."workspace_resources" (
        id UUID PRIMARY KEY,
        workspace_id UUID NOT NULL,
        resource_type VARCHAR(100) NOT NULL,
        resource_id UUID NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(workspace_id, resource_type, resource_id)
      )
    `);

    // Insert test workspace with cross-workspace sharing ENABLED
    await db.$executeRawUnsafe(`
      INSERT INTO "${testSchemaName}"."workspaces"
      (id, tenant_id, slug, name, settings)
      VALUES (
        '${testWorkspaceId}',
        '${testTenantId}',
        'test-workspace',
        'Test Workspace',
        '{"allowCrossWorkspaceSharing": true}'::jsonb
      )
    `);
  });

  afterEach(async () => {
    // Clean up: drop test schema
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${testSchemaName}" CASCADE`);

    // Clean up: delete test tenant from core schema
    await db.$executeRawUnsafe(`DELETE FROM core.tenants WHERE id = '${testTenantId}'`);

    await app.close();
  });

  // ────────────────────────────────────────────────────────────────
  // POST /api/workspaces/:workspaceId/resources/share
  // ────────────────────────────────────────────────────────────────

  describe('POST /api/workspaces/:workspaceId/resources/share', () => {
    it('should share a resource with workspace (201)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${testWorkspaceId}/resources/share`,
        headers: {
          authorization: authToken,
        },
        payload: {
          resourceType: 'plugin',
          resourceId: testPluginId,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('id');
      expect(body.workspaceId).toBe(testWorkspaceId);
      expect(body.resourceType).toBe('plugin');
      expect(body.resourceId).toBe(testPluginId);
      expect(body).toHaveProperty('createdAt');
    });

    it('should return 403 when sharing is disabled in workspace settings', async () => {
      // Update workspace to disable sharing
      await db.$executeRawUnsafe(`
        UPDATE "${testSchemaName}"."workspaces"
        SET settings = '{"allowCrossWorkspaceSharing": false}'::jsonb
        WHERE id = '${testWorkspaceId}'
      `);

      const response = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${testWorkspaceId}/resources/share`,
        headers: {
          authorization: authToken,
        },
        payload: {
          resourceType: 'plugin',
          resourceId: testPluginId,
        },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('SHARING_DISABLED');
      expect(body.error.message).toContain('disabled');
    });

    it('should return 409 when resource is already shared (duplicate)', async () => {
      // First share
      await app.inject({
        method: 'POST',
        url: `/api/workspaces/${testWorkspaceId}/resources/share`,
        headers: {
          authorization: authToken,
        },
        payload: {
          resourceType: 'plugin',
          resourceId: testPluginId,
        },
      });

      // Attempt duplicate share
      const response = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${testWorkspaceId}/resources/share`,
        headers: {
          authorization: authToken,
        },
        payload: {
          resourceType: 'plugin',
          resourceId: testPluginId,
        },
      });

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('RESOURCE_ALREADY_SHARED');
      expect(body.error.message).toContain('already shared');
    });

    it('should return 400 when request body is invalid', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${testWorkspaceId}/resources/share`,
        headers: {
          authorization: authToken,
        },
        payload: {
          resourceType: '', // Invalid: empty string
          resourceId: 'not-a-uuid', // Invalid: not a UUID
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ────────────────────────────────────────────────────────────────
  // GET /api/workspaces/:workspaceId/resources
  // ────────────────────────────────────────────────────────────────

  describe('GET /api/workspaces/:workspaceId/resources', () => {
    beforeEach(async () => {
      // Insert test resource shares
      const resource1Id = uuidv4();
      const resource2Id = uuidv4();
      const resource3Id = uuidv4();

      await db.$executeRawUnsafe(`
        INSERT INTO "${testSchemaName}"."workspace_resources"
        (id, workspace_id, resource_type, resource_id, created_at)
        VALUES
        ('${resource1Id}', '${testWorkspaceId}', 'plugin', '${testPluginId}', NOW()),
        ('${resource2Id}', '${testWorkspaceId}', 'template', '${uuidv4()}', NOW()),
        ('${resource3Id}', '${testWorkspaceId}', 'dataset', '${uuidv4()}', NOW())
      `);
    });

    it('should list all shared resources with default pagination (200)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${testWorkspaceId}/resources`,
        headers: {
          authorization: authToken,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('data');
      expect(body.data).toBeInstanceOf(Array);
      expect(body.data.length).toBe(3);
      expect(body).toHaveProperty('pagination');
      expect(body.pagination.limit).toBe(50);
      expect(body.pagination.offset).toBe(0);
      expect(body.pagination.total).toBe(3);
      expect(body.pagination.hasMore).toBe(false);
    });

    it('should filter resources by resourceType query parameter (200)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${testWorkspaceId}/resources?resourceType=plugin`,
        headers: {
          authorization: authToken,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeInstanceOf(Array);
      expect(body.data.length).toBe(1);
      expect(body.data[0].resourceType).toBe('plugin');
      expect(body.data[0].resourceId).toBe(testPluginId);
    });

    it('should support pagination with limit and offset query parameters (200)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${testWorkspaceId}/resources?limit=2&offset=1`,
        headers: {
          authorization: authToken,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeInstanceOf(Array);
      expect(body.data.length).toBe(2);
      expect(body.pagination.limit).toBe(2);
      expect(body.pagination.offset).toBe(1);
      expect(body.pagination.hasMore).toBe(false);
    });

    it('should return empty array when no resources are shared (200)', async () => {
      // Delete all resources
      await db.$executeRawUnsafe(`
        DELETE FROM "${testSchemaName}"."workspace_resources"
        WHERE workspace_id = '${testWorkspaceId}'
      `);

      const response = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${testWorkspaceId}/resources`,
        headers: {
          authorization: authToken,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeInstanceOf(Array);
      expect(body.data.length).toBe(0);
      expect(body.pagination.total).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // DELETE /api/workspaces/:workspaceId/resources/:resourceId
  // ────────────────────────────────────────────────────────────────

  describe('DELETE /api/workspaces/:workspaceId/resources/:resourceId', () => {
    let testResourceLinkId: string;

    beforeEach(async () => {
      // Insert a test resource share
      testResourceLinkId = uuidv4();
      await db.$executeRawUnsafe(`
        INSERT INTO "${testSchemaName}"."workspace_resources"
        (id, workspace_id, resource_type, resource_id, created_at)
        VALUES ('${testResourceLinkId}', '${testWorkspaceId}', 'plugin', '${testPluginId}', NOW())
      `);
    });

    it('should unshare a resource from workspace (204)', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/workspaces/${testWorkspaceId}/resources/${testResourceLinkId}`,
        headers: {
          authorization: authToken,
        },
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');

      // Verify resource is deleted
      const result = await db.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM "${testSchemaName}"."workspace_resources" WHERE id = '${testResourceLinkId}'`
      );
      expect(result.length).toBe(0);
    });

    it('should return 404 when resource link does not exist', async () => {
      const nonExistentId = uuidv4();

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/workspaces/${testWorkspaceId}/resources/${nonExistentId}`,
        headers: {
          authorization: authToken,
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('RESOURCE_NOT_FOUND');
      expect(body.error.message).toContain('not found');
    });
  });
});
