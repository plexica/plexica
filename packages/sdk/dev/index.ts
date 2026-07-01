// dev/index.ts
// @plexica/sdk/dev — Development mode helpers.

export interface DevRegistrationConfig {
  slug: string;
  backendUrl: string;
  uiUrl?: string;
  extensionPoints?: string[];
  actions?: Array<{ action: string; defaultRole: string }>;
  events?: { subscribes?: string[] };
  declaredTables?: string[];
}

export interface DevUnregistrationConfig {
  slug: string;
}

/**
 * Registers a plugin backend with the core API in dev mode.
 * Calls POST /api/v1/dev/plugins/register.
 */
function trimTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

export async function registerBackend(
  coreApiUrl: string,
  config: DevRegistrationConfig
): Promise<Response> {
  return fetch(`${trimTrailingSlash(coreApiUrl)}/api/v1/dev/plugins/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
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
  return fetch(`${trimTrailingSlash(coreApiUrl)}/api/v1/dev/plugins/unregister`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
}
