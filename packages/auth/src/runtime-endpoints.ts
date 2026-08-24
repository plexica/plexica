export interface RuntimeEndpoints {
  apiBase: string;
  keycloakBase?: string;
}

export interface RuntimeConfig {
  apiBase?: unknown;
  keycloakBase?: unknown;
}

function safeKeycloakBase(value: unknown): value is string {
  try {
    const url = new URL(String(value));
    return (
      url.protocol === 'http:' &&
      url.hostname === '127.0.0.1' &&
      url.port !== '' &&
      url.pathname === '/' &&
      url.search === '' &&
      url.hash === '' &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function parseRuntimeEndpoints(
  value: RuntimeConfig | undefined,
  ciRuntime = false
): RuntimeEndpoints | undefined {
  if (!ciRuntime) return undefined;
  if (value === undefined) {
    throw new Error('CI runtime configuration is required');
  }
  if (value.apiBase !== '' || !safeKeycloakBase(value.keycloakBase)) {
    throw new Error(
      'CI runtime configuration requires an empty same-origin apiBase and public Keycloak base'
    );
  }
  return { apiBase: '', keycloakBase: value.keycloakBase };
}
