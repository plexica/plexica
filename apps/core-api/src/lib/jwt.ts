import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { config } from '../config/index.js';

// Keycloak JWT payload interface
export interface KeycloakJwtPayload extends JwtPayload {
  preferred_username: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  realm_access?: {
    roles: string[];
  };
  resource_access?: {
    [key: string]: {
      roles: string[];
    };
  };
  tenant?: string; // Custom claim for tenant identification
  azp?: string; // Authorized party (client_id)
}

// JWKS client for Keycloak public keys
const jwksClients: Map<string, jwksClient.JwksClient> = new Map();

/**
 * Get JWKS client for a specific realm
 */
function getJwksClient(realm: string): jwksClient.JwksClient {
  if (!jwksClients.has(realm)) {
    const client = jwksClient({
      jwksUri: `${config.keycloakUrl}/realms/${realm}/protocol/openid-connect/certs`,
      cache: true,
      cacheMaxAge: 86400000, // 24 hours
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    });
    jwksClients.set(realm, client);
  }
  return jwksClients.get(realm)!;
}

/**
 * Get signing key from Keycloak JWKS endpoint
 */
async function getSigningKey(realm: string, kid: string): Promise<string> {
  const client = getJwksClient(realm);

  return new Promise((resolve, reject) => {
    client.getSigningKey(kid, (err, key) => {
      if (err) {
        reject(err);
        return;
      }
      const signingKey = key?.getPublicKey();
      if (!signingKey) {
        reject(new Error('No signing key found'));
        return;
      }
      resolve(signingKey);
    });
  });
}

/**
 * Verify and decode Keycloak JWT token
 *
 * @param token - JWT token string
 * @param realm - Keycloak realm name (defaults to master)
 * @returns Decoded token payload
 */
export async function verifyKeycloakToken(
  token: string,
  realm: string = 'master'
): Promise<KeycloakJwtPayload> {
  try {
    // Decode token header to get kid
    const decoded = jwt.decode(token, { complete: true });

    if (!decoded || !decoded.header.kid) {
      throw new Error('Invalid token: missing kid in header');
    }

    // Get signing key from Keycloak
    const signingKey = await getSigningKey(realm, decoded.header.kid);

    // Verify token
    const payload = jwt.verify(token, signingKey, {
      algorithms: ['RS256'],
      issuer: `${config.keycloakUrl}/realms/${realm}`,
    }) as KeycloakJwtPayload;

    return payload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Token expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error(`Invalid token: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Verify token and extract tenant information
 *
 * @param token - JWT token string
 * @returns Decoded payload with tenant info
 */
export async function verifyTokenWithTenant(
  token: string
): Promise<KeycloakJwtPayload & { tenantSlug: string }> {
  // First try to decode to get the realm/tenant
  const decoded = jwt.decode(token) as KeycloakJwtPayload | null;

  if (!decoded) {
    throw new Error('Invalid token');
  }

  // Extract tenant from issuer or custom claim
  let tenantSlug: string;

  if (decoded.tenant) {
    // Custom tenant claim
    tenantSlug = decoded.tenant;
  } else if (decoded.iss) {
    // Extract realm from issuer URL
    const issuerMatch = decoded.iss.match(/\/realms\/([^/]+)$/);
    if (issuerMatch && issuerMatch[1] !== 'master') {
      tenantSlug = issuerMatch[1];
    } else {
      throw new Error('Token does not belong to a tenant realm');
    }
  } else {
    throw new Error('Unable to determine tenant from token');
  }

  // Verify token with the tenant's realm
  const payload = await verifyKeycloakToken(token, tenantSlug);

  return {
    ...payload,
    tenantSlug,
  };
}

/**
 * Extract token from Authorization header
 */
export function extractBearerToken(authHeader?: string): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Check if user has a specific role in the token
 */
export function hasRole(payload: KeycloakJwtPayload, role: string): boolean {
  return payload.realm_access?.roles.includes(role) ?? false;
}

/**
 * Check if user has a specific client role
 */
export function hasClientRole(
  payload: KeycloakJwtPayload,
  clientId: string,
  role: string
): boolean {
  return payload.resource_access?.[clientId]?.roles.includes(role) ?? false;
}

/**
 * Extract user info from token payload
 */
export interface UserInfo {
  id: string;
  username: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  firstName?: string;
  lastName?: string;
  roles: string[];
}

export function extractUserInfo(payload: KeycloakJwtPayload): UserInfo {
  return {
    id: payload.sub!,
    username: payload.preferred_username,
    email: payload.email,
    emailVerified: payload.email_verified,
    name: payload.name,
    firstName: payload.given_name,
    lastName: payload.family_name,
    roles: payload.realm_access?.roles ?? [],
  };
}

/**
 * Generate a simple JWT for internal use (not Keycloak)
 * This can be used for service-to-service communication
 */
export function generateInternalToken(
  payload: Record<string, any>,
  expiresIn: string | number = '15m'
): string {
  const options: SignOptions = {
    expiresIn: expiresIn as any,
    issuer: 'plexica-core-api',
  };
  return jwt.sign(payload, config.jwtSecret, options);
}

/**
 * Verify internal JWT token
 */
export function verifyInternalToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwtSecret, {
    issuer: 'plexica-core-api',
  }) as JwtPayload;
}
