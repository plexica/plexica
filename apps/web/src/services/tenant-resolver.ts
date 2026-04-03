// tenant-resolver.ts
// Resolves the current tenant from the browser URL (subdomain or dev header override).
// Called once at app startup to determine which Keycloak realm to use.

import type { TenantInfo } from '../types/tenant.js';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

class TenantResolutionError extends Error {
  constructor(
    public readonly reason: 'no-subdomain' | 'unknown',
    message: string
  ) {
    super(message);
    this.name = 'TenantResolutionError';
  }
}

function extractSlug(): string | null {
  const hostname = window.location.hostname;
  const parts = hostname.split('.');

  // In development: support ?tenant= query param as override
  const searchParams = new URLSearchParams(window.location.search);
  const devSlug = searchParams.get('tenant');
  if (devSlug !== null && devSlug.length > 0) {
    return devSlug;
  }

  // Production: first subdomain component
  if (parts.length >= 3 && parts[0] !== undefined && parts[0] !== 'www') {
    return parts[0];
  }

  return null;
}

export async function resolveTenant(): Promise<TenantInfo> {
  const slug = extractSlug();

  if (slug === null) {
    throw new TenantResolutionError('no-subdomain', 'No tenant subdomain found in URL');
  }

  const response = await fetch(`${API_BASE}/tenants/resolve?slug=${encodeURIComponent(slug)}`);

  if (!response.ok) {
    throw new TenantResolutionError(
      'unknown',
      `Tenant resolution request failed: ${response.status}`
    );
  }

  const data = (await response.json()) as { exists: boolean };

  if (!data.exists) {
    throw new TenantResolutionError('unknown', `Tenant "${slug}" not found`);
  }

  // NEW-H-3: realm is not returned by the API (prevents enumeration of internal realm names).
  // Derive it from slug using the same convention as the backend toRealmName() helper.
  const realm = `plexica-${slug}`;

  return { slug, realm };
}

export { TenantResolutionError };
