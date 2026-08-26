import { vi, describe, expect, it } from 'vitest';

const captured = vi.hoisted((): { options?: Record<string, unknown> } => ({}));
const project = 'plexica-ci-payload-123456';
const installId = '123e4567-e89b-42d3-a456-426614174000';
const scope = 'ci-9f506ddf46183a7e0386aad902ed';
const name = 'plexica-plugin-ci-9f506ddf46183a7e0386aad902ed-320159ebe3219112';
const pinnedImage =
  'node:24-bookworm@sha256:934240a162082fd8b8a2f90cd5114446443f1eba1c5378f6687167ca405e6584';

vi.mock('../../lib/config.js', () => ({
  config: {
    CI_RUNTIME_CONTRACT: '1',
    CI_RUNTIME_PROJECT: 'plexica-ci-payload-123456',
    PLUGIN_DOCKER_NETWORK: 'plexica-ci-payload-123456_default',
    PLUGIN_RUNTIME_SCOPE: 'ci-9f506ddf46183a7e0386aad902ed',
    PLUGIN_DOCKER_HOST: undefined,
    PLUGIN_SIDECAR_IMAGE:
      'node:24-bookworm@sha256:934240a162082fd8b8a2f90cd5114446443f1eba1c5378f6687167ca405e6584',
    CI_SIDECAR_HARNESS_IMAGE:
      'plexica-ci-sidecar-harness@sha256:' + 'b'.repeat(64),
    PLUGIN_DB_SSL_MODE: 'verify-full',
    PLUGIN_DB_SSL_ROOT_CERT_PATH: '/run/plexica-ci/postgres-ca.crt',
    CI_RUNTIME_CA_FILE: '/run/plexica-ci/postgres-ca.crt',
  },
}));
vi.mock('dockerode', () => ({
  default: class Docker {
    getImage() { return { inspect: async () => ({}) }; }
    createContainer(options: Record<string, unknown>) {
      captured.options = options;
      const body = options['_body'] as Record<string, unknown>;
      return {
        id: 'container',
        start: async () => undefined,
        inspect: async () => ({
          Name: `/${name}`,
          Config: {
            Labels: body['Labels'],
            Env: [],
          },
          HostConfig: {
            Binds: (body['HostConfig'] as { Binds?: string[] } | undefined)?.Binds,
            PortBindings: {}, ExtraHosts: [],
          },
          NetworkSettings: {
            Ports: { '3000/tcp': null },
            Networks: { [`${project}_default`]: { Aliases: [name] } },
          },
        }),
      };
    }
  },
}));

import { DockerContainerManager } from '../../modules/plugin/services/container-manager.service.js';

describe('CI manager-to-proxy create payload', () => {
  it('splits name and payload onto the strict proxy wire contract', async () => {
    await new DockerContainerManager().startContainer(installId, {
      slug: 'payload-proof', name: 'Payload proof', version: '1.0.0', description: 'proof',
      author: 'Plexica', icon: 'Box', categories: [], declaredTables: [],
      hosting: { type: 'sidecar', image: 'plexica/payload-proof:1', port: 3000 },
    });

    // docker-modem echoes plain options into BOTH the query string and the
    // body; the proxy admits exactly one query param and no `name` body key.
    expect(captured.options?.['_query']).toEqual({ name });
    const body = captured.options?.['_body'] as Record<string, unknown>;
    expect(body['name']).toBeUndefined();
    expect(body).toMatchObject({
      Image: pinnedImage,
      Labels: {
        'io.plexica.installation': installId,
        'io.plexica.runtime-scope': scope,
        'io.plexica.runtime-project': project,
        'com.docker.compose.project': project,
      },
      HostConfig: {
        NetworkMode: `${project}_default`,
        Binds: ['/run/plexica-ci/postgres-ca.crt:/tmp/plexica-postgres-ca.crt:ro'],
      },
      NetworkingConfig: { EndpointsConfig: { [`${project}_default`]: { Aliases: [name] } } },
    });
  });

  it('resolves harness-marked installs to the CI harness image in the create payload', async () => {
    const harnessImage = 'plexica-ci-sidecar-harness@sha256:' + 'b'.repeat(64);
    await new DockerContainerManager().startContainer(installId, {
      slug: 'ci-sidecar-proof', name: 'CI sidecar proof', version: '1.0.0', description: 'proof',
      author: 'Plexica', icon: 'Box', categories: [], declaredTables: [],
      hosting: { type: 'sidecar', image: harnessImage, port: 3000 },
    });
    expect((captured.options?.['_body'] as Record<string, unknown>)['Image']).toBe(harnessImage);
  });
});
