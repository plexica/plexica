/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PLUGIN_ASSET_ORIGIN?: string;
  readonly VITE_API_URL: string;
  readonly VITE_KEYCLOAK_URL: string;
  readonly VITE_KEYCLOAK_CLIENT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'virtual:__federation__' {
  import type { ComponentType } from 'react';

  export function __federation_method_setRemote(
    name: string,
    config: { url: string; format: 'esm'; from: 'vite' },
  ): void;
  export function __federation_method_getRemote(
    name: string,
    exposedPath: string,
  ): Promise<{ default?: ComponentType<Record<string, unknown>> }>;
  export function __federation_method_unwrapDefault<T>(module: T): Promise<T>;
}
