import { describe, expect, it } from 'vitest';

import {
  buildAdminClientPayload,
  buildAdminClientUris,
} from '../../lib/keycloak-admin-client-policy.js';
import { buildClientPayload, buildTenantWebClientUris } from '../../lib/keycloak-admin-helpers.js';

describe('tenant Keycloak client policy', () => {
  it('uses exact local callback and tenant-preserving logout URIs', () => {
    expect(buildTenantWebClientUris('acme', 'development')).toEqual({
      callbackUri: 'http://localhost:3000/callback',
      logoutUri: 'http://localhost:3000/?tenant=acme',
      origin: 'http://localhost:3000',
    });
  });

  it('never includes localhost or wildcards in production client settings', () => {
    const payload = buildClientPayload('plexica-web', 'acme', 'production');
    expect(payload).toMatchObject({
      fullScopeAllowed: false,
      redirectUris: ['https://acme.plexica.io/callback'],
      webOrigins: ['https://acme.plexica.io'],
      attributes: {
        'pkce.code.challenge.method': 'S256',
        'post.logout.redirect.uris': 'https://acme.plexica.io/?tenant=acme',
      },
    });
    expect(JSON.stringify(payload)).not.toMatch(/localhost|\*/);
  });
});

describe('master-realm admin client policy', () => {
  it('derives exact callbacks and one-hour session limits from the configured origin', () => {
    expect(buildAdminClientPayload('https://admin.plexica.app', 'production')).toMatchObject({
      redirectUris: ['https://admin.plexica.app/callback'],
      webOrigins: ['https://admin.plexica.app'],
      fullScopeAllowed: false,
      directAccessGrantsEnabled: false,
      attributes: {
        'pkce.code.challenge.method': 'S256',
        'post.logout.redirect.uris': 'https://admin.plexica.app/login',
        'client.session.idle.timeout': '3600',
        'client.session.max.lifespan': '3600',
      },
    });
  });

  it.each([
    'http://admin.plexica.app',
    'https://localhost',
    'https://127.0.0.1:8443',
    'https://*.plexica.app',
    'https://admin.plexica.app/path',
  ])('rejects unsafe or non-origin production value %s', (origin) => {
    expect(() => buildAdminClientUris(origin, 'production')).toThrow();
  });
});
