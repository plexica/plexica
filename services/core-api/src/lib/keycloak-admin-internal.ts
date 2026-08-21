// keycloak-admin-internal.ts
// Internal HTTP helper for Keycloak Admin REST API.
// Shared between keycloak-admin.ts, keycloak-admin-users.ts, and keycloak-admin-realm.ts.
// NOT part of the public API — do not import from outside the lib directory.

import { KeycloakError } from './app-error.js';
import { keycloakContainerBase } from './ci-runtime-contract.js';
import { config } from './config.js';

interface AdminToken {
  accessToken: string;
  expiresAt: number;
}

let cachedToken: AdminToken | null = null;

async function getAdminToken(): Promise<string> {
  if (cachedToken !== null && Date.now() < cachedToken.expiresAt) {
    return cachedToken.accessToken;
  }

  const url = `${keycloakContainerBase(config)}/realms/master/protocol/openid-connect/token`;
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: 'admin-cli',
    username: config.KEYCLOAK_ADMIN_USER,
    password: config.KEYCLOAK_ADMIN_PASSWORD,
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`Keycloak admin token fetch failed: ${response.status}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 10) * 1000,
  };

  return cachedToken.accessToken;
}

export async function adminRequest(
  path: string,
  method: string,
  body?: unknown
): Promise<Response> {
  const token = await getAdminToken();
  return fetch(`${keycloakContainerBase(config)}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
}

/** Clears the cached admin token — call after destructive realm operations. */
export function invalidateAdminTokenCache(): void {
  cachedToken = null;
}

/**
 * adminRequest + centralized status check. Throws KeycloakError (→ 502
 * KEYCLOAK_ERROR) unless the response is ok or its status is explicitly listed
 * in `opts.tolerate` (e.g. 404/409 for idempotent provisioning). `context` is
 * the operation description used as the error message prefix, e.g.
 * `Failed to create realm ${realmName}` → `Failed to create realm acme: 500`.
 *
 * Before this helper, several call sites threw raw Error for the same
 * failures, surfacing as 500 INTERNAL_SERVER_ERROR instead of 502.
 */
export async function adminRequestOk(
  path: string,
  method: string,
  body?: unknown,
  opts?: { tolerate?: number[]; context: string }
): Promise<Response> {
  const res = await adminRequest(path, method, body);
  if (!res.ok && !(opts?.tolerate ?? []).includes(res.status)) {
    throw new KeycloakError(`${opts?.context ?? 'Keycloak admin request failed'}: ${res.status}`);
  }
  return res;
}
