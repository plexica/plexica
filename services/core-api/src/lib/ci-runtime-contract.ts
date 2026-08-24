import { pluginRuntimeScope } from '../modules/plugin/services/plugin-runtime-scope.js';

interface RuntimeConfig {
  CI_RUNTIME_CONTRACT?: string | undefined;
  CI_RUNTIME_PROJECT?: string | undefined;
  KEYCLOAK_URL: string;
  KEYCLOAK_PUBLIC_ISSUER_BASE?: string | undefined;
  KEYCLOAK_CONTAINER_ADMIN_JWKS_BASE?: string | undefined;
  KEYCLOAK_HOST_ADMIN_BASE?: string | undefined;
  PLUGIN_CORE_API_URL: string;
  PLUGIN_DOCKER_NETWORK?: string | undefined;
  PLUGIN_DOCKER_HOST?: string | undefined;
  PLUGIN_RUNTIME_SCOPE?: string | undefined;
}

function isLoopback(url: string): boolean {
  const parsed = new URL(url);
  return parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1' && parsed.port !== '';
}

export function keycloakIssuerBase(config: RuntimeConfig): string {
  return config.KEYCLOAK_PUBLIC_ISSUER_BASE ?? config.KEYCLOAK_URL;
}

export function keycloakContainerBase(config: RuntimeConfig): string {
  return config.KEYCLOAK_CONTAINER_ADMIN_JWKS_BASE ?? config.KEYCLOAK_URL;
}

export function validateCiRuntimeContract(config: RuntimeConfig): void {
  if (config.CI_RUNTIME_CONTRACT !== '1') return;
  if (config.KEYCLOAK_HOST_ADMIN_BASE !== undefined) {
    throw new Error('CI runtime Core must not receive KEYCLOAK_HOST_ADMIN_BASE');
  }
  const issuer = config.KEYCLOAK_PUBLIC_ISSUER_BASE;
  if (!issuer || !isLoopback(issuer)) {
    throw new Error('CI runtime requires a loopback KEYCLOAK_PUBLIC_ISSUER_BASE');
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
  const project = config.CI_RUNTIME_PROJECT;
  if (!project || !/^plexica-ci-[a-z0-9][a-z0-9-]{5,43}$/.test(project)) {
    throw new Error('CI runtime requires a validated immutable project ID');
  }
  if (
    config.PLUGIN_RUNTIME_SCOPE !== pluginRuntimeScope(project) ||
    config.PLUGIN_DOCKER_NETWORK !== `${project}_default`
  ) {
    throw new Error('CI runtime plugin scope and network must match the immutable project ID');
  }
  if (config.PLUGIN_DOCKER_HOST !== 'http://plugin-docker-proxy:2375') {
    throw new Error('CI runtime plugin Docker control must use the private proxy');
  }
}
