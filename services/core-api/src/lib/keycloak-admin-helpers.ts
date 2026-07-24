// keycloak-admin-helpers.ts
// Helper functions for Keycloak Admin REST API operations.
// Builds request payloads for realm and client creation.
//
// H-04 (logout token invalidation strategy): access token TTL is set to 60 seconds.
// Backchannel logout revokes the refresh token immediately; the access token remains
// technically valid until expiry. With a 60s TTL, the window is acceptably short.
// The frontend performs a silent refresh every 55s, so users never notice the expiry.
// This is Decision ID-005 in the decision log.

export interface RealmConfig {
  realmName: string;
  adminEmail: string;
  // M-bonus: tenantSlug is used to construct scoped redirectUris / webOrigins
  // instead of the insecure wildcard ['*'] that was used previously.
  tenantSlug: string;
}

export interface TenantWebClientUris {
  callbackUri: string;
  logoutUri: string;
  origin: string;
}

export function buildRealmPayload(
  realmName: string,
  nodeEnv: string = process.env['NODE_ENV'] ?? 'development'
): Record<string, unknown> {
  return {
    realm: realmName,
    enabled: true,
    displayName: realmName,
    registrationAllowed: false,
    loginWithEmailAllowed: true,
    duplicateEmailsAllowed: false,
    resetPasswordAllowed: true,
    editUsernameAllowed: false,
    bruteForceProtected: true,
    // H-04: 60s access token TTL. Short enough that a stolen token post-logout
    // expires quickly. Frontend refreshes silently every 55s (see auth-store.ts).
    accessTokenLifespan: 60,
    ssoSessionIdleTimeout: 1800,
    ssoSessionMaxLifespan: 36000,
    // Use the custom Plexica Keycloak theme for all login pages in this realm.
    loginTheme: 'plexica',
    // DEV ONLY — do NOT set sslRequired=none in production.
    // In production Keycloak sits behind TLS termination; sslRequired=external
    // (the Keycloak default) is the correct and secure setting there.
    // In dev the stack is accessed over plain HTTP on localhost, so we disable
    // the HTTPS requirement to prevent "HTTPS required" errors on login redirects.
    ...(nodeEnv !== 'production' && { sslRequired: 'none' }),
  };
}

// M-bonus: redirectUris and webOrigins are now scoped to the tenant's domain
// instead of the wildcard '*' that would allow open redirects and token leakage.
export function buildTenantWebClientUris(
  tenantSlug: string,
  nodeEnv: string = process.env['NODE_ENV'] ?? 'development'
): TenantWebClientUris {
  if (!/^[a-z][a-z0-9-]{1,62}$/.test(tenantSlug)) {
    throw new Error(`Invalid tenant slug for Keycloak client: ${tenantSlug}`);
  }
  const origin =
    nodeEnv === 'production' ? `https://${tenantSlug}.plexica.io` : 'http://localhost:3000';
  const logoutUrl = new URL('/', origin);
  logoutUrl.searchParams.set('tenant', tenantSlug);
  return {
    callbackUri: `${origin}/callback`,
    logoutUri: logoutUrl.href,
    origin,
  };
}

export function buildClientPayload(
  clientId: string,
  tenantSlug: string,
  nodeEnv?: string
): Record<string, unknown> {
  const uris = buildTenantWebClientUris(tenantSlug, nodeEnv);
  return {
    clientId,
    name: clientId,
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
      // Keycloak stores post-logout redirect URIs in attributes["post.logout.redirect.uris"]
      // as a ##-separated string. The top-level postLogoutRedirectUris field is only
      // available in newer Keycloak REST API versions and causes a 400 on older ones.
      'post.logout.redirect.uris': uris.logoutUri,
    },
  };
}

/**
 * Builds the payload for an audience protocol mapper.
 * Adds the client ID to the `aud` claim of the access token so that the
 * backend audience check (H-4) passes. Must be added via a separate
 * protocol-mappers/models call after the client is created — embedding
 * protocolMappers in the client creation payload causes a 400 in Keycloak 26.
 */
export function buildAudienceMapperPayload(audience: string): Record<string, unknown> {
  return {
    name: 'audience-mapper',
    protocol: 'openid-connect',
    protocolMapper: 'oidc-audience-mapper',
    consentRequired: false,
    config: {
      'included.client.audience': audience,
      'id.token.claim': 'false',
      'access.token.claim': 'true',
    },
  };
}

export function buildRolePayload(name: string, description: string): Record<string, unknown> {
  return { name, description };
}

export function buildAdminUserPayload(
  email: string,
  tempPassword: string
): Record<string, unknown> {
  return {
    username: email,
    email,
    enabled: true,
    emailVerified: true,
    credentials: [{ type: 'password', value: tempPassword, temporary: true }],
  };
}

// M-2: buildTokenRequestBody() was dead code with a mixed grant_type
// (client_credentials + username/password — mutually exclusive). Removed.
