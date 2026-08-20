// env-guard.ts
// Shared fail-fast guard for build-time environment origins (e.g. the
// Keycloak URL). Used by both apps/web and apps/admin so the "refuse a
// silent localhost fallback in production" rule lives in exactly one place.

/**
 * Resolves a build-time environment origin, refusing to silently fall back
 * in a production build.
 *
 * `value` is genuinely optional at the type level (nothing guarantees it is
 * injected), but a *production* bundle that silently falls back to a
 * development origin (typically `http://localhost:8080`) points a security-
 * sensitive dependency — the identity provider — at the wrong host, in
 * cleartext, and the failure only shows up later as a broken login or,
 * worse, a login that appears to succeed. A misconfigured deploy must fail
 * loudly at module load instead.
 *
 * Callers pass `isProd` explicitly (typically `import.meta.env.PROD`) rather
 * than this module reading `import.meta.env` itself, so this package does not
 * need to depend on Vite's client types.
 *
 * @param value       - The raw environment value, e.g. `import.meta.env.VITE_KEYCLOAK_URL`.
 * @param name         - Name of the environment variable, used in the error message.
 * @param devFallback  - Value to use outside production builds.
 * @param isProd       - Whether this is a production build, e.g. `import.meta.env.PROD`.
 */
export function requiredOrigin(
  value: string | undefined,
  name: string,
  devFallback: string,
  isProd: boolean
): string {
  if (value !== undefined && value !== '') return value;
  if (isProd) {
    throw new Error(
      `${name} is not defined. A production build must be given the origin explicitly; ` +
        `refusing to fall back to ${devFallback}.`
    );
  }
  return devFallback;
}
