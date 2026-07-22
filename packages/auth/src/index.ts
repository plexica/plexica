// @plexica/auth — Shared authentication primitives for Plexica apps.
//
// This package provides the building blocks that both apps/web and apps/admin
// use for Keycloak-based authentication. Apps extend these primitives with
// app-specific state, actions, and UI components.
//
// ## Usage
//
// ```typescript
// import { createKeycloakClient } from '@plexica/auth/keycloak-client';
// import { createApiClient } from '@plexica/auth/api-client';
// import { decodeBase64Url, extractBaseProfile } from '@plexica/auth/jwt';
// import { rehydrateStatus, partializeAuthState } from '@plexica/auth/auth-store';
// import { useSilentRefresh } from '@plexica/auth/use-silent-refresh';
// ```
//
// ## Package Structure
//
// - `types.ts`      — AuthStatus, TokenResponse, BaseUserProfile, AuthState<T>
// - `jwt.ts`         — decodeBase64Url, decodeAccessToken, extractBaseProfile, isTokenValid
// - `keycloak-client.ts` — createKeycloakClient() browser PKCE factory
// - `api-client.ts`  — createApiClient() factory (auto-auth, 401 refresh, error handling)
// - `auth-store.ts`  — createAuthBaseSlice(), rehydrateStatus(), partializeAuthState()
// - `use-silent-refresh.ts` — useSilentRefresh() hook

export type {
  TokenResponse,
  BaseUserProfile,
  AuthStatus,
  AuthState,
} from './types.js';

export type {
  KeycloakClientConfig,
  KeycloakClient,
} from './keycloak-client.js';

export type {
  ApiClientConfig,
  RequestOptions,
  ApiClient,
} from './api-client.js';

export type {
  AuthBaseState,
  AuthBaseActions,
} from './auth-store.js';

export type {
  SilentRefreshConfig,
} from './use-silent-refresh.js';
