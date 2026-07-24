import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

const tokenSchema = z
  .string()
  .regex(
    /^plxsvc_([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/i
  );

export interface ParsedServiceCredential {
  credentialId: string;
  secret: string;
}

export function parseServiceCredential(token: string): ParsedServiceCredential | null {
  const parsed = tokenSchema.safeParse(token);
  if (!parsed.success) return null;
  const match = /^plxsvc_([^.]+)\.(.+)$/.exec(parsed.data);
  if (match?.[1] === undefined || match[2] === undefined) return null;
  return { credentialId: match[1].toLowerCase(), secret: match[2] };
}

export function digestServiceCredential(
  credentialId: string,
  secret: string,
  pepper: string
): Buffer {
  return createHmac('sha256', pepper).update(credentialId).update(secret).digest();
}

export function compareServiceCredentialDigest(expected: Uint8Array, actual: Buffer): boolean {
  const expectedBuffer = Buffer.from(expected);
  return expectedBuffer.byteLength === actual.byteLength && timingSafeEqual(expectedBuffer, actual);
}

export function generateServiceCredential(pepper: string): {
  credentialId: string;
  token: string;
  digest: Buffer;
} {
  const credentialId = randomUUID();
  const secret = randomBytes(32).toString('base64url');
  return {
    credentialId,
    token: `plxsvc_${credentialId}.${secret}`,
    digest: digestServiceCredential(credentialId, secret, pepper),
  };
}
