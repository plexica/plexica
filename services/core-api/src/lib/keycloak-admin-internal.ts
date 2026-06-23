// keycloak-admin-internal.ts
// Internal HTTP helper for Keycloak Admin REST API.
// Shared between keycloak-admin.ts, keycloak-admin-users.ts, and keycloak-admin-realm.ts.
// NOT part of the public API — do not import from outside the lib directory.

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

  const url = `${config.KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`;
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
  return fetch(`${config.KEYCLOAK_URL}${path}`, {
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
