import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAuthStore } from '../src/create-auth-store.js';
import { createKeycloakClient } from '../src/keycloak-client.js';

import { MemoryStorage } from './test-helpers.js';

import type { BaseAuthActions, BaseAuthState } from '../src/create-auth-store.js';
import type { BaseUserProfile } from '../src/types.js';

interface ExtendedState extends BaseAuthState<BaseUserProfile>, BaseAuthActions {
  count: number;
  increment: () => void;
}

const keycloakClient = createKeycloakClient({
  keycloakUrl: 'https://id.example.com',
  clientId: 'test-client',
});

const baseConfig = {
  keycloakClient,
  redirectUri: 'https://app.example.com/callback',
  realmResolver: () => 'test-realm',
  decodeProfile: (): BaseUserProfile => ({
    id: 'user-1',
    email: 'user@example.com',
    firstName: 'Test',
    lastName: 'User',
    roles: [],
  }),
  postLogoutUrlBuilder: () => 'https://app.example.com/',
};

describe('createAuthStore', () => {
  beforeEach(() => {
    vi.stubGlobal('sessionStorage', new MemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should inject an extra action that mutates extra state', () => {
    const store = createAuthStore<BaseUserProfile, ExtendedState>({
      ...baseConfig,
      persistName: 'extended-auth',
      extraState: { count: 0 },
      extraActions: (set, get) => ({
        increment: () => set({ count: get().count + 1 }),
      }),
    });

    expect(store.getState().increment).toBeTypeOf('function');
    store.getState().increment();
    expect(store.getState().count).toBe(1);
  });

  it('should create the base store when extensions are omitted', () => {
    const store = createAuthStore<BaseUserProfile>({
      ...baseConfig,
      persistName: 'base-auth',
    });

    expect(store.getState().status).toBe('unauthenticated');
    expect(store.getState().login).toBeTypeOf('function');
  });
});
