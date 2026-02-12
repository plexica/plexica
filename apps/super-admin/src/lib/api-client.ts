// apps/super-admin/src/lib/api-client.ts

/**
 * Super Admin API Client
 *
 * Thin wrapper around @plexica/api-client's AdminApiClient that wires up
 * Keycloak authentication for the plexica-admin realm.
 *
 * CRITICAL DIFFERENCES from tenant app:
 * - NO X-Tenant-Slug header (platform-wide access)
 * - NO X-Workspace-ID header (no workspace concept)
 * - Uses Keycloak token from plexica-admin realm
 * - All endpoints are admin-level
 */

import type { InternalAxiosRequestConfig } from 'axios';
import { AdminApiClient } from '@plexica/api-client';
import { getToken, updateToken } from './keycloak';
import { getApiUrl } from './config';

class SuperAdminApiClient extends AdminApiClient {
  constructor() {
    super({ baseUrl: getApiUrl() });

    // Wire up Keycloak auth provider
    this.setAuthProvider({
      getToken: () => getToken() ?? null,
      refreshToken: async () => {
        try {
          await updateToken(30);
          return true;
        } catch {
          return false;
        }
      },
      onAuthFailure: () => {
        console.error('[API Client] Unauthorized (401), redirecting to login');
        window.location.href = '/login';
      },
    });

    // Proactively refresh token before each request (matches old behavior)
    // This interceptor runs before the base class auth interceptor picks up the token
    this.axios.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        try {
          await updateToken(30); // Refresh if expires in less than 30 seconds
        } catch {
          console.warn('[API Client] Token update failed, using existing token');
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for 403 handling (not in base class)
    this.axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 403) {
          console.error('[API Client] Forbidden (403), insufficient permissions');
        }
        return Promise.reject(error);
      }
    );
  }
}

export const apiClient = new SuperAdminApiClient();
export default apiClient;
