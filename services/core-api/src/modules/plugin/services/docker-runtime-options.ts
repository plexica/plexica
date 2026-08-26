import { config } from '../../../lib/config.js';

import { PLUGIN_CONTAINER_CA_PATH } from './plugin-db-credentials.js';
import { isCiPluginRuntime, pluginContainerIdentity } from './plugin-container-identity.js';

// Host-side source of the single allowed CA bind. Under the CI contract the
// project CA is mounted at CI_RUNTIME_CA_FILE (validated fail-closed by the
// runtime contract); host-run production E2E falls back to the configured
// root cert path, which is then already a daemon-visible host path.
function caBindSource(): string | undefined {
  return config.CI_RUNTIME_CA_FILE ?? config.PLUGIN_DB_SSL_ROOT_CERT_PATH;
}

export function dockerRuntimeOptions(installId: string): {
  labels: Record<string, string>;
  hostConfig: { Binds?: string[]; NetworkMode?: string; ExtraHosts?: string[] };
} {
  const caPath = caBindSource();
  const identity = pluginContainerIdentity(installId);
  return {
    labels: identity.labels,
    hostConfig: {
      ...(config.PLUGIN_DB_SSL_MODE === 'verify-full' && caPath
        ? { Binds: [`${caPath}:${PLUGIN_CONTAINER_CA_PATH}:ro`] }
        : {}),
      NetworkMode: identity.network,
        ...(isCiPluginRuntime() ? {} : { ExtraHosts: ['host.docker.internal:host-gateway'] }),
    },
  };
}
