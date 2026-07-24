export interface AuthorizationRequestRecord {
  codeVerifier: string;
  nonce: string;
}

const STORAGE_PREFIX = 'plexica_oidc_request:';
export const AUTHORIZATION_REQUEST_TTL_MS = 10 * 60 * 1_000;

interface StoredAuthorizationRequest extends AuthorizationRequestRecord {
  createdAt: number;
}

function storageKey(state: string): string {
  return `${STORAGE_PREFIX}${state}`;
}

function isAuthorizationRequestRecord(value: unknown): value is StoredAuthorizationRequest {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record['codeVerifier'] === 'string' &&
    record['codeVerifier'].length > 0 &&
    typeof record['nonce'] === 'string' &&
    record['nonce'].length > 0 &&
    typeof record['createdAt'] === 'number' &&
    Number.isFinite(record['createdAt'])
  );
}

export function storeAuthorizationRequest(state: string, record: AuthorizationRequestRecord): void {
  cleanupAuthorizationRequests();
  sessionStorage.setItem(storageKey(state), JSON.stringify({ ...record, createdAt: Date.now() }));
}

export function consumeAuthorizationRequest(state: string): AuthorizationRequestRecord {
  cleanupAuthorizationRequests();
  const key = storageKey(state);
  const serialized = sessionStorage.getItem(key);
  sessionStorage.removeItem(key);
  if (serialized === null) throw new Error('Authentication request is missing or invalid.');

  try {
    const record: unknown = JSON.parse(serialized);
    if (
      isAuthorizationRequestRecord(record) &&
      Date.now() - record.createdAt <= AUTHORIZATION_REQUEST_TTL_MS
    ) {
      return { codeVerifier: record.codeVerifier, nonce: record.nonce };
    }
  } catch {
    // The record was removed before parsing so malformed requests cannot be retried.
  }
  throw new Error('Authentication request is missing or invalid.');
}

export function discardAuthorizationRequest(state: string): void {
  sessionStorage.removeItem(storageKey(state));
}

export function cleanupAuthorizationRequests(now = Date.now()): void {
  const keys = Array.from({ length: sessionStorage.length }, (_, index) =>
    sessionStorage.key(index)
  );
  for (const key of keys) {
    if (key === null || !key.startsWith(STORAGE_PREFIX)) continue;
    try {
      const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? 'null');
      if (
        isAuthorizationRequestRecord(value) &&
        now - value.createdAt <= AUTHORIZATION_REQUEST_TTL_MS
      ) {
        continue;
      }
    } catch {
      // Malformed records are abandoned and must not remain replayable.
    }
    sessionStorage.removeItem(key);
  }
}

export function clearAuthorizationRequests(): void {
  const keys = Array.from({ length: sessionStorage.length }, (_, index) =>
    sessionStorage.key(index)
  );
  for (const key of keys) {
    if (key?.startsWith(STORAGE_PREFIX)) sessionStorage.removeItem(key);
  }
}
