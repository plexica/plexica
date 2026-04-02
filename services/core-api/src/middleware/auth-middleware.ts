// auth-middleware.ts
// Fastify preHandler hook — validates RS256 Bearer tokens via Keycloak JWKS.
// Attaches decoded user profile to request.user on success.
// EC-06: on signature failure, invalidates cache and retries once.
// H-4: validates JWT audience claim against KEYCLOAK_CLIENT_ID.
// M-10: only invalidates JWKS cache on JWSSignatureVerificationFailed,
//       not on expired/malformed tokens (which would thrash the cache).

import { jwtVerify, errors as joseErrors } from 'jose';

import type { FastifyReply, FastifyRequest } from 'fastify';

import { UnauthorizedError } from '../lib/app-error.js';
import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import { getCacheStats, getJWKS, invalidate } from './jwks-cache.js';

// ---------------------------------------------------------------------------
// Fastify type augmentation — adds `user` to FastifyRequest
// ---------------------------------------------------------------------------
export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  realm: string;
  roles: string[];
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser;
  }
}

// Extract realm name from Keycloak issuer URL
// e.g. "http://keycloak:8080/realms/plexica-acme" → "plexica-acme"
function realmFromIssuer(iss: string): string {
  const match = /\/realms\/([^/]+)$/.exec(iss);
  if (match === null || match[1] === undefined) {
    throw new UnauthorizedError('Cannot determine realm from token issuer');
  }
  return match[1];
}

function extractBearerToken(authHeader: string | undefined): string {
  if (authHeader === undefined || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid Authorization header');
  }
  return authHeader.slice(7);
}

// Decode JWT payload without verification (to identify realm before JWKS lookup)
function decodePayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[1] === undefined) {
    throw new UnauthorizedError('Malformed JWT');
  }
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
  } catch {
    throw new UnauthorizedError('Malformed JWT payload');
  }
}

async function verifyToken(token: string, realm: string): Promise<AuthUser> {
  const jwks = await getJWKS(realm);
  const expectedIssuer = `${config.KEYCLOAK_URL}/realms/${realm}`;

  // H-4: validate audience to reject tokens issued for other Keycloak clients.
  const { payload } = await jwtVerify(token, jwks, {
    algorithms: ['RS256'],
    issuer: expectedIssuer,
    audience: config.KEYCLOAK_CLIENT_ID,
  });

  return {
    id: String(payload['sub'] ?? ''),
    email: String(payload['email'] ?? ''),
    firstName: String(payload['given_name'] ?? ''),
    lastName: String(payload['family_name'] ?? ''),
    realm,
    roles: (payload['realm_access'] as { roles?: string[] } | undefined)?.roles ?? [],
  };
}

export async function authMiddleware(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const token = extractBearerToken(request.headers.authorization);
  const payload = decodePayload(token);
  const realm = realmFromIssuer(String(payload['iss'] ?? ''));

  try {
    request.user = await verifyToken(token, realm);
  } catch (err) {
    // M-10: only invalidate the JWKS cache on a signature verification failure
    // (key rotation — EC-06). Expired or malformed tokens must NOT invalidate
    // the cache, as that would cause a JWKS round-trip on every expired token
    // and destroy the NFR-03 > 99% cache hit rate target.
    if (err instanceof joseErrors.JWSSignatureVerificationFailed) {
      logger.debug(
        { realm, cacheStats: getCacheStats() },
        'JWKS signature verification failed — retrying after cache invalidation (EC-06)'
      );
      invalidate(realm);
      try {
        request.user = await verifyToken(token, realm);
      } catch {
        throw new UnauthorizedError('Token verification failed');
      }
    } else {
      throw new UnauthorizedError('Token verification failed');
    }
  }
}
