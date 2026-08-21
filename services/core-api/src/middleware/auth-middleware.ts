// auth-middleware.ts
// Fastify preHandler hook — validates RS256 Bearer tokens via Keycloak JWKS.
// Attaches decoded user profile to request.user on success.
// EC-06: on signature failure, invalidates cache and retries once.
// ADR-023: every realm must issue the universal plexica-api resource audience.
// M-10: only invalidates JWKS cache on JWSSignatureVerificationFailed,
//       not on expired/malformed tokens (which would thrash the cache).

import { jwtVerify, errors as joseErrors } from 'jose';

import { UnauthorizedError } from '../lib/app-error.js';
import { keycloakIssuerBase } from '../lib/ci-runtime-contract.js';
import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';

import { getCacheStats, getJWKS, invalidate } from './jwks-cache.js';

import type { FastifyReply, FastifyRequest } from 'fastify';

// ---------------------------------------------------------------------------
// Fastify type augmentation — adds `user` to FastifyRequest
// ---------------------------------------------------------------------------
export interface AuthUser {
  id: string;
  /** Original Keycloak user ID (JWT sub). Preserved after user-profile-resolver
   *  replaces `id` with the internal user_profile.user_id. */
  keycloakUserId: string;
  email: string;
  firstName: string;
  lastName: string;
  realm: string;
  roles: string[];
}

/**
 * Marks a request as pre-authenticated by a trusted internal source, letting
 * `authMiddleware` skip JWT verification.
 *
 * This is an UNREGISTERED `Symbol()`, deliberately not `Symbol.for()`. A
 * `Symbol.for()` key lives in the cross-realm global symbol registry, so any
 * code in the process — including any transitive npm dependency — can obtain
 * the identical symbol by computing `Symbol.for('plexica:trusted-auth')` and
 * mark a request as trusted. `Symbol()` produces a value that is unique per
 * module instance and unreachable except by importing it from this module,
 * which is what "cannot be forged" actually requires.
 *
 * It is still not a security boundary on its own: anything able to import this
 * module, or to enumerate the request's own property symbols via
 * `Object.getOwnPropertySymbols(request)`, can set the flag. It only stops the
 * flag being guessed from a string.
 *
 * TECH DEBT — this bypass exists solely to let integration tests inject a
 * synthetic user (see __tests__/helpers/server.helpers.ts) yet it ships in
 * production code, contradicting AGENTS.md §Testing rules 2, 3 and 5 (no
 * test-only code paths, no separate test app, real RS256 tokens). It should be
 * replaced by tests minting real Keycloak tokens.
 */
export const TRUSTED_AUTH_SYMBOL = Symbol('plexica:trusted-auth');

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser;
    [key: symbol]: boolean;
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
  const expectedIssuer = `${keycloakIssuerBase(config)}/realms/${realm}`;

  const verifyOptions: Parameters<typeof jwtVerify>[2] = {
    algorithms: ['RS256'],
    issuer: expectedIssuer,
    audience: config.KEYCLOAK_API_AUDIENCE,
  };

  const { payload } = await jwtVerify(token, jwks, verifyOptions);

  const sub = String(payload['sub'] ?? '');
  return {
    id: sub,
    keycloakUserId: sub,
    email: String(payload['email'] ?? ''),
    firstName: String(payload['given_name'] ?? ''),
    lastName: String(payload['family_name'] ?? ''),
    realm,
    roles: (payload['realm_access'] as { roles?: string[] } | undefined)?.roles ?? [],
  };
}

export async function authMiddleware(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  // Allow bypass ONLY when a trusted internal source has pre-authenticated the
  // request by setting TRUSTED_AUTH_SYMBOL, which is an unregistered Symbol
  // reachable only by importing it from this module (see its declaration).
  // This prevents untrusted code from escalating privileges by pre-setting request.user.
  if (
    request.user !== undefined &&
    (request as Record<symbol, boolean>)[TRUSTED_AUTH_SYMBOL] === true
  ) {
    return;
  }

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
      } catch (retryErr) {
        logger.error(
          { realm, reasonCode: (retryErr as Error).constructor?.name },
          'JWT verification failed — retry also failed'
        );
        // Internal details (errName, errMsg) are logged above,
        // but the client-facing response is deliberately generic.
        throw new UnauthorizedError('Token verification failed');
      }
    } else {
      logger.error(
        { realm, reasonCode: (err as Error).constructor?.name },
        'JWT verification failed — non-signature error'
      );
      // Internal details (errName, errMsg) are logged above,
      // but the client-facing response is deliberately generic.
      throw new UnauthorizedError('Token verification failed');
    }
  }
}
