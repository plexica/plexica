export class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

export function makeAccessToken(): string {
  const payload = btoa(
    JSON.stringify({
      exp: Math.floor(Date.now() / 1000) + 3600,
      sub: 'user-1',
      email: 'admin@example.com',
      given_name: 'Admin',
      family_name: 'User',
      realm_access: { roles: ['admin'] },
    })
  ).replace(/=/g, '');
  return `header.${payload}.signature`;
}

interface IdTokenClaims {
  issuer?: string;
  audience?: string | string[];
  azp?: string;
  nonce?: string;
  issuedAt?: number;
  expiresAt?: number;
}

export interface IdTokenSigner {
  jwk: JWK;
  sign: (claims?: IdTokenClaims) => Promise<string>;
}

export async function createIdTokenSigner(kid = crypto.randomUUID()): Promise<IdTokenSigner> {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk = { ...(await exportJWK(publicKey)), alg: 'RS256', kid, use: 'sig' };
  return {
    jwk,
    sign: (claims = {}) => signIdToken(privateKey, kid, claims),
  };
}

async function signIdToken(key: KeyLike, kid: string, claims: IdTokenClaims): Promise<string> {
  const now = Math.floor(Date.now() / 1_000);
  return new SignJWT({
    azp: claims.azp ?? 'app',
    nonce: claims.nonce ?? 'expected-nonce',
  })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuer(claims.issuer ?? 'https://id.example.com/realms/realm')
    .setAudience(claims.audience ?? 'app')
    .setIssuedAt(claims.issuedAt ?? now)
    .setExpirationTime(claims.expiresAt ?? now + 300)
    .sign(key);
}

export function tokenResponse(idToken?: string) {
  return {
    access_token: makeAccessToken(),
    refresh_token: 'refresh-new',
    ...(idToken === undefined ? {} : { id_token: idToken }),
    expires_in: 60,
    refresh_expires_in: 600,
    token_type: 'Bearer' as const,
  };
}
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

import type { JWK, KeyLike } from 'jose';
