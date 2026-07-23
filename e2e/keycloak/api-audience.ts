import { adminFetch } from './admin-api.js';

const API_AUDIENCE = process.env['KEYCLOAK_API_AUDIENCE'] ?? 'plexica-api';

export async function reconcileApiAudienceMapper(token: string, clientUuid: string): Promise<void> {
  const path = `/admin/realms/master/clients/${clientUuid}/protocol-mappers/models`;
  const listed = await adminFetch(token, path, 'GET');
  if (!listed.ok) throw new Error(`API audience mapper read failed: HTTP ${listed.status}`);
  const matches = ((await listed.json()) as Array<{ id?: unknown; name?: unknown }>).filter(
    ({ name }) => name === 'audience-mapper'
  );
  if (matches.length > 1) throw new Error('Multiple API audience mappers exist');
  const desired = {
    name: 'audience-mapper',
    protocol: 'openid-connect',
    protocolMapper: 'oidc-audience-mapper',
    consentRequired: false,
    config: {
      'included.client.audience': API_AUDIENCE,
      'id.token.claim': 'false',
      'access.token.claim': 'true',
    },
  };
  const existingId = matches[0]?.id;
  const response =
    typeof existingId === 'string'
      ? await adminFetch(token, `${path}/${existingId}`, 'PUT', { id: existingId, ...desired })
      : await adminFetch(token, path, 'POST', desired);
  if (!response.ok) {
    throw new Error(`Ephemeral E2E audience mapper failed: HTTP ${response.status}`);
  }
}

export function assertApiTokenClaims(token: string): void {
  const encodedPayload = token.split('.')[1];
  if (encodedPayload === undefined) throw new Error('Ephemeral client returned a malformed JWT');
  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as {
    aud?: unknown;
    realm_access?: { roles?: unknown };
  };
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(API_AUDIENCE)) {
    throw new Error('Ephemeral client token is missing the API audience');
  }
  const roles = payload.realm_access?.roles;
  if (!Array.isArray(roles) || roles.length !== 1 || roles[0] !== 'super_admin') {
    throw new Error(`Ephemeral client token has unexpected realm roles: ${JSON.stringify(roles)}`);
  }
}
