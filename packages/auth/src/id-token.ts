import { createRemoteJWKSet, jwtVerify } from 'jose';

import { AUTH_REQUEST_TIMEOUT_MS } from './oidc-request.js';

interface IdTokenVerification {
  issuer: string;
  audience: string;
  nonce?: string;
  timeoutMs?: number | undefined;
}

type RemoteJwks = ReturnType<typeof createRemoteJWKSet>;

const CLOCK_SKEW_SECONDS = 60;
const jwksByUrl = new Map<string, RemoteJwks>();

function getJwks(issuer: string, timeoutMs: number): RemoteJwks {
  const url = `${issuer}/protocol/openid-connect/certs`;
  const cached = jwksByUrl.get(url);
  if (cached !== undefined) return cached;

  const jwks = createRemoteJWKSet(new URL(url), { timeoutDuration: timeoutMs });
  jwksByUrl.set(url, jwks);
  return jwks;
}

export async function verifyIdToken(idToken: string, expected: IdTokenVerification): Promise<void> {
  const { payload } = await jwtVerify(
    idToken,
    getJwks(expected.issuer, expected.timeoutMs ?? AUTH_REQUEST_TIMEOUT_MS),
    {
      algorithms: ['RS256'],
      issuer: expected.issuer,
      audience: expected.audience,
      requiredClaims: ['exp', 'iat', 'azp'],
    }
  );
  const now = Date.now() / 1_000;
  const nonceMatches = expected.nonce === undefined || payload['nonce'] === expected.nonce;
  if (
    payload['azp'] !== expected.audience ||
    !nonceMatches ||
    typeof payload.iat !== 'number' ||
    typeof payload.exp !== 'number' ||
    payload.iat > now + CLOCK_SKEW_SECONDS ||
    payload.exp <= payload.iat
  ) {
    throw new Error('Invalid ID token claims');
  }
}

export function clearIdTokenJwksCache(): void {
  jwksByUrl.clear();
}
