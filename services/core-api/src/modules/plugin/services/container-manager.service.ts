// services/container-manager.service.ts
// Strategy pattern: Docker sidecar (dev/CI) + Kubernetes (prod).
// Dev mode (§10.7) bypasses containers entirely — uses local processes.

import { config } from '../../../lib/config.js';
import { PluginInstallError, PluginBackendUnreachableError } from '../errors.js';

import type { Manifest } from '../schema/manifest.js';

export interface ContainerInfo {
  containerId: string;
  port: number;
  startedAt: Date;
}

export type ContainerState = 'running' | 'stopped' | 'not_found';
export type HealthStatus = 'healthy' | 'degraded' | 'unreachable';

export interface ContainerStatus {
  state: ContainerState;
  health: HealthStatus;
  startedAt?: Date;
  port?: number;
}

// Track plugin ports per installId (set at container creation, used in status lookups)
const pluginPorts = new Map<string, number>();

// Store port for later use by getContainerStatus
function setPluginPort(installId: string, port: number): void {
  pluginPorts.set(installId, port);
}

function getPluginPort(installId: string): number | undefined {
  return pluginPorts.get(installId);
}

export interface ContainerManager {
  startContainer(installId: string, manifest: Manifest): Promise<ContainerInfo>;
  stopContainer(installId: string): Promise<void>;
  getContainerStatus(installId: string): Promise<ContainerStatus>;
  restartContainer(installId: string): Promise<void>;
}

/**
 * Docker sidecar implementation using dockerode.
 * Used in dev / single-node CI environments.
 * Port allocation: OS-assigned random port via -p 0:3000.
 */
export class DockerContainerManager implements ContainerManager {
  private docker: import('dockerode');

  constructor() {
    // Lazy-import dockerode — it's a native dependency
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Docker = require('dockerode');
    this.docker = new Docker();
  }

  async startContainer(installId: string, manifest: Manifest): Promise<ContainerInfo> {
    const containerName = `plexica-plugin-${installId}`;
    const image = manifest.hosting.image;

    // Ensure image is pulled
    try {
      await this.docker.pull(image);
    } catch {
      throw new PluginInstallError(`Failed to pull image "${image}". Check registry credentials.`);
    }

    // Create and start container with random host port
    const container = await this.docker.createContainer({
      name: containerName,
      Image: image,
      ExposedPorts: { [`${manifest.hosting.port}/tcp`]: {} },
      HostConfig: {
        PortBindings: { [`${manifest.hosting.port}/tcp`]: [{ HostPort: '0' }] },
        RestartPolicy: { Name: 'unless-stopped' },
        // Resource limits from manifest
        ...(manifest.hosting.resources
          ? {
              ...(manifest.hosting.resources.memory ? { MemoryReservation: parseMemory(manifest.hosting.resources.memory) } : {}),
              ...(manifest.hosting.resources.cpu ? { NanoCpus: parseCpu(manifest.hosting.resources.cpu) } : {}),
            }
          : {}),
      },
    });

    await container.start();

    // Inspect to get the mapped port
    const inspect = await container.inspect();
    const portBinding = inspect.NetworkSettings.Ports?.[`${manifest.hosting.port}/tcp`]?.[0];
    const port = portBinding ? parseInt(portBinding.HostPort, 10) : manifest.hosting.port;

    // Store the port for later use by getContainerStatus
    setPluginPort(installId, port);

    return {
      containerId: container.id,
      port,
      startedAt: new Date(),
    };
  }

  async stopContainer(installId: string): Promise<void> {
    try {
      const container = this.docker.getContainer(`plexica-plugin-${installId}`);
      await container.stop({ t: 10 }); // 10s timeout for graceful stop
    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? '';
      // Ignore "already stopped" or "not found" errors
      if (!msg.includes('already stopped') && !msg.includes('not found')) {
        throw err;
      }
    } finally {
      clearPluginPort(installId);
    }
  }

  async getContainerStatus(installId: string): Promise<ContainerStatus> {
    try {
      const container = this.docker.getContainer(`plexica-plugin-${installId}`);
      const inspect = await container.inspect();

      const state: ContainerState = inspect.State.Running ? 'running' : 'stopped';
      const health: HealthStatus =
        inspect.State.Health?.Status === 'healthy' ? 'healthy' : state === 'running' ? 'degraded' : 'unreachable';

      // Use dynamically stored port (set at container creation from manifest)
      // Falls back to hardcoded 3000 for backward compatibility
      const port = getPluginPort(installId) ?? 3000;
      const portBinding = inspect.NetworkSettings.Ports?.[`${port}/tcp`]?.[0];

      const status: ContainerStatus = { state, health };
      if (inspect.State.StartedAt) status.startedAt = new Date(inspect.State.StartedAt);
      if (portBinding) status.port = parseInt(portBinding.HostPort, 10);
      return status;
    } catch {
      return { state: 'not_found', health: 'unreachable' };
    }
  }

  async restartContainer(installId: string): Promise<void> {
    try {
      const container = this.docker.getContainer(`plexica-plugin-${installId}`);
      await container.restart();
    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? '';
      if (!msg.includes('not found')) {
        throw new PluginBackendUnreachableError(installId);
      }
    }
  }
}

// Clean up port tracking on container stop
export function clearPluginPort(installId: string): void {
  pluginPorts.delete(installId);
}

/**
 * Factory — returns the correct strategy based on hosting type.
 */
export function createContainerManager(hostingType: string): ContainerManager {
  if (hostingType === 'kubernetes') {
    return new KubernetesContainerManager();
  }
  return new DockerContainerManager();
}

/**
 * Kubernetes implementation — placeholder for production use.
 */
class KubernetesContainerManager implements ContainerManager {
  async startContainer(_installId: string, _manifest: Manifest): Promise<ContainerInfo> {
    throw new PluginInstallError(
      'Kubernetes hosting is not available in this environment. ' +
        'Use hosting.type = "sidecar" for dev/CI. ' +
        'Kubernetes support requires deployment in a Kubernetes cluster.'
    );
  }

  async stopContainer(_installId: string): Promise<void> {
    throw new PluginInstallError(
      'Kubernetes hosting is not available in this environment. ' +
        'Use hosting.type = "sidecar" for dev/CI.'
    );
  }

  async getContainerStatus(_installId: string): Promise<ContainerStatus> {
    throw new PluginInstallError(
      'Kubernetes hosting is not available in this environment. ' +
        'Use hosting.type = "sidecar" for dev/CI.'
    );
  }

  async restartContainer(_installId: string): Promise<void> {
    throw new PluginInstallError(
      'Kubernetes hosting is not available in this environment. ' +
        'Use hosting.type = "sidecar" for dev/CI.'
    );
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

import { parseMemory, parseCpu } from './container-helpers.js';
