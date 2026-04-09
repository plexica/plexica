// user-profile.test.ts
// Integration tests — INT-05: User profile get/update and avatar upload.
// Spec 003, Phase 18.5

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../lib/database.js';
import { userProfileRoutes } from '../modules/user-profile/routes.js';
import { config } from '../lib/config.js';

import {
  createTestServer,
  makeFullStub,
  isDbReachable,
  isMinioReachable,
} from './helpers/server.helpers.js';
import {
  seedTenant,
  seedUserProfile,
  wipeTenantWorkspaces,
  wipeTenantUsers,
  cleanupTenant,
} from './helpers/db.helpers.js';

import type { FastifyInstance } from 'fastify';
import type { TenantContext } from '../lib/tenant-context-store.js';
import type { UserProfileDto } from '../modules/user-profile/types.js';

const SLUG = 'ws-int05-profile';
const USER_ID = 'user-int05';

const skipIfNoDb = it.skipIf(!(await isDbReachable()));
const skipIfNoMinio = it.skipIf(!(await isMinioReachable()));

let server: FastifyInstance;
let ctx: TenantContext;
let reqHeaders: Record<string, string>;

beforeAll(async () => {
  const { tenantContext } = await seedTenant(SLUG);
  ctx = tenantContext;

  server = await createTestServer();
  const stub = makeFullStub(USER_ID, ctx, []);
  server.addHook('preHandler', stub);
  await server.register(userProfileRoutes);
  await server.ready();

  reqHeaders = { 'x-tenant-slug': SLUG };
});

afterAll(async () => {
  await server.close();
  await cleanupTenant(SLUG);
  await prisma.$disconnect();
});

beforeEach(async () => {
  await wipeTenantWorkspaces(ctx);
  await wipeTenantUsers(ctx);
  await seedUserProfile(ctx, USER_ID, `${USER_ID}@test.plexica.io`, 'Profile User');
});

describe('INT-05 Get profile', () => {
  skipIfNoDb('GET /api/v1/profile → returns user profile', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/profile', headers: reqHeaders });
    expect(res.statusCode).toBe(200);
    const profile = JSON.parse(res.body) as UserProfileDto;
    expect(profile.keycloakUserId).toBe(USER_ID);
    expect(profile.email).toBe(`${USER_ID}@test.plexica.io`);
    expect(profile.displayName).toBe('Profile User');
  });
});

describe('INT-05 Update profile', () => {
  skipIfNoDb('PATCH /api/v1/profile → updates displayName, timezone, language', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: '/api/v1/profile',
      headers: { 'content-type': 'application/json', ...reqHeaders },
      body: JSON.stringify({
        displayName: 'Updated Name',
        timezone: 'America/New_York',
        language: 'it',
      }),
    });
    expect(res.statusCode).toBe(200);
    const profile = JSON.parse(res.body) as UserProfileDto;
    expect(profile.displayName).toBe('Updated Name');
    expect(profile.timezone).toBe('America/New_York');
    expect(profile.language).toBe('it');
  });
});

describe('INT-05 Avatar upload', () => {
  skipIfNoMinio('rejects avatar > 1MB (413 FILE_TOO_LARGE)', async () => {
    const oversize = Buffer.alloc(config.AVATAR_MAX_BYTES + 1, 'a');
    const boundary = '----TestBoundaryAvatarLimit';
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="big.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`
      ),
      oversize,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/profile/avatar',
      headers: {
        ...reqHeaders,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });
    expect(res.statusCode).toBe(413);
  });

  skipIfNoMinio('rejects avatar with invalid MIME type (415)', async () => {
    const boundary = '----TestBoundaryAvatarMime';
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="doc.txt"\r\nContent-Type: text/plain\r\n\r\n`
      ),
      Buffer.from('hello world'),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/profile/avatar',
      headers: {
        ...reqHeaders,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });
    expect(res.statusCode).toBe(415);
  });

  skipIfNoMinio('accepts valid avatar upload < 1MB → 200, avatarUrl returned', async () => {
    const content = Buffer.alloc(512, 0xff); // 512 bytes fake JPEG
    const boundary = '----TestBoundaryAvatarValid';
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="avatar.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`
      ),
      content,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/profile/avatar',
      headers: {
        ...reqHeaders,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body) as { data: { avatarUrl: string } };
    expect(typeof result.data.avatarUrl).toBe('string');
    expect(result.data.avatarUrl.length).toBeGreaterThan(0);
  });
});
