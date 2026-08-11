/// <reference types="vite/client" />

// All VITE_* entries are optional: none of them is guaranteed to be injected at
// build time (no .env, no `define`, no CI export sets them for every build), and
// every consumer already applies a `??` fallback. Declaring them as required made
// those fallbacks unreachable for the type system, hiding real divergences.
//
// Optional at the TYPE level does not mean optional at RUNTIME. Values whose
// fallback is only safe in development (notably VITE_KEYCLOAK_URL) are asserted
// at module load when `import.meta.env.PROD` is true — see services/keycloak-auth.ts.
interface ImportMetaEnv {
  readonly VITE_PLUGIN_ASSET_ORIGIN?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_KEYCLOAK_URL?: string;
  readonly VITE_KEYCLOAK_CLIENT_ID?: string;
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
