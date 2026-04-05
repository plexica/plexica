// keycloak-admin-client.ts
// Keycloak Admin REST API helpers used by global-setup.ts.
// Exports: getAdminToken, upsertUser, setRealmPlexicaTheme.
//
// Key safety net: Keycloak 26 accepts PUT /admin/realms/{realm} with any
// loginTheme value (HTTP 200) but crashes at FTL render time (HTTP 5xx).
// setRealmPlexicaTheme probes the login page after setting the theme and
// falls back to '' so login-dependent E2E tests always have a working page.

const KEYCLOAK_URL = process.env['KEYCLOAK_URL'] ?? 'http://localhost:8080';
const KEYCLOAK_ADMIN_USER = process.env['KEYCLOAK_ADMIN_USER'] ?? 'admin';
const KEYCLOAK_ADMIN_PASSWORD = process.env['KEYCLOAK_ADMIN_PASSWORD'] ?? 'changeme';

interface AdminToken {
  access_token: string;
  expires_in: number;
}

export async function getAdminToken(): Promise<string> {
  const res = await fetch(`${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: KEYCLOAK_ADMIN_USER,
      password: KEYCLOAK_ADMIN_PASSWORD,
    }).toString(),
  });
  if (!res.ok) {
    throw new Error(`Keycloak admin token fetch failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as AdminToken;
  return data.access_token;
}

async function adminFetch(
  token: string,
  apiPath: string,
  method: string,
  body?: unknown
): Promise<Response> {
  return fetch(`${KEYCLOAK_URL}${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

export interface KeycloakUser {
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  password: string;
  requiredActions?: string[];
}

/**
 * Creates (or resets the password of) a Keycloak user in the given realm.
 * Handles 409 (already exists) idempotently — resets password and profile.
 */
export async function upsertUser(token: string, realm: string, user: KeycloakUser): Promise<void> {
  const userPayload: Record<string, unknown> = {
    username: user.username,
    email: user.email,
    enabled: true,
    emailVerified: true,
    ...(user.firstName !== undefined ? { firstName: user.firstName } : {}),
    ...(user.lastName !== undefined ? { lastName: user.lastName } : {}),
    ...(user.requiredActions !== undefined ? { requiredActions: user.requiredActions } : {}),
    credentials: [{ type: 'password', value: user.password, temporary: false }],
  };

  const createRes = await adminFetch(token, `/admin/realms/${realm}/users`, 'POST', userPayload);

  if (createRes.status === 201) return;

  if (createRes.status !== 409) {
    throw new Error(
      `Failed to create user ${user.username} in realm ${realm}: ${createRes.status} ${await createRes.text()}`
    );
  }

  // 409 — user already exists: look up their ID, reset password, update profile.
  const lookupRes = await adminFetch(
    token,
    `/admin/realms/${realm}/users?username=${encodeURIComponent(user.username)}&exact=true`,
    'GET'
  );
  if (!lookupRes.ok) {
    throw new Error(
      `Failed to look up existing user ${user.username} in realm ${realm}: ${lookupRes.status}`
    );
  }
  const users = (await lookupRes.json()) as Array<{ id: string }>;
  const userId = users[0]?.id;
  if (userId === undefined) {
    throw new Error(`User ${user.username} reported as 409 but not found in lookup`);
  }

  const resetRes = await adminFetch(
    token,
    `/admin/realms/${realm}/users/${userId}/reset-password`,
    'PUT',
    { type: 'password', value: user.password, temporary: false }
  );
  if (!resetRes.ok) {
    throw new Error(
      `Failed to reset password for ${user.username} in realm ${realm}: ${resetRes.status}`
    );
  }

  // Update profile fields and re-apply required actions for idempotency.
  const profileUpdate: Record<string, unknown> = {};
  if (user.firstName !== undefined) profileUpdate['firstName'] = user.firstName;
  if (user.lastName !== undefined) profileUpdate['lastName'] = user.lastName;
  if (user.requiredActions !== undefined) profileUpdate['requiredActions'] = user.requiredActions;

  if (Object.keys(profileUpdate).length > 0) {
    const updateRes = await adminFetch(
      token,
      `/admin/realms/${realm}/users/${userId}`,
      'PUT',
      profileUpdate
    );
    if (!updateRes.ok) {
      process.stderr.write(
        `[global-setup] Warning: could not update profile for ${user.username}: ${updateRes.status}\n`
      );
    }
  }
}

/**
 * Probes the login page render for a realm. Returns false if Keycloak returns
 * 5xx (FTL crash), true otherwise (including network errors — don't block setup).
 */
async function isLoginPageRendering(realm: string): Promise<boolean> {
  // Use a fake client_id — Keycloak renders the login page before client validation,
  // so a 5xx here means the theme crashed, not a client configuration error.
  const loginUrl =
    `${KEYCLOAK_URL}/realms/${realm}/protocol/openid-connect/auth` +
    `?client_id=probe&response_type=code&scope=openid&redirect_uri=http://localhost`;
  try {
    const res = await fetch(loginUrl, { method: 'GET', redirect: 'follow' });
    return res.status < 500;
  } catch {
    // Network error — Keycloak not reachable. Don't block setup.
    return true;
  }
}

async function resetToDefaultTheme(token: string, realm: string): Promise<void> {
  const fallbackRes = await adminFetch(token, `/admin/realms/${realm}`, 'PUT', { loginTheme: '' });
  if (!fallbackRes.ok) {
    process.stderr.write(
      `[global-setup] Warning: could not reset loginTheme for realm ${realm}: ${String(fallbackRes.status)}\n`
    );
  }
}

/**
 * Sets realm loginTheme to 'plexica', then probes the login page render.
 * Falls back to '' (default) if the PUT is rejected or the page returns 5xx.
 */
export async function setRealmPlexicaTheme(token: string, realm: string): Promise<void> {
  const setRes = await adminFetch(token, `/admin/realms/${realm}`, 'PUT', {
    loginTheme: 'plexica',
  });
  if (!setRes.ok) {
    process.stdout.write(
      `[global-setup] Warning: 'plexica' theme rejected (${String(setRes.status)}), falling back for realm ${realm}.\n`
    );
    await resetToDefaultTheme(token, realm);
    return;
  }

  const renders = await isLoginPageRendering(realm);
  if (renders) {
    process.stdout.write(
      `[global-setup] Realm ${realm}: loginTheme set to 'plexica' (render probe OK).\n`
    );
    return;
  }

  process.stdout.write(
    `[global-setup] Warning: 'plexica' theme renders with 5xx; falling back for realm ${realm}.\n`
  );
  await resetToDefaultTheme(token, realm);
}
