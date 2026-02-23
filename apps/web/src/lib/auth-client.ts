// apps/web/src/lib/auth-client.ts
//
// Thin HTTP client wrapper that:
//  1. Attaches the current Bearer token to every request
//  2. Handles 401 responses by triggering session expiry in auth.store.ts
//  3. Exposes typed helpers for the OAuth auth flow endpoints
//
// All other API calls should continue to use api-client.ts / @plexica/api-client.

import { getAccessToken, useAuthStore } from '@/stores/auth.store';
import { getTenantFromUrl } from '@/lib/tenant';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export interface MeResponse {
  id: string;
  email: string;
  name: string;
  roles: string[];
  tenantId?: string;
}

export interface LoginStartResponse {
  authorizationUrl: string;
}

// ---------------------------------------------------------------------------
// Base fetch wrapper
// ---------------------------------------------------------------------------

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function authFetch<T>(path: string, options: RequestInit = {}, skipAuth = false): Promise<T> {
  const token = getAccessToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (!skipAuth && token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401 && !skipAuth) {
    // Trigger session expiry — shows SessionExpiredModal
    useAuthStore.getState().expireSession();
    throw new AuthClientError(401, 'SESSION_EXPIRED', 'Session has expired');
  }

  if (!response.ok) {
    let code = 'AUTH_ERROR';
    let message = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as {
        error?: { code?: string; message?: string };
      };
      code = body?.error?.code ?? code;
      message = body?.error?.message ?? message;
    } catch {
      // Ignore JSON parse errors
    }
    throw new AuthClientError(response.status, code, message);
  }

  // 204 No Content — return empty object
  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class AuthClientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'AuthClientError';
    this.status = status;
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Auth API helpers
// ---------------------------------------------------------------------------

/**
 * Start OAuth login — returns the Keycloak authorization URL.
 * @param redirectUri  Where Keycloak should redirect after login (our callback route)
 * @param state        CSRF/state token to verify on callback
 */
export async function getLoginUrl(redirectUri: string, state?: string): Promise<string> {
  const tenantSlug = getTenantFromUrl();
  const params = new URLSearchParams({ tenant: tenantSlug, redirect_uri: redirectUri });
  if (state) params.set('state', state);

  const data = await authFetch<LoginStartResponse>(
    `/api/v1/auth/login?${params.toString()}`,
    { method: 'GET' },
    true // no auth header — this is the pre-login call
  );
  return data.authorizationUrl;
}

/**
 * Exchange the OAuth authorization code for tokens.
 */
export async function exchangeCode(code: string, state?: string): Promise<TokenResponse> {
  const tenantSlug = getTenantFromUrl();
  const params = new URLSearchParams({ code, tenant: tenantSlug });
  if (state) params.set('state', state);

  return authFetch<TokenResponse>(
    `/api/v1/auth/callback?${params.toString()}`,
    { method: 'GET' },
    true // no auth header — exchanging code for first token
  );
}

/**
 * Fetch the authenticated user's profile from the backend.
 */
export async function getMe(): Promise<MeResponse> {
  return authFetch<MeResponse>('/api/v1/auth/me', { method: 'GET' });
}
