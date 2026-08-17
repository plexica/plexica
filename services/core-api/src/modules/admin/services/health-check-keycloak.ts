// health-check-keycloak.ts
// Keycloak health probe — fetches the master realm OpenID well-known config.
// Implements: Spec 005, Feature 005-09 (S5-100)
//
// Uses AbortSignal.timeout directly on the fetch call (native support).

import { config } from '../../../lib/config.js';

import { PROBE_TIMEOUT_MS, makeProbe } from './health-checker.service.js';

export const probeKeycloak = makeProbe('keycloak', async () => {
  const response = await fetch(
    `${config.KEYCLOAK_URL}/realms/master/.well-known/openid-configuration`,
    { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) }
  );
  if (!response.ok) {
    throw new Error(`Keycloak responded with HTTP ${response.status}`);
  }
});
