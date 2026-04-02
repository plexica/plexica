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

export function buildRealmPayload(realmName: string): Record<string, unknown> {
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
  };
}

// M-bonus: redirectUris and webOrigins are now scoped to the tenant's domain
// instead of the wildcard '*' that would allow open redirects and token leakage.
export function buildClientPayload(
  clientId: string,
  redirectUris: string[],
  webOrigins: string[]
): Record<string, unknown> {
  return {
    clientId,
    name: clientId,
    enabled: true,
    publicClient: true,
    standardFlowEnabled: true,
    directAccessGrantsEnabled: false,
    serviceAccountsEnabled: false,
    redirectUris,
    webOrigins,
    attributes: {
      'pkce.code.challenge.method': 'S256',
      // Keycloak stores post-logout redirect URIs in attributes["post.logout.redirect.uris"]
      // as a ##-separated string. The top-level postLogoutRedirectUris field is only
      // available in newer Keycloak REST API versions and causes a 400 on older ones.
      'post.logout.redirect.uris': redirectUris.join('##'),
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
export function buildAudienceMapperPayload(clientId: string): Record<string, unknown> {
  return {
    name: 'audience-mapper',
    protocol: 'openid-connect',
    protocolMapper: 'oidc-audience-mapper',
    consentRequired: false,
    config: {
      'included.client.audience': clientId,
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
