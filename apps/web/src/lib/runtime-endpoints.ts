export interface RuntimeEndpoints { apiBase: string; keycloakBase?: string; }

interface RuntimeConfig { apiBase?: unknown; keycloakBase?: unknown; }

function unsafeApiBase(value: string): boolean {
  return value === '/api' || value.startsWith('http:') || value.startsWith('https:') ||
    /(localhost|127\.0\.0\.1|host\.docker\.internal|core-api|keycloak)/.test(value);
}

export function parseRuntimeEndpoints(value: RuntimeConfig | undefined): RuntimeEndpoints | undefined {
  if (value === undefined) return undefined;
  if (value.apiBase !== '' || typeof value.keycloakBase !== 'string' || unsafeApiBase(String(value.apiBase))) {
    throw new Error('CI runtime configuration requires an empty same-origin apiBase and public Keycloak base');
  }
  return { apiBase: '', keycloakBase: value.keycloakBase };
}

declare global { interface Window { __PLEXICA_RUNTIME_CONFIG__?: RuntimeConfig; } }

export function runtimeEndpoints(): RuntimeEndpoints {
  const runtime = parseRuntimeEndpoints(window.__PLEXICA_RUNTIME_CONFIG__);
  if (runtime) return runtime;
  const keycloakBase = import.meta.env.VITE_KEYCLOAK_URL;
  return { apiBase: import.meta.env.VITE_API_URL ?? '', ...(keycloakBase ? { keycloakBase } : {}) };
}
