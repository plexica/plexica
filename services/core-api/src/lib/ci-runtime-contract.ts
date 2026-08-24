import { pluginRuntimeScope } from '../modules/plugin/services/plugin-runtime-scope.js';

interface RuntimeConfig {
  CI_RUNTIME_CONTRACT?: string | undefined;
  CI_RUNTIME_CONTRACT_CONTAINER?: string | undefined;
  CI_RUNTIME_PROJECT?: string | undefined;
  KEYCLOAK_URL: string;
  KEYCLOAK_PUBLIC_ISSUER_BASE?: string | undefined;
  KEYCLOAK_CONTAINER_ADMIN_JWKS_BASE?: string | undefined;
  KEYCLOAK_HOST_ADMIN_BASE?: string | undefined;
  PLUGIN_CORE_API_URL: string;
  KAFKA_BROKERS: string;
  MINIO_ENDPOINT: string;
  PLUGIN_DOCKER_NETWORK?: string | undefined;
  PLUGIN_DOCKER_HOST?: string | undefined;
  PLUGIN_RUNTIME_SCOPE?: string | undefined;
}

const KEYCLOAK_CONTAINER_BASE = 'http://keycloak:8080';
const PROJECT_ID_PATTERN = /^plexica-ci-[a-z0-9][a-z0-9-]{5,43}$/;
const HOST_LOOPBACK_LISTENER = /^127\.0\.0\.1:[1-9][0-9]*$/;

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

// Mode-agnostic: the JWT issuer is a browser-facing manifest loopback origin in
// both containerized Core and host-side provisioning CLIs.
function requireLoopbackIssuer(config: RuntimeConfig): void {
  const issuer = config.KEYCLOAK_PUBLIC_ISSUER_BASE;
  if (!issuer || !isLoopback(issuer)) {
    throw new Error('CI runtime requires a loopback KEYCLOAK_PUBLIC_ISSUER_BASE');
  }
}

// Container-only rules: every Core backchannel and plugin control plane rides
// the Compose DNS network; no host-loopback endpoint or Docker host socket is
// reachable or allowed inside the runtime.
function validateContainerContract(config: RuntimeConfig): void {
  if (config.KEYCLOAK_HOST_ADMIN_BASE !== undefined) {
    throw new Error('Containerized CI runtime Core must not receive KEYCLOAK_HOST_ADMIN_BASE');
  }
  if (config.KEYCLOAK_URL !== KEYCLOAK_CONTAINER_BASE) {
    throw new Error('CI runtime Core Keycloak calls must use http://keycloak:8080');
  }
  if (config.KEYCLOAK_CONTAINER_ADMIN_JWKS_BASE !== KEYCLOAK_CONTAINER_BASE) {
    throw new Error('CI runtime JWKS/Admin base must use http://keycloak:8080');
  }
  if (config.PLUGIN_CORE_API_URL !== 'http://core-api-e2e:3001') {
    throw new Error('CI runtime plugin Core URL must use core-api-e2e DNS');
  }
  const project = config.CI_RUNTIME_PROJECT;
  if (!project || !PROJECT_ID_PATTERN.test(project)) {
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

// Host-mode rules: host-side tenant-provisioning CLIs legitimately use the
// runner-loopback endpoints exported from host.env. Each mirrors a strict
// inspected 127.0.0.1 requirement enforced by ci-runtime-endpoint-contract.mjs
// on the host manifest itself, so a misrouted host process fails closed here.
function validateHostContract(config: RuntimeConfig): void {
  const adminBase = config.KEYCLOAK_HOST_ADMIN_BASE;
  if (
    adminBase === undefined ||
    !isLoopback(adminBase) ||
    adminBase !== config.KEYCLOAK_PUBLIC_ISSUER_BASE
  ) {
    throw new Error(
      'Host CI runtime requires a strict 127.0.0.1 KEYCLOAK_HOST_ADMIN_BASE matching KEYCLOAK_PUBLIC_ISSUER_BASE'
    );
  }
  if (!HOST_LOOPBACK_LISTENER.test(config.KAFKA_BROKERS)) {
    throw new Error('Host CI runtime requires KAFKA_BROKERS as a strict 127.0.0.1:<port> listener');
  }
  if (!isLoopback(config.MINIO_ENDPOINT)) {
    throw new Error(
      'Host CI runtime requires MINIO_ENDPOINT as a strict http://127.0.0.1:<port> endpoint'
    );
  }
}

export function validateCiRuntimeContract(config: RuntimeConfig): void {
  if (config.CI_RUNTIME_CONTRACT !== '1') return;
  requireLoopbackIssuer(config);
  if (config.CI_RUNTIME_CONTRACT_CONTAINER === '1') validateContainerContract(config);
  else validateHostContract(config);
}
