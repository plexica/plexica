// keycloak-auth.ts
// Keycloak authentication client for the admin app.
// Uses the shared @plexica/auth/createKeycloakClient factory with
// admin-specific configuration (master realm and PKCE redirect for login).

import { createKeycloakClient } from '@plexica/auth/keycloak-client';

const KEYCLOAK_URL = import.meta.env.VITE_KEYCLOAK_URL ?? 'http://localhost:8080';
const CLIENT_ID = import.meta.env.VITE_KEYCLOAK_ADMIN_CLIENT_ID ?? 'plexica-admin';
const MASTER_REALM = import.meta.env.VITE_KEYCLOAK_MASTER_REALM ?? 'master';

/** Redirect URI for the PKCE callback. */
export const REDIRECT_URI = `${window.location.origin}/callback`;

export const keycloakClient = createKeycloakClient({
  keycloakUrl: KEYCLOAK_URL,
  clientId: CLIENT_ID,
  defaultRealm: MASTER_REALM,
});

export function getMasterRealm(): string {
  return MASTER_REALM;
}
