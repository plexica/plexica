import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ env: {} as Record<string, string | undefined> }));

vi.mock('../../lib/config.js', () => ({
  config: new Proxy(
    {},
    {
      get: (_target, key: string) => state.env[key],
    }
  ),
}));

import { restartDockerContainer } from '../../modules/plugin/services/docker-container-restart.js';
import { pluginContainerIdentity } from '../../modules/plugin/services/plugin-container-identity.js';
import { pluginRuntimeScope } from '../../modules/plugin/services/plugin-runtime-scope.js';

const INSTALL_ID = '123e4567-e89b-42d3-a456-426614174000';
const PROJECT = 'plexica-ci-restart-12345678901234567890123456';

function ciEnv(): Record<string, string> {
  return {
    CI_RUNTIME_CONTRACT: '1',
    CI_RUNTIME_PROJECT: PROJECT,
    PLUGIN_RUNTIME_SCOPE: pluginRuntimeScope(PROJECT),
    PLUGIN_DOCKER_NETWORK: `${PROJECT}_default`,
    PLUGIN_DB_SSL_MODE: 'verify-full',
    PLUGIN_DB_SSL_ROOT_CERT_PATH: '/run/plexica-ci-plexica-ci-restart-12345678901234567890123456/postgres-ca.crt',
    CI_RUNTIME_CA_FILE: '/run/plexica-ci-plexica-ci-restart-12345678901234567890123456/postgres-ca.crt',
    PLUGIN_SIDECAR_IMAGE:
      'node:24-bookworm@sha256:' + 'a'.repeat(64),
    CI_SIDECAR_HARNESS_IMAGE:
      'plexica-ci-sidecar-harness@sha256:' + 'b'.repeat(64),
  };
}

function inspection(alias: string): Record<string, unknown> {
  const identity = pluginContainerIdentity(INSTALL_ID);
  return {
    Name: `/${identity.name}`,
    Config: { Labels: identity.labels, Env: [], Image: state.env.PLUGIN_SIDECAR_IMAGE },
    HostConfig: {
      PortBindings: {},
      ExtraHosts: [],
      Binds: ['/run/plexica-ci-plexica-ci-restart-12345678901234567890123456/postgres-ca.crt:/tmp/plexica-postgres-ca.crt:ro'],
    },
    NetworkSettings: {
      Ports: { '3000/tcp': null },
      Networks: { [`${PROJECT}_default`]: { Aliases: [alias] } },
    },
  };
}

class FakeDocker {
  removals: Array<Record<string, unknown>> = [];
  constructor(
    private readonly existingAlias: string,
    private readonly replacementAlias: string
  ) {}
  getContainer() {
    const self = this;
    return {
      inspect: async () => inspection(this.existingAlias),
      stop: async () => undefined,
      remove: async (options: Record<string, unknown>) => {
        self.removals.push(options);
      },
    };
  }
  createContainer() {
    const self = this;
    return {
      start: async () => undefined,
      inspect: async () => inspection(this.replacementAlias),
      remove: async (options: Record<string, unknown>) => {
        self.removals.push(options);
      },
    };
  }
}

describe('restartDockerContainer replacement cleanup', () => {
  beforeEach(() => {
    state.env = ciEnv();
  });

  it('force-removes a failed replacement before propagating the contract error', async () => {
    const docker = new FakeDocker(
      pluginContainerIdentity(INSTALL_ID).alias,
      'rogue-alias'
    );
    await expect(
      restartDockerContainer(docker as never, INSTALL_ID, { FOO: 'bar' })
    ).rejects.toThrow(/invalid network or alias/);
    // First removal: the old container before replacement. Second: the rogue
    // replacement force-removed instead of leaking as a persistent sidecar.
    expect(docker.removals).toEqual([{ force: true }, { force: true, v: true }]);
  });

  it('keeps a compliant replacement and never removes it', async () => {
    const alias = pluginContainerIdentity(INSTALL_ID).alias;
    const docker = new FakeDocker(alias, alias);
    await expect(
      restartDockerContainer(docker as never, INSTALL_ID, { FOO: 'bar' })
    ).resolves.toBeUndefined();
    // Only the pre-replacement removal of the old container; the compliant
    // replacement is never removed.
    expect(docker.removals).toEqual([{ force: true }]);
  });
});
