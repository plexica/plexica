// tenant-settings-logo-upload.test.ts
// Integration tests — INT-06 Branding logo upload: size limit, magic-byte
// sniffing, and SVG active-content rejection on PATCH /api/v1/tenant/branding.
// Split from tenant-settings.test.ts to stay under the 200-line file limit
// (Rule 4). Spec 003, Phase 9 — closes the gap where the logo path (the only
// one accepting image/svg+xml) trusted the client-declared Content-Type.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { config } from '../lib/config.js';
import { prisma } from '../lib/database.js';
import { tenantSettingsRoutes } from '../modules/tenant-settings/routes.js';

import {
  cleanupTenant, ensureTenantBucket, removeTenantBucket, seedTenant,
} from './helpers/db.helpers.js';
import { createTestServer, isMinioReachable, makeFullStub } from './helpers/server.helpers.js';

import type { FastifyInstance } from 'fastify';
import type { TenantContext } from '../lib/tenant-context-store.js';

const SLUG = 'ws-int06-logo-upload';
// Fixed UUID — audit_log.actor_id is UUID NOT NULL (written by updateBranding)
const ADMIN_ID = '00000000-0106-0002-0000-000000000001';

const minioAvailable = await isMinioReachable();
const skipIfNoMinio = it.skipIf(!minioAvailable);

let server: FastifyInstance;
let ctx: TenantContext;

/** Builds a single-file multipart/form-data body for the "logo" field. */
function buildLogoBody(
  boundary: string,
  filename: string,
  contentType: string,
  data: Buffer
): Buffer {
  return Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="logo"; filename="${filename}"\r\n` +
        `Content-Type: ${contentType}\r\n\r\n`
    ),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
}

async function patchLogo(boundary: string, body: Buffer) {
  return server.inject({
    method: 'PATCH',
    url: '/api/v1/tenant/branding',
    headers: {
      'x-tenant-slug': SLUG,
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });
}

beforeAll(async () => {
  const { tenantContext } = await seedTenant(SLUG);
  ctx = tenantContext;
  await ensureTenantBucket(SLUG);

  server = await createTestServer();
  const stub = makeFullStub(ADMIN_ID, ctx, ['tenant_admin']);
  server.addHook('preHandler', stub);
  await server.register(tenantSettingsRoutes);
  await server.ready();
});

afterAll(async () => {
  await server?.close();
  await removeTenantBucket(SLUG);
  await cleanupTenant(SLUG);
  await prisma.$disconnect();
});

describe('INT-06 Branding logo upload', () => {
  skipIfNoMinio('rejects logo upload > 2MB (413)', async () => {
    const oversize = Buffer.alloc(config.LOGO_MAX_BYTES + 1, 0x00);
    const boundary = '----TestBoundaryLogoSize';
    const res = await patchLogo(boundary, buildLogoBody(boundary, 'logo.png', 'image/png', oversize));
    expect(res.statusCode).toBe(413);
  });

  skipIfNoMinio('rejects logo upload carrying an SVG <script> payload (415)', async () => {
    const malicious = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    );
    const boundary = '----TestBoundaryLogoScript';
    const body = buildLogoBody(boundary, 'logo.svg', 'image/svg+xml', malicious);
    const res = await patchLogo(boundary, body);
    expect(res.statusCode).toBe(415);
  });

  skipIfNoMinio('rejects a file declared image/png that is actually an SVG (415)', async () => {
    const svgAsPng = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>');
    const boundary = '----TestBoundaryLogoSvgAsPng';
    const body = buildLogoBody(boundary, 'logo.png', 'image/png', svgAsPng);
    const res = await patchLogo(boundary, body);
    expect(res.statusCode).toBe(415);
  });

  skipIfNoMinio('accepts a legitimate PNG logo upload (200)', async () => {
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(64, 0x00),
    ]);
    const boundary = '----TestBoundaryLogoValidPng';
    const body = buildLogoBody(boundary, 'logo.png', 'image/png', png);
    const res = await patchLogo(boundary, body);
    expect(res.statusCode).toBe(200);
  });
});
