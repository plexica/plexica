// create-auth-store-impl.ts
// The persist-wiring half of the auth store factory (split from
// create-auth-store.ts to satisfy Constitution Rule 4 — no file above
// 200 lines). Imports the public config types from create-auth-store.ts
// and builds the store from createAuthActions.

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { createAuthActions } from './create-auth-store-actions.js';
import {
  createRehydrationHandler,
  partializeAuthState,
} from './auth-store.js';

import type {
  AuthStoreConfig,
  BaseAuthActions,
  BaseAuthState,
} from './create-auth-store.js';
import type { BaseUserProfile } from './types.js';

export function createAuthStoreImpl<
  T extends BaseUserProfile,
  S extends object = object,
>(config: AuthStoreConfig<T, S>) {
  const {
    keycloakClient,
    redirectUri,
    realmResolver,
    decodeProfile,
    postLogoutUrlBuilder,
    persistName,
    partializeExtra,
    extraState,
    extraActions,
    onClearAuth,
  } = config;

  type StoreType = S & BaseAuthState<T> & BaseAuthActions;

  return create<StoreType>()(
    persist(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((set: any, get: any) => {
        const { clearedAuth, ...actions } = createAuthActions(set, get, {
          keycloakClient,
          redirectUri,
          realmResolver,
          decodeProfile,
          postLogoutUrlBuilder,
          onClearAuth,
        }) as {
          clearedAuth: BaseAuthState<T>;
          [key: string]: unknown;
        };
        return {
          ...clearedAuth,
          ...(extraState ?? {}),
          ...(extraActions ?? {}),
          ...actions,
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
      {
        name: persistName,
        storage: createJSONStorage(() => sessionStorage),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        partialize: ((state: any) => ({
          ...partializeAuthState(state),
          idToken: state.idToken,
          ...(partializeExtra?.(state as S) ?? {}),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        })) as any,
        onRehydrateStorage: createRehydrationHandler(),
      },
    ),
  );
}