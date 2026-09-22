// auth-store.ts
// Tenant web app auth store — built on the shared createAuthStore factory
// (Decision 8, 2026-08-18). App-specific differences are injected:
// - realm is dynamic (resolved from tenant context in state)
// - profile includes tenantRole
// - logout URL includes tenant slug query param
// - persist includes tenant context fields

import { createAuthStore, extractBaseProfile } from '@plexica/auth';

import { clearAuthQueryCache } from '../services/auth-query-cache.js';
import { keycloakClient, REDIRECT_URI } from '../services/keycloak-auth.js';

import type { UserProfile, AuthState } from '../types/auth.js';
import type { LocaleCode } from '../i18n/locales.js';

interface WebAuthState extends AuthState {
  tenantSlug: string | null;
  tenantUuid: string | null;
  realm: string | null;
  /**
   * Active UI locale (006-07, D-7). Persisted with the auth state so a page
   * reload keeps the user's choice; `user_profile.language` on the profile
   * endpoint remains the source of truth (synced via PATCH /profile).
   */
  locale: LocaleCode;
  setTenantContext: (slug: string, realm: string, uuid?: string) => void;
  setLocale: (locale: LocaleCode) => void;
}

export const useAuthStore = createAuthStore<UserProfile, WebAuthState>({
  keycloakClient,
  redirectUri: REDIRECT_URI,

  realmResolver: (state) => state.realm,

  decodeProfile: (accessToken, realm) => {
    const profile: UserProfile = { ...extractBaseProfile(accessToken), realm };
    if (profile.roles.includes('tenant_admin')) profile.tenantRole = 'tenant_admin';
    else if (profile.roles.includes('member')) profile.tenantRole = 'member';
    return profile;
  },

  postLogoutUrlBuilder: (state) => {
    const url = new URL('/', window.location.origin);
    if (state.tenantSlug !== null) url.searchParams.set('tenant', state.tenantSlug);
    return url.href;
  },

  persistName: 'plexica-auth',

  partializeExtra: (state) => ({
    tenantSlug: state.tenantSlug,
    tenantUuid: state.tenantUuid,
    realm: state.realm,
    locale: state.locale,
  }),

  extraState: {
    tenantSlug: null,
    tenantUuid: null,
    realm: null,
    // Default locale: 'en' is the EN-default catalog (006-06 risk fallback).
    locale: 'en' as LocaleCode,
  },

  extraActions: (set) => ({
    setTenantContext: (tenantSlug: string, realm: string, tenantUuid?: string) => {
      set({ tenantSlug, tenantUuid: tenantUuid ?? null, realm });
    },
    setLocale: (locale: LocaleCode) => {
      set({ locale });
    },
  }),

  onClearAuth: clearAuthQueryCache,
});
