// dev/index.ts
// @plexica/sdk/dev — Development mode helpers.

export interface DevRegistrationConfig {
  slug: string;
  backendUrl: string;
  tenantSlug: string;
  uiUrl?: string;
  extensionPoints?: string[];
  actions?: Array<{ action: string; defaultRole: string }>;
  events?: { subscribes?: string[] };
  declaredTables?: string[];
}

export interface DevUnregistrationConfig {
  slug: string;
  tenantSlug: string;
}

/**
 * Registers a plugin backend with the core API in dev mode.
 * Calls POST /api/v1/dev/plugins/register.
 * The tenant is passed via the X-Tenant-Slug header (devRouteAuth in the
 * core resolves the tenant context from it — no user JWT is required).
 */
function trimTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function devHeaders(tenantSlug: string): Record<string, string> {
  return { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenantSlug };
}

export async function registerBackend(
  coreApiUrl: string,
  config: DevRegistrationConfig
): Promise<Response> {
  const { tenantSlug, ...body } = config;
  return fetch(`${trimTrailingSlash(coreApiUrl)}/api/v1/dev/plugins/register`, {
    method: 'POST',
    headers: devHeaders(tenantSlug),
    body: JSON.stringify(body),
  });
}

/**
 * Unregisters a plugin backend from the core API.
 * Calls POST /api/v1/dev/plugins/unregister.
 */
export async function unregisterBackend(
  coreApiUrl: string,
  config: DevUnregistrationConfig
): Promise<Response> {
  const { tenantSlug, ...body } = config;
  return fetch(`${trimTrailingSlash(coreApiUrl)}/api/v1/dev/plugins/unregister`, {
    method: 'POST',
    headers: devHeaders(tenantSlug),
    body: JSON.stringify(body),
  });
}
