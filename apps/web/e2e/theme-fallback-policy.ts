const THEME_FALLBACK_ENV = 'PLAYWRIGHT_ALLOW_KEYCLOAK_THEME_FALLBACK';

export const LOCAL_THEME_FALLBACK_REASON = `${THEME_FALLBACK_ENV}=true enabled the local-only Keycloak theme fallback`;

export function isLocalThemeFallbackAllowed(): boolean {
  const requested = process.env[THEME_FALLBACK_ENV] === 'true';
  if (requested && process.env['CI'] !== undefined) {
    throw new Error(`${THEME_FALLBACK_ENV}=true is local-only and is forbidden in CI.`);
  }
  return requested;
}
