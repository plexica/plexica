import { parseRuntimeEndpoints } from '@plexica/auth/runtime-endpoints';

import type { RuntimeEndpoints, RuntimeConfig } from '@plexica/auth/runtime-endpoints';

export { parseRuntimeEndpoints } from '@plexica/auth/runtime-endpoints';

declare const __PLEXICA_CI_RUNTIME_CONTRACT__: boolean;

export type { RuntimeEndpoints } from '@plexica/auth/runtime-endpoints';

declare global {
  interface Window {
    __PLEXICA_RUNTIME_CONFIG__?: RuntimeConfig;
  }
}

export function runtimeEndpoints(): RuntimeEndpoints {
  const ciRuntime =
    typeof __PLEXICA_CI_RUNTIME_CONTRACT__ !== 'undefined' && __PLEXICA_CI_RUNTIME_CONTRACT__;
  const runtime = parseRuntimeEndpoints(window.__PLEXICA_RUNTIME_CONFIG__, ciRuntime);
  if (runtime) return runtime;
  const keycloakBase = import.meta.env.VITE_KEYCLOAK_URL;
  return { apiBase: import.meta.env.VITE_API_URL ?? '', ...(keycloakBase ? { keycloakBase } : {}) };
}
