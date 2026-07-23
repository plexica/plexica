// keycloak-theme-helpers.ts
// Keycloak theme management helpers used by global-setup.ts.
// Extracted from keycloak-admin-client.ts to stay under 200-line limit.
//
// Keycloak 26 accepts PUT /admin/realms/{realm} with any loginTheme value
// (HTTP 200) but can still crash at FTL render time (HTTP 5xx). Activation and
// rendering are therefore both required unless local fallback is explicit.

import { adminFetch, getKeycloakUrl } from '../../../e2e/keycloak/admin-api.js';

import { isLocalThemeFallbackAllowed } from './theme-fallback-policy.js';

/**
 * Probes the login page render for a realm. A 5xx indicates an FTL crash; a
 * network error also fails because setup cannot establish that the theme works.
 */
async function probeLoginPageRender(realm: string): Promise<void> {
  const loginUrl =
    `${getKeycloakUrl()}/realms/${realm}/protocol/openid-connect/auth` +
    `?client_id=probe&response_type=code&scope=openid&redirect_uri=http://localhost`;
  let res: Response;
  try {
    res = await fetch(loginUrl, { method: 'GET', redirect: 'follow' });
  } catch (error) {
    throw new Error(`Plexica theme render probe could not reach realm ${realm}`, { cause: error });
  }
  if (res.status >= 500) {
    throw new Error(`Plexica theme render probe returned HTTP ${String(res.status)}`);
  }
}

async function resetToDefaultTheme(token: string, realm: string): Promise<void> {
  const fallbackRes = await adminFetch(token, `/admin/realms/${realm}`, 'PUT', { loginTheme: '' });
  if (!fallbackRes.ok) {
    throw new Error(
      `Could not reset loginTheme for realm ${realm}: HTTP ${String(fallbackRes.status)}`
    );
  }
}

async function handleThemeFailure(token: string, realm: string, reason: string): Promise<false> {
  if (!isLocalThemeFallbackAllowed()) {
    throw new Error(`${reason} for realm ${realm}.`);
  }
  process.stderr.write(`[global-setup] Warning: ${reason}; using local theme fallback.\n`);
  await resetToDefaultTheme(token, realm);
  return false;
}

/**
 * Sets realm loginTheme to 'plexica', then probes the login page render. Failure
 * is fatal unless the explicit local-only fallback policy permits a reset.
 */
export async function setRealmPlexicaTheme(token: string, realm: string): Promise<boolean> {
  const setRes = await adminFetch(token, `/admin/realms/${realm}`, 'PUT', {
    loginTheme: 'plexica',
  });
  if (!setRes.ok) {
    return handleThemeFailure(
      token,
      realm,
      `Plexica theme activation returned HTTP ${String(setRes.status)}`
    );
  }

  try {
    await probeLoginPageRender(realm);
    process.stdout.write(
      `[global-setup] Realm ${realm}: loginTheme set to 'plexica' (render probe OK).\n`
    );
    return true;
  } catch (error) {
    return handleThemeFailure(token, realm, String(error));
  }
}
