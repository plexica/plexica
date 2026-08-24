import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  env: {} as Record<string, string | undefined>,
  stopBehavior: undefined as (() => unknown) | undefined,
  removeBehavior: undefined as (() => unknown) | undefined,
}));

vi.mock('../../lib/config.js', () => ({
  config: new Proxy(
    {},
    {
      get: (_target, key: string) => state.env[key],
    }
  ),
}));

vi.mock('../../modules/plugin/services/docker-container-restart.js', () => ({
  restartDockerContainer: vi.fn(),
}));

vi.mock('dockerode', () => ({
  default: class {
    getContainer() {
      return {
        inspect: async () => ({ State: { Running: true } }),
        stop: async () => {
          if (state.stopBehavior) return state.stopBehavior();
          return undefined;
        },
        remove: async () => {
          if (state.removeBehavior) return state.removeBehavior();
          return undefined;
        },
      };
    }
  },
}));

import { restartDockerContainer } from '../../modules/plugin/services/docker-container-restart.js';
import { DockerContainerManager } from '../../modules/plugin/services/container-manager.service.js';
import { CiPluginContractViolation } from '../../modules/plugin/services/plugin-container-contract.js';

const INSTALL_ID = '123e4567-e89b-42d3-a456-426614174000';
const violation = new CiPluginContractViolation(
  'CI plugin container has unsafe labels, host access, or port bindings'
);

beforeEach(() => {
  state.env = {};
  state.stopBehavior = undefined;
  state.removeBehavior = undefined;
  vi.mocked(restartDockerContainer).mockReset();
});

describe('restartContainer fault separation', () => {
  it('propagates a CI isolation violation untouched instead of wrapping it', async () => {
    vi.mocked(restartDockerContainer).mockRejectedValue(violation);
    const manager = new DockerContainerManager();
    await expect(manager.restartContainer(INSTALL_ID)).rejects.toBe(violation);
  });

  it('wraps a genuine Docker API fault as an unreachable backend', async () => {
    vi.mocked(restartDockerContainer).mockRejectedValue(new Error('socket hang up'));
    const manager = new DockerContainerManager();
    await expect(manager.restartContainer(INSTALL_ID)).rejects.toThrow(
      'backend is unreachable'
    );
  });
});

describe('stop cleanup tolerance', () => {
  it.each([304, 404])('treats Dockerode %i as a successful stop during cleanup', async (code) => {
    state.stopBehavior = () => {
      throw { statusCode: code };
    };
    const manager = new DockerContainerManager();
    await expect(manager.stopContainer(INSTALL_ID)).resolves.toBeUndefined();
    await expect(manager.removeContainer(INSTALL_ID)).resolves.toBeUndefined();
  });

  it.each([304, 404])('tolerates a message-less %i rejection on remove as well', async (code) => {
    state.removeBehavior = () => {
      throw { statusCode: code };
    };
    const manager = new DockerContainerManager();
    await expect(manager.removeContainer(INSTALL_ID)).resolves.toBeUndefined();
  });

  it('still propagates genuine Docker stop faults', async () => {
    state.stopBehavior = () => {
      throw { statusCode: 500, message: 'internal error' };
    };
    const manager = new DockerContainerManager();
    await expect(manager.stopContainer(INSTALL_ID)).rejects.toMatchObject({ statusCode: 500 });
  });
});
