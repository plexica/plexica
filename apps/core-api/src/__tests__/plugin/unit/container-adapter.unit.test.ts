/**
 * T004-23 Unit Tests: DockerContainerAdapter
 *
 * Covers:
 *   - start(): calls createContainer with NetworkMode='plexica-plugins', memory/CPU limits
 *   - start(): pulls image when not present locally
 *   - start(): wraps docker errors
 *   - stop(): calls container.stop() and swallows "not running"/"No such container" errors
 *   - health(): maps Docker health status to adapter status ('healthy'/'unhealthy'/'starting')
 *   - health(): falls back to Running state when no health check configured
 *   - health(): returns 'unhealthy' when inspect throws
 *   - remove(): calls container.remove() and swallows "No such container"
 *
 * ADR-019: DockerContainerAdapter must use NetworkMode='plexica-plugins' (PLUGIN_NETWORK)
 * Constitution Art. 1.2 §4: Plugin isolation — no host network access
 * Constitution Art. 4.1: ≥80% coverage
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// vi.hoisted() — declare mocks that must be available inside vi.mock() factories
// vi.mock() calls are hoisted BEFORE variable declarations, so any variables
// referenced inside vi.mock() factories MUST be declared with vi.hoisted().
// ---------------------------------------------------------------------------

const {
  mockContainerStart,
  mockContainerStop,
  mockContainerRemove,
  mockContainerInspect,
  mockImageInspect,
  mockPull,
  mockFollowProgress,
  mockListNetworks,
  mockCreateNetwork,
  mockCreateContainer,
  mockContainer,
  mockDockerInstance,
} = vi.hoisted(() => {
  const mockContainerStart = vi.fn().mockResolvedValue(undefined);
  const mockContainerStop = vi.fn().mockResolvedValue(undefined);
  const mockContainerRemove = vi.fn().mockResolvedValue(undefined);
  const mockContainerInspect = vi.fn();
  const mockImageInspect = vi.fn();
  const mockPull = vi.fn();
  const mockFollowProgress = vi.fn();
  const mockListNetworks = vi.fn().mockResolvedValue([{ Name: 'plexica-plugins' }]);
  const mockCreateNetwork = vi.fn().mockResolvedValue(undefined);
  const mockCreateContainer = vi.fn();

  const mockContainer = {
    start: mockContainerStart,
    stop: mockContainerStop,
    remove: mockContainerRemove,
    inspect: mockContainerInspect,
  };

  const mockDockerInstance = {
    createContainer: mockCreateContainer,
    getContainer: vi.fn().mockReturnValue(mockContainer),
    getImage: vi.fn().mockReturnValue({ inspect: mockImageInspect }),
    pull: mockPull,
    modem: { followProgress: mockFollowProgress },
    listNetworks: mockListNetworks,
    createNetwork: mockCreateNetwork,
  };

  return {
    mockContainerStart,
    mockContainerStop,
    mockContainerRemove,
    mockContainerInspect,
    mockImageInspect,
    mockPull,
    mockFollowProgress,
    mockListNetworks,
    mockCreateNetwork,
    mockCreateContainer,
    mockContainer,
    mockDockerInstance,
  };
});

// ---------------------------------------------------------------------------
// Mock dockerode — must be a constructor function (not arrow fn) since
// DockerContainerAdapter does `new Dockerode(options)`.
// We return mockDockerInstance from the constructor so all method calls land
// on the shared mock object we can assert against.
// ---------------------------------------------------------------------------

vi.mock('dockerode', () => {
  function MockDockerode() {
    return mockDockerInstance;
  }
  MockDockerode.prototype = mockDockerInstance;
  return {
    default: MockDockerode,
  };
});

vi.mock('../../../lib/logger.js', () => {
  const childLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  return {
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnValue(childLogger),
    },
  };
});

// Import AFTER mocks are in place
import { DockerContainerAdapter } from '../../../lib/docker-container-adapter.js';
import type { ContainerConfig } from '../../../lib/container-adapter.js';
import { logger } from '../../../lib/logger.js';

/** Restore child() mock return value after vi.clearAllMocks() clears it */
function restoreLoggerChild() {
  const childLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  vi.mocked(logger.child).mockReturnValue(childLogger as any);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function buildConfig(overrides?: Partial<ContainerConfig>): ContainerConfig {
  return {
    image: 'plexica/plugin-analytics:1.0.0',
    env: { PLUGIN_ID: 'plugin-analytics' },
    ports: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests: start()
// ---------------------------------------------------------------------------

describe('DockerContainerAdapter.start()', () => {
  let adapter: DockerContainerAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    restoreLoggerChild();
    // Default: network already exists (no create needed)
    mockListNetworks.mockResolvedValue([{ Name: 'plexica-plugins' }]);
    // Default: image already present locally
    mockImageInspect.mockResolvedValue({});
    // Default: container created successfully
    mockCreateContainer.mockResolvedValue(mockContainer);
    mockContainerStart.mockResolvedValue(undefined);
    // Default: getContainer returns mockContainer
    mockDockerInstance.getContainer.mockReturnValue(mockContainer);
    mockDockerInstance.getImage.mockReturnValue({ inspect: mockImageInspect });
    adapter = new DockerContainerAdapter();
  });

  it('should call createContainer with NetworkMode="plexica-plugins" (ADR-019)', async () => {
    const config = buildConfig();
    await adapter.start('plugin-analytics', config);

    expect(mockCreateContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        HostConfig: expect.objectContaining({
          NetworkMode: 'plexica-plugins',
        }),
      })
    );
  });

  it('should NOT set NetworkMode="host" (plugin isolation — ADR-019, Constitution Art. 1.2 §4)', async () => {
    await adapter.start('plugin-analytics', buildConfig());

    const callArg = mockCreateContainer.mock.calls[0][0];
    expect(callArg.HostConfig?.NetworkMode).not.toBe('host');
  });

  it('should set Memory limit when resources.memory is provided', async () => {
    const config = buildConfig({ resources: { memory: '512m' } });
    await adapter.start('plugin-analytics', config);

    expect(mockCreateContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        HostConfig: expect.objectContaining({
          Memory: 512 * 1024 * 1024,
        }),
      })
    );
  });

  it('should set CpuPeriod and CpuQuota when resources.cpu is provided', async () => {
    const config = buildConfig({ resources: { cpu: '0.5' } });
    await adapter.start('plugin-analytics', config);

    expect(mockCreateContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        HostConfig: expect.objectContaining({
          CpuPeriod: 100_000,
          CpuQuota: 50_000, // 0.5 * 100_000
        }),
      })
    );
  });

  it('should call container.start() after createContainer', async () => {
    await adapter.start('plugin-analytics', buildConfig());
    expect(mockContainerStart).toHaveBeenCalledOnce();
  });

  it('should pull image when not present locally (inspect throws)', async () => {
    mockImageInspect.mockRejectedValueOnce(new Error('No such image'));
    // Mock pull to succeed
    mockPull.mockImplementation(
      (_image: string, cb: (err: Error | null, stream: NodeJS.ReadableStream) => void) => {
        const mockStream = {} as NodeJS.ReadableStream;
        cb(null, mockStream);
      }
    );
    mockFollowProgress.mockImplementation(
      (_stream: NodeJS.ReadableStream, cb: (err: Error | null) => void) => {
        cb(null);
      }
    );

    await adapter.start('plugin-analytics', buildConfig());

    expect(mockPull).toHaveBeenCalledWith('plexica/plugin-analytics:1.0.0', expect.any(Function));
    expect(mockContainerStart).toHaveBeenCalledOnce();
  });

  it('should create the plexica-plugins network when it does not exist', async () => {
    mockListNetworks.mockResolvedValueOnce([]); // network does not exist

    await adapter.start('plugin-analytics', buildConfig());

    expect(mockCreateNetwork).toHaveBeenCalledWith(
      expect.objectContaining({
        Name: 'plexica-plugins',
        Driver: 'bridge',
      })
    );
  });

  it('should wrap docker errors with a descriptive message', async () => {
    mockCreateContainer.mockRejectedValueOnce(new Error('Docker daemon not running'));

    await expect(adapter.start('plugin-analytics', buildConfig())).rejects.toThrow(
      'DockerContainerAdapter.start failed for plugin plugin-analytics'
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: stop()
// ---------------------------------------------------------------------------

describe('DockerContainerAdapter.stop()', () => {
  let adapter: DockerContainerAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    restoreLoggerChild();
    mockDockerInstance.getContainer.mockReturnValue(mockContainer);
    mockContainerStop.mockResolvedValue(undefined);
    adapter = new DockerContainerAdapter();
  });

  it('should call container.stop() with 10-second timeout', async () => {
    mockContainerStop.mockResolvedValue(undefined);
    await adapter.stop('plugin-analytics');
    expect(mockContainerStop).toHaveBeenCalledWith({ t: 10 });
  });

  it('should swallow "container already stopped" error', async () => {
    mockContainerStop.mockRejectedValueOnce(new Error('container already stopped'));
    await expect(adapter.stop('plugin-analytics')).resolves.not.toThrow();
  });

  it('should swallow "No such container" error', async () => {
    mockContainerStop.mockRejectedValueOnce(new Error('No such container'));
    await expect(adapter.stop('plugin-analytics')).resolves.not.toThrow();
  });

  it('should swallow "is not running" error', async () => {
    mockContainerStop.mockRejectedValueOnce(new Error('container is not running'));
    await expect(adapter.stop('plugin-analytics')).resolves.not.toThrow();
  });

  it('should rethrow unexpected docker errors', async () => {
    mockContainerStop.mockRejectedValueOnce(new Error('permission denied'));
    await expect(adapter.stop('plugin-analytics')).rejects.toThrow(
      'DockerContainerAdapter.stop failed for plugin plugin-analytics'
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: health()
// ---------------------------------------------------------------------------

describe('DockerContainerAdapter.health()', () => {
  let adapter: DockerContainerAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    restoreLoggerChild();
    mockDockerInstance.getContainer.mockReturnValue(mockContainer);
    adapter = new DockerContainerAdapter();
  });

  it('should return "healthy" when Docker health status is "healthy"', async () => {
    mockContainerInspect.mockResolvedValue({
      State: { Health: { Status: 'healthy' }, Running: true },
    });
    expect(await adapter.health('plugin-analytics')).toBe('healthy');
  });

  it('should return "starting" when Docker health status is "starting"', async () => {
    mockContainerInspect.mockResolvedValue({
      State: { Health: { Status: 'starting' }, Running: true },
    });
    expect(await adapter.health('plugin-analytics')).toBe('starting');
  });

  it('should return "unhealthy" when Docker health status is "unhealthy"', async () => {
    mockContainerInspect.mockResolvedValue({
      State: { Health: { Status: 'unhealthy' }, Running: true },
    });
    expect(await adapter.health('plugin-analytics')).toBe('unhealthy');
  });

  it('should return "healthy" when no health check configured and container is Running', async () => {
    mockContainerInspect.mockResolvedValue({
      State: { Running: true }, // No Health property
    });
    expect(await adapter.health('plugin-analytics')).toBe('healthy');
  });

  it('should return "unhealthy" when no health check configured and container is not Running', async () => {
    mockContainerInspect.mockResolvedValue({
      State: { Running: false },
    });
    expect(await adapter.health('plugin-analytics')).toBe('unhealthy');
  });

  it('should return "unhealthy" when inspect throws', async () => {
    mockContainerInspect.mockRejectedValueOnce(new Error('No such container'));
    expect(await adapter.health('plugin-analytics')).toBe('unhealthy');
  });
});

// ---------------------------------------------------------------------------
// Tests: remove()
// ---------------------------------------------------------------------------

describe('DockerContainerAdapter.remove()', () => {
  let adapter: DockerContainerAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    restoreLoggerChild();
    mockDockerInstance.getContainer.mockReturnValue(mockContainer);
    mockContainerRemove.mockResolvedValue(undefined);
    adapter = new DockerContainerAdapter();
  });

  it('should call container.remove() with force=true', async () => {
    mockContainerRemove.mockResolvedValue(undefined);
    await adapter.remove('plugin-analytics');
    expect(mockContainerRemove).toHaveBeenCalledWith({ force: true });
  });

  it('should swallow "No such container" error on remove', async () => {
    mockContainerRemove.mockRejectedValueOnce(new Error('No such container'));
    await expect(adapter.remove('plugin-analytics')).resolves.not.toThrow();
  });

  it('should rethrow unexpected errors on remove', async () => {
    mockContainerRemove.mockRejectedValueOnce(new Error('permission denied'));
    await expect(adapter.remove('plugin-analytics')).rejects.toThrow(
      'DockerContainerAdapter.remove failed for plugin plugin-analytics'
    );
  });
});
