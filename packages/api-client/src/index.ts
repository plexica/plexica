// File: packages/api-client/src/index.ts

/**
 * @plexica/api-client — Main Entry Point
 *
 * Shared typed HTTP clients for the Plexica platform.
 *
 * Usage (tenant app):
 * ```ts
 * import { TenantApiClient } from '@plexica/api-client';
 * const api = new TenantApiClient({ baseUrl: 'http://localhost:3000' });
 * api.setTenantSlug('acme');
 * api.setAuthProvider({ getToken: () => keycloak.token });
 * const workspaces = await api.getWorkspaces();
 * ```
 *
 * Usage (super-admin app):
 * ```ts
 * import { AdminApiClient } from '@plexica/api-client';
 * const api = new AdminApiClient({ baseUrl: 'http://localhost:3000' });
 * api.setAuthProvider({ getToken: () => keycloak.token, refreshToken: ... });
 * const tenants = await api.getTenants();
 * ```
 */

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export { HttpClient } from './client.js';
export { TenantApiClient } from './tenant-client.js';
export { AdminApiClient } from './admin-client.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export { ApiError } from './types.js';
export type {
  HttpClientConfig,
  TenantClientConfig,
  AdminClientConfig,
  AuthTokenProvider,
  ApiErrorResponse,
  PaginatedResponse,
  RequestOptions,
} from './types.js';

// ---------------------------------------------------------------------------
// Schemas (runtime validation)
// ---------------------------------------------------------------------------

export {
  PluginStatusSchema,
  PluginLifecycleStatusSchema,
  PluginEntitySchema,
  PaginatedPluginEntitySchema,
  PluginStatsSchema,
} from './schemas.js';
