import Docker from 'dockerode';

import {
  PluginInstallError,
  PluginBackendUnreachableError,
  PluginNotFoundError,
} from '../errors.js';

import { KubernetesContainerManager } from './kubernetes-container-manager.js';
import { parseMemory, parseCpu } from './container-helpers.js';
import { restartDockerContainer } from './docker-container-restart.js';
import { dockerRuntimeOptions } from './docker-runtime-options.js';

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
  removeContainer(installId: string): Promise<void>;
  getContainerStatus(installId: string): Promise<ContainerStatus>;
  getContainerUrl(installId: string): Promise<string>;
  restartContainer(installId: string, environment?: Record<string, string>): Promise<void>;
}
export class DockerContainerManager implements ContainerManager {
  private docker: Docker;
  constructor() {
    this.docker = new Docker();
  }
  async startContainer(installId: string, manifest: Manifest): Promise<ContainerInfo> {
    const containerName = `plexica-plugin-${installId}`;
    const image = manifest.hosting.image;
    try {
      await this.docker.getImage(image).inspect();
    } catch {
      try {
        await this.docker.pull(image);
      } catch {
        throw new PluginInstallError(
          `Failed to pull image "${image}". Check registry credentials.`
        );
      }
    }
    const env = manifest.env
      ? Object.entries(manifest.env).map(([k, v]) => `${k}=${v}`)
      : undefined;
    const runtime = dockerRuntimeOptions(installId);
    const container = await this.docker.createContainer({
      name: containerName,
      Image: image,
      Env: env,
      Labels: runtime.labels,
      ExposedPorts: { [`${manifest.hosting.port}/tcp`]: {} },
      HostConfig: {
        PortBindings: { [`${manifest.hosting.port}/tcp`]: [{ HostPort: '0' }] },
        RestartPolicy: { Name: 'unless-stopped' },
        ...runtime.hostConfig,
        ...(manifest.hosting.resources
          ? {
              ...(manifest.hosting.resources.memory
                ? { MemoryReservation: parseMemory(manifest.hosting.resources.memory) }
                : {}),
              ...(manifest.hosting.resources.cpu
                ? { NanoCpus: parseCpu(manifest.hosting.resources.cpu) }
                : {}),
            }
          : {}),
      },
    });
    await container.start();

    const inspect = await container.inspect();
    const portBinding = inspect.NetworkSettings.Ports?.[`${manifest.hosting.port}/tcp`]?.[0];
    const port = portBinding ? parseInt(portBinding.HostPort, 10) : manifest.hosting.port;

    setPluginPort(installId, port);
    return { containerId: container.id, port, startedAt: new Date() };
  }

  async stopContainer(installId: string): Promise<void> {
    try {
      const container = this.docker.getContainer(`plexica-plugin-${installId}`);
      await container.stop({ t: 10 });
    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? '';
      if (
        !msg.includes('already stopped') &&
        !msg.includes('is not running') &&
        !msg.includes('not found') &&
        !msg.includes('No such')
      )
        throw err;
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
      if (
        !msg.includes('already stopped') &&
        !msg.includes('is not running') &&
        !msg.includes('not found')
      )
        throw err;
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
        inspect.State.Health?.Status === 'healthy'
          ? 'healthy'
          : state === 'running'
            ? 'degraded'
            : 'unreachable';

      let port = getPluginPort(installId);
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

  async restartContainer(installId: string, environment?: Record<string, string>): Promise<void> {
    try {
      const port = await restartDockerContainer(this.docker, installId, environment);
      if (port !== undefined) setPluginPort(installId, port);
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
