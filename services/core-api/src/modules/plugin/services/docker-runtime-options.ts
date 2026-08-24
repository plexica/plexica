import { config } from '../../../lib/config.js';

import { PLUGIN_CONTAINER_CA_PATH } from './plugin-db-credentials.js';
import { isCiPluginRuntime, pluginContainerIdentity } from './plugin-container-identity.js';

export function dockerRuntimeOptions(installId: string): {
  labels: Record<string, string>;
  hostConfig: { Binds?: string[]; NetworkMode?: string; ExtraHosts?: string[] };
} {
  const caPath = config.PLUGIN_DB_SSL_ROOT_CERT_PATH;
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
