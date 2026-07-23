import { randomUUID } from 'node:crypto';

import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '../lib/database.js';
import { withTenantDb } from '../lib/tenant-database.js';
import { configureErrorHandler } from '../middleware/error-handler.js';
import { pluginEventAuth } from '../middleware/plugin-event-auth.js';
import { eventEmitRoutes } from '../modules/plugin/routes/events.routes.js';
import {
  authenticateServiceCredential,
  completeCredentialRotation,
  issueServiceCredential,
  revokeInstallationCredentials,
  revokeServiceCredential,
} from '../modules/plugin/services/service-credential.service.js';

import { cleanupTenant, seedTenant } from './helpers/db.helpers.js';

import type { FastifyInstance } from 'fastify';
import type { TenantContext } from '../lib/tenant-context-store.js';

const SLUG_A = `svc-a-${randomUUID().slice(0, 8)}`;
const SLUG_B = `svc-b-${randomUUID().slice(0, 8)}`;
const INSTALL_ID = randomUUID();
let contextA: TenantContext;
let tenantBId: string;
let pluginId: string;
let pluginSlug: string;
let token: string;
let credentialId: string;
let server: FastifyInstance;
let observedServiceRequestWithoutUser = false;

async function issueAndActivate(): Promise<{ token: string; credentialId: string }> {
  const issued = await issueServiceCredential({
    tenantId: contextA.tenantId,
    tenantSlug: contextA.slug,
    installId: INSTALL_ID,
    pluginId,
    pluginSlug,
  });
  await completeCredentialRotation(INSTALL_ID, issued.credentialId, true);
  return issued;
}

beforeAll(async () => {
  const first = await seedTenant(SLUG_A);
  const second = await seedTenant(SLUG_B);
  contextA = first.tenantContext;
  tenantBId = second.tenantId;
  pluginSlug = `credential-${randomUUID().slice(0, 8)}`;
  const plugin = await prisma.plugin.create({
    data: {
      slug: pluginSlug,
      name: 'Credential Test Plugin',
      version: '1.0.0',
      author: 'Plexica',
      registryUrl: 'https://registry.example.test',
      imageName: 'plexica/credential-test',
      imageTag: '1.0.0',
      createdByKeycloakId: randomUUID(),
    },
  });
  pluginId = plugin.id;
  await withTenantDb(
    (db) =>
      db.pluginInstallation.create({
        data: {
          id: INSTALL_ID,
          pluginId,
          tenantSlug: contextA.slug,
          status: 'active',
          installedBy: randomUUID(),
        },
      }),
    contextA
  );
  ({ token, credentialId } = await issueAndActivate());
  server = Fastify({ logger: false });
  configureErrorHandler(server);
  server.addHook('preHandler', pluginEventAuth);
  server.addHook('preHandler', async (request) => {
    if (request.pluginServiceIdentity && request.user === undefined) {
      observedServiceRequestWithoutUser = true;
    }
  });
  await server.register(eventEmitRoutes);
  await server.ready();
});

afterAll(async () => {
  await server?.close();
  await prisma.eventOutbox.deleteMany({ where: { tenantId: contextA?.tenantId } });
  await prisma.pluginServiceCredential.deleteMany({ where: { pluginId } });
  await prisma.plugin.deleteMany({ where: { id: pluginId } });
  await cleanupTenant(SLUG_A);
  await cleanupTenant(SLUG_B);
});

describe('installation-scoped plugin service identity', () => {
  it('emits through the outbox without creating request.user', async () => {
    const correlationId = randomUUID();
    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/events/emit',
      headers: { 'x-plugin-service-token': token },
      payload: {
        type: `plugin.${pluginSlug}.contact.created`,
        payload: { contactId: randomUUID() },
        timestamp: new Date().toISOString(),
        correlationId,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(observedServiceRequestWithoutUser).toBe(true);
    const row = await prisma.eventOutbox.findFirst({ where: { correlationId } });
    expect(row).toMatchObject({ tenantId: contextA.tenantId, producerId: INSTALL_ID });
  });

  it('denies a wrong plugin namespace without enumeration', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/events/emit',
      headers: { 'x-plugin-service-token': token },
      payload: {
        type: 'plugin.analytics.report.created',
        payload: {},
        timestamp: new Date().toISOString(),
        correlationId: randomUUID(),
      },
    });
    expect(response.statusCode).toBe(403);
    expect(response.body).not.toContain('crm');
    expect(response.body).not.toContain(contextA.slug);
  });

  it('stores only a digest and rejects expiry, revocation, and binding mismatches', async () => {
    const row = await prisma.pluginServiceCredential.findUniqueOrThrow({
      where: { id: credentialId },
    });
    expect(row.secretDigest).toHaveLength(32);
    expect(JSON.stringify(row)).not.toContain(token);
    expect(JSON.stringify(row)).not.toContain(token.split('.')[1]);

    await prisma.pluginServiceCredential.update({
      where: { id: credentialId },
      data: { tenantId: tenantBId, installId: randomUUID() },
    });
    await expect(authenticateServiceCredential(token)).resolves.toBeNull();
    await prisma.pluginServiceCredential.update({
      where: { id: credentialId },
      data: { tenantId: contextA.tenantId, installId: INSTALL_ID, expiresAt: new Date(0) },
    });
    await expect(authenticateServiceCredential(token)).resolves.toBeNull();
    await expect(
      prisma.pluginServiceCredential.findUniqueOrThrow({ where: { id: credentialId } })
    ).resolves.toMatchObject({ status: 'expired' });

    const rotated = await issueAndActivate();
    const replacement = await issueAndActivate();
    await expect(authenticateServiceCredential(rotated.token)).resolves.toBeNull();
    await expect(authenticateServiceCredential(replacement.token)).resolves.toMatchObject({
      installId: INSTALL_ID,
      tenantId: contextA.tenantId,
      pluginSlug,
    });
    await revokeServiceCredential(replacement.credentialId);
    await expect(authenticateServiceCredential(replacement.token)).resolves.toBeNull();
    const finalCredential = await issueAndActivate();
    await revokeInstallationCredentials(INSTALL_ID);
    await expect(authenticateServiceCredential(finalCredential.token)).resolves.toBeNull();
  });
});
