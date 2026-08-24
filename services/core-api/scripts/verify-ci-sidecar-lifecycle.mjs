import { randomUUID } from 'node:crypto';

import Docker from 'dockerode';

import { DockerContainerManager } from '../dist/modules/plugin/services/container-manager.service.js';
import { pluginContainerIdentity } from '../dist/modules/plugin/services/plugin-container-identity.js';

const image = process.env.CI_SIDECAR_HARNESS_IMAGE;
if (!image) throw new Error('CI_SIDECAR_HARNESS_IMAGE is required');

const installId = randomUUID();
const identity = pluginContainerIdentity(installId);
const manager = new DockerContainerManager();
const docker = new Docker({ protocol: 'http', host: 'plugin-docker-proxy', port: 2375 });
try {
  await manager.startContainer(installId, {
    slug: 'ci-sidecar-proof',
    name: 'CI sidecar proof',
    version: '1.0.0',
    description: 'Admitted CI sidecar lifecycle proof',
    author: 'Plexica',
    icon: 'Box',
    categories: [],
    hosting: { type: 'sidecar', image, port: 3000 },
    declaredTables: [],
  });
  const inspect = await docker.getContainer(identity.name).inspect();
  const endpoint = inspect.NetworkSettings.Networks?.[identity.network];
  if (
    Object.keys(inspect.NetworkSettings.Networks ?? {}).length !== 1 ||
    endpoint?.Aliases?.[0] !== identity.alias ||
    endpoint.Aliases?.length !== 1 ||
    inspect.Config.Labels?.['io.plexica.runtime-scope'] !==
      identity.labels['io.plexica.runtime-scope'] ||
    inspect.Config.Labels?.['io.plexica.installation'] !== installId ||
    inspect.Config.Labels?.['io.plexica.runtime-project'] !==
      identity.labels['io.plexica.runtime-project'] ||
    inspect.Config.Labels?.['com.docker.compose.project'] !==
      identity.labels['com.docker.compose.project'] ||
    Object.keys(inspect.Config.Labels ?? {}).length !== Object.keys(identity.labels).length ||
    inspect.HostConfig.Binds?.[0] !==
      '/etc/ssl/certs/ca-certificates.crt:/tmp/plexica-postgres-ca.crt:ro' ||
    Object.keys(inspect.HostConfig.PortBindings ?? {}).length ||
    Object.values(inspect.NetworkSettings.Ports ?? {}).some((value) => value !== null)
  )
    throw new Error('Real sidecar did not retain the CI network and port contract');
  const response = await globalThis.fetch(await manager.getContainerUrl(installId));
  if (response.status !== 200 || (await response.text()) !== 'sidecar-ok')
    throw new Error('Core could not proxy a request to the real sidecar');
} finally {
  await manager.removeContainer(installId).catch(() => undefined);
}
if ((await manager.getContainerStatus(installId)).state !== 'not_found')
  throw new Error('CI sidecar teardown is not isolated to its derived identity');
