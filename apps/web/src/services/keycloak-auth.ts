// keycloak-auth.ts
// OIDC protocol client for the tenant web app Keycloak authentication.
// Uses the shared @plexica/auth/createKeycloakClient factory with
// web-specific configuration (dynamic realm, PKCE flow).

import { createKeycloakClient } from '@plexica/auth/keycloak-client';

const KEYCLOAK_URL = import.meta.env.VITE_KEYCLOAK_URL ?? 'http://localhost:8080';
const CLIENT_ID = import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? 'plexica-web';

export const REDIRECT_URI = `${window.location.origin}/callback`;

export const keycloakClient = createKeycloakClient({
  keycloakUrl: KEYCLOAK_URL,
  clientId: CLIENT_ID,
});
