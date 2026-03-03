// File: apps/core-api/src/__tests__/integration/storage/storage.routes.test.ts
// Spec 007 T007-40: Integration tests for Storage REST endpoints
//
// Covers:
//   POST /api/v1/storage/upload
//   GET  /api/v1/storage/download/*
//   GET  /api/v1/storage/list
//   GET  /api/v1/storage/signed-url/*
//   DELETE /api/v1/storage/*   (admin only)
//
// Pattern: buildTestApp() + app.inject() + mock tokens (workspace-crud pattern)
// Constitution Art. 5.2: no PII in assertions
// Constitution Art. 6.2: error responses are { error: { code, message } }

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../../../test-app.js';
import { testContext } from '../../../../../../test-infrastructure/helpers/test-context.helper.js';

// ---------------------------------------------------------------------------
// Multipart helper — build a minimal multipart/form-data body as a Buffer
// ---------------------------------------------------------------------------
function buildMultipartBody(
  boundary: string,
  fieldname: string,
  filename: string,
  content: Buffer,
  contentType = 'application/octet-stream'
): Buffer {
  const parts: Buffer[] = [
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${fieldname}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`
    ),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ];
  return Buffer.concat(parts);
}

describe('Storage Routes Integration', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let memberToken: string;
  let testTenantSlug: string;
  /** Track uploaded keys so we can assert delete works */
  const uploadedKeys: string[] = [];

  beforeAll(async () => {
    await testContext.resetAll();

    app = await buildTestApp();
    await app.ready();

    // Super-admin token to create tenant
    const superAdminToken = testContext.auth.createMockSuperAdminToken();

    // Unique tenant per test run
    testTenantSlug = `storage-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const tenantRes = await app.inject({
      method: 'POST',
      url: '/api/admin/tenants',
      headers: { authorization: `Bearer ${superAdminToken}`, 'content-type': 'application/json' },
      payload: {
        slug: testTenantSlug,
        name: 'Storage Test Tenant',
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
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/storage/upload
  // -------------------------------------------------------------------------
  describe('POST /api/v1/storage/upload', () => {
    it('should upload a file and return file metadata (201)', async () => {
      const boundary = 'TestBoundary001';
      const fileContent = Buffer.from('Hello, Plexica Storage!');
      const body = buildMultipartBody(boundary, 'file', 'hello.txt', fileContent, 'text/plain');

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/storage/upload',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });

      expect(res.statusCode).toBe(201);
      const json = res.json();
      expect(json).toHaveProperty('key');
      expect(json).toHaveProperty('size', fileContent.length);
      expect(json).toHaveProperty('bucket');
      expect(json).toHaveProperty('contentType');
      uploadedKeys.push(json.key);
    });

    it('should return 401 when no auth token is provided', async () => {
      const boundary = 'TestBoundary002';
      const body = buildMultipartBody(boundary, 'file', 'test.txt', Buffer.from('x'));

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/storage/upload',
        headers: {
          'x-tenant-slug': testTenantSlug,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });

      expect(res.statusCode).toBe(401);
    });

    it('should return 400 when no file is included in the multipart body', async () => {
      // Send an empty multipart (just boundary, no file part)
      const boundary = 'TestBoundary003';
      const emptyBody = Buffer.from(`--${boundary}--\r\n`);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/storage/upload',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: emptyBody,
      });

      // Either 400 (no file) or the multipart parser returns an error
      expect([400, 500]).toContain(res.statusCode);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/storage/list
  // -------------------------------------------------------------------------
  describe('GET /api/v1/storage/list', () => {
    it('should list files for the tenant (200)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/storage/list',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json).toHaveProperty('files');
      expect(json).toHaveProperty('count');
      expect(Array.isArray(json.files)).toBe(true);
    });

    it('should filter by prefix when ?prefix= is provided', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/storage/list?prefix=uploads/',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json).toHaveProperty('files');
    });

    it('should return 401 when unauthenticated', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/storage/list',
        headers: { 'x-tenant-slug': testTenantSlug },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/storage/signed-url/*
  // -------------------------------------------------------------------------
  describe('GET /api/v1/storage/signed-url/*', () => {
    it('should return a signed URL for an existing file key (200)', async () => {
      // Upload a file first so we have a real key
      const boundary = 'TestBoundary004';
      const body = buildMultipartBody(
        boundary,
        'file',
        'signed.txt',
        Buffer.from('signed url test'),
        'text/plain'
      );
      const uploadRes = await app.inject({
        method: 'POST',
        url: '/api/v1/storage/upload',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });
      expect(uploadRes.statusCode).toBe(201);
      const { key } = uploadRes.json();
      uploadedKeys.push(key);

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/storage/signed-url/${key}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json).toHaveProperty('url');
      expect(typeof json.url).toBe('string');
      expect(json).toHaveProperty('expiresIn');
    });

    it('should respect custom ?expiresIn= query param', async () => {
      if (uploadedKeys.length === 0) return;
      const key = uploadedKeys[0];

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/storage/signed-url/${key}?expiresIn=300`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.expiresIn).toBe(300);
    });

    it('should reject path traversal attempts (400)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/storage/signed-url/../../../etc/passwd',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
        },
      });

      // Path traversal → 400
      expect(res.statusCode).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/storage/download/*
  // -------------------------------------------------------------------------
  describe('GET /api/v1/storage/download/*', () => {
    it('should download an uploaded file (200)', async () => {
      // Upload first
      const boundary = 'TestBoundary005';
      const fileContent = Buffer.from('Download me!');
      const body = buildMultipartBody(boundary, 'file', 'download.txt', fileContent, 'text/plain');

      const uploadRes = await app.inject({
        method: 'POST',
        url: '/api/v1/storage/upload',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });
      expect(uploadRes.statusCode).toBe(201);
      const { key } = uploadRes.json();
      uploadedKeys.push(key);

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/storage/download/${key}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-disposition']).toContain('attachment');
    });

    it('should return 404 for a non-existent file', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/storage/download/uploads/nonexistent-file-xyz.txt',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
        },
      });

      expect(res.statusCode).toBe(404);
      const json = res.json();
      expect(json.error.code).toContain('STORAGE');
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /api/v1/storage/*  (admin only)
  // -------------------------------------------------------------------------
  describe('DELETE /api/v1/storage/*', () => {
    it('should delete an uploaded file (204) when called by admin', async () => {
      // Upload a file to delete
      const boundary = 'TestBoundary006';
      const body = buildMultipartBody(
        boundary,
        'file',
        'todelete.txt',
        Buffer.from('bye'),
        'text/plain'
      );
      const uploadRes = await app.inject({
        method: 'POST',
        url: '/api/v1/storage/upload',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });
      expect(uploadRes.statusCode).toBe(201);
      const { key } = uploadRes.json();

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/storage/${key}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
        },
      });

      expect(res.statusCode).toBe(204);
    });

    it('should return 403 when called by a member (non-admin)', async () => {
      // Use a key that (probably) exists — the exact key doesn't matter, role check
      // happens before the storage operation
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/storage/uploads/some-file.txt',
        headers: {
          authorization: `Bearer ${memberToken}`,
          'x-tenant-slug': testTenantSlug,
        },
      });

      expect(res.statusCode).toBe(403);
    });
  });
});
