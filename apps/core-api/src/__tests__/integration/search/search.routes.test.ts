// File: apps/core-api/src/__tests__/integration/search/search.routes.test.ts
// Spec 007 T007-43: Integration tests for Search REST endpoints
//
// Covers:
//   POST   /api/v1/search/index     — index a document (admin only)
//   POST   /api/v1/search           — full-text search (any authenticated user)
//   DELETE /api/v1/search/:id       — delete a document (admin only)
//   POST   /api/v1/search/reindex   — enqueue background reindex job (admin only)
//
// Pattern: buildTestApp() + app.inject() + mock tokens (workspace-crud pattern)
// Constitution Art. 6.2: error responses are { error: { code, message } }
// TD-010: _resetJobQueueSingletonForTests() called in afterAll (search uses job queue for reindex)

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../../../test-app.js';
import { testContext } from '../../../../../../test-infrastructure/helpers/test-context.helper.js';
import { _resetJobQueueSingletonForTests } from '../../../modules/jobs/job-queue.singleton.js';

describe('Search Routes Integration', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let memberToken: string;
  let testTenantSlug: string;

  beforeAll(async () => {
    await testContext.resetAll();

    app = await buildTestApp();
    await app.ready();

    const superAdminToken = testContext.auth.createMockSuperAdminToken();
    testTenantSlug = `search-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const tenantRes = await app.inject({
      method: 'POST',
      url: '/api/admin/tenants',
      headers: { authorization: `Bearer ${superAdminToken}`, 'content-type': 'application/json' },
      payload: {
        slug: testTenantSlug,
        name: 'Search Test Tenant',
        adminEmail: `admin@${testTenantSlug}.test`,
        adminPassword: 'Test1234!',
      },
    });

    if (tenantRes.statusCode !== 201) {
      throw new Error(`Failed to create test tenant: ${tenantRes.body}`);
    }

    adminToken = testContext.auth.createMockTenantAdminToken(testTenantSlug, {
      sub: 'a1a1a1a1-1111-4111-a111-111111111111',
      email: `admin@${testTenantSlug}.test`,
    });
    memberToken = testContext.auth.createMockTenantMemberToken(testTenantSlug, {
      sub: 'b2b2b2b2-2222-4222-b222-222222222222',
      email: `member@${testTenantSlug}.test`,
    });
  });

  afterAll(async () => {
    if (app) await app.close();
    // Reset BullMQ singleton — search routes use job queue for reindex (TD-010)
    _resetJobQueueSingletonForTests();
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/search/index — index a document (admin only)
  // -------------------------------------------------------------------------
  describe('POST /api/v1/search/index', () => {
    it('should index a document and return 201 with documentId', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/search/index',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: {
          documentId: 'doc-001',
          type: 'workspace',
          title: 'Test Workspace',
          body: 'A workspace for integration testing of the search index endpoint',
          metadata: { owner: 'test-user' },
        },
      });

      expect(res.statusCode).toBe(201);
      const json = res.json();
      expect(json).toHaveProperty('message');
      expect(json).toHaveProperty('documentId', 'doc-001');
    });

    it('should return 400 when required fields are missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/search/index',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: {
          // missing: documentId, type, title, body
        },
      });

      expect(res.statusCode).toBe(400);
      const json = res.json();
      expect(json).toHaveProperty('error');
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when body is empty string', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/search/index',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: {
          documentId: 'doc-bad',
          type: 'workspace',
          title: 'Bad Doc',
          body: '', // body must be non-empty
        },
      });

      expect(res.statusCode).toBe(400);
      const json = res.json();
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 403 when called by a member (non-admin)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/search/index',
        headers: {
          authorization: `Bearer ${memberToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: {
          documentId: 'doc-forbidden',
          type: 'workspace',
          title: 'Should be blocked',
          body: 'Member cannot index documents',
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it('should return 401 when unauthenticated', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/search/index',
        headers: {
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: {
          documentId: 'doc-unauth',
          type: 'workspace',
          title: 'Unauth',
          body: 'Should be rejected',
        },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/search — full-text search (any authenticated user)
  // -------------------------------------------------------------------------
  describe('POST /api/v1/search', () => {
    it('should return search results with count and query (200)', async () => {
      // First index a document so we have something to find
      await app.inject({
        method: 'POST',
        url: '/api/v1/search/index',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: {
          documentId: 'doc-searchable',
          type: 'contact',
          title: 'John Smith',
          body: 'Contact record for John Smith, engineering lead at Acme Corp',
        },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/search',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: { q: 'John' },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json).toHaveProperty('results');
      expect(json).toHaveProperty('count');
      expect(json).toHaveProperty('query', 'John');
      expect(Array.isArray(json.results)).toBe(true);
      expect(typeof json.count).toBe('number');
    });

    it('should allow members (non-admin) to search', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/search',
        headers: {
          authorization: `Bearer ${memberToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: { q: 'workspace' },
      });

      expect(res.statusCode).toBe(200);
    });

    it('should accept optional type filter', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/search',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: { q: 'John', type: 'contact', limit: 10 },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json).toHaveProperty('results');
    });

    it('should return 400 when query string is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/search',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: {
          // missing: q
        },
      });

      expect(res.statusCode).toBe(400);
      const json = res.json();
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when query is an empty string', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/search',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: { q: '' },
      });

      expect(res.statusCode).toBe(400);
      const json = res.json();
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 401 when unauthenticated', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/search',
        headers: { 'x-tenant-slug': testTenantSlug, 'content-type': 'application/json' },
        payload: { q: 'test' },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /api/v1/search/:documentId — delete a document (admin only)
  // -------------------------------------------------------------------------
  describe('DELETE /api/v1/search/:documentId', () => {
    it('should delete an indexed document and return 204', async () => {
      // Index a document to delete
      await app.inject({
        method: 'POST',
        url: '/api/v1/search/index',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: {
          documentId: 'doc-to-delete',
          type: 'workspace',
          title: 'Deletable Document',
          body: 'This document will be removed from the index',
        },
      });

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/search/doc-to-delete?type=workspace',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
        },
      });

      expect(res.statusCode).toBe(204);
    });

    it('should return 400 when the type query param is missing', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/search/doc-001',
        // no ?type= query param
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
        },
      });

      expect(res.statusCode).toBe(400);
      const json = res.json();
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 403 when called by a member (non-admin)', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/search/doc-001?type=workspace',
        headers: {
          authorization: `Bearer ${memberToken}`,
          'x-tenant-slug': testTenantSlug,
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it('should return 401 when unauthenticated', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/search/doc-001?type=workspace',
        headers: { 'x-tenant-slug': testTenantSlug },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/search/reindex — background reindex job (admin only)
  // -------------------------------------------------------------------------
  describe('POST /api/v1/search/reindex', () => {
    it('should enqueue a reindex job and return 202 with jobId', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/search/reindex',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: { type: 'workspace' },
      });

      expect(res.statusCode).toBe(202);
      const json = res.json();
      expect(json).toHaveProperty('message');
      expect(json).toHaveProperty('jobId');
    });

    it('should return 400 when type is missing from body', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/search/reindex',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: {
          // missing: type
        },
      });

      expect(res.statusCode).toBe(400);
      const json = res.json();
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when type is not a string', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/search/reindex',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: { type: 42 }, // must be string
      });

      expect(res.statusCode).toBe(400);
      const json = res.json();
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 403 when called by a member (non-admin)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/search/reindex',
        headers: {
          authorization: `Bearer ${memberToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: { type: 'workspace' },
      });

      expect(res.statusCode).toBe(403);
    });

    it('should return 401 when unauthenticated', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/search/reindex',
        headers: { 'x-tenant-slug': testTenantSlug, 'content-type': 'application/json' },
        payload: { type: 'workspace' },
      });

      expect(res.statusCode).toBe(401);
    });
  });
});
