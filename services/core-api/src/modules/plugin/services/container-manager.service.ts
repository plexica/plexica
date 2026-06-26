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

// undefinedIfMissing intentionally removed — it was dead code.

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
    }
  }

  async getContainerStatus(installId: string): Promise<ContainerStatus> {
    try {
      const container = this.docker.getContainer(`plexica-plugin-${installId}`);
      const inspect = await container.inspect();

      const state: ContainerState = inspect.State.Running ? 'running' : 'stopped';
      const health: HealthStatus =
        inspect.State.Health?.Status === 'healthy' ? 'healthy' : state === 'running' ? 'degraded' : 'unreachable';

      const portBinding = inspect.NetworkSettings.Ports?.[`3000/tcp`]?.[0];

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
      'Kubernetes container manager is not available in this environment. ' +
        'Use hosting.type = "sidecar" for dev/CI, or deploy in a Kubernetes cluster.'
    );
  }

  async stopContainer(_installId: string): Promise<void> {
    throw new Error('Kubernetes container manager not available');
  }

  async getContainerStatus(_installId: string): Promise<ContainerStatus> {
    throw new Error('Kubernetes container manager not available');
  }

  async restartContainer(_installId: string): Promise<void> {
    throw new Error('Kubernetes container manager not available');
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseMemory(mem?: string): number | undefined {
  if (!mem) return undefined;
  const match = mem.match(/^(\d+)(Mi|Gi)$/);
  if (!match?.[1]) return undefined;
  const val = parseInt(match[1], 10);
  return match[2] === 'Gi' ? val * 1024 * 1024 * 1024 : val * 1024 * 1024;
}

function parseCpu(cpu?: string): number | undefined {
  if (!cpu) return undefined;
  const val = parseFloat(cpu);
  return isNaN(val) ? undefined : val * 1_000_000_000; // 1 CPU = 10^9 nanocores
}
