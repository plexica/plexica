interface RuntimeConfig {
  CI_RUNTIME_CONTRACT?: string | undefined;
  KEYCLOAK_URL: string;
  KEYCLOAK_PUBLIC_ISSUER_BASE?: string | undefined;
  KEYCLOAK_HOST_ADMIN_BASE?: string | undefined;
  KEYCLOAK_CONTAINER_ADMIN_JWKS_BASE?: string | undefined;
  PLUGIN_CORE_API_URL: string;
  PLUGIN_DOCKER_NETWORK?: string | undefined;
  PLUGIN_RUNTIME_SCOPE?: string | undefined;
}

function host(url: string): string {
  return new URL(url).hostname;
}

function isLoopback(url: string): boolean {
  return ['127.0.0.1', 'localhost', '::1'].includes(host(url));
}

export function keycloakIssuerBase(config: RuntimeConfig): string {
  return config.KEYCLOAK_PUBLIC_ISSUER_BASE ?? config.KEYCLOAK_URL;
}

export function keycloakContainerBase(config: RuntimeConfig): string {
  return config.KEYCLOAK_CONTAINER_ADMIN_JWKS_BASE ?? config.KEYCLOAK_URL;
}

export function validateCiRuntimeContract(config: RuntimeConfig): void {
  if (config.CI_RUNTIME_CONTRACT !== '1') return;
  const issuer = config.KEYCLOAK_PUBLIC_ISSUER_BASE;
  if (!issuer || !isLoopback(issuer)) {
    throw new Error('CI runtime requires a loopback KEYCLOAK_PUBLIC_ISSUER_BASE');
  }
  if (config.KEYCLOAK_HOST_ADMIN_BASE !== issuer) {
    throw new Error('CI runtime host-admin base must equal the public issuer base');
  }
  if (config.KEYCLOAK_URL !== 'http://keycloak:8080') {
    throw new Error('CI runtime Core Keycloak calls must use http://keycloak:8080');
  }
  if (config.KEYCLOAK_CONTAINER_ADMIN_JWKS_BASE !== 'http://keycloak:8080') {
    throw new Error('CI runtime JWKS/Admin base must use http://keycloak:8080');
  }
  if (config.PLUGIN_CORE_API_URL !== 'http://core-api-e2e:3001') {
    throw new Error('CI runtime plugin Core URL must use core-api-e2e DNS');
  }
  if (!config.PLUGIN_RUNTIME_SCOPE || !config.PLUGIN_DOCKER_NETWORK) {
    throw new Error('CI runtime requires plugin scope and project network');
  }
}
