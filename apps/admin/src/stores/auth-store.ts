// auth-store.ts
// Admin app auth store — built on the shared createAuthStore factory
// (Decision 8, 2026-08-18). App-specific differences are injected:
// - realm is hardcoded 'master'
// - profile includes realm: 'master'
// - logout URL is /login
// - persist name is plexica-admin-auth

import { createAuthStore, extractBaseProfile } from '@plexica/auth';

import { clearAuthQueryCache } from '../services/auth-query-cache.js';
import { keycloakClient, REDIRECT_URI } from '../services/keycloak-auth.js';

import type { AdminUserProfile, AuthState } from '../types/auth.js';

interface AdminAuthState extends AuthState {}

export const useAuthStore = createAuthStore<AdminUserProfile, AdminAuthState>({
  keycloakClient,
  redirectUri: REDIRECT_URI,

  realmResolver: () => 'master',

  decodeProfile: (accessToken) => ({
    ...extractBaseProfile(accessToken),
    realm: 'master',
  }),

  postLogoutUrlBuilder: () => `${window.location.origin}/login`,

  persistName: 'plexica-admin-auth',

  onClearAuth: clearAuthQueryCache,
});
