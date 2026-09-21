// notification.emit.routes.int.test.ts
// INT (feature 006-05, review M4): POST /api/v1/notifications/emit service
// identity path — the X-Plugin-Service-Token branch (tenantId / scope
// 'events:emit' / plugin-slug type-prefix impersonation guard), mirroring
// plugin-service-event-auth.test.ts; wrong-tenant/wrong-scope use a crafted
// identity (unreachable via a valid credential).

import { randomUUID } from 'node:crypto';

import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '../../lib/database.js';
import { withTenantDb } from '../../lib/tenant-database.js';
import { enterWithTenant } from '../../lib/tenant-context-store.js';
import { configureErrorHandler } from '../../middleware/error-handler.js';
import { pluginEventAuth } from '../../middleware/plugin-event-auth.js';
import { notificationModuleEmitRoutes } from '../../modules/notification/index.js';
import {
  authenticateServiceCredential,
  completeCredentialRotation,
  issueServiceCredential,
} from '../../modules/plugin/services/service-credential.service.js';
import { cleanupTenant, seedTenant } from '../helpers/db.helpers.js';
import { isDbReachable } from '../helpers/server.helpers.js';

import type { FastifyInstance } from 'fastify';
import type { FastifyRequest } from 'fastify';
import type { PluginServiceIdentity } from '../../modules/plugin/services/service-credential.service.js';
import type { TenantContext } from '../../lib/tenant-context-store.js';

const SLUG_A = `notif-emit-a-${randomUUID().slice(0, 8)}`;
const SLUG_B = `notif-emit-b-${randomUUID().slice(0, 8)}`;
const INSTALL_ID = randomUUID();

const skipIfNoDb = it.skipIf(!(await isDbReachable()));

let contextA: TenantContext;
let tenantBId: string;
let pluginId: string;
let pluginSlug: string;
let token: string;
let identity: PluginServiceIdentity;
let server: FastifyInstance;

function emitPayload(type: string, correlationId = randomUUID()): Record<string, unknown> {
  return {
    userId: randomUUID(),
    type,
    titleKey: 'notifications.plugin.crm.contact_created.title',
    timestamp: new Date().toISOString(),
    correlationId,
  };
}

beforeAll(async () => {
  const seededA = await seedTenant(SLUG_A);
  const seededB = await seedTenant(SLUG_B);
  contextA = seededA.tenantContext;
  tenantBId = seededB.tenantId;

  pluginSlug = `notif-svc-${randomUUID().slice(0, 8)}`;
  const plugin = await prisma.plugin.create({
    data: {
      slug: pluginSlug,
      name: 'Notification Emit Test Plugin',
      version: '1.0.0',
      author: 'Plexica',
      registryUrl: 'https://registry.example.test',
      imageName: 'plexica/notif-emit-test',
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

  const issued = await issueServiceCredential({
    tenantId: contextA.tenantId,
    tenantSlug: contextA.slug,
    installId: INSTALL_ID,
    pluginId,
    pluginSlug,
  });
  await completeCredentialRotation(INSTALL_ID, issued.credentialId, true);
  token = issued.token;
  const authenticated = await authenticateServiceCredential(token);
  if (authenticated === null) throw new Error('Credential activation failed');
  identity = authenticated;
  server = Fastify({ logger: false });
  configureErrorHandler(server);
  // codeql[js/missing-rate-limiting]
  server.addHook('preHandler', pluginEventAuth);
  await server.register(notificationModuleEmitRoutes);
  await server.ready();
});

afterAll(async () => {
  await server?.close();
  await prisma.eventOutbox.deleteMany({ where: { tenantId: contextA?.tenantId } });
  await prisma.pluginServiceCredential.deleteMany({ where: { pluginId } });
  await prisma.plugin.deleteMany({ where: { id: pluginId } });
  await cleanupTenant(SLUG_A);
  await cleanupTenant(SLUG_B);
  await prisma.$disconnect();
});

describe('notification emit — plugin service identity (M4)', () => {
  skipIfNoDb(
    'positive: real plxsvc_* credential emits → 202 + outbox row keyed to the install',
    async () => {
      const correlationId = randomUUID();
      const type = `plugin.${pluginSlug}.contact_created`;
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/notifications/emit',
        headers: { 'x-plugin-service-token': token },
        payload: emitPayload(type, correlationId),
      });
      expect(response.statusCode).toBe(202);
      const body = JSON.parse(response.body) as { status: string; notificationId: string };
      expect(body.status).toBe('accepted');
      expect(body.notificationId).toMatch(/^[0-9a-f-]{36}$/i);

      const row = await prisma.eventOutbox.findFirst({ where: { correlationId } });
      expect(row).toMatchObject({
        tenantId: contextA.tenantId,
        producerId: INSTALL_ID,
        eventType: 'plexica.notification',
      });
    }
  );

  skipIfNoDb(
    'negative: cross-plugin type prefix is rejected (403, impersonation guard)',
    async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/notifications/emit',
        headers: { 'x-plugin-service-token': token },
        payload: emitPayload('plugin.analytics.report_generated'),
      });
      expect(response.statusCode).toBe(403);
      expect(response.body).not.toContain('analytics');
      expect(response.body).not.toContain(contextA.slug);
    }
  );

  skipIfNoDb('negative: wrong tenant on the service identity is rejected (403)', async () => {
    await assertCraftedRejected({ ...identity, tenantId: tenantBId });
  });

  skipIfNoDb('negative: wrong scope on the service identity is rejected (403)', async () => {
    await assertCraftedRejected({
      ...identity,
      scope: 'other:scope',
    } as unknown as PluginServiceIdentity);
  });
});

async function craftIdentityServer(
  identityOverride: PluginServiceIdentity
): Promise<FastifyInstance> {
  const guardServer = Fastify({ logger: false });
  configureErrorHandler(guardServer);
  guardServer.addHook('preHandler', async (request: FastifyRequest) => {
    request.pluginServiceIdentity = identityOverride;
    request.tenantContext = contextA;
    enterWithTenant(contextA);
  });
  await guardServer.register(notificationModuleEmitRoutes);
  await guardServer.ready();
  return guardServer;
}

async function assertCraftedRejected(identityOverride: PluginServiceIdentity): Promise<void> {
  const guardServer = await craftIdentityServer(identityOverride);
  try {
    const response = await guardServer.inject({
      method: 'POST',
      url: '/api/v1/notifications/emit',
      payload: emitPayload(`plugin.${pluginSlug}.contact_created`),
    });
    expect(response.statusCode).toBe(403);
  } finally {
    await guardServer.close();
  }
}
