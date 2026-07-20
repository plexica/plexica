// plugin-manifest-validation.test.ts
// Integration tests — Manifest validation business rules (Spec 004, Phase 1).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminCatalogRoutes } from '../modules/plugin/routes/admin-catalog.routes.js';

import { createTestServer, makeFullStub, isDbReachable } from './helpers/server.helpers.js';

import type { FastifyInstance } from 'fastify';
import type { TenantContext } from '../lib/tenant-context-store.js';

let server: FastifyInstance;

const SUPER_ADMIN_ACTOR = '00000000-0000-0000-0000-000000000000';
const mockTenantContext: TenantContext = {
  slug: 'system', schemaName: 'core', realmName: 'master',
  tenantId: '00000000-0000-0000-0000-000000000000',
};

const baseManifest = {
  name: 'Test', version: '1.0.0', description: 'test', author: 'Test', icon: 'test',
  hosting: { type: 'sidecar' as const, image: 'test/test:1.0.0', port: 3000 },
  declaredTables: [], events: { subscribes: [] },
};

function registerPayload(slug: string, manifest: Record<string, unknown>) {
  return {
    method: 'POST' as const, url: '/api/v1/admin/plugins/register',
    payload: { slug, name: 'Test', registryUrl: 'https://registry.example.com',
      imageName: slug, imageTag: '1.0.0', manifest },
  };
}

beforeAll(async () => {
  // Fail hard if DB is not reachable — no silent skips (Constitution Rule 2)
  const dbReachable = await isDbReachable();
  if (!dbReachable) {
    throw new Error('Database is not reachable — tests cannot run. Ensure PostgreSQL is running and DATABASE_URL is configured.');
  }

  server = await createTestServer();
  server.addHook('preHandler', makeFullStub(SUPER_ADMIN_ACTOR, mockTenantContext, ['super_admin']));
  await server.register(adminCatalogRoutes);
  await server.ready();
});

afterAll(async () => { await server.close(); });

describe('Manifest Validation — Business Rules', () => {
  it('rejects action with core namespace prefix', async () => {
    const res = await server.inject(registerPayload('test-bad-ns', {
      ...baseManifest, slug: 'test-bad-ns',
      actions: [{ action: 'workspace:create:test', label: 'Bad', defaultRole: 'member' }],
    }));
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.payload).error.message).toContain('namespace');
  });

  it('rejects table without plugin slug prefix', async () => {
    const res = await server.inject(registerPayload('test-bad-tbl', {
      ...baseManifest, slug: 'test-bad-tbl',
      declaredTables: [{ name: 'contacts', migrationFile: '001.sql' }],
    }));
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.payload).error.message).toContain('prefixed');
  });

  it('rejects 2-part action key', async () => {
    const res = await server.inject(registerPayload('test-2part', {
      ...baseManifest, slug: 'test-2part',
      actions: [{ action: 'contact:create', label: 'Bad', defaultRole: 'member' }],
    }));
    expect(res.statusCode).toBe(422);
  });

  it('rejects manifest with missing required fields', async () => {
    const res = await server.inject(registerPayload('test-missing', { slug: 'test-missing' }));
    expect(res.statusCode).toBe(422);
  });

  it('rejects action where first segment != slug', async () => {
    const res = await server.inject(registerPayload('test-wrong', {
      ...baseManifest, slug: 'test-wrong',
      actions: [{ action: 'other-plugin:contact:create', label: 'Bad', defaultRole: 'member' }],
    }));
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.payload).error.message).toContain('first segment');
  });

  it('accepts valid manifest with actions + tables', async () => {
    const res = await server.inject(registerPayload('test-valid', {
      ...baseManifest, slug: 'test-valid',
      actions: [{ action: 'test-valid:contact:create', label: 'Create', defaultRole: 'member' }],
      declaredTables: [{ name: 'test_valid_contacts', migrationFile: '001.sql' }],
    }));
    expect(res.statusCode).toBe(200);
  });
});
