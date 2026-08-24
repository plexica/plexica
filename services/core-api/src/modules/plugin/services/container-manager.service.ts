import Docker from 'dockerode';

import { config } from '../../../lib/config.js';
import {
  PluginBackendUnreachableError,
  PluginInstallError,
  PluginNotFoundError,
} from '../errors.js';

import { KubernetesContainerManager } from './kubernetes-container-manager.js';
import { parseCpu, parseMemory } from './container-helpers.js';
import { restartDockerContainer } from './docker-container-restart.js';
import { dockerRuntimeOptions } from './docker-runtime-options.js';
import { assertCiPluginContainer } from './plugin-container-contract.js';
import { isCiPluginRuntime, pluginContainerIdentity } from './plugin-container-identity.js';
import { resolveSidecarImage } from './sidecar-image.js';

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
export interface ContainerManager {
  startContainer(installId: string, manifest: Manifest): Promise<ContainerInfo>;
  stopContainer(installId: string): Promise<void>;
  removeContainer(installId: string): Promise<void>;
  getContainerStatus(installId: string): Promise<ContainerStatus>;
  getContainerUrl(installId: string): Promise<string>;
  restartContainer(installId: string, environment?: Record<string, string>): Promise<void>;
}

function containerPort(inspect: Docker.ContainerInspectInfo): number | undefined {
  const exposed = Object.keys(inspect.Config.ExposedPorts ?? {})[0]?.split('/')[0];
  if (exposed) return Number(exposed);
  for (const bindings of Object.values(inspect.NetworkSettings.Ports ?? {})) {
    if (bindings?.[0]?.HostPort) return Number(bindings[0].HostPort);
  }
  return undefined;
}

function ignoreStopError(error: unknown): void {
  if (!/(already stopped|is not running|not found|No such)/.test((error as Error).message))
    throw error;
}

function isMissingContainer(error: unknown): boolean {
  return (error as { statusCode?: number }).statusCode === 404 || /not found|No such/.test((error as Error).message);
}

function dockerClient(): Docker {
  if (!config.PLUGIN_DOCKER_HOST) return new Docker();
  const endpoint = new URL(config.PLUGIN_DOCKER_HOST);
  return new Docker({
    protocol: endpoint.protocol === 'https:' ? 'https' : 'http',
    host: endpoint.hostname,
    port: Number(endpoint.port),
  });
}

export class DockerContainerManager implements ContainerManager {
  private docker = dockerClient();

  async startContainer(installId: string, manifest: Manifest): Promise<ContainerInfo> {
    const identity = pluginContainerIdentity(installId);
    const image = resolveSidecarImage(manifest.hosting.image);
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
    const runtime = dockerRuntimeOptions(installId);
    const container = await this.docker.createContainer({
      name: identity.name,
      Image: image,
      Env: manifest.env
        ? Object.entries(manifest.env).map(([key, value]) => `${key}=${value}`)
        : undefined,
      Labels: runtime.labels,
      ExposedPorts: { [`${manifest.hosting.port}/tcp`]: {} },
      ...(isCiPluginRuntime()
        ? {
            NetworkingConfig: {
              EndpointsConfig: { [identity.network]: { Aliases: [identity.alias] } },
            },
          }
        : {}),
      HostConfig: {
        RestartPolicy: { Name: 'unless-stopped' },
        ...runtime.hostConfig,
        ...(isCiPluginRuntime()
          ? {}
          : { PortBindings: { [`${manifest.hosting.port}/tcp`]: [{ HostPort: '0' }] } }),
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
    // Post-start contract assert: on failure the just-started sidecar is
    // rogue (unverified identity), so remove it before propagating the error.
    try {
      assertCiPluginContainer(identity, await container.inspect());
    } catch (error) {
      await container.remove({ force: true, v: true }).catch(() => undefined);
      throw error;
    }
    return { containerId: container.id, port: manifest.hosting.port, startedAt: new Date() };
  }

  async stopContainer(installId: string): Promise<void> {
    const identity = pluginContainerIdentity(installId);
    const container = this.docker.getContainer(identity.name);
    assertCiPluginContainer(identity, await container.inspect());
    await container.stop({ t: 10 }).catch(ignoreStopError);
  }

  async removeContainer(installId: string): Promise<void> {
    const identity = pluginContainerIdentity(installId);
    const container = this.docker.getContainer(identity.name);
    assertCiPluginContainer(identity, await container.inspect());
    await container.stop({ t: 5 }).catch(ignoreStopError);
    await container.remove({ force: true, v: true }).catch(ignoreStopError);
  }

  async getContainerStatus(installId: string): Promise<ContainerStatus> {
    try {
      const inspect = await this.docker
        .getContainer(pluginContainerIdentity(installId).name)
        .inspect();
      assertCiPluginContainer(pluginContainerIdentity(installId), inspect);
      const state: ContainerState = inspect.State.Running ? 'running' : 'stopped';
      const health: HealthStatus =
        inspect.State.Health?.Status === 'healthy'
          ? 'healthy'
          : state === 'running'
            ? 'degraded'
            : 'unreachable';
      const port = containerPort(inspect);
      return {
        state,
        health,
        ...(inspect.State.StartedAt ? { startedAt: new Date(inspect.State.StartedAt) } : {}),
        ...(port ? { port } : {}),
      };
    } catch (error) {
      if (isMissingContainer(error)) return { state: 'not_found', health: 'unreachable' };
      throw error;
    }
  }

  async getContainerUrl(installId: string): Promise<string> {
    const status = await this.getContainerStatus(installId);
    if (status.state === 'not_found' || !status.port)
      throw new PluginNotFoundError(`Installation ${installId}`);
    return isCiPluginRuntime()
      ? `http://${pluginContainerIdentity(installId).alias}:${status.port}`
      : `http://localhost:${status.port}`;
  }

  async restartContainer(installId: string, environment?: Record<string, string>): Promise<void> {
    try {
      await restartDockerContainer(this.docker, installId, environment);
    } catch (error) {
      if (!(error as Error).message.includes('not found'))
        throw new PluginBackendUnreachableError(installId);
    }
  }
}

export function createContainerManager(hostingType: string): ContainerManager {
  return hostingType === 'kubernetes'
    ? new KubernetesContainerManager()
    : new DockerContainerManager();
}
