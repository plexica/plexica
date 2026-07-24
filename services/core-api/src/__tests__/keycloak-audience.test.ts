import { randomBytes, randomUUID } from 'node:crypto';

import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { config } from '../lib/config.js';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { configureErrorHandler } from '../middleware/error-handler.js';

import { getKeycloakAdminToken } from './keycloak-test-helpers.js';

import type { FastifyInstance } from 'fastify';

interface TestClient {
  uuid: string;
  clientId: string;
  secret: string;
}

const clients: TestClient[] = [];
let adminToken: string;
let server: FastifyInstance;

async function adminRequest(path: string, method: string, body?: unknown): Promise<Response> {
  return fetch(`${config.KEYCLOAK_URL}/admin/realms/master${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${adminToken}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function createClient(audience?: string): Promise<TestClient> {
  const client = {
    uuid: '',
    clientId: `plexica-audience-test-${randomUUID()}`,
    secret: randomBytes(32).toString('base64url'),
  };
  const created = await adminRequest('/clients', 'POST', {
    clientId: client.clientId,
    secret: client.secret,
    enabled: true,
    publicClient: false,
    standardFlowEnabled: false,
    directAccessGrantsEnabled: true,
    serviceAccountsEnabled: false,
    fullScopeAllowed: false,
  });
  expect(created.status).toBe(201);
  client.uuid = created.headers.get('Location')?.split('/').pop() ?? '';
  clients.push(client);
  if (audience) {
    const mapper = await adminRequest(`/clients/${client.uuid}/protocol-mappers/models`, 'POST', {
      name: 'audience-mapper',
      protocol: 'openid-connect',
      protocolMapper: 'oidc-audience-mapper',
      config: {
        'included.client.audience': audience,
        'id.token.claim': 'false',
        'access.token.claim': 'true',
      },
    });
    expect(mapper.status).toBe(201);
  }
  return client;
}

async function userToken(client: TestClient): Promise<string> {
  const response = await fetch(
    `${config.KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: client.clientId,
        client_secret: client.secret,
        username: config.KEYCLOAK_ADMIN_USER,
        password: config.KEYCLOAK_ADMIN_PASSWORD,
      }),
    }
  );
  expect(response.status).toBe(200);
  return ((await response.json()) as { access_token: string }).access_token;
}

beforeAll(async () => {
  adminToken = await getKeycloakAdminToken();
  server = Fastify({ logger: false });
  configureErrorHandler(server);
  server.get('/audience', { preHandler: [authMiddleware] }, () => ({ accepted: true }));
  await server.ready();
});

afterAll(async () => {
  for (const client of clients) await adminRequest(`/clients/${client.uuid}`, 'DELETE');
  await server?.close();
});

describe('real Keycloak API audience matrix', () => {
  it.each([
    { name: 'missing', audience: undefined, status: 401 },
    { name: 'wrong', audience: 'another-api', status: 401 },
    { name: 'correct', audience: 'plexica-api', status: 200 },
  ])('$name audience returns $status', async ({ audience, status }) => {
    const token = await userToken(await createClient(audience));
    const response = await server.inject({
      method: 'GET',
      url: '/audience',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(status);
  });
});
