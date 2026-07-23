import { config } from '../../../lib/config.js';

export function dockerRuntimeOptions(installId: string): {
  labels: Record<string, string>;
  hostConfig: { Binds?: string[]; NetworkMode?: string; ExtraHosts: string[] };
} {
  const caPath = config.PLUGIN_DB_SSL_ROOT_CERT_PATH;
  return {
    labels: {
      'io.plexica.installation': installId,
      ...(config.PLUGIN_RUNTIME_SCOPE
        ? { 'io.plexica.runtime-scope': config.PLUGIN_RUNTIME_SCOPE }
        : {}),
    },
    hostConfig: {
      ...(config.PLUGIN_DB_SSL_MODE === 'verify-full' && caPath
        ? { Binds: [`${caPath}:${caPath}:ro`] }
        : {}),
      ...(config.PLUGIN_DOCKER_NETWORK ? { NetworkMode: config.PLUGIN_DOCKER_NETWORK } : {}),
      ExtraHosts: ['host.docker.internal:host-gateway'],
    },
  };
}
