// keycloak-auth.ts
// Keycloak authentication client for the admin app.
// Uses the shared @plexica/auth/createKeycloakClient factory with
// admin-specific configuration (master realm and PKCE redirect for login).

import { createKeycloakClient } from '@plexica/auth/keycloak-client';
import { requiredOrigin } from '@plexica/auth/env-guard';

import { runtimeEndpoints } from '../lib/runtime-endpoints.js';

// `import.meta.env.PROD` is true for `vite build` and false for `vite dev`.
// apps/admin E2E runs the frontend via `vite dev` (apps/admin/playwright.config.ts),
// so PROD is false there and this guard never fires in the E2E suite — only in a
// real production build, which is exactly where a silent localhost fallback would
// point the super-admin console's identity provider at the wrong host.
const KEYCLOAK_URL = requiredOrigin(
  runtimeEndpoints().keycloakBase ?? import.meta.env.VITE_KEYCLOAK_URL,
  'VITE_KEYCLOAK_URL',
  'http://localhost:8080',
  import.meta.env.PROD
);
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
