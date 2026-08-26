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

import { assertCiPluginContainer } from '../../modules/plugin/services/plugin-container-contract.js';
import { pluginContainerIdentity } from '../../modules/plugin/services/plugin-container-identity.js';
import { pluginRuntimeScope } from '../../modules/plugin/services/plugin-runtime-scope.js';

const INSTALL_ID = '123e4567-e89b-42d3-a456-426614174000';
const PROJECT = 'plexica-ci-identity-123456789012345678901234';

beforeEach(() => {
  state.env = {};
});

describe('plugin CI container identity', () => {
  it('preserves the legacy installId container name outside the CI contract', () => {
    const identity = pluginContainerIdentity(INSTALL_ID, 'local', 'local_default');
    expect(identity.name).toBe(`plexica-plugin-${INSTALL_ID}`);
    expect(identity.labels['io.plexica.runtime-scope']).toBe('local');
  });
  it('rejects a non-UUID installation ID', () => {
    expect(() => pluginContainerIdentity('not-a-uuid', 'local', 'local_default')).toThrow('UUID');
  });
  it('keeps a long project identity within Docker DNS limits', () => {
    state.env = {
      CI_RUNTIME_CONTRACT: '1',
      CI_RUNTIME_PROJECT: PROJECT,
      PLUGIN_RUNTIME_SCOPE: pluginRuntimeScope(PROJECT),
      PLUGIN_DOCKER_NETWORK: `${PROJECT}_default`,
    };
    const identity = pluginContainerIdentity(INSTALL_ID);
    expect(identity.alias).toHaveLength(63);
  });

  describe('CI isolation guards', () => {
    beforeEach(() => {
      state.env = {
        CI_RUNTIME_CONTRACT: '1',
        CI_RUNTIME_PROJECT: PROJECT,
        PLUGIN_RUNTIME_SCOPE: pluginRuntimeScope(PROJECT),
        PLUGIN_DOCKER_NETWORK: `${PROJECT}_default`,
      };
    });

    it('rejects a container outside the immutable project network', () => {
      expect(() =>
        pluginContainerIdentity(INSTALL_ID, pluginRuntimeScope(PROJECT), `${PROJECT}_other`)
      ).toThrow('CI plugin scope and network must match the immutable project ID');
    });

    it('stamps an explicit runtime-project ownership label for teardown selectors', () => {
      const identity = pluginContainerIdentity(INSTALL_ID);
      expect(identity.labels['io.plexica.runtime-project']).toBe(PROJECT);
      expect(identity.labels['com.docker.compose.project']).toBe(PROJECT);
    });

    it('omits ownership labels outside the CI runtime contract', () => {
      state.env = {};
      const identity = pluginContainerIdentity(INSTALL_ID, 'local', 'local_default');
      expect(identity.labels['io.plexica.runtime-project']).toBeUndefined();
      expect(identity.labels['com.docker.compose.project']).toBeUndefined();
    });

    it('rejects a runtime scope that is not a bounded DNS label', () => {
      expect(() => pluginContainerIdentity(INSTALL_ID, 'Bad_Scope!', `${PROJECT}_default`)).toThrow(
        'Plugin runtime scope must be a bounded DNS label'
      );
    });

    it('rejects an inspected sidecar that publishes host port bindings', () => {
      const identity = pluginContainerIdentity(INSTALL_ID);
      const inspected = {
        Name: `/${identity.name}`,
        Config: { Labels: identity.labels, Env: [] },
        HostConfig: { PortBindings: { '3000/tcp': [{ HostPort: '32000' }] }, ExtraHosts: [] },
        NetworkSettings: {
          Ports: {},
          Networks: { [`${PROJECT}_default`]: { Aliases: [identity.alias] } },
        },
      };
      expect(() => assertCiPluginContainer(identity, inspected)).toThrow(
        'CI plugin container has unsafe labels, host access, or port bindings'
      );
    });
  });
});
