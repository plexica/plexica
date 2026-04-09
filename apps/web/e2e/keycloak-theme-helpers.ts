// keycloak-theme-helpers.ts
// Keycloak theme management helpers used by global-setup.ts.
// Extracted from keycloak-admin-client.ts to stay under 200-line limit.
//
// Key safety net: Keycloak 26 accepts PUT /admin/realms/{realm} with any
// loginTheme value (HTTP 200) but crashes at FTL render time (HTTP 5xx).
// setRealmPlexicaTheme probes the login page after setting the theme and
// falls back to '' so login-dependent E2E tests always have a working page.

import { adminFetch, KEYCLOAK_URL } from './keycloak-admin-client.js';

/**
 * Probes the login page render for a realm. Returns false if Keycloak returns
 * 5xx (FTL crash), true otherwise (including network errors — don't block setup).
 */
async function isLoginPageRendering(realm: string): Promise<boolean> {
  const loginUrl =
    `${KEYCLOAK_URL}/realms/${realm}/protocol/openid-connect/auth` +
    `?client_id=probe&response_type=code&scope=openid&redirect_uri=http://localhost`;
  try {
    const res = await fetch(loginUrl, { method: 'GET', redirect: 'follow' });
    return res.status < 500;
  } catch {
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
 * Returns true when the Plexica theme is active, false when the fallback is used.
 */
export async function setRealmPlexicaTheme(token: string, realm: string): Promise<boolean> {
  const setRes = await adminFetch(token, `/admin/realms/${realm}`, 'PUT', {
    loginTheme: 'plexica',
  });
  if (!setRes.ok) {
    process.stdout.write(
      `[global-setup] Warning: 'plexica' theme rejected (${String(setRes.status)}), falling back for realm ${realm}.\n`
    );
    await resetToDefaultTheme(token, realm);
    return false;
  }

  const renders = await isLoginPageRendering(realm);
  if (renders) {
    process.stdout.write(
      `[global-setup] Realm ${realm}: loginTheme set to 'plexica' (render probe OK).\n`
    );
    return true;
  }

  process.stdout.write(
    `[global-setup] Warning: 'plexica' theme renders with 5xx; falling back for realm ${realm}.\n`
  );
  await resetToDefaultTheme(token, realm);
  return false;
}
