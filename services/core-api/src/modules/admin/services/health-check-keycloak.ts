// health-check-keycloak.ts
// Keycloak health probe — fetches the master realm OpenID well-known config.
// Implements: Spec 005, Feature 005-09 (S5-100)
//
// Uses AbortSignal.timeout directly on the fetch call (native support).

import { config } from '../../../lib/config.js';

import { buildServiceResult, PROBE_TIMEOUT_MS } from './health-checker.service.js';

import type { HealthServiceResult } from '../schemas/health-schemas.js';

export async function probeKeycloak(): Promise<HealthServiceResult> {
  const name = 'keycloak';
  const start = performance.now();
  const url = `${config.KEYCLOAK_URL}/realms/master/.well-known/openid-configuration`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Keycloak responded with HTTP ${response.status}`);
    }
    return buildServiceResult(name, Math.round(performance.now() - start), null);
  } catch (error) {
    return buildServiceResult(name, Math.round(performance.now() - start), error);
  }
}
