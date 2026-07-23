export const ADMIN_CLIENT_ID = 'plexica-admin';
export const ADMIN_SESSION_LIMIT_SECONDS = 3600;

export interface AdminClientUris {
  callbackUri: string;
  logoutUri: string;
  origin: string;
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === '127.0.0.1' ||
    normalized === '[::1]'
  );
}

export function buildAdminClientUris(origin: string, nodeEnv: string): AdminClientUris {
  if (origin.includes('*')) throw new Error('Keycloak admin origin must not contain wildcards');

  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error('Keycloak admin origin must be an absolute URL');
  }
  if (origin !== parsed.origin) {
    throw new Error('Keycloak admin origin must contain only scheme, host, and optional port');
  }
  if (nodeEnv === 'production') {
    if (parsed.protocol !== 'https:') {
      throw new Error('Production Keycloak admin origin must use HTTPS');
    }
    if (isLoopbackHostname(parsed.hostname)) {
      throw new Error('Production Keycloak admin origin must not use localhost');
    }
  }
  return {
    callbackUri: `${parsed.origin}/callback`,
    logoutUri: `${parsed.origin}/login`,
    origin: parsed.origin,
  };
}

export function buildAdminClientPayload(origin: string, nodeEnv: string): Record<string, unknown> {
  const uris = buildAdminClientUris(origin, nodeEnv);
  return {
    clientId: ADMIN_CLIENT_ID,
    name: 'Plexica Admin App',
    enabled: true,
    protocol: 'openid-connect',
    publicClient: true,
    standardFlowEnabled: true,
    implicitFlowEnabled: false,
    directAccessGrantsEnabled: false,
    serviceAccountsEnabled: false,
    authorizationServicesEnabled: false,
    bearerOnly: false,
    fullScopeAllowed: false,
    redirectUris: [uris.callbackUri],
    webOrigins: [uris.origin],
    attributes: {
      'pkce.code.challenge.method': 'S256',
      'post.logout.redirect.uris': uris.logoutUri,
      'client.session.idle.timeout': String(ADMIN_SESSION_LIMIT_SECONDS),
      'client.session.max.lifespan': String(ADMIN_SESSION_LIMIT_SECONDS),
    },
  };
}
