import { adminFetch, getAdminToken } from '../../../e2e/keycloak/admin-api.js';
import { createEphemeralE2eClient } from '../../../e2e/keycloak/ephemeral-client.js';

import { loginAsAdmin } from './helpers/admin-login.js';
import { expect, test } from './helpers/base-fixture.js';

test.describe('Keycloak client security', () => {
  test('uses a distinct run-scoped user with only super_admin mapped', async () => {
    const token = await getAdminToken();
    const username = process.env['PLAYWRIGHT_SUPER_ADMIN_USER'] ?? '';
    const bootstrap = process.env['KEYCLOAK_ADMIN_USER'] ?? 'admin';
    expect(username).not.toBe('');
    expect(username).not.toBe(bootstrap);

    const lookup = await adminFetch(
      token,
      `/admin/realms/master/users?username=${encodeURIComponent(username)}&exact=true`,
      'GET'
    );
    expect(lookup.status).toBe(200);
    const users = (await lookup.json()) as Array<{ id?: unknown }>;
    expect(users).toHaveLength(1);
    const roles = await adminFetch(
      token,
      `/admin/realms/master/users/${String(users[0]?.id)}/role-mappings/realm`,
      'GET'
    );
    expect(roles.status).toBe(200);
    await expect(roles.json()).resolves.toEqual([expect.objectContaining({ name: 'super_admin' })]);

    const bootstrapLookup = await adminFetch(
      token,
      `/admin/realms/master/users?username=${encodeURIComponent(bootstrap)}&exact=true`,
      'GET'
    );
    const bootstrapUsers = (await bootstrapLookup.json()) as Array<{ id?: unknown }>;
    const bootstrapRoles = await adminFetch(
      token,
      `/admin/realms/master/users/${String(bootstrapUsers[0]?.id)}/role-mappings/realm`,
      'GET'
    );
    const bootstrapMappings = (await bootstrapRoles.json()) as Array<{ name?: unknown }>;
    expect(bootstrapMappings.map(({ name }) => name)).not.toContain('super_admin');
  });

  test('caps privileged admin client sessions at one hour', async () => {
    const token = await getAdminToken();
    const realmResponse = await adminFetch(token, '/admin/realms/master', 'GET');
    const realm = (await realmResponse.json()) as Record<string, unknown>;
    expect(Number(realm['ssoSessionIdleTimeout'])).toBeGreaterThan(0);
    expect(Number(realm['ssoSessionIdleTimeout'])).toBeLessThanOrEqual(3600);
    expect(Number(realm['ssoSessionMaxLifespan'])).toBeGreaterThan(0);
    expect(Number(realm['ssoSessionMaxLifespan'])).toBeLessThanOrEqual(3600);

    const lookup = await adminFetch(
      token,
      '/admin/realms/master/clients?clientId=plexica-admin',
      'GET'
    );
    const clients = (await lookup.json()) as Array<{ id?: unknown }>;
    const client = await adminFetch(
      token,
      `/admin/realms/master/clients/${String(clients[0]?.id)}`,
      'GET'
    );
    const representation = (await client.json()) as {
      attributes?: Record<string, unknown>;
    };
    expect(Number(representation.attributes?.['client.session.idle.timeout'])).toBeGreaterThan(0);
    expect(Number(representation.attributes?.['client.session.idle.timeout'])).toBeLessThanOrEqual(
      3600
    );
    expect(Number(representation.attributes?.['client.session.max.lifespan'])).toBeGreaterThan(0);
    expect(Number(representation.attributes?.['client.session.max.lifespan'])).toBeLessThanOrEqual(
      3600
    );
  });

  test('persistent browser token contains only the super_admin realm role', async ({ page }) => {
    await loginAsAdmin(page);
    const claims = await page.evaluate(() => {
      const stored = sessionStorage.getItem('plexica-admin-auth');
      const accessToken = stored === null ? undefined : JSON.parse(stored).state?.accessToken;
      if (typeof accessToken !== 'string') return undefined;
      const encodedPayload = accessToken.split('.')[1];
      if (encodedPayload === undefined) return undefined;
      const payload = JSON.parse(atob(encodedPayload.replace(/-/g, '+').replace(/_/g, '/')));
      return { roles: payload.realm_access?.roles, audience: payload.aud };
    });
    expect(claims?.roles).toEqual(['super_admin']);
    expect(Array.isArray(claims?.audience) ? claims.audience : [claims?.audience]).toContain(
      'plexica-api'
    );
  });

  test('deletes a uniquely found ephemeral client when Location is missing', async () => {
    const originalFetch = globalThis.fetch;
    let deletedClient = false;
    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.endsWith('clientId=e2e-api')) return Response.json([]);
      if (url.endsWith('/clients?first=0&max=1000')) return Response.json([]);
      if (method === 'POST' && url.endsWith('/admin/realms/master/clients')) {
        return new Response(null, { status: 201 });
      }
      if (method === 'GET' && url.includes('clientId=plexica-playwright-admin-')) {
        return Response.json([{ id: 'orphan-client-uuid' }]);
      }
      if (method === 'DELETE' && url.endsWith('/clients/orphan-client-uuid')) {
        deletedClient = true;
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected mocked Keycloak request: ${method} ${url}`);
    }) as typeof fetch;
    try {
      await expect(
        createEphemeralE2eClient('admin-token', 'admin', {
          id: 'super-admin-role-id',
          name: 'super_admin',
        })
      ).rejects.toThrow('creation returned no client UUID');
      expect(deletedClient).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
