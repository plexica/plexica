// tenant-settings.test.ts
// Integration tests — INT-06: Tenant settings, branding, and auth config.
// Spec 003, Phase 18.6

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '../lib/database.js';
import { tenantSettingsRoutes } from '../modules/tenant-settings/routes.js';
import { config } from '../lib/config.js';

import {
  createTestServer,
  makeFullStub,
  isDbReachable,
  isKeycloakReachable,
  isMinioReachable,
} from './helpers/server.helpers.js';
import { seedTenant, cleanupTenant } from './helpers/db.helpers.js';

import type { FastifyInstance } from 'fastify';
import type { TenantContext } from '../lib/tenant-context-store.js';
import type {
  TenantSettingsDto,
  TenantBrandingDto,
  AuthConfigDto,
} from '../modules/tenant-settings/types.js';

const SLUG = 'ws-int06-settings';
const ADMIN_ID = 'admin-int06';

const skipIfNoDb = it.skipIf(!(await isDbReachable()));
const skipIfNoKC = it.skipIf(!(await isKeycloakReachable()));
const skipIfNoMinio = it.skipIf(!(await isMinioReachable()));

let server: FastifyInstance;
let ctx: TenantContext;
let reqHeaders: Record<string, string>;

beforeAll(async () => {
  const { tenantContext } = await seedTenant(SLUG);
  ctx = tenantContext;

  server = await createTestServer();
  const stub = makeFullStub(ADMIN_ID, ctx, ['tenant_admin']);
  server.addHook('preHandler', stub);
  await server.register(tenantSettingsRoutes);
  await server.ready();

  reqHeaders = { 'x-tenant-slug': SLUG, 'content-type': 'application/json' };
});

afterAll(async () => {
  await server.close();
  await cleanupTenant(SLUG);
  await prisma.$disconnect();
});

describe('INT-06 Tenant settings', () => {
  skipIfNoDb('GET /api/v1/tenant/settings → returns settings', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/tenant/settings',
      headers: reqHeaders,
    });
    expect(res.statusCode).toBe(200);
    const settings = JSON.parse(res.body) as TenantSettingsDto;
    expect(settings.slug).toBe(SLUG);
    expect(typeof settings.displayName).toBe('string');
  });

  skipIfNoDb('PATCH /api/v1/tenant/settings → updates displayName', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: '/api/v1/tenant/settings',
      headers: reqHeaders,
      body: JSON.stringify({ displayName: 'Updated Display' }),
    });
    expect(res.statusCode).toBe(200);
    const settings = JSON.parse(res.body) as TenantSettingsDto;
    expect(settings.displayName).toBe('Updated Display');
  });

  skipIfNoDb('slug is immutable — PATCH with slug field ignored', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: '/api/v1/tenant/settings',
      headers: reqHeaders,
      body: JSON.stringify({ displayName: 'Another Name', slug: 'should-be-ignored' }),
    });
    expect(res.statusCode).toBe(200);
    const settings = JSON.parse(res.body) as TenantSettingsDto;
    expect(settings.slug).toBe(SLUG);
  });
});

describe('INT-06 Branding', () => {
  skipIfNoDb('PATCH /api/v1/tenant/branding → updates primaryColor', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: '/api/v1/tenant/branding',
      headers: reqHeaders,
      body: JSON.stringify({ primaryColor: '#FF5733' }),
    });
    expect(res.statusCode).toBe(200);
    const branding = JSON.parse(res.body) as TenantBrandingDto;
    expect(branding.primaryColor).toBe('#FF5733');
  });

  skipIfNoDb('GET /api/v1/tenant/branding → returns branding including updated color', async () => {
    await server.inject({
      method: 'PATCH',
      url: '/api/v1/tenant/branding',
      headers: reqHeaders,
      body: JSON.stringify({ primaryColor: '#112233' }),
    });
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/tenant/branding',
      headers: reqHeaders,
    });
    expect(res.statusCode).toBe(200);
    const branding = JSON.parse(res.body) as TenantBrandingDto;
    expect(branding.primaryColor).toBe('#112233');
  });

  skipIfNoMinio('rejects logo upload > 2MB (413)', async () => {
    const oversize = Buffer.alloc(config.LOGO_MAX_BYTES + 1, 0x00);
    const boundary = '----TestBoundaryLogoSize';
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="logo"; filename="logo.png"\r\nContent-Type: image/png\r\n\r\n`
      ),
      oversize,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const res = await server.inject({
      method: 'PATCH',
      url: '/api/v1/tenant/branding',
      headers: {
        'x-tenant-slug': SLUG,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });
    expect(res.statusCode).toBe(413);
  });
});

describe('INT-06 Auth config', () => {
  skipIfNoDb('GET /api/v1/tenant/auth-config → returns auth config shape', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/tenant/auth-config',
      headers: reqHeaders,
    });
    expect(res.statusCode).toBe(200);
    const cfg = JSON.parse(res.body) as AuthConfigDto;
    expect(typeof cfg.bruteForceProtected).toBe('boolean');
  });

  skipIfNoKC('PATCH /api/v1/tenant/auth-config → updates Keycloak realm config', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: '/api/v1/tenant/auth-config',
      headers: reqHeaders,
      body: JSON.stringify({ bruteForceProtected: true, failureFactor: 5 }),
    });
    expect(res.statusCode).toBe(200);
    const cfg = JSON.parse(res.body) as AuthConfigDto;
    expect(cfg.bruteForceProtected).toBe(true);
  });
});
