import { createHash } from 'node:crypto';

import { config } from '../../../lib/config.js';

export interface PluginContainerIdentity {
  name: string;
  alias: string;
  network: string;
  labels: Record<string, string>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCOPE = /^[a-z0-9][a-z0-9-]{0,30}$/;

export function pluginContainerIdentity(
  installId: string,
  scope = config.PLUGIN_RUNTIME_SCOPE ?? 'local',
  network = config.PLUGIN_DOCKER_NETWORK
): PluginContainerIdentity {
  if (!UUID.test(installId)) throw new Error('Plugin installation ID must be a UUID');
  if (!SCOPE.test(scope)) throw new Error('Plugin runtime scope must be a bounded DNS label');
  if (config.CI_RUNTIME_CONTRACT === '1' && network !== `${scope}_default`) {
    throw new Error('CI plugin network must be the project default network');
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
    },
  };
}

export function isCiPluginRuntime(): boolean {
  return config.CI_RUNTIME_CONTRACT === '1';
}

export function assertCiPluginTarget(installId: string, target: string): void {
  if (!isCiPluginRuntime()) return;
  const parsed = new URL(target);
  const identity = pluginContainerIdentity(installId);
  if (parsed.hostname !== identity.alias || parsed.protocol !== 'http:') {
    throw new Error('CI plugin targets must use the derived sidecar alias');
  }
}
