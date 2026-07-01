// services/container-manager.service.ts
// Strategy pattern: Docker sidecar (dev/CI) + Kubernetes (prod).
// Dev mode (§10.7) bypasses containers entirely — uses local processes.

import Docker from 'dockerode';

import { PluginInstallError, PluginBackendUnreachableError, PluginNotFoundError } from '../errors.js';

import { KubernetesContainerManager } from './kubernetes-container-manager.js';
import { parseMemory, parseCpu } from './container-helpers.js';

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

const pluginPorts = new Map<string, number>();

function setPluginPort(installId: string, port: number): void {
  pluginPorts.set(installId, port);
}

function getPluginPort(installId: string): number | undefined {
  return pluginPorts.get(installId);
}

export interface ContainerManager {
  startContainer(installId: string, manifest: Manifest): Promise<ContainerInfo>;
  stopContainer(installId: string): Promise<void>;
  /** Stops and removes the container so its name is freed for re-install.
   *  Idempotent — no error if the container is already gone. */
  removeContainer(installId: string): Promise<void>;
  getContainerStatus(installId: string): Promise<ContainerStatus>;
  getContainerUrl(installId: string): Promise<string>;
  restartContainer(installId: string): Promise<void>;
}

/**
 * Docker sidecar implementation using dockerode.
 * Used in dev / single-node CI environments.
 * Port allocation: OS-assigned random port via -p 0:3000.
 */
export class DockerContainerManager implements ContainerManager {
  private docker: Docker;

  constructor() {
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

    // Pass env vars to the container (DATABASE_URL, CORE_API_URL, etc.)
    const env = manifest.env ? Object.entries(manifest.env).map(([k, v]) => `${k}=${v}`) : undefined;

    // Create and start container with random host port
    const container = await this.docker.createContainer({
      name: containerName,
      Image: image,
      Env: env,
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

    setPluginPort(installId, port);
    // plugin_container_config is a TENANT-schema table; the container manager
    // has no tenant context. Port + env persistence is owned by the install
    // route. Port recovery after a restart works via Docker inspect below.
    return { containerId: container.id, port, startedAt: new Date() };
  }

  async stopContainer(installId: string): Promise<void> {
    try {
      const container = this.docker.getContainer(`plexica-plugin-${installId}`);
      await container.stop({ t: 10 });
    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? '';
      if (!msg.includes('already stopped') && !msg.includes('not found')) throw err;
    } finally {
      clearPluginPort(installId);
    }
  }

  async removeContainer(installId: string): Promise<void> {
    const container = this.docker.getContainer(`plexica-plugin-${installId}`);
    try {
      await container.stop({ t: 5 });
    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? '';
      if (!msg.includes('already stopped') && !msg.includes('not found')) throw err;
    }
    try {
      await container.remove({ force: true, v: true });
    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? '';
      if (!msg.includes('not found') && !msg.includes('No such')) throw err;
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

      let port = getPluginPort(installId);
      // Port recovery after restart: Docker inspect records the host port
      // binding keyed by the container's exposed port. Without the manifest we
      // don't know the exposed port key, so iterate over all port bindings and
      // pick the first HostPort. The previous core-prisma DB fallback was
      // broken (pluginContainerConfig is a tenant-schema model) and removed.
      const portBindings = inspect.NetworkSettings.Ports;
      if (port === undefined && portBindings) {
        for (const [, bindings] of Object.entries(portBindings)) {
          const hostPort = bindings?.[0]?.HostPort;
          if (hostPort) {
            port = parseInt(hostPort, 10);
            setPluginPort(installId, port);
            break;
          }
        }
      }

      const status: ContainerStatus = { state, health };
      if (inspect.State.StartedAt) status.startedAt = new Date(inspect.State.StartedAt);
      if (port !== undefined) status.port = port;
      return status;
    } catch {
      return { state: 'not_found', health: 'unreachable' };
    }
  }

  async getContainerUrl(installId: string): Promise<string> {
    const status = await this.getContainerStatus(installId);
    if (status.state === 'not_found') throw new PluginNotFoundError(`Installation ${installId}`);
    if (!status.port) throw new PluginNotFoundError(`Installation ${installId} has no port`);
    return `http://localhost:${status.port}`;
  }

  async restartContainer(installId: string): Promise<void> {
    try {
      const container = this.docker.getContainer(`plexica-plugin-${installId}`);
      await container.restart();
    } catch (err: unknown) {
      if (!(err as Error)?.message?.includes('not found')) {
        throw new PluginBackendUnreachableError(installId);
      }
    }
  }
}

export function clearPluginPort(installId: string): void {
  pluginPorts.delete(installId);
}

export function createContainerManager(hostingType: string): ContainerManager {
  if (hostingType === 'kubernetes') return new KubernetesContainerManager();
  return new DockerContainerManager();
}
