// keycloak-auth.ts
// OIDC protocol client for the tenant web app Keycloak authentication.
// Uses the shared @plexica/auth/createKeycloakClient factory with
// web-specific configuration (dynamic realm, PKCE flow).

import { createKeycloakClient } from '@plexica/auth/keycloak-client';
import { requiredOrigin } from '@plexica/auth/env-guard';

import { runtimeEndpoints } from '../lib/runtime-endpoints.js';

// `import.meta.env.PROD` is true for `vite build` and false for `vite dev`, so the
// dev fallback (see requiredOrigin in @plexica/auth/env-guard) is preserved. The
// E2E suite builds with NODE_ENV=production but injects VITE_KEYCLOAK_URL
// (apps/web/playwright.config.ts), so it is unaffected.
const KEYCLOAK_URL = requiredOrigin(
  runtimeEndpoints().keycloakBase ?? import.meta.env.VITE_KEYCLOAK_URL,
  'VITE_KEYCLOAK_URL',
  'http://localhost:8080',
  import.meta.env.PROD
);

/**
 * NOT guarded the same way on purpose. `plexica-web` is not an environment
 * fallback: it is the fixed public client id that core-api provisions in every
 * tenant realm (services/core-api/src/lib/keycloak-tenant-client.ts) and that
 * infra/keycloak/realm-export.json ships. The env var only exists to override it,
 * so its absence is the normal, correct case — including in E2E, which does not
 * inject it. Failing on a missing override would break every valid deployment.
 */
const CLIENT_ID = import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? 'plexica-web';

export const REDIRECT_URI = `${window.location.origin}/callback`;

export const keycloakClient = createKeycloakClient({
  keycloakUrl: KEYCLOAK_URL,
  clientId: CLIENT_ID,
});
