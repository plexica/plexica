const DEFAULT_KEYCLOAK_URL = 'http://localhost:8080';

export function getKeycloakUrl(): string {
  return (
    process.env['KEYCLOAK_URL'] ?? process.env['PLAYWRIGHT_KEYCLOAK_URL'] ?? DEFAULT_KEYCLOAK_URL
  );
}

export function assertExplicitLoopbackE2eTarget(): void {
  if (process.env['PLAYWRIGHT_E2E'] !== 'true') {
    throw new Error('Refusing E2E Keycloak provisioning without PLAYWRIGHT_E2E=true');
  }

  const target = new URL(getKeycloakUrl());
  const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1']);
  if (!loopbackHosts.has(target.hostname)) {
    throw new Error(
      `Refusing E2E Keycloak provisioning against non-loopback host ${target.hostname}`
    );
  }
}

export async function waitForKeycloak(retries = 30, delayMs = 2_000): Promise<void> {
  assertExplicitLoopbackE2eTarget();
  const keycloakUrl = getKeycloakUrl();
  const probeUrl = `${keycloakUrl}/realms/master`;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(probeUrl, { signal: AbortSignal.timeout(5_000) });
      if (response.ok) return;
    } catch {
      // Keycloak is still starting.
    }
    process.stdout.write(
      `[global-setup] Waiting for Keycloak at ${keycloakUrl} (${attempt}/${retries})\n`
    );
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error(`Keycloak at ${keycloakUrl} not ready after ${retries} retries`);
}

export async function getAdminToken(): Promise<string> {
  assertExplicitLoopbackE2eTarget();
  const response = await fetch(`${getKeycloakUrl()}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: process.env['KEYCLOAK_ADMIN_USER'] ?? 'admin',
      password: process.env['KEYCLOAK_ADMIN_PASSWORD'] ?? 'changeme',
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(
      `Keycloak admin token fetch failed: ${response.status} ${await response.text()}`
    );
  }
  const body = (await response.json()) as { access_token?: unknown };
  if (typeof body.access_token !== 'string') {
    throw new Error('Keycloak admin token response did not contain an access_token');
  }
  return body.access_token;
}

export async function adminFetch(
  token: string,
  apiPath: string,
  method: string,
  body?: unknown
): Promise<Response> {
  assertExplicitLoopbackE2eTarget();
  return fetch(`${getKeycloakUrl()}${apiPath}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10_000),
  });
}
