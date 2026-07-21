// keycloak-auth.ts
// Keycloak authentication client for the admin app.
// Uses the shared @plexica/auth/createKeycloakClient factory with
// admin-specific configuration (master realm, password grant).
//
// After PKCE migration, this file will also export PKCE helpers
// and the login will redirect to Keycloak instead of using password grant.

import { createKeycloakClient } from '@plexica/auth/keycloak-client';

const KEYCLOAK_URL = import.meta.env.VITE_KEYCLOAK_URL ?? 'http://localhost:8080';
const CLIENT_ID = import.meta.env.VITE_KEYCLOAK_ADMIN_CLIENT_ID ?? 'plexica-admin';
const MASTER_REALM = import.meta.env.VITE_KEYCLOAK_MASTER_REALM ?? 'master';

export const keycloakClient = createKeycloakClient({
  keycloakUrl: KEYCLOAK_URL,
  clientId: CLIENT_ID,
  defaultRealm: MASTER_REALM,
});

export function getMasterRealm(): string {
  return MASTER_REALM;
}
