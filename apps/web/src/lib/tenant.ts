// apps/web/src/lib/tenant.ts

/**
 * Extracts the tenant slug from the current URL hostname.
 *
 * Supports multiple deployment patterns:
 * - Subdomain: tenant1.plexica.app -> 'tenant1'
 * - Custom domain: customdomain.com -> uses VITE_DEFAULT_TENANT or 'default'
 * - Localhost with subdomain: tenant1.localhost:5173 -> 'tenant1'
 * - Localhost without subdomain: localhost:5173 -> uses VITE_DEFAULT_TENANT or 'default'
 *
 * @returns The tenant slug extracted from the URL
 */
export function getTenantFromUrl(): string {
  const hostname = window.location.hostname;

  // For localhost, check if subdomain exists
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return import.meta.env.VITE_DEFAULT_TENANT || 'default';
  }

  // For localhost with subdomain (e.g., tenant1.localhost)
  if (hostname.includes('.localhost')) {
    const parts = hostname.split('.');
    return parts[0]; // Return the subdomain part
  }

  // For production URLs (e.g., tenant1.plexica.app)
  const baseDomain = import.meta.env.VITE_BASE_DOMAIN || 'plexica.app';

  // If hostname matches base domain exactly, use default tenant
  if (hostname === baseDomain) {
    return import.meta.env.VITE_DEFAULT_TENANT || 'default';
  }

  // Extract subdomain from hostname
  if (hostname.endsWith(`.${baseDomain}`)) {
    const subdomain = hostname.replace(`.${baseDomain}`, '');
    return subdomain;
  }

  // For custom domains (not matching base domain), use the full hostname as tenant
  // or fall back to default tenant
  console.warn(`[Tenant] Custom domain detected: ${hostname}, using default tenant`);
  return import.meta.env.VITE_DEFAULT_TENANT || 'default';
}

/**
 * Gets the Keycloak realm name for the current tenant.
 * By default, uses the pattern: {tenantSlug}-realm
 * Can be overridden with VITE_KEYCLOAK_REALM env var.
 *
 * @param tenantSlug The tenant slug
 * @returns The Keycloak realm name
 */
export function getRealmForTenant(tenantSlug: string): string {
  // Allow override for development/testing
  const realmOverride = import.meta.env.VITE_KEYCLOAK_REALM;
  if (realmOverride) {
    return realmOverride;
  }

  // Default pattern: {tenant}-realm
  return `${tenantSlug}-realm`;
}

/**
 * Validates if a tenant slug is valid.
 * Tenant slugs must be lowercase alphanumeric with hyphens only.
 *
 * @param slug The tenant slug to validate
 * @returns True if valid, false otherwise
 */
export function isValidTenantSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}
