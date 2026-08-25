import { config } from '../../../lib/config.js';

import { PLUGIN_CONTAINER_CA_PATH } from './plugin-db-credentials.js';
import { isCiPluginRuntime } from './plugin-container-identity.js';

import type { PluginContainerIdentity } from './plugin-container-identity.js';

interface ContainerInspection {
  Name?: string;
  Config: { Labels?: Record<string, string>; Env?: string[] };
  HostConfig: { PortBindings?: Record<string, unknown>; ExtraHosts?: string[]; Binds?: string[] | undefined };
  NetworkSettings: {
    Ports?: Record<string, unknown>;
    Networks?: Record<string, { Aliases?: string[] }>;
  };
}

/**
 * Thrown when an inspected sidecar violates the CI isolation contract.
 * Callers must propagate it untouched — it is a security fault, not a
 * Docker availability fault.
 */
export class CiPluginContractViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CiPluginContractViolation';
  }
}

export function assertCiPluginContainer(
  identity: PluginContainerIdentity,
  inspect: ContainerInspection,
  enforce = isCiPluginRuntime()
): void {
  if (!enforce) return;
  const networks = inspect.NetworkSettings.Networks ?? {};
  const endpoint = networks[identity.network];
  const labels = inspect.Config.Labels ?? {};
  // Fail closed on ANY extra host mapping: docker-runtime-options adds
  // ExtraHosts only outside CI, so a CI sidecar carrying one (host-gateway,
  // host.docker.internal, or an arbitrary IP pin) is a host-access fault.
  // PublishAllPorts needs no separate check: any publication materializes as
  // non-null NetworkSettings.Ports bindings, rejected below.
  const hasExtraHosts = (inspect.HostConfig.ExtraHosts ?? []).length > 0;
  const hasHostEndpoint = (inspect.Config.Env ?? []).some((entry) =>
    /(?:localhost|127\.0\.0\.1|host\.docker\.internal|host-gateway)/i.test(entry)
  );
  const expectedBind = `${config.PLUGIN_DB_SSL_ROOT_CERT_PATH}:${PLUGIN_CONTAINER_CA_PATH}:ro`;
  if (inspect.Name && inspect.Name !== `/${identity.name}`) {
    throw new CiPluginContractViolation('CI plugin container name does not match its identity');
  }
  if (
    Object.keys(networks).length !== 1 ||
    endpoint?.Aliases?.length !== 1 ||
    endpoint.Aliases[0] !== identity.alias
  ) {
    throw new CiPluginContractViolation('CI plugin container has an invalid network or alias');
  }
  if (
    labels['io.plexica.runtime-scope'] !== identity.labels['io.plexica.runtime-scope'] ||
    labels['io.plexica.installation'] !== identity.labels['io.plexica.installation'] ||
    labels['io.plexica.runtime-project'] !== identity.labels['io.plexica.runtime-project'] ||
    labels['com.docker.compose.project'] !== identity.labels['com.docker.compose.project'] ||
    Object.keys(labels).length !== Object.keys(identity.labels).length ||
    Object.keys(inspect.HostConfig.PortBindings ?? {}).length > 0 ||
    Object.values(inspect.NetworkSettings.Ports ?? {}).some((bindings) => bindings !== null) ||
    (config.PLUGIN_DB_SSL_MODE === 'verify-full' &&
      ((inspect.HostConfig.Binds ?? []).length !== 1 ||
        inspect.HostConfig.Binds?.[0] !== expectedBind)) ||
    hasExtraHosts ||
    hasHostEndpoint
  ) {
    throw new CiPluginContractViolation(
      'CI plugin container has unsafe labels, host access, or port bindings'
    );
  }
}
