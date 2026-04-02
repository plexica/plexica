// keycloak-admin-helpers.ts
// Helper functions for Keycloak Admin REST API operations.
// Builds request payloads for realm and client creation.

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
    accessTokenLifespan: 300,
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
