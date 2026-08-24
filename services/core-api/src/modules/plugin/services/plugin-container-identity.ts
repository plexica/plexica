import { createHash } from 'node:crypto';

import { config } from '../../../lib/config.js';

import { pluginRuntimeScope } from './plugin-runtime-scope.js';

export interface PluginContainerIdentity {
  name: string;
  alias: string;
  network: string;
  labels: Record<string, string>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCOPE = /^[a-z0-9][a-z0-9-]{0,30}$/;
const PORT = /^[0-9]{1,5}$/;

export function pluginContainerIdentity(
  installId: string,
  scope = config.PLUGIN_RUNTIME_SCOPE ?? 'local',
  network = config.PLUGIN_DOCKER_NETWORK
): PluginContainerIdentity {
  if (!UUID.test(installId)) throw new Error('Plugin installation ID must be a UUID');
  if (!SCOPE.test(scope)) throw new Error('Plugin runtime scope must be a bounded DNS label');
  if (config.CI_RUNTIME_CONTRACT === '1') {
    if (
      !config.CI_RUNTIME_PROJECT ||
      scope !== pluginRuntimeScope(config.CI_RUNTIME_PROJECT) ||
      network !== `${config.CI_RUNTIME_PROJECT}_default`
    ) {
      throw new Error('CI plugin scope and network must match the immutable project ID');
    }
  }
  const digest = createHash('sha256').update(installId).digest('hex').slice(0, 16);
  const name = `plexica-plugin-${scope}-${digest}`;
  return {
    name,
    alias: name,
    network: network ?? 'bridge',
    labels: {
      'io.plexica.installation': installId,
      'io.plexica.runtime-scope': scope,
      ...(config.CI_RUNTIME_CONTRACT === '1'
        ? {
            // Dockerode-created sidecars carry no compose-managed metadata,
            // so ownership must be stamped explicitly for teardown/diagnostic
            // selectors (com.docker.compose.project is kept for parity).
            'io.plexica.runtime-project': config.CI_RUNTIME_PROJECT ?? '',
            'com.docker.compose.project': config.CI_RUNTIME_PROJECT ?? '',
          }
        : {}),
    },
  };
}

export function isCiPluginRuntime(): boolean {
  return config.CI_RUNTIME_CONTRACT === '1';
}

export function assertCiPluginTarget(
  installId: string,
  target: string,
  expectedPort?: number
): void {
  if (!isCiPluginRuntime()) return;
  const parsed = new URL(target);
  const port = Number(parsed.port);
  // SSRF gate: the target must be exactly the derived sidecar alias with an
  // explicit, bounded TCP port (and the manifest port when one is known).
  if (!PORT.test(parsed.port) || port < 1 || port > 65535) {
    throw new Error('CI plugin targets must use an explicit sidecar TCP port');
  }
  if (expectedPort !== undefined && port !== expectedPort) {
    throw new Error('CI plugin target port does not match the installation manifest');
  }
  const identity = pluginContainerIdentity(installId);
  if (parsed.hostname !== identity.alias || parsed.protocol !== 'http:' || parsed.username || parsed.password) {
    throw new Error('CI plugin targets must use the derived sidecar alias');
  }
}
